import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bot, CalendarDays, Check, LoaderCircle, Plus, RotateCcw, Search, Trophy, X } from 'lucide-react';
import type {
  CompetitionRoomsClient, CreateRoomInput, JoinRoomInput, LeaderboardItem,
  LeaderboardPage, PostEvaluationAction, PostEvaluationChoice, PublicRoom, RoomInputCatalog,
  CurrentStrategyValidationPage,
} from '../api/competitionRooms';
import { CompetitionApiError } from '../api/competitionRooms';
import { Button, PageHeading } from './common';
import { ErrorPage, SignInRequiredPage } from './StatePages';

type LoadState = 'loading' | 'ready' | 'error';

const dateLabel = (value: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(value));
const metric = (value: number | null, suffix = '') => value == null ? '—' : `${value.toFixed(2)}${suffix}`;
const statusLabel = (room: PublicRoom, now = Date.now()) => now < Date.parse(room.recruitmentOpensAt) ? '모집 예정' : now <= Date.parse(room.participationClosesAt) ? '모집 중' : '평가/종료 확인';

export function CompetitionApiWorkspace({ client }: { client: CompetitionRoomsClient }) {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [lobbyError, setLobbyError] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<PublicRoom | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setState('loading');
    setLobbyError(null);
    try { const page = await client.searchRooms({ q: query.trim(), limit: 50 }, signal); setRooms(page.items); setState('ready'); }
    catch (error) { if ((error as { name?: string }).name !== 'AbortError') { setLobbyError(error); setState('error'); } }
  }, [client, query]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, reloadKey]);

  if (selected) return <RoomApiDetail client={client} room={selected} onBack={() => setSelected(null)} />;
  /*
    Nothing to show at all — signed out, or the lobby failed to load. The whole
    route renders the one shared state page; no page scaffold survives around
    it, so every screen fails the same way.
  */
  if (state === 'error') {
    return lobbyError instanceof CompetitionApiError && lobbyError.unauthenticated
      ? <SignInRequiredPage />
      : <ErrorPage title="대회 목록을 불러오지 못했습니다." detail="네트워크 상태를 확인해 주세요." onRetry={() => setReloadKey((key) => key + 1)} />;
  }
  return <div className="page competition-page competition-lobby-page competition-api-page">
    <PageHeading eyebrow="BOT COMPETITION · LIVE API" title="모의투자" description="실제 대회 API에서 공개 방과 일정을 조회하고, 익명 봇 성과만 비교합니다." actions={<Button kind="primary" icon={Plus} onClick={() => setCreateOpen(true)}>대회 만들기</Button>} />
    {createOpen && <CreateRoomDialog client={client} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); setReloadKey((key) => key + 1); }} />}
    <div className="competition-api-toolbar">
      <label><Search size={15} aria-hidden="true" /><input type="search" aria-label="대회 검색" value={query} placeholder="대회명 검색" onChange={(event) => setQuery(event.target.value)} /></label>
      <button type="button" onClick={() => setReloadKey((key) => key + 1)}><RotateCcw size={14} aria-hidden="true" />새로고침</button>
    </div>
    <section className="competition-bulletin" aria-label="대회 게시판">
      <header className="competition-bulletin-head"><h2><Trophy size={14} aria-hidden="true" />공개 대회</h2><span>{state === 'ready' ? `${rooms.length}개` : 'API 연결'}</span></header>
      {state === 'loading' && <div className="competition-api-state" role="status"><LoaderCircle className="is-spinning" aria-hidden="true" /><strong>대회 목록을 불러오는 중입니다.</strong></div>}
      {state === 'ready' && rooms.length === 0 && <div className="competition-api-state"><Trophy aria-hidden="true" /><strong>참가 가능한 공개 대회가 없습니다.</strong><span>검색어를 지우거나 나중에 다시 확인해 주세요.</span></div>}
      {state === 'ready' && <div role="list" aria-label="공개 대회 탐색 결과">{rooms.map((room) => <button type="button" role="listitem" className="competition-row" aria-label={`${room.name} 열기`} key={room.id} onClick={() => setSelected(room)}>
        <span className="competition-row-cell is-type"><span className="competition-kind-chip" data-kind="live">LIVE</span></span>
        <span className="competition-row-name"><strong>{room.name}{room.organizerType === 'PLATFORM' && <em className="competition-row-official">Official</em>}</strong><small>{statusLabel(room)}</small></span>
        <span className="competition-row-cell is-num"><b>{dateLabel(room.participationClosesAt)}</b><small>참가 마감</small></span>
        <span className="competition-row-cell is-num"><b>{room.botParticipationLimit}</b><small>봇 한도</small></span>
      </button>)}</div>}
    </section>
  </div>;
}

