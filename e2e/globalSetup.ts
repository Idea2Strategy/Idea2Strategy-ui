import { startMockApi } from './mockApi';
import { MOCK_API_PORT } from './ports';
import { MOCK_IDP_PORT } from './ports';
import type { MockApi } from './mockApi';
import { startMockOperatorIdp } from './mockOperatorIdp';
import type { MockOperatorIdp } from './mockOperatorIdp';

/*
  Bring the mock backtest engine up for the run and take it down after.

  It lives in the Playwright process rather than in a child process so it can be
  imported straight from `src/test/backtestFixtures.ts` — the same payloads the unit
  suite asserts against — with no build step and no second copy of the fixtures.
*/
let api: MockApi | null = null;
let idp: MockOperatorIdp | null = null;

export default async function globalSetup(): Promise<() => Promise<void>> {
  api = await startMockApi(MOCK_API_PORT);
  idp = await startMockOperatorIdp(MOCK_IDP_PORT);
  // Fail the run here rather than in every spec if the contract server is not really
  // answering: a suite that silently tests against nothing is worse than a red one.
  const health = await fetch(`${api.url}/health`);
  if (!health.ok) throw new Error(`mock backtest API did not come up: ${health.status}`);
  const identityHealth = await fetch(`${idp.url}/health`);
  if (!identityHealth.ok) throw new Error(`mock operator IdP did not come up: ${identityHealth.status}`);

  return async () => {
    await api?.close();
    await idp?.close();
    api = null;
    idp = null;
  };
}
