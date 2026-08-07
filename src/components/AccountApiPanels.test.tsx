import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  it('loads preferences without requesting a server-side session list', async () => {
    const api = client();
    render(<AccountApiPanels client={api} />);

    expect(await screen.findByRole('heading', { name: '로그인 및 보안' })).toBeInTheDocument();
    expect(api.preferences).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/활성 세션/)).not.toBeInTheDocument();
  });

  it('offers normal current and all-device logout actions', async () => {
    const logoutCurrent = vi.fn().mockResolvedValue(undefined);
    const logoutAll = vi.fn().mockResolvedValue(undefined);
    render(<AccountApiPanels client={client({ logoutCurrent, logoutAll })} />);
    await screen.findByRole('heading', { name: '로그인 및 보안' });

    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(logoutCurrent).toHaveBeenCalledTimes(1));
  });

  it('saves the account language preference', async () => {
    const updatePreferences = vi.fn().mockResolvedValue({ ...preferences, languageCode: 'en' });
    render(<AccountApiPanels client={client({ updatePreferences })} />);
    await userEvent.selectOptions(await screen.findByLabelText('서버 언어 선택'), 'en');
    await userEvent.click(screen.getByRole('button', { name: '환경 저장' }));

    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith(expect.objectContaining({ languageCode: 'en' })));
  });
});
