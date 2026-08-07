import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleSignInButton } from './GoogleSignInButton';
import type { AccountClient } from '../api/account';

/*
  The honesty gate is the point of these tests: the Google entry exists only
  when both the OAuth client id and the token-exchange client method are real.
*/

const clientWithGoogle = (loginWithGoogle = vi.fn().mockResolvedValue({
  accountId: 'account-1', tokenType: 'Bearer', accessToken: 'access-1',
  accessExpiresAt: '2026-08-06T00:05:00Z', refreshExpiresAt: '2026-08-06T12:00:00Z',
})): AccountClient => ({
  signup: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), login: vi.fn(),
  loginWithGoogle,
  requestPasswordReset: vi.fn(), resetPassword: vi.fn(), rotateSession: vi.fn(),
  logoutCurrent: vi.fn(), logoutAll: vi.fn(), preferences: vi.fn(),
  updatePreferences: vi.fn(), requestWithdrawal: vi.fn(), cancelWithdrawal: vi.fn(),
});

afterEach(() => {
  delete window.google;
});

describe('GoogleSignInButton', () => {
  it('renders nothing without a configured OAuth client id', () => {
    render(<GoogleSignInButton client={clientWithGoogle()} clientId="" onSignedIn={() => {}} onFailure={() => {}} />);
    expect(screen.queryByTestId('google-sign-in')).not.toBeInTheDocument();
  });

  it('renders nothing when the account client has no token exchange', () => {
    const client = clientWithGoogle();
    delete (client as Partial<AccountClient>).loginWithGoogle;
    render(<GoogleSignInButton client={client} clientId="client-id-1" onSignedIn={() => {}} onFailure={() => {}} />);
    expect(screen.queryByTestId('google-sign-in')).not.toBeInTheDocument();
  });

  it('exchanges the Google credential through the client and reports success', async () => {
    let credentialCallback: ((response: { credential?: string }) => void) | undefined;
    const renderButton = vi.fn();
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn().mockImplementation((config: { callback: (response: { credential?: string }) => void }) => {
            credentialCallback = config.callback;
          }),
          renderButton,
        },
      },
    };
    const loginWithGoogle = vi.fn().mockResolvedValue({
      accountId: 'account-1', tokenType: 'Bearer', accessToken: 'access-1',
      accessExpiresAt: '2026-08-06T00:05:00Z', refreshExpiresAt: '2026-08-06T12:00:00Z',
    });
    const onSignedIn = vi.fn();

    render(<GoogleSignInButton
      client={clientWithGoogle(loginWithGoogle)}
      clientId="client-id-1"
      onSignedIn={onSignedIn}
      onFailure={() => {}}
    />);

    expect(screen.getByTestId('google-sign-in')).toBeInTheDocument();
    await waitFor(() => expect(credentialCallback).toBeDefined());
    expect(renderButton).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      text: 'signin_with',
      size: 'medium',
      locale: 'ko',
    }));
    credentialCallback!({ credential: 'google-jwt' });

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(loginWithGoogle).toHaveBeenCalledWith('google-jwt', expect.any(String));
  });
});
