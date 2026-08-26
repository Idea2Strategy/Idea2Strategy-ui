/*
  Client for the backtest-engine `/api/v1` surface.

  Field names, paths and status tokens below are the ones `backtest_engine/api.py`
  actually serves. Three of the differences against the pre-rebuild client are worth
  naming, because each of them used to be a request the server answered with a 404 or
  a body this file could not parse:

  * the payloads are camelCase, and a run is identified by `backtestRunId` + `botId`;
    there is no `strategy_version_id`,
  * the terminal success token is `COMPLETED` (`backtest.run_status`), never `COMPLETE`,
  * the per-ET-month endpoint is `monthly-summaries`, and `detail-manifests` describes
    the evidence *objects* — Parquet parts on an ET Monday week boundary.

  Individual trade records come from `GET /monthly-trades?et_month=YYYY-MM`, which is
  served by `result_query.BacktestResultQueryService` rather than the write model. Two
  consequences that are not cosmetic, both taken from the engine's own tests:

  * a foreign run answers **404, not 403** there. Trade rows are a run's evidence, and
    a 403 would confirm that the id exists and that somebody else finished it;
  * every evidence route answers **409 `BACKTEST_RESULT_NOT_READY`** while the run has
    not reached `COMPLETED`. That is "come back later", not "no such run", and it is
    never used to mean "the answer is empty": a completed run that traded nothing in a
    month is `200 {"items": []}`.
*/
import { browserSessionStore } from '../lib/session';

export type BacktestRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'UNAVAILABLE';

export type BacktestAttemptStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'SKIPPED';

/** `backtest.runs`, as `api._run_payload` renders it. */
export interface BacktestRun {
  backtestRunId: string;
  botId: string;
  ownerAccountId: string;
  status: BacktestRunStatus;
  configurationHash: string;
  evaluationStart: string;
  evaluationEnd: string;
  initialCashAmount: string;
  marketRulesVersion: string;
  accountingRulesVersion: string;
  precisionRulesVersion: string;
  feePolicyId: string;
  slippageRateBps: number;
  buyingPowerBufferPolicyId: string;
  idempotencyKey: string;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /**
   * The failure code for a FAILED run and the reason code for an UNAVAILABLE one:
   * `lifecycle._apply` writes the result event's `reasonCode` into this column.
   */
  failureCode: string | null;
  resultHash: string | null;
  cancellationRequestedAt: string | null;
  cancellationReasonCode: string | null;
  cancelledAt: string | null;
  attemptCount: number;
}

export interface BacktestRunPage {
  items: BacktestRun[];
  limit: number;
  offset: number;
}

/** `backtest.run_attempts`. */
export interface BacktestAttempt {
  attemptId: string;
  backtestRunId: string;
  attemptNumber: number;
  workerExecutionKey: string;
  status: BacktestAttemptStatus;
  startedAt: string;
  completedAt: string | null;
  failureCode: string | null;
}

/**
 * `performance_summaries.metrics_document`, one field per D25 catalogue entry.
 * Percentages and ratios arrive as JSON numbers, money stays `numeric(24,8)` text so
 * no value loses precision on the way to the screen, and an undefined metric is null.
 */
export interface BacktestMetrics {
  totalReturnPct: number | null;
  maxDrawdownPct: number | null;
  sharpe: number | null;
  annualizedVolatilityPct: number | null;
  winRatePct: number | null;
  startingEquity: string | null;
  endingEquity: string | null;
  endingCash: string | null;
  realizedPnl: string | null;
  totalFees: string | null;
  totalSlippage: string | null;
  fillCount: number | null;
  closingTradeCount: number | null;
  winningTradeCount: number | null;
  losingTradeCount: number | null;
  valuationPointCount: number | null;
  valuationBasis: string;
  valuationBasisRuleId: string;
  valuationPeriodicity: string;
  metricRules: Record<string, string>;
}

export interface BacktestPerformanceSummary {
  backtestRunId: string;
  metricCatalogVersion: string;
  calculationRulesVersion: string;
  metrics: BacktestMetrics;
  sourceSetHash: string;
  inputHash: string;
  resultHash: string;
  calculatedAt: string;
}

export interface BacktestPerformanceSeries {
  backtestRunId: string;
  points: Array<{ occurredAt: string; equity: string }>;
  resultHash: string;
  sourceSetHash: string;
}

/** One row of `backtest.failure_condition_counts`, as carried in `summaryDocument`. */
export interface BacktestFirstFailureCount {
  mode: string;
  flowOrBranchKey: string;
  firstFailureConditionKey: string;
  occurrenceCount: number;
}

