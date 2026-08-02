/*
  Client for the backtest-engine `/api/v1` surface.

  Field names, paths and status tokens below are the ones `backtest_engine/api.py`
  actually serves. Three of the differences against the pre-rebuild client are worth
  naming, because each of them used to be a request the server answered with a 404 or
  a body this file could not parse:

  * the payloads are camelCase, and a run is identified by `backtestRunId` + `botId`;
    there is no `strategy_version_id`,
  * the terminal success token is `COMPLETED` (`backtest.run_status`), never `COMPLETE`,
  * the per-ET-month endpoint is `monthly-summaries`, and the only per-month detail the
    server publishes is `detail-manifests` — object manifests on an ET Monday week
    boundary. There is no endpoint that returns individual trade records.
*/

export type BacktestRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'UNAVAILABLE';

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

export interface ListRunsOptions {
  limit?: number;
  offset?: number;
}

export interface BacktestClient {
  listRuns(options?: ListRunsOptions, signal?: AbortSignal): Promise<BacktestRunPage>;
  getRun(runId: string, signal?: AbortSignal): Promise<BacktestRun>;
  listAttempts(runId: string, signal?: AbortSignal): Promise<BacktestAttempt[]>;
  getPerformance(runId: string, signal?: AbortSignal): Promise<BacktestPerformanceSummary>;
  listMonthlySummaries(runId: string, signal?: AbortSignal): Promise<BacktestMonthlySummary[]>;
  listDetailManifests(runId: string, signal?: AbortSignal): Promise<BacktestDetailManifest[]>;
}

/**
 * A response the server refused. The status is kept so the screen can tell a
 * credential problem (401/403) from a run that has no summary yet (404) from
 * everything else, instead of collapsing all three into "something went wrong".
 */
export class BacktestApiError extends Error {
  constructor(readonly status: number, operation: string) {
    super(`${operation} failed (${status})`);
    this.name = 'BacktestApiError';
  }

  get unauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get notFound(): boolean {
    return this.status === 404;
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

export function createBacktestClient({
  baseUrl = '',
  fetchImpl = fetch,
  getAccessToken,
}: ClientOptions = {}): BacktestClient {
  const root = baseUrl.replace(/\/$/, '');

  const request = async (path: string, operation: string, signal?: AbortSignal): Promise<unknown> => {
    const token = getAccessToken?.();
    const response = await fetchImpl(`${root}${path}`, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
    });
    if (!response.ok) throw new BacktestApiError(response.status, operation);
    return response.json();
  };

  const runPath = (runId: string) => `/api/v1/backtests/${encodeURIComponent(runId)}`;

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

export const defaultBacktestClient = createBacktestClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
});
