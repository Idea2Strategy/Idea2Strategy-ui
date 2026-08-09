import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountClient, AccountPreferences } from '../api/account';
import { AccountApiPanels } from './AccountApiPanels';

const preferences: AccountPreferences = {
  languageCode: 'ko', timezoneName: 'Asia/Seoul', themePreference: 'SYSTEM',
  updatedAt: '2026-08-07T00:00:00Z',
};

const client = (overrides: Partial<AccountClient> = {}): AccountClient => ({
  signup: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), login: vi.fn(),
  requestPasswordReset: vi.fn(), resetPassword: vi.fn(), rotateSession: vi.fn(),
  logoutCurrent: vi.fn().mockResolvedValue(undefined), logoutAll: vi.fn().mockResolvedValue(undefined),
  preferences: vi.fn().mockResolvedValue(preferences), updatePreferences: vi.fn().mockResolvedValue(preferences),
  requestWithdrawal: vi.fn(), cancelWithdrawal: vi.fn(), ...overrides,
});

afterEach(cleanup);

describe('AccountApiPanels', () => {
  it('keeps the account page focused on security and account management', () => {
    const api = client();
    render(<AccountApiPanels client={api} />);

    expect(screen.getByRole('heading', { name: '로그인 및 보안' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '계정 관리' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '서비스 환경' })).not.toBeInTheDocument();
    expect(api.preferences).not.toHaveBeenCalled();
  });

  it('offers normal current and all-device logout actions', async () => {
    const logoutCurrent = vi.fn().mockResolvedValue(undefined);
    const logoutAll = vi.fn().mockResolvedValue(undefined);
    render(<AccountApiPanels client={client({ logoutCurrent, logoutAll })} />);
    const actions = screen.getByRole('group', { name: '로그인 보안 작업' });

    expect(within(actions).getByRole('button', { name: '로그아웃' })).toHaveClass('account-logout-button');
    expect(within(actions).getByRole('button', { name: '모든 기기에서 로그아웃' })).toHaveClass('account-logout-all-button');
    await userEvent.click(within(actions).getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(logoutCurrent).toHaveBeenCalledTimes(1));
  });

  it('requests withdrawal from a warning modal using only the password field', async () => {
    const user = userEvent.setup();
    const requestWithdrawal = vi.fn().mockResolvedValue({
      accountId: 'account-1', status: 'CLOSING', version: 2,
      withdrawalRequestedAt: '2026-08-09T00:00:00Z', cancellationDeadlineAt: null, applied: true,
    });
    render(<AccountApiPanels
      client={client({ requestWithdrawal })}
      createIdempotencyKey={() => 'withdrawal-1'}
    />);

    expect(screen.queryByLabelText('현재 비밀번호')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '회원 탈퇴' }));

    const dialog = screen.getByRole('dialog', { name: '회원 탈퇴' });
    expect(within(dialog).getByText('계정을 삭제하면 복구할 수 없습니다.')).toBeInTheDocument();
    const password = within(dialog).getByLabelText('현재 비밀번호');
    expect(password).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: '탈퇴' })).toBeDisabled();

    await user.type(password, 'password');
    await user.click(within(dialog).getByRole('button', { name: '탈퇴' }));

    await waitFor(() => expect(requestWithdrawal).toHaveBeenCalledWith('password', 'withdrawal-1'));
    expect(screen.queryByRole('dialog', { name: '회원 탈퇴' })).not.toBeInTheDocument();
  });
});
