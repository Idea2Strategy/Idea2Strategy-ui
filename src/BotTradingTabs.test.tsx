import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { BotsView } from './views/BotsView';
import type { BotOperationsClient } from './api/botOperations';
import type {
  BotBudget,
  BotDecisionReason,
  BotFill,
  BotOrder,
  BotPosition,
  BotStopSettlementAction,
  BotTradingClient,
} from './api/botTrading';

/*
  The trading and ledger read surfaces on the bot screen (#62).

  Every amount the API sends is an exact decimal string, and these tests keep
  digits in them that a JavaScript number cannot hold. `Number('...56789012')`
  rounds to the nearest binary float, so a screen that parses on the way in
  fails here rather than in someone's ledger.
*/

const BOT_ID = '30000000-0000-4000-8000-000000000001';

const operationsClient = (): BotOperationsClient => ({
  listOperations: vi.fn().mockResolvedValue([{
    botId: BOT_ID,
    name: 'Atlas 07',
    state: 'running' as const,
    lifecycleChangedAt: '2026-08-01T12:00:00Z',
    executionBlockedAt: null,
    executionBlockReasonCode: null,
    lastEventSequence: 0,
  }]),
  listJudgments: vi.fn().mockResolvedValue({ entries: [], nextAfterSequence: 0, hasMore: false }),
  runBot: vi.fn().mockResolvedValue(undefined),
  stopBot: vi.fn().mockResolvedValue(undefined),
});

const EMPTY_BUDGET: BotBudget = {
  currencyCode: null,
  availableCashAmount: null,
  activeReservationAmount: null,
  investedAmount: null,
  valuationAt: null,
  valuationStatus: 'UNVALUED',
  lastEventSequence: 0,
  partitions: [],
};

const tradingClient = (overrides: Partial<{
  orders: BotOrder[];
  fills: BotFill[];
  positions: BotPosition[];
  budget: BotBudget;
  decisionReasons: BotDecisionReason[];
  stopSettlement: BotStopSettlementAction[];
}> = {}): BotTradingClient => ({
  listOrders: vi.fn().mockResolvedValue(overrides.orders ?? []),
  listFills: vi.fn().mockResolvedValue(overrides.fills ?? []),
  listPositions: vi.fn().mockResolvedValue(overrides.positions ?? []),
  getBudget: vi.fn().mockResolvedValue(overrides.budget ?? EMPTY_BUDGET),
  listDecisionReasons: vi.fn().mockResolvedValue(overrides.decisionReasons ?? []),
  listStopSettlement: vi.fn().mockResolvedValue(overrides.stopSettlement ?? []),
});

const renderBots = (trading: BotTradingClient) => render(
  <BotsView
    operationsClient={operationsClient()}
    tradingClient={trading}
    pollIntervalMs={60_000}
  />,
);

const order = (overrides: Partial<BotOrder> = {}): BotOrder => ({
  orderId: '50000000-0000-4000-8000-000000000001',
  partitionId: '60000000-0000-4000-8000-000000000001',
  instrumentId: '70000000-0000-4000-8000-000000000001',
  symbol: 'AAPL',
  currentSymbol: 'AAPL',
  side: 'BUY',
  orderType: 'MARKET',
  timeInForce: 'DAY',
  requestedQuantity: '10',
  filledQuantity: '4',
  remainingQuantity: '6',
  status: 'OPEN',
  acceptedAt: '2026-08-01T13:30:00Z',
  ...overrides,
});

const fill = (overrides: Partial<BotFill> = {}): BotFill => ({
  fillId: '80000000-0000-4000-8000-000000000001',
  orderId: '50000000-0000-4000-8000-000000000001',
  instrumentId: '70000000-0000-4000-8000-000000000001',
  symbol: 'AAPL',
  currentSymbol: 'AAPL',
  quantity: '4',
  fillPrice: '214.08',
  grossAmount: '856.32',
  feeAmount: '0.86',
  settlementCashDelta: '-857.18',
  occurredAt: '2026-08-01T13:31:00Z',
  ...overrides,
});

