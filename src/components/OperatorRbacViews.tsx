import { useEffect, useState } from 'react';
import { KeyRound, LoaderCircle, ShieldCheck, Users } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeading, Panel, Status } from './common';
import { OperatorRbacApiError } from '../api/operatorRbac';
import type { OperatorAssignments, OperatorCatalog, OperatorRbacClient, OperatorSelf } from '../api/operatorRbac';
import { AccountOperationsApiError } from '../api/accountOperations';
import type { AccountOperationsClient } from '../api/accountOperations';

type State<T> = { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'error'; error: OperatorRbacApiError };
type Tab = 'self' | 'catalog' | 'assignments' | 'mutations';

const apiError = (cause: unknown) => cause instanceof OperatorRbacApiError
  ? cause : new OperatorRbacApiError(0, 'NETWORK_ERROR', null);

export function OperatorRbacWorkspace({
  client, mutationsClient,
}: {
  client: OperatorRbacClient;
  mutationsClient?: AccountOperationsClient;
  catalogReadPermissionId?: string;
  assignmentReadPermissionId?: string;
}) {
  const [self, setSelf] = useState<State<OperatorSelf>>({ kind: 'loading' });
  const [tab, setTab] = useState<Tab>('self');
  const loadSelf = async () => {
    setSelf({ kind: 'loading' });
    try { setSelf({ kind: 'ready', value: (await client.me()).view }); }
    catch (cause) { setSelf({ kind: 'error', error: apiError(cause) }); }
  };
  useEffect(() => { void loadSelf(); }, [client]);

  if (self.kind === 'loading') return <OperatorPage><div className="operator-rbac-loading" role="status"><LoaderCircle size={18} /> 운영자 권한을 확인하는 중입니다.</div></OperatorPage>;
  if (self.kind === 'error') return <OperatorPage><OperatorReadError error={self.error} retry={loadSelf} /></OperatorPage>;

  const permissionCodes = new Set(self.value.permissions.map((permission) => permission.code));
  const canReadCatalog = permissionCodes.has('OPERATOR_RBAC_CATALOG_READ');
  const canReadAssignments = permissionCodes.has('OPERATOR_RBAC_ASSIGNMENT_READ');
  const canGrant = permissionCodes.has('OPERATOR_RBAC_GRANT');
  const canRevoke = permissionCodes.has('OPERATOR_RBAC_REVOKE');
  const canMutate = Boolean(mutationsClient && (canGrant || canRevoke));
  const visibleTab = tab === 'catalog' && !canReadCatalog
    || tab === 'assignments' && !canReadAssignments
    || tab === 'mutations' && !canMutate ? 'self' : tab;

  return <OperatorPage>
    <nav className="operator-rbac-tabs" aria-label="운영자 권한 메뉴">
      <button type="button" aria-current={visibleTab === 'self' ? 'page' : undefined} onClick={() => setTab('self')}>내 권한</button>
      {canReadCatalog && <button type="button" aria-current={visibleTab === 'catalog' ? 'page' : undefined} onClick={() => setTab('catalog')}>권한 카탈로그</button>}
      {canReadAssignments && <button type="button" aria-current={visibleTab === 'assignments' ? 'page' : undefined} onClick={() => setTab('assignments')}>운영자 할당 조회</button>}
      {canMutate && <button type="button" aria-current={visibleTab === 'mutations' ? 'page' : undefined} onClick={() => setTab('mutations')}>역할 부여·회수</button>}
    </nav>
    {visibleTab === 'self' && <SelfView value={self.value} />}
    {visibleTab === 'catalog' && <CatalogView client={client} />}
    {visibleTab === 'assignments' && <AssignmentsView client={client} />}
    {visibleTab === 'mutations' && mutationsClient && <RbacMutationView client={mutationsClient} canGrant={canGrant} canRevoke={canRevoke} />}
  </OperatorPage>;
}

