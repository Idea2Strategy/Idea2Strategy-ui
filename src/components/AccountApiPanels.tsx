import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3, KeyRound, Languages, Loader2, LockKeyhole, LogOut, MonitorSmartphone, Settings, ShieldCheck, X } from 'lucide-react';
import type {
  AccountClient,
  AccountPreferences,
  LifecycleResult,
  SessionView,
} from '../api/account';
import { AccountApiError } from '../api/account';
import { setSessionAccessToken } from '../api/sessionAccessToken';
import { browserSessionStore } from '../lib/session';
import { Button, ErrorState, Panel, SignInRequiredState, Status } from './common';

/*
  The route guard decides "signed in" from the in-memory token and the tab
  session store. Dropping both is what turns a server-refused credential into
  the sign-in redirect; leaving either one populated keeps the guard convinced
  and strands the visitor on a page whose every request 401s.
*/
function dropTabSession(reason?: 'rejected') {
  setSessionAccessToken(null);
  browserSessionStore.signOut(reason);
}

interface AccountApiPanelsProps {
  client: AccountClient;
  createIdempotencyKey?: () => string;
  onPreferences?: (preferences: AccountPreferences) => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; error: AccountApiError }
  | { kind: 'ready'; sessions: SessionView[]; preferences: AccountPreferences };

type ActionState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'error'; error: AccountApiError; retry: () => void }
  | { kind: 'saved' }
  | { kind: 'lifecycle'; result: LifecycleResult };

const fallbackError = (error: unknown) => error instanceof AccountApiError
  ? error
  : new AccountApiError(0, 'NETWORK_ERROR', null);

