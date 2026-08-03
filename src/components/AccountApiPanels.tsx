import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import type {
  AccountClient,
  AccountPreferences,
  LifecycleResult,
  SessionView,
} from '../api/account';
import { AccountApiError } from '../api/account';
import { Button, Panel, Status } from './common';

interface AccountApiPanelsProps {
  client: AccountClient;
  createIdempotencyKey?: () => string;
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
}: AccountApiPanelsProps) {
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [preferenceState, setPreferenceState] = useState<ActionState>({ kind: 'idle' });
  const [lifecycleState, setLifecycleState] = useState<ActionState>({ kind: 'idle' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginPending, setLoginPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setLoadState({ kind: 'loading' });
    setPreferenceState({ kind: 'idle' });
    setLifecycleState({ kind: 'idle' });
    Promise.all([client.sessions(controller.signal), client.preferences(controller.signal)])
      .then(([sessions, preferences]) => {
        if (current) setLoadState({ kind: 'ready', sessions, preferences });
      })
      .catch((error: unknown) => {
        if (current && !controller.signal.aborted) setLoadState({ kind: 'error', error: fallbackError(error) });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [client, loadAttempt]);

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
      setPreferenceState({ kind: 'saved' });
    } catch (error) {
      setPreferenceState({ kind: 'error', error: fallbackError(error), retry: () => void savePreferences() });
    }
  }, [client, loadState]);

  const runLifecycle = useCallback(async (
    operation: 'withdraw' | 'cancel' | 'reactivate',
    retryKey?: string,
  ) => {
    setLifecycleState({ kind: 'pending' });
    const key = retryKey ?? createIdempotencyKey();
    try {
      const result = operation === 'withdraw'
        ? await client.requestWithdrawal(email, password, key)
        : operation === 'cancel'
          ? await client.cancelWithdrawal(email, password, key)
          : await client.reactivateWithPassword(email, password, [], key);
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
    return <Panel className="span-2 account-api-state" title="계정 서버 연결">
      <div role="status"><Loader2 size={18} aria-hidden="true" />계정 정보를 불러오는 중입니다.</div>
    </Panel>;
  }

  if (loadState.kind === 'error') {
    return <Panel className="span-2 account-api-state" title="계정 서버 연결">
      <ApiErrorState error={loadState.error} onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
      {loadState.error.status === 401 && <form className="account-login-form" onSubmit={(event) => {
        event.preventDefault();
        setLoginPending(true);
        void client.login(loginEmail, loginPassword, 'Web browser')
          .then(() => { setLoginPassword(''); setLoadAttempt((attempt) => attempt + 1); })
          .catch((cause) => setLoadState({ kind: 'error', error: fallbackError(cause) }))
          .finally(() => setLoginPending(false));
      }}>
        <label><span>이메일</span><input aria-label="로그인 이메일" type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} /></label>
        <label><span>비밀번호</span><input aria-label="로그인 비밀번호" type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} /></label>
        <Button kind="primary" type="submit" disabled={!loginEmail || !loginPassword || loginPending}>{loginPending ? '로그인 중' : '로그인'}</Button>
      </form>}
    </Panel>;
  }

  const currentSession = loadState.sessions.find((session) => session.current) ?? loadState.sessions[0];
  return <>
    <Panel title="현재 세션" subtitle={`${loadState.sessions.length}개 세션이 서버에 등록됨`}>
      <div className="settings-rows">
        <div className="settings-row">
          <span className="settings-row-icon"><KeyRound size={17} /></span>
          <span className="settings-row-copy">
            <strong>{currentSession?.deviceLabel || '이 기기'}</strong>
            <small>{currentSession ? `만료 ${currentSession.expiresAt}` : '활성 세션 없음'}</small>
          </span>
          {currentSession?.current && <Status tone="positive">현재</Status>}
        </div>
      </div>
    </Panel>

    <Panel title="서버 환경설정" subtitle="저장하면 모든 기기에 반영됩니다">
      <div className="settings-fields account-api-fields">
        <label>
          <span>언어 코드</span>
          <select aria-label="서버 언어 선택" value={loadState.preferences.languageCode}
            onChange={(event) => updateDraft({ languageCode: event.target.value })}>
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          <span>시간대</span>
          <input aria-label="서버 시간대" value={loadState.preferences.timezoneName}
            onChange={(event) => updateDraft({ timezoneName: event.target.value })} />
        </label>
        <label>
          <span>테마</span>
          <select aria-label="서버 테마 선택" value={loadState.preferences.themePreference}
            onChange={(event) => updateDraft({ themePreference: event.target.value as AccountPreferences['themePreference'] })}>
            <option value="SYSTEM">시스템</option>
            <option value="DARK">다크</option>
            <option value="LIGHT">라이트</option>
          </select>
        </label>
        <Button onClick={() => void savePreferences()} disabled={preferenceState.kind === 'pending'}>서버 설정 저장</Button>
      </div>
      {preferenceState.kind === 'pending' && <p role="status">서버 설정을 저장하는 중입니다.</p>}
      {preferenceState.kind === 'saved' && <p role="status">서버 설정을 저장했습니다.</p>}
      {preferenceState.kind === 'error' && <ApiErrorState error={preferenceState.error} onRetry={preferenceState.retry} />}
    </Panel>

    <Panel className="span-2" title="계정 생명주기" subtitle="탈퇴 요청, 취소, 재활성화는 서버 정책에 따라 처리됩니다">
      <div className="settings-fields account-api-fields">
        <label><span>이메일</span><input aria-label="계정 확인 이메일" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span>비밀번호</span><input aria-label="계정 확인 비밀번호" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      </div>
      <div className="account-api-actions">
        <Button onClick={() => void runLifecycle('withdraw')} disabled={!email || !password || lifecycleState.kind === 'pending'}>탈퇴 요청</Button>
        <Button onClick={() => void runLifecycle('cancel')} disabled={!email || !password || lifecycleState.kind === 'pending'}>탈퇴 취소</Button>
        <Button onClick={() => void runLifecycle('reactivate')} disabled={!email || !password || lifecycleState.kind === 'pending'}>계정 재활성화</Button>
      </div>
      {lifecycleState.kind === 'pending' && <p role="status">서버가 요청을 처리하는 중입니다.</p>}
      {lifecycleState.kind === 'lifecycle' && <p role="status">계정 상태: {lifecycleState.result.status} · 버전 {lifecycleState.result.version}</p>}
      {lifecycleState.kind === 'error' && <ApiErrorState error={lifecycleState.error} onRetry={lifecycleState.retry} />}
    </Panel>
  </>;
}

function ApiErrorState({ error, onRetry }: { error: AccountApiError; onRetry: () => void }) {
  const message = error.status === 401
    ? '로그인이 필요합니다.'
    : error.status === 403
      ? '이 작업을 수행할 권한이 없습니다.'
      : '계정 서버 요청에 실패했습니다.';
  return <div className="account-api-error" role="alert">
    <AlertTriangle size={18} aria-hidden="true" />
    <div><strong>{message}</strong><small>오류 코드: {error.code}</small>
      {error.correlationId && <small>상관관계 ID: {error.correlationId}</small>}
    </div>
    <Button icon={RefreshCw} onClick={onRetry}>다시 시도</Button>
  </div>;
}
