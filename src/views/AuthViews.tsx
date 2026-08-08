import { useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { AccountApiError } from '../api/account';
import type { AccountClient } from '../api/account';
import { Button } from '../components/common';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import i2sLogo from '../assets/i2s-logo.svg';
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

function AuthProductBrand() {
  return <div className="auth-product-brand" role="img" aria-label="Idea2Strategy">
    <img src={i2sLogo} alt="" aria-hidden="true" />
    <strong aria-hidden="true">IDEA<span>2</span>STRATEGY</strong>
  </div>;
}

function ApiFailure({ error }: { error: AccountApiError }) {
  /* Lead with what the person can act on; the raw code and correlation id stay
     on the second line for support. */
  const title = error.code === 'EMAIL_ALREADY_REGISTERED'
    ? '이미 가입된 이메일입니다. 로그인하거나 다른 이메일을 사용해 주세요.'
    : error.status === 401
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

interface PasswordInputProps {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  describedBy?: string;
  invalid?: boolean;
}

function PasswordInput({ label, ariaLabel, value, onChange, autoComplete, describedBy, invalid = false }: PasswordInputProps) {
  const inputId = useId();
  const [visible, setVisible] = useState(false);
  const toggleLabel = `${ariaLabel} ${visible ? '숨기기' : '표시'}`;

  return <div className="auth-password-control">
    <label htmlFor={inputId}>{label}</label>
    <div className="auth-password-field">
      <input
        id={inputId}
        aria-label={ariaLabel}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="auth-password-toggle"
        aria-label={toggleLabel}
        aria-pressed={visible}
        title={toggleLabel}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  </div>;
}

const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 128;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const passwordLength = (password: string) => Array.from(password).length;
const passwordLengthIsValid = (password: string) => {
  const codePointLength = passwordLength(password);
  return codePointLength >= MIN_PASSWORD_LENGTH && codePointLength <= MAX_PASSWORD_LENGTH;
};
const emailError = (email: string) => {
  if (!email.trim()) return '이메일을 입력해 주세요.';
  return EMAIL_PATTERN.test(email.trim()) ? null : '올바른 이메일 주소를 입력해 주세요.';
};
const passwordError = (password: string) => {
  if (!password) return '비밀번호를 입력해 주세요.';
  if (passwordLength(password) < MIN_PASSWORD_LENGTH) return '비밀번호는 15자 이상이어야 합니다.';
  if (passwordLength(password) > MAX_PASSWORD_LENGTH) return '비밀번호는 128자 이하여야 합니다.';
  return null;
};

export function LoginView({ client }: AuthScreenProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { returnTo?: string; passwordResetComplete?: boolean } | null;
  const returnTo = routeState?.returnTo ?? pagePaths.account;
  const emailVerified = new URLSearchParams(location.search).get('emailVerified') === 'true';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<AccountApiError | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const currentEmailError = submitted ? emailError(email) : null;
  const currentPasswordError = submitted ? passwordError(password) : null;
  const credentialsRejected = failure?.status === 401;

  const submit = async () => {
    setSubmitted(true);
    if (emailError(email) || passwordError(password)) return;
    setPending(true);
    setFailure(null);
    try {
      await client.login(email, password);
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
        <AuthProductBrand />
        <h1 id="auth-title">로그인</h1>
      </header>
      {emailVerified && <p role="status" className="auth-success">이메일 인증이 완료되었습니다. 로그인해 주세요.</p>}
      {routeState?.passwordResetComplete && <p role="status" className="auth-success">비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.</p>}
      <form className="auth-form" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label><span>이메일</span><input aria-label="로그인 이메일" type="email" autoComplete="email" aria-describedby={currentEmailError ? 'login-email-help' : undefined} aria-invalid={Boolean(currentEmailError || credentialsRejected)} value={email} onChange={(event) => { setEmail(event.target.value); setFailure(null); }} /></label>
        {currentEmailError && <p id="login-email-help" className="auth-field-hint" role="alert">{currentEmailError}</p>}
        <PasswordInput label="비밀번호" ariaLabel="로그인 비밀번호" autoComplete="current-password" describedBy={currentPasswordError ? 'login-password-help' : undefined} invalid={Boolean(currentPasswordError || credentialsRejected)} value={password} onChange={(value) => { setPassword(value); setFailure(null); }} />
        {currentPasswordError && <p id="login-password-help" className="auth-field-hint" role="alert">{currentPasswordError}</p>}
        <div className="auth-field-link-row">
          <button type="button" className="auth-link auth-inline-link" onClick={() => navigate('/password-reset', { state: { returnTo } })}>비밀번호를 잊으셨나요?</button>
        </div>
        <Button kind="primary" type="submit" disabled={pending}>{pending ? '로그인 중' : '로그인'}</Button>
      </form>
      {failure && <ApiFailure error={failure} />}
      <GoogleSignInButton
        client={client}
        onSignedIn={() => navigate(returnTo, { replace: true })}
        onFailure={setFailure}
      />
      <div className="auth-links">
        <span>계정이 없으신가요?</span>
        <button type="button" className="auth-link" onClick={() => navigate('/signup', { state: { returnTo } })}>가입하기</button>
      </div>
    </section>
  </div></Localized>;
}

type PasswordResetStep = 'email' | 'sent' | 'password';

export function PasswordResetView({ client }: AuthScreenProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const resetToken = new URLSearchParams(location.search).get('token')?.trim() ?? '';
  const [step, setStep] = useState<PasswordResetStep>(() => resetToken ? 'password' : 'email');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<AccountApiError | null>(null);
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const currentEmailError = emailSubmitted ? emailError(email) : null;
  const currentPasswordError = (passwordSubmitted || newPassword.length > 0) ? passwordError(newPassword) : null;
  const newPasswordValid = passwordLengthIsValid(newPassword);
  const passwordsMatch = newPassword === newPasswordConfirm;
  const passwordConfirmError = (passwordSubmitted || newPasswordConfirm.length > 0)
    ? !newPasswordConfirm ? '비밀번호 확인을 입력해 주세요.' : !passwordsMatch ? '비밀번호가 일치하지 않습니다.' : null
    : null;

  const requestLink = async (advance: boolean) => {
    setPending(true);
    setFailure(null);
    setMessage(null);
    try {
      await client.requestPasswordReset(email);
      if (advance) {
        setMessage('비밀번호 재설정 링크를 이메일로 보냈습니다.');
        setStep('sent');
      }
      else setMessage('비밀번호 재설정 링크를 다시 보냈습니다.');
    } catch (cause) {
      setFailure(fallbackError(cause));
    } finally {
      setPending(false);
    }
  };

  const changePassword = async () => {
    setPending(true);
    setFailure(null);
    try {
      await client.resetPassword(resetToken, newPassword);
      navigate('/login', { replace: true, state: { returnTo, passwordResetComplete: true } });
    } catch (cause) {
      setFailure(fallbackError(cause));
    } finally {
      setPending(false);
    }
  };

  const goBack = () => {
    setFailure(null);
    setMessage(null);
    if (step === 'sent') setStep('email');
    else navigate('/login', { state: returnTo ? { returnTo } : undefined });
  };

  return <Localized><div className="page auth-page">
    <div className="auth-backdrop" aria-hidden="true" />
    <section className="auth-card auth-panel auth-reset-card" aria-labelledby="password-reset-title">
      <button type="button" className="auth-back-link" onClick={goBack}><ChevronLeft size={16} aria-hidden="true" />뒤로</button>
      <header className="auth-card-head">
        <AuthProductBrand />
        <h1 id="password-reset-title">{step === 'email' ? '비밀번호 재설정' : step === 'sent' ? '이메일을 확인해 주세요' : '새 비밀번호 설정'}</h1>
        {step === 'email' && <p className="auth-card-copy">가입한 이메일을 입력하세요.</p>}
        {step === 'sent' && <p className="auth-card-copy">메일의 재설정 버튼을 누르면 새 비밀번호를 설정할 수 있습니다.<strong className="auth-reset-email">{email}</strong></p>}
        {step === 'password' && <p className="auth-card-copy">15자 이상 128자 이하로 입력하세요.</p>}
      </header>
      {step === 'email' && <form className="auth-form" noValidate onSubmit={(event) => { event.preventDefault(); setEmailSubmitted(true); if (!emailError(email) && !pending) void requestLink(true); }}>
        <label><span>가입 이메일</span><input aria-label="재설정 이메일" type="email" autoComplete="email" aria-describedby={currentEmailError ? 'reset-email-help' : undefined} aria-invalid={Boolean(currentEmailError)} value={email} onChange={(event) => { setEmail(event.target.value); setFailure(null); }} /></label>
        {currentEmailError && <p id="reset-email-help" className="auth-field-hint" role="alert">{currentEmailError}</p>}
        <Button type="submit" kind="primary" disabled={pending}>{pending ? '요청 중' : '재설정 링크 받기'}</Button>
      </form>}
      {step === 'sent' && <>
        <Button type="button" kind="primary" onClick={() => navigate('/login', { state: returnTo ? { returnTo } : undefined })}>로그인으로 돌아가기</Button>
        <div className="auth-resend"><span>메일이 보이지 않나요?</span><button type="button" className="auth-link" disabled={pending} onClick={() => void requestLink(false)}>재설정 링크 다시 받기</button></div>
      </>}
      {step === 'password' && <form className="auth-form" onSubmit={(event) => { event.preventDefault(); setPasswordSubmitted(true); if (newPasswordValid && newPasswordConfirm && passwordsMatch && !pending) void changePassword(); }}>
        <PasswordInput label="새 비밀번호" ariaLabel="새 비밀번호" autoComplete="new-password" describedBy={currentPasswordError ? 'reset-password-help' : undefined} invalid={Boolean(currentPasswordError)} value={newPassword} onChange={setNewPassword} />
        {currentPasswordError && <p id="reset-password-help" className="auth-field-hint" role="alert">{currentPasswordError}</p>}
        <PasswordInput label="새 비밀번호 확인" ariaLabel="새 비밀번호 확인" autoComplete="new-password" describedBy={passwordConfirmError ? 'reset-password-confirm-help' : undefined} invalid={Boolean(passwordConfirmError)} value={newPasswordConfirm} onChange={setNewPasswordConfirm} />
        {passwordConfirmError && <p id="reset-password-confirm-help" className="auth-field-hint" role="alert">{passwordConfirmError}</p>}
        <Button type="submit" kind="primary" disabled={pending || !newPasswordValid || !newPasswordConfirm || !passwordsMatch}>{pending ? '변경 중' : '비밀번호 변경'}</Button>
      </form>}
      {message && <p role="status" className="auth-reset-status auth-success">{message}</p>}
      {failure && <ApiFailure error={failure} />}
    </section>
  </div></Localized>;
}

type SignupStep =
  | { kind: 'form' }
  | { kind: 'verify'; accountId: string; email: string; verificationExpiresAt: string };

export function SignupView({ client }: AuthScreenProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const [step, setStep] = useState<SignupStep>({ kind: 'form' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const passwordsMatch = password === passwordConfirm;
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<AccountApiError | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const currentEmailError = (submitted || email.length > 0) ? emailError(email) : null;
  const currentPasswordError = (submitted || password.length > 0) ? passwordError(password) : null;
  const passwordConfirmError = (submitted || passwordConfirm.length > 0)
    ? !passwordConfirm ? '비밀번호 확인을 입력해 주세요.' : !passwordsMatch ? '비밀번호가 일치하지 않습니다.' : null
    : null;
  const signupValid = !emailError(email) && !passwordError(password) && Boolean(passwordConfirm) && passwordsMatch;
  const emailRejected = failure?.code === 'EMAIL_ALREADY_REGISTERED';

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
        <AuthProductBrand />
        <h1 id="auth-title">가입</h1>
      </header>
      {step.kind === 'form' && <>
        <form className="auth-form" noValidate onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (emailError(email) || passwordError(password) || !passwordConfirm || !passwordsMatch || pending) return;
          void run(async () => {
            const result = await client.signup(email, password);
            setStep({ kind: 'verify', accountId: result.accountId, email: email.trim(), verificationExpiresAt: result.verificationExpiresAt });
          });
        }}>
          <label><span>이메일</span><input aria-label="가입 이메일" type="email" autoComplete="email" aria-describedby={currentEmailError ? 'signup-email-help' : undefined} aria-invalid={Boolean(currentEmailError || emailRejected)} value={email} onChange={(event) => { setEmail(event.target.value); setFailure(null); }} /></label>
          {currentEmailError && <p id="signup-email-help" className="auth-field-hint" role="alert">{currentEmailError}</p>}
          <PasswordInput label="비밀번호" ariaLabel="가입 비밀번호" autoComplete="new-password" describedBy={currentPasswordError ? 'signup-password-help' : undefined} invalid={Boolean(currentPasswordError)} value={password} onChange={setPassword} />
          {currentPasswordError && <p id="signup-password-help" className="auth-field-hint" role="alert">{currentPasswordError}</p>}
          <PasswordInput label="비밀번호 확인" ariaLabel="가입 비밀번호 확인" autoComplete="new-password" describedBy={passwordConfirmError ? 'signup-password-confirm-help' : undefined} invalid={Boolean(passwordConfirmError)} value={passwordConfirm} onChange={setPasswordConfirm} />
          {passwordConfirmError && <p id="signup-password-confirm-help" className="auth-field-hint" role="alert">{passwordConfirmError}</p>}
          <Button kind="primary" type="submit" disabled={pending || !signupValid}>{pending ? '가입 요청 중' : '가입'}</Button>
        </form>
        <GoogleSignInButton
          client={client}
          onSignedIn={() => navigate(returnTo ?? pagePaths.account, { replace: true })}
          onFailure={setFailure}
        />
        <div className="auth-links">
          <span>이미 계정이 있으신가요?</span>
          <button type="button" className="auth-link" onClick={() => navigate('/login', { state: returnTo ? { returnTo } : undefined })}>로그인</button>
        </div>
      </>}
      {step.kind === 'verify' && <>
        <p role="status" className="auth-success">인증 링크를 이메일로 보냈습니다.</p>
        <p className="auth-reset-email">{step.email}</p>
        <p className="auth-card-copy">메일의 '이메일 인증하기' 버튼을 눌러 인증을 완료해 주세요.</p>
        <p className="auth-field-hint">인증 링크 만료: {new Date(step.verificationExpiresAt).toLocaleString()}</p>
        <p className="auth-field-hint">메일이 보이지 않으면 스팸함을 확인하거나 다시 보내세요.</p>
        <div className="auth-actions">
          <Button disabled={pending} onClick={() => void run(async () => {
            const result = await client.resendVerification(step.accountId);
            setStep({ ...step, verificationExpiresAt: result.verificationExpiresAt });
            setMessage(`인증 메일을 다시 보냈습니다. 만료: ${new Date(result.verificationExpiresAt).toLocaleString()}`);
          })}>인증 메일 다시 보내기</Button>
          <Button kind="primary" onClick={() => navigate('/login', { state: returnTo ? { returnTo } : undefined })}>로그인하러 가기</Button>
        </div>
      </>}
      {message && <p role="status">{message}</p>}
      {failure && <ApiFailure error={failure} />}
    </section>
  </div></Localized>;
}
