import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AccountApiError } from '../api/account';
import type { AccountClient } from '../api/account';
import { Button, PageHeading, Panel } from '../components/common';
import { Localized } from '../lib/i18n';
import { pagePaths } from '../lib/navigation';

/*
  Dedicated customer sign-in and sign-up screens (A23). The account API client
  already establishes the in-memory session on login; these screens only give
  that path a first-class entry point instead of hiding it behind the 401
  state of the account settings page.

  Both screens report the server's actual outcome: an error shows the API code
  and correlation id, and nothing renders as success before the API confirmed.
*/

function fallbackError(cause: unknown): AccountApiError {
  return cause instanceof AccountApiError ? cause : new AccountApiError(0, 'NETWORK_ERROR', null);
}

function ApiFailure({ error }: { error: AccountApiError }) {
  return <div className="auth-error" role="alert">
    <strong>{error.code}</strong>
    {error.correlationId && <small> · {error.correlationId}</small>}
  </div>;
}

interface AuthScreenProps {
  client: AccountClient;
}

export function LoginView({ client }: AuthScreenProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? pagePaths.account;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<AccountApiError | null>(null);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetFailure, setResetFailure] = useState<AccountApiError | null>(null);

  const submit = async () => {
    setPending(true);
    setFailure(null);
    try {
      await client.login(email, password, 'Web browser');
      navigate(returnTo, { replace: true });
    } catch (cause) {
      setFailure(fallbackError(cause));
    } finally {
      setPending(false);
    }
  };

  const runReset = async (action: () => Promise<unknown>, success: string) => {
    setResetFailure(null);
    setResetMessage(null);
    try {
      await action();
      setResetMessage(success);
    } catch (cause) {
      setResetFailure(fallbackError(cause));
    }
  };

  return <Localized><div className="page auth-page">
    <PageHeading
      eyebrow="ACCOUNT / SIGN IN"
      title="로그인"
      description="이메일과 비밀번호로 로그인합니다. 세션은 브라우저 메모리에만 유지됩니다."
    />
    <Panel className="auth-panel">
      <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label><span>이메일</span><input aria-label="로그인 이메일" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span>비밀번호</span><input aria-label="로그인 비밀번호" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <Button kind="primary" type="submit" disabled={!email || !password || pending}>{pending ? '로그인 중' : '로그인'}</Button>
      </form>
      {failure && <ApiFailure error={failure} />}
      <div className="auth-links">
        <button type="button" className="auth-link" onClick={() => navigate('/signup', { state: { returnTo } })}>계정이 없으신가요? 가입하기</button>
      </div>
      <details className="account-auth-alternatives">
        <summary>비밀번호 재설정</summary>
        <div className="account-auth-fields">
          <label><span>가입 이메일</span><input aria-label="재설정 이메일" type="email" autoComplete="email" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} /></label>
          <label><span>재설정 토큰</span><input aria-label="재설정 토큰" value={resetToken} onChange={(event) => setResetToken(event.target.value)} /></label>
          <label><span>새 비밀번호</span><input aria-label="재설정 새 비밀번호" type="password" autoComplete="new-password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></label>
        </div>
        <div className="account-api-actions">
          <Button disabled={!resetEmail} onClick={() => void runReset(() => client.requestPasswordReset(resetEmail), '계정 존재 여부와 관계없이 복구 요청을 접수했습니다.')}>재설정 요청</Button>
          <Button disabled={!resetToken || !resetPassword} onClick={() => void runReset(() => client.resetPassword(resetToken, resetPassword), '비밀번호를 재설정했습니다. 새 비밀번호로 로그인하세요.')}>비밀번호 재설정</Button>
        </div>
        {resetMessage && <p role="status">{resetMessage}</p>}
        {resetFailure && <ApiFailure error={resetFailure} />}
      </details>
    </Panel>
  </div></Localized>;
}

type SignupStep =
  | { kind: 'form' }
  | { kind: 'verify'; accountId: string; verificationExpiresAt: string }
  | { kind: 'verified' };

export function SignupView({ client }: AuthScreenProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const [step, setStep] = useState<SignupStep>({ kind: 'form' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<AccountApiError | null>(null);

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setFailure(null);
    setMessage(null);
    try {
      await action();
    } catch (cause) {
      setFailure(fallbackError(cause));
    } finally {
      setPending(false);
    }
  };

  return <Localized><div className="page auth-page">
    <PageHeading
      eyebrow="ACCOUNT / SIGN UP"
      title="가입"
      description="가입 후 이메일로 받은 인증 토큰을 입력해야 로그인할 수 있습니다."
    />
    <Panel className="auth-panel">
      {step.kind === 'form' && <>
        <form className="auth-form" onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const result = await client.signup(email, password);
            setStep({ kind: 'verify', accountId: result.accountId, verificationExpiresAt: result.verificationExpiresAt });
          });
        }}>
          <label><span>이메일</span><input aria-label="가입 이메일" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label><span>비밀번호</span><input aria-label="가입 비밀번호" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <Button kind="primary" type="submit" disabled={!email || !password || pending}>{pending ? '가입 요청 중' : '가입'}</Button>
        </form>
        <div className="auth-links">
          <button type="button" className="auth-link" onClick={() => navigate('/login', { state: returnTo ? { returnTo } : undefined })}>이미 계정이 있으신가요? 로그인</button>
        </div>
      </>}
      {step.kind === 'verify' && <>
        <p role="status">가입 요청을 접수했습니다. 이메일로 받은 인증 토큰을 입력하세요. 인증 기한: {new Date(step.verificationExpiresAt).toLocaleString()}</p>
        <form className="auth-form" onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await client.verifyEmail(token);
            setStep({ kind: 'verified' });
          });
        }}>
          <label><span>인증 토큰</span><input aria-label="가입 인증 토큰" value={token} onChange={(event) => setToken(event.target.value)} /></label>
          <Button kind="primary" type="submit" disabled={!token || pending}>{pending ? '인증 중' : '이메일 인증'}</Button>
        </form>
        <div className="account-api-actions">
          <Button disabled={pending} onClick={() => void run(async () => {
            const result = await client.resendVerification(step.accountId);
            setMessage(`인증 메일을 다시 보냈습니다. 인증 기한: ${new Date(result.verificationExpiresAt).toLocaleString()}`);
          })}>인증 메일 다시 보내기</Button>
        </div>
      </>}
      {step.kind === 'verified' && <>
        <p role="status">이메일 인증을 완료했습니다. 이제 로그인할 수 있습니다.</p>
        <div className="account-api-actions">
          <Button kind="primary" onClick={() => navigate('/login', { state: returnTo ? { returnTo } : undefined })}>로그인하러 가기</Button>
        </div>
      </>}
      {message && <p role="status">{message}</p>}
      {failure && <ApiFailure error={failure} />}
    </Panel>
  </div></Localized>;
}
