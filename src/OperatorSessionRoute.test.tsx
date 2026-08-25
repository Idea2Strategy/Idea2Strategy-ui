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
): OperatorAuthentication => ({ snapshot, login: vi.fn().mockResolvedValue(undefined),
  reauthenticate: vi.fn().mockResolvedValue(undefined), logout: vi.fn() });

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('operator cookie-session route boundary', () => {
  it('keeps a protected operator URL in place while the cookie session is restoring', () => {
    window.history.replaceState({}, '', '/operations/cases');
    render(<App operatorAuthentication={authentication({ kind: 'loading' })} />);

    expect(screen.getByRole('status')).toBeVisible();
    expect(window.location.pathname).toBe('/operations/cases');
    expect(screen.queryByRole('heading', { name: 'Operator sign-in' })).not.toBeInTheDocument();
  });

  it('redirects a protected operator route to the dedicated sign-in and preserves returnTo', async () => {
    const auth = authentication({ kind: 'unauthenticated' });
    window.history.replaceState({}, '', '/operations/rbac');
    render(<App operatorAuthentication={auth} />);

    await userEvent.type(await screen.findByLabelText('운영자 아이디'), 'admin');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password');
    await userEvent.type(screen.getByLabelText('인증 앱 6자리 코드'), '123456');
    await userEvent.click(screen.getByRole('button', { name: '운영자 로그인' }));

    expect(auth.login).toHaveBeenCalledWith({ loginName: 'admin', password: 'password', totpCode: '123456' });
  });

  it('renders a fail-closed service error while keeping the login UI visible', () => {
    window.history.replaceState({}, '', '/operations/login');
    render(<App operatorAuthentication={authentication({ kind: 'error', code: 'OPERATOR_AUTHENTICATION_UNAVAILABLE' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('운영자 인증을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('OPERATOR_AUTHENTICATION_UNAVAILABLE');
    expect(screen.getByLabelText('운영자 아이디')).toBeVisible();
  });

  it('injects the real operator client only while authenticated and exposes logout', async () => {
    const auth = authentication({ kind: 'authenticated', operatorId: 'operator-1',
      mfaVerifiedAt: new Date().toISOString(), absoluteExpiresAt: new Date(Date.now() + 60_000).toISOString() });
    const operatorClient = client();
    window.history.replaceState({}, '', '/operations/rbac');
    render(<App operatorAuthentication={auth} operatorRbacClient={operatorClient} />);

    await waitFor(() => expect(operatorClient.me).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Operator logout' }));

    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});