/** `backtest.monthly_judgment_summaries` with all six canonical counters. */
export interface BacktestMonthlySummary {
  monthlySummaryId: string;
  backtestRunId: string;
  etYearMonth: string;
  evaluationCount: number;
  activeBranchCount: number;
  tradeEventCount: number;
  dataGapCount: number;
  triggeredCount: number;
  rejectedCount: number;
  timezoneId: string;
  firstFailureCounts: BacktestFirstFailureCount[];
  tradeRecordIds: string[];
  summaryHash: string;
}

/** `backtest.detail_manifests`. `weekStartDate` is an ET Monday, not a month. */
export interface BacktestDetailManifest {
  manifestId: string;
  backtestRunId: string;
  objectId: string;
  recordType: string;
  weekStartDate: string;
  periodStart: string;
  periodEnd: string;
  partNumber: number;
  rowCount: number;
  schemaVersion: string;
  sourceSetHash: string;
  supersedesManifestId: string | null;
  detailHash: string;
  createdAt: string;
}

/** `ResultRecordKind`. A trade detail row is one of exactly these four. */
export type BacktestTradeKind = 'ORDER' | 'FILL' | 'CANCELLATION' | 'REJECTION';

/** `execution_model.OrderStatus`. */
export type BacktestOrderStatus =
  | 'ACCEPTED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REJECTED';

/** One holding as of a trade record, from `result_snapshot.PositionAfter`. */
export interface BacktestPositionAfter {
  instrumentId: string;
  quantity: string;
  costBasis: string;
}

/**
 * One row of `_trade_payload` — a single order, fill, cancellation or rejection.
 *
 * Every amount stays a `numeric(24,8)` string. JSON has one number type and it is
 * binary floating point, so parsing `"100.05000000"` into a `number` here would be
 * this client taking a rounding decision on the engine's behalf.
 *
 * The nullable fields are the nine FILL-only columns plus `reasonCode`: an ORDER or a
 * REJECTION carries no quantity, price or fee, and `null` is the true answer for them
 * rather than a zero that would total up wrong.
 */
export interface BacktestTrade {
  recordId: string;
  /** UTC instant. An ET month is not a UTC month; render it in `America/New_York`. */
  occurredAt: string;
  kind: BacktestTradeKind;
  orderId: string;
  instrumentId: string;
  orderStatus: BacktestOrderStatus;
  cashAfter: string;
  positionsAfter: BacktestPositionAfter[];
  reasonCode: string | null;
  fillId: string | null;
  quantity: string | null;
  basePrice: string | null;
  price: string | null;
  grossAmount: string | null;
  slippageAmount: string | null;
  fee: string | null;
  costBasis: string | null;
  realizedPnl: string | null;
}

/** The `monthly-trades` envelope. `etMonth` echoes the month the server answered. */
export interface BacktestMonthlyTrades {
  backtestRunId: string;
  etMonth: string;
  items: BacktestTrade[];
}

export interface BacktestRunInputs {
  backtestRunId: string;
  botId: string;
  status: BacktestRunStatus;
  strategySnapshotHash: string;
  compiledPlanChecksum: string;
  datasetManifestId: string;
  datasetHash: string;
  inputBundleFingerprint: string;
  inputContractVersion: string;
  datasets: Array<{ datasetManifestId: string; purposeCode: string; lockedDatasetHash: string }>;
  featureMaterializations: Array<Record<string, unknown>>;
  executionPolicyVersion: string;
  precisionRulesVersion: string;
  calculationModelVersion: string | null;
  costModelVersion: string | null;
  executionModelVersion: string | null;
  reasonCode: string | null;
  missingRequirements: string[];
}

export interface BacktestRequestOptions {
  bots: Array<{ botId: string; name: string }>;
  benchmarkInstruments: Array<{ instrumentId: string; symbol: string }>;
  executionPolicies: Array<{ version: string }>;
  datasets: Array<{
    id: string;
    feedCode: string;
    resolution: string;
    periodStart: string;
    periodEnd: string;
  }>;
}

export interface CustomBacktestInput {
  periodStart: string;
  periodEnd: string;
  idempotencyKey: string;
}

export interface CustomBacktestReceipt {
  messageId: string;
  eventType: string;
  created: boolean;
  runId: string;
}

export interface ListRunsOptions {
  limit?: number;
  offset?: number;
}

export type BacktestBenchmarkInstrument = BacktestRequestOptions['benchmarkInstruments'][number];

