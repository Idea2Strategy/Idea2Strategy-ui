import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { OperatorCredentials, OperatorReauthentication, OperatorSessionSnapshot } from '../auth/operatorSession';

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
        ? 'Too many attempts. Wait briefly and try again.'
        : code === 'OPERATOR_AUTHENTICATION_UNAVAILABLE'
          ? 'Operator authentication is temporarily unavailable.'
          : 'The login name, password, or authenticator code is invalid.');
    }
  };

  return <section className="page narrow-page operator-auth-page" aria-labelledby="operator-auth-title">
    <h1 id="operator-auth-title">Operator sign-in</h1>
    <p>Use the dedicated operator account. Customer sessions never grant operator access.</p>
    {message && <div role="alert">{message}</div>}
    {authentication.snapshot.kind === 'error' && !message
      && <div role="alert">Operator authentication is unavailable: {authentication.snapshot.code}</div>}
    <form onSubmit={(event) => void submit(event)}>
      <label>Login name<input autoComplete="username" value={loginName}
        onChange={(event) => setLoginName(event.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password}
        onChange={(event) => setPassword(event.target.value)} required /></label>
      <label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}"
        value={totpCode} onChange={(event) => setTotpCode(event.target.value)} required /></label>
      <button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in as operator'}</button>
    </form>
  </section>;
}
