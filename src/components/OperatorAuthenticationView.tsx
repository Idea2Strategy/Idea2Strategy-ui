import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, LockKeyhole, ShieldCheck, Smartphone } from 'lucide-react';
import type { OperatorCredentials, OperatorReauthentication, OperatorSessionSnapshot } from '../auth/operatorSession';
import { Button } from './common';

export interface OperatorAuthentication {
  snapshot: OperatorSessionSnapshot;
  login(credentials: OperatorCredentials): Promise<void>;
  reauthenticate(credentials: OperatorReauthentication): Promise<void>;
  logout(): void | Promise<void>;
}

export function OperatorAuthenticationView({ authentication }: { authentication: OperatorAuthentication }) {
  const location = useLocation();
  const navigate = useNavigate();
  const requested = (location.state as { returnTo?: unknown } | null)?.returnTo;
  const returnTo = typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//')
    ? requested : '/operations/rbac';
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const loading = authentication.snapshot.kind === 'loading';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(null);
    try {
      await authentication.login({ loginName, password, totpCode });
      setPassword(''); setTotpCode(''); navigate(returnTo, { replace: true });
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : 'OPERATOR_AUTHENTICATION_REJECTED';
      setMessage(code === 'OPERATOR_AUTHENTICATION_RATE_LIMITED'
        ? '로그인 시도가 너무 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.'
        : code === 'OPERATOR_AUTHENTICATION_UNAVAILABLE'
          ? '운영자 인증 서버에 일시적으로 연결할 수 없습니다.'
          : '아이디, 비밀번호 또는 인증 앱 코드를 확인해 주세요.');
    }
  };

  return <section className="page narrow-page operator-auth-page" aria-labelledby="operator-auth-title">
    <div className="operator-auth-shell">
      <header className="operator-auth-heading">
        <span className="operator-auth-mark" aria-hidden="true"><ShieldCheck size={24} /></span>
        <div><small>INTERNAL OPERATIONS</small><h1 id="operator-auth-title">운영자 로그인</h1>
          <p>고객 계정과 분리된 운영자 전용 계정으로 로그인합니다.</p></div>
      </header>
      <div className="operator-auth-boundary"><LockKeyhole size={16} aria-hidden="true" /><span><strong>독립된 보안 경계</strong><small>일반 회원 로그인 정보로는 운영 기능에 접근할 수 없습니다.</small></span></div>
    {message && <div className="operator-auth-alert" role="alert">{message}</div>}
    {authentication.snapshot.kind === 'error' && !message
      && <div className="operator-auth-alert" role="alert">운영자 인증을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.</div>}
    <form className="operator-auth-form" onSubmit={(event) => void submit(event)}>
      <label><span><KeyRound size={14} aria-hidden="true" />운영자 아이디</span><input autoComplete="username" value={loginName}
        onChange={(event) => setLoginName(event.target.value)} required /></label>
      <label><span><LockKeyhole size={14} aria-hidden="true" />비밀번호</span><input type="password" autoComplete="current-password" value={password}
        onChange={(event) => setPassword(event.target.value)} required /></label>
      <label><span><Smartphone size={14} aria-hidden="true" />인증 앱 6자리 코드</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
        value={totpCode} onChange={(event) => setTotpCode(event.target.value)} required /></label>
      <Button type="submit" kind="primary" icon={ShieldCheck} disabled={loading}>{loading ? '확인 중…' : '운영자 로그인'}</Button>
    </form>
      <p className="operator-auth-footnote">비밀번호와 인증 앱 코드를 모두 확인하며, 성공 후에도 서버 세션과 권한을 작업마다 검증합니다.</p>
    </div>
  </section>;
}
