import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountOperationsApiError } from '../api/accountOperations';
import type { AccountOperationsClient, UserCaseDetail, UserCaseView } from '../api/accountOperations';
import { OperatorCaseWorkspace, OperatorSanctionPanel, UserCasePanel } from './CaseApiPanels';

const userCase: UserCaseView = {
  id: 'case-1', accountId: 'account-1', type: 'APPEAL', status: 'OPEN', version: 1,
  evidenceObjectIds: [], updatedAt: '2026-08-03T00:00:00Z',
};
const userCaseDetail: UserCaseDetail = {
  id: 'case-1', type: 'APPEAL', status: 'UNDER_REVIEW', subject: '제재 이의', description: '검토를 요청합니다.',
  createdAt: '2026-08-03T00:00:00Z', updatedAt: '2026-08-03T01:00:00Z', responseDeadlineAt: null,
  history: [
    { actor: 'CUSTOMER', status: 'OPEN', message: '문의를 접수했습니다.', createdAt: '2026-08-03T00:00:00Z' },
    { actor: 'SUPPORT', status: 'UNDER_REVIEW', message: '고객지원팀에서 확인하고 있습니다.', createdAt: '2026-08-03T01:00:00Z' },
  ],
};

function client(overrides: Partial<AccountOperationsClient> = {}): AccountOperationsClient {
  return {
    submitCase: vi.fn().mockResolvedValue(userCase), addCaseEvidence: vi.fn(),
    userCases: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), userCase: vi.fn().mockResolvedValue(userCaseDetail),
    operatorCaseQueue: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), operatorCase: vi.fn(), commandCase: vi.fn(),
    grantOperator: vi.fn(), revokeOperator: vi.fn(), applySanction: vi.fn(), liftSanction: vi.fn(), ...overrides,
  };
}

