import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bot, CalendarDays, Check, Copy, KeyRound, LoaderCircle, Plus, RotateCcw, Search, Settings2, Trash2, Trophy, UserMinus, X } from 'lucide-react';
import type {
  CompetitionRoomsClient, CreateRoomInput, JoinRoomInput, LeaderboardItem,
  LeaderboardPage, PostEvaluationAction, PostEvaluationChoice, PublicRoom, RoomInputCatalog,
  CurrentStrategyValidationPage,
  OwnedRoomManagement,
} from '../api/competitionRooms';
import { CompetitionApiError } from '../api/competitionRooms';
import { formatDateTimeLocal, zonedLocalToIso } from '../lib/zonedDateTime';
import type { StrategyReleaseInputs } from '../api/strategies';
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
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<PublicRoom | null>(null);
  const [selectedOwned, setSelectedOwned] = useState<OwnedRoomManagement | null>(null);
  const [ownedRooms, setOwnedRooms] = useState<SectionLoad<OwnedRoomManagement[]>>({ state: 'loading', value: null, error: null });
  const [ownedReloadKey, setOwnedReloadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [invitationOpen, setInvitationOpen] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setCursor(undefined);
      setCursorHistory([]);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const load = useCallback(async (signal?: AbortSignal) => {
    setState('loading');
    setLobbyError(null);
    try { const page = await client.searchRooms({ q: debouncedQuery, cursor, limit: 20 }, signal); setRooms(page.items); setNextCursor(page.nextCursor); setHasMore(page.hasMore); setState('ready'); }
    catch (error) { if ((error as { name?: string }).name !== 'AbortError') { setLobbyError(error); setState('error'); } }
  }, [client, cursor, debouncedQuery]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, reloadKey]);
  useEffect(() => {
    const controller = new AbortController(); setOwnedRooms((current) => ({ state: 'loading', value: current.value, error: null }));
    client.ownedRooms(50, controller.signal)
      .then((value) => setOwnedRooms({ state: 'ready', value, error: null }))
      .catch((cause) => { if ((cause as { name?: string }).name !== 'AbortError') setOwnedRooms((current) => ({ state: 'error', value: current.value, error: cause })); });
    return () => controller.abort();
  }, [client, ownedReloadKey]);

  if (selectedOwned) return <OwnedRoomManager client={client} room={selectedOwned} onBack={() => { setSelectedOwned(null); setOwnedReloadKey((key) => key + 1); }} onChanged={() => setOwnedReloadKey((key) => key + 1)} />;
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
    <PageHeading eyebrow="BOT COMPETITION · LIVE API" title="모의투자" description="실제 대회 API에서 공개 방과 일정을 조회하고, 익명 봇 성과만 비교합니다." actions={<><Button icon={KeyRound} onClick={() => setInvitationOpen(true)}>초대 코드 참가</Button><Button kind="primary" icon={Plus} onClick={() => setCreateOpen(true)}>대회 만들기</Button></>} />
    {createOpen && <CreateRoomDialog client={client} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); setReloadKey((key) => key + 1); setOwnedReloadKey((key) => key + 1); }} />}
    {invitationOpen && <InvitationConsumeDialog client={client} onClose={() => setInvitationOpen(false)} onConsumed={(roomId) => { setInvitationOpen(false); setQuery(''); setReloadKey((key) => key + 1); setNotice(`초대를 확인했습니다. 대회 ID: ${roomId}`); }} />}
    <div className="competition-api-toolbar">
      <label><Search size={15} aria-hidden="true" /><input type="search" aria-label="대회 검색" value={query} placeholder="대회명 검색" onChange={(event) => setQuery(event.target.value)} /></label>
      <button type="button" onClick={() => setReloadKey((key) => key + 1)}><RotateCcw size={14} aria-hidden="true" />새로고침</button>
    </div>
    <section className="competition-bulletin competition-owned-rooms" aria-label="내가 만든 대회">
      <header className="competition-bulletin-head"><h2><Settings2 size={14} />내가 만든 대회</h2><span>{ownedRooms.state === 'ready' ? `${ownedRooms.value.length}개` : '계정 조회'}</span></header>
      {ownedRooms.state === 'loading' && !ownedRooms.value && <div className="competition-api-state" role="status"><LoaderCircle className="is-spinning" /><strong>내 대회를 불러오는 중입니다.</strong></div>}
      {ownedRooms.state === 'error' && !ownedRooms.value && <div className="competition-api-mini-empty" role="status">{ownedRooms.error instanceof CompetitionApiError && (ownedRooms.error.unauthenticated || ownedRooms.error.forbidden) ? '로그인하면 내가 만든 대회를 관리할 수 있습니다.' : <><strong>내 대회를 불러오지 못했습니다.</strong><button type="button" onClick={() => setOwnedReloadKey((key) => key + 1)}>다시 시도</button></>}</div>}
      {ownedRooms.value?.length === 0 && <div className="competition-api-mini-empty">아직 만든 대회가 없습니다.</div>}
      {ownedRooms.value && ownedRooms.value.length > 0 && <div role="list" aria-label="내 대회 목록">{ownedRooms.value.map((room) => <button type="button" role="listitem" className="competition-row" aria-label={`${room.name} 관리`} key={room.roomId} onClick={() => setSelectedOwned(room)}><span className="competition-row-cell is-type"><span className="competition-kind-chip" data-kind="live">{room.accessType === 'SECRET' ? 'SECRET' : 'PUBLIC'}</span></span><span className="competition-row-name"><strong>{room.name}</strong><small>{room.status}</small></span><span className="competition-row-cell is-num"><b>{room.participations.length}</b><small>참가 봇</small></span><span className="competition-row-cell is-num"><b>{dateLabel(room.participationClosesAt)}</b><small>참가 마감</small></span></button>)}</div>}
    </section>
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
      {state === 'ready' && (cursorHistory.length > 0 || hasMore) && <footer className="competition-api-pagination" aria-label="대회 목록 페이지 이동">
        <button type="button" disabled={cursorHistory.length === 0} onClick={() => { const history = cursorHistory.slice(); setCursor(history.pop()); setCursorHistory(history); }}><ArrowLeft size={14} />이전</button>
        <span>{cursorHistory.length + 1}페이지</span>
        <button type="button" disabled={!hasMore || !nextCursor} onClick={() => { if (!nextCursor) return; setCursorHistory((history) => [...history, cursor]); setCursor(nextCursor); }} >다음<ArrowRight size={14} /></button>
      </footer>}
      {notice && <p role="status" className="competition-api-inline-status">{notice}</p>}
    </section>
  </div>;
}

