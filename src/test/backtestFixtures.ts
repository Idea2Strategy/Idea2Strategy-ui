/*
  The backtest-engine `/api/v1` payloads, and nothing that knows how to serve them.

  Two fakes read this file — the msw request handlers the component and client tests
  run against (`./backtestApi`), and the HTTP server the Playwright suite drives a real
  browser at (`e2e/mockApi.ts`). They are the same bytes on purpose: an E2E that passes
  against a shape the unit tests never saw is an E2E that proves nothing about the
  screen the unit tests describe.

  Every payload was captured from the engine itself: `create_app` was booted against
  B's published `official-backtest-request.valid.json` and the serialisers
  (`_run_payload`, `_attempt_payload`, `_performance_payload`, `_monthly_payload`,
  `_manifest_payload`, `_trade_payload`) were rendered over real row dataclasses.
  Nothing is reshaped to suit the UI: if the server renames a field, drops a key, or
  changes a status token, these fixtures stop describing it and the tests reading them
  fail.
*/

export const BACKTEST_API_BASE = 'https://backtest.test';

export const OWNER_TOKEN = 'owner-token';
export const OTHER_OWNER_TOKEN = 'other-owner-token';

/** `uuid5` of B's published `metadata.idempotencyKey`; pinned by the engine suite. */
export const RUN_ID = 'f876f259-4158-5a9a-8973-db21764024dc';
export const OTHER_OWNER_RUN_ID = '22222222-2222-4222-8222-222222222222';
export const UNKNOWN_RUN_ID = '11111111-1111-4111-8111-111111111111';
export const BOT_ID = '00000000-0000-4000-8000-000000000201';
export const OWNER_ACCOUNT_ID = '66666666-6666-4666-8666-666666666666';
export const IDEMPOTENCY_KEY =
  'sha256:c6dd5229151352a530ff8312f050258107370cf26ea943c68473bf81936f6c1e';
/** `compute_input_bundle_fingerprint` over B's published request; captured, not invented. */
export const CONFIGURATION_HASH =
  'sha256:8d7ce5e768ab96de1f1d496b8f1eadfa35d63819f8c6a60b70725372740fc77e';
export const RESULT_HASH = `sha256:${'a'.repeat(64)}`;

export type Json = Record<string, unknown>;

/** `_run_payload`. `status` is a `backtest.run_status` token: COMPLETED, never COMPLETE. */
export function runPayload(overrides: Json = {}): Json {
  return {
    backtestRunId: RUN_ID,
    botId: BOT_ID,
    ownerAccountId: OWNER_ACCOUNT_ID,
    status: 'COMPLETED',
    configurationHash: CONFIGURATION_HASH,
    evaluationStart: '2026-07-01',
    evaluationEnd: '2026-10-01',
    initialCashAmount: '100000.00000000',
    marketRulesVersion: 'market:1.0.0',
    accountingRulesVersion: 'accounting:1.0.0',
    precisionRulesVersion: 'precision:1.0.0',
    feePolicyId: '00000000-0000-4000-8000-000000000001',
    slippageRateBps: 5,
    buyingPowerBufferPolicyId: '00000000-0000-4000-8000-000000000001',
    idempotencyKey: IDEMPOTENCY_KEY,
    queuedAt: '2026-07-31T12:00:00Z',
    startedAt: '2026-07-31T12:05:00Z',
    completedAt: '2026-07-31T12:30:00Z',
    failureCode: null,
    resultHash: RESULT_HASH,
    cancellationRequestedAt: null,
    cancellationReasonCode: null,
    cancelledAt: null,
    attemptCount: 1,
    ...overrides,
  };
}

export const QUEUED_RUN = runPayload({
  status: 'QUEUED',
  startedAt: null,
  completedAt: null,
  resultHash: null,
  attemptCount: 0,
});

export const RUNNING_RUN = runPayload({
  status: 'RUNNING',
  completedAt: null,
  resultHash: null,
});

/**
 * The engine writes the result event's `reasonCode` into `runs.failure_code`
 * (`lifecycle.BacktestLifecycleService._apply`), so this is where the real
 * UNAVAILABLE reason arrives. `missingRequirements` is not part of the run payload.
 */
export const UNAVAILABLE_RUN = runPayload({
  status: 'UNAVAILABLE',
  completedAt: '2026-07-31T12:07:00Z',
  resultHash: null,
  failureCode: 'MARKET_DATA_GAP',
});

export const FAILED_RUN = runPayload({
  status: 'FAILED',
  completedAt: '2026-07-31T12:09:00Z',
  resultHash: null,
  failureCode: 'ENGINE_EXECUTION_FAILED',
});

