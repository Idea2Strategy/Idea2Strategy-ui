import { useEffect, useRef, useState } from 'react';
import type { AccountClient } from '../api/account';
import { AccountApiError } from '../api/account';
import { useLanguage } from '../lib/i18n';

/*
  Google sign-in for the auth screens.

  Honesty gate: the button exists only when BOTH sides are real — a configured
  OAuth client id (VITE_GOOGLE_OAUTH_CLIENT_ID) and an account client that
  implements the token exchange. Absent either, nothing renders; there is no
  dead button pointing at an endpoint that does not exist.

  The button itself is Google Identity Services' own rendered button, which
  keeps Google's brand rules and popup handling; only the container is ours.
*/

const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdApi {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        nonce: string;
        callback: (response: GoogleCredentialResponse) => void;
        ux_mode?: 'popup' | 'redirect';
      }): void;
      renderButton(parent: HTMLElement, options: {
        type?: 'standard' | 'icon';
        theme?: 'outline' | 'filled_blue' | 'filled_black';
        size?: 'large' | 'medium' | 'small';
        text?: 'signin_with' | 'signup_with' | 'continue_with';
        width?: number;
        locale?: string;
      }): void;
    };
  };
}

declare global {
  interface Window { google?: GoogleIdApi }
}

let gisLoader: Promise<GoogleIdApi> | null = null;

function loadGoogleIdentity(): Promise<GoogleIdApi> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  gisLoader ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      if (window.google?.accounts?.id) resolve(window.google);
      else reject(new Error('Google Identity Services did not initialize.'));
    };
    script.onerror = () => {
      gisLoader = null;
      reject(new Error('Google Identity Services failed to load.'));
    };
    document.head.appendChild(script);
  });
  return gisLoader;
}

export interface GoogleSignInButtonProps {
  client: AccountClient;
  /** Called after the server has issued a session for the Google identity. */
  onSignedIn: () => void;
  onFailure: (error: AccountApiError) => void;
  clientId?: string;
}

export function GoogleSignInButton({
  client,
  onSignedIn,
  onFailure,
  clientId = (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined) ?? '',
}: GoogleSignInButtonProps) {
  const { language } = useLanguage();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const available = Boolean(clientId) && typeof client.loginWithGoogle === 'function';

  useEffect(() => {
    if (!available) return undefined;
    let disposed = false;
    void loadGoogleIdentity().then((google) => {
      if (disposed || !mountRef.current) return;
      const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
      const nonce = btoa(String.fromCharCode(...nonceBytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      google.accounts.id.initialize({
        client_id: clientId,
        nonce,
        ux_mode: 'popup',
        callback: (response) => {
          if (!response.credential) {
            onFailure(new AccountApiError(0, 'GOOGLE_CREDENTIAL_MISSING', null));
            return;
          }
          setExchanging(true);
          client.loginWithGoogle!(response.credential, nonce)
            .then(() => onSignedIn())
            .catch((cause: unknown) => {
              onFailure(cause instanceof AccountApiError ? cause : new AccountApiError(0, 'NETWORK_ERROR', null));
            })
            .finally(() => setExchanging(false));
        },
      });
      google.accounts.id.renderButton(mountRef.current, {
        type: 'standard',
        theme: 'outline',
        // Google documents that medium and small buttons are not personalized.
        // This keeps account names/avatars out of both auth screens while the
        // official GIS control continues to own branding and credential UX.
        size: 'medium',
        text: 'signin_with',
        width: 320,
        locale: language,
      });
    }).catch(() => {
      // The script is blocked or offline: the area simply stays empty rather
      // than showing a button that cannot work.
    });
    return () => { disposed = true; };
  }, [available, client, clientId, language, onFailure, onSignedIn]);

  if (!available) return null;
  return <div className="auth-google">
    <div className="auth-divider" aria-hidden="true"><span>또는</span></div>
    <div ref={mountRef} className="auth-google-mount" data-testid="google-sign-in" />
    {exchanging && <p role="status">Google 계정으로 로그인하는 중입니다.</p>}
  </div>;
}