function OwnedRoomManager({ client, room, onBack, onChanged }: { client: CompetitionRoomsClient; room: OwnedRoomManagement; onBack: () => void; onChanged: () => void }) {
  const [current, setCurrent] = useState(room);
  const [editOpen, setEditOpen] = useState(false);
  const [issuedSecret, setIssuedSecret] = useState('');
  const [issueType, setIssueType] = useState<'LINK' | 'CODE'>('LINK');
  const [validitySeconds, setValiditySeconds] = useState(3600);
  const [actionState, setActionState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [actionMessage, setActionMessage] = useState('');
  const [cancelReason, setCancelReason] = useState('CREATOR_REQUEST');
  const [cancelConfirmation, setCancelConfirmation] = useState('');
  const refresh = async () => {
    const rooms = await client.ownedRooms(50);
    const refreshed = rooms.find((item) => item.roomId === current.roomId);
    if (refreshed) setCurrent(refreshed);
    onChanged();
  };
  const issue = async () => {
    setActionState('saving'); setActionMessage(''); setIssuedSecret('');
    try { const invitation = await client.issueInvitation(current.roomId, issueType, validitySeconds); setIssuedSecret(invitation.secret); setActionState('idle'); setActionMessage('초대를 생성했습니다. 비밀값은 지금 안전하게 전달하세요.'); await refresh(); }
    catch { setActionState('error'); setActionMessage('초대를 생성하지 못했습니다. 대회 상태와 권한을 확인해 주세요.'); }
  };
  const revoke = async (invitationId: string) => {
    setActionState('saving'); setActionMessage('');
    try { await client.revokeInvitation(current.roomId, invitationId); setActionState('idle'); setActionMessage('초대를 취소했습니다.'); await refresh(); }
    catch { setActionState('error'); setActionMessage('초대를 취소하지 못했습니다.'); }
  };
  const cancel = async () => {
    if (cancelConfirmation !== '취소') return;
    setActionState('saving'); setActionMessage('');
    try { await client.cancelRoom(current.roomId, cancelReason.trim()); setActionState('idle'); setActionMessage('대회를 취소했습니다.'); await refresh(); }
    catch { setActionState('error'); setActionMessage('대회를 취소하지 못했습니다. 현재 상태를 확인해 주세요.'); }
  };
  const editable = current.status === 'DRAFT';
  const terminal = current.status === 'ENDED' || current.status === 'CANCELLED' || current.status === 'INVALIDATED';
  return <section className="page competition-page competition-api-detail competition-owner-manager" role="region" aria-label={`${current.name} 관리`}>
    <button type="button" className="competition-detail-back" onClick={onBack}><ArrowLeft size={15} />대회 목록</button>
    <header className="competition-api-detail-head"><div><span>{current.status}</span><h1>{current.name}</h1><p>방장에게만 공개되는 설정·초대·참가 관리 화면입니다.</p></div><button type="button" className="button button-primary" disabled={!editable} title={editable ? undefined : '모집이 시작된 뒤에는 규칙을 변경할 수 없습니다.'} onClick={() => setEditOpen(true)}><Settings2 size={15} />설정 변경</button></header>
    <dl className="competition-detail-facts"><div><dt>접근 방식</dt><dd>{current.accessType}</dd></div><div><dt>상태</dt><dd>{current.status}</dd></div><div><dt>초기 자금</dt><dd>${current.initialCashAmount.toLocaleString()}</dd></div><div><dt>참가 봇</dt><dd>{current.participations.length} / {current.botParticipationLimit}</dd></div><div><dt>시간대</dt><dd>{current.timezoneName}</dd></div></dl>
    {editOpen && <EditRoomDialog client={client} room={current} onClose={() => setEditOpen(false)} onSaved={async () => { setEditOpen(false); await refresh(); }} />}
    {current.accessType === 'SECRET' && !terminal && <section className="competition-owner-panel" aria-labelledby="invitation-management-title"><h2 id="invitation-management-title">초대 관리</h2><div className="competition-owner-form"><label>초대 종류<select aria-label="초대 종류" value={issueType} onChange={(event) => setIssueType(event.target.value as 'LINK' | 'CODE')}><option value="LINK">일회용 링크 토큰</option><option value="CODE">일회용 코드</option></select></label><label>유효시간(초)<input aria-label="초대 유효시간" type="number" min="60" max="604800" step="60" value={validitySeconds} onChange={(event) => setValiditySeconds(Number(event.target.value))} /></label><button type="button" className="button button-primary" disabled={actionState === 'saving' || validitySeconds < 60} onClick={() => void issue()}>초대 생성</button></div>{issuedSecret && <div className="competition-invitation-secret" role="status"><code>{issuedSecret}</code><button type="button" onClick={() => void navigator.clipboard?.writeText(issuedSecret)}><Copy size={14} />복사</button></div>}<div className="competition-owner-list">{current.invitations.length === 0 ? <p>발급한 초대가 없습니다.</p> : current.invitations.map((invitation) => <div key={invitation.invitationId}><span><strong>{invitation.credentialType}</strong><small>만료 {new Date(invitation.expiresAt).toLocaleString()}</small></span>{invitation.revokedAt ? <em>취소됨</em> : <button type="button" disabled={actionState === 'saving'} onClick={() => void revoke(invitation.invitationId)}><Trash2 size={14} />취소</button>}</div>)}</div></section>}
    <section className="competition-owner-panel" aria-labelledby="participant-management-title"><h2 id="participant-management-title">참가 봇 관리</h2>{current.participations.length === 0 ? <div className="competition-api-mini-empty">아직 참가한 봇이 없습니다.</div> : <div className="competition-owner-list">{current.participations.map((participation) => <ParticipantExpulsion key={participation.participationId} client={client} roomId={current.roomId} participation={participation} disabled={terminal} onDone={() => void refresh()} />)}</div>}</section>
    {!terminal && <section className="competition-owner-panel competition-danger-panel" aria-labelledby="cancel-room-title"><h2 id="cancel-room-title">대회 취소</h2><p>취소하면 활성 참가가 함께 종료되며 되돌릴 수 없습니다.</p><label>사유 코드<input aria-label="대회 취소 사유" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label><label>확인을 위해 “취소” 입력<input aria-label="대회 취소 확인" value={cancelConfirmation} onChange={(event) => setCancelConfirmation(event.target.value)} /></label><button type="button" className="button button-secondary" disabled={actionState === 'saving' || cancelConfirmation !== '취소' || !cancelReason.trim()} onClick={() => void cancel()}>대회 취소</button></section>}
    {actionMessage && <p className="competition-api-inline-status" role={actionState === 'error' ? 'alert' : 'status'}>{actionMessage}</p>}
  </section>;
}

function ParticipantExpulsion({ client, roomId, participation, disabled, onDone }: { client: CompetitionRoomsClient; roomId: string; participation: OwnedRoomManagement['participations'][number]; disabled: boolean; onDone: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const active = !['WITHDRAWN', 'EXPELLED', 'COMPLETED'].includes(participation.status);
  const expel = async () => { if (confirmation !== participation.anonymousAlias) return; setState('saving'); try { await client.expelParticipation(roomId, participation.participationId); onDone(); } catch { setState('error'); } };
  return <div><span><strong>{participation.anonymousAlias}</strong><small>{participation.status} · {new Date(participation.joinedAt).toLocaleString()}</small></span>{active && !disabled && <span className="competition-expulsion-controls"><input aria-label={`${participation.anonymousAlias} 퇴장 확인`} placeholder="봇 별칭 입력" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setState('idle'); }} /><button type="button" disabled={state === 'saving' || confirmation !== participation.anonymousAlias} onClick={() => void expel()}><UserMinus size={14} />퇴장</button></span>}{state === 'error' && <em role="alert">퇴장 처리 실패</em>}</div>;
}