export interface BacktestClient {
  listRuns(options?: ListRunsOptions, signal?: AbortSignal): Promise<BacktestRunPage>;
  getRun(runId: string, signal?: AbortSignal): Promise<BacktestRun>;
  listAttempts(runId: string, signal?: AbortSignal): Promise<BacktestAttempt[]>;
  getPerformance(runId: string, signal?: AbortSignal): Promise<BacktestPerformanceSummary>;
  getPerformanceSeries(runId: string, signal?: AbortSignal): Promise<BacktestPerformanceSeries>;
  listMonthlySummaries(runId: string, signal?: AbortSignal): Promise<BacktestMonthlySummary[]>;
  listDetailManifests(runId: string, signal?: AbortSignal): Promise<BacktestDetailManifest[]>;
  getInputs(runId: string, signal?: AbortSignal): Promise<BacktestRunInputs>;
  getBenchmarkInstruments(signal?: AbortSignal): Promise<BacktestBenchmarkInstrument[]>;
  getRequestOptions(signal?: AbortSignal): Promise<BacktestRequestOptions>;
  requestBacktest(botId: string, input: CustomBacktestInput, signal?: AbortSignal): Promise<CustomBacktestReceipt>;
  cancelBacktest(runId: string, signal?: AbortSignal): Promise<BacktestRun>;
  listMonthlyTrades(
    runId: string,
    etMonth: string,
    signal?: AbortSignal,
  ): Promise<BacktestMonthlyTrades>;
}

/**
 * The reason code every evidence route carries with its 409. One token for the UI to
 * branch on; mirrors `api.RESULT_NOT_READY_REASON`.
 */
export const RESULT_NOT_READY_REASON = 'BACKTEST_RESULT_NOT_READY';

/**
 * A response the server refused. The status is kept so the screen can tell the four
 * apart instead of collapsing them into "something went wrong":
 *
 * * **401** — no usable credential. Signing in again is the fix.
 * * **403** — a valid credential on somebody else's run. Signing in again is not.
 * * **404** — no such run, or it is not yours (the evidence routes answer this for a
 *   foreign run on purpose).
 * * **409 + `BACKTEST_RESULT_NOT_READY`** — the run is yours and the evidence has not
 *   been published yet. Come back, do not give up.
 */
export class BacktestApiError extends Error {
  constructor(
    readonly status: number,
    operation: string,
    /** `detail.reasonCode` when the server published one. */
    readonly reasonCode: string | null = null,
  ) {
    super(`${operation} failed (${status})`);
    this.name = 'BacktestApiError';
  }

  /** The request carried no credential the server would accept. */
  get unauthenticated(): boolean {
    return this.status === 401;
  }

  /** The credential is good; the run belongs to another account. */
  get forbidden(): boolean {
    return this.status === 403;
  }

  get unauthorized(): boolean {
    return this.unauthenticated || this.forbidden;
  }

  get notFound(): boolean {
    return this.status === 404;
  }

  get resultNotReady(): boolean {
    return this.status === 409 && this.reasonCode === RESULT_NOT_READY_REASON;
  }
}

/** A 200 whose body is not the documented shape. Never rendered as partial data. */
export class BacktestContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BacktestContractError';
  }
}

interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null;
}

const RUN_STATUSES = new Set<BacktestRunStatus>([
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'UNAVAILABLE',
]);

const ATTEMPT_STATUSES = new Set<BacktestAttemptStatus>([
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'SKIPPED',
]);

const TRADE_KINDS = new Set<BacktestTradeKind>(['ORDER', 'FILL', 'CANCELLATION', 'REJECTION']);

const ORDER_STATUSES = new Set<BacktestOrderStatus>([
  'ACCEPTED',
  'PARTIALLY_FILLED',
  'FILLED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
]);

/**
 * Pull a stable reason code off a refused response, if it published one.
 *
 * FastAPI nests an `HTTPException` detail under `detail`; Spring ProblemDetail emits
 * extension properties at the root. A plain-string detail, an HTML error page from a
 * proxy, or an empty body all come back `null` rather than causing a second error.
 */
async function reasonCodeOf(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return null;
    const rootCode = (body as { reasonCode?: unknown }).reasonCode;
    if (typeof rootCode === 'string' && rootCode.length > 0) return rootCode;
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail !== 'object' || detail === null) return null;
    const code = (detail as { reasonCode?: unknown }).reasonCode;
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

