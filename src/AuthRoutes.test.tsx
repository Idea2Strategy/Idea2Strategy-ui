import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AccountApiError } from './api/account';
import type { AccountClient } from './api/account';
import { NotificationApiError } from './api/notifications';
import type { NotificationClient } from './api/notifications';
import { setSessionAccessToken } from './api/sessionAccessToken';

const accountClient = (overrides: Partial<AccountClient> = {}): AccountClient => ({
  signup: vi.fn().mockResolvedValue({ accountId: 'account-1', verificationExpiresAt: '2026-08-06T00:00:00Z' }),
  verifyEmail: vi.fn().mockResolvedValue(undefined),
  resendVerification: vi.fn().mockResolvedValue({ verificationRequired: true, verificationExpiresAt: '2026-08-07T00:00:00Z' }),
  // The real client publishes the session token on login; the guarded routes
  // the screen navigates to afterwards read exactly that.
  login: vi.fn().mockImplementation(async () => {
    setSessionAccessToken('token-1');
    return { accountId: 'account-1', sessionId: 'session-1', sessionToken: 'token-1', expiresAt: '2026-08-06T00:00:00Z' };
  }),
  requestPasswordReset: vi.fn().mockResolvedValue(true),
  resetPassword: vi.fn().mockResolvedValue(undefined),
  sessions: vi.fn().mockResolvedValue([]),
  rotateSession: vi.fn(),
  logoutCurrent: vi.fn(),
  logoutSession: vi.fn(),
  logoutAll: vi.fn(),
  preferences: vi.fn().mockRejectedValue(new AccountApiError(401, 'UNAUTHENTICATED', null)),
  updatePreferences: vi.fn(),
  requestWithdrawal: vi.fn(),
  cancelWithdrawal: vi.fn(),
  reactivateWithPassword: vi.fn(),
  ...overrides,
});

afterEach(() => {
  cleanup();
  setSessionAccessToken(null);
  window.history.replaceState({}, '', '/');
});