function EditRoomDialog({ client, room, onClose, onSaved }: { client: CompetitionRoomsClient; room: OwnedRoomManagement; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setError('');
    let schedule: Record<string, string>;
    try { schedule = Object.fromEntries(['recruitmentOpensAt', 'participationOpensAt', 'participationClosesAt', 'evaluationStartsAt', 'evaluationEndsAt', 'finalizationDeadlineAt'].map((name) => [name, zonedLocalToIso(String(form.get(name)), room.timezoneName)])); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '일정을 확인해 주세요.'); return; }
    const input: CreateRoomInput = { ...room, name: String(form.get('name')).trim(), initialCashAmount: Number(form.get('initialCashAmount')), botParticipationLimit: Number(form.get('botParticipationLimit')), perAccountBotLimit: Number(form.get('perAccountBotLimit')), stoppedBotSlotPolicy: String(form.get('stoppedBotSlotPolicy')), minimumOperationSeconds: Number(form.get('minimumOperationSeconds')), minimumFillCount: Number(form.get('minimumFillCount')), ...schedule };
    setSaving(true); try { await client.updateRoom(room.roomId, input); await onSaved(); } catch (cause) { setError(cause instanceof CompetitionApiError && cause.conflict ? cause.detail || '모집이 시작되어 설정을 변경할 수 없습니다.' : '설정을 저장하지 못했습니다.'); setSaving(false); }
  };
  const local = (value: string) => formatDateTimeLocal(new Date(value), room.timezoneName);
  return <DialogShell title="대회 설정 변경" onClose={onClose}><form className="competition-api-form" onSubmit={submit}><p>접근 방식과 잠긴 정책 ID는 생성 후 변경할 수 없습니다.</p><div className="competition-api-form-grid"><label>대회 이름<input name="name" aria-label="변경할 대회 이름" defaultValue={room.name} required /></label><label>초기 가상자금<input name="initialCashAmount" aria-label="변경할 초기 가상자금" type="number" min="1" step="0.01" defaultValue={room.initialCashAmount} required /></label><label>전체 봇 한도<input name="botParticipationLimit" aria-label="변경할 전체 봇 한도" type="number" min="1" defaultValue={room.botParticipationLimit} required /></label><label>계정당 봇 한도<input name="perAccountBotLimit" aria-label="변경할 계정당 봇 한도" type="number" min="1" defaultValue={room.perAccountBotLimit} required /></label><label>중지 봇 슬롯<select name="stoppedBotSlotPolicy" aria-label="변경할 중지 봇 슬롯" defaultValue={room.stoppedBotSlotPolicy}><option value="RELEASE_SLOT">슬롯 반환</option><option value="KEEP_SLOT">슬롯 유지</option><option value="COUNT_UNTIL_END">종료까지 유지</option></select></label><label>최소 운용시간<input name="minimumOperationSeconds" aria-label="변경할 최소 운용시간" type="number" min="0" defaultValue={room.minimumOperationSeconds} required /></label><label>최소 체결 수<input name="minimumFillCount" aria-label="변경할 최소 체결 수" type="number" min="0" defaultValue={room.minimumFillCount} required /></label>{[['recruitmentOpensAt','모집 시작'],['participationOpensAt','참가 시작'],['participationClosesAt','참가 마감'],['evaluationStartsAt','평가 시작'],['evaluationEndsAt','평가 종료'],['finalizationDeadlineAt','최종 확정 시한']].map(([name, label]) => <label key={name}>{label}<input name={name} aria-label={`변경할 ${label}`} type="datetime-local" defaultValue={local(room[name as keyof OwnedRoomManagement] as string)} required /></label>)}</div>{error && <p role="alert">{error}</p>}<footer><button type="button" className="button button-secondary" onClick={onClose}>취소</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? '저장 중…' : '설정 저장'}</button></footer></form></DialogShell>;
}

