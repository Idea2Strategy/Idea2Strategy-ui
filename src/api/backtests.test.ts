import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  BACKTEST_API_BASE,
  CONFIGURATION_HASH,
  INSTRUMENT_ID,
  JULY_FILL_RECORD_ID,
  JULY_REJECTION_RECORD_ID,
  JULY_TRADES,
  MONTHLY_SUMMARIES,
  OTHER_OWNER_RUN_ID,
  OTHER_OWNER_TOKEN,
  OWNER_TOKEN,
  QUEUED_RUN,
  RESULT_HASH,
  RUN_ID,
  UNAVAILABLE_RUN,
  UNKNOWN_RUN_ID,
  backtestHandlers,
  runPayload,
} from '../test/backtestApi';
import { BacktestApiError, BacktestContractError, createBacktestClient } from './backtests';

/*
  These run against request-level handlers that serve the rebuilt engine's own
  payloads, so a path the server does not route or a field it does not publish fails
  here instead of at runtime. `onUnhandledRequest: 'error'` is the part that catches a
  wrong path: the pre-rebuild client asked for `/monthly-judgments`, which no version
  of this server has ever served.
*/
const server = setupServer(...backtestHandlers());

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = (token: string | null = OWNER_TOKEN) => createBacktestClient({
  baseUrl: BACKTEST_API_BASE,
  getAccessToken: () => token,
});

