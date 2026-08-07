import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
    return { accountId: 'account-1', tokenType: 'Bearer', accessToken: 'token-1', accessExpiresAt: '2026-08-06T00:05:00Z', refreshExpiresAt: '2026-09-05T00:00:00Z' };
  }),
  requestPasswordReset: vi.fn().mockResolvedValue(true),
  resetPassword: vi.fn().mockResolvedValue(undefined),
  rotateSession: vi.fn(),
  logoutCurrent: vi.fn(),
  logoutAll: vi.fn(),
  preferences: vi.fn().mockRejectedValue(new AccountApiError(401, 'UNAUTHENTICATED', null)),
  updatePreferences: vi.fn(),
  requestWithdrawal: vi.fn(),
  cancelWithdrawal: vi.fn(),
  ...overrides,
});

afterEach(() => {
  cleanup();
  setSessionAccessToken(null);
  window.history.replaceState({}, '', '/');
});

describe('customer login screen', () => {
  it('does not expose a separate account reactivation flow from login', async () => {
    window.history.replaceState({}, '', '/login');
    render(<App accountClient={accountClient()} />);

    const loginHeading = await screen.findByRole('heading', { name: '로그인' });
    expect(within(loginHeading.closest('.auth-panel')!).getByRole('img', { name: 'Idea2Strategy' })).toBeInTheDocument();
    expect(screen.queryByText('ACCOUNT / SIGN IN')).not.toBeInTheDocument();
    expect(screen.queryByText('이메일과 비밀번호로 로그인합니다. 로그인 정보는 안전한 쿠키와 현재 브라우저 탭에만 유지됩니다.')).not.toBeInTheDocument();
    expect(screen.queryByText('휴면 또는 닫힌 계정인가요?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '계정 재활성화' })).not.toBeInTheDocument();
  });

  it('redirects the retired reactivation URL to login', async () => {
    window.history.replaceState({}, '', '/reactivate');
    render(<App accountClient={accountClient()} />);

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument();
  });

  it('logs in through the real client and lands on the account page by default', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/login');
    render(<App accountClient={client} />);

    await screen.findByLabelText('로그인 이메일');
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

    await screen.findByLabelText('로그인 이메일');
    await userEvent.type(screen.getByLabelText('로그인 이메일'), 'customer@example.com');
    await userEvent.type(screen.getByLabelText('로그인 비밀번호'), 'valid password 2026!');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => expect(window.location.pathname).toBe('/bots'));
  });

  it('reveals and hides the login password without changing its value', async () => {
    window.history.replaceState({}, '', '/login');
    render(<App accountClient={accountClient()} />);

    const password = await screen.findByLabelText('로그인 비밀번호');
    await userEvent.type(password, 'visible password 2026!');
    expect(password).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: '로그인 비밀번호 표시' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('visible password 2026!');

    await userEvent.click(screen.getByRole('button', { name: '로그인 비밀번호 숨기기' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveValue('visible password 2026!');
  });

  it('shows the API failure code and correlation id instead of pretending success', async () => {
    const client = accountClient({
      login: vi.fn().mockRejectedValue(new AccountApiError(401, 'INVALID_CREDENTIALS', 'corr-login-1')),
    });
    window.history.replaceState({}, '', '/login');
    render(<App accountClient={client} />);

    await screen.findByLabelText('로그인 이메일');
    await userEvent.type(screen.getByLabelText('로그인 이메일'), 'customer@example.com');
    await userEvent.type(screen.getByLabelText('로그인 비밀번호'), 'wrong password 2026!');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('INVALID_CREDENTIALS');
    expect(alert).toHaveTextContent('corr-login-1');
    expect(window.location.pathname).toBe('/login');
    expect(screen.getByLabelText('로그인 이메일')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('로그인 비밀번호')).toHaveAttribute('aria-invalid', 'true');
  });

  it('highlights invalid fields with specific email and password guidance after submit', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/login');
    render(<App accountClient={client} />);

    const email = await screen.findByLabelText('로그인 이메일');
    const password = screen.getByLabelText('로그인 비밀번호');
    expect(email).not.toHaveAttribute('aria-invalid', 'true');
    expect(password).not.toHaveAttribute('aria-invalid', 'true');

    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(screen.getByText('이메일을 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('비밀번호를 입력해 주세요.')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAttribute('aria-invalid', 'true');

    await userEvent.type(email, 'not-an-email');
    await userEvent.type(password, 'too-short');
    expect(screen.getByText('올바른 이메일 주소를 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('비밀번호는 15자 이상이어야 합니다.')).toBeInTheDocument();
    expect(client.login).not.toHaveBeenCalled();
  });

  it('walks email, verification code and new password as separate recovery steps', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/login');
    render(<App accountClient={client} />);

    expect(screen.queryByLabelText('재설정 이메일')).not.toBeInTheDocument();
    const loginPassword = await screen.findByLabelText('로그인 비밀번호');
    const loginForm = loginPassword.closest('form');
    expect(loginForm).not.toBeNull();
    expect(within(loginForm!).getByRole('button', { name: '로그인 비밀번호 표시' })).toBeInTheDocument();
    expect(within(loginForm!).getByRole('button', { name: '비밀번호를 잊으셨나요?' })).toBeInTheDocument();
    expect(within(loginForm!).getByRole('button', { name: '로그인' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '비밀번호를 잊으셨나요?' }));

    await waitFor(() => expect(window.location.pathname).toBe('/password-reset'));
    const resetHeading = await screen.findByRole('heading', { name: '비밀번호 재설정' });
    expect(within(resetHeading.closest('.auth-panel')!).getByRole('img', { name: 'Idea2Strategy' })).toBeInTheDocument();
    expect(screen.getByText('가입한 이메일을 입력하세요.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('재설정 이메일'), 'customer@example.com');
    await userEvent.click(screen.getByRole('button', { name: '인증 코드 받기' }));
    expect(client.requestPasswordReset).toHaveBeenCalledWith('customer@example.com');

    expect(await screen.findByRole('heading', { name: '인증 코드 입력' })).toBeInTheDocument();
    expect(screen.getByText('이메일로 받은 인증 코드를 입력하세요.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('인증 코드를 보냈습니다.');
    expect(screen.getByText('customer@example.com')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('인증 코드'), 'reset-token');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(await screen.findByRole('heading', { name: '새 비밀번호 설정' })).toBeInTheDocument();
    expect(screen.getByText('15자 이상 128자 이하로 입력하세요.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('새 비밀번호'), 'new password 2026!');
    await userEvent.type(screen.getByLabelText('새 비밀번호 확인'), 'new password 2026!');
    await userEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }));
    expect(client.resetPassword).toHaveBeenCalledWith('reset-token', 'new password 2026!');
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.');
  });

  it('reveals each password independently while setting a replacement password', async () => {
    window.history.replaceState({}, '', '/password-reset');
    render(<App accountClient={accountClient()} />);

    await userEvent.type(await screen.findByLabelText('재설정 이메일'), 'customer@example.com');
    await userEvent.click(screen.getByRole('button', { name: '인증 코드 받기' }));
    await userEvent.type(await screen.findByLabelText('인증 코드'), 'reset-token');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    const password = await screen.findByLabelText('새 비밀번호');
    const confirmation = screen.getByLabelText('새 비밀번호 확인');
    await userEvent.type(password, 'replacement password 2026!');
    await userEvent.type(confirmation, 'replacement password 2026!');

    await userEvent.click(screen.getByRole('button', { name: '새 비밀번호 표시' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(confirmation).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: '새 비밀번호 확인 표시' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(confirmation).toHaveAttribute('type', 'text');
  });

  it.each(['/login', '/signup'])('redirects an authenticated direct visit away from %s', async (path) => {
    setSessionAccessToken('already-signed-in');
    window.history.replaceState({}, '', path);
    render(<App accountClient={accountClient()} />);

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.queryByRole('heading', { name: path === '/login' ? '로그인' : '가입' })).not.toBeInTheDocument();
  });
});

describe('customer signup screen', () => {
  it('reveals each signup password independently from its trailing eye button', async () => {
    window.history.replaceState({}, '', '/signup');
    render(<App accountClient={accountClient()} />);

    const password = await screen.findByLabelText('가입 비밀번호');
    const confirmation = screen.getByLabelText('가입 비밀번호 확인');
    await userEvent.type(password, 'signup password 2026!');
    await userEvent.type(confirmation, 'signup password 2026!');

    await userEvent.click(screen.getByRole('button', { name: '가입 비밀번호 표시' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(confirmation).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: '가입 비밀번호 확인 표시' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(confirmation).toHaveAttribute('type', 'text');
  });

  it('walks signup, verification and the hop to login as separate confirmed steps', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/signup');
    render(<App accountClient={client} />);

    const signupEmail = await screen.findByLabelText('가입 이메일');
    expect(within(signupEmail.closest('.auth-panel')!).getByRole('img', { name: 'Idea2Strategy' })).toBeInTheDocument();
    expect(screen.queryByText('ACCOUNT / SIGN UP')).not.toBeInTheDocument();
    expect(screen.queryByText('가입 후 이메일로 받은 인증 토큰을 입력해야 로그인할 수 있습니다.')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('가입 이메일'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('가입 비밀번호'), 'strong password 2026!');
    await userEvent.type(screen.getByLabelText('가입 비밀번호 확인'), 'strong password 2026!');
    await userEvent.click(screen.getByRole('button', { name: '가입' }));
    expect(client.signup).toHaveBeenCalledWith('new@example.com', 'strong password 2026!');

    const verificationToken = await screen.findByLabelText('가입 인증 코드');
    expect(screen.getByRole('status')).toHaveTextContent('이메일로 보낸 인증 코드를 입력하세요.');
    await userEvent.click(screen.getByRole('button', { name: '이메일 인증' }));
    expect(screen.getByText('인증 코드를 입력해 주세요.')).toBeInTheDocument();
    expect(verificationToken).toHaveAttribute('aria-invalid', 'true');

    await userEvent.type(verificationToken, 'verification-token');
    await userEvent.click(screen.getByRole('button', { name: '이메일 인증' }));
    expect(client.verifyEmail).toHaveBeenCalledWith('verification-token');
    expect(await screen.findByRole('status')).toHaveTextContent('이메일 인증이 완료되었습니다.');

    await userEvent.click(await screen.findByRole('button', { name: '로그인하러 가기' }));
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });

  it('resends the verification mail for the account the signup created', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/signup');
    render(<App accountClient={client} />);

    await screen.findByLabelText('가입 이메일');
    await userEvent.type(screen.getByLabelText('가입 이메일'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('가입 비밀번호'), 'strong password 2026!');
    await userEvent.type(screen.getByLabelText('가입 비밀번호 확인'), 'strong password 2026!');
    await userEvent.click(screen.getByRole('button', { name: '가입' }));

    await userEvent.click(await screen.findByRole('button', { name: '인증 메일 다시 보내기' }));
    expect(client.resendVerification).toHaveBeenCalledWith('account-1');
    expect(await screen.findByText(/인증 메일을 다시 보냈습니다\./)).toBeInTheDocument();
  });

  it('refuses to submit while the two passwords differ', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/signup');
    render(<App accountClient={client} />);

    await screen.findByLabelText('가입 이메일');
    await userEvent.type(screen.getByLabelText('가입 이메일'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('가입 비밀번호'), 'strong password 2026!');
    await userEvent.type(screen.getByLabelText('가입 비밀번호 확인'), 'different password');

    await userEvent.click(screen.getByRole('button', { name: '가입' }));
    expect(screen.getByRole('alert')).toHaveTextContent('비밀번호가 일치하지 않습니다.');
    expect(screen.getByLabelText('가입 비밀번호 확인')).toHaveAttribute('aria-invalid', 'true');
    expect(client.signup).not.toHaveBeenCalled();
  });

  it('explains and highlights each invalid signup field after submit', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/signup');
    render(<App accountClient={client} />);

    const password = await screen.findByLabelText('가입 비밀번호');
    expect(screen.queryByText('비밀번호는 15자 이상 128자 이하로 입력해 주세요.')).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('가입 이메일'), 'not-an-email');
    await userEvent.type(password, 'too-short');
    await userEvent.type(screen.getByLabelText('가입 비밀번호 확인'), 'too-short');
    expect(screen.queryByText('비밀번호는 15자 이상이어야 합니다.')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '가입' }));
    expect(screen.getByText('올바른 이메일 주소를 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('비밀번호는 15자 이상이어야 합니다.')).toBeInTheDocument();
    expect(screen.getByLabelText('가입 이메일')).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(client.signup).not.toHaveBeenCalled();
  });

  it('distinguishes a password over the maximum length', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/signup');
    render(<App accountClient={client} />);

    const tooLong = 'a'.repeat(129);
    await userEvent.type(await screen.findByLabelText('가입 이메일'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('가입 비밀번호'), tooLong);
    await userEvent.type(screen.getByLabelText('가입 비밀번호 확인'), tooLong);
    await userEvent.click(screen.getByRole('button', { name: '가입' }));

    expect(screen.getByText('비밀번호는 128자 이하여야 합니다.')).toBeInTheDocument();
    expect(screen.getByLabelText('가입 비밀번호')).toHaveAttribute('aria-invalid', 'true');
    expect(client.signup).not.toHaveBeenCalled();
  });

  it('counts Unicode code points the same way as the server password policy', async () => {
    const client = accountClient();
    window.history.replaceState({}, '', '/signup');
    render(<App accountClient={client} />);

    await userEvent.type(await screen.findByLabelText('가입 이메일'), 'emoji@example.com');
    await userEvent.type(screen.getByLabelText('가입 비밀번호'), '😀'.repeat(14));
    await userEvent.type(screen.getByLabelText('가입 비밀번호 확인'), '😀'.repeat(14));

    await userEvent.click(screen.getByRole('button', { name: '가입' }));
    expect(screen.getByText('비밀번호는 15자 이상이어야 합니다.')).toBeInTheDocument();
    expect(client.signup).not.toHaveBeenCalled();
  });

  it('keeps the signup form with the API code when signup fails', async () => {
    const client = accountClient({
      signup: vi.fn().mockRejectedValue(new AccountApiError(409, 'EMAIL_ALREADY_REGISTERED', 'corr-signup-1')),
    });
    window.history.replaceState({}, '', '/signup');
    render(<App accountClient={client} />);

    await userEvent.type(await screen.findByLabelText('가입 이메일'), 'taken@example.com');
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