type SectionLoad<T> = { state: 'loading'; value: T | null; error: null } | { state: 'ready'; value: T; error: null } | { state: 'error'; value: T | null; error: unknown };

function RoomApiDetail({ client, room, onBack }: { client: CompetitionRoomsClient; room: PublicRoom; onBack: () => void }) {
  const [leaderboard, setLeaderboard] = useState<SectionLoad<LeaderboardPage>>({ state: 'loading', value: null, error: null });
  const [myBots, setMyBots] = useState<SectionLoad<LeaderboardPage>>({ state: 'loading', value: null, error: null });
  const [joinOpen, setJoinOpen] = useState(false);
  const [publicReloadKey, setPublicReloadKey] = useState(0);
  const [ownedReloadKey, setOwnedReloadKey] = useState(0);
  const [publicCursor, setPublicCursor] = useState<string | undefined>();
  const [publicHistory, setPublicHistory] = useState<Array<string | undefined>>([]);
  const [ownedCursor, setOwnedCursor] = useState<string | undefined>();
  const [ownedHistory, setOwnedHistory] = useState<Array<string | undefined>>([]);
  const [choices, setChoices] = useState<Record<string, PostEvaluationChoice>>({});
  useEffect(() => {
    const controller = new AbortController(); setLeaderboard((current) => ({ state: 'loading', value: current.value, error: null }));
    client.leaderboard(room.id, { cursor: publicCursor, limit: 20 }, controller.signal)
      .then((value) => setLeaderboard({ state: 'ready', value, error: null }))
      .catch((cause) => { if ((cause as { name?: string }).name !== 'AbortError') setLeaderboard((current) => ({ state: 'error', value: current.value, error: cause })); });
    return () => controller.abort();
  }, [client, publicCursor, publicReloadKey, room.id]);
  useEffect(() => {
    const controller = new AbortController(); setMyBots((current) => ({ state: 'loading', value: current.value, error: null }));
    client.myBots(room.id, { cursor: ownedCursor, limit: 20 }, controller.signal)
      .then(async (value) => {
        setMyBots({ state: 'ready', value, error: null });
        const found = await Promise.all(value.items.flatMap((item) => item.viewerEvidence ? [client.getPostEvaluationChoice(room.id, item.viewerEvidence.participationId, controller.signal).catch(() => null)] : []));
        setChoices(Object.fromEntries(found.filter((choice): choice is PostEvaluationChoice => choice !== null).map((choice) => [choice.participationId, choice])));
      })
      .catch((cause) => { if ((cause as { name?: string }).name !== 'AbortError') setMyBots((current) => ({ state: 'error', value: current.value, error: cause })); });
    return () => controller.abort();
  }, [client, ownedCursor, ownedReloadKey, room.id]);
  const ended = leaderboard.value?.snapshotStatus === 'FINAL' || leaderboard.value?.snapshotStatus === 'PUBLISHED';
  const joinClosed = Date.now() > Date.parse(room.participationClosesAt);
  return <section className="competition-api-detail" role="region" aria-label={`${room.name} 상세`}>
    <button type="button" className="competition-detail-back" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />대회 목록</button>
    <header className="competition-api-detail-head"><div><span>{statusLabel(room)}</span><h1>{room.name}</h1><p>참가자는 표시하지 않으며, 플랫폼이 부여한 익명 봇 별칭만 공개합니다.</p></div><button type="button" className="button button-primary" disabled={joinClosed} onClick={() => setJoinOpen(true)}>{joinClosed ? '참가 마감' : '이 대회 참가하기'}</button></header>
    <dl className="competition-detail-facts"><div data-fact-width="wide"><dt>모집 시작</dt><dd>{dateLabel(room.recruitmentOpensAt)}</dd></div><div data-fact-width="wide"><dt>참가 마감</dt><dd>{dateLabel(room.participationClosesAt)}</dd></div><div data-fact-width="compact"><dt>전체 봇 한도</dt><dd>{room.botParticipationLimit}</dd></div><div data-fact-width="compact"><dt>계정당 한도</dt><dd>{room.perAccountBotLimit}</dd></div></dl>
    {joinOpen && <JoinRoomDialog client={client} room={room} onClose={() => setJoinOpen(false)} onJoined={() => { setJoinOpen(false); setOwnedReloadKey((key) => key + 1); }} />}
    <div className="competition-api-ranking-grid">
      <LeaderboardSection title="익명 봇 리더보드" load={leaderboard} history={publicHistory} setHistory={setPublicHistory} cursor={publicCursor} setCursor={setPublicCursor} onRetry={() => setPublicReloadKey((key) => key + 1)} />
      <LeaderboardSection title="내 봇 비교" load={myBots} history={ownedHistory} setHistory={setOwnedHistory} cursor={ownedCursor} setCursor={setOwnedCursor} owned onRetry={() => setOwnedReloadKey((key) => key + 1)} />
    </div>
    {myBots.state === 'ready' && myBots.value.items.length > 0 && !ended && <section className="competition-choice-panel" aria-labelledby="participation-management-title"><h2 id="participation-management-title">내 참가 관리</h2><p>철회하면 현재 대회 평가는 종료됩니다. 봇을 비공개로 계속 운용하거나 안전하게 중지할 수 있습니다.</p>{myBots.value.items.map((item) => item.viewerEvidence && <WithdrawParticipation key={item.viewerEvidence.participationId} client={client} roomId={room.id} item={item} onDone={() => setOwnedReloadKey((key) => key + 1)} />)}</section>}
    {myBots.state === 'ready' && ended && myBots.value.items.length > 0 && <section className="competition-choice-panel" aria-labelledby="post-evaluation-title"><h2 id="post-evaluation-title">대회 종료 후 운용 선택</h2><p>선택하지 않으면 봇은 안전한 종료 절차에 따라 주문을 취소하고 포지션을 정리합니다.</p>{myBots.value.items.map((item) => item.viewerEvidence && <PostChoice key={item.viewerEvidence.participationId} client={client} roomId={room.id} item={item} initial={choices[item.viewerEvidence.participationId]} />)}</section>}
  </section>;
}