describe('backtest results API client', () => {
  it('reads the owner run page the server actually returns', async () => {
    const page = await client().listRuns();

    expect(page.limit).toBe(50);
    expect(page.offset).toBe(0);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].backtestRunId).toBe('f876f259-4158-5a9a-8973-db21764024dc');
    expect(page.items[0].botId).toBe('00000000-0000-4000-8000-000000000201');
    expect(page.items[0].status).toBe('COMPLETED');
    expect(page.items[0].queuedAt).toBe('2026-07-31T12:00:00Z');
    expect(page.items[0].slippageRateBps).toBe(5);
    expect(page.items[0].initialCashAmount).toBe('100000.00000000');
    expect(page.items[0].configurationHash).toBe(CONFIGURATION_HASH);
    // The list endpoint always reports 0 here; see the note in the handlers. The screen
    // reads /attempts rather than this field, so the defect stays visible instead of
    // being papered over with a client-side guess.
    expect(page.items[0].attemptCount).toBe(0);
  });

  it('reads one run, including the terminal timestamps and the result hash', async () => {
    const run = await client().getRun(RUN_ID);

    expect(run.status).toBe('COMPLETED');
    expect(run.startedAt).toBe('2026-07-31T12:05:00Z');
    expect(run.completedAt).toBe('2026-07-31T12:30:00Z');
    expect(run.resultHash).toBe(RESULT_HASH);
    expect(run.failureCode).toBeNull();
    expect(run.evaluationStart).toBe('2026-07-01');
    expect(run.evaluationEnd).toBe('2026-10-01');
    expect(run.precisionRulesVersion).toBe('precision:1.0.0');
  });

  it('surfaces the UNAVAILABLE reason the server stores in failureCode', async () => {
    server.use(...backtestHandlers({ runs: [UNAVAILABLE_RUN], performance: null }));

    const run = await client().getRun(RUN_ID);

    expect(run.status).toBe('UNAVAILABLE');
    expect(run.failureCode).toBe('MARKET_DATA_GAP');
    expect(run.completedAt).toBe('2026-07-31T12:07:00Z');
  });

  it('refuses the pre-rebuild COMPLETE token', async () => {
    // Spec 2.2: the canonical `backtest.run_status` success token is COMPLETED.
    server.use(...backtestHandlers({ runs: [runPayload({ status: 'COMPLETE' })] }));

    await expect(client().getRun(RUN_ID)).rejects.toThrow('Unsupported backtest run status: COMPLETE');
  });

  it('reads the durable attempt history', async () => {
    const attempts = await client().listAttempts(RUN_ID);

    expect(attempts).toHaveLength(1);
    expect(attempts[0].attemptNumber).toBe(1);
    expect(attempts[0].status).toBe('SUCCEEDED');
    expect(attempts[0].workerExecutionKey).toBe('worker-execution-1');
    expect(attempts[0].startedAt).toBe('2026-07-31T12:05:00Z');
    expect(attempts[0].completedAt).toBe('2026-07-31T12:30:00Z');
    expect(attempts[0].failureCode).toBeNull();
  });

  it('reads the metrics document without flattening money into a float', async () => {
    const performance = await client().getPerformance(RUN_ID);

    expect(performance.metricCatalogVersion).toBe('metrics:1.0.0');
    expect(performance.calculationRulesVersion).toBe('metric-rules:1.0.0');
    expect(performance.metrics.totalReturnPct).toBe(2.9996);
    expect(performance.metrics.maxDrawdownPct).toBe(-1);
    expect(performance.metrics.sharpe).toBe(9.16515139);
    expect(performance.metrics.winRatePct).toBe(37.5);
    expect(performance.metrics.realizedPnl).toBe('123.45000000');
    expect(performance.metrics.totalFees).toBe('2.00100000');
    expect(performance.metrics.endingEquity).toBe('10299.96000000');
    expect(performance.metrics.fillCount).toBe(12);
    expect(performance.metrics.valuationBasis).toBe('MARK_TO_MARKET');
    expect(performance.calculatedAt).toBe('2026-07-31T12:29:00Z');
  });

  it('keeps an undefined metric null rather than inventing a zero', async () => {
    server.use(...backtestHandlers({
      performance: {
        backtestRunId: RUN_ID,
        metricCatalogVersion: 'metrics:1.0.0',
        metricsDocument: {
          totalReturnPct: 1,
          maxDrawdownPct: 0,
          sharpe: null,
          annualizedVolatilityPct: null,
          winRatePct: null,
          startingEquity: '10000.00000000',
          endingEquity: '10100.00000000',
          endingCash: '10100.00000000',
          realizedPnl: '0.00000000',
          totalFees: '0.00000000',
          totalSlippage: '0.00000000',
          fillCount: 0,
          closingTradeCount: 0,
          winningTradeCount: 0,
          losingTradeCount: 0,
          valuationPointCount: 2,
          metricCatalogVersion: 'metrics:1.0.0',
          calculationRulesVersion: 'metric-rules:1.0.0',
          valuationBasis: 'MARK_TO_MARKET',
          valuationBasisRuleId: 'equity.valuation:mark_to_market:1.0.0',
          valuationPeriodicity: 'DAILY',
          metricRules: {},
        },
        calculationRulesVersion: 'metric-rules:1.0.0',
        sourceSetHash: `sha256:${'b'.repeat(64)}`,
        inputHash: `sha256:${'c'.repeat(64)}`,
        resultHash: RESULT_HASH,
        calculatedAt: '2026-07-31T12:29:00Z',
      },
    }));

    const performance = await client().getPerformance(RUN_ID);

    expect(performance.metrics.sharpe).toBeNull();
    expect(performance.metrics.winRatePct).toBeNull();
  });

  it('is a 404, not an empty summary, until performance is published', async () => {
    server.use(...backtestHandlers({ performance: null }));

    const error = await client().getPerformance(RUN_ID).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BacktestApiError);
    expect((error as BacktestApiError).status).toBe(404);
  });

  it('reads the six monthly counters plus the first-failure tally inside summaryDocument', async () => {
    const summaries = await client().listMonthlySummaries(RUN_ID);

    expect(summaries.map((item) => item.etYearMonth)).toEqual(['2026-07', '2026-08']);
    const july = summaries[0];
    expect(july.evaluationCount).toBe(21);
    expect(july.activeBranchCount).toBe(2);
    expect(july.tradeEventCount).toBe(2);
    expect(july.dataGapCount).toBe(1);
    expect(july.triggeredCount).toBe(2);
    expect(july.rejectedCount).toBe(1);
    expect(july.timezoneId).toBe('America/New_York');
    expect(july.summaryHash).toBe('d'.repeat(64));
    expect(july.firstFailureCounts).toEqual([{
      mode: 'BASIC',
      flowOrBranchKey: 'BASIC',
      firstFailureConditionKey: 'rsi-below-30',
      occurrenceCount: 3,
    }]);
    expect(july.tradeRecordIds).toEqual([
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
    ]);
    expect(summaries[1].firstFailureCounts).toEqual([]);
  });

  it('rejects a monthly summary whose document disagrees with its own column', async () => {
    const drifted = structuredClone(MONTHLY_SUMMARIES[0]) as Record<string, unknown>;
    (drifted.summaryDocument as Record<string, unknown>).et_year_month = '2026-06';
    server.use(...backtestHandlers({ monthlySummaries: [drifted] }));

    await expect(client().listMonthlySummaries(RUN_ID))
      .rejects.toBeInstanceOf(BacktestContractError);
  });

  it('reads detail manifests on their ET Monday week boundary', async () => {
    const manifests = await client().listDetailManifests(RUN_ID);

    expect(manifests).toHaveLength(3);
    expect(manifests[0].recordType).toBe('TRADE_DETAIL');
    expect(manifests[0].weekStartDate).toBe('2026-07-20');
    expect(manifests[0].partNumber).toBe(1);
    expect(manifests[0].rowCount).toBe(2);
    expect(manifests[1].weekStartDate).toBe('2026-07-27');
    expect(manifests[2].recordType).toBe('POSITION_SNAPSHOT');
    expect(manifests[2].supersedesManifestId).toBeNull();
  });

  it('reads one ET month of individual trade records', async () => {
    const page = await client().listMonthlyTrades(RUN_ID, '2026-07');

    expect(page.backtestRunId).toBe(RUN_ID);
    expect(page.etMonth).toBe('2026-07');
    expect(page.items.map((item) => item.recordId)).toEqual([
      JULY_FILL_RECORD_ID,
      JULY_REJECTION_RECORD_ID,
    ]);

    const [fill, rejection] = page.items;
    expect(fill.kind).toBe('FILL');
    expect(fill.orderStatus).toBe('FILLED');
    expect(fill.occurredAt).toBe('2026-08-01T03:30:00Z');
    // Money stays the engine's `numeric(24,8)` text; parsing it into a float here
    // would be this client rounding on the engine's behalf.
    expect(fill.price).toBe('100.05000000');
    expect(fill.fee).toBe('2.20000000');
    expect(fill.cashAfter).toBe('9897.80000000');
    expect(fill.positionsAfter).toEqual([
      { instrumentId: INSTRUMENT_ID, quantity: '1.00000000', costBasis: '100.05000000' },
    ]);

    // A rejected order has none of the nine FILL-only columns, and null is the answer.
    expect(rejection.kind).toBe('REJECTION');
    expect(rejection.reasonCode).toBe('INSUFFICIENT_BUYING_POWER');
    expect(rejection.fillId).toBeNull();
    expect(rejection.quantity).toBeNull();
    expect(rejection.fee).toBeNull();
    expect(rejection.realizedPnl).toBeNull();
    expect(rejection.cashAfter).toBe('9997.85000000');
  });

  it('sends et_month as the required query parameter', async () => {
    const seen: string[] = [];
    server.events.on('request:start', ({ request }) => seen.push(request.url));

    await client().listMonthlyTrades(RUN_ID, '2026-07');

    expect(seen.at(-1)).toContain('/monthly-trades?et_month=2026-07');
    server.events.removeAllListeners();
  });

  it('is an empty month, not an error, when the run traded nothing that month', async () => {
    const page = await client().listMonthlyTrades(RUN_ID, '2026-08');

    expect(page.items).toEqual([]);
    expect(page.etMonth).toBe('2026-08');
  });

  it('refuses an answer about a month other than the one asked for', async () => {
    server.use(http.get(
      `${BACKTEST_API_BASE}/api/v1/backtests/:runId/monthly-trades`,
      () => HttpResponse.json({ backtestRunId: RUN_ID, etMonth: '2026-06', items: [] }),
    ));

    await expect(client().listMonthlyTrades(RUN_ID, '2026-07'))
      .rejects.toBeInstanceOf(BacktestContractError);
  });

  it('rejects a trade record whose kind the engine does not publish', async () => {
    server.use(...backtestHandlers({
      monthlyTrades: { '2026-07': [{ ...JULY_TRADES[0], kind: 'TRADE' }] },
    }));

    await expect(client().listMonthlyTrades(RUN_ID, '2026-07'))
      .rejects.toThrow('Unsupported trade record kind: TRADE');
  });

  it('rejects a trade whose amount arrived as a JSON number', async () => {
    // The whole reason these columns are text. A float here is a value that has
    // already lost precision by the time this client sees it.
    server.use(...backtestHandlers({
      monthlyTrades: { '2026-07': [{ ...JULY_TRADES[0], price: 100.05 }] },
    }));

    await expect(client().listMonthlyTrades(RUN_ID, '2026-07'))
      .rejects.toBeInstanceOf(BacktestContractError);
  });

  it('reports an unfinished run as 409 not-ready rather than as a missing run', async () => {
    server.use(...backtestHandlers({ runs: [QUEUED_RUN], performance: null }));

    const error = await client().listMonthlyTrades(RUN_ID, '2026-07')
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BacktestApiError);
    expect((error as BacktestApiError).status).toBe(409);
    expect((error as BacktestApiError).reasonCode).toBe('BACKTEST_RESULT_NOT_READY');
    expect((error as BacktestApiError).resultNotReady).toBe(true);
    expect((error as BacktestApiError).notFound).toBe(false);
  });

  it('reports a foreign run 404 on the evidence route, which never says 403', async () => {
    // `result_query` fails closed: a 403 here would confirm the run exists and that
    // another account finished it.
    const error = await createBacktestClient({
      baseUrl: BACKTEST_API_BASE,
      getAccessToken: () => OTHER_OWNER_TOKEN,
    }).listMonthlyTrades(RUN_ID, '2026-07').catch((cause: unknown) => cause);

    expect((error as BacktestApiError).status).toBe(404);
    expect((error as BacktestApiError).forbidden).toBe(false);
  });

  it('reports a missing credential as 401 rather than as a transport failure', async () => {
    const error = await client(null).listRuns().catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BacktestApiError);
    expect((error as BacktestApiError).status).toBe(401);
    expect((error as BacktestApiError).unauthorized).toBe(true);
  });

  it('reports another account run as 403, and an unknown id as 404', async () => {
    const forbidden = await client().getRun(OTHER_OWNER_RUN_ID).catch((cause: unknown) => cause);
    const missing = await client().getRun(UNKNOWN_RUN_ID).catch((cause: unknown) => cause);

    expect((forbidden as BacktestApiError).status).toBe(403);
    expect((forbidden as BacktestApiError).unauthorized).toBe(true);
    expect((missing as BacktestApiError).status).toBe(404);
    expect((missing as BacktestApiError).unauthorized).toBe(false);
  });

  it('rejects a malformed body instead of rendering a half-parsed run', async () => {
    server.use(...backtestHandlers({ runs: [{ backtestRunId: RUN_ID }] }));

    const error = await client().getRun(RUN_ID).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BacktestContractError);
  });

  it('sends the bearer credential the server requires', async () => {
    const seen: Array<string | null> = [];
    server.events.on('request:start', ({ request }) => {
      seen.push(request.headers.get('Authorization'));
    });

    await client().listRuns({ limit: 10, offset: 0 });

    expect(seen).toContain(`Bearer ${OWNER_TOKEN}`);
    server.events.removeAllListeners();
  });

  it('scopes the list to the caller, so another account sees nothing', async () => {
    const page = await createBacktestClient({
      baseUrl: BACKTEST_API_BASE,
      getAccessToken: () => OTHER_OWNER_TOKEN,
    }).listRuns();

    expect(page.items).toEqual([]);
  });
});
