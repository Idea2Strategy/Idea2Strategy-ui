import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AccountApiError } from '../api/account';
import type { AccountClient } from '../api/account';
import { Button } from '../components/common';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import i2sLogo from '../assets/i2s-logo.svg';
import { Localized, useLanguage } from '../lib/i18n';
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
  /* Lead with what the person can act on; the raw code and correlation id stay
     on the second line for support. */
  const title = error.status === 401
    ? '이메일 또는 비밀번호가 올바르지 않습니다.'
    : error.status === 400
      ? '입력값을 확인해 주세요.'
      : error.status === 0
        ? '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'
        : '요청을 처리하지 못했습니다.';
  return <div className="auth-error" role="alert">
    <strong>{title}</strong>
    <small>오류 코드 {error.code}{error.correlationId && <> · 문의 코드 {error.correlationId}</>}</small>
  </div>;
}

interface AuthScreenProps {
  client: AccountClient;
}

const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 128;
const passwordLengthIsValid = (password: string) => {
  const codePointLength = Array.from(password).length;
  return codePointLength >= MIN_PASSWORD_LENGTH && codePointLength <= MAX_PASSWORD_LENGTH;
};

export function LoginView({ client }: AuthScreenProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? pagePaths.account;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<AccountApiError | null>(null);

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

  return <Localized><div className="page auth-page">
    <div className="auth-backdrop" aria-hidden="true" />
    <section className="auth-card auth-panel" aria-labelledby="auth-title">
      <header className="auth-card-head">
        <img src={i2sLogo} alt="" aria-hidden="true" />
        <p className="auth-eyebrow">ACCOUNT / SIGN IN</p>
        <h1 id="auth-title">로그인</h1>
        <p className="auth-card-copy">이메일과 비밀번호로 로그인합니다. 로그인 정보는 안전한 쿠키와 현재 브라우저 탭에만 유지됩니다.</p>
      </header>
      <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label><span>이메일</span><input aria-label="로그인 이메일" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span>비밀번호</span><input aria-label="로그인 비밀번호" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <Button kind="primary" type="submit" disabled={!email || !password || pending}>{pending ? '로그인 중' : '로그인'}</Button>
      </form>
      {failure && <ApiFailure error={failure} />}
      <GoogleSignInButton
        client={client}
        text="signin_with"
        onSignedIn={() => navigate(returnTo, { replace: true })}
        onFailure={setFailure}
      />
      <Button
        kind="ghost"
        className="auth-reset-entry"
        onClick={() => navigate('/password-reset', { state: { returnTo } })}
      >비밀번호 찾기</Button>
      <div className="auth-links">
        <span>계정이 없으신가요?</span>
        <button type="button" className="auth-link" onClick={() => navigate('/signup', { state: { returnTo } })}>가입하기</button>
      </div>
      <div className="auth-links">
        <span>휴면 또는 닫힌 계정인가요?</span>
        <button type="button" className="auth-link" onClick={() => navigate('/reactivate')}>계정 재활성화</button>
      </div>
    </section>
  </div></Localized>;
}

