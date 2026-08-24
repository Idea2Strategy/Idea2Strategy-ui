import { startMockApi } from './mockApi';
import { MOCK_API_PORT } from './ports';
import type { MockApi } from './mockApi';

/*
  Bring the mock backtest engine up for the run and take it down after.

  It lives in the Playwright process rather than in a child process so it can be
  imported straight from `src/test/backtestFixtures.ts` — the same payloads the unit
  suite asserts against — with no build step and no second copy of the fixtures.
*/
let api: MockApi | null = null;

export default async function globalSetup(): Promise<() => Promise<void>> {
  api = await startMockApi(MOCK_API_PORT);
  // Fail the run here rather than in every spec if the contract server is not really
  // answering: a suite that silently tests against nothing is worse than a red one.
  const health = await fetch(`${api.url}/health`);
  if (!health.ok) throw new Error(`mock backtest API did not come up: ${health.status}`);

  return async () => {
    await api?.close();
    api = null;
  };
}