function RoomApiDetail({ client, room, onBack }: { client: CompetitionRoomsClient; room: PublicRoom; onBack: () => void }) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardPage | null>(null);
  const [myBots, setMyBots] = useState<LeaderboardPage | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<unknown>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [choices, setChoices] = useState<Record<string, PostEvaluationChoice>>({});
  useEffect(() => {
    const controller = new AbortController(); setState('loading'); setError(null);
    Promise.all([client.leaderboard(room.id, { limit: 50 }, controller.signal), client.myBots(room.id, { limit: 50 }, controller.signal)])
      .then(async ([publicPage, ownedPage]) => {
        setLeaderboard(publicPage); setMyBots(ownedPage);
        const found = await Promise.all(ownedPage.items.flatMap((item) => item.viewerEvidence ? [client.getPostEvaluationChoice(room.id, item.viewerEvidence.participationId, controller.signal).catch(() => null)] : []));
        setChoices(Object.fromEntries(found.filter((choice): choice is PostEvaluationChoice => choice !== null).map((choice) => [choice.participationId, choice]))); setState('ready');
      }).catch((cause) => { if ((cause as { name?: string }).name !== 'AbortError') { setError(cause); setState('error'); } });
    return () => controller.abort();
  }, [client, room.id, reloadKey]);
  const ended = leaderboard?.snapshotStatus === 'FINAL' || leaderboard?.snapshotStatus === 'PUBLISHED';
  /*
    The detail failed to load entirely. The shared state page takes over, with
    the way back to the lobby kept above it — `selected` lives in this
    workspace's state, so without the button the person would be stuck here.
  */
  if (state === 'error') {
    return <div className="page competition-page competition-api-page">
      <button type="button" className="competition-detail-back" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />대회 목록</button>
      {error instanceof CompetitionApiError && error.unauthenticated
        ? <SignInRequiredPage />
        : <ErrorPage
          title={error instanceof CompetitionApiError && error.forbidden ? '이 대회를 볼 권한이 없습니다.' : '리더보드를 불러오지 못했습니다.'}
          onRetry={() => setReloadKey((key) => key + 1)}
        />}
    </div>;
  }
  return <section className="competition-api-detail" role="region" aria-label={`${room.name} 상세`}>
    <button type="button" className="competition-detail-back" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />대회 목록</button>
    <header className="competition-api-detail-head"><div><span>{statusLabel(room)}</span><h1>{room.name}</h1><p>참가자는 표시하지 않으며, 플랫폼이 부여한 익명 봇 별칭만 공개합니다.</p></div><button type="button" className="button button-primary" onClick={() => setJoinOpen(true)}>이 대회 참가하기</button></header>
    <dl className="competition-detail-facts"><div data-fact-width="wide"><dt>모집 시작</dt><dd>{dateLabel(room.recruitmentOpensAt)}</dd></div><div data-fact-width="wide"><dt>참가 마감</dt><dd>{dateLabel(room.participationClosesAt)}</dd></div><div data-fact-width="compact"><dt>전체 봇 한도</dt><dd>{room.botParticipationLimit}</dd></div><div data-fact-width="compact"><dt>계정당 한도</dt><dd>{room.perAccountBotLimit}</dd></div></dl>
    {joinOpen && <JoinRoomDialog client={client} room={room} onClose={() => setJoinOpen(false)} onJoined={() => { setJoinOpen(false); setReloadKey((key) => key + 1); }} />}
    {state === 'loading' && <div className="competition-api-state" role="status"><LoaderCircle className="is-spinning" aria-hidden="true" /><strong>리더보드를 불러오는 중입니다.</strong></div>}
    {state === 'ready' && <div className="competition-api-ranking-grid"><Leaderboard title="익명 봇 리더보드" items={leaderboard?.items ?? []} /><Leaderboard title="내 봇 비교" items={myBots?.items ?? []} owned /></div>}
    {state === 'ready' && ended && (myBots?.items.length ?? 0) > 0 && <section className="competition-choice-panel" aria-labelledby="post-evaluation-title"><h2 id="post-evaluation-title">대회 종료 후 운용 선택</h2><p>선택하지 않으면 봇은 안전한 종료 절차에 따라 주문을 취소하고 포지션을 정리합니다.</p>{myBots!.items.map((item) => item.viewerEvidence && <PostChoice key={item.viewerEvidence.participationId} client={client} roomId={room.id} item={item} initial={choices[item.viewerEvidence.participationId]} />)}</section>}
  </section>;
}

