/*
  A request-level stand-in for the rebuilt backtest-engine `/api/v1` surface.

  The payloads live in `./backtestFixtures`, which the Playwright mock server reads
  too; this file is only the routing and the status codes. Authentication is modelled
  the way the server draws the line (`backtest_engine/api.py` module docstring): a
  missing, malformed or unknown credential is 401, a valid credential on somebody
  else's run is 403, and an id that belongs to nobody is 404 — except on the two
  result-read-model routes, where a foreign run is 404 as well, because a 403 there
  would confirm that the run exists and that another account finished it.
*/
import { HttpResponse, http } from 'msw';
import type { RequestHandler } from 'msw';
import {
  BACKTEST_API_BASE,
  DEFAULT_STATE,
  ET_MONTH_PATTERN,
  OTHER_OWNER_RUN_ID,
  RESULT_NOT_READY_REASON,
  principalOf,
} from './backtestFixtures';
import type { BacktestApiState, Json } from './backtestFixtures';

export * from './backtestFixtures';

const UNAUTHENTICATED = () => HttpResponse.json(
  { detail: 'an Authorization header is required' },
  { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
);

const FORBIDDEN = (runId: string) => HttpResponse.json(
  { detail: `backtest run ${runId} belongs to another account` },
  { status: 403 },
);

const NOT_FOUND = (runId: string) => HttpResponse.json(
  { detail: `backtest run not found: ${runId}` },
  { status: 404 },
);

/** `api._require_completed` / `_query_errors`: one code for "not published yet". */
const NOT_READY = (status: string) => HttpResponse.json(
  {
    detail: {
      message: `backtest result is not available for status ${status}`,
      reasonCode: RESULT_NOT_READY_REASON,
      status,
    },
  },
  { status: 409 },
);

function runStatusOf(runId: string, state: BacktestApiState): string | null {
  const run = state.runs.find((item) => item.backtestRunId === runId);
  return run ? String(run.status) : null;
}

/**
 * Resolve one run-scoped request the way `api._owned` does, or the response that
 * should replace it.
 */
function owned(request: Request, runId: string, state: BacktestApiState) {
  const caller = principalOf(request.headers.get('Authorization'));
  if (caller === null) return UNAUTHENTICATED();
  if (runId === OTHER_OWNER_RUN_ID) return caller === 'other' ? null : FORBIDDEN(runId);
  if (!state.runs.some((run) => run.backtestRunId === runId)) return NOT_FOUND(runId);
  return caller === 'owner' ? null : FORBIDDEN(runId);
}

/**
 * `api._require_completed`, applied to the three write-model evidence routes so they
 * agree with the two result-read-model ones. Emptiness is never a reason for 409.
 */
function requireCompleted(runId: string, state: BacktestApiState) {
  const status = runStatusOf(runId, state);
  return status !== null && status !== 'COMPLETED' ? NOT_READY(status) : null;
}

/**
 * `api._result_query` routes: the read model fails closed, so "no such run" and "not
 * yours" are the same 404, and an unfinished run is 409 rather than a partial answer.
 */
function ownedEvidence(request: Request, runId: string, state: BacktestApiState) {
  const caller = principalOf(request.headers.get('Authorization'));
  if (caller === null) return UNAUTHENTICATED();
  const status = runStatusOf(runId, state);
  if (caller !== 'owner' || status === null) {
    return HttpResponse.json({ detail: 'backtest not found' }, { status: 404 });
  }
  if (status !== 'COMPLETED') return NOT_READY(status);
  return null;
}

export function backtestHandlers(overrides: Partial<BacktestApiState> = {}): RequestHandler[] {
  const state: BacktestApiState = { ...DEFAULT_STATE, ...overrides };
  const path = (suffix: string) => `${BACKTEST_API_BASE}/api/v1/backtests${suffix}`;

  return [
    http.get(path(''), ({ request }) => {
      const caller = principalOf(request.headers.get('Authorization'));
      if (caller === null) return UNAUTHENTICATED();
      const url = new URL(request.url);
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        return HttpResponse.json({ detail: 'limit must be between 1 and 200' }, { status: 422 });
      }
      if (!Number.isInteger(offset) || offset < 0) {
        return HttpResponse.json({ detail: 'offset must not be negative' }, { status: 422 });
      }
      // `lifecycle.list_runs` builds each `BacktestRun` without its attempts, so the
      // list endpoint reports `attemptCount: 0` for every run however many attempts it
      // really had. Reproduced rather than corrected: this is the server's behaviour,
      // and the screen reads the attempts endpoint instead of trusting this field.
      const items = caller === 'owner'
        ? state.runs.slice(offset, offset + limit).map((run) => ({ ...run, attemptCount: 0 }))
        : [];
      return HttpResponse.json({ items, limit, offset });
    }),

    http.get(path('/:runId'), ({ request, params }) => {
      const runId = String(params.runId);
      return owned(request, runId, state)
        ?? HttpResponse.json(state.runs.find((run) => run.backtestRunId === runId));
    }),

    http.get(path('/:runId/attempts'), ({ request, params }) => (
      owned(request, String(params.runId), state) ?? HttpResponse.json({ items: state.attempts })
    )),

    http.get(path('/:runId/performance'), ({ request, params }) => {
      const runId = String(params.runId);
      const denied = owned(request, runId, state) ?? requireCompleted(runId, state);
      if (denied) return denied;
      if (state.performance === null) {
        return HttpResponse.json(
          { detail: `backtest run ${runId} has no performance summary yet` },
          { status: 404 },
        );
      }
      return HttpResponse.json(state.performance);
    }),

    http.get(path('/:runId/monthly-summaries'), ({ request, params }) => {
      const runId = String(params.runId);
      return owned(request, runId, state)
        ?? requireCompleted(runId, state)
        ?? HttpResponse.json({ items: state.monthlySummaries });
    }),

    http.get(path('/:runId/detail-manifests'), ({ request, params }) => {
      const runId = String(params.runId);
      return owned(request, runId, state)
        ?? requireCompleted(runId, state)
        ?? HttpResponse.json({ items: state.detailManifests });
    }),

    http.get(path('/:runId/inputs'), ({ request, params }) => {
      const runId = String(params.runId);
      const caller = principalOf(request.headers.get('Authorization'));
      if (caller === null) return UNAUTHENTICATED();
      const run = state.runs.find((item) => item.backtestRunId === runId);
      if (caller !== 'owner' || !run) return NOT_FOUND(runId);
      const completed = run.status === 'COMPLETED';
      return HttpResponse.json({
        backtestRunId: runId,
        botId: run.botId,
        status: run.status,
        strategySnapshotHash: `sha256:${'1'.repeat(64)}`,
        compiledPlanChecksum: `sha256:${'2'.repeat(64)}`,
        datasetManifestId: '00000000-0000-4000-8000-000000000301',
        datasetHash: `sha256:${'3'.repeat(64)}`,
        inputBundleFingerprint: `sha256:${'4'.repeat(64)}`,
        inputContractVersion: 'strategy-bot.v1',
        datasets: [{
          datasetManifestId: '00000000-0000-4000-8000-000000000301',
          purposeCode: 'MARKET_BARS',
          lockedDatasetHash: `sha256:${'3'.repeat(64)}`,
        }],
        featureMaterializations: [],
        executionPolicyVersion: 'official-backtest-policy-v2',
        precisionRulesVersion: 'precision:1.0.0',
        calculationModelVersion: completed ? 'calculation-v9' : null,
        costModelVersion: completed ? 'cost-v3' : null,
        executionModelVersion: completed ? 'execution-v5' : null,
        reasonCode: run.failureCode ?? null,
        missingRequirements: run.status === 'UNAVAILABLE' ? ['resolution:1m'] : [],
      });
    }),

    http.get(path('/:runId/monthly-trades'), ({ request, params }) => {
      const runId = String(params.runId);
      const denied = ownedEvidence(request, runId, state);
      if (denied) return denied;
      // `api.get_monthly_trades` declares `et_month` as a required query parameter and
      // never defaults it: a month picked on the caller's behalf answers a question
      // nobody asked.
      const etMonth = new URL(request.url).searchParams.get('et_month');
      if (etMonth === null) {
        return HttpResponse.json(
          { detail: [{ loc: ['query', 'et_month'], msg: 'Field required' }] },
          { status: 422 },
        );
      }
      if (!ET_MONTH_PATTERN.test(etMonth)) {
        return HttpResponse.json(
          {
            detail: {
              message: `et_month must be a single ET calendar month written YYYY-MM, got '${etMonth}'`,
              reasonCode: 'ET_MONTH_MALFORMED',
              parameter: 'et_month',
            },
          },
          { status: 422 },
        );
      }
      const items: Json[] = state.monthlyTrades[etMonth] ?? [];
      return HttpResponse.json({ backtestRunId: runId, etMonth, items });
    }),
  ];
}
