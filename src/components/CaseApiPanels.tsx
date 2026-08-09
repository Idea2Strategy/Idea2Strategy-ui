import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, Clock3, Inbox, LoaderCircle, RefreshCw, Send, ShieldCheck, X } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeading, Panel, SignInRequiredState, Status } from './common';
import { AccountOperationsApiError } from '../api/accountOperations';
import type {
  AccountOperationsClient, OperatorCaseAction, OperatorCaseDetail, OperatorCaseSummary, SanctionType,
  UserCaseDetail, UserCasePage, UserCaseStatus, UserCaseType, UserCaseView,
} from '../api/accountOperations';

type AsyncState<T> = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'error'; error: AccountOperationsApiError };
const error = (value: unknown) => value instanceof AccountOperationsApiError
  ? value : new AccountOperationsApiError(0, 'NETWORK_ERROR', null);

export function UserCaseForm({ client, createIdempotencyKey = () => crypto.randomUUID(), onSubmitted }: {
  client: AccountOperationsClient;
  createIdempotencyKey?: () => string;
  onSubmitted?: (value: UserCaseView) => void;
}) {
  const [type, setType] = useState<UserCaseType>('INQUIRY');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [state, setState] = useState<AsyncState<UserCaseView>>({ kind: 'idle' });
  const retrySubmit = useRef<(() => void) | null>(null);

  const submit = async (retryKey?: string) => {
    setState({ kind: 'loading' });
    const idempotencyKey = retryKey ?? createIdempotencyKey();
    try {
      const value = await client.submitCase({ type, subject: subject.trim(), description: description.trim(), evidence: [] }, idempotencyKey);
      retrySubmit.current = null;
      setState({ kind: 'ready', value });
      setSubject('');
      setDescription('');
      onSubmitted?.(value);
    } catch (cause) {
      const failure = error(cause);
      setState({ kind: 'error', error: failure });
      retrySubmit.current = failure.retryable ? () => void submit(idempotencyKey) : null;
    }
  };
  return <section className="customer-case-compose" aria-labelledby="customer-case-compose-title">
      <div className="customer-case-section-heading"><div><span>새 문의</span><h3 id="customer-case-compose-title">무엇을 도와드릴까요?</h3></div><Send size={18} aria-hidden="true" /></div>
      <div className="settings-fields case-api-form">
      <label><span>유형</span><select aria-label="문의 유형" value={type} onChange={(event) => setType(event.target.value as UserCaseType)}>
        <option value="INQUIRY">문의</option><option value="REPORT">신고</option><option value="APPEAL">이의 제기</option>
      </select></label>
      <label><span>제목</span><input aria-label="문의 제목" placeholder="문의 내용을 한 줄로 알려주세요" value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
      <label className="span-2"><span>상세 내용</span><textarea aria-label="문의 내용" placeholder="확인이 필요한 내용을 자세히 적어주세요" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    </div>
    <div className="account-api-actions">
      <Button kind="primary" disabled={!subject.trim() || !description.trim() || state.kind === 'loading'} onClick={() => { retrySubmit.current = null; void submit(); }}>접수하기</Button>
    </div>
    {state.kind === 'loading' && <div role="status" className="case-api-feedback"><LoaderCircle size={16} />문의를 접수하고 있습니다.</div>}
    {state.kind === 'error' && <CaseError error={state.error} retry={retrySubmit.current ?? undefined} />}
    {state.kind === 'ready' && <div className="case-api-receipt" role="status">
      <CheckCircle2 size={17} /><div><strong>문의가 접수되었습니다.</strong><span>답변과 처리 상태는 마이페이지의 문의 내역에서 확인할 수 있습니다.</span></div>
    </div>}
    </section>;
}

