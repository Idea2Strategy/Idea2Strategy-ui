import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountApiError } from '../api/account';
import type { AccountClient, AccountPreferences, LifecycleResult, SessionView } from '../api/account';
import { AccountApiPanels } from './AccountApiPanels';

const session: SessionView = {
  sessionId: 'session-1',
  deviceLabel: 'Chrome',
  issuedAt: '2026-08-01T00:00:00Z',
  lastSeenAt: '2026-08-02T00:00:00Z',
  expiresAt: '2026-08-03T00:00:00Z',
  current: true,
};

const preferences: AccountPreferences = {
  languageCode: 'ko',
  timezoneName: 'Asia/Seoul',
  themePreference: 'SYSTEM',
  updatedAt: '2026-08-02T00:00:00Z',
};

const lifecycle: LifecycleResult = {
  accountId: 'account-1',
  status: 'CLOSING',
  version: 2,
  withdrawalRequestedAt: '2026-08-02T00:00:00Z',
  cancellationDeadlineAt: '2026-09-01T00:00:00Z',
  applied: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function client(overrides: Partial<AccountClient> = {}): AccountClient {
  return {
    signup: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    login: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    sessions: vi.fn().mockResolvedValue([session]),
    rotateSession: vi.fn(),
    logoutCurrent: vi.fn(),
    logoutSession: vi.fn(),
    logoutAll: vi.fn(),
    preferences: vi.fn().mockResolvedValue(preferences),
    updatePreferences: vi.fn().mockResolvedValue(preferences),
    requestWithdrawal: vi.fn().mockResolvedValue(lifecycle),
    cancelWithdrawal: vi.fn().mockResolvedValue({ ...lifecycle, status: 'ACTIVE' }),
    reactivateWithPassword: vi.fn().mockResolvedValue({ ...lifecycle, status: 'ACTIVE' }),
    ...overrides,
  };
}

describe('AccountApiPanels', () => {
  it('shows loading until both session and preference requests complete', async () => {
    const sessions = deferred<SessionView[]>();
    const accountClient = client({ sessions: vi.fn().mockReturnValue(sessions.promise) });

    render(<AccountApiPanels client={accountClient} />);

    expect(screen.getByRole('status')).toHaveTextContent('계정 정보를 불러오는 중');
    sessions.resolve([session]);
    expect(await screen.findByRole('heading', { name: '현재 세션' })).toBeInTheDocument();
    expect(screen.getByText('Chrome')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Asia/Seoul')).toBeInTheDocument();
  });

  it('renders a 401 correlation id and retries the initial load', async () => {
    const user = userEvent.setup();
    const sessions = vi.fn()
      .mockRejectedValueOnce(new AccountApiError(401, 'AUTHENTICATION_REQUIRED', 'corr-load-401'))
      .mockResolvedValueOnce([session]);
    const accountClient = client({ sessions });

    render(<AccountApiPanels client={accountClient} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('로그인이 필요합니다.');
    expect(screen.getByRole('alert')).toHaveTextContent('corr-load-401');
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByRole('heading', { name: '현재 세션' })).toBeInTheDocument();
    expect(sessions).toHaveBeenCalledTimes(2);
  });

  it('logs in through the exact email session endpoint and reloads protected account data', async () => {
    const user = userEvent.setup();
    const sessions = vi.fn()
      .mockRejectedValueOnce(new AccountApiError(401, 'AUTHENTICATION_REQUIRED', 'corr-auth'))
      .mockResolvedValueOnce([session]);
    const login = vi.fn().mockResolvedValue({ accountId: 'account-1', sessionId: 'session-1', sessionToken: 'token', expiresAt: session.expiresAt });
    render(<AccountApiPanels client={client({ sessions, login })} />);

    await user.type(await screen.findByLabelText('로그인 이메일'), 'user@example.com');
    await user.type(screen.getByLabelText('로그인 비밀번호'), 'password');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    await screen.findByText('Chrome');
    expect(login).toHaveBeenCalledWith('user@example.com', 'password', 'Web browser');
    expect(sessions).toHaveBeenCalledTimes(2);
  });

  it('offers signup, verification, and non-enumerating recovery while signed out', async () => {
    const user = userEvent.setup();
    const signup = vi.fn().mockResolvedValue({ accountId: 'account-1', verificationExpiresAt: '2026-08-04T00:00:00Z' });
    const verifyEmail = vi.fn().mockResolvedValue({ accountId: 'account-1', status: 'ACTIVE' });
    const requestPasswordReset = vi.fn().mockResolvedValue(undefined);
    const sessions = vi.fn().mockRejectedValue(new AccountApiError(401, 'AUTHENTICATION_REQUIRED', null));
    render(<AccountApiPanels client={client({ sessions, signup, verifyEmail, requestPasswordReset })} />);

    await user.click(await screen.findByText('가입 · 이메일 인증 · 비밀번호 복구'));
    await user.type(screen.getByLabelText('인증 이메일'), 'user@example.com');
    await user.type(screen.getByLabelText('인증 비밀번호'), 'strong-password');
    await user.click(screen.getByRole('button', { name: '가입' }));
    expect(signup).toHaveBeenCalledWith('user@example.com', 'strong-password');

    await user.clear(screen.getByLabelText('인증 토큰'));
    await user.type(screen.getByLabelText('인증 토큰'), 'verify-token');
    await user.click(screen.getByRole('button', { name: '이메일 인증' }));
    expect(verifyEmail).toHaveBeenCalledWith('verify-token');

    await user.click(screen.getByRole('button', { name: '재설정 요청' }));
    expect(requestPasswordReset).toHaveBeenCalledWith('user@example.com');
    expect(screen.getByRole('status')).toHaveTextContent('계정 존재 여부와 관계없이 복구 요청을 접수했습니다.');
  });

  it('renders a 403 action error with correlation evidence and retries safely', async () => {
    const user = userEvent.setup();
    const requestWithdrawal = vi.fn()
      .mockRejectedValueOnce(new AccountApiError(403, 'FORBIDDEN', 'corr-life-403'))
      .mockResolvedValueOnce(lifecycle);
    const accountClient = client({ requestWithdrawal });
    const createIdempotencyKey = vi.fn(() => 'withdrawal-key');

    render(<AccountApiPanels client={accountClient} createIdempotencyKey={createIdempotencyKey} />);
    await screen.findByRole('heading', { name: '계정 생명주기' });
    await user.type(screen.getByRole('textbox', { name: '계정 확인 이메일' }), 'user@example.com');
    fireEvent.change(screen.getByLabelText('계정 확인 비밀번호'), { target: { value: 'password' } });
    await user.click(screen.getByRole('button', { name: '탈퇴 요청' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이 작업을 수행할 권한이 없습니다.');
    expect(screen.getByRole('alert')).toHaveTextContent('corr-life-403');
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByRole('status')).toHaveTextContent('계정 상태: CLOSING');
    expect(requestWithdrawal).toHaveBeenCalledTimes(2);
    expect(requestWithdrawal).toHaveBeenLastCalledWith('user@example.com', 'password', 'withdrawal-key');
    expect(createIdempotencyKey).toHaveBeenCalledTimes(1);
  });

  it('saves server preferences through the injected client', async () => {
    const user = userEvent.setup();
    const updatePreferences = vi.fn().mockResolvedValue({
      ...preferences,
      languageCode: 'en',
      themePreference: 'DARK',
    });
    const accountClient = client({ updatePreferences });

    render(<AccountApiPanels client={accountClient} />);
    await screen.findByRole('heading', { name: '서버 환경설정' });
    await user.selectOptions(screen.getByRole('combobox', { name: '서버 언어 선택' }), 'en');
    await user.selectOptions(screen.getByRole('combobox', { name: '서버 테마 선택' }), 'DARK');
    await user.click(screen.getByRole('button', { name: '서버 설정 저장' }));

    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith({
      languageCode: 'en',
      timezoneName: 'Asia/Seoul',
      themePreference: 'DARK',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('서버 설정을 저장했습니다.');
  });
});