export function ReactivationView({ client }: AuthScreenProps) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [policies, setPolicies] = useState<Awaited<ReturnType<AccountClient['reactivationPolicies']>>>([]);
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<AccountApiError | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailure(null);
    void client.reactivationPolicies(language, controller.signal)
      .then((required) => {
        setPolicies(required.filter((policy) => policy.required));
        setAccepted(new Set());
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setFailure(fallbackError(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [client, language]);

  const allAccepted = policies.length > 0 && policies.every((policy) => accepted.has(policy.id));
  const submit = async () => {
    if (!email || !password || !allAccepted || pending) return;
    setPending(true);
    setFailure(null);
    try {
      await client.reactivateWithPassword(email, password, policies.map((policy) => policy.id), crypto.randomUUID());
      setCompleted(true);
    } catch (cause) {
      setFailure(fallbackError(cause));
    } finally {
      setPending(false);
    }
  };

  return <Localized><div className="page auth-page">
    <div className="auth-backdrop" aria-hidden="true" />
    <section className="auth-card auth-panel" aria-labelledby="reactivation-title">
      <header className="auth-card-head">
        <img src={i2sLogo} alt="" aria-hidden="true" />
        <p className="auth-eyebrow">ACCOUNT / REACTIVATE</p>
        <h1 id="reactivation-title">계정 재활성화</h1>
        <p className="auth-card-copy">로그인하기 전에 계정 자격 증명을 확인하고 현재 필수 정책에 동의합니다.</p>
      </header>
      {completed ? <>
        <p role="status">계정을 다시 활성화했습니다. 로그인해 주세요.</p>
        <Button kind="primary" onClick={() => navigate('/login')}>로그인으로 이동</Button>
      </> : <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label><span>이메일</span><input aria-label="재활성화 이메일" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span>비밀번호</span><input aria-label="재활성화 비밀번호" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <div className="auth-policy-list" aria-busy={loading}>
          {loading && <p>필수 정책을 불러오는 중입니다.</p>}
          {!loading && policies.map((policy) => <label className="auth-policy-item" key={policy.id}>
            <span className="auth-policy-title"><input
              type="checkbox"
              checked={accepted.has(policy.id)}
              onChange={(event) => setAccepted((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(policy.id); else next.delete(policy.id);
                return next;
              })}
            /> {policy.title}</span>
            <span className="auth-policy-content">{policy.contentText}</span>
          </label>)}
        </div>
        <Button kind="primary" type="submit" disabled={!email || !password || !allAccepted || pending || loading}>{pending ? '재활성화 중' : '계정 재활성화'}</Button>
      </form>}
      {failure && <ApiFailure error={failure} />}
      {!completed && <div className="auth-links"><span>활성 계정인가요?</span><button type="button" className="auth-link" onClick={() => navigate('/login')}>로그인</button></div>}
    </section>
  </div></Localized>;
}

export function PasswordResetView({ client }: AuthScreenProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<AccountApiError | null>(null);
  const newPasswordValid = passwordLengthIsValid(newPassword);
  const showPasswordLengthError = newPassword.length > 0 && !newPasswordValid;

  const run = async (action: () => Promise<unknown>, success: string) => {
    setFailure(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (cause) {
      setFailure(fallbackError(cause));
    }
  };

  return <Localized><div className="page auth-page">
    <div className="auth-backdrop" aria-hidden="true" />
    <section className="auth-card auth-panel" aria-labelledby="password-reset-title">
      <header className="auth-card-head">
        <img src={i2sLogo} alt="" aria-hidden="true" />
        <p className="auth-eyebrow">ACCOUNT / PASSWORD RESET</p>
        <h1 id="password-reset-title">비밀번호 찾기</h1>
        <p className="auth-card-copy">가입 이메일로 재설정 요청을 보내고, 메일로 받은 토큰과 새 비밀번호를 입력하세요.</p>
      </header>
      <div className="auth-form">
        <label><span>가입 이메일</span><input aria-label="재설정 이메일" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <Button type="button" disabled={!email} onClick={() => void run(() => client.requestPasswordReset(email), '계정 존재 여부와 관계없이 복구 요청을 접수했습니다.')}>재설정 요청</Button>
        <label><span>재설정 토큰</span><input aria-label="재설정 토큰" value={resetToken} onChange={(event) => setResetToken(event.target.value)} /></label>
        <label><span>새 비밀번호</span><input aria-label="재설정 새 비밀번호" type="password" autoComplete="new-password" aria-describedby={showPasswordLengthError ? 'reset-password-help' : undefined} aria-invalid={showPasswordLengthError} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
        {showPasswordLengthError && <p id="reset-password-help" className="auth-field-hint" role="alert">비밀번호는 15자 이상 128자 이하로 입력해 주세요.</p>}
        <Button type="button" kind="primary" disabled={!resetToken || !newPasswordValid} onClick={() => void run(() => client.resetPassword(resetToken, newPassword), '비밀번호를 재설정했습니다. 새 비밀번호로 로그인하세요.')}>비밀번호 재설정</Button>
      </div>
      {message && <p role="status" className="auth-reset-status">{message}</p>}
      {failure && <ApiFailure error={failure} />}
      <div className="auth-links">
        <button type="button" className="auth-link" onClick={() => navigate('/login', { state: returnTo ? { returnTo } : undefined })}>로그인하러 가기</button>
      </div>
    </section>
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
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [token, setToken] = useState('');
  const passwordsMatch = password === passwordConfirm;
  const passwordLengthValid = passwordLengthIsValid(password);
  const showPasswordLengthError = password.length > 0 && !passwordLengthValid;
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
    <div className="auth-backdrop" aria-hidden="true" />
    <section className="auth-card auth-panel" aria-labelledby="auth-title">
      <header className="auth-card-head">
        <img src={i2sLogo} alt="" aria-hidden="true" />
        <p className="auth-eyebrow">ACCOUNT / SIGN UP</p>
        <h1 id="auth-title">가입</h1>
        <p className="auth-card-copy">가입 후 이메일로 받은 인증 토큰을 입력해야 로그인할 수 있습니다.</p>
      </header>
      {step.kind === 'form' && <>
        <form className="auth-form" onSubmit={(event) => {
          event.preventDefault();
          if (!email || !passwordLengthValid || !passwordConfirm || !passwordsMatch || pending) return;
          void run(async () => {
            const result = await client.signup(email, password);
            setStep({ kind: 'verify', accountId: result.accountId, verificationExpiresAt: result.verificationExpiresAt });
          });
        }}>
          <label><span>이메일</span><input aria-label="가입 이메일" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label><span>비밀번호</span><input aria-label="가입 비밀번호" type="password" autoComplete="new-password" aria-describedby={showPasswordLengthError ? 'signup-password-help' : undefined} aria-invalid={showPasswordLengthError} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {showPasswordLengthError && <p id="signup-password-help" className="auth-field-hint" role="alert">비밀번호는 15자 이상 128자 이하로 입력해 주세요.</p>}
          <label><span>비밀번호 확인</span><input aria-label="가입 비밀번호 확인" type="password" autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} /></label>
          {passwordConfirm.length > 0 && !passwordsMatch && <p className="auth-field-hint" role="alert">비밀번호가 일치하지 않습니다.</p>}
          <Button kind="primary" type="submit" disabled={!email || !passwordLengthValid || !passwordConfirm || !passwordsMatch || pending}>{pending ? '가입 요청 중' : '가입'}</Button>
        </form>
        <GoogleSignInButton
          client={client}
          text="signup_with"
          onSignedIn={() => navigate(returnTo ?? pagePaths.account, { replace: true })}
          onFailure={setFailure}
        />
        <div className="auth-links">
          <span>이미 계정이 있으신가요?</span>
          <button type="button" className="auth-link" onClick={() => navigate('/login', { state: returnTo ? { returnTo } : undefined })}>로그인</button>
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
        <div className="auth-actions">
          <Button disabled={pending} onClick={() => void run(async () => {
            const result = await client.resendVerification(step.accountId);
            setMessage(`인증 메일을 다시 보냈습니다. 인증 기한: ${new Date(result.verificationExpiresAt).toLocaleString()}`);
          })}>인증 메일 다시 보내기</Button>
        </div>
      </>}
      {step.kind === 'verified' && <>
        <p role="status">이메일 인증을 완료했습니다. 이제 로그인할 수 있습니다.</p>
        <div className="auth-actions">
          <Button kind="primary" onClick={() => navigate('/login', { state: returnTo ? { returnTo } : undefined })}>로그인하러 가기</Button>
        </div>
      </>}
      {message && <p role="status">{message}</p>}
      {failure && <ApiFailure error={failure} />}
    </section>
  </div></Localized>;
}
