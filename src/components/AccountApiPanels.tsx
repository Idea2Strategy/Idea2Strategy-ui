import { useCallback, useEffect, useState } from 'react';
import { Languages, Loader2, LockKeyhole, LogOut, Settings, ShieldCheck } from 'lucide-react';
import type { AccountClient, AccountPreferences, LifecycleResult } from '../api/account';
import { AccountApiError } from '../api/account';
import { setSessionAccessToken } from '../api/sessionAccessToken';
import { browserSessionStore } from '../lib/session';
import { Button, ErrorState, Panel, SignInRequiredState } from './common';

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
  | { kind: 'ready'; preferences: AccountPreferences };

type ActionState =
  | { kind: 'idle' | 'pending' | 'saved' }
  | { kind: 'error'; error: AccountApiError; retry: () => void }
  | { kind: 'lifecycle'; result: LifecycleResult };

const fallbackError = (error: unknown) => error instanceof AccountApiError
  ? error
  : new AccountApiError(0, 'NETWORK_ERROR', null);

export function AccountApiPanels({
  client,
  createIdempotencyKey = () => crypto.randomUUID(),
  onPreferences,
}: AccountApiPanelsProps) {
  const [attempt, setAttempt] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [securityState, setSecurityState] = useState<ActionState>({ kind: 'idle' });
  const [preferenceState, setPreferenceState] = useState<ActionState>({ kind: 'idle' });
  const [lifecycleState, setLifecycleState] = useState<ActionState>({ kind: 'idle' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setLoadState({ kind: 'loading' });
    client.preferences(controller.signal).then((preferences) => {
      if (!current) return;
      setLoadState({ kind: 'ready', preferences });
      onPreferences?.(preferences);
    }).catch((cause: unknown) => {
      if (!current || controller.signal.aborted) return;
      const error = fallbackError(cause);
      if (error.status === 401) dropTabSession('rejected');
      setLoadState({ kind: 'error', error });
    });
    return () => { current = false; controller.abort(); };
  }, [attempt, client, onPreferences]);

  const updateDraft = (patch: Partial<AccountPreferences>) => {
    setLoadState((current) => current.kind === 'ready'
      ? { ...current, preferences: { ...current.preferences, ...patch } }
      : current);
    setPreferenceState({ kind: 'idle' });
  };

  const savePreferences = useCallback(async () => {
    if (loadState.kind !== 'ready') return;
    setPreferenceState({ kind: 'pending' });
    try {
      const { languageCode, timezoneName, themePreference } = loadState.preferences;
      const preferences = await client.updatePreferences({ languageCode, timezoneName, themePreference });
      setLoadState({ kind: 'ready', preferences });
      onPreferences?.(preferences);
      setPreferenceState({ kind: 'saved' });
    } catch (cause) {
      setPreferenceState({ kind: 'error', error: fallbackError(cause), retry: () => void savePreferences() });
    }
  }, [client, loadState, onPreferences]);

  const logout = useCallback(async (all: boolean) => {
    setSecurityState({ kind: 'pending' });
    try {
      if (all) await client.logoutAll();
      else await client.logoutCurrent();
    } catch {
      // Local logout must still complete when the server is temporarily unavailable.
    } finally {
      dropTabSession();
    }
  }, [client]);

  const runLifecycle = useCallback(async (operation: 'withdraw' | 'cancel', retryKey?: string) => {
    setLifecycleState({ kind: 'pending' });
    const key = retryKey ?? createIdempotencyKey();
    try {
      const result = operation === 'withdraw'
        ? await client.requestWithdrawal(email, password, key)
        : await client.cancelWithdrawal(email, password, key);
      setPassword('');
      setLifecycleState({ kind: 'lifecycle', result });
    } catch (cause) {
      setLifecycleState({
        kind: 'error', error: fallbackError(cause), retry: () => void runLifecycle(operation, key),
      });
    }
  }, [client, createIdempotencyKey, email, password]);

  if (loadState.kind === 'loading') {
    return <Panel className="account-api-state" title="계정 정보"><div role="status"><Loader2 size={18} />계정 정보를 불러오는 중입니다.</div></Panel>;
  }
  if (loadState.kind === 'error') {
    return <Panel className="account-api-state" title="계정 정보"><ApiErrorState error={loadState.error} onRetry={() => setAttempt((value) => value + 1)} /></Panel>;
  }

  return <>
    <section className="account-section account-security-section" id="account-security" aria-labelledby="account-security-title">
      <header className="account-section-heading">
        <span className="account-section-icon"><ShieldCheck size={20} aria-hidden="true" /></span>
        <div><h2 id="account-security-title">로그인 및 보안</h2><p>JWT 로그인은 기기 수를 제한하지 않습니다.</p></div>
      </header>
      <div className="account-api-actions">
        <Button onClick={() => void logout(false)} disabled={securityState.kind === 'pending'}>로그아웃</Button>
        <Button onClick={() => void logout(true)} disabled={securityState.kind === 'pending'}>모든 기기에서 로그아웃</Button>
      </div>
      {securityState.kind === 'pending' && <p role="status">로그아웃 요청을 처리하는 중입니다.</p>}
    </section>

    <section className="account-section account-environment-section" id="account-environment" aria-labelledby="account-environment-title">
      <header className="account-section-heading">
        <span className="account-section-icon"><Settings size={20} aria-hidden="true" /></span>
        <div><h2 id="account-environment-title">서비스 환경</h2><p>계정에 저장되는 언어를 관리합니다.</p></div>
      </header>
      <div className="account-environment-grid">
        <label><span><Languages size={15} />언어</span><select aria-label="서버 언어 선택" value={loadState.preferences.languageCode} onChange={(event) => updateDraft({ languageCode: event.target.value })}><option value="ko">한국어</option><option value="en">English</option></select></label>
        <div className="account-readonly-group"><span>시간대</span><div className="account-readonly-field" aria-label="서버 시간대"><strong>{loadState.preferences.timezoneName}</strong><LockKeyhole size={16} /></div></div>
      </div>
      <footer className="account-section-footer"><Button onClick={() => void savePreferences()} disabled={preferenceState.kind === 'pending'}>환경 저장</Button></footer>
      {preferenceState.kind === 'saved' && <p role="status">서버 설정을 저장했습니다.</p>}
      {preferenceState.kind === 'error' && <ApiErrorState error={preferenceState.error} onRetry={preferenceState.retry} />}
    </section>

    <section className="account-section account-danger-section" id="account-management" aria-labelledby="account-management-title">
      <header className="account-section-heading"><span className="account-section-icon is-danger"><LockKeyhole size={20} /></span><div><h2 id="account-management-title">계정 관리</h2></div></header>
      <details className="account-danger-zone"><summary>탈퇴 요청 · 취소</summary>
        <div className="settings-fields account-api-fields">
          <label><span>이메일</span><input aria-label="계정 확인 이메일" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label><span>비밀번호</span><input aria-label="계정 확인 비밀번호" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        </div>
        <div className="account-api-actions"><Button onClick={() => void runLifecycle('withdraw')} disabled={!email || !password || lifecycleState.kind === 'pending'}>탈퇴 요청</Button><Button onClick={() => void runLifecycle('cancel')} disabled={!email || !password || lifecycleState.kind === 'pending'}>탈퇴 취소</Button></div>
        {lifecycleState.kind === 'lifecycle' && <p role="status">계정 상태: {lifecycleState.result.status} · 버전 {lifecycleState.result.version}</p>}
        {lifecycleState.kind === 'error' && <ApiErrorState error={lifecycleState.error} onRetry={lifecycleState.retry} />}
      </details>
    </section>
  </>;
}

export function AccountSignOutButton({ client }: { client: AccountClient }) {
  const [pending, setPending] = useState(false);
  const signOut = async () => {
    setPending(true);
    try { await client.logoutCurrent(); } catch { /* local sign-out still wins */ }
    finally { dropTabSession(); }
  };
  return <Button className="account-signout-button" kind="ghost" icon={LogOut} onClick={() => void signOut()} disabled={pending}>{pending ? '로그아웃 중' : '로그아웃'}</Button>;
}

function ApiErrorState({ error, onRetry }: { error: AccountApiError; onRetry: () => void }) {
  if (error.status === 401) return <SignInRequiredState detail="로그인이 만료되었습니다. 다시 로그인해 주세요." />;
  return <ErrorState title={error.status === 403 ? '이 작업을 수행할 권한이 없습니다.' : '계정 서버 요청에 실패했습니다.'} detail={<>오류 코드 {error.code}{error.correlationId && <> · 문의 코드 {error.correlationId}</>}</>} onRetry={onRetry} />;
}
