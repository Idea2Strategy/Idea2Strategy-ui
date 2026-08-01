export type BacktestStatus = 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'UNAVAILABLE';

export interface BacktestRunSummary {
  runId: string;
  strategyVersionId: string;
  status: BacktestStatus;
  requestedAt: string;
}

export interface BacktestOverview extends BacktestRunSummary {
  startedAt: string | null;
  finishedAt: string | null;
  reasonCode: string | null;
  missingRequirements: string[];
  resultManifestId: string | null;
}

export interface BacktestPerformance {
  runSnapshotId: string;
  orderCount: number;
  fillCount: number;
  cancellationCount: number;
  rejectionCount: number;
  totalFees: string;
  totalSlippage: string;
  realizedPnl: string;
  initialCash: string;
  endingCash: string;
  endingPositions: unknown[];
}

export interface BacktestFailureCount {
  mode: string;
  scopeId: string;
  conditionId: string;
  count: number;
}

export interface BacktestMonthlyJudgment {
  summaryId: string;
  etMonth: string;
  timezoneId: string;
  failureCounts: BacktestFailureCount[];
  tradeRecordIds: string[];
}

export interface BacktestTrade {
  recordId: string;
  occurredAt: string;
  kind: string;
  orderId: string;
  instrumentId: string;
  orderStatus: string;
  cashAfter: string;
  reasonCode: string | null;
  fillId: string | null;
  quantity: string | null;
  price: string | null;
  fee: string | null;
  realizedPnl: string | null;
}

export interface BacktestClient {
  listRuns(signal?: AbortSignal): Promise<BacktestRunSummary[]>;
  getOverview(runId: string, signal?: AbortSignal): Promise<BacktestOverview>;
  getPerformance(runId: string, signal?: AbortSignal): Promise<BacktestPerformance>;
  listMonthlyJudgments(runId: string, signal?: AbortSignal): Promise<BacktestMonthlyJudgment[]>;
  listMonthlyTrades(runId: string, etMonth: string, signal?: AbortSignal): Promise<BacktestTrade[]>;
}

interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null;
}

const STATUSES = new Set<BacktestStatus>([
  'QUEUED',
  'RUNNING',
  'COMPLETE',
  'FAILED',
  'UNAVAILABLE',
]);

export function createBacktestClient({
  baseUrl = '',
  fetchImpl = fetch,
  getAccessToken,
}: ClientOptions = {}): BacktestClient {
  const root = baseUrl.replace(/\/$/, '');

  const request = async (path: string, signal?: AbortSignal): Promise<unknown> => {
    const token = getAccessToken?.();
    const response = await fetchImpl(`${root}${path}`, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
    });
    if (!response.ok) {
      throw new Error(`Backtest request failed (${response.status})`);
    }
    return response.json();
  };

  return {
    async listRuns(signal) {
      const payload = await request('/api/v1/backtests', signal);
      if (!Array.isArray(payload)) {
        throw new Error('Invalid backtest run list');
      }
      return payload.map(readRunSummary);
    },

    async getOverview(runId, signal) {
      return readOverview(await request(`/api/v1/backtests/${encodeURIComponent(runId)}`, signal));
    },

    async getPerformance(runId, signal) {
      return readPerformance(await request(
        `/api/v1/backtests/${encodeURIComponent(runId)}/performance`,
        signal,
      ));
    },

    async listMonthlyJudgments(runId, signal) {
      const payload = await request(
        `/api/v1/backtests/${encodeURIComponent(runId)}/monthly-judgments`,
        signal,
      );
      if (!Array.isArray(payload)) {
        throw new Error('Invalid monthly judgment list');
      }
      return payload.map(readMonthlyJudgment);
    },

    async listMonthlyTrades(runId, etMonth, signal) {
      const query = new URLSearchParams({ et_month: etMonth });
      const payload = await request(
        `/api/v1/backtests/${encodeURIComponent(runId)}/monthly-trades?${query.toString()}`,
        signal,
      );
      if (!Array.isArray(payload)) {
        throw new Error('Invalid monthly trade list');
      }
      return payload.map(readTrade);
    },
  };
}

function readRunSummary(value: unknown): BacktestRunSummary {
  const item = object(value, 'Invalid backtest run');
  return {
    runId: string(item.run_id, 'run_id'),
    strategyVersionId: string(item.strategy_version_id, 'strategy_version_id'),
    status: status(item.status),
    requestedAt: string(item.requested_at, 'requested_at'),
  };
}