describe('Bot trading and ledger surfaces', () => {
  test('lists the bot orders with the ticker of the moment and today\'s in brackets', async () => {
    const user = userEvent.setup();
    renderBots(tradingClient({
      orders: [
        order({ symbol: 'FB', currentSymbol: 'META', status: 'FILLED', filledQuantity: '10', remainingQuantity: '0' }),
        order({
          orderId: '50000000-0000-4000-8000-000000000002',
          symbol: 'AAPL',
          currentSymbol: 'AAPL',
          side: 'SELL',
          status: 'REJECTED',
        }),
      ],
    }));

    await user.click(await screen.findByRole('tab', { name: /주문/ }));

    const table = await screen.findByRole('table');
    // Renamed: the ticker at order time leads, today's follows in brackets.
    expect(within(table).getByText('FB (META)')).toBeInTheDocument();
    // Unchanged: no brackets, because there is nothing to disambiguate.
    expect(within(table).getByText('AAPL')).toBeInTheDocument();
    expect(within(table).getByText('체결 완료')).toBeInTheDocument();
    expect(within(table).getByText('거절됨')).toBeInTheDocument();
    expect(within(table).getByText('매도')).toBeInTheDocument();
  });

  test('keeps order quantities exactly as the ledger sent them', async () => {
    const user = userEvent.setup();
    renderBots(tradingClient({
      orders: [order({
        requestedQuantity: '12345678901234.56789012',
        filledQuantity: '0.00000001',
        remainingQuantity: '12345678901234.56789011',
      })],
    }));

    await user.click(await screen.findByRole('tab', { name: /주문/ }));

    const table = await screen.findByRole('table');
    expect(within(table).getByText('0.00000001 / 12345678901234.56789012')).toBeInTheDocument();
    expect(within(table).getByText('12345678901234.56789011')).toBeInTheDocument();
  });

  test('shows the strategy budget and its partitions without rounding a cent away', async () => {
    const user = userEvent.setup();
    renderBots(tradingClient({
      budget: {
        currencyCode: 'USD',
        availableCashAmount: '12345678901234.56789012',
        activeReservationAmount: '250.00000000',
        investedAmount: '5326.30',
        valuationAt: '2026-08-01T20:00:00Z',
        valuationStatus: 'UNVALUED',
        lastEventSequence: 42,
        partitions: [{
          partitionId: '60000000-0000-4000-8000-000000000001',
          budgetCapAmount: '8000.00',
          activeReservationAmount: '250.00',
          investedAmount: '5326.30',
        }],
      },
    }));

    await user.click(await screen.findByRole('tab', { name: /개요/ }));

    const figures = await screen.findByRole('group', { name: 'Atlas 07 예산 현황' });
    expect(within(figures).getByText('USD 12345678901234.56789012')).toBeInTheDocument();
    // Trailing zeros go; the digits never pass through a JavaScript number.
    expect(within(figures).getByText('USD 250')).toBeInTheDocument();
    expect(within(figures).getByText('USD 5326.3')).toBeInTheDocument();
    // No valuation source yet, so the total is unknown rather than invented.
    expect(within(figures).getByText('—')).toBeInTheDocument();

    const budgetTable = await screen.findByRole('table', { name: '전략 구획 예산' });
    expect(within(budgetTable).getByText('USD 8000')).toBeInTheDocument();
    expect(within(budgetTable).getByText('#60000000')).toBeInTheDocument();
  });

  test('reads the fills into the decision log with the side the cash movement shows', async () => {
    const user = userEvent.setup();
    renderBots(tradingClient({
      fills: [
        fill(),
        fill({
          fillId: '80000000-0000-4000-8000-000000000002',
          orderId: '50000000-0000-4000-8000-000000000009',
          symbol: 'MSFT',
          currentSymbol: 'MSFT',
          quantity: '3',
          fillPrice: '492.30',
          grossAmount: '1476.90',
          feeAmount: '1.48',
          settlementCashDelta: '1475.42',
          occurredAt: '2026-08-01T14:00:00Z',
        }),
      ],
    }));

    await user.click(await screen.findByRole('tab', { name: /판단 기록/ }));

    const log = await screen.findByRole('list', { name: 'Atlas 07 판단 기록 목록' });
    // Cash left the account, so this was a buy; cash came in, so that was a sell.
    expect(within(log).getByText('AAPL 4주 · 214.08')).toBeInTheDocument();
    expect(within(log).getByText('MSFT 3주 · 492.3')).toBeInTheDocument();
    expect(within(log).getByText('매수')).toBeInTheDocument();
    expect(within(log).getByText('매도')).toBeInTheDocument();
    // The figure that actually moved the ledger, stated rather than inferred.
    expect(within(log).getByText('체결금액 856.32 · 수수료 0.86 · 현금 증감 -857.18')).toBeInTheDocument();
  });

  test('prefers the order side over the cash sign when the order is loaded', async () => {
    const user = userEvent.setup();
    renderBots(tradingClient({
      orders: [order({ side: 'SELL' })],
      // A sell whose fee swallowed the proceeds still settles as cash out. The
      // order says what it was, so the sign is not consulted.
      fills: [fill({ settlementCashDelta: '-0.01' })],
    }));

    await user.click(await screen.findByRole('tab', { name: /판단 기록/ }));

    const log = await screen.findByRole('list', { name: 'Atlas 07 판단 기록 목록' });
    expect(within(log).getByText('매도')).toBeInTheDocument();
    expect(within(log).queryByText('매수')).not.toBeInTheDocument();
  });

  test('records why an intent was refused or cut down, under the full record filter', async () => {
    const user = userEvent.setup();
    renderBots(tradingClient({
      decisionReasons: [{
        intentId: '90000000-0000-4000-8000-000000000001',
        partitionId: '60000000-0000-4000-8000-000000000001',
        flowId: 'a0000000-0000-4000-8000-000000000001',
        instrumentId: '70000000-0000-4000-8000-000000000001',
        symbol: 'KO',
        currentSymbol: 'KO',
        decision: 'REDUCED',
        reasonCode: 'BUDGET_CAP',
        requestedQuantity: '24',
        finalQuantity: '10',
        batchFinalizedAt: '2026-08-01T15:00:00Z',
      }],
    }));

    await user.click(await screen.findByRole('tab', { name: /판단 기록/ }));
    // The log opens on fills only, and a refusal produced no fill.
    expect(screen.queryByText('KO 수량 축소')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '전체 기록' }));

    const log = await screen.findByRole('list', { name: 'Atlas 07 판단 기록 목록' });
    expect(within(log).getByText('KO 수량 축소')).toBeInTheDocument();
    expect(within(log).getByText('사유 BUDGET_CAP · 요청 수량 24 → 확정 수량 10')).toBeInTheDocument();
  });

  test('shows what a forced stop liquidated, and hides the table when it liquidated nothing', async () => {
    const user = userEvent.setup();
    const { unmount } = renderBots(tradingClient({
      stopSettlement: [{
        actionId: 'b0000000-0000-4000-8000-000000000001',
        partitionId: '60000000-0000-4000-8000-000000000001',
        flowId: 'a0000000-0000-4000-8000-000000000001',
        instrumentId: '70000000-0000-4000-8000-000000000001',
        symbol: 'SPY',
        currentSymbol: 'SPY',
        reasonType: 'BOT_STOP',
        requestedQuantity: '4',
        generatedIntentId: '90000000-0000-4000-8000-000000000002',
        createdAt: '2026-08-01T16:00:00Z',
      }],
    }));

    await user.click(await screen.findByRole('tab', { name: /개요/ }));

    const table = await screen.findByRole('table', { name: '중단 정산 결과' });
    expect(within(table).getByText('SPY')).toBeInTheDocument();
    expect(within(table).getByText('봇 중단')).toBeInTheDocument();
    expect(within(table).getByText('#90000000')).toBeInTheDocument();

    unmount();

    renderBots(tradingClient());
    await user.click(await screen.findByRole('tab', { name: /개요/ }));
    await waitFor(() => expect(screen.queryByRole('table', { name: '중단 정산 결과' })).not.toBeInTheDocument());
  });

  test('says a surface is unknown rather than empty when it could not be read', async () => {
    const user = userEvent.setup();
    const failing = tradingClient();
    failing.listOrders = vi.fn().mockRejectedValue(new Error('gateway'));
    renderBots(failing);

    await user.click(await screen.findByRole('tab', { name: /주문/ }));

    expect(await screen.findByText('주문 기록을 아직 불러오지 못했습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('offers no way to place, amend or cancel an order', async () => {
    const user = userEvent.setup();
    renderBots(tradingClient({ orders: [order()], fills: [fill()] }));

    await user.click(await screen.findByRole('tab', { name: /주문/ }));
    await screen.findByRole('table');

    /* policy.user.no-direct-orders: a user cannot submit an order or an order
       intention outside their locked strategy, so the record of what the bot
       did carries no control that would add to it. */
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).queryAllByRole('button')).toHaveLength(0);
    expect(within(panel).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(panel).queryAllByRole('combobox')).toHaveLength(0);
  });

  test('counts the live rows on the tabs instead of the sample ones', async () => {
    renderBots(tradingClient({
      orders: [order(), order({ orderId: '50000000-0000-4000-8000-000000000003' })],
      positions: [{
        flowId: 'a0000000-0000-4000-8000-000000000001',
        partitionId: '60000000-0000-4000-8000-000000000001',
        instrumentId: '70000000-0000-4000-8000-000000000001',
        currentSymbol: 'AAPL',
        longQuantity: '6',
        shortQuantity: '0',
        costBasisAmount: '1284.48',
        lastEventSequence: 3,
      }],
    }));

    const orders = await screen.findByRole('tab', { name: /주문/ });
    await waitFor(() => expect(orders).toHaveTextContent('2'));
    // The sample Atlas 07 holds three positions; the real bot holds one.
    await waitFor(() => expect(screen.getByRole('tab', { name: /포지션/ })).toHaveTextContent('1'));
  });
});