/** `_attempt_payload`. `status` is an `operations.work_status` token. */
export const ATTEMPTS: Json[] = [
  {
    attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    backtestRunId: RUN_ID,
    attemptNumber: 1,
    workerExecutionKey: 'worker-execution-1',
    status: 'SUCCEEDED',
    startedAt: '2026-07-31T12:05:00Z',
    completedAt: '2026-07-31T12:30:00Z',
    failureCode: null,
  },
];

/**
 * `_performance_payload`. `metricsDocument` is `performance.metrics.metrics_document`:
 * percentages and ratios are JSON numbers, money stays `numeric(24,8)` text, counts
 * are integers, and an undefined metric is `null`.
 */
export const PERFORMANCE: Json = {
  backtestRunId: RUN_ID,
  metricCatalogVersion: 'metrics:1.0.0',
  metricsDocument: {
    totalReturnPct: 2.9996,
    maxDrawdownPct: -1.0,
    sharpe: 9.16515139,
    annualizedVolatilityPct: 3.27225985,
    winRatePct: 37.5,
    startingEquity: '10000.00000000',
    endingEquity: '10299.96000000',
    endingCash: '10123.45000000',
    realizedPnl: '123.45000000',
    totalFees: '2.00100000',
    totalSlippage: '0.50000000',
    fillCount: 12,
    closingTradeCount: 8,
    winningTradeCount: 3,
    losingTradeCount: 5,
    valuationPointCount: 6,
    metricCatalogVersion: 'metrics:1.0.0',
    calculationRulesVersion: 'metric-rules:1.0.0',
    valuationBasis: 'MARK_TO_MARKET',
    valuationBasisRuleId: 'equity.valuation:mark_to_market:1.0.0',
    valuationPeriodicity: 'DAILY',
    metricRules: {
      totalReturnPct: 'metric.total_return_pct:1.0.0',
      maxDrawdownPct: 'metric.max_drawdown_pct:1.0.0',
      sharpe: 'metric.sharpe_ratio:1.0.0',
      annualizedVolatilityPct: 'metric.annualized_volatility_pct:1.0.0',
      winRatePct: 'metric.win_rate_pct:1.0.0',
      startingEquity: 'metric.starting_equity:1.0.0',
      endingEquity: 'metric.ending_equity:1.0.0',
      endingCash: 'metric.ending_cash:1.0.0',
      realizedPnl: 'metric.realized_pnl:1.0.0',
      totalFees: 'metric.total_fees:1.0.0',
      totalSlippage: 'metric.total_slippage:1.0.0',
      fillCount: 'metric.fill_count:1.0.0',
      closingTradeCount: 'metric.closing_trade_count:1.0.0',
      winningTradeCount: 'metric.winning_trade_count:1.0.0',
      losingTradeCount: 'metric.losing_trade_count:1.0.0',
      valuationPointCount: 'metric.valuation_point_count:1.0.0',
    },
  },
  calculationRulesVersion: 'metric-rules:1.0.0',
  sourceSetHash: `sha256:${'b'.repeat(64)}`,
  inputHash: `sha256:${'c'.repeat(64)}`,
  resultHash: RESULT_HASH,
  calculatedAt: '2026-07-31T12:29:00Z',
};

export const INSTRUMENT_ID = '00000000-0000-4000-8000-000000002908';

export const PERFORMANCE_SERIES: Json = {
  backtestRunId: RUN_ID,
  points: [
    { occurredAt: '2026-07-01T20:00:00Z', equity: '10000.00000000', cash: '10000.00000000', positions: [] },
    {
      occurredAt: '2026-07-15T20:00:00Z', equity: '10050.00000000', cash: '5049.50000000',
      positions: [{ instrumentId: INSTRUMENT_ID, quantity: '50.00000000', markPrice: '100.01000000', marketValue: '5000.50000000' }],
    },
    {
      occurredAt: '2026-07-29T20:00:00Z', equity: '10300.00000000', cash: '5049.50000000',
      positions: [{ instrumentId: INSTRUMENT_ID, quantity: '50.00000000', markPrice: '105.01000000', marketValue: '5250.50000000' }],
    },
  ],
  resultHash: RESULT_HASH,
  sourceSetHash: `sha256:${'b'.repeat(64)}`,
};

export const JULY_FILL_RECORD_ID = '50000000-0000-4000-8000-000000000001';
export const JULY_REJECTION_RECORD_ID = '50000000-0000-4000-8000-000000000002';

const TRADE_RECORD_IDS = [JULY_FILL_RECORD_ID, JULY_REJECTION_RECORD_ID];

