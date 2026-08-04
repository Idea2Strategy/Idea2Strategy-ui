import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createAccountOperationsClient } from './api/accountOperations';
import { defaultCompetitionRoomsClient } from './api/competitionRooms';
import { createOperatorRbacClient } from './api/operatorRbac';
import { getSessionAccessToken } from './api/sessionAccessToken';
import { createOperatorOidcSession, readProductionOperatorOidcConfig } from './auth/operatorOidc';
import type { OperatorOidcSession, OperatorOidcSnapshot } from './auth/operatorOidc';
import { createLocalOperatorHarness } from './lib/operatorLocalHarness';

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing from index.html');
const localOperator = createLocalOperatorHarness({
  enabled: import.meta.env.VITE_ENABLE_LOCAL_OPERATOR_HARNESS === 'true',
  mode: import.meta.env.MODE,
  storage: window.sessionStorage,
});

let productionSession: OperatorOidcSession | null = null;
let productionConfigurationError: string | null = null;
try {
  const config = readProductionOperatorOidcConfig(import.meta.env, import.meta.env.MODE, window.location.origin);
  if (config) {
    productionSession = createOperatorOidcSession({
      config,
      storage: window.sessionStorage,
      location: window.location,
      replaceLocation: (path) => {
        window.history.replaceState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
      },
    });
  }
} catch {
  // A partially configured production identity path must remain visibly closed.
  productionConfigurationError = 'OPERATOR_OIDC_CONFIGURATION_INVALID';
}

function RuntimeApp() {
  const [snapshot, setSnapshot] = useState<OperatorOidcSnapshot>(() => productionSession?.snapshot()
    ?? (productionConfigurationError ? { kind: 'error', code: productionConfigurationError } : { kind: 'unauthenticated' }));

  useEffect(() => {
    if (!productionSession) return undefined;
    const unsubscribe = productionSession.subscribe(setSnapshot);
    void productionSession.start();
    return unsubscribe;
  }, []);

  const operatorToken = productionSession?.getAccessToken.bind(productionSession)
    ?? localOperator?.getOperatorAccessToken;
  const operatorReady = Boolean(operatorToken) && (productionSession ? snapshot.kind === 'authenticated' : true);
  const operatorRbacClient = useMemo(() => operatorReady && operatorToken ? createOperatorRbacClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    getOperatorAccessToken: operatorToken,
  }) : undefined, [operatorReady, operatorToken]);
  const operationsClient = useMemo(() => operatorReady && operatorToken ? createAccountOperationsClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    getAccessToken: getSessionAccessToken,
    getOperatorAccessToken: operatorToken,
  }) : undefined, [operatorReady, operatorToken]);
  const operatorAuthentication = productionSession || productionConfigurationError ? {
    snapshot,
    login: (returnTo?: string) => productionSession?.login(returnTo) ?? Promise.resolve(),
    logout: () => productionSession?.logout(),
  } : undefined;

  return <App
    competitionRoomsClient={defaultCompetitionRoomsClient}
    operationsClient={operationsClient}
    operatorRbacClient={operatorRbacClient}
    operatorCaseAccessVerified={operatorReady}
    operatorAuthentication={operatorAuthentication}
  />;
}

createRoot(root).render(<StrictMode><RuntimeApp /></StrictMode>);