function LeaderboardSection({ title, load, history, setHistory, cursor, setCursor, owned = false, onRetry }: { title: string; load: SectionLoad<LeaderboardPage>; history: Array<string | undefined>; setHistory: React.Dispatch<React.SetStateAction<Array<string | undefined>>>; cursor: string | undefined; setCursor: (cursor: string | undefined) => void; owned?: boolean; onRetry: () => void }) {
  if (load.state === 'loading' && !load.value) return <section className="competition-api-leaderboard" aria-label={title}><div className="competition-api-state" role="status"><LoaderCircle className="is-spinning" /><strong>{title}를 불러오는 중입니다.</strong></div></section>;
  if (load.state === 'error' && !load.value) {
    const denied = load.error instanceof CompetitionApiError && (load.error.unauthenticated || load.error.forbidden);
    return <section className="competition-api-leaderboard" aria-label={title}><div className="competition-api-mini-empty" role={denied ? 'status' : 'alert'}><strong>{denied && owned ? '로그인하면 내 봇 비교를 볼 수 있습니다.' : `${title}를 불러오지 못했습니다.`}</strong>{!denied && <button type="button" onClick={onRetry}>다시 시도</button>}</div></section>;
  }
  const page = load.value!;
  return <section className="competition-api-leaderboard" aria-label={title}><Leaderboard title={title} items={page.items} owned />{(history.length > 0 || page.hasMore) && <footer className="competition-api-pagination"><button type="button" disabled={history.length === 0} onClick={() => { const next = history.slice(); setCursor(next.pop()); setHistory(next); }}><ArrowLeft size={13} />이전</button><span>{history.length + 1}페이지</span><button type="button" disabled={!page.hasMore || !page.nextCursor} onClick={() => { if (!page.nextCursor) return; setHistory((current) => [...current, cursor]); setCursor(page.nextCursor ?? undefined); }}>다음<ArrowRight size={13} /></button></footer>}</section>;
}