describe('customer login screen', () => {
  it('logs in through the real client and lands on the account page by default', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/login');
    render(<App accountClient={client} />);

    await userEvent.type(screen.getByLabelText('로그인 이메일'), 'customer@example.com');
    await userEvent.type(screen.getByLabelText('로그인 비밀번호'), 'correct horse battery staple');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(client.login).toHaveBeenCalledWith('customer@example.com', 'correct horse battery staple', 'Web browser');
    await waitFor(() => expect(window.location.pathname).toBe('/account'));
  });

  it('returns to the screen that required authentication', async () => {
    const client = accountClient();
    window.history.replaceState({ usr: { returnTo: '/bots' } }, '', '/login');
    render(<App accountClient={client} />);

    await userEvent.type(screen.getByLabelText('로그인 이메일'), 'customer@example.com');
    await userEvent.type(screen.getByLabelText('로그인 비밀번호'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => expect(window.location.pathname).toBe('/bots'));
  });

  it('shows the API failure code and correlation id instead of pretending success', async () => {
    const client = accountClient({
      login: vi.fn().mockRejectedValue(new AccountApiError(401, 'INVALID_CREDENTIALS', 'corr-login-1')),
    });
    window.history.replaceState({}, '', '/login');
    render(<App accountClient={client} />);

    await userEvent.type(screen.getByLabelText('로그인 이메일'), 'customer@example.com');
    await userEvent.type(screen.getByLabelText('로그인 비밀번호'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('INVALID_CREDENTIALS');
    expect(alert).toHaveTextContent('corr-login-1');
    expect(window.location.pathname).toBe('/login');
  });

  it('requests and applies a password reset from the fold', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/login');
    render(<App accountClient={client} />);

    await userEvent.click(screen.getByText('비밀번호를 잊으셨나요?', { selector: 'summary' }));
    await userEvent.type(screen.getByLabelText('재설정 이메일'), 'customer@example.com');
    await userEvent.click(screen.getByRole('button', { name: '재설정 요청' }));
    expect(client.requestPasswordReset).toHaveBeenCalledWith('customer@example.com');
    await screen.findByText('계정 존재 여부와 관계없이 복구 요청을 접수했습니다.');

    await userEvent.type(screen.getByLabelText('재설정 토큰'), 'reset-token');
    await userEvent.type(screen.getByLabelText('재설정 새 비밀번호'), 'new password 2026!');
    await userEvent.click(screen.getByRole('button', { name: '비밀번호 재설정' }));
    expect(client.resetPassword).toHaveBeenCalledWith('reset-token', 'new password 2026!');
  });
});

describe('customer signup screen', () => {
  it('walks signup, verification and the hop to login as separate confirmed steps', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/signup');
    render(<App accountClient={client} />);

    await userEvent.type(screen.getByLabelText('가입 이메일'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('가입 비밀번호'), 'strong password 2026!');
    await userEvent.type(screen.getByLabelText('가입 비밀번호 확인'), 'strong password 2026!');
    await userEvent.click(screen.getByRole('button', { name: '가입' }));
    expect(client.signup).toHaveBeenCalledWith('new@example.com', 'strong password 2026!');

    await userEvent.type(await screen.findByLabelText('가입 인증 토큰'), 'verification-token');
    await userEvent.click(screen.getByRole('button', { name: '이메일 인증' }));
    expect(client.verifyEmail).toHaveBeenCalledWith('verification-token');

    await userEvent.click(await screen.findByRole('button', { name: '로그인하러 가기' }));
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });

  it('resends the verification mail for the account the signup created', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/signup');
    render(<App accountClient={client} />);

    await userEvent.type(screen.getByLabelText('가입 이메일'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('가입 비밀번호'), 'strong password 2026!');
    await userEvent.type(screen.getByLabelText('가입 비밀번호 확인'), 'strong password 2026!');
    await userEvent.click(screen.getByRole('button', { name: '가입' }));

    await userEvent.click(await screen.findByRole('button', { name: '인증 메일 다시 보내기' }));
    expect(client.resendVerification).toHaveBeenCalledWith('account-1');
  });

  it('refuses to submit while the two passwords differ', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/signup');
    render(<App accountClient={client} />);

    await userEvent.type(screen.getByLabelText('가입 이메일'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('가입 비밀번호'), 'strong password 2026!');
    await userEvent.type(screen.getByLabelText('가입 비밀번호 확인'), 'different password');

    expect(screen.getByRole('alert')).toHaveTextContent('비밀번호가 일치하지 않습니다.');
    expect(screen.getByRole('button', { name: '가입' })).toBeDisabled();
    expect(client.signup).not.toHaveBeenCalled();
  });

  it('explains and enforces the server password length before signup', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/signup');
    render(<App accountClient={client} />);

    const password = screen.getByLabelText('가입 비밀번호');
    expect(screen.getByText('비밀번호는 15자 이상 128자 이하로 입력해 주세요.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('가입 이메일'), 'new@example.com');
    await userEvent.type(password, 'too-short');
    await userEvent.type(screen.getByLabelText('가입 비밀번호 확인'), 'too-short');
    expect(screen.getByRole('button', { name: '가입' })).toBeDisabled();
    expect(client.signup).not.toHaveBeenCalled();
  });

  it('counts Unicode code points the same way as the server password policy', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/signup');
    render(<App accountClient={client} />);

    await userEvent.type(screen.getByLabelText('가입 이메일'), 'emoji@example.com');
    await userEvent.type(screen.getByLabelText('가입 비밀번호'), '😀'.repeat(14));
    await userEvent.type(screen.getByLabelText('가입 비밀번호 확인'), '😀'.repeat(14));

    expect(screen.getByRole('button', { name: '가입' })).toBeDisabled();
    expect(client.signup).not.toHaveBeenCalled();
  });

  it('keeps the signup form with the API code when signup fails', async () => {
    const client = accountClient({
      signup: vi.fn().mockRejectedValue(new AccountApiError(409, 'EMAIL_ALREADY_REGISTERED', 'corr-signup-1')),
    });
    window.history.replaceState({}, '', '/signup');
    render(<App accountClient={client} />);

    await userEvent.type(screen.getByLabelText('가입 이메일'), 'taken@example.com');
    await userEvent.type(screen.getByLabelText('가입 비밀번호'), 'valid password 2026!');
    await userEvent.type(screen.getByLabelText('가입 비밀번호 확인'), 'valid password 2026!');
    await userEvent.click(screen.getByRole('button', { name: '가입' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('EMAIL_ALREADY_REGISTERED');
    expect(screen.getByLabelText('가입 이메일')).toBeInTheDocument();
  });
});

describe('login entry points', () => {
  it('offers 로그인 from the notification popover when the session died server-side', async () => {
    // The bell only renders for signed-in visitors, so this is the mid-session
    // case: the tab still holds a token the server no longer accepts.
    setSessionAccessToken('stale-token');
    const notificationClient: NotificationClient = {
      list: vi.fn().mockRejectedValue(new NotificationApiError(401, 'UNAUTHENTICATED', 'corr-notif-1')),
      markRead: vi.fn(),
      preferences: vi.fn().mockResolvedValue([]),
      replacePreference: vi.fn(),
    };
    window.history.replaceState({}, '', '/help');
    render(<App accountClient={accountClient()} notificationClient={notificationClient} />);

    await userEvent.click(screen.getByRole('button', { name: '알림' }));
    // Signed out mid-session there is nothing behind "알림 전체 보기" either.
    expect(screen.queryByRole('button', { name: /알림 전체 보기/ })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: '로그인' }));

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    // The screen that required authentication is carried as returnTo.
    expect((window.history.state as { usr?: { returnTo?: string } })?.usr?.returnTo).toBe('/help');
  });
});
