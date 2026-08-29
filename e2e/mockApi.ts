/*
  An HTTP server that answers the backtest-engine `/api/v1` contract.

  The unit suite intercepts `fetch` with msw; a browser driven by Playwright cannot be
  intercepted that way, so the same fixtures are served over a real socket instead.
  Both fakes read `src/test/backtestFixtures.ts`, so there is one description of the
  server's shapes and the E2E cannot drift into passing against a payload the unit
  tests never saw.

  What this reproduces, from `backtest_engine/api.py` and its test suite:

  * bearer authentication, with **401** for an absent, malformed or unknown credential
    and **403** for a valid credential on another account's run;
  * **404** for an unknown run — and for a *foreign* run on the two result-read-model
    routes, which fail closed rather than confirming the run exists;
  * **409 `BACKTEST_RESULT_NOT_READY`** on every evidence route until the run is
    `COMPLETED`, never for an answer that is merely empty;
  * `monthly-trades` with `et_month` as a **required** parameter, **422** when it is
    absent or malformed, and `200 {"items": []}` for a month that traded nothing;
  * `{items, limit, offset}` on the run list, with the engine's real `attemptCount: 0`
    defect left in place.

  What it is not: the engine. It serves fixed rows and runs no backtest. Every claim
  the E2E makes is about the browser, the app and this contract — not about the
  engine's own correctness, which its own Python suite covers.
*/
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import {
  DEFAULT_STATE,
  ET_MONTH_PATTERN,
  OTHER_OWNER_RUN_ID,
  RESULT_NOT_READY_REASON,
  principalOf,
} from '../src/test/backtestFixtures';
import type { BacktestApiState, Json } from '../src/test/backtestFixtures';

const PREFIX = '/api/v1/backtests';

interface Answer {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Answer {
  return { status, body, headers };
}

const UNAUTHENTICATED = json(
  { detail: 'an Authorization header is required' },
  401,
  { 'WWW-Authenticate': 'Bearer' },
);
const FORBIDDEN = (runId: string) =>
  json({ detail: `backtest run ${runId} belongs to another account` }, 403);
const NOT_FOUND = (runId: string) => json({ detail: `backtest run not found: ${runId}` }, 404);
const NOT_READY = (status: string) => json({
  detail: {
    message: `backtest result is not available for status ${status}`,
    reasonCode: RESULT_NOT_READY_REASON,
    status,
  },
}, 409);

export interface MockApi {
  readonly url: string;
  close(): Promise<void>;
}

/**
 * Start the mock engine on `port`.
 *
 * `state` exists so a spec can serve a queued run, a run with no performance summary
 * or a month with no trades without inventing new payload shapes.
 */
export function startMockApi(
  port: number,
  overrides: Partial<BacktestApiState> = {},
): Promise<MockApi> {
  const state: BacktestApiState = { ...DEFAULT_STATE, ...overrides };
  const server = createServer((request, response) => {
    respond(response, route(request, state), request.headers.origin);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => closeServer(server),
      });
    });
  });
}

/*
  The app runs on a different origin than this API, as it does behind any real
  gateway, so every answer carries CORS headers.

  `Access-Control-Allow-Origin` echoes the caller rather than saying `*`: the client
  sends `credentials: 'include'`, and a wildcard origin on a credentialed request is
  rejected by the browser before the response ever reaches the app. Getting this wrong
  looks exactly like a broken screen, which is the class of failure this suite exists
  to catch.
*/
function respond(response: ServerResponse, answer: Answer, origin?: string): void {
  response.writeHead(answer.status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin ?? 'null',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
    ...answer.headers,
  });
  response.end(answer.body === null ? '' : JSON.stringify(answer.body));
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

function runStatusOf(runId: string, state: BacktestApiState): string | null {
  const run = state.runs.find((item) => item.backtestRunId === runId);
  return run ? String(run.status) : null;
}

