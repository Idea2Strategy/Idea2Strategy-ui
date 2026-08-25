import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OperatorRbacApiError } from '../api/operatorRbac';
import type { OperatorRbacClient, OperatorSelf } from '../api/operatorRbac';
import type { AccountOperationsClient } from '../api/accountOperations';
import { OperatorRbacWorkspace, OperatorReadError } from './OperatorRbacViews';

const catalogPermission = { id: 'catalog-read-id', code: 'OPERATOR_RBAC_CATALOG_READ' };
const assignmentPermission = { id: 'assignment-read-id', code: 'OPERATOR_RBAC_ASSIGNMENT_READ' };
const self = (permissions = [catalogPermission, assignmentPermission]): OperatorSelf => ({
  operatorId: 'operator-1', catalogVersion: 'catalog-v1', currentMfa: true,
  mfaAuthenticatedAt: '2026-08-03T00:00:00Z', lastMfaVerifiedAt: '2026-08-03T00:00:00Z',
  roles: [{ id: 'role-1', code: 'SECURITY_OPERATOR', hierarchyRank: 50 }], permissions,
  assignments: [{
    id: 'assignment-1', operatorId: 'operator-1', roleId: 'role-1', roleCode: 'SECURITY_OPERATOR',
    catalogVersion: 'catalog-v1', grantedAt: '2026-08-03T00:00:00Z', expiresAt: null,
    revokedAt: null, revocationReasonCode: null, status: 'ACTIVE',
  }],
});

const client = (overrides: Partial<OperatorRbacClient> = {}): OperatorRbacClient => ({
  me: vi.fn().mockResolvedValue({ view: self(), correlationId: 'corr-me' }),
  catalog: vi.fn().mockResolvedValue({
    view: { catalogVersion: 'catalog-v1', roles: [], permissions: [], rolePermissions: [] }, correlationId: 'corr-catalog',
  }),
  assignments: vi.fn().mockResolvedValue({ view: { operatorId: 'operator-2', assignments: [] }, correlationId: 'corr-assignments' }),
  ...overrides,
});

const mutationsClient = (overrides: Partial<AccountOperationsClient> = {}): AccountOperationsClient => ({
  submitCase: vi.fn(), addCaseEvidence: vi.fn(), userCases: vi.fn(), userCase: vi.fn(), operatorCaseQueue: vi.fn(), operatorCase: vi.fn(), commandCase: vi.fn(),
  grantOperator: vi.fn(), revokeOperator: vi.fn(), applySanction: vi.fn(), liftSanction: vi.fn(), ...overrides,
});

