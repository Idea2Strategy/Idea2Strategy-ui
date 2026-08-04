import { useLocation } from 'react-router-dom';
import type { OperatorOidcSnapshot } from '../auth/operatorOidc';

export interface OperatorAuthentication {
  snapshot: OperatorOidcSnapshot;
  login(returnTo: string): void | Promise<void>;
  logout(): void;
}

export function OperatorAuthenticationView({ authentication }: { authentication: OperatorAuthentication }) {
  const location = useLocation();
  const requested = (location.state as { returnTo?: unknown } | null)?.returnTo;
  const returnTo = typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//')
    ? requested : '/operations/rbac';

  if (authentication.snapshot.kind === 'loading') {
    return <section className="page narrow-page operator-auth-page" aria-labelledby="operator-auth-title">
      <h1 id="operator-auth-title">Operator authentication</h1>
      <p role="status">Completing the secure operator sign-in…</p>
    </section>;
  }
  if (authentication.snapshot.kind === 'error') {
    return <section className="page narrow-page operator-auth-page" aria-labelledby="operator-auth-title">
      <h1 id="operator-auth-title">Operator authentication failed</h1>
      <div role="alert"><strong>Access remains blocked.</strong><span>{authentication.snapshot.code}</span></div>
      <button type="button" onClick={() => void authentication.login(returnTo)}>Try operator sign-in again</button>
    </section>;
  }
  return <section className="page narrow-page operator-auth-page" aria-labelledby="operator-auth-title">
    <h1 id="operator-auth-title">Operator sign-in</h1>
    <p>Use the dedicated operator identity. Customer sessions never grant operator access.</p>
    <button type="button" onClick={() => void authentication.login(returnTo)}>Sign in as operator</button>
  </section>;
}
