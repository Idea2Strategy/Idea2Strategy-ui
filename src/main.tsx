import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createAccountOperationsClient } from './api/accountOperations';
import { defaultCompetitionRoomsClient } from './api/competitionRooms';
import { createOperatorRbacClient } from './api/operatorRbac';
import { createLocalOperatorHarness } from './lib/operatorLocalHarness';

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing from index.html');
const localOperator = createLocalOperatorHarness({
  enabled: import.meta.env.VITE_ENABLE_LOCAL_OPERATOR_HARNESS === 'true',
  mode: import.meta.env.MODE,
  storage: window.sessionStorage,
});
const operatorOptions = localOperator ? {
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  getOperatorAccessToken: localOperator.getOperatorAccessToken,
} : null;

createRoot(root).render(<StrictMode><App
  competitionRoomsClient={defaultCompetitionRoomsClient}
  operationsClient={operatorOptions ? createAccountOperationsClient(operatorOptions) : undefined}
  operatorRbacClient={operatorOptions ? createOperatorRbacClient(operatorOptions) : undefined}
  operatorCaseAccessVerified={operatorOptions !== null}
/></StrictMode>);