/**
 * `_monthly_payload`. The six canonical counters are columns; the first-failure
 * tally and the trade record identities live inside `summaryDocument`, whose keys are
 * the `backtest.failure_condition_counts` column names (`monthly_judgment._summary_document`).
 */
export const MONTHLY_SUMMARIES: Json[] = [
  {
    monthlySummaryId: '40000000-0000-4000-8000-000000000001',
    backtestRunId: RUN_ID,
    etYearMonth: '2026-07',
    evaluationCount: 21,
    activeBranchCount: 2,
    tradeEventCount: 2,
    dataGapCount: 1,
    triggeredCount: 2,
    rejectedCount: 1,
    summaryDocument: {
      schema_version: 1,
      run_snapshot_id: '90000000-0000-4000-8000-000000000001',
      result_manifest_id: '99999999-9999-4999-8999-999999999999',
      et_year_month: '2026-07',
      timezone_id: 'America/New_York',
      evaluation_count: 21,
      active_branch_count: 2,
      trade_event_count: 2,
      data_gap_count: 1,
      triggered_count: 2,
      rejected_count: 1,
      failure_counts: [
        {
          mode: 'BASIC',
          flow_or_branch_key: 'BASIC',
          first_failure_condition_key: 'rsi-below-30',
          occurrence_count: 3,
        },
      ],
      trade_record_ids: TRADE_RECORD_IDS,
    },
    summaryHash: 'd'.repeat(64),
  },
  {
    monthlySummaryId: '40000000-0000-4000-8000-000000000002',
    backtestRunId: RUN_ID,
    etYearMonth: '2026-08',
    evaluationCount: 22,
    activeBranchCount: 2,
    tradeEventCount: 0,
    dataGapCount: 0,
    triggeredCount: 0,
    rejectedCount: 0,
    summaryDocument: {
      schema_version: 1,
      run_snapshot_id: '90000000-0000-4000-8000-000000000001',
      result_manifest_id: '99999999-9999-4999-8999-999999999999',
      et_year_month: '2026-08',
      timezone_id: 'America/New_York',
      evaluation_count: 22,
      active_branch_count: 2,
      trade_event_count: 0,
      data_gap_count: 0,
      triggered_count: 0,
      rejected_count: 0,
      failure_counts: [],
      trade_record_ids: [],
    },
    summaryHash: 'e'.repeat(64),
  },
];

/**
 * `_trade_payload`, one ET month at a time — the payload D31 binds the 거래 상세
 * screen to, in the shape `test_monthly_trade_detail_is_served_for_the_owning_account`
 * pins.
 *
 * Three things here are load-bearing rather than decorative:
 *
 * * **The FILL's `occurredAt` is `2026-08-01T03:30:00Z`.** That is 2026-07-31 23:30 in
 *   `America/New_York`, so a July record carries an August UTC date. A screen that
 *   formats it in local or UTC time files it under the wrong month, which is exactly
 *   what the ET-month join exists to prevent.
 * * **The second record is a REJECTION**, so its nine FILL-only columns are `null` and
 *   it carries a `reasonCode` instead. Rendering `null` as `0.00` would invent a
 *   zero-fee, zero-quantity trade that never happened.
 * * **August is empty.** A `COMPLETED` run that traded nothing in a month answers
 *   `200 {"items": []}`, never 409 and never a 404.
 */
export const JULY_TRADES: Json[] = [
  {
    recordId: JULY_FILL_RECORD_ID,
    occurredAt: '2026-08-01T03:30:00Z',
    kind: 'FILL',
    orderId: '00000000-0000-4000-8000-000000002909',
    instrumentId: INSTRUMENT_ID,
    orderStatus: 'FILLED',
    cashAfter: '9897.80000000',
    positionsAfter: [
      {
        instrumentId: INSTRUMENT_ID,
        quantity: '1.00000000',
        costBasis: '100.05000000',
      },
    ],
    reasonCode: null,
    fillId: '00000000-0000-4000-8000-000000002913',
    quantity: '1.00000000',
    basePrice: '100.00000000',
    price: '100.05000000',
    grossAmount: '100.05000000',
    slippageAmount: '0.05000000',
    fee: '2.20000000',
    costBasis: '100.05000000',
    realizedPnl: '0.00000000',
  },
  {
    recordId: JULY_REJECTION_RECORD_ID,
    occurredAt: '2026-07-21T17:45:00Z',
    kind: 'REJECTION',
    orderId: '00000000-0000-4000-8000-000000002910',
    instrumentId: INSTRUMENT_ID,
    orderStatus: 'REJECTED',
    cashAfter: '9997.85000000',
    positionsAfter: [],
    reasonCode: 'INSUFFICIENT_BUYING_POWER',
    fillId: null,
    quantity: null,
    basePrice: null,
    price: null,
    grossAmount: null,
    slippageAmount: null,
    fee: null,
    costBasis: null,
    realizedPnl: null,
  },
];

