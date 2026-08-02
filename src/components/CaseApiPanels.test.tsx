import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountOperationsApiError } from '../api/accountOperations';
import type { AccountOperationsClient, UserCaseView } from '../api/accountOperations';
import { OperatorCaseWorkspace, UserCasePanel } from './CaseApiPanels';

const userCase: UserCaseView = {
  id: 'case-1', accountId: 'account-1', type: 'APPEAL', status: 'OPEN', version: 1,
  evidenceObjectIds: [], updatedAt: '2026-08-03T00:00:00Z',
};

function client(overrides: Partial<AccountOperationsClient> = {}): AccountOperationsClient {
  return {
    submitCase: vi.fn().mockResolvedValue(userCase), addCaseEvidence: vi.fn(), userCase: vi.fn().mockResolvedValue(userCase),
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
    await userEvent.selectOptions(screen.getByLabelText('케이스 유형'), 'APPEAL');
    await userEvent.type(screen.getByLabelText('케이스 제목'), '제재 이의');
    await userEvent.type(screen.getByLabelText('케이스 설명'), '검토를 요청합니다.');
    await userEvent.click(submit);
    await screen.findByText('추적 번호 case-1 · 버전 1');
    expect(submitCase).toHaveBeenCalledWith(expect.objectContaining({ type: 'APPEAL', evidence: [] }), 'idem-case');
  });

  it('shows a correlation code and retry action for retryable failures', async () => {
    const submitCase = vi.fn()
      .mockRejectedValueOnce(new AccountOperationsApiError(503, 'CASE_SERVICE_UNAVAILABLE', 'corr-case'))
      .mockResolvedValueOnce(userCase);
    render(<UserCasePanel client={client({ submitCase })} createIdempotencyKey={() => 'idem'} />);
    await userEvent.type(screen.getByLabelText('케이스 제목'), '문의');
    await userEvent.type(screen.getByLabelText('케이스 설명'), '내용');
    await userEvent.click(screen.getByRole('button', { name: '접수하기' }));
    expect(await screen.findByText('문의 코드 corr-case')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByText('추적 번호 case-1 · 버전 1');
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
    expect(await screen.findByText('이 작업에 필요한 로그인 또는 운영 권한이 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('문의 코드 corr-permission')).toBeInTheDocument();
  });
});