function Leaderboard({ title, items, owned = false }: { title: string; items: LeaderboardItem[]; owned?: boolean }) {
  return <section className="competition-api-leaderboard" aria-label={title}><header><h2>{title}</h2><span>{items.length}개</span></header>{items.length === 0 ? <div className="competition-api-mini-empty">표시할 봇 성과가 없습니다.</div> : <div className="competition-ranking-list"><div className="competition-ranking is-metric-ranking" style={{ '--ranking-cols': '56px minmax(140px, 1fr) repeat(4, minmax(82px, 1fr))', '--ranking-min-width': '650px' } as React.CSSProperties}><header><span>순위</span><span>익명 봇</span><span>점수</span><span>수익률</span><span>MDD</span><span>샤프</span></header>{items.map((item, index) => <div className={owned ? 'is-mine' : ''} key={`${item.anonymousAlias}-${index}`}><strong>#{item.rank ?? '—'}</strong><span>{item.anonymousAlias}{owned && <i className="competition-ranking-mine-tag"><Bot size={12} aria-hidden="true" />내 봇</i>}</span><b>{metric(item.score)}</b><b>{metric(item.totalReturnPct, '%')}</b><b>{metric(item.maxDrawdownPct, '%')}</b><b>{metric(item.sharpeRatio)}</b></div>)}</div></div>}</section>;
}

function WithdrawParticipation({ client, roomId, item, onDone }: { client: CompetitionRoomsClient; roomId: string; item: LeaderboardItem; onDone: () => void }) {
  const participationId = item.viewerEvidence!.participationId;
  const [action, setAction] = useState<'CONTINUE_PRIVATE' | 'STOP'>('CONTINUE_PRIVATE');
  const [reason, setReason] = useState('USER_REQUEST');
  const [confirmation, setConfirmation] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const submit = async () => {
    if (confirmation !== '철회') return;
    setState('saving');
    try { await client.withdrawParticipation(roomId, participationId, action, reason.trim()); setState('done'); onDone(); }
    catch { setState('error'); }
  };
  return <fieldset disabled={state === 'saving' || state === 'done'}><legend>{item.anonymousAlias}</legend><label>철회 후 봇<select aria-label={`${item.anonymousAlias} 철회 후 봇`} value={action} onChange={(event) => setAction(event.target.value as 'CONTINUE_PRIVATE' | 'STOP')}><option value="CONTINUE_PRIVATE">비공개로 계속 운용</option><option value="STOP">안전하게 중지</option></select></label><label>사유 코드<input aria-label={`${item.anonymousAlias} 철회 사유`} value={reason} onChange={(event) => setReason(event.target.value)} /></label><label>확인을 위해 “철회” 입력<input aria-label={`${item.anonymousAlias} 철회 확인`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button type="button" className="button button-secondary" disabled={confirmation !== '철회' || !reason.trim()} onClick={() => void submit()}>{state === 'saving' ? '철회 중…' : '대회 참가 철회'}</button>{state === 'done' && <span role="status">참가를 철회했습니다.</span>}{state === 'error' && <span role="alert">참가 철회에 실패했습니다.</span>}</fieldset>;
}

function PostChoice({ client, roomId, item, initial }: { client: CompetitionRoomsClient; roomId: string; item: LeaderboardItem; initial?: PostEvaluationChoice }) {
  const participationId = item.viewerEvidence!.participationId;
  const [action, setAction] = useState<PostEvaluationAction>(initial?.action ?? 'STOP_AFTER_EVALUATION');
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState(''); const locked = Boolean(initial?.lockedAt);
  const save = async () => { setSaving(true); setMessage(''); try { await client.setPostEvaluationChoice(roomId, participationId, action); setMessage('종료 후 선택을 저장했습니다.'); } catch { setMessage('선택을 저장하지 못했습니다. 다시 시도해 주세요.'); } finally { setSaving(false); } };
  return <fieldset disabled={locked || saving}><legend>{item.anonymousAlias}</legend><label><input type="radio" name={`choice-${participationId}`} checked={action === 'CONTINUE_PRIVATE'} onChange={() => setAction('CONTINUE_PRIVATE')} />비공개 봇으로 계속 운용</label><label><input type="radio" name={`choice-${participationId}`} checked={action === 'STOP_AFTER_EVALUATION'} onChange={() => setAction('STOP_AFTER_EVALUATION')} />대회 종료와 함께 안전하게 중지</label><button type="button" className="button button-primary" onClick={save}>{saving ? '저장 중…' : '종료 후 선택 저장'}</button>{message && <span role="status">{message}</span>}{locked && <span>선택이 잠겨 변경할 수 없습니다.</span>}</fieldset>;
}

function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="competition-create-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="competition-create-dialog competition-api-dialog" role="dialog" aria-modal="true" aria-label={title}><header><div><small>COMPETITION</small><h2>{title}</h2></div><button type="button" aria-label={`${title} 닫기`} onClick={onClose}><X size={20} /></button></header>{children}</section></div>; }

function InvitationConsumeDialog({ client, onClose, onConsumed }: { client: CompetitionRoomsClient; onClose: () => void; onConsumed: (roomId: string) => void }) {
  const [secret, setSecret] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!secret.trim()) return; setState('saving');
    try { const result = await client.consumeInvitation(secret.trim()); onConsumed(result.roomId); }
    catch { setState('error'); }
  };
  return <DialogShell title="초대 코드 참가" onClose={onClose}><form className="competition-api-form" onSubmit={submit}><p>방장이 전달한 일회용 링크 토큰 또는 초대 코드를 입력하세요.</p><label>초대 비밀값<input aria-label="초대 비밀값" autoComplete="off" value={secret} onChange={(event) => { setSecret(event.target.value); setState('idle'); }} required /></label>{state === 'error' && <p role="alert">초대가 만료되었거나 이미 사용되었습니다.</p>}<footer><button type="button" className="button button-secondary" onClick={onClose}>취소</button><button type="submit" className="button button-primary" disabled={!secret.trim() || state === 'saving'}>{state === 'saving' ? '확인 중…' : '초대 확인'}</button></footer></form></DialogShell>;
}

const dateTime = (days: number, timeZone: string) => {
  const date = new Date(Date.now() + days * 86400000);
  date.setMinutes(0, 0, 0);
  return formatDateTimeLocal(date, timeZone);
};
function CreateRoomDialog({ client, onClose, onCreated }: { client: CompetitionRoomsClient; onClose: () => void; onCreated: () => void }) {
  const [catalog, setCatalog] = useState<{ state: LoadState; value: RoomInputCatalog | null; error: unknown }>({ state: 'loading', value: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [timezone, setTimezone] = useState('Asia/Seoul');
  const [scoringTemplateId, setScoringTemplateId] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setCatalog({ state: 'loading', value: null, error: null });
    client.roomInputCatalog(controller.signal)
      .then((value) => { setCatalog({ state: 'ready', value, error: null }); setScoringTemplateId((current) => current || value.scoringTemplates[0]?.id || ''); })
      .catch((cause) => { if ((cause as { name?: string }).name !== 'AbortError') setCatalog({ state: 'error', value: null, error: cause }); });
    return () => controller.abort();
  }, [client, reloadKey]);
  const complete = catalog.state === 'ready' && Boolean(catalog.value?.scoringTemplates.length && catalog.value.feePolicies.length && catalog.value.buyingPowerBufferPolicies.length);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!complete) return;
    const form = new FormData(event.currentTarget); setError('');
    let schedule: Record<string, string>;
    try {
      schedule = Object.fromEntries(['recruitmentOpensAt', 'participationOpensAt', 'participationClosesAt', 'evaluationStartsAt', 'evaluationEndsAt', 'finalizationDeadlineAt']
        .map((name) => [name, zonedLocalToIso(String(form.get(name)), timezone)]));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '대회 일정을 확인해 주세요.'); return; }
    const ordered = schedule.recruitmentOpensAt <= schedule.participationOpensAt
      && schedule.participationOpensAt < schedule.participationClosesAt
      && schedule.participationClosesAt < schedule.evaluationStartsAt
      && schedule.evaluationStartsAt < schedule.evaluationEndsAt
      && schedule.evaluationEndsAt <= schedule.finalizationDeadlineAt;
    if (!ordered) { setError('모집·참가·평가·최종 확정 시한을 시간 순서대로 입력해 주세요.'); return; }
    const initialCashAmount = Number(form.get('initialCashAmount'));
    const botParticipationLimit = Number(form.get('botParticipationLimit'));
    const perAccountBotLimit = Number(form.get('perAccountBotLimit'));
    const minimumOperationSeconds = Number(form.get('minimumOperationSeconds'));
    const minimumFillCount = Number(form.get('minimumFillCount'));
    if (!(initialCashAmount > 0) || !Number.isSafeInteger(botParticipationLimit) || botParticipationLimit < 1 || !Number.isSafeInteger(perAccountBotLimit) || perAccountBotLimit < 1 || perAccountBotLimit > botParticipationLimit || !Number.isSafeInteger(minimumOperationSeconds) || minimumOperationSeconds < 0 || !Number.isSafeInteger(minimumFillCount) || minimumFillCount < 0) { setError('자금과 참가·운용 한도 값을 확인해 주세요.'); return; }
    const template = catalog.value!.scoringTemplates.find((item) => item.id === scoringTemplateId)!;
    const scoringAdjustments = Object.fromEntries(template.adjustments.map((adjustment) => [adjustment.code, Number(form.get(`adjustment:${adjustment.code}`))]));
    setSaving(true);
    const input: CreateRoomInput = { name: String(form.get('name')).trim(), accessType: String(form.get('accessType')) as CreateRoomInput['accessType'], scoringTemplateVersionId: scoringTemplateId, scoringAdjustments, initialCashAmount, botParticipationLimit, perAccountBotLimit, stoppedBotSlotPolicy: String(form.get('stoppedBotSlotPolicy')), minimumOperationSeconds, minimumFillCount, feePolicyId: String(form.get('feePolicyId')), buyingPowerBufferPolicyId: String(form.get('buyingPowerBufferPolicyId')), recruitmentOpensAt: schedule.recruitmentOpensAt, participationOpensAt: schedule.participationOpensAt, evaluationStartsAt: schedule.evaluationStartsAt, participationClosesAt: schedule.participationClosesAt, evaluationEndsAt: schedule.evaluationEndsAt, finalizationDeadlineAt: schedule.finalizationDeadlineAt, timezoneName: timezone };
    try { await client.createRoom(input); onCreated(); } catch (cause) { setError(cause instanceof CompetitionApiError && cause.forbidden ? '대회를 만들 권한이 없습니다.' : '대회를 만들지 못했습니다. 입력과 로그인 상태를 확인해 주세요.'); setSaving(false); }
  };
  const catalogError = catalog.error instanceof CompetitionApiError && catalog.error.unauthenticated ? '로그인 후 대회 생성 정책을 확인할 수 있습니다.'
    : catalog.error instanceof CompetitionApiError && catalog.error.forbidden ? '대회 생성 정책을 조회할 권한이 없습니다.' : '대회 생성 정책을 불러오지 못했습니다.';
  return <DialogShell title="대회 만들기" onClose={onClose}><form className="competition-api-form" onSubmit={submit}>
    <fieldset className="competition-api-form-section"><legend>기본 설정</legend><div className="competition-api-form-grid"><label>대회 이름<input name="name" aria-label="대회 이름" placeholder="참가자가 알아보기 쉬운 이름" required /></label><label>접근 방식<select name="accessType" aria-label="접근 방식"><option value="PUBLIC">공개 대회</option><option value="SECRET">초대 전용</option></select></label><label>초기 가상자금<input name="initialCashAmount" aria-label="초기 가상자금" type="number" min="1" step="0.01" defaultValue="10000" required /></label><label>전체 봇 한도<input name="botParticipationLimit" aria-label="전체 봇 한도" type="number" min="1" step="1" defaultValue="25" required /></label><label>계정당 봇 한도<input name="perAccountBotLimit" aria-label="계정당 봇 한도" type="number" min="1" step="1" defaultValue="2" required /></label><label>중지 봇 슬롯<select name="stoppedBotSlotPolicy" aria-label="중지 봇 슬롯 정책"><option value="RELEASE_SLOT">슬롯 반환</option><option value="KEEP_SLOT">슬롯 유지</option></select></label><label>최소 운용시간(초)<input name="minimumOperationSeconds" aria-label="최소 운용시간" type="number" min="0" step="1" defaultValue="0" required /></label><label>최소 체결 수<input name="minimumFillCount" aria-label="최소 체결 수" type="number" min="0" step="1" defaultValue="0" required /></label></div></fieldset>
    <fieldset className="competition-api-form-section"><legend>대회 일정</legend><label>표시 시간대<select aria-label="대회 시간대" value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Asia/Seoul">Asia/Seoul (KST)</option><option value="UTC">UTC</option><option value="America/New_York">America/New_York (ET)</option></select></label><p>입력한 현지 시각은 선택한 시간대를 기준으로 서버 UTC 시각으로 변환됩니다.</p><div className="competition-api-form-grid"><label>모집 시작<input aria-label="모집 시작" name="recruitmentOpensAt" type="datetime-local" defaultValue={dateTime(0, timezone)} required /></label><label>참가 시작<input aria-label="참가 시작" name="participationOpensAt" type="datetime-local" defaultValue={dateTime(1, timezone)} required /></label><label>참가 마감<input aria-label="참가 마감" name="participationClosesAt" type="datetime-local" defaultValue={dateTime(3, timezone)} required /></label><label>평가 시작<input aria-label="평가 시작" name="evaluationStartsAt" type="datetime-local" defaultValue={dateTime(4, timezone)} required /></label><label>평가 종료<input aria-label="평가 종료" name="evaluationEndsAt" type="datetime-local" defaultValue={dateTime(10, timezone)} required /></label><label>최종 확정 시한<input aria-label="최종 확정 시한" name="finalizationDeadlineAt" type="datetime-local" defaultValue={dateTime(11, timezone)} required /></label></div></fieldset>
    <fieldset className="competition-api-form-section"><legend>운영 정책</legend>
      {catalog.state === 'loading' && <p role="status">대회 생성 입력을 불러오는 중입니다.</p>}
      {catalog.state === 'error' && <div role="alert"><p>{catalogError}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)}>정책 다시 불러오기</button></div>}
      {catalog.state === 'ready' && !complete && <p role="status">운영 정책 카탈로그가 준비되지 않아 대회를 만들 수 없습니다.</p>}
      {complete && <div className="competition-api-form-grid">
        <label>채점 템플릿<select name="scoringTemplateVersionId" aria-label="채점 템플릿" required value={scoringTemplateId} onChange={(event) => setScoringTemplateId(event.target.value)}>{catalog.value!.scoringTemplates.map((item) => <option key={item.id} value={item.id}>{item.templateCode} · {item.version}</option>)}</select></label>
        <label>수수료 정책<select name="feePolicyId" aria-label="수수료 정책" required>{catalog.value!.feePolicies.map((item) => <option key={item.id} value={item.id}>{item.policyCode} · {item.version} · {item.feeRateBps}bps</option>)}</select></label>
        <label>구매력 버퍼 정책<select name="buyingPowerBufferPolicyId" aria-label="구매력 버퍼 정책" required>{catalog.value!.buyingPowerBufferPolicies.map((item) => <option key={item.id} value={item.id}>{item.policyCode} · {item.version} · {item.bufferBps}bps</option>)}</select></label>
      </div>}
      {complete && catalog.value!.scoringTemplates.find((item) => item.id === scoringTemplateId)?.adjustments.map((adjustment) => <label key={adjustment.code}>{adjustment.code}<input name={`adjustment:${adjustment.code}`} aria-label={`채점 조정 ${adjustment.code}`} type="number" min={adjustment.minimum} max={adjustment.maximum} step={10 ** -adjustment.scale} defaultValue={adjustment.minimum} required /></label>)}
    </fieldset>
    {error && <p role="alert">{error}</p>}<footer><button type="button" className="button button-secondary" onClick={onClose}>취소</button><button type="submit" className="button button-primary" disabled={saving || !complete}>{saving ? '생성 중…' : '대회 생성'}</button></footer>
  </form></DialogShell>;
}