/** `api._owned`: 401, then 403 for a foreign run, then 404 for an unknown one. */
function owned(caller: 'owner' | 'other', runId: string, state: BacktestApiState): Answer | null {
  if (runId === OTHER_OWNER_RUN_ID) return caller === 'other' ? null : FORBIDDEN(runId);
  if (runStatusOf(runId, state) === null) return NOT_FOUND(runId);
  return caller === 'owner' ? null : FORBIDDEN(runId);
}

/** `api._require_completed`: 409 while the run has not finished. Never for emptiness. */
function requireCompleted(runId: string, state: BacktestApiState): Answer | null {
  const status = runStatusOf(runId, state);
  return status !== null && status !== 'COMPLETED' ? NOT_READY(status) : null;
}

function route(request: IncomingMessage, state: BacktestApiState): Answer {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method === 'OPTIONS') return { status: 204, body: null };
  if (request.method !== 'GET') return json({ detail: 'method not allowed' }, 405);
  if (url.pathname === '/health') return json({ status: 'ok' });

  // The credential is checked before anything else, including the query string, so an
  // anonymous caller cannot probe the parameter contract.
  const caller = principalOf(request.headers.authorization ?? null);
  if (caller === null) return UNAUTHENTICATED;

  if (url.pathname === '/api/v1/bots/operations') {
    return json(Array.from(new Map(state.runs.map((run) => [String(run.botId), {
      botId: String(run.botId), name: '테스트 봇',
    }])).values()));
  }
  if (url.pathname === '/api/v1/strategy-release-inputs') return json({ executionPolicies: [], datasets: [] });
  if (url.pathname === '/api/v1/market-data/benchmarks') return json({
    instruments: [
      { instrumentId: 'benchmark-spx', symbol: 'SPX', name: 'S&P 500' },
      { instrumentId: 'benchmark-ndx', symbol: 'NDX', name: 'NASDAQ-100' },
    ],
  });
  const marketMatch = url.pathname.match(/^\/api\/v1\/market-data\/instruments\/([^/]+)\/bars$/);
  if (marketMatch) return benchmarkBars(decodeURIComponent(marketMatch[1]));
  if (!url.pathname.startsWith(PREFIX)) return json({ detail: 'not found' }, 404);

  const rest = url.pathname.slice(PREFIX.length).replace(/^\//, '');
  if (rest === '') return listRuns(url, caller, state);

  const [runId, suffix = ''] = rest.split('/');
  switch (suffix) {
    case '':
      return owned(caller, runId, state)
        ?? json(state.runs.find((run) => run.backtestRunId === runId));
    case 'attempts':
      return owned(caller, runId, state) ?? json({ items: state.attempts });
    case 'inputs': {
      const denied = owned(caller, runId, state);
      if (denied) return denied;
      const run = state.runs.find((item) => item.backtestRunId === runId)!;
      const completed = run.status === 'COMPLETED';
      return json({
        backtestRunId: runId,
        botId: run.botId,
        status: run.status,
        strategySnapshotHash: `sha256:${'1'.repeat(64)}`,
        compiledPlanChecksum: `sha256:${'2'.repeat(64)}`,
        datasetManifestId: '00000000-0000-4000-8000-000000000301',
        datasetHash: `sha256:${'3'.repeat(64)}`,
        inputBundleFingerprint: `sha256:${'4'.repeat(64)}`,
        inputContractVersion: 'strategy-bot.v1',
        datasets: [{ datasetManifestId: '00000000-0000-4000-8000-000000000301', purposeCode: 'MARKET_BARS', lockedDatasetHash: `sha256:${'3'.repeat(64)}` }],
        featureMaterializations: [],
        executionPolicyVersion: 'official-backtest-policy-v2',
        precisionRulesVersion: 'precision:1.0.0',
        calculationModelVersion: completed ? 'calculation-v9' : null,
        costModelVersion: completed ? 'cost-v3' : null,
        executionModelVersion: completed ? 'execution-v5' : null,
        reasonCode: run.failureCode ?? null,
        missingRequirements: run.status === 'UNAVAILABLE' ? ['resolution:1m'] : [],
      });
    }
    case 'performance':
      return owned(caller, runId, state)
        ?? requireCompleted(runId, state)
        ?? (state.performance === null
          ? json({ detail: `backtest run ${runId} has no performance summary yet` }, 404)
          : json(state.performance));
    case 'performance-series':
      return caller !== 'owner' || runStatusOf(runId, state) === null
        ? json({ detail: 'backtest not found' }, 404)
        : requireCompleted(runId, state)
          ?? (state.performanceSeries === null
            ? json({ detail: 'performance series not found' }, 404)
            : json(state.performanceSeries));
    case 'monthly-summaries':
      return owned(caller, runId, state)
        ?? requireCompleted(runId, state)
        ?? json({ items: state.monthlySummaries });
    case 'detail-manifests':
      return owned(caller, runId, state)
        ?? requireCompleted(runId, state)
        ?? json({ items: state.detailManifests });
    case 'monthly-trades':
      return monthlyTrades(url, caller, runId, state);
    default:
      return json({ detail: 'not found' }, 404);
  }
}

