import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button, EmptyState, PageHeading, Panel, Status } from './common';
import { AccountOperationsApiError } from '../api/accountOperations';
import type {
  AccountOperationsClient, OperatorCaseDetail, OperatorCaseSummary, UserCaseType, UserCaseView,
} from '../api/accountOperations';

type AsyncState<T> = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'error'; error: AccountOperationsApiError };
const error = (value: unknown) => value instanceof AccountOperationsApiError
  ? value : new AccountOperationsApiError(0, 'NETWORK_ERROR', null);

export function UserCasePanel({ client, createIdempotencyKey = () => crypto.randomUUID() }: {
  client: AccountOperationsClient;
  createIdempotencyKey?: () => string;
}) {
  const [type, setType] = useState<UserCaseType>('INQUIRY');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [caseId, setCaseId] = useState('');
  const [state, setState] = useState<AsyncState<UserCaseView>>({ kind: 'idle' });

  const submit = async () => {
    setState({ kind: 'loading' });
    try {
      const value = await client.submitCase({ type, subject: subject.trim(), description: description.trim(), evidence: [] }, createIdempotencyKey());
      setCaseId(value.id);
      setState({ kind: 'ready', value });
    } catch (cause) { setState({ kind: 'error', error: error(cause) }); }
  };
  const reload = async () => {
    if (!caseId.trim()) return;
    setState({ kind: 'loading' });
    try { setState({ kind: 'ready', value: await client.userCase(caseId.trim()) }); }
    catch (cause) { setState({ kind: 'error', error: error(cause) }); }
  };

  return <Panel className="span-2 case-api-panel" title="문의 · 신고 · 이의 제기" subtitle="접수 결과와 추적 번호는 서버 응답으로만 확정됩니다.">
    <div className="settings-fields case-api-form">
      <label><span>유형</span><select aria-label="케이스 유형" value={type} onChange={(event) => setType(event.target.value as UserCaseType)}>
        <option value="INQUIRY">문의</option><option value="REPORT">신고</option><option value="APPEAL">이의 제기</option>
      </select></label>
      <label><span>제목</span><input aria-label="케이스 제목" value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
      <label className="span-2"><span>설명</span><textarea aria-label="케이스 설명" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    </div>
    <div className="account-api-actions">
      <Button kind="primary" disabled={!subject.trim() || !description.trim() || state.kind === 'loading'} onClick={submit}>접수하기</Button>
      <input aria-label="케이스 추적 번호" placeholder="case id" value={caseId} onChange={(event) => setCaseId(event.target.value)} />
      <Button disabled={!caseId.trim() || state.kind === 'loading'} onClick={reload}><RefreshCw size={14} />상태 확인</Button>
    </div>
    {state.kind === 'loading' && <div role="status" className="case-api-feedback"><LoaderCircle size={16} />서버 응답을 기다리는 중입니다.</div>}
    {state.kind === 'error' && <CaseError error={state.error} retry={caseId.trim() ? reload : submit} />}
    {state.kind === 'ready' && <div className="case-api-receipt" role="status">
      <CheckCircle2 size={17} /><div><strong>{state.value.status}</strong><span>추적 번호 {state.value.id} · 버전 {state.value.version}</span></div>
    </div>}
  </Panel>;
}