export function UserCasePanel({ client, refreshKey = 0, onCreate }: {
  client: AccountOperationsClient;
  refreshKey?: number;
  onCreate?: () => void;
}) {
  const [list, setList] = useState<AsyncState<UserCasePage>>({ kind: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [detail, setDetail] = useState<AsyncState<UserCaseDetail>>({ kind: 'idle' });

  const loadCases = async (cursor?: string, append = false) => {
    if (append) setLoadingMore(true); else setList({ kind: 'loading' });
    try {
      const page = await client.userCases(cursor ?? null, 10);
      setList((current) => ({
        kind: 'ready',
        value: {
          items: append && current.kind === 'ready' ? [...current.value.items, ...page.items] : page.items,
          nextCursor: page.nextCursor,
        },
      }));
    } catch (cause) {
      if (!append) setList({ kind: 'error', error: error(cause) });
    } finally {
      setLoadingMore(false);
    }
  };
  useEffect(() => { void loadCases(); }, [client, refreshKey]);

  const openDetail = async (id: string) => {
    setDetail({ kind: 'loading' });
    try { setDetail({ kind: 'ready', value: await client.userCase(id) }); }
    catch (cause) { setDetail({ kind: 'error', error: error(cause) }); }
  };

  return <Panel
    className="span-2 case-api-panel customer-case-panel"
    title="문의 내역"
    subtitle="작성한 문의와 고객지원팀의 답변을 확인하세요."
    action={onCreate ? <Button kind="primary" onClick={onCreate}>문의하기</Button> : undefined}
  >
    <section className="customer-case-list-section" aria-label="내가 작성한 문의">
      {list.kind === 'loading' && <div className="customer-case-list-state" role="status"><LoaderCircle size={17} />문의 내역을 불러오고 있습니다.</div>}
      {list.kind === 'error' && <CaseError error={list.error} retry={loadCases} />}
      {list.kind === 'ready' && list.value.items.length === 0 && <EmptyState icon={Inbox} title="아직 작성한 문의가 없습니다." detail="궁금한 점이 생기면 문의하기 버튼으로 내용을 남겨주세요." />}
      {list.kind === 'ready' && list.value.items.length > 0 && <div className="customer-case-list">{list.value.items.map((item) => <button
        type="button"
        key={item.id}
        aria-label={`${item.subject} 상세 보기`}
        onClick={() => void openDetail(item.id)}
      ><span className="customer-case-list-copy"><span><strong>{item.subject}</strong><Status tone={caseStatusTone(item.status)}>{caseStatusLabel(item.status)}</Status></span><small>{caseTypeLabel(item.type)} · {formatCaseDate(item.updatedAt)}</small></span><ChevronRight size={17} aria-hidden="true" /></button>)}</div>}
      {list.kind === 'ready' && list.value.nextCursor && <div className="customer-case-more"><Button disabled={loadingMore} onClick={() => void loadCases(list.value.nextCursor ?? undefined, true)}>{loadingMore ? '불러오는 중' : '이전 문의 더 보기'}</Button></div>}
    </section>
    {detail.kind !== 'idle' && <div className="customer-case-detail-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setDetail({ kind: 'idle' }); }}>
      <section className="customer-case-detail-modal" role="dialog" aria-modal="true" aria-labelledby="customer-case-detail-title">
        <header><div><span>문의 상세</span><h3 id="customer-case-detail-title">{detail.kind === 'ready' ? detail.value.subject : '문의 내용을 불러오는 중'}</h3></div><button type="button" aria-label="문의 상세 닫기" onClick={() => setDetail({ kind: 'idle' })}><X size={18} /></button></header>
        {detail.kind === 'loading' && <div className="customer-case-detail-state" role="status"><LoaderCircle size={18} />문의 내용을 불러오고 있습니다.</div>}
        {detail.kind === 'error' && <div className="customer-case-detail-state"><CaseError error={detail.error} /></div>}
        {detail.kind === 'ready' && <div className="customer-case-detail-body">
          <div className="customer-case-detail-meta"><Status tone={caseStatusTone(detail.value.status)}>{caseStatusLabel(detail.value.status)}</Status><span>{caseTypeLabel(detail.value.type)}</span><time>{formatCaseDate(detail.value.createdAt)}</time></div>
          <section><h4>문의 내용</h4><p>{detail.value.description}</p></section>
          {detail.value.responseDeadlineAt && <div className="customer-case-deadline"><Clock3 size={16} /><span>추가 정보는 {formatCaseDate(detail.value.responseDeadlineAt)}까지 보내주세요.</span></div>}
          <section><h4>처리 내역</h4><ol className="customer-case-timeline">{detail.value.history.map((entry, index) => <li key={`${entry.createdAt}-${index}`}><i /><div><span><strong>{entry.actor === 'CUSTOMER' ? '나' : entry.actor === 'SUPPORT' ? '고객지원팀' : '서비스 안내'}</strong><time>{formatCaseDate(entry.createdAt)}</time></span><p>{entry.message}</p></div></li>)}</ol></section>
        </div>}
      </section>
    </div>}
  </Panel>;
}

const caseStatusLabels: Record<UserCaseStatus, string> = {
  OPEN: '접수됨', NEEDS_INFORMATION: '추가 정보 필요', UNDER_REVIEW: '검토 중', RESOLVED: '처리 완료', REJECTED: '처리 종료',
};
function caseStatusLabel(status: UserCaseStatus) { return caseStatusLabels[status]; }
function caseStatusTone(status: UserCaseStatus): 'neutral' | 'warning' | 'positive' {
  if (status === 'RESOLVED') return 'positive';
  if (status === 'NEEDS_INFORMATION' || status === 'REJECTED') return 'warning';
  return 'neutral';
}
function caseTypeLabel(type: UserCaseType) { return ({ INQUIRY: '일반 문의', REPORT: '신고', APPEAL: '이의 제기' } as const)[type]; }
function formatCaseDate(value: string) { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

const HIGH_RISK_ACTIONS = new Set<OperatorCaseAction>(['RESOLVE', 'REJECT', 'APPLY_SANCTION', 'RELEASE_SANCTION']);

export function OperatorCaseWorkspace({ client, createIdempotencyKey = () => crypto.randomUUID(), createSanctionId = () => crypto.randomUUID() }: {
  client: AccountOperationsClient;
  createIdempotencyKey?: () => string;
  createSanctionId?: () => string;
}) {
  const [queue, setQueue] = useState<AsyncState<{ items: OperatorCaseSummary[]; nextCursor: string | null }>>({ kind: 'loading' });
  const [queueMoreLoading, setQueueMoreLoading] = useState(false);
  const [detail, setDetail] = useState<AsyncState<OperatorCaseDetail>>({ kind: 'idle' });
  const [reasonCode, setReasonCode] = useState('REVIEW_COMPLETED');
  const [customerMessage, setCustomerMessage] = useState('');
  const [assigneeOperatorId, setAssigneeOperatorId] = useState('');
  const [sanctionId, setSanctionId] = useState('');
  const [sanctionType, setSanctionType] = useState<SanctionType>('SUSPENSION');
  const [sanctionExpiresAt, setSanctionExpiresAt] = useState('');
  const [expectedSanctionVersion, setExpectedSanctionVersion] = useState('0');
  const [confirmation, setConfirmation] = useState('');
  const [pendingAction, setPendingAction] = useState<OperatorCaseAction | null>(null);
  const [commandState, setCommandState] = useState<{ kind: 'idle' | 'processing' } | { kind: 'succeeded'; code: string; correlationId: string } | { kind: 'error'; error: AccountOperationsApiError }>({ kind: 'idle' });
  const loadQueue = async (cursor?: string, append = false) => {
    if (append) setQueueMoreLoading(true); else setQueue({ kind: 'loading' });
    try {
      const page = await client.operatorCaseQueue({ types: ['INQUIRY', 'REPORT', 'APPEAL'], statuses: ['OPEN', 'NEEDS_INFORMATION', 'UNDER_REVIEW'], cursor });
      setQueue((current) => ({ kind: 'ready', value: { items: append && current.kind === 'ready' ? [...current.value.items, ...page.items] : page.items, nextCursor: page.nextCursor } }));
    } catch (cause) { if (!append) setQueue({ kind: 'error', error: error(cause) }); }
    finally { setQueueMoreLoading(false); }
  };
  useEffect(() => { void loadQueue(); }, [client]);
  const select = async (caseId: string) => {
    setPendingAction(null);
    setConfirmation('');
    setCommandState({ kind: 'idle' });
    setDetail({ kind: 'loading' });
    try { setDetail({ kind: 'ready', value: await client.operatorCase(caseId) }); }
    catch (cause) { setDetail({ kind: 'error', error: error(cause) }); }
  };
  const command = async () => {
    if (detail.kind !== 'ready' || pendingAction === null) return;
    const current = detail.value;
    const action = pendingAction;
    const common = {
      expectedVersion: current.version,
      reasonCode: reasonCode.trim(),
      ...(action === 'REQUEST_INFORMATION' || action === 'RESOLVE' || action === 'REJECT'
        ? { customerMessage: customerMessage.trim() }
        : {}),
    };
    const input = action === 'ASSIGN' || action === 'REASSIGN'
      ? { ...common, assigneeOperatorId: assigneeOperatorId.trim() }
      : action === 'APPLY_SANCTION'
        ? { ...common, sanctionId: sanctionId || createSanctionId(), sanctionType, sanctionExpiresAt: sanctionExpiresAt ? new Date(sanctionExpiresAt).toISOString() : null, expectedSanctionVersion: Number(expectedSanctionVersion) }
        : action === 'RELEASE_SANCTION'
          ? { ...common, sanctionId: sanctionId.trim(), expectedSanctionVersion: Number(expectedSanctionVersion) }
          : common;
    setCommandState({ kind: 'processing' });
    try {
      const receipt = await client.commandCase(current.caseId, action, input, createIdempotencyKey());
      setDetail({ kind: 'ready', value: await client.operatorCase(current.caseId) });
      await loadQueue();
      setPendingAction(null);
      setConfirmation('');
      setCommandState({ kind: 'succeeded', code: receipt.code, correlationId: receipt.correlationId });
    } catch (cause) { setCommandState({ kind: 'error', error: error(cause) }); }
  };

  return <div className="page narrow-page operator-case-page">
    <PageHeading eyebrow="OPERATIONS" title="운영 케이스" description="권한이 확인된 운영자만 대기열을 조회하고 상태를 변경할 수 있습니다." />
    <div className="settings-grid">
      <Panel title="처리 대기열" action={<Button onClick={() => void loadQueue()}><RefreshCw size={14} />새로고침</Button>}>
        {queue.kind === 'loading' && <div role="status"><LoaderCircle size={16} /> 불러오는 중</div>}
        {queue.kind === 'error' && <CaseError operator error={queue.error} retry={loadQueue} />}
        {queue.kind === 'ready' && queue.value.items.length === 0 && <EmptyState icon={ShieldCheck} title="처리할 케이스가 없습니다." detail="현재 필터에 열린 케이스가 없습니다." />}
        {queue.kind === 'ready' && queue.value.items.map((item) => <button className="operator-case-row" key={item.caseId} onClick={() => select(item.caseId)}>
          <span><strong>{item.type}</strong><small>{item.caseId}</small></span><Status>{item.status}</Status>
        </button>)}
        {queue.kind === 'ready' && queue.value.nextCursor && <Button disabled={queueMoreLoading} onClick={() => void loadQueue(queue.value.nextCursor ?? undefined, true)}>{queueMoreLoading ? '불러오는 중' : '다음 케이스 불러오기'}</Button>}
      </Panel>
      <Panel title="케이스 상세">
        {detail.kind === 'idle' && <EmptyState icon={ShieldCheck} title="케이스를 선택하세요." detail="대기열에서 한 건을 선택하면 검증된 증거와 현재 버전을 표시합니다." />}
        {detail.kind === 'loading' && <div role="status"><LoaderCircle size={16} /> 처리 중</div>}
        {detail.kind === 'error' && <CaseError operator error={detail.error} />}
        {detail.kind === 'ready' && <div className="operator-case-detail">
          <div><strong>{detail.value.type} · {detail.value.status}</strong><span>버전 {detail.value.version}</span></div>
          <label><span>사유 코드</span><input aria-label="Operation reason code" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} /></label>
          <label><span>사용자에게 보일 안내</span><textarea aria-label="Customer-facing case response" placeholder="문의 상세 화면에 표시할 답변을 입력하세요" value={customerMessage} onChange={(event) => setCustomerMessage(event.target.value)} /></label>
          <label><span>담당 운영자 ID</span><input aria-label="Assignee operator ID" placeholder="operator UUID" value={assigneeOperatorId} onChange={(event) => setAssigneeOperatorId(event.target.value)} /></label>
          <div className="settings-fields case-api-form operator-command-fields">
            <label><span>제재 ID</span><input aria-label="Sanction ID" placeholder="적용 시 비워두면 새 UUID 생성" value={sanctionId} onChange={(event) => setSanctionId(event.target.value)} /></label>
            <label><span>제재 유형</span><select aria-label="Sanction type" value={sanctionType} onChange={(event) => setSanctionType(event.target.value as SanctionType)}><option value="SUSPENSION">SUSPENSION</option><option value="PERMANENT">PERMANENT</option></select></label>
            <label><span>제재 만료 시각</span><input aria-label="Sanction expiry" type="datetime-local" value={sanctionExpiresAt} onChange={(event) => setSanctionExpiresAt(event.target.value)} /></label>
            <label><span>현재 제재 버전</span><input aria-label="Expected sanction version" type="number" min="0" value={expectedSanctionVersion} onChange={(event) => setExpectedSanctionVersion(event.target.value)} /></label>
          </div>
          <div className="account-api-actions">
            <Button disabled={!reasonCode.trim() || commandState.kind === 'processing'} onClick={() => setPendingAction('START_REVIEW')}>검토 시작</Button>
            <Button aria-label="Assign case" disabled={!reasonCode.trim() || !assigneeOperatorId.trim() || commandState.kind === 'processing'} onClick={() => setPendingAction(detail.value.assigneeOperatorId ? 'REASSIGN' : 'ASSIGN')}>케이스 배정</Button>
            <Button aria-label="Unassign case" disabled={!reasonCode.trim() || !detail.value.assigneeOperatorId || commandState.kind === 'processing'} onClick={() => setPendingAction('UNASSIGN')}>배정 해제</Button>
            <Button aria-label="Request information" disabled={!reasonCode.trim() || !customerMessage.trim() || commandState.kind === 'processing'} onClick={() => setPendingAction('REQUEST_INFORMATION')}>정보 요청</Button>
            <Button disabled={!reasonCode.trim() || !customerMessage.trim() || commandState.kind === 'processing'} onClick={() => setPendingAction('RESOLVE')}>해결</Button>
            <Button disabled={!reasonCode.trim() || !customerMessage.trim() || commandState.kind === 'processing'} onClick={() => setPendingAction('REJECT')}>기각</Button>
            <Button aria-label="Apply sanction" disabled={!reasonCode.trim() || !validSanctionVersion(expectedSanctionVersion) || commandState.kind === 'processing'} onClick={() => { if (!sanctionId) setSanctionId(createSanctionId()); setPendingAction('APPLY_SANCTION'); }}>제재 적용</Button>
            <Button aria-label="Release sanction" disabled={!reasonCode.trim() || !sanctionId.trim() || !validSanctionVersion(expectedSanctionVersion) || commandState.kind === 'processing'} onClick={() => setPendingAction('RELEASE_SANCTION')}>제재 해제</Button>
          </div>
          {pendingAction && <div className="case-api-confirm" role="alertdialog" aria-label={HIGH_RISK_ACTIONS.has(pendingAction) ? 'Confirm high-risk operation' : '운영 명령 확인'}>
            <strong>{pendingAction} 명령을 실행할까요?</strong><span>현재 버전 {detail.value.version}에만 적용되며, 사유 코드는 감사 기록에 남습니다.</span>
            {HIGH_RISK_ACTIONS.has(pendingAction) && <label><span>확인을 위해 {pendingAction} 입력</span><input aria-label={`Type ${pendingAction} to confirm`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>}
            <div className="account-api-actions"><Button kind="primary" aria-label={HIGH_RISK_ACTIONS.has(pendingAction) ? 'Execute high-risk operation' : undefined} disabled={commandState.kind === 'processing' || (HIGH_RISK_ACTIONS.has(pendingAction) && confirmation !== pendingAction)} onClick={() => void command()}>확인 후 실행</Button><Button disabled={commandState.kind === 'processing'} onClick={() => { setPendingAction(null); setConfirmation(''); }}>취소</Button></div>
          </div>}
          {commandState.kind === 'processing' && <div role="status"><LoaderCircle size={16} /> 명령 처리 중</div>}
          {commandState.kind === 'succeeded' && <div className="case-api-receipt" role="status"><CheckCircle2 size={17} /><div><strong>{commandState.code}</strong><small>Correlation {commandState.correlationId}</small></div></div>}
          {commandState.kind === 'error' && <CaseError operator error={commandState.error} />}
          <small>증거 {detail.value.evidence.length}건 · 소유권 검증 결과는 서버 응답만 표시합니다.</small>
        </div>}
      </Panel>
    </div>
    <OperatorSanctionPanel client={client} createIdempotencyKey={createIdempotencyKey} createSanctionId={createSanctionId} />
  </div>;
}

export function OperatorSanctionPanel({ client, createIdempotencyKey = () => crypto.randomUUID(), createSanctionId = () => crypto.randomUUID() }: {
  client: AccountOperationsClient;
  createIdempotencyKey?: () => string;
  createSanctionId?: () => string;
}) {
  const [accountId, setAccountId] = useState('');
  const [sanctionId, setSanctionId] = useState('');
  const [type, setType] = useState<SanctionType>('SUSPENSION');
  const [reasonCode, setReasonCode] = useState('POLICY_VIOLATION');
  const [expiresAt, setExpiresAt] = useState('');
  const [sourceCaseId, setSourceCaseId] = useState('');
  const [expectedVersion, setExpectedVersion] = useState('0');
  const [pending, setPending] = useState<'APPLY' | 'LIFT' | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'processing' } | { kind: 'succeeded'; code: string; correlationId: string } | { kind: 'error'; error: AccountOperationsApiError }>({ kind: 'idle' });
  const validVersion = /^\d+$/.test(expectedVersion);

  const prepare = (action: 'APPLY' | 'LIFT') => {
    if (action === 'APPLY' && !sanctionId) setSanctionId(createSanctionId());
    setConfirmation('');
    setPending(action);
  };
  const execute = async () => {
    if (!pending) return;
    setState({ kind: 'processing' });
    try {
      const receipt = pending === 'APPLY'
        ? await client.applySanction(accountId.trim(), {
          sanctionId: sanctionId.trim(), type, reasonCode: reasonCode.trim(),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          sourceCaseId: sourceCaseId.trim() || null, expectedVersion: Number(expectedVersion),
        }, createIdempotencyKey())
        : await client.liftSanction(accountId.trim(), sanctionId.trim(), {
          reasonCode: reasonCode.trim(), expectedVersion: Number(expectedVersion),
        }, createIdempotencyKey());
      setPending(null);
      setConfirmation('');
      setState({ kind: 'succeeded', code: receipt.code, correlationId: receipt.correlationId });
    } catch (cause) { setState({ kind: 'error', error: error(cause) }); }
  };

  return <Panel className="operator-sanction-panel" title="계정 제재" subtitle="케이스 외 직접 제재도 서버의 현재 버전·권한·MFA 검증을 그대로 거칩니다.">
    <div className="settings-fields case-api-form">
      <label><span>계정 ID</span><input aria-label="Sanction account ID" value={accountId} onChange={(event) => setAccountId(event.target.value)} /></label>
      <label><span>제재 ID</span><input aria-label="Direct sanction ID" placeholder="적용 시 비워두면 새 UUID 생성" value={sanctionId} onChange={(event) => setSanctionId(event.target.value)} /></label>
      <label><span>유형</span><select aria-label="Direct sanction type" value={type} onChange={(event) => setType(event.target.value as SanctionType)}><option value="SUSPENSION">SUSPENSION</option><option value="PERMANENT">PERMANENT</option></select></label>
      <label><span>현재 집계 버전</span><input aria-label="Sanction aggregate version" type="number" min="0" value={expectedVersion} onChange={(event) => setExpectedVersion(event.target.value)} /></label>
      <label><span>사유 코드</span><input aria-label="Sanction reason code" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} /></label>
      <label><span>만료 시각</span><input aria-label="Direct sanction expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
      <label><span>출처 케이스 ID</span><input aria-label="Source case ID" value={sourceCaseId} onChange={(event) => setSourceCaseId(event.target.value)} /></label>
    </div>
    <div className="account-api-actions">
      <Button aria-label="Apply account sanction" disabled={!accountId.trim() || !reasonCode.trim() || !validVersion || state.kind === 'processing'} onClick={() => prepare('APPLY')}>계정 제재 적용</Button>
      <Button aria-label="Lift account sanction" disabled={!accountId.trim() || !sanctionId.trim() || !reasonCode.trim() || !validVersion || state.kind === 'processing'} onClick={() => prepare('LIFT')}>계정 제재 해제</Button>
    </div>
    {pending && <div className="case-api-confirm" role="alertdialog" aria-label="Confirm account sanction">
      <strong>{pending} 계정 제재 명령을 실행할까요?</strong>
      <span>사유와 예상 버전은 감사 요청에 포함되며 성공 후 서버 correlation을 표시합니다.</span>
      <label><span>확인을 위해 {pending} 입력</span><input aria-label={`Type ${pending} to confirm`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      <div className="account-api-actions"><Button kind="primary" aria-label="Execute account sanction" disabled={state.kind === 'processing' || confirmation !== pending} onClick={() => void execute()}>확인 후 실행</Button><Button disabled={state.kind === 'processing'} onClick={() => { setPending(null); setConfirmation(''); }}>취소</Button></div>
    </div>}
    {state.kind === 'processing' && <div role="status"><LoaderCircle size={16} /> 제재 명령 처리 중</div>}
    {state.kind === 'succeeded' && <div className="case-api-receipt" role="status"><CheckCircle2 size={17} /><div><strong>{state.code}</strong><small>Correlation {state.correlationId}</small></div></div>}
    {state.kind === 'error' && <CaseError operator error={state.error} />}
  </Panel>;
}

function validSanctionVersion(value: string): boolean {
  return /^\d+$/.test(value);
}

function CaseError({ error, retry, operator = false }: {
  error: AccountOperationsApiError;
  /* The operator console runs the case against the audit trail, so it keeps the
     raw code and correlation id. Customer panels state only the outcome. */
  operator?: boolean;
  retry?: () => void | Promise<void>;
}) {
  if (error.status === 401) {
    /* Signed-out is the server answering as designed — the shared sign-in
       state, not a failure alert with a raw error code. */
    return <SignInRequiredState detail="이 작업은 로그인 후 이용할 수 있습니다." />;
  }
  const message = error.status === 403 ? '이 작업에 필요한 운영 권한이 없습니다.'
    : error.conflict ? '다른 변경이 먼저 반영되었습니다. 최신 상태를 다시 불러오세요.'
      : error.retryable ? '일시적으로 서버에 연결할 수 없습니다.' : '요청을 처리하지 못했습니다.';
  return <ErrorState
    title={message}
    detail={operator ? <>오류 코드 {error.code}{error.correlationId && <> · 문의 코드 {error.correlationId}</>}</> : undefined}
    onRetry={retry ? () => void retry() : undefined}
  />;
}