function benchmarkBars(instrumentId: string): Answer {
  const symbols: Record<string, string> = {
    'benchmark-spx': 'SPX', 'benchmark-ndx': 'NDX',
  };
  const symbol = symbols[instrumentId];
  if (!symbol) return json({ detail: 'instrument not found' }, 404);
  const closes = symbol === 'SPX' ? [6300, 6363, 6426] : [22000, 22440, 22880];
  return json({
    instrumentId,
    symbol,
    timeframe: '1d',
    bars: ['2026-07-01T20:00:00Z', '2026-07-15T20:00:00Z', '2026-07-29T20:00:00Z'].map((occurredAt, index) => ({
      eventId: `${symbol}-${index}`, occurredAt, sequence: index + 1, revision: 1,
      open: closes[index], high: closes[index] + 1, low: closes[index] - 1,
      close: closes[index], volume: 0,
      provider: symbol === 'NDX' ? 'NASDAQ_INDEX' : 'YAHOO_INDEX', feed: 'INDEX_DAILY',
    })),
  });
}

function listRuns(url: URL, caller: 'owner' | 'other', state: BacktestApiState): Answer {
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return json({ detail: 'limit must be between 1 and 200' }, 422);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return json({ detail: 'offset must not be negative' }, 422);
  }
  // `lifecycle.list_runs` leaves every listed run's attempts unloaded, so the real
  // server reports `attemptCount: 0` here. Reproduced, not corrected.
  const items = caller === 'owner'
    ? state.runs.slice(offset, offset + limit).map((run) => ({ ...run, attemptCount: 0 }))
    : [];
  return json({ items, limit, offset });
}

function monthlyTrades(
  url: URL,
  caller: 'owner' | 'other',
  runId: string,
  state: BacktestApiState,
): Answer {
  // `result_query` fails closed: "no such run" and "not yours" are the same 404 here,
  // because confirming that a foreign run finished is itself a disclosure.
  const status = runStatusOf(runId, state);
  if (caller !== 'owner' || status === null) return json({ detail: 'backtest not found' }, 404);
  if (status !== 'COMPLETED') return NOT_READY(status);

  const etMonth = url.searchParams.get('et_month');
  if (etMonth === null) {
    return json({ detail: [{ loc: ['query', 'et_month'], msg: 'Field required' }] }, 422);
  }
  if (!ET_MONTH_PATTERN.test(etMonth)) {
    return json({
      detail: {
        message: `et_month must be a single ET calendar month written YYYY-MM, got '${etMonth}'`,
        reasonCode: 'ET_MONTH_MALFORMED',
        parameter: 'et_month',
      },
    }, 422);
  }
  const items: Json[] = state.monthlyTrades[etMonth] ?? [];
  return json({ backtestRunId: runId, etMonth, items });
}