function RbacMutationView({ client, canGrant, canRevoke, createIdempotencyKey = () => crypto.randomUUID() }: { client: AccountOperationsClient; canGrant: boolean; canRevoke: boolean; createIdempotencyKey?: () => string }) {
  const [targetOperatorId, setTargetOperatorId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [reasonCode, setReasonCode] = useState('OPERATOR_DUTY_CHANGE');
  const [expiresAt, setExpiresAt] = useState('');
  const [pending, setPending] = useState<'GRANT' | 'REVOKE' | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'processing' } | { kind: 'ready'; code: string; correlationId: string } | { kind: 'error'; error: AccountOperationsApiError; retry: () => void }>({ kind: 'idle' });

  const execute = async (retryKey?: string) => {
    if (!pending) return;
    const action = pending;
    const key = retryKey ?? createIdempotencyKey();
    setState({ kind: 'processing' });
    try {
      const receipt = action === 'GRANT'
        ? await client.grantOperator({ targetOperatorId: targetOperatorId.trim(), roleId: roleId.trim(), expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null, reasonCode: reasonCode.trim() }, key)
        : await client.revokeOperator({ targetOperatorId: targetOperatorId.trim(), assignmentId: assignmentId.trim(), reasonCode: reasonCode.trim() }, key);
      setPending(null); setConfirmation('');
      setState({ kind: 'ready', code: receipt.code, correlationId: receipt.correlationId });
    } catch (cause) {
      const failure = cause instanceof AccountOperationsApiError ? cause : new AccountOperationsApiError(0, 'NETWORK_ERROR', null);
      setState({ kind: 'error', error: failure, retry: () => void execute(key) });
    }
  };

  return <Panel title="운영자 역할 부여·회수" subtitle="고위험 변경은 서버의 권한·MFA·역할 계층 검증을 다시 거칩니다.">
    <div className="settings-fields account-api-fields">
      <label><span>대상 운영자 ID</span><input aria-label="RBAC target operator ID" value={targetOperatorId} onChange={(event) => setTargetOperatorId(event.target.value)} /></label>
      <label><span>역할 ID</span><input aria-label="RBAC role ID" value={roleId} onChange={(event) => setRoleId(event.target.value)} /></label>
      <label><span>할당 ID</span><input aria-label="RBAC assignment ID" value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} /></label>
      <label><span>사유 코드</span><input aria-label="RBAC reason code" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} /></label>
      <label><span>역할 만료 시각</span><input aria-label="RBAC role expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
    </div>
    <div className="account-api-actions">
      {canGrant && <Button disabled={!targetOperatorId.trim() || !roleId.trim() || !reasonCode.trim() || state.kind === 'processing'} onClick={() => { setPending('GRANT'); setConfirmation(''); }}>역할 부여</Button>}
      {canRevoke && <Button disabled={!targetOperatorId.trim() || !assignmentId.trim() || !reasonCode.trim() || state.kind === 'processing'} onClick={() => { setPending('REVOKE'); setConfirmation(''); }}>역할 회수</Button>}
    </div>
    {pending && <div className="case-api-confirm" role="alertdialog" aria-label="Confirm RBAC mutation"><strong>{pending} 변경을 실행할까요?</strong><label><span>확인을 위해 {pending} 입력</span><input aria-label={`Type ${pending} to confirm`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><div className="account-api-actions"><Button kind="primary" disabled={confirmation !== pending || state.kind === 'processing'} onClick={() => void execute()}>확인 후 실행</Button><Button onClick={() => setPending(null)}>취소</Button></div></div>}
    {state.kind === 'processing' && <p role="status">역할 변경을 처리하는 중입니다.</p>}
    {state.kind === 'ready' && <p role="status">{state.code} · 문의 코드 {state.correlationId}</p>}
    {state.kind === 'error' && <ErrorState title={state.error.status === 403 ? '역할 변경 권한 또는 최신 MFA가 없습니다.' : '역할 변경을 처리하지 못했습니다.'} detail={<>오류 코드 {state.error.code}{state.error.correlationId && <> · 문의 코드 {state.error.correlationId}</>}</>} onRetry={state.error.retryable ? state.retry : undefined} />}
  </Panel>;
}

function OperatorPage({ children }: { children: React.ReactNode }) {
  return <div className="page narrow-page operator-rbac-page">
    <PageHeading eyebrow="OPERATIONS · RBAC" title="운영자 권한" description="화면 노출은 편의를 위한 안내이며, 모든 조회 권한은 서버가 요청마다 다시 검증합니다." />
    {children}
  </div>;
}

function SelfView({ value }: { value: OperatorSelf }) {
  return <div className="settings-grid operator-rbac-grid">
    <Panel title="현재 운영자" subtitle={`카탈로그 ${value.catalogVersion}`}>
      <dl className="operator-rbac-definition-list">
        <div><dt>운영자 ID</dt><dd>{value.operatorId}</dd></div>
        <div><dt>현재 MFA</dt><dd><Status>{value.currentMfa ? 'VERIFIED' : 'NOT_CURRENT'}</Status></dd></div>
        <div><dt>최근 MFA 검증</dt><dd>{value.lastMfaVerifiedAt ?? '기록 없음'}</dd></div>
      </dl>
    </Panel>
    <Panel title="유효 역할" subtitle={`${value.roles.length}개`}>
      {value.roles.length === 0 ? <EmptyState icon={ShieldCheck} title="유효한 역할이 없습니다." />
        : <ul className="operator-rbac-list">{value.roles.map((role) => <li key={role.id}><strong>{role.code}</strong><span>rank {role.hierarchyRank}</span></li>)}</ul>}
    </Panel>
    <Panel className="span-2" title="유효 권한" subtitle={`${value.permissions.length}개`}>
      {value.permissions.length === 0 ? <EmptyState icon={KeyRound} title="유효한 권한이 없습니다." />
        : <ul className="operator-rbac-chip-list">{value.permissions.map((permission) => <li key={permission.id}>{permission.code}</li>)}</ul>}
    </Panel>
    <Panel className="span-2" title="내 역할 할당" subtitle="만료·회수·카탈로그 상태는 서버 평가 결과입니다.">
      <AssignmentList assignments={value.assignments} />
    </Panel>
  </div>;
}

