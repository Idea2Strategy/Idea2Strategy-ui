# Production operator OIDC inputs

The production UI uses a dedicated OAuth 2.0 Authorization Code flow with PKCE for
operator access. It does not reuse the customer session. Tokens are held in browser
memory; `sessionStorage` contains only a one-time, five-minute redirect transaction
and is cleared after callback or failure.

Set these values when building the production frontend:

| Variable | Required value |
| --- | --- |
| `VITE_OPERATOR_OIDC_ENABLED` | `true` |
| `VITE_OPERATOR_OIDC_ISSUER` | Exact HTTPS issuer accepted by the backend/gateway |
| `VITE_OPERATOR_OIDC_AUTHORIZATION_ENDPOINT` | Provider HTTPS authorization endpoint |
| `VITE_OPERATOR_OIDC_TOKEN_ENDPOINT` | Provider HTTPS token endpoint with browser CORS enabled for the UI origin |
| `VITE_OPERATOR_OIDC_END_SESSION_ENDPOINT` | Optional provider HTTPS logout endpoint |
| `VITE_OPERATOR_OIDC_CLIENT_ID` | Public browser client ID (no client secret) |
| `VITE_OPERATOR_OIDC_AUDIENCE` | Exact operator API audience accepted by the backend/gateway |
| `VITE_OPERATOR_OIDC_REDIRECT_URI` | Same-origin absolute URL ending in `/operations/callback` |
| `VITE_OPERATOR_OIDC_POST_LOGOUT_REDIRECT_URI` | Same-origin absolute URL ending in `/operations/login` |
| `VITE_OPERATOR_OIDC_LOGOUT_REDIRECT_PARAMETER` | `post_logout_redirect_uri` by default; use `logout_uri` for Amazon Cognito managed login |
| `VITE_OPERATOR_OIDC_SCOPES` | Space-delimited scopes including `openid`; include the provider's refresh scope if refresh tokens are enabled |
| `VITE_OPERATOR_OIDC_SIGNING_ALGORITHM` | Exact expected JWT algorithm, normally `RS256` |

Register both redirect URIs on the identity provider. Configure it as a public client:
no client secret is embedded in the frontend, authorization code and PKCE S256 are
required, implicit flow is disabled, and redirect URI matching is exact.

The browser validates token shape, algorithm and time/issuer/audience/nonce claims to
fail closed before use. Cryptographic JWT signature, current MFA and operator RBAC are
authoritatively validated by the backend or trusted gateway on every operator request.
All operator API calls use `Authorization: Bearer` with `credentials: omit`.

`VITE_*` values are public build-time configuration, not secrets. Provider client
secrets, private keys and backend credentials belong in the runtime secret store and
must never be supplied to the UI build.

Run the production-mode browser contract locally with:

```powershell
pnpm e2e:operator-oidc
```

This starts a disposable mock IdP, checks the real PKCE redirect and token exchange in
Chromium, verifies the isolated bearer request, confirms tokens are not persisted, and
exercises provider logout.