export function OperatorCaseWorkspace({ client, createIdempotencyKey = () => crypto.randomUUID() }: {
  client: AccountOperationsClient;
  createIdempotencyKey?: () => string;
}) {
  const [queue, setQueue] = useState<AsyncState<OperatorCaseSummary[]>>({ kind: 'loading' });
  const [detail, setDetail] = useState<AsyncState<OperatorCaseDetail>>({ kind: 'idle' });
  const [reasonCode, setReasonCode] = useState('REVIEW_COMPLETED');
  const [pendingAction, setPendingAction] = useState<'START_REVIEW' | 'RESOLVE' | 'REJECT' | null>(null);
  const [commandState, setCommandState] = useState<{ kind: 'idle' | 'processing' } | { kind: 'succeeded'; code: string; correlationId: string } | { kind: 'error'; error: AccountOperationsApiError }>({ kind: 'idle' });
  const loadQueue = async () => {
    setQueue({ kind: 'loading' });
    try {
      const page = await client.operatorCaseQueue({ types: ['INQUIRY', 'REPORT', 'APPEAL'], statuses: ['OPEN', 'NEEDS_INFORMATION', 'UNDER_REVIEW'] });
      setQueue({ kind: 'ready', value: page.items });
    } catch (cause) { setQueue({ kind: 'error', error: error(cause) }); }
  };
  useEffect(() => { void loadQueue(); }, [client]);
  const select = async (caseId: string) => {
    setDetail({ kind: 'loading' });
    try { setDetail({ kind: 'ready', value: await client.operatorCase(caseId) }); }
    catch (cause) { setDetail({ kind: 'error', error: error(cause) }); }
  };
  const command = async () => {
    if (detail.kind !== 'ready' || pendingAction === null) return;
    const current = detail.value;
    const action = pendingAction;
    setCommandState({ kind: 'processing' });
    try {
      const receipt = await client.commandCase(current.caseId, action, { expectedVersion: current.version, reasonCode }, createIdempotencyKey());
      setDetail({ kind: 'ready', value: await client.operatorCase(current.caseId) });
      await loadQueue();
      setPendingAction(null);
      setCommandState({ kind: 'succeeded', code: receipt.code, correlationId: receipt.correlationId });
    } catch (cause) { setCommandState({ kind: 'error', error: error(cause) }); }
  };

  return <div className="page narrow-page operator-case-page">
    <PageHeading eyebrow="OPERATIONS" title="운영 케이스" description="권한이 확인된 운영자만 대기열을 조회하고 상태를 변경할 수 있습니다." />
    <div className="settings-grid">
      <Panel title="처리 대기열" action={<Button onClick={loadQueue}><RefreshCw size={14} />새로고침</Button>}>
        {queue.kind === 'loading' && <div role="status"><LoaderCircle size={16} /> 불러오는 중</div>}
        {queue.kind === 'error' && <CaseError error={queue.error} retry={loadQueue} />}
        {queue.kind === 'ready' && queue.value.length === 0 && <EmptyState icon={ShieldCheck} title="처리할 케이스가 없습니다." detail="현재 필터에 열린 케이스가 없습니다." />}
        {queue.kind === 'ready' && queue.value.map((item) => <button className="operator-case-row" key={item.caseId} onClick={() => select(item.caseId)}>
          <span><strong>{item.type}</strong><small>{item.caseId}</small></span><Status>{item.status}</Status>
        </button>)}
      </Panel>
      <Panel title="케이스 상세">
        {detail.kind === 'idle' && <EmptyState icon={ShieldCheck} title="케이스를 선택하세요." detail="대기열에서 한 건을 선택하면 검증된 증거와 현재 버전을 표시합니다." />}
        {detail.kind === 'loading' && <div role="status"><LoaderCircle size={16} /> 처리 중</div>}
        {detail.kind === 'error' && <CaseError error={detail.error} />}
        {detail.kind === 'ready' && <div className="operator-case-detail">
          <div><strong>{detail.value.type} · {detail.value.status}</strong><span>버전 {detail.value.version}</span></div>
          <label><span>사유 코드</span><input aria-label="운영 사유 코드" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} /></label>
          <div className="account-api-actions">
            <Button disabled={!reasonCode.trim() || commandState.kind === 'processing'} onClick={() => setPendingAction('START_REVIEW')}>검토 시작</Button>
            <Button disabled={!reasonCode.trim() || commandState.kind === 'processing'} onClick={() => setPendingAction('RESOLVE')}>해결</Button>
            <Button disabled={!reasonCode.trim() || commandState.kind === 'processing'} onClick={() => setPendingAction('REJECT')}>기각</Button>
          </div>
          {pendingAction && <div className="case-api-confirm" role="alertdialog" aria-label="운영 명령 확인">
            <strong>{pendingAction} 명령을 실행할까요?</strong><span>현재 버전 {detail.value.version}에만 적용되며, 사유 코드는 감사 기록에 남습니다.</span>
            <div className="account-api-actions"><Button kind="primary" disabled={commandState.kind === 'processing'} onClick={() => void command()}>확인 후 실행</Button><Button disabled={commandState.kind === 'processing'} onClick={() => setPendingAction(null)}>취소</Button></div>
          </div>}
          {commandState.kind === 'processing' && <div role="status"><LoaderCircle size={16} /> 명령 처리 중</div>}
          {commandState.kind === 'succeeded' && <div className="case-api-receipt" role="status"><CheckCircle2 size={17} /><div><strong>{commandState.code}</strong><small>문의 코드 {commandState.correlationId}</small></div></div>}
          {commandState.kind === 'error' && <CaseError error={commandState.error} />}
          <small>증거 {detail.value.evidence.length}건 · 소유권 검증 결과는 서버 응답만 표시합니다.</small>
        </div>}
      </Panel>
    </div>
  </div>;
}

function CaseError({ error, retry }: { error: AccountOperationsApiError; retry?: () => void | Promise<void> }) {
  const message = error.permissionDenied ? '이 작업에 필요한 로그인 또는 운영 권한이 없습니다.'
    : error.conflict ? '다른 변경이 먼저 반영되었습니다. 최신 상태를 다시 불러오세요.'
      : error.retryable ? '일시적으로 서버에 연결할 수 없습니다.' : '요청을 처리하지 못했습니다.';
  return <div className="case-api-error" role="alert"><AlertTriangle size={17} /><div><strong>{message}</strong><span>{error.code}</span>{error.correlationId && <small>문의 코드 {error.correlationId}</small>}</div>{retry && <Button onClick={() => void retry()}>다시 시도</Button>}</div>;
}
