import { useEffect, useState } from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import type { CompetitionRoomsClient, CreateOfficialRoomInput, OperatorRoomView, RoomInputCatalog } from '../api/competitionRooms';
import { CompetitionApiError } from '../api/competitionRooms';
import type { StrategyReleaseInputs } from '../api/strategies';
import { formatDateTimeLocal, zonedLocalToIso } from '../lib/zonedDateTime';
import { Button, EmptyState, ErrorState, PageHeading, Panel, Status } from './common';

type Load<T> = { kind: 'idle' | 'loading' } | { kind: 'ready'; value: T } | { kind: 'error'; error: unknown };

const futureLocal = (days: number, timezone: string) => formatDateTimeLocal(new Date(Date.now() + days * 86_400_000), timezone);
const message = (cause: unknown) => cause instanceof CompetitionApiError
  ? `${cause.code ?? cause.status}${cause.detail ? ` · ${cause.detail}` : ''}`
  : cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다.';

export function OperatorCompetitionWorkspace({ client }: { client: CompetitionRoomsClient }) {
  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState<Load<OperatorRoomView>>({ kind: 'idle' });
  const [catalog, setCatalog] = useState<Load<{ room: RoomInputCatalog; release: StrategyReleaseInputs }>>({ kind: 'loading' });
  const [pending, setPending] = useState<'CANCEL' | 'INVALIDATE' | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [reasonCode, setReasonCode] = useState('OPERATOR_REQUEST');
  const [actionState, setActionState] = useState<Load<string>>({ kind: 'idle' });
  const [createState, setCreateState] = useState<Load<string>>({ kind: 'idle' });
  const [timezone, setTimezone] = useState('Asia/Seoul');
  const [templateId, setTemplateId] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([client.roomInputCatalog(controller.signal), client.strategyReleaseInputs(controller.signal)])
      .then(([roomInputs, release]) => { setCatalog({ kind: 'ready', value: { room: roomInputs, release } }); setTemplateId(roomInputs.scoringTemplates[0]?.id ?? ''); })
      .catch((error) => { if ((error as { name?: string }).name !== 'AbortError') setCatalog({ kind: 'error', error }); });
    return () => controller.abort();
  }, [client]);

  const loadRoom = async (id = roomId.trim()) => {
    if (!id) return;
    setRoom({ kind: 'loading' });
    try { setRoom({ kind: 'ready', value: await client.operatorRoom(id) }); }
    catch (error) { setRoom({ kind: 'error', error }); }
  };
  const terminate = async () => {
    if (!pending || room.kind !== 'ready') return;
    setActionState({ kind: 'loading' });
    try {
      const result = pending === 'CANCEL'
        ? await client.cancelOperatorRoom(room.value.room.roomId, reasonCode.trim())
        : await client.invalidateOperatorRoom(room.value.room.roomId, reasonCode.trim());
      setActionState({ kind: 'ready', value: `${result.participationsTerminated}개 참가 종료 · ${result.occurredAt}` });
      setPending(null); setConfirmation('');
      await loadRoom(room.value.room.roomId);
    } catch (error) { setActionState({ kind: 'error', error }); }
  };

  const createOfficial = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (catalog.kind !== 'ready') return;
    const form = new FormData(event.currentTarget);
    setCreateState({ kind: 'loading' });
    try {
      const schedule = {
        recruitmentOpensAt: zonedLocalToIso(String(form.get('recruitmentOpensAt')), timezone),
        participationOpensAt: zonedLocalToIso(String(form.get('participationOpensAt')), timezone),
        participationClosesAt: zonedLocalToIso(String(form.get('participationClosesAt')), timezone),
        evaluationStartsAt: zonedLocalToIso(String(form.get('evaluationStartsAt')), timezone),
        evaluationEndsAt: zonedLocalToIso(String(form.get('evaluationEndsAt')), timezone),
        finalizationDeadlineAt: zonedLocalToIso(String(form.get('finalizationDeadlineAt')), timezone),
      };
      if (!(schedule.recruitmentOpensAt <= schedule.participationOpensAt
        && schedule.participationOpensAt < schedule.participationClosesAt
        && schedule.participationClosesAt < schedule.evaluationStartsAt
        && schedule.evaluationStartsAt < schedule.evaluationEndsAt
        && schedule.evaluationEndsAt <= schedule.finalizationDeadlineAt)) throw new Error('대회 일정의 시간 순서를 확인하세요.');
      const template = catalog.value.room.scoringTemplates.find((item) => item.id === templateId);
      const exchangeMics = form.getAll('exchangeMics').map(String);
      const marketScope = exchangeMics.length ? { market: 'US', exchangeMics } : { market: 'US' };
      const input: CreateOfficialRoomInput = {
        name: String(form.get('name')).trim(), accessType: String(form.get('accessType')) as CreateOfficialRoomInput['accessType'],
        scoringTemplateVersionId: templateId,
        scoringAdjustments: Object.fromEntries((template?.adjustments ?? []).map((item) => [item.code, Number(form.get(`adjustment:${item.code}`))])),
        initialCashAmount: Number(form.get('initialCashAmount')), botParticipationLimit: Number(form.get('botParticipationLimit')),
        perAccountBotLimit: Number(form.get('perAccountBotLimit')), stoppedBotSlotPolicy: String(form.get('stoppedBotSlotPolicy')),
        minimumOperationSeconds: Number(form.get('minimumOperationSeconds')), minimumFillCount: Number(form.get('minimumFillCount')),
        feePolicyId: String(form.get('feePolicyId')), buyingPowerBufferPolicyId: String(form.get('buyingPowerBufferPolicyId')),
        eligibilityCriteria: { minimumAccountAgeDays: Number(form.get('minimumAccountAgeDays')), minimumAccountState: 'ACTIVE' }, marketScope,
        precisionRulesVersion: String(form.get('precisionRulesVersion')), ...schedule, timezoneName: timezone,
      } as CreateOfficialRoomInput;
      const result = await client.createOfficialRoom(input);
      setCreateState({ kind: 'ready', value: result.id });
      setRoomId(result.id); await loadRoom(result.id);
    } catch (error) { setCreateState({ kind: 'error', error }); }
  };

  return <div className="page narrow-page operator-competition-page">
    <PageHeading eyebrow="OPERATIONS · COMPETITION" title="공식 대회 운영" description="공식 대회 생성, 감사 조회, 취소와 결과 무효화를 서버 권한 경계 안에서 실행합니다." />
    <div className="settings-grid">
      <Panel className="span-2" title="대회 감사 조회">
        <form className="account-api-actions" onSubmit={(event) => { event.preventDefault(); void loadRoom(); }}><input aria-label="Operator competition room ID" placeholder="room UUID" value={roomId} onChange={(event) => setRoomId(event.target.value)} /><Button kind="primary" disabled={!roomId.trim() || room.kind === 'loading'}>조회</Button></form>
        {room.kind === 'idle' && <EmptyState icon={ShieldCheck} title="대회 ID를 입력하세요." />}
        {room.kind === 'loading' && <p role="status"><LoaderCircle size={16} /> 대회 감사 기록을 불러오는 중입니다.</p>}
        {room.kind === 'error' && <ErrorState title="대회를 조회하지 못했습니다." detail={message(room.error)} onRetry={() => void loadRoom()} />}
        {room.kind === 'ready' && <div className="operator-room-audit">
          <p><strong>{room.value.room.name}</strong> <Status>{room.value.room.status}</Status> · {room.value.room.accessType} · rules {room.value.room.rulesHash}</p>
          <p>평가 {room.value.room.evaluationStartsAt} ~ {room.value.room.evaluationEndsAt}</p>
          <details><summary>방 이벤트 {room.value.roomEvents.length}건</summary><ol>{room.value.roomEvents.map((item) => <li key={item.sequence}>{item.sequence}. {item.eventType} → {item.resultingStatus} · {item.reasonCode ?? '사유 없음'} · {item.occurredAt}</li>)}</ol></details>
          <details><summary>참가 이벤트 {room.value.participationEvents.length}건</summary><ol>{room.value.participationEvents.map((item) => <li key={`${item.anonymousAlias}:${item.sequence}`}>{item.anonymousAlias} · {item.eventType} · {item.reasonCode ?? '사유 없음'}</li>)}</ol></details>
          {room.value.finalResult ? <details><summary>최종 결과 {room.value.finalResult.entries.length}건</summary><ol>{room.value.finalResult.entries.map((item) => <li key={item.provenanceHash}>{item.rank ?? '-'}위 {item.anonymousAlias} · {item.score ?? '-'} · {item.eligibilityStatus}</li>)}</ol></details> : <p>확정된 최종 결과가 없습니다.</p>}
          <label>사유 코드<input aria-label="Operator competition reason code" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} /></label>
          <div className="account-api-actions"><Button disabled={!reasonCode.trim()} onClick={() => { setPending('CANCEL'); setConfirmation(''); }}>대회 취소</Button><Button disabled={!reasonCode.trim()} onClick={() => { setPending('INVALIDATE'); setConfirmation(''); }}>결과 무효화</Button></div>
          {pending && <div role="alertdialog" aria-label="Confirm operator competition action" className="case-api-confirm"><strong>{pending} 작업을 실행할까요?</strong><label>확인을 위해 {pending} 입력<input aria-label={`Type ${pending} to confirm`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><div className="account-api-actions"><Button kind="primary" disabled={confirmation !== pending || actionState.kind === 'loading'} onClick={() => void terminate()}>확인 후 실행</Button><Button onClick={() => setPending(null)}>취소</Button></div></div>}
          {actionState.kind === 'ready' && <p role="status">{actionState.value}</p>}{actionState.kind === 'error' && <ErrorState title="운영 명령을 처리하지 못했습니다." detail={message(actionState.error)} />}
        </div>}
      </Panel>
      <Panel className="span-2" title="공식 대회 생성" subtitle="입력 카탈로그와 전략 실행 정책의 현재 버전만 사용합니다.">
        {catalog.kind === 'loading' && <p role="status">공식 대회 입력 정책을 불러오는 중입니다.</p>}
        {catalog.kind === 'error' && <ErrorState title="공식 대회 입력 정책을 불러오지 못했습니다." detail={message(catalog.error)} />}
        {catalog.kind === 'ready' && <form className="competition-api-form" onSubmit={createOfficial}>
          <div className="competition-api-form-grid"><label>대회 이름<input name="name" aria-label="Official room name" required /></label><label>접근 방식<select name="accessType" aria-label="Official room access"><option value="PUBLIC">PUBLIC</option><option value="SECRET">SECRET</option></select></label><label>초기 자금<input name="initialCashAmount" type="number" min="1" defaultValue="10000" required /></label><label>전체 봇 한도<input name="botParticipationLimit" type="number" min="1" defaultValue="100" required /></label><label>계정별 봇 한도<input name="perAccountBotLimit" type="number" min="1" defaultValue="2" required /></label><label>중지 봇 슬롯<select name="stoppedBotSlotPolicy"><option value="RELEASE_SLOT">RELEASE_SLOT</option><option value="KEEP_SLOT">KEEP_SLOT</option></select></label><label>최소 운용 초<input name="minimumOperationSeconds" type="number" min="0" defaultValue="0" required /></label><label>최소 체결 수<input name="minimumFillCount" type="number" min="0" defaultValue="0" required /></label></div>
          <div className="competition-api-form-grid"><label>채점 템플릿<select name="scoringTemplateVersionId" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{catalog.value.room.scoringTemplates.map((item) => <option key={item.id} value={item.id}>{item.templateCode} · {item.version}</option>)}</select></label><label>수수료 정책<select name="feePolicyId">{catalog.value.room.feePolicies.map((item) => <option key={item.id} value={item.id}>{item.policyCode} · {item.version}</option>)}</select></label><label>구매력 버퍼 정책<select name="buyingPowerBufferPolicyId">{catalog.value.room.buyingPowerBufferPolicies.map((item) => <option key={item.id} value={item.id}>{item.policyCode} · {item.version}</option>)}</select></label><label>정밀도 규칙<select name="precisionRulesVersion">{catalog.value.release.executionPolicies.map((item) => <option key={item.version} value={item.precisionRulesVersion}>{item.version} · {item.precisionRulesVersion}</option>)}</select></label></div>
          {catalog.value.room.scoringTemplates.find((item) => item.id === templateId)?.adjustments.map((item) => <label key={item.code}>{item.code}<input name={`adjustment:${item.code}`} type="number" min={item.minimum} max={item.maximum} step={10 ** -item.scale} defaultValue={item.minimum} required /></label>)}
          <div className="competition-api-form-grid">
            <label>최소 계정 가입일<input name="minimumAccountAgeDays" aria-label="최소 계정 가입일" type="number" min="0" step="1" defaultValue="0" required /><small>가입 후 이 일수가 지난 활성 계정만 참가할 수 있습니다.</small></label>
            <fieldset><legend>허용 거래소</legend><p>선택하지 않으면 지원되는 미국 거래소 전체를 허용합니다.</p><label><input type="checkbox" name="exchangeMics" value="XNAS" /> NASDAQ</label><label><input type="checkbox" name="exchangeMics" value="XNYS" /> NYSE</label><label><input type="checkbox" name="exchangeMics" value="ARCX" /> NYSE Arca</label><label><input type="checkbox" name="exchangeMics" value="BATS" /> Cboe BZX</label></fieldset>
            <label>표시 시간대<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option>Asia/Seoul</option><option>UTC</option><option>America/New_York</option></select></label>
          </div>
          <div className="competition-api-form-grid"><label>모집 시작<input name="recruitmentOpensAt" type="datetime-local" defaultValue={futureLocal(0, timezone)} required /></label><label>참가 시작<input name="participationOpensAt" type="datetime-local" defaultValue={futureLocal(1, timezone)} required /></label><label>참가 마감<input name="participationClosesAt" type="datetime-local" defaultValue={futureLocal(3, timezone)} required /></label><label>평가 시작<input name="evaluationStartsAt" type="datetime-local" defaultValue={futureLocal(4, timezone)} required /></label><label>평가 종료<input name="evaluationEndsAt" type="datetime-local" defaultValue={futureLocal(10, timezone)} required /></label><label>최종 확정 시한<input name="finalizationDeadlineAt" type="datetime-local" defaultValue={futureLocal(11, timezone)} required /></label></div>
          <Button kind="primary" disabled={!templateId || !catalog.value.release.executionPolicies.length || createState.kind === 'loading'}>{createState.kind === 'loading' ? '생성 중' : '공식 대회 생성'}</Button>
          {createState.kind === 'ready' && <p role="status">공식 대회 {createState.value}가 생성되었습니다.</p>}{createState.kind === 'error' && <ErrorState title="공식 대회를 생성하지 못했습니다." detail={message(createState.error)} />}
        </form>}
      </Panel>
    </div>
  </div>;
}