function readOverview(value: unknown): BacktestOverview {
  const item = object(value, 'Invalid backtest overview');
  const summary = readRunSummary(item);
  return {
    ...summary,
    startedAt: nullableString(item.started_at, 'started_at'),
    finishedAt: nullableString(item.finished_at, 'finished_at'),
    reasonCode: nullableString(item.reason_code, 'reason_code'),
    missingRequirements: stringArray(item.missing_requirements, 'missing_requirements'),
    resultManifestId: nullableString(item.result_manifest_id, 'result_manifest_id'),
  };
}

function readPerformance(value: unknown): BacktestPerformance {
  const item = object(value, 'Invalid backtest performance');
  if (!Array.isArray(item.ending_positions)) {
    throw new Error('Invalid ending_positions');
  }
  return {
    runSnapshotId: string(item.run_snapshot_id, 'run_snapshot_id'),
    orderCount: nonNegativeInteger(item.order_count, 'order_count'),
    fillCount: nonNegativeInteger(item.fill_count, 'fill_count'),
    cancellationCount: nonNegativeInteger(item.cancellation_count, 'cancellation_count'),
    rejectionCount: nonNegativeInteger(item.rejection_count, 'rejection_count'),
    totalFees: decimal(item.total_fees, 'total_fees'),
    totalSlippage: decimal(item.total_slippage, 'total_slippage'),
    realizedPnl: decimal(item.realized_pnl, 'realized_pnl'),
    initialCash: decimal(item.initial_cash, 'initial_cash'),
    endingCash: decimal(item.ending_cash, 'ending_cash'),
    endingPositions: item.ending_positions,
  };
}

function readMonthlyJudgment(value: unknown): BacktestMonthlyJudgment {
  const item = object(value, 'Invalid monthly judgment');
  if (!Array.isArray(item.failure_counts)) {
    throw new Error('Invalid failure_counts');
  }
  return {
    summaryId: string(item.summary_id, 'summary_id'),
    etMonth: month(item.et_month),
    timezoneId: string(item.timezone_id, 'timezone_id'),
    failureCounts: item.failure_counts.map((value) => {
      const count = object(value, 'Invalid failure count');
      return {
        mode: string(count.mode, 'mode'),
        scopeId: string(count.scope_id, 'scope_id'),
        conditionId: string(count.condition_id, 'condition_id'),
        count: positiveInteger(count.count, 'count'),
      };
    }),
    tradeRecordIds: stringArray(item.trade_record_ids, 'trade_record_ids'),
  };
}

function readTrade(value: unknown): BacktestTrade {
  const item = object(value, 'Invalid monthly trade');
  return {
    recordId: string(item.record_id, 'record_id'),
    occurredAt: string(item.occurred_at, 'occurred_at'),
    kind: string(item.kind, 'kind'),
    orderId: string(item.order_id, 'order_id'),
    instrumentId: string(item.instrument_id, 'instrument_id'),
    orderStatus: string(item.order_status, 'order_status'),
    cashAfter: decimal(item.cash_after, 'cash_after'),
    reasonCode: nullableString(item.reason_code, 'reason_code'),
    fillId: nullableString(item.fill_id, 'fill_id'),
    quantity: nullableDecimal(item.quantity, 'quantity'),
    price: nullableDecimal(item.price, 'price'),
    fee: nullableDecimal(item.fee, 'fee'),
    realizedPnl: nullableDecimal(item.realized_pnl, 'realized_pnl'),
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(label);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  return value === null ? null : string(value, label);
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value.map((item) => string(item, label));
}

function status(value: unknown): BacktestStatus {
  const parsed = string(value, 'status');
  if (!STATUSES.has(parsed as BacktestStatus)) {
    throw new Error(`Unsupported backtest status: ${parsed}`);
  }
  return parsed as BacktestStatus;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = nonNegativeInteger(value, label);
  if (parsed === 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

function decimal(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!/^-?\d+(?:\.\d+)?$/.test(parsed)) {
    throw new Error(`Invalid ${label}`);
  }
  return parsed;
}

function nullableDecimal(value: unknown, label: string): string | null {
  return value === null ? null : decimal(value, label);
}

function month(value: unknown): string {
  const parsed = string(value, 'et_month');
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(parsed)) {
    throw new Error('Invalid et_month');
  }
  return parsed;
}

export const defaultBacktestClient = createBacktestClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
});
