import { StrictMode, useEffect, useMemo, useState } from 'react';
import '@fontsource-variable/noto-sans-kr/wght.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createAccountOperationsClient } from './api/accountOperations';
import { createCompetitionRoomsClient, defaultCompetitionRoomsClient } from './api/competitionRooms';
import { createOperatorRbacClient } from './api/operatorRbac';
import { getSessionAccessToken } from './api/sessionAccessToken';
import { createOperatorSession } from './auth/operatorSession';
import type { OperatorSessionSnapshot } from './auth/operatorSession';

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing from index.html');
const operatorSession = createOperatorSession({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? '' });

function RuntimeApp() {
  const [snapshot, setSnapshot] = useState<OperatorSessionSnapshot>(() => operatorSession.snapshot());
  useEffect(() => { const unsubscribe = operatorSession.subscribe(setSnapshot); void operatorSession.start(); return unsubscribe; }, []);
  const operatorReady = snapshot.kind === 'authenticated';
  const csrf = operatorSession.getCsrfToken.bind(operatorSession);
  const operatorRbacClient = useMemo(() => operatorReady ? createOperatorRbacClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '', getOperatorCsrfToken: csrf,
  }) : undefined, [operatorReady]);
  const operationsClient = useMemo(() => operatorReady ? createAccountOperationsClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '', getAccessToken: getSessionAccessToken,
    getOperatorCsrfToken: csrf,
  }) : undefined, [operatorReady]);
  const operatorCompetitionClient = useMemo(() => operatorReady ? createCompetitionRoomsClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '', getAccessToken: getSessionAccessToken,
    getOperatorCsrfToken: csrf,
  }) : undefined, [operatorReady]);
  const operatorAuthentication = {
    snapshot,
    login: operatorSession.login.bind(operatorSession),
    reauthenticate: operatorSession.reauthenticate.bind(operatorSession),
    logout: operatorSession.logout.bind(operatorSession),
  };
  return <App competitionRoomsClient={defaultCompetitionRoomsClient}
    operatorCompetitionClient={operatorCompetitionClient} operationsClient={operationsClient}
    operatorRbacClient={operatorRbacClient} operatorCaseAccessVerified={operatorReady}
    operatorAuthentication={operatorAuthentication} />;
}

createRoot(root).render(<StrictMode><RuntimeApp /></StrictMode>);
