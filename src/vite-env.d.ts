/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPERATOR_OIDC_ENABLED?: string;
  readonly VITE_OPERATOR_OIDC_ISSUER?: string;
  readonly VITE_OPERATOR_OIDC_AUTHORIZATION_ENDPOINT?: string;
  readonly VITE_OPERATOR_OIDC_TOKEN_ENDPOINT?: string;
  readonly VITE_OPERATOR_OIDC_END_SESSION_ENDPOINT?: string;
  readonly VITE_OPERATOR_OIDC_CLIENT_ID?: string;
  readonly VITE_OPERATOR_OIDC_AUDIENCE?: string;
  readonly VITE_OPERATOR_OIDC_REDIRECT_URI?: string;
  readonly VITE_OPERATOR_OIDC_POST_LOGOUT_REDIRECT_URI?: string;
  readonly VITE_OPERATOR_OIDC_SCOPES?: string;
  readonly VITE_OPERATOR_OIDC_SIGNING_ALGORITHM?: string;
}
