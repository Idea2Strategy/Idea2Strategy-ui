import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountApiError } from '../api/account';
import type { AccountClient, AccountPreferences, LifecycleResult, SessionView } from '../api/account';
import { getSessionAccessToken, setSessionTokens } from '../api/sessionAccessToken';
import { browserSessionStore, SESSION_STORAGE_KEY } from '../lib/session';
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

/*
  The signed-in decision lives in two stores: the in-memory token and the tab
  session. Tests that seed them must leave both empty for the next test.
*/
function seedTabSession() {
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
    accessToken: 'dead-token',
    accountId: 'account-1',
    expiresAt: '2099-01-01T00:00:00Z',
  }));
  setSessionTokens('dead-token', null);
}

afterEach(() => {
  setSessionTokens(null, null);
  browserSessionStore.signOut();
});

describe('AccountApiPanels', () => {
  it('shows loading until both session and preference requests complete', async () => {
    const sessions = deferred<SessionView[]>();
    const accountClient = client({ sessions: vi.fn().mockReturnValue(sessions.promise) });

    render(<AccountApiPanels client={accountClient} />);

    expect(screen.getByRole('status')).toHaveTextContent('계정 정보를 불러오는 중');
    sessions.resolve([session]);
    expect(await screen.findByRole('heading', { name: '로그인 세션' })).toBeInTheDocument();
    expect(screen.getByText('Chrome')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Asia/Seoul')).toBeInTheDocument();
  });

  it('publishes the server preference on load so the active locale can follow the account', async () => {
    const onPreferences = vi.fn();
    render(<AccountApiPanels client={client({ preferences: vi.fn().mockResolvedValue({ ...preferences, languageCode: 'en' }) })} onPreferences={onPreferences} />);
    await screen.findByRole('heading', { name: '로그인 세션' });
    expect(onPreferences).toHaveBeenCalledWith(expect.objectContaining({ languageCode: 'en' }));
  });

  it('renders a 401 as the shared sign-in state and drops the rejected session', async () => {
    seedTabSession();
    const sessions = vi.fn()
      .mockRejectedValue(new AccountApiError(401, 'AUTHENTICATION_REQUIRED', 'corr-load-401'));
    const accountClient = client({ sessions });

    render(<AccountApiPanels client={accountClient} />);

    // Signed-out is the server answering as designed: the shared sign-in state,
    // not a failure alert leaking the raw code and correlation id.
    expect(await screen.findByText('로그인이 필요합니다')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/AUTHENTICATION_REQUIRED/)).toBeNull();
    expect(screen.queryByText(/corr-load-401/)).toBeNull();
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
    // The dead session is gone from both stores, so the route guard redirects
    // to the dedicated /login screen instead of leaving a signed-in shell. The
    // inline login and signup forms are that screen's job, not this panel's.
    expect(getSessionAccessToken()).toBeNull();
    expect(browserSessionStore.read()).toEqual({ status: 'anonymous', reason: 'rejected' });
    expect(screen.queryByLabelText('로그인 이메일')).toBeNull();
    expect(screen.queryByText('가입 · 이메일 인증 · 비밀번호 복구')).toBeNull();
  });

  it('signs the tab out through the exact session endpoint', async () => {
    const user = userEvent.setup();
    const logoutCurrent = vi.fn().mockResolvedValue(undefined);
    render(<AccountApiPanels client={client({ logoutCurrent })} />);

    await user.click(await screen.findByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(logoutCurrent).toHaveBeenCalledTimes(1));
  });

  it('still signs the tab out locally when the logout request fails', async () => {
    const user = userEvent.setup();
    seedTabSession();
    const logoutCurrent = vi.fn().mockRejectedValue(new AccountApiError(0, 'NETWORK_ERROR', null));
    render(<AccountApiPanels client={client({ logoutCurrent })} />);

    await user.click(await screen.findByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(getSessionAccessToken()).toBeNull());
    expect(browserSessionStore.read().status).toBe('anonymous');
  });

  it('lists every server session and revokes a selected remote session', async () => {
    const user = userEvent.setup();
    const remote = { ...session, sessionId: 'session-2', deviceLabel: 'Safari', current: false };
    const sessions = vi.fn().mockResolvedValueOnce([session, remote]).mockResolvedValueOnce([session]);
    const logoutSession = vi.fn().mockResolvedValue(undefined);

    render(<AccountApiPanels client={client({ sessions, logoutSession })} />);

    expect(await screen.findByText('Safari')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '세션 해제' }));
    await waitFor(() => expect(logoutSession).toHaveBeenCalledWith('session-2'));
    await waitFor(() => expect(screen.queryByText('Safari')).toBeNull());
  });

  it('rotates the current token pair and can revoke every session', async () => {
    const user = userEvent.setup();
    seedTabSession();
    const rotateSession = vi.fn().mockResolvedValue({});
    const logoutAll = vi.fn().mockResolvedValue(undefined);
    render(<AccountApiPanels client={client({ rotateSession, logoutAll })} />);

    await user.click(await screen.findByRole('button', { name: '현재 토큰 갱신' }));
    await waitFor(() => expect(rotateSession).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: '모든 기기에서 로그아웃' }));
    await waitFor(() => expect(logoutAll).toHaveBeenCalledTimes(1));
    expect(getSessionAccessToken()).toBeNull();
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
    // The destructive actions sit behind the danger-zone fold.
    await user.click(screen.getByText('탈퇴 요청 · 취소 · 재활성화'));
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