describe('UserCasePanel', () => {
  it('requires meaningful fields, submits once with a fresh key, and shows the server receipt', async () => {
    const submitCase = vi.fn().mockResolvedValue(userCase);
    render(<UserCasePanel client={client({ submitCase })} createIdempotencyKey={() => 'idem-case'} />);
    const submit = screen.getByRole('button', { name: '접수하기' });
    expect(submit).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('문의 유형'), 'APPEAL');
    await userEvent.type(screen.getByLabelText('문의 제목'), '제재 이의');
    await userEvent.type(screen.getByLabelText('문의 내용'), '검토를 요청합니다.');
    await userEvent.click(submit);
    await screen.findByText('문의가 접수되었습니다.');
    expect(submitCase).toHaveBeenCalledWith(expect.objectContaining({ type: 'APPEAL', evidence: [] }), 'idem-case');
    expect(screen.queryByText(/case-1|버전/)).not.toBeInTheDocument();
  });

  it('offers a retry action for retryable failures without exposing the raw code', async () => {
    const createIdempotencyKey = vi.fn(() => 'idem-lost-response');
    const submitCase = vi.fn()
      .mockRejectedValueOnce(new AccountOperationsApiError(503, 'CASE_SERVICE_UNAVAILABLE', 'corr-case'))
      .mockResolvedValueOnce(userCase);
    render(<UserCasePanel client={client({ submitCase })} createIdempotencyKey={createIdempotencyKey} />);
    await userEvent.type(screen.getByLabelText('문의 제목'), '문의');
    await userEvent.type(screen.getByLabelText('문의 내용'), '내용');
    await userEvent.click(screen.getByRole('button', { name: '접수하기' }));
    expect(await screen.findByText('일시적으로 서버에 연결할 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText(/corr-case/)).not.toBeInTheDocument();
    expect(screen.queryByText(/CASE_SERVICE_UNAVAILABLE/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByText('문의가 접수되었습니다.');
    expect(createIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(submitCase).toHaveBeenNthCalledWith(1, expect.any(Object), 'idem-lost-response');
    expect(submitCase).toHaveBeenNthCalledWith(2, expect.any(Object), 'idem-lost-response');
  });

  it('shows a Korean inquiry list and opens safe detail without ids or internal status codes', async () => {
    const userCases = vi.fn().mockResolvedValue({ items: [{
      id: 'case-1', type: 'APPEAL', status: 'UNDER_REVIEW', subject: '제재 이의',
      createdAt: '2026-08-03T00:00:00Z', updatedAt: '2026-08-03T01:00:00Z',
    }], nextCursor: null });
    render(<UserCasePanel client={client({ userCases })} />);

    expect(await screen.findByText('제재 이의')).toBeInTheDocument();
    expect(screen.getByText('검토 중')).toBeInTheDocument();
    expect(screen.queryByText('UNDER_REVIEW')).not.toBeInTheDocument();
    expect(screen.queryByText('case-1')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '제재 이의 상세 보기' }));
    expect(await screen.findByRole('dialog', { name: '제재 이의' })).toBeInTheDocument();
    expect(screen.getByText('검토를 요청합니다.')).toBeInTheDocument();
    expect(screen.getByText('고객지원팀에서 확인하고 있습니다.')).toBeInTheDocument();
  });
});

describe('OperatorCaseWorkspace', () => {
  it('loads only the active queue, selects a case, and uses its exact version for a command', async () => {
    const summary = { caseId: 'case-1', type: 'REPORT' as const, status: 'OPEN' as const, version: 2, assigneeOperatorId: null, updatedAt: '2026-08-03T00:00:00Z' };
    const operatorCaseQueue = vi.fn()
      .mockResolvedValueOnce({ items: [summary], nextCursor: null })
      .mockResolvedValue({ items: [], nextCursor: null });
    const operatorCase = vi.fn()
      .mockResolvedValueOnce({ ...summary, evidence: [] })
      .mockResolvedValueOnce({ ...summary, status: 'UNDER_REVIEW', version: 3, evidence: [] });
    const commandCase = vi.fn().mockResolvedValue({ status: 'APPLIED', code: 'CASE_REVIEW_STARTED', correlationId: 'corr-ops', caseVersion: 3 });
    render(<OperatorCaseWorkspace client={client({ operatorCaseQueue, operatorCase, commandCase })} createIdempotencyKey={() => 'idem-ops'} />);
    await userEvent.click(await screen.findByRole('button', { name: /REPORT/ }));
    await screen.findByText('REPORT · OPEN');
    await userEvent.click(screen.getByRole('button', { name: '검토 시작' }));
    expect(screen.getByRole('alertdialog', { name: '운영 명령 확인' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '확인 후 실행' }));
    await waitFor(() => expect(commandCase).toHaveBeenCalledWith('case-1', 'START_REVIEW', expect.objectContaining({ expectedVersion: 2 }), 'idem-ops'));
    await screen.findByText('REPORT · UNDER_REVIEW');
  });

  it('fails closed with a permission-specific message', async () => {
    render(<OperatorCaseWorkspace client={client({ operatorCaseQueue: vi.fn().mockRejectedValue(new AccountOperationsApiError(403, 'OPERATOR_PERMISSION_REQUIRED', 'corr-permission')) })} />);
    expect(await screen.findByText('이 작업에 필요한 운영 권한이 없습니다.')).toBeInTheDocument();
    expect(screen.getByText(/문의 코드 corr-permission/)).toBeInTheDocument();
  });

  it('loads the next operator queue page with the server cursor', async () => {
    const first = { caseId: 'case-1', type: 'REPORT' as const, status: 'OPEN' as const, version: 1, assigneeOperatorId: null, updatedAt: '2026-08-03T00:00:00Z' };
    const second = { ...first, caseId: 'case-2', type: 'INQUIRY' as const };
    const operatorCaseQueue = vi.fn()
      .mockResolvedValueOnce({ items: [first], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [second], nextCursor: null });
    render(<OperatorCaseWorkspace client={client({ operatorCaseQueue })} />);

    await screen.findByRole('button', { name: /REPORT/ });
    await userEvent.click(screen.getByRole('button', { name: '다음 케이스 불러오기' }));
    expect(await screen.findByRole('button', { name: /INQUIRY/ })).toBeInTheDocument();
    expect(operatorCaseQueue).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: 'cursor-2' }));
  });

  it('requires an explicit high-risk confirmation and sends the complete sanction command', async () => {
    const summary = { caseId: 'case-1', type: 'REPORT' as const, status: 'UNDER_REVIEW' as const, version: 4, assigneeOperatorId: 'operator-1', updatedAt: '2026-08-03T00:00:00Z' };
    const operatorCaseQueue = vi.fn().mockResolvedValue({ items: [summary], nextCursor: null });
    const operatorCase = vi.fn()
      .mockResolvedValueOnce({ ...summary, evidence: [] })
      .mockResolvedValueOnce({ ...summary, version: 5, evidence: [] });
    const commandCase = vi.fn().mockResolvedValue({
      status: 'APPLIED', code: 'CASE_SANCTION_APPLIED', correlationId: 'corr-sanction', caseVersion: 5,
    });
    render(<OperatorCaseWorkspace
      client={client({ operatorCaseQueue, operatorCase, commandCase })}
      createIdempotencyKey={() => 'idem-sanction'}
      createSanctionId={() => 'a1420000-0000-4000-8000-000000000002'}
    />);

    await userEvent.click(await screen.findByRole('button', { name: /REPORT/ }));
    await screen.findByText('REPORT · UNDER_REVIEW');
    await userEvent.clear(screen.getByLabelText('Operation reason code'));
    await userEvent.type(screen.getByLabelText('Operation reason code'), 'POLICY_VIOLATION');
    await userEvent.click(screen.getByRole('button', { name: 'Apply sanction' }));

    const confirm = screen.getByRole('alertdialog', { name: 'Confirm high-risk operation' });
    expect(confirm).toHaveTextContent('APPLY_SANCTION');
    expect(screen.getByRole('button', { name: 'Execute high-risk operation' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Type APPLY_SANCTION to confirm'), 'APPLY_SANCTION');
    await userEvent.click(screen.getByRole('button', { name: 'Execute high-risk operation' }));

    await waitFor(() => expect(commandCase).toHaveBeenCalledWith('case-1', 'APPLY_SANCTION', {
      expectedVersion: 4,
      reasonCode: 'POLICY_VIOLATION',
      sanctionId: 'a1420000-0000-4000-8000-000000000002',
      sanctionType: 'SUSPENSION',
      sanctionExpiresAt: null,
      expectedSanctionVersion: 0,
    }, 'idem-sanction'));
    expect(await screen.findByText('Correlation corr-sanction')).toBeInTheDocument();
  });

  it('collects assignment and release inputs without inventing server state', async () => {
    const summary = { caseId: 'case-2', type: 'APPEAL' as const, status: 'OPEN' as const, version: 1, assigneeOperatorId: null, updatedAt: '2026-08-03T00:00:00Z' };
    const operatorCaseQueue = vi.fn().mockResolvedValue({ items: [summary], nextCursor: null });
    const operatorCase = vi.fn().mockResolvedValue({ ...summary, evidence: [] });
    const commandCase = vi.fn().mockResolvedValue({ status: 'APPLIED', code: 'CASE_ASSIGNED', correlationId: 'corr-assign', caseVersion: 2 });
    render(<OperatorCaseWorkspace client={client({ operatorCaseQueue, operatorCase, commandCase })} createIdempotencyKey={() => 'idem-assign'} />);

    await userEvent.click(await screen.findByRole('button', { name: /APPEAL/ }));
    await userEvent.clear(screen.getByLabelText('Operation reason code'));
    await userEvent.type(screen.getByLabelText('Operation reason code'), 'ON_CALL');
    await userEvent.type(screen.getByLabelText('Assignee operator ID'), 'a1420000-0000-4000-8000-000000000003');
    await userEvent.click(screen.getByRole('button', { name: 'Assign case' }));
    await userEvent.click(screen.getByRole('button', { name: '확인 후 실행' }));

    await waitFor(() => expect(commandCase).toHaveBeenCalledWith('case-2', 'ASSIGN', {
      expectedVersion: 1,
      reasonCode: 'ON_CALL',
      assigneeOperatorId: 'a1420000-0000-4000-8000-000000000003',
    }, 'idem-assign'));
  });
});

describe('OperatorSanctionPanel', () => {
  it('requires typed confirmation for a direct account sanction and displays the server correlation', async () => {
    const applySanction = vi.fn().mockResolvedValue({ code: 'SANCTION_APPLIED', sanctionReference: 'sanction-1', correlationId: 'corr-direct', aggregateVersion: 1 });
    render(<OperatorSanctionPanel client={client({ applySanction })} createIdempotencyKey={() => 'idem-direct'} createSanctionId={() => 'sanction-1'} />);

    await userEvent.type(screen.getByLabelText('Sanction account ID'), 'account-1');
    await userEvent.clear(screen.getByLabelText('Sanction reason code'));
    await userEvent.type(screen.getByLabelText('Sanction reason code'), 'POLICY_VIOLATION');
    await userEvent.click(screen.getByRole('button', { name: 'Apply account sanction' }));
    await userEvent.type(screen.getByLabelText('Type APPLY to confirm'), 'APPLY');
    await userEvent.click(screen.getByRole('button', { name: 'Execute account sanction' }));

    await waitFor(() => expect(applySanction).toHaveBeenCalledWith('account-1', {
      sanctionId: 'sanction-1', type: 'SUSPENSION', reasonCode: 'POLICY_VIOLATION',
      expiresAt: null, sourceCaseId: null, expectedVersion: 0,
    }, 'idem-direct'));
    expect(await screen.findByText('Correlation corr-direct')).toBeInTheDocument();
  });
});