function Leaderboard({ title, items, owned = false }: { title: string; items: LeaderboardItem[]; owned?: boolean }) {
  return <section className="competition-api-leaderboard" aria-label={title}><header><h2>{title}</h2><span>{items.length}개</span></header>{items.length === 0 ? <div className="competition-api-mini-empty">표시할 봇 성과가 없습니다.</div> : <div className="competition-ranking-list"><div className="competition-ranking is-metric-ranking" style={{ '--ranking-cols': '56px minmax(140px, 1fr) repeat(4, minmax(82px, 1fr))', '--ranking-min-width': '650px' } as React.CSSProperties}><header><span>순위</span><span>익명 봇</span><span>점수</span><span>수익률</span><span>MDD</span><span>샤프</span></header>{items.map((item, index) => <div className={owned ? 'is-mine' : ''} key={`${item.anonymousAlias}-${index}`}><strong>#{item.rank ?? '—'}</strong><span>{item.anonymousAlias}{owned && <i className="competition-ranking-mine-tag"><Bot size={12} aria-hidden="true" />내 봇</i>}</span><b>{metric(item.score)}</b><b>{metric(item.totalReturnPct, '%')}</b><b>{metric(item.maxDrawdownPct, '%')}</b><b>{metric(item.sharpeRatio)}</b></div>)}</div></div>}</section>;
}

function PostChoice({ client, roomId, item, initial }: { client: CompetitionRoomsClient; roomId: string; item: LeaderboardItem; initial?: PostEvaluationChoice }) {
  const participationId = item.viewerEvidence!.participationId;
  const [action, setAction] = useState<PostEvaluationAction>(initial?.action ?? 'STOP_AFTER_EVALUATION');
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState(''); const locked = Boolean(initial?.lockedAt);
  const save = async () => { setSaving(true); setMessage(''); try { await client.setPostEvaluationChoice(roomId, participationId, action); setMessage('종료 후 선택을 저장했습니다.'); } catch { setMessage('선택을 저장하지 못했습니다. 다시 시도해 주세요.'); } finally { setSaving(false); } };
  return <fieldset disabled={locked || saving}><legend>{item.anonymousAlias}</legend><label><input type="radio" name={`choice-${participationId}`} checked={action === 'CONTINUE_PRIVATE'} onChange={() => setAction('CONTINUE_PRIVATE')} />비공개 봇으로 계속 운용</label><label><input type="radio" name={`choice-${participationId}`} checked={action === 'STOP_AFTER_EVALUATION'} onChange={() => setAction('STOP_AFTER_EVALUATION')} />대회 종료와 함께 안전하게 중지</label><button type="button" className="button button-primary" onClick={save}>{saving ? '저장 중…' : '종료 후 선택 저장'}</button>{message && <span role="status">{message}</span>}{locked && <span>선택이 잠겨 변경할 수 없습니다.</span>}</fieldset>;
}

function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="competition-create-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="competition-create-dialog competition-api-dialog" role="dialog" aria-modal="true" aria-label={title}><header><div><small>COMPETITION</small><h2>{title}</h2></div><button type="button" aria-label={`${title} 닫기`} onClick={onClose}><X size={20} /></button></header>{children}</section></div>; }

const dateTime = (days: number) => {
  const date = new Date(Date.now() + days * 86400000);
  date.setMinutes(0, 0, 0);
  const part = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:00`;
};
function CreateRoomDialog({ client, onClose, onCreated }: { client: CompetitionRoomsClient; onClose: () => void; onCreated: () => void }) {
  const [catalog, setCatalog] = useState<{ state: LoadState; value: RoomInputCatalog | null; error: unknown }>({ state: 'loading', value: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setCatalog({ state: 'loading', value: null, error: null });
    client.roomInputCatalog(controller.signal)
      .then((value) => setCatalog({ state: 'ready', value, error: null }))
      .catch((cause) => { if ((cause as { name?: string }).name !== 'AbortError') setCatalog({ state: 'error', value: null, error: cause }); });
    return () => controller.abort();
  }, [client, reloadKey]);
  const complete = catalog.state === 'ready' && Boolean(catalog.value?.scoringTemplates.length && catalog.value.feePolicies.length && catalog.value.buyingPowerBufferPolicies.length);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!complete) return;
    const form = new FormData(event.currentTarget); setError('');
    const instant = (name: string) => new Date(String(form.get(name)));
    const schedule = {
      recruitmentOpensAt: instant('recruitmentOpensAt'), participationOpensAt: instant('participationOpensAt'),
      participationClosesAt: instant('participationClosesAt'), evaluationStartsAt: instant('evaluationStartsAt'),
      evaluationEndsAt: instant('evaluationEndsAt'), finalizationDeadlineAt: instant('finalizationDeadlineAt'),
    };
    const ordered = schedule.recruitmentOpensAt <= schedule.participationOpensAt
      && schedule.participationOpensAt < schedule.participationClosesAt
      && schedule.participationClosesAt < schedule.evaluationStartsAt
      && schedule.evaluationStartsAt < schedule.evaluationEndsAt
      && schedule.evaluationEndsAt <= schedule.finalizationDeadlineAt;
    if (!ordered) { setError('모집·참가·평가·최종 확정 시한을 시간 순서대로 입력해 주세요.'); return; }
    setSaving(true);
    const input: CreateRoomInput = { name: String(form.get('name')), accessType: 'PUBLIC', scoringTemplateVersionId: String(form.get('scoringTemplateVersionId')), scoringAdjustments: {}, initialCashAmount: 10000, botParticipationLimit: 25, perAccountBotLimit: 2, stoppedBotSlotPolicy: 'RELEASE_SLOT', minimumOperationSeconds: 0, minimumFillCount: 0, feePolicyId: String(form.get('feePolicyId')), buyingPowerBufferPolicyId: String(form.get('buyingPowerBufferPolicyId')), recruitmentOpensAt: schedule.recruitmentOpensAt.toISOString(), participationOpensAt: schedule.participationOpensAt.toISOString(), evaluationStartsAt: schedule.evaluationStartsAt.toISOString(), participationClosesAt: schedule.participationClosesAt.toISOString(), evaluationEndsAt: schedule.evaluationEndsAt.toISOString(), finalizationDeadlineAt: schedule.finalizationDeadlineAt.toISOString(), timezoneName: 'Asia/Seoul' };
    try { await client.createRoom(input); onCreated(); } catch (cause) { setError(cause instanceof CompetitionApiError && cause.forbidden ? '대회를 만들 권한이 없습니다.' : '대회를 만들지 못했습니다. 입력과 로그인 상태를 확인해 주세요.'); setSaving(false); }
  };
  const catalogError = catalog.error instanceof CompetitionApiError && catalog.error.unauthenticated ? '로그인 후 대회 생성 정책을 확인할 수 있습니다.'
    : catalog.error instanceof CompetitionApiError && catalog.error.forbidden ? '대회 생성 정책을 조회할 권한이 없습니다.' : '대회 생성 정책을 불러오지 못했습니다.';
  return <DialogShell title="대회 만들기" onClose={onClose}><form className="competition-api-form" onSubmit={submit}>
    <fieldset className="competition-api-form-section"><legend>기본 설정</legend><label>대회 이름<input name="name" aria-label="대회 이름" placeholder="참가자가 알아보기 쉬운 이름" required /></label></fieldset>
    <fieldset className="competition-api-form-section"><legend>대회 일정</legend><p>표시된 시각은 한국 표준시 기준입니다.</p><div className="competition-api-form-grid"><label>모집 시작<input aria-label="모집 시작" name="recruitmentOpensAt" type="datetime-local" defaultValue={dateTime(0)} required /></label><label>참가 시작<input aria-label="참가 시작" name="participationOpensAt" type="datetime-local" defaultValue={dateTime(1)} required /></label><label>참가 마감<input aria-label="참가 마감" name="participationClosesAt" type="datetime-local" defaultValue={dateTime(3)} required /></label><label>평가 시작<input aria-label="평가 시작" name="evaluationStartsAt" type="datetime-local" defaultValue={dateTime(4)} required /></label><label>평가 종료<input aria-label="평가 종료" name="evaluationEndsAt" type="datetime-local" defaultValue={dateTime(10)} required /></label><label>최종 확정 시한<input aria-label="최종 확정 시한" name="finalizationDeadlineAt" type="datetime-local" defaultValue={dateTime(11)} required /></label></div></fieldset>
    <fieldset className="competition-api-form-section"><legend>운영 정책</legend>
      {catalog.state === 'loading' && <p role="status">대회 생성 입력을 불러오는 중입니다.</p>}
      {catalog.state === 'error' && <div role="alert"><p>{catalogError}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)}>정책 다시 불러오기</button></div>}
      {catalog.state === 'ready' && !complete && <p role="status">운영 정책 카탈로그가 준비되지 않아 대회를 만들 수 없습니다.</p>}
      {complete && <div className="competition-api-form-grid">
        <label>채점 템플릿<select name="scoringTemplateVersionId" aria-label="채점 템플릿" required>{catalog.value!.scoringTemplates.map((item) => <option key={item.id} value={item.id}>{item.templateCode} · {item.version}</option>)}</select></label>
        <label>수수료 정책<select name="feePolicyId" aria-label="수수료 정책" required>{catalog.value!.feePolicies.map((item) => <option key={item.id} value={item.id}>{item.policyCode} · {item.version} · {item.feeRateBps}bps</option>)}</select></label>
        <label>구매력 버퍼 정책<select name="buyingPowerBufferPolicyId" aria-label="구매력 버퍼 정책" required>{catalog.value!.buyingPowerBufferPolicies.map((item) => <option key={item.id} value={item.id}>{item.policyCode} · {item.version} · {item.bufferBps}bps</option>)}</select></label>
      </div>}
    </fieldset>
    {error && <p role="alert">{error}</p>}<footer><button type="button" className="button button-secondary" onClick={onClose}>취소</button><button type="submit" className="button button-primary" disabled={saving || !complete}>{saving ? '생성 중…' : '대회 생성'}</button></footer>
  </form></DialogShell>;
}

function JoinRoomDialog({ client, room, onClose, onJoined }: { client: CompetitionRoomsClient; room: PublicRoom; onClose: () => void; onJoined: () => void }) {
  const [validations, setValidations] = useState<{ state: LoadState; value: CurrentStrategyValidationPage | null; error: unknown }>({ state: 'loading', value: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setValidations({ state: 'loading', value: null, error: null });
    client.currentStrategyValidations(controller.signal)
      .then((value) => setValidations({ state: 'ready', value, error: null }))
      .catch((cause) => { if ((cause as { name?: string }).name !== 'AbortError') setValidations({ state: 'error', value: null, error: cause }); });
    return () => controller.abort();
  }, [client, reloadKey]);
  const available = validations.state === 'ready' && Boolean(validations.value?.items.length);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!available) return;
    const form = new FormData(event.currentTarget); const input: JoinRoomInput = { validationRunId: String(form.get('validationRunId')), anonymousAlias: String(form.get('anonymousAlias')), languageVersion: 'v1', schemaVersion: 'v1', catalogVersion: 'v1', budgetCapBps: 10000, brokerRulesVersion: 'v1', accountingRulesVersion: 'v1', candidateConflictPolicy: {} }; setSaving(true); setError('');
    try { await client.joinRoom(room.id, input); onJoined(); } catch (cause) { setError(cause instanceof CompetitionApiError && cause.unauthenticated ? '로그인 후 참가할 수 있습니다.' : cause instanceof CompetitionApiError && cause.forbidden ? '이 대회에 참가할 권한이 없습니다.' : cause instanceof CompetitionApiError && cause.conflict ? cause.detail || '참가 조건을 충족하지 못했습니다.' : '참가 요청을 완료하지 못했습니다.'); setSaving(false); }
  };
  const validationError = validations.error instanceof CompetitionApiError && validations.error.unauthenticated ? '로그인 후 검증 완료 전략을 확인할 수 있습니다.'
    : validations.error instanceof CompetitionApiError && validations.error.forbidden ? '검증 완료 전략을 조회할 권한이 없습니다.' : '검증 완료 전략을 불러오지 못했습니다.';
  return <DialogShell title="대회 참가" onClose={onClose}><form className="competition-api-form" onSubmit={submit}>
    <p>{room.name}에는 검증 완료된 전략 실행만 제출할 수 있습니다.</p>
    {validations.state === 'loading' && <p role="status">검증 완료 전략을 불러오는 중입니다.</p>}
    {validations.state === 'error' && <div role="alert"><p>{validationError}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)}>전략 다시 불러오기</button></div>}
    {validations.state === 'ready' && !available && <p role="alert">현재 제출 가능한 검증 완료 전략이 없습니다.</p>}
    {available && <label>검증 완료 전략<select name="validationRunId" aria-label="검증 완료 전략" required>{validations.value!.items.map((item) => <option key={item.validationRunId} value={item.validationRunId}>{item.strategyName} · 편집 {item.requestedEditSequence} · {dateLabel(item.completedAt)}</option>)}</select></label>}
    <label>익명 봇 별칭<input name="anonymousAlias" aria-label="익명 봇 별칭" placeholder="다른 참가자에게 표시될 별칭" required /></label>
    <p className="competition-api-privacy"><Check size={14} aria-hidden="true" />계정 이름과 전략 내부는 공개되지 않습니다.</p>{error && <p role="alert">{error}</p>}
    <footer><button type="button" className="button button-secondary" onClick={onClose}>취소</button><button type="submit" className="button button-primary" disabled={saving || !available}>{saving ? '참가 중…' : '참가 확정'}</button></footer>
  </form></DialogShell>;
}
