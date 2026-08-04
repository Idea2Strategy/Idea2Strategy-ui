import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { OperatorRbacClient } from './api/operatorRbac';
import type { OperatorAuthentication } from './components/OperatorAuthenticationView';

const client = (): OperatorRbacClient => ({
  me: vi.fn().mockResolvedValue({
    view: {
      operatorId: 'operator-1', catalogVersion: 'catalog-v1', currentMfa: true,
      mfaAuthenticatedAt: null, lastMfaVerifiedAt: null, roles: [], permissions: [], assignments: [],
    },
    correlationId: 'corr-me',
  }),
  catalog: vi.fn(),
  assignments: vi.fn(),
});

const authentication = (
  snapshot: OperatorAuthentication['snapshot'],
): OperatorAuthentication => ({ snapshot, login: vi.fn(), logout: vi.fn() });

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('operator OIDC route boundary', () => {
  it('redirects a protected operator route to the dedicated sign-in and preserves returnTo', async () => {
    const auth = authentication({ kind: 'unauthenticated' });
    window.history.replaceState({}, '', '/operations/rbac');
    render(<App operatorAuthentication={auth} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in as operator' }));

    expect(auth.login).toHaveBeenCalledWith('/operations/rbac');
  });

  it('renders callback loading and fail-closed error states', () => {
    window.history.replaceState({}, '', '/operations/callback');
    const { rerender } = render(<App operatorAuthentication={authentication({ kind: 'loading' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Completing the secure operator sign-in');

    rerender(<App operatorAuthentication={authentication({ kind: 'error', code: 'OPERATOR_OIDC_STATE_INVALID' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Access remains blocked');
    expect(screen.getByRole('alert')).toHaveTextContent('OPERATOR_OIDC_STATE_INVALID');
  });

  it('injects the real operator client only while authenticated and exposes logout', async () => {
    const auth = authentication({ kind: 'authenticated', expiresAt: Date.now() + 60_000 });
    const operatorClient = client();
    window.history.replaceState({}, '', '/operations/rbac');
    render(<App operatorAuthentication={auth} operatorRbacClient={operatorClient} />);

    await waitFor(() => expect(operatorClient.me).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Operator logout' }));

    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});