function JoinRoomDialog({ client, room, onClose, onJoined }: { client: CompetitionRoomsClient; room: PublicRoom; onClose: () => void; onJoined: () => void }) {
  const [validations, setValidations] = useState<{ state: LoadState; value: CurrentStrategyValidationPage | null; error: unknown }>({ state: 'loading', value: null, error: null });
  const [releaseInputs, setReleaseInputs] = useState<{ state: LoadState; value: StrategyReleaseInputs | null; error: unknown }>({ state: 'loading', value: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setValidations({ state: 'loading', value: null, error: null }); setReleaseInputs({ state: 'loading', value: null, error: null });
    client.currentStrategyValidations(controller.signal)
      .then((value) => setValidations({ state: 'ready', value, error: null }))
      .catch((cause) => { if ((cause as { name?: string }).name !== 'AbortError') setValidations({ state: 'error', value: null, error: cause }); });
    client.strategyReleaseInputs(controller.signal)
      .then((value) => setReleaseInputs({ state: 'ready', value, error: null }))
      .catch((cause) => { if ((cause as { name?: string }).name !== 'AbortError') setReleaseInputs({ state: 'error', value: null, error: cause }); });
    return () => controller.abort();
  }, [client, reloadKey]);
  const available = validations.state === 'ready' && Boolean(validations.value?.items.length) && releaseInputs.state === 'ready' && Boolean(releaseInputs.value?.executionPolicies.length);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!available) return;
    const form = new FormData(event.currentTarget);
    const validation = validations.value!.items.find((item) => item.validationRunId === String(form.get('validationRunId')))!;
    const policy = releaseInputs.value!.executionPolicies.find((item) => item.version === String(form.get('executionPolicyVersion')))!;
    const input: JoinRoomInput = { validationRunId: validation.validationRunId, anonymousAlias: String(form.get('anonymousAlias')).trim(), languageVersion: validation.languageVersion, schemaVersion: validation.schemaVersion, catalogVersion: validation.catalogVersion, budgetCapBps: Number(form.get('budgetCapBps')), brokerRulesVersion: policy.brokerRulesVersion, accountingRulesVersion: policy.accountingRulesVersion, candidateConflictPolicy: { policy: 'FIRST_WINS' } }; setSaving(true); setError('');
    try { await client.joinRoom(room.id, input); onJoined(); } catch (cause) { setError(cause instanceof CompetitionApiError && cause.unauthenticated ? '로그인 후 참가할 수 있습니다.' : cause instanceof CompetitionApiError && cause.forbidden ? '이 대회에 참가할 권한이 없습니다.' : cause instanceof CompetitionApiError && cause.conflict ? cause.detail || '참가 조건을 충족하지 못했습니다.' : '참가 요청을 완료하지 못했습니다.'); setSaving(false); }
  };
  const validationError = validations.error instanceof CompetitionApiError && validations.error.unauthenticated ? '로그인 후 검증 완료 전략을 확인할 수 있습니다.'
    : validations.error instanceof CompetitionApiError && validations.error.forbidden ? '검증 완료 전략을 조회할 권한이 없습니다.' : '검증 완료 전략을 불러오지 못했습니다.';
  return <DialogShell title="대회 참가" onClose={onClose}><form className="competition-api-form" onSubmit={submit}>
    <p>{room.name}에는 검증 완료된 전략 실행만 제출할 수 있습니다.</p>
    {validations.state === 'loading' && <p role="status">검증 완료 전략을 불러오는 중입니다.</p>}
    {validations.state === 'error' && <div role="alert"><p>{validationError}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)}>전략 다시 불러오기</button></div>}
    {validations.state === 'ready' && validations.value!.items.length === 0 && <p role="alert">현재 제출 가능한 검증 완료 전략이 없습니다.</p>}
    {available && <label>검증 완료 전략<select name="validationRunId" aria-label="검증 완료 전략" required>{validations.value!.items.map((item) => <option key={item.validationRunId} value={item.validationRunId}>{item.strategyName} · 편집 {item.requestedEditSequence} · {dateLabel(item.completedAt)}</option>)}</select></label>}
    {releaseInputs.state === 'error' && <div role="alert"><p>실행 정책을 불러오지 못했습니다.</p><button type="button" onClick={() => setReloadKey((key) => key + 1)}>실행 정책 다시 불러오기</button></div>}
    {releaseInputs.state === 'ready' && releaseInputs.value?.executionPolicies.length === 0 && <p role="alert">현재 사용할 수 있는 공식 실행 정책이 없습니다.</p>}
    {available && <label>공식 실행 정책<select name="executionPolicyVersion" aria-label="공식 실행 정책" required>{releaseInputs.value!.executionPolicies.map((item) => <option key={item.version} value={item.version}>{item.version} · {item.brokerRulesVersion} · {item.accountingRulesVersion}</option>)}</select></label>}
    <label>봇 예산 비율(1–100%)<input name="budgetCapBps" aria-label="봇 예산 비율" type="number" min="1" max="10000" step="1" defaultValue="10000" required /></label>
    <label>익명 봇 별칭<input name="anonymousAlias" aria-label="익명 봇 별칭" placeholder="다른 참가자에게 표시될 별칭" required /></label>
    <p className="competition-api-privacy"><Check size={14} aria-hidden="true" />계정 이름과 전략 내부는 공개되지 않습니다.</p>{error && <p role="alert">{error}</p>}
    <footer><button type="button" className="button button-secondary" onClick={onClose}>취소</button><button type="submit" className="button button-primary" disabled={saving || !available}>{saving ? '참가 중…' : '참가 확정'}</button></footer>
  </form></DialogShell>;
}