export function createBacktestClient({
  baseUrl = '',
  fetchImpl = fetch,
  getAccessToken,
}: ClientOptions = {}): BacktestClient {
  const root = baseUrl.replace(/\/$/, '');

  const request = async (
    path: string,
    operation: string,
    signal?: AbortSignal,
    init: RequestInit = {},
  ): Promise<unknown> => {
    const token = getAccessToken?.();
    const response = await fetchImpl(`${root}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      signal,
    });
    if (!response.ok) {
      throw new BacktestApiError(response.status, operation, await reasonCodeOf(response));
    }
    return response.json();
  };

  const runPath = (runId: string) => `/api/v1/backtests/${encodeURIComponent(runId)}`;

  const readBenchmarkInstruments = (payload: unknown): BacktestBenchmarkInstrument[] => {
    const catalog = object(payload, 'strategy catalog');
    if (!Array.isArray(catalog.instruments)) throw new BacktestContractError('Invalid benchmark instruments');
    return catalog.instruments.flatMap((value) => {
      const instrument = object(value, 'benchmark instrument');
      const symbolValue = string(instrument.symbol, 'symbol').toUpperCase();
      return ['SPY', 'QQQ', 'IWM'].includes(symbolValue)
        ? [{ instrumentId: string(instrument.id, 'instrument id'), symbol: symbolValue }]
        : [];
    });
  };

  return {
    async listRuns({ limit = 50, offset = 0 } = {}, signal) {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      const page = object(
        await request(`/api/v1/backtests?${query.toString()}`, 'Backtest run list request', signal),
        'backtest run page',
      );
      return {
        items: items(page, 'backtest run page').map(readRun),
        limit: nonNegativeInteger(page.limit, 'limit'),
        offset: nonNegativeInteger(page.offset, 'offset'),
      };
    },

    async getRun(runId, signal) {
      return readRun(await request(runPath(runId), 'Backtest run request', signal));
    },

    async listAttempts(runId, signal) {
      const payload = await request(`${runPath(runId)}/attempts`, 'Backtest attempt request', signal);
      return items(object(payload, 'backtest attempt list'), 'backtest attempt list').map(readAttempt);
    },

    async getPerformance(runId, signal) {
      const payload = await request(
        `${runPath(runId)}/performance`,
        'Backtest performance request',
        signal,
      );
      return readPerformance(payload);
    },

    async getPerformanceSeries(runId, signal) {
      const payload = await request(
        `${runPath(runId)}/performance-series`,
        'Backtest performance series request',
        signal,
      );
      return readPerformanceSeries(payload);
    },

    async listMonthlySummaries(runId, signal) {
      const payload = await request(
        `${runPath(runId)}/monthly-summaries`,
        'Backtest monthly summary request',
        signal,
      );
      return items(object(payload, 'monthly summary list'), 'monthly summary list')
        .map(readMonthlySummary);
    },

    async listDetailManifests(runId, signal) {
      const payload = await request(
        `${runPath(runId)}/detail-manifests`,
        'Backtest detail manifest request',
        signal,
      );
      return items(object(payload, 'detail manifest list'), 'detail manifest list')
        .map(readDetailManifest);
    },

    async getInputs(runId, signal) {
      return readRunInputs(await request(
        `${runPath(runId)}/inputs`, 'Backtest input manifest request', signal,
      ));
    },

    async getBenchmarkInstruments(signal) {
      return readBenchmarkInstruments(await request(
        '/api/v1/strategy-catalogs/basic', 'Benchmark instrument request', signal,
      ));
    },

    async getRequestOptions(signal) {
      const [botsPayload, inputsPayload, catalogPayload] = await Promise.all([
        request('/api/v1/bots/operations', 'Backtest bot option request', signal),
        request('/api/v1/strategy-release-inputs', 'Backtest input option request', signal),
        request('/api/v1/strategy-catalogs/basic', 'Benchmark instrument request', signal),
      ]);
      if (!Array.isArray(botsPayload)) throw new BacktestContractError('Invalid backtest bot options');
      const inputs = object(inputsPayload, 'backtest input options');
      if (!Array.isArray(inputs.executionPolicies) || !Array.isArray(inputs.datasets)) {
        throw new BacktestContractError('Invalid backtest input option collections');
      }
      return {
        bots: botsPayload.map((value) => {
          const bot = object(value, 'backtest bot option');
          return { botId: string(bot.botId, 'botId'), name: string(bot.name, 'name') };
        }),
        benchmarkInstruments: readBenchmarkInstruments(catalogPayload),
        executionPolicies: inputs.executionPolicies.map((value) => {
          const policy = object(value, 'backtest execution policy option');
          return { version: string(policy.version, 'version') };
        }),
        datasets: inputs.datasets.map((value) => {
          const dataset = object(value, 'backtest dataset option');
          return {
            id: string(dataset.id, 'dataset id'),
            feedCode: string(dataset.feedCode, 'feedCode'),
            resolution: string(dataset.resolution, 'resolution'),
            periodStart: string(dataset.periodStart, 'periodStart'),
            periodEnd: string(dataset.periodEnd, 'periodEnd'),
          };
        }).filter((dataset) => ['30m', '1h', '4h', '1d'].includes(dataset.resolution)),
      };
    },

    async requestBacktest(botId, input, signal) {
      return readCustomReceipt(await request(
        `/api/v1/bots/${encodeURIComponent(botId)}/backtests`,
        'Custom backtest request',
        signal,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': input.idempotencyKey },
          body: JSON.stringify({
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
          }),
        },
      ));
    },

    async cancelBacktest(runId, signal) {
      const payload = object(await request(
        `${runPath(runId)}/cancellation`,
        'Backtest cancellation request',
        signal,
        { method: 'POST', body: JSON.stringify({ reasonCode: 'USER_CANCELLED' }) },
      ), 'backtest cancellation receipt');
      return readRun(payload.run);
    },

    async listMonthlyTrades(runId, etMonth, signal) {
      const query = new URLSearchParams({ et_month: etMonth });
      const payload = object(
        await request(
          `${runPath(runId)}/monthly-trades?${query.toString()}`,
          'Backtest monthly trade request',
          signal,
        ),
        'monthly trade list',
      );
      const answered = month(payload.etMonth);
      // The month is a required query parameter and the server echoes the one it
      // parsed. A different month back is a different question answered, and putting
      // those rows under the tab that was pressed would be a quiet lie about when a
      // trade happened.
      if (answered !== etMonth) {
        throw new BacktestContractError(
          `monthly-trades answered etMonth ${answered} for the requested ${etMonth}`,
        );
      }
      return {
        backtestRunId: string(payload.backtestRunId, 'backtestRunId'),
        etMonth: answered,
        items: items(payload, 'monthly trade list').map(readTrade),
      };
    },
  };
}

function readRun(value: unknown): BacktestRun {
  const item = object(value, 'backtest run');
  return {
    backtestRunId: string(item.backtestRunId, 'backtestRunId'),
    botId: string(item.botId, 'botId'),
    ownerAccountId: string(item.ownerAccountId, 'ownerAccountId'),
    status: runStatus(item.status),
    configurationHash: string(item.configurationHash, 'configurationHash'),
    evaluationStart: string(item.evaluationStart, 'evaluationStart'),
    evaluationEnd: string(item.evaluationEnd, 'evaluationEnd'),
    initialCashAmount: decimal(item.initialCashAmount, 'initialCashAmount'),
    marketRulesVersion: string(item.marketRulesVersion, 'marketRulesVersion'),
    accountingRulesVersion: string(item.accountingRulesVersion, 'accountingRulesVersion'),
    precisionRulesVersion: string(item.precisionRulesVersion, 'precisionRulesVersion'),
    feePolicyId: string(item.feePolicyId, 'feePolicyId'),
    slippageRateBps: nonNegativeInteger(item.slippageRateBps, 'slippageRateBps'),
    buyingPowerBufferPolicyId: string(item.buyingPowerBufferPolicyId, 'buyingPowerBufferPolicyId'),
    idempotencyKey: string(item.idempotencyKey, 'idempotencyKey'),
    queuedAt: string(item.queuedAt, 'queuedAt'),
    startedAt: nullableString(item.startedAt, 'startedAt'),
    completedAt: nullableString(item.completedAt, 'completedAt'),
    failureCode: nullableString(item.failureCode, 'failureCode'),
    resultHash: nullableString(item.resultHash, 'resultHash'),
    cancellationRequestedAt: nullableString(item.cancellationRequestedAt, 'cancellationRequestedAt'),
    cancellationReasonCode: nullableString(item.cancellationReasonCode, 'cancellationReasonCode'),
    cancelledAt: nullableString(item.cancelledAt, 'cancelledAt'),
    attemptCount: nonNegativeInteger(item.attemptCount, 'attemptCount'),
  };
}

function readAttempt(value: unknown): BacktestAttempt {
  const item = object(value, 'backtest attempt');
  const status = string(item.status, 'attempt status');
  if (!ATTEMPT_STATUSES.has(status as BacktestAttemptStatus)) {
    throw new BacktestContractError(`Unsupported backtest attempt status: ${status}`);
  }
  return {
    attemptId: string(item.attemptId, 'attemptId'),
    backtestRunId: string(item.backtestRunId, 'backtestRunId'),
    attemptNumber: positiveInteger(item.attemptNumber, 'attemptNumber'),
    workerExecutionKey: string(item.workerExecutionKey, 'workerExecutionKey'),
    status: status as BacktestAttemptStatus,
    startedAt: string(item.startedAt, 'startedAt'),
    completedAt: nullableString(item.completedAt, 'completedAt'),
    failureCode: nullableString(item.failureCode, 'failureCode'),
  };
}

function readPerformance(value: unknown): BacktestPerformanceSummary {
  const item = object(value, 'backtest performance summary');
  const document = object(item.metricsDocument, 'metricsDocument');
  return {
    backtestRunId: string(item.backtestRunId, 'backtestRunId'),
    metricCatalogVersion: string(item.metricCatalogVersion, 'metricCatalogVersion'),
    calculationRulesVersion: string(item.calculationRulesVersion, 'calculationRulesVersion'),
    metrics: {
      totalReturnPct: nullableNumber(document.totalReturnPct, 'totalReturnPct'),
      maxDrawdownPct: nullableNumber(document.maxDrawdownPct, 'maxDrawdownPct'),
      sharpe: nullableNumber(document.sharpe, 'sharpe'),
      annualizedVolatilityPct: nullableNumber(document.annualizedVolatilityPct, 'annualizedVolatilityPct'),
      winRatePct: nullableNumber(document.winRatePct, 'winRatePct'),
      startingEquity: nullableDecimal(document.startingEquity, 'startingEquity'),
      endingEquity: nullableDecimal(document.endingEquity, 'endingEquity'),
      endingCash: nullableDecimal(document.endingCash, 'endingCash'),
      realizedPnl: nullableDecimal(document.realizedPnl, 'realizedPnl'),
      totalFees: nullableDecimal(document.totalFees, 'totalFees'),
      totalSlippage: nullableDecimal(document.totalSlippage, 'totalSlippage'),
      fillCount: nullableCount(document.fillCount, 'fillCount'),
      closingTradeCount: nullableCount(document.closingTradeCount, 'closingTradeCount'),
      winningTradeCount: nullableCount(document.winningTradeCount, 'winningTradeCount'),
      losingTradeCount: nullableCount(document.losingTradeCount, 'losingTradeCount'),
      valuationPointCount: nullableCount(document.valuationPointCount, 'valuationPointCount'),
      valuationBasis: string(document.valuationBasis, 'valuationBasis'),
      valuationBasisRuleId: string(document.valuationBasisRuleId, 'valuationBasisRuleId'),
      valuationPeriodicity: string(document.valuationPeriodicity, 'valuationPeriodicity'),
      metricRules: ruleIndex(document.metricRules),
    },
    sourceSetHash: string(item.sourceSetHash, 'sourceSetHash'),
    inputHash: string(item.inputHash, 'inputHash'),
    resultHash: string(item.resultHash, 'resultHash'),
    calculatedAt: string(item.calculatedAt, 'calculatedAt'),
  };
}

function readPerformanceSeries(value: unknown): BacktestPerformanceSeries {
  const item = object(value, 'performance series');
  if (!Array.isArray(item.points) || item.points.length === 0) {
    throw new BacktestContractError('Invalid performance series points');
  }
  const points = item.points.map((value) => {
    const point = object(value, 'performance series point');
    const equity = decimal(point.equity, 'equity');
    if (Number(equity) < 0) throw new BacktestContractError('Invalid negative performance equity');
    return { occurredAt: string(point.occurredAt, 'occurredAt'), equity };
  });
  const instants = points.map((point) => point.occurredAt);
  if (new Set(instants).size !== instants.length || instants.some((value, index) => index > 0 && value <= instants[index - 1])) {
    throw new BacktestContractError('Performance series points must be unique and ordered');
  }
  return {
    backtestRunId: string(item.backtestRunId, 'backtestRunId'),
    points,
    resultHash: string(item.resultHash, 'resultHash'),
    sourceSetHash: string(item.sourceSetHash, 'sourceSetHash'),
  };
}

function readMonthlySummary(value: unknown): BacktestMonthlySummary {
  const item = object(value, 'monthly judgment summary');
  const etYearMonth = month(item.etYearMonth);
  const document = object(item.summaryDocument, 'summaryDocument');
  // The column and the jsonb copy are written in the same transaction. If they ever
  // disagree, one of them is stale and neither can be trusted to label a tab.
  if (month(document.et_year_month) !== etYearMonth) {
    throw new BacktestContractError(
      `summaryDocument.et_year_month ${String(document.et_year_month)} does not match etYearMonth ${etYearMonth}`,
    );
  }
  if (!Array.isArray(document.failure_counts)) {
    throw new BacktestContractError('Invalid summaryDocument.failure_counts');
  }
  return {
    monthlySummaryId: string(item.monthlySummaryId, 'monthlySummaryId'),
    backtestRunId: string(item.backtestRunId, 'backtestRunId'),
    etYearMonth,
    evaluationCount: nonNegativeInteger(item.evaluationCount, 'evaluationCount'),
    activeBranchCount: nonNegativeInteger(item.activeBranchCount, 'activeBranchCount'),
    tradeEventCount: nonNegativeInteger(item.tradeEventCount, 'tradeEventCount'),
    dataGapCount: nonNegativeInteger(item.dataGapCount, 'dataGapCount'),
    triggeredCount: nonNegativeInteger(item.triggeredCount, 'triggeredCount'),
    rejectedCount: nonNegativeInteger(item.rejectedCount, 'rejectedCount'),
    timezoneId: string(document.timezone_id, 'summaryDocument.timezone_id'),
    firstFailureCounts: document.failure_counts.map((entry) => {
      const count = object(entry, 'failure condition count');
      return {
        mode: string(count.mode, 'failure count mode'),
        flowOrBranchKey: string(count.flow_or_branch_key, 'flow_or_branch_key'),
        firstFailureConditionKey: string(
          count.first_failure_condition_key,
          'first_failure_condition_key',
        ),
        occurrenceCount: positiveInteger(count.occurrence_count, 'occurrence_count'),
      };
    }),
    tradeRecordIds: stringArray(document.trade_record_ids, 'summaryDocument.trade_record_ids'),
    summaryHash: string(item.summaryHash, 'summaryHash'),
  };
}

function readDetailManifest(value: unknown): BacktestDetailManifest {
  const item = object(value, 'detail manifest');
  return {
    manifestId: string(item.manifestId, 'manifestId'),
    backtestRunId: string(item.backtestRunId, 'backtestRunId'),
    objectId: string(item.objectId, 'objectId'),
    recordType: string(item.recordType, 'recordType'),
    weekStartDate: string(item.weekStartDate, 'weekStartDate'),
    periodStart: string(item.periodStart, 'periodStart'),
    periodEnd: string(item.periodEnd, 'periodEnd'),
    partNumber: positiveInteger(item.partNumber, 'partNumber'),
    rowCount: nonNegativeInteger(item.rowCount, 'rowCount'),
    schemaVersion: string(item.schemaVersion, 'schemaVersion'),
    sourceSetHash: string(item.sourceSetHash, 'sourceSetHash'),
    supersedesManifestId: nullableString(item.supersedesManifestId, 'supersedesManifestId'),
    detailHash: string(item.detailHash, 'detailHash'),
    createdAt: string(item.createdAt, 'createdAt'),
  };
}

function readTrade(value: unknown): BacktestTrade {
  const item = object(value, 'trade detail record');
  const kind = string(item.kind, 'kind');
  if (!TRADE_KINDS.has(kind as BacktestTradeKind)) {
    throw new BacktestContractError(`Unsupported trade record kind: ${kind}`);
  }
  const orderStatus = string(item.orderStatus, 'orderStatus');
  if (!ORDER_STATUSES.has(orderStatus as BacktestOrderStatus)) {
    throw new BacktestContractError(`Unsupported order status: ${orderStatus}`);
  }
  if (!Array.isArray(item.positionsAfter)) {
    throw new BacktestContractError('Invalid positionsAfter');
  }
  return {
    recordId: string(item.recordId, 'recordId'),
    occurredAt: string(item.occurredAt, 'occurredAt'),
    kind: kind as BacktestTradeKind,
    orderId: string(item.orderId, 'orderId'),
    instrumentId: string(item.instrumentId, 'instrumentId'),
    orderStatus: orderStatus as BacktestOrderStatus,
    // Cash after the record is the one amount every kind carries; a rejected order
    // still states the balance it left behind.
    cashAfter: decimal(item.cashAfter, 'cashAfter'),
    positionsAfter: item.positionsAfter.map(readPositionAfter),
    reasonCode: nullableString(item.reasonCode, 'reasonCode'),
    fillId: nullableString(item.fillId, 'fillId'),
    quantity: nullableDecimal(item.quantity, 'quantity'),
    basePrice: nullableDecimal(item.basePrice, 'basePrice'),
    price: nullableDecimal(item.price, 'price'),
    grossAmount: nullableDecimal(item.grossAmount, 'grossAmount'),
    slippageAmount: nullableDecimal(item.slippageAmount, 'slippageAmount'),
    fee: nullableDecimal(item.fee, 'fee'),
    costBasis: nullableDecimal(item.costBasis, 'costBasis'),
    realizedPnl: nullableDecimal(item.realizedPnl, 'realizedPnl'),
  };
}

function readPositionAfter(value: unknown): BacktestPositionAfter {
  const item = object(value, 'position after');
  return {
    instrumentId: string(item.instrumentId, 'positionsAfter.instrumentId'),
    quantity: decimal(item.quantity, 'positionsAfter.quantity'),
    costBasis: decimal(item.costBasis, 'positionsAfter.costBasis'),
  };
}

function readRunInputs(value: unknown): BacktestRunInputs {
  const input = object(value, 'backtest run inputs');
  if (!Array.isArray(input.datasets) || !Array.isArray(input.featureMaterializations)) {
    throw new BacktestContractError('Invalid backtest run input collections');
  }
  return {
    backtestRunId: string(input.backtestRunId, 'backtestRunId'),
    botId: string(input.botId, 'botId'),
    status: runStatus(input.status),
    strategySnapshotHash: string(input.strategySnapshotHash, 'strategySnapshotHash'),
    compiledPlanChecksum: string(input.compiledPlanChecksum, 'compiledPlanChecksum'),
    datasetManifestId: string(input.datasetManifestId, 'datasetManifestId'),
    datasetHash: string(input.datasetHash, 'datasetHash'),
    inputBundleFingerprint: string(input.inputBundleFingerprint, 'inputBundleFingerprint'),
    inputContractVersion: string(input.inputContractVersion, 'inputContractVersion'),
    datasets: input.datasets.map((value) => {
      const dataset = object(value, 'backtest run dataset input');
      return {
        datasetManifestId: string(dataset.datasetManifestId, 'datasetManifestId'),
        purposeCode: string(dataset.purposeCode, 'purposeCode'),
        lockedDatasetHash: string(dataset.lockedDatasetHash, 'lockedDatasetHash'),
      };
    }),
    featureMaterializations: input.featureMaterializations.map((value) => object(value, 'featureMaterialization')),
    executionPolicyVersion: string(input.executionPolicyVersion, 'executionPolicyVersion'),
    precisionRulesVersion: string(input.precisionRulesVersion, 'precisionRulesVersion'),
    calculationModelVersion: nullableString(input.calculationModelVersion, 'calculationModelVersion'),
    costModelVersion: nullableString(input.costModelVersion, 'costModelVersion'),
    executionModelVersion: nullableString(input.executionModelVersion, 'executionModelVersion'),
    reasonCode: nullableString(input.reasonCode, 'reasonCode'),
    missingRequirements: stringArray(input.missingRequirements, 'missingRequirements'),
  };
}

function readCustomReceipt(value: unknown): CustomBacktestReceipt {
  const receipt = object(value, 'custom backtest receipt');
  return {
    messageId: string(receipt.messageId, 'messageId'),
    eventType: string(receipt.eventType, 'eventType'),
    created: boolean(receipt.created, 'created'),
    runId: string(receipt.runId, 'runId'),
  };
}

function items(payload: Record<string, unknown>, label: string): unknown[] {
  if (!Array.isArray(payload.items)) throw new BacktestContractError(`Invalid ${label}`);
  return payload.items;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BacktestContractError(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BacktestContractError(`Invalid ${label}`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  return value === null ? null : string(value, label);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new BacktestContractError(`Invalid ${label}`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new BacktestContractError(`Invalid ${label}`);
  return value.map((item) => string(item, label));
}

function ruleIndex(value: unknown): Record<string, string> {
  const rules = object(value, 'metricRules');
  return Object.fromEntries(
    Object.entries(rules).map(([key, rule]) => [key, string(rule, `metricRules.${key}`)]),
  );
}

function runStatus(value: unknown): BacktestRunStatus {
  const parsed = string(value, 'status');
  if (!RUN_STATUSES.has(parsed as BacktestRunStatus)) {
    throw new BacktestContractError(`Unsupported backtest run status: ${parsed}`);
  }
  return parsed as BacktestRunStatus;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new BacktestContractError(`Invalid ${label}`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = nonNegativeInteger(value, label);
  if (parsed === 0) throw new BacktestContractError(`Invalid ${label}`);
  return parsed;
}

function nullableCount(value: unknown, label: string): number | null {
  return value === null ? null : nonNegativeInteger(value, label);
}

function nullableNumber(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BacktestContractError(`Invalid ${label}`);
  }
  return value;
}

function decimal(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!/^-?\d+(?:\.\d+)?$/.test(parsed)) throw new BacktestContractError(`Invalid ${label}`);
  return parsed;
}

function nullableDecimal(value: unknown, label: string): string | null {
  return value === null ? null : decimal(value, label);
}

function month(value: unknown): string {
  const parsed = string(value, 'etYearMonth');
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(parsed)) {
    throw new BacktestContractError('Invalid etYearMonth');
  }
  return parsed;
}

/*
  The shipped client. Its credential comes from the session this tab holds and from
  nowhere else: no token is compiled into the bundle, and when nobody is signed in
  `accessToken()` is `null`, the `Authorization` header is omitted, and the server
  answers 401 — which the screen shows as "sign in", not as a broken backtest.
*/
export const defaultBacktestClient = createBacktestClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  getAccessToken: () => browserSessionStore.accessToken(),
});