describe('operator RBAC workspace', () => {
  it('bootstraps from /me and exposes stable permission codes without environment-specific IDs', async () => {
    const me = vi.fn().mockResolvedValue({ view: self([catalogPermission]), correlationId: 'corr-me' });
    render(<OperatorRbacWorkspace client={client({ me })} />);

    expect(screen.getByRole('status')).toHaveTextContent('운영자 권한을 확인하는 중');
    expect(await screen.findByRole('button', { name: '권한 카탈로그' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '운영자 할당 조회' })).not.toBeInTheDocument();
    expect(screen.getByText('OPERATOR_RBAC_CATALOG_READ')).toBeInTheDocument();
    expect(me).toHaveBeenCalledTimes(1);
  });

  it('loads protected catalog data only after the permitted navigation is selected', async () => {
    const catalog = vi.fn().mockResolvedValue({
      view: { catalogVersion: 'catalog-v1', roles: [], permissions: [], rolePermissions: [] }, correlationId: 'corr-catalog',
    });
    render(<OperatorRbacWorkspace client={client({ catalog })} />);
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: '현재 운영자' })).toBeInTheDocument();
    expect(catalog).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '권한 카탈로그' }));

    expect(await screen.findByRole('heading', { name: '역할' })).toBeInTheDocument();
    expect(catalog).toHaveBeenCalledTimes(1);
  });

  it('submits a target assignment read without using visibility as authorization', async () => {
    const assignments = vi.fn().mockResolvedValue({ view: { operatorId: 'operator-2', assignments: [] }, correlationId: 'corr-assignments' });
    render(<OperatorRbacWorkspace client={client({ assignments })} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '운영자 할당 조회' }));
    await user.type(screen.getByRole('textbox', { name: '대상 운영자 ID' }), 'operator-2');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() => expect(assignments).toHaveBeenCalledWith('operator-2'));
    expect(await screen.findByText('대상 operator-2')).toBeInTheDocument();
    expect(screen.getByText('역할 할당 기록이 없습니다.')).toBeInTheDocument();
  });

  it.each([
    [401, '운영자 로그인이 필요하거나 인증이 만료되었습니다.'],
    [403, '이 조회에 필요한 권한 또는 최신 MFA가 없습니다.'],
    [404, '조회할 수 있는 운영자를 찾지 못했습니다.'],
    [409, '권한 카탈로그 버전이 변경되었습니다. 최신 상태로 다시 조회하세요.'],
  ])('renders a stable action for status %i', (status, message) => {
    render(<OperatorReadError error={new OperatorRbacApiError(status, `CODE_${status}`, 'corr-error')} />);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('alert')).toHaveTextContent(`CODE_${status}`);
    expect(screen.getByRole('alert')).toHaveTextContent('corr-error');
  });

  it('keeps the direct workspace server-gated when /me rejects the caller', async () => {
    const me = vi.fn().mockRejectedValue(new OperatorRbacApiError(403, 'OPERATOR_RBAC_READ_FORBIDDEN', 'corr-forbidden'));
    render(<OperatorRbacWorkspace client={client({ me })} catalogReadPermissionId="catalog-read-id" assignmentReadPermissionId="assignment-read-id" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('OPERATOR_RBAC_READ_FORBIDDEN');
    expect(screen.queryByRole('button', { name: '권한 카탈로그' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '운영자 할당 조회' })).not.toBeInTheDocument();
  });

  it('requires typed confirmation and sends a complete role grant command', async () => {
    const grantOperator = vi.fn().mockResolvedValue({ code: 'OPERATOR_ROLE_GRANTED', correlationId: 'corr-grant' });
    const grantPermission = { id: 'grant-id', code: 'OPERATOR_RBAC_GRANT' };
    render(<OperatorRbacWorkspace client={client({ me: vi.fn().mockResolvedValue({ view: self([grantPermission]), correlationId: 'corr-me' }) })} mutationsClient={mutationsClient({ grantOperator })} />);
    await userEvent.click(await screen.findByRole('button', { name: '역할 부여·회수' }));
    await userEvent.type(screen.getByLabelText('RBAC target operator ID'), 'operator-2');
    await userEvent.type(screen.getByLabelText('RBAC role ID'), 'role-2');
    await userEvent.clear(screen.getByLabelText('RBAC reason code'));
    await userEvent.type(screen.getByLabelText('RBAC reason code'), 'ON_CALL');
    await userEvent.click(screen.getByRole('button', { name: '역할 부여' }));
    expect(screen.getByRole('button', { name: '확인 후 실행' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Type GRANT to confirm'), 'GRANT');
    await userEvent.click(screen.getByRole('button', { name: '확인 후 실행' }));

    await waitFor(() => expect(grantOperator).toHaveBeenCalledWith({
      targetOperatorId: 'operator-2', roleId: 'role-2', expiresAt: null, reasonCode: 'ON_CALL',
    }, expect.any(String)));
    expect(await screen.findByText(/OPERATOR_ROLE_GRANTED/)).toBeInTheDocument();
  });

  it('does not expose role mutations merely because a mutation client exists', async () => {
    render(<OperatorRbacWorkspace client={client()} mutationsClient={mutationsClient()} />);
    expect(await screen.findByRole('heading', { name: '현재 운영자' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '역할 부여·회수' })).not.toBeInTheDocument();
  });
});