/** `etMonth` -> the rows that ET month contains. Months absent here answer `[]`. */
export const MONTHLY_TRADES: Record<string, Json[]> = {
  '2026-07': JULY_TRADES,
  '2026-08': [],
};

/**
 * `_manifest_payload`. `weekStartDate` is an ET Monday, never a month: 2026-07-27
 * runs into August, which is exactly the straddle `result_query._week_overlaps_month`
 * exists for.
 */
export const DETAIL_MANIFESTS: Json[] = [
  {
    manifestId: '60000000-0000-4000-8000-000000000001',
    backtestRunId: RUN_ID,
    objectId: '70000000-0000-4000-8000-000000000001',
    recordType: 'TRADE_DETAIL',
    weekStartDate: '2026-07-20',
    periodStart: '2026-07-20T04:00:00Z',
    periodEnd: '2026-07-27T03:59:59Z',
    partNumber: 1,
    rowCount: 2,
    schemaVersion: 'detail-v1',
    sourceSetHash: `sha256:${'b'.repeat(64)}`,
    supersedesManifestId: null,
    detailHash: `sha256:${'f'.repeat(64)}`,
    createdAt: '2026-07-31T12:28:00Z',
  },
  {
    manifestId: '60000000-0000-4000-8000-000000000002',
    backtestRunId: RUN_ID,
    objectId: '70000000-0000-4000-8000-000000000002',
    recordType: 'TRADE_DETAIL',
    weekStartDate: '2026-07-27',
    periodStart: '2026-07-27T04:00:00Z',
    periodEnd: '2026-08-03T03:59:59Z',
    partNumber: 1,
    rowCount: 5,
    schemaVersion: 'detail-v1',
    sourceSetHash: `sha256:${'b'.repeat(64)}`,
    supersedesManifestId: null,
    detailHash: `sha256:${'9'.repeat(64)}`,
    createdAt: '2026-07-31T12:28:00Z',
  },
  {
    manifestId: '60000000-0000-4000-8000-000000000003',
    backtestRunId: RUN_ID,
    objectId: '70000000-0000-4000-8000-000000000003',
    recordType: 'POSITION_SNAPSHOT',
    weekStartDate: '2026-08-10',
    periodStart: '2026-08-10T04:00:00Z',
    periodEnd: '2026-08-17T03:59:59Z',
    partNumber: 1,
    rowCount: 7,
    schemaVersion: 'detail-v1',
    sourceSetHash: `sha256:${'b'.repeat(64)}`,
    supersedesManifestId: null,
    detailHash: `sha256:${'8'.repeat(64)}`,
    createdAt: '2026-07-31T12:28:00Z',
  },
];

export interface BacktestApiState {
  /** Runs the owner can see, newest first, exactly as `list_backtests` orders them. */
  runs: Json[];
  attempts: Json[];
  /** `null` reproduces the 404 the server returns until a summary is published. */
  performance: Json | null;
  performanceSeries: Json | null;
  monthlySummaries: Json[];
  detailManifests: Json[];
  /** Trade detail rows by ET month. An unlisted month is an empty month. */
  monthlyTrades: Record<string, Json[]>;
}

export const DEFAULT_STATE: BacktestApiState = {
  runs: [runPayload()],
  attempts: ATTEMPTS,
  performance: PERFORMANCE,
  performanceSeries: PERFORMANCE_SERIES,
  monthlySummaries: MONTHLY_SUMMARIES,
  detailManifests: DETAIL_MANIFESTS,
  monthlyTrades: MONTHLY_TRADES,
};

/** `api.RESULT_NOT_READY_REASON`. */
export const RESULT_NOT_READY_REASON = 'BACKTEST_RESULT_NOT_READY';

/** `api._ET_MONTH_PATTERN`. */
export const ET_MONTH_PATTERN = /^(?!0000)[0-9]{4}-(?:0[1-9]|1[0-2])$/;

/** Which principal a request's `Authorization` header names, the way the engine does. */
export function principalOf(header: string | null): 'owner' | 'other' | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) return null;
  if (token.trim() === OWNER_TOKEN) return 'owner';
  if (token.trim() === OTHER_OWNER_TOKEN) return 'other';
  return null;
}