export function AccountApiPanels({
  client,
  createIdempotencyKey = () => crypto.randomUUID(),
  onPreferences,
}: AccountApiPanelsProps) {
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [preferenceState, setPreferenceState] = useState<ActionState>({ kind: 'idle' });
  const [lifecycleState, setLifecycleState] = useState<ActionState>({ kind: 'idle' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sessionAction, setSessionAction] = useState<{ kind: 'idle' | 'pending' | 'saved' } | { kind: 'error'; error: AccountApiError }>({ kind: 'idle' });
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setLoadState({ kind: 'loading' });
    setPreferenceState({ kind: 'idle' });
    setLifecycleState({ kind: 'idle' });
    Promise.all([client.sessions(controller.signal), client.preferences(controller.signal)])
      .then(([sessions, preferences]) => {
        if (current) {
          setLoadState({ kind: 'ready', sessions, preferences });
          onPreferences?.(preferences);
        }
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        const resolved = fallbackError(error);
        /* The guard let this render because a stored session looked alive, yet
           the server refused it: the token is dead however good it looked
           locally. Recording that flips the guard, which owns the way back to
           the sign-in screen. */
        if (resolved.status === 401) dropTabSession('rejected');
        setLoadState({ kind: 'error', error: resolved });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [client, loadAttempt, onPreferences]);

  const updateDraft = (patch: Partial<AccountPreferences>) => {
    setLoadState((current) => current.kind === 'ready'
      ? { ...current, preferences: { ...current.preferences, ...patch } }
      : current);
    setPreferenceState({ kind: 'idle' });
  };

  const savePreferences = useCallback(async () => {
    if (loadState.kind !== 'ready') return;
    const input = {
      languageCode: loadState.preferences.languageCode,
      timezoneName: loadState.preferences.timezoneName,
      themePreference: loadState.preferences.themePreference,
    };
    setPreferenceState({ kind: 'pending' });
    try {
      const preferences = await client.updatePreferences(input);
      setLoadState((current) => current.kind === 'ready' ? { ...current, preferences } : current);
      onPreferences?.(preferences);
      setPreferenceState({ kind: 'saved' });
    } catch (error) {
      setPreferenceState({ kind: 'error', error: fallbackError(error), retry: () => void savePreferences() });
    }
  }, [client, loadState, onPreferences]);

  const refreshSessions = useCallback(async () => {
    const sessions = await client.sessions();
    setLoadState((current) => current.kind === 'ready' ? { ...current, sessions } : current);
  }, [client]);

  const revoke = useCallback(async (session: SessionView) => {
    setSessionAction({ kind: 'pending' });
    try {
      if (session.current) {
        await client.logoutCurrent();
        dropTabSession();
        return;
      }
      await client.logoutSession(session.sessionId);
      await refreshSessions();
      setSessionAction({ kind: 'saved' });
    } catch (cause) {
      if (session.current) dropTabSession();
      else setSessionAction({ kind: 'error', error: fallbackError(cause) });
    }
  }, [client, refreshSessions]);

  const revokeAll = useCallback(async () => {
    setConfirmAllOpen(false);
    setSessionAction({ kind: 'pending' });
    try { await client.logoutAll(); }
    catch { /* The local session must still end when the remote session API is unavailable. */ }
    finally { dropTabSession(); }
  }, [client]);

  const runLifecycle = useCallback(async (
    operation: 'withdraw' | 'cancel',
    retryKey?: string,
  ) => {
    setLifecycleState({ kind: 'pending' });
    const key = retryKey ?? createIdempotencyKey();
    try {
      const result = operation === 'withdraw'
        ? await client.requestWithdrawal(email, password, key)
        : await client.cancelWithdrawal(email, password, key);
      setPassword('');
      setLifecycleState({ kind: 'lifecycle', result });
    } catch (error) {
      setLifecycleState({
        kind: 'error',
        error: fallbackError(error),
        retry: () => void runLifecycle(operation, key),
      });
    }
  }, [client, createIdempotencyKey, email, password]);

  if (loadState.kind === 'loading') {
    return <Panel className="account-api-state" title="계정 정보">
      <div role="status"><Loader2 size={18} aria-hidden="true" />계정 정보를 불러오는 중입니다.</div>
    </Panel>;
  }

  if (loadState.kind === 'error') {
    return <Panel className="account-api-state" title="계정 정보">
      <ApiErrorState error={loadState.error} onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
    </Panel>;
  }

  return <>
    <section className="account-section account-security-section" id="account-security" aria-labelledby="account-security-title">
      <header className="account-section-heading">
        <span className="account-section-icon"><ShieldCheck size={20} aria-hidden="true" /></span>
        <div><h2 id="account-security-title">로그인 및 보안</h2><p>로그인된 브라우저를 확인하고 필요 없는 세션을 종료하세요.</p></div>
        <Button className="account-signout-all" onClick={() => setConfirmAllOpen(true)} disabled={sessionAction.kind === 'pending' || loadState.sessions.length === 0}>모든 기기에서 로그아웃</Button>
      </header>
      <div className="account-session-summary"><MonitorSmartphone size={16} aria-hidden="true" /><span>활성 세션</span><strong>{loadState.sessions.length}</strong></div>
      <div className="account-session-list">
        {loadState.sessions.map((session) => {
          const deviceLabel = session.deviceLabel || '알 수 없는 기기';
          return <article className={`account-session-row ${session.current ? 'is-current' : ''}`} key={session.sessionId}>
            <span className="account-session-icon"><KeyRound size={18} aria-hidden="true" /></span>
            <span className="account-session-copy">
              <span><strong>{deviceLabel}</strong>{session.current && <Status tone="positive">현재 기기</Status>}</span>
              <small>최근 활동 {formatSessionDate(session.lastSeenAt ?? session.issuedAt)}</small>
              <small>세션 만료 {formatSessionDate(session.expiresAt)}</small>
            </span>
            {!session.current && <Button aria-label={`${deviceLabel} 세션에서 로그아웃`} onClick={() => void revoke(session)} disabled={sessionAction.kind === 'pending'}>로그아웃</Button>}
          </article>;
        })}
        {loadState.sessions.length === 0 && <div className="account-session-empty"><MonitorSmartphone size={20} aria-hidden="true" /><p>활성 로그인 세션이 없습니다.</p></div>}
      </div>
      {sessionAction.kind === 'pending' && <p role="status">세션 요청을 처리하는 중입니다.</p>}
      {sessionAction.kind === 'saved' && <p role="status">세션 상태를 최신화했습니다.</p>}
      {sessionAction.kind === 'error' && <ApiErrorState error={sessionAction.error} onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />}
    </section>

    <section className="account-section account-environment-section" id="account-environment" aria-labelledby="account-environment-title">
      <header className="account-section-heading">
        <span className="account-section-icon"><Settings size={20} aria-hidden="true" /></span>
        <div><h2 id="account-environment-title">서비스 환경</h2><p>계정에 저장되는 언어를 관리합니다. 화면 테마는 상단 설정에서 변경할 수 있습니다.</p></div>
      </header>
      <div className="account-environment-grid">
        <label>
          <span><Languages size={15} aria-hidden="true" />언어</span>
          <select aria-label="서버 언어 선택" value={loadState.preferences.languageCode}
            onChange={(event) => updateDraft({ languageCode: event.target.value })}>
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </label>
        <div className="account-readonly-group">
          <span><Clock3 size={15} aria-hidden="true" />시간대</span>
          <div className="account-readonly-field" aria-label="서버 시간대">
            <span><strong>한국 표준시</strong><small>{loadState.preferences.timezoneName}</small></span>
            <LockKeyhole size={16} aria-hidden="true" />
          </div>
          <small>거래 시각의 일관성을 위해 시간대는 변경할 수 없습니다.</small>
        </div>
      </div>
      <footer className="account-section-footer"><Button onClick={() => void savePreferences()} disabled={preferenceState.kind === 'pending'}>{preferenceState.kind === 'pending' ? '저장 중' : '환경 저장'}</Button></footer>
      {preferenceState.kind === 'pending' && <p role="status">서버 설정을 저장하는 중입니다.</p>}
      {preferenceState.kind === 'saved' && <p role="status">서버 설정을 저장했습니다.</p>}
      {preferenceState.kind === 'error' && <ApiErrorState error={preferenceState.error} onRetry={preferenceState.retry} />}
    </section>

    <section className="account-section account-danger-section" id="account-management" aria-labelledby="account-management-title">
      <header className="account-section-heading">
        <span className="account-section-icon is-danger"><LockKeyhole size={20} aria-hidden="true" /></span>
        <div><h2 id="account-management-title">계정 관리</h2><p>탈퇴 요청과 취소는 서버 정책에 따라 처리됩니다.</p></div>
      </header>
      {/* Destructive account actions stay behind a deliberate extra open: the
          fold keeps them off the page's default reading path. */}
      <details className="account-danger-zone">
        <summary>탈퇴 요청 · 취소</summary>
        <div className="settings-fields account-api-fields">
          <label><span>이메일</span><input aria-label="계정 확인 이메일" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label><span>비밀번호</span><input aria-label="계정 확인 비밀번호" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        </div>
        <div className="account-api-actions">
          <Button onClick={() => void runLifecycle('withdraw')} disabled={!email || !password || lifecycleState.kind === 'pending'}>탈퇴 요청</Button>
          <Button onClick={() => void runLifecycle('cancel')} disabled={!email || !password || lifecycleState.kind === 'pending'}>탈퇴 취소</Button>
        </div>
        {lifecycleState.kind === 'pending' && <p role="status">서버가 요청을 처리하는 중입니다.</p>}
        {lifecycleState.kind === 'lifecycle' && <p role="status">계정 상태: {lifecycleState.result.status} · 버전 {lifecycleState.result.version}</p>}
        {lifecycleState.kind === 'error' && <ApiErrorState error={lifecycleState.error} onRetry={lifecycleState.retry} />}
      </details>
    </section>

    {confirmAllOpen && <AccountSignOutAllDialog onCancel={() => setConfirmAllOpen(false)} onConfirm={() => void revokeAll()} />}
  </>;
}

function AccountSignOutAllDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const focusable = () => dialog ? [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled)')] : [];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return <div className="account-confirm-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onCancel(); }}>
    <section className="account-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="account-confirm-title" ref={dialogRef}>
      <button type="button" className="account-dialog-close" aria-label="전체 로그아웃 확인 닫기" onClick={onCancel}><X size={17} aria-hidden="true" /></button>
      <span className="account-confirm-icon"><LogOut size={22} aria-hidden="true" /></span>
      <h2 id="account-confirm-title">모든 기기에서 로그아웃할까요?</h2>
      <p>현재 기기를 포함한 모든 브라우저 세션이 종료되며 다시 로그인해야 합니다.</p>
      <div><Button onClick={onCancel}>취소</Button><Button kind="primary" onClick={onConfirm}>모든 기기에서 로그아웃</Button></div>
    </section>
  </div>;
}

export function AccountSignOutButton({ client }: { client: AccountClient }) {
  const [pending, setPending] = useState(false);
  const signOut = async () => {
    setPending(true);
    try { await client.logoutCurrent(); }
    catch { /* Local sign-out remains authoritative when the server is unreachable. */ }
    finally { dropTabSession(); }
  };
  return <Button className="account-signout-button" kind="ghost" icon={LogOut} onClick={() => void signOut()} disabled={pending}>{pending ? '로그아웃 중' : '로그아웃'}</Button>;
}

function formatSessionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function ApiErrorState({ error, onRetry }: { error: AccountApiError; onRetry: () => void }) {
  if (error.status === 401) {
    /* Signed-out is the server answering as designed, so it renders through the
       shared sign-in state — no raw error code, no retry button. The session
       stores were already dropped, so the route guard is taking this page to
       the dedicated sign-in screen. */
    return <SignInRequiredState detail="세션이 만료되었거나 서버가 로그인을 거부했습니다. 로그인 화면으로 이동합니다." />;
  }
  const message = error.status === 403
    ? '이 작업을 수행할 권한이 없습니다.'
    : '계정 서버 요청에 실패했습니다.';
  return <ErrorState
    title={message}
    detail={<>오류 코드 {error.code}{error.correlationId && <> · 문의 코드 {error.correlationId}</>}</>}
    onRetry={onRetry}
  />;
}