function CatalogView({ client }: { client: OperatorRbacClient }) {
  const [state, setState] = useState<State<OperatorCatalog>>({ kind: 'loading' });
  const load = async () => {
    setState({ kind: 'loading' });
    try { setState({ kind: 'ready', value: (await client.catalog()).view }); }
    catch (cause) { setState({ kind: 'error', error: apiError(cause) }); }
  };
  useEffect(() => { void load(); }, [client]);
  if (state.kind === 'loading') return <div role="status"><LoaderCircle size={16} /> 카탈로그를 불러오는 중입니다.</div>;
  if (state.kind === 'error') return <OperatorReadError error={state.error} retry={load} />;
  return <div className="settings-grid operator-rbac-grid">
    <Panel title="역할" subtitle={`${state.value.catalogVersion} · ${state.value.roles.length}개`}>
      <ul className="operator-rbac-list">{state.value.roles.map((role) => <li key={role.id}><strong>{role.code}</strong><span>rank {role.hierarchyRank}</span></li>)}</ul>
    </Panel>
    <Panel title="권한" subtitle={`${state.value.permissions.length}개`}>
      <ul className="operator-rbac-list">{state.value.permissions.map((permission) => <li key={permission.id}><strong>{permission.code}</strong><span>{permission.id}</span></li>)}</ul>
    </Panel>
    <Panel className="span-2" title="역할-권한 연결" subtitle={`${state.value.rolePermissions.length}개`}>
      {state.value.rolePermissions.length === 0 ? <EmptyState icon={KeyRound} title="연결된 권한이 없습니다." />
        : <ul className="operator-rbac-list">{state.value.rolePermissions.map((mapping) => <li key={`${mapping.roleId}:${mapping.permissionId}`}><strong>{mapping.roleId} → {mapping.permissionId}</strong><Status>{mapping.delegable ? 'DELEGABLE' : 'DIRECT'}</Status></li>)}</ul>}
    </Panel>
  </div>;
}

function AssignmentsView({ client }: { client: OperatorRbacClient }) {
  const [operatorId, setOperatorId] = useState('');
  const [state, setState] = useState<State<OperatorAssignments> | null>(null);
  const load = async () => {
    if (!operatorId.trim()) return;
    setState({ kind: 'loading' });
    try { setState({ kind: 'ready', value: (await client.assignments(operatorId.trim())).view }); }
    catch (cause) { setState({ kind: 'error', error: apiError(cause) }); }
  };
  return <Panel title="운영자 역할 할당 조회" subtitle="대상 ID는 서버가 권한 검증을 마친 뒤에만 조회합니다.">
    <form className="account-api-actions" onSubmit={(event) => { event.preventDefault(); void load(); }}>
      <input aria-label="대상 운영자 ID" placeholder="operator UUID" value={operatorId} onChange={(event) => setOperatorId(event.target.value)} />
      <Button kind="primary" disabled={!operatorId.trim() || state?.kind === 'loading'}><Users size={14} />조회</Button>
    </form>
    {state?.kind === 'loading' && <div role="status"><LoaderCircle size={16} /> 역할 할당을 불러오는 중입니다.</div>}
    {state?.kind === 'error' && <OperatorReadError error={state.error} retry={state.error.retryable || state.error.conflict ? load : undefined} />}
    {state?.kind === 'ready' && <><p className="operator-rbac-target">대상 {state.value.operatorId}</p><AssignmentList assignments={state.value.assignments} /></>}
  </Panel>;
}

function AssignmentList({ assignments }: { assignments: OperatorSelf['assignments'] }) {
  if (assignments.length === 0) return <EmptyState icon={Users} title="역할 할당 기록이 없습니다." />;
  return <ul className="operator-rbac-list">{assignments.map((assignment) => <li key={assignment.id}>
    <span><strong>{assignment.roleCode}</strong><small>{assignment.grantedAt} · 만료 {assignment.expiresAt ?? '없음'}</small></span>
    <Status>{assignment.status}</Status>
  </li>)}</ul>;
}

export function OperatorReadError({ error, retry }: { error: OperatorRbacApiError; retry?: () => void | Promise<void> }) {
  const message = error.authenticationRequired ? '운영자 로그인이 필요하거나 인증이 만료되었습니다.'
    : error.forbidden ? '이 조회에 필요한 권한 또는 최신 MFA가 없습니다.'
      : error.notFound ? '조회할 수 있는 운영자를 찾지 못했습니다.'
        : error.conflict ? '권한 카탈로그 버전이 변경되었습니다. 최신 상태로 다시 조회하세요.'
          : error.retryable ? '운영자 권한 서비스에 일시적으로 연결할 수 없습니다.' : '운영자 권한 응답을 처리하지 못했습니다.';
  return <ErrorState
    title={message}
    detail={<>오류 코드 {error.code}{error.correlationId && <> · 문의 코드 {error.correlationId}</>}</>}
    onRetry={retry ? () => void retry() : undefined}
  />;
}
