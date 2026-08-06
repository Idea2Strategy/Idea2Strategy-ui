import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { OperatorRbacClient } from './api/operatorRbac';

const operatorClient = (): OperatorRbacClient => ({
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

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('operator RBAC route activation', () => {
  it('keeps the operator workspace dormant until a dedicated client is injected', async () => {
    window.history.replaceState({}, '', '/operations/rbac');
    render(<App />);

    // Without a client the route falls back to home, and home — account-scoped
    // and signed out — forwards to the sign-in screen.
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(screen.queryByRole('heading', { name: '운영자 권한' })).not.toBeInTheDocument();
  });

  it('activates the route only with an explicitly injected operator client', async () => {
    const client = operatorClient();
    window.history.replaceState({}, '', '/operations/rbac');
    render(<App operatorRbacClient={client} />);

    expect(await screen.findByRole('heading', { name: '운영자 권한' })).toBeInTheDocument();
    expect(client.me).toHaveBeenCalledTimes(1);
  });
});
