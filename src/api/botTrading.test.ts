import { describe, expect, it, vi } from 'vitest';
import { createBotTradingClient, tickerLabel } from './botTrading';

const BOT = '30000000-0000-4000-8000-00000000000a';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('bot trading API client', () => {
  it('reads orders and fills under the bot', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json([
        {
          orderId: '39000000-0000-4000-8000-00000000000a',
          partitionId: '31000000-0000-4000-8000-00000000000a',
          instrumentId: '36000000-0000-4000-8000-00000000000a',
          symbol: 'OLDT',
          currentSymbol: 'NEWT',
          side: 'BUY',
          orderType: 'MARKET',
          timeInForce: 'DAY',
          requestedQuantity: '3.00000000',
          filledQuantity: '3.00000000',
          remainingQuantity: '0.00000000',
          status: 'FILLED',
          acceptedAt: '2026-08-03T12:00:00Z',
        },
      ]))
      .mockResolvedValueOnce(json([
        {
          fillId: '3a000000-0000-4000-8000-00000000000a',
          orderId: '39000000-0000-4000-8000-00000000000a',
          instrumentId: '36000000-0000-4000-8000-00000000000a',
          quantity: '3.00000000',
          fillPrice: '10.00000000',
          grossAmount: '30.00000000',
          feeAmount: '0.06000000',
          settlementCashDelta: '-30.06000000',
          occurredAt: '2026-08-03T12:00:00Z',
        },
      ]));
    const client = createBotTradingClient({ baseUrl: 'https://api.example.com/', fetchImpl });

    const orders = await client.listOrders(BOT);
    const fills = await client.listFills(BOT, 10);

    expect(orders[0].status).toBe('FILLED');
    expect(tickerLabel(orders[0].symbol, orders[0].currentSymbol)).toBe('OLDT (NEWT)');
    expect(fills[0].settlementCashDelta).toBe('-30.06000000');
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      `https://api.example.com/api/v1/bots/${BOT}/orders`,
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `https://api.example.com/api/v1/bots/${BOT}/fills?limit=10`,
      expect.any(Object),
    );
  });

  /**
   * The server sends exact decimals. Turning them into JavaScript numbers would round a cost basis
   * or a fee to the nearest binary float, so the client keeps them as strings.
   */
  it('keeps amounts exactly as the server sent them', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([
      {
        flowId: '32000000-0000-4000-8000-00000000000a',
        partitionId: '31000000-0000-4000-8000-00000000000a',
        instrumentId: '36000000-0000-4000-8000-00000000000a',
        longQuantity: '3.00000000',
        shortQuantity: '0.00000000',
        costBasisAmount: '30.06000000',
        lastEventSequence: 4,
      },
    ]));
    const client = createBotTradingClient({ fetchImpl });

    const positions = await client.listPositions(BOT);

    expect(positions[0].costBasisAmount).toBe('30.06000000');
    expect(typeof positions[0].costBasisAmount).toBe('string');
  });

  /**
   * The v1 mark valuation rides on the position row: currentPrice, unrealisedPnl and returnPct
   * arrive as exact decimal strings, and each is null exactly when its input does not exist —
   * no fill has ever marked the instrument, or the basis is zero.
   */
  it('carries the v1 mark valuation as exact decimals, or null without a mark', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([
      {
        flowId: '32000000-0000-4000-8000-00000000000a',
        partitionId: '31000000-0000-4000-8000-00000000000a',
        instrumentId: '36000000-0000-4000-8000-00000000000a',
        longQuantity: '3.00000000',
        shortQuantity: '0.00000000',
        costBasisAmount: '30.06000000',
        currentPrice: '12.00000000',
        unrealisedPnl: '5.9400000000000000',
        returnPct: '19.76047904',
        lastEventSequence: 4,
      },
      {
        flowId: '32000000-0000-4000-8000-00000000000b',
        partitionId: '31000000-0000-4000-8000-00000000000a',
        instrumentId: '36000000-0000-4000-8000-00000000000b',
        longQuantity: '1.00000000',
        shortQuantity: '0.00000000',
        costBasisAmount: '5.00000000',
        currentPrice: null,
        unrealisedPnl: null,
        returnPct: null,
        lastEventSequence: 4,
      },
    ]));
    const client = createBotTradingClient({ fetchImpl });

    const [marked, unmarked] = await client.listPositions(BOT);

    expect(marked.currentPrice).toBe('12.00000000');
    expect(marked.unrealisedPnl).toBe('5.9400000000000000');
    expect(marked.returnPct).toBe('19.76047904');
    expect(unmarked.currentPrice).toBeNull();
    expect(unmarked.unrealisedPnl).toBeNull();
    expect(unmarked.returnPct).toBeNull();
  });

  it('reports long and short separately rather than netting them', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([
      {
        flowId: '32000000-0000-4000-8000-00000000000a',
        partitionId: '31000000-0000-4000-8000-00000000000a',
        instrumentId: '36000000-0000-4000-8000-00000000000a',
        longQuantity: '5.00000000',
        shortQuantity: '2.00000000',
        costBasisAmount: '30.06000000',
        lastEventSequence: 4,
      },
    ]));
    const client = createBotTradingClient({ fetchImpl });

    const [position] = await client.listPositions(BOT);

    expect(position.longQuantity).toBe('5.00000000');
    expect(position.shortQuantity).toBe('2.00000000');
  });

  /** A bot that has not traded yet still has a budget shape, just an unvalued one. */
  it('accepts an unvalued budget without amounts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({
      currencyCode: null,
      availableCashAmount: null,
      activeReservationAmount: null,
      investedAmount: null,
      valuationAt: null,
      valuationStatus: 'UNVALUED',
      lastEventSequence: 0,
      partitions: [],
    }));
    const client = createBotTradingClient({ fetchImpl });

    const budget = await client.getBudget(BOT);

    expect(budget.valuationStatus).toBe('UNVALUED');
    expect(budget.availableCashAmount).toBeNull();
    expect(budget.partitions).toEqual([]);
  });

  it('reads the reduction reason with both quantities', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([
      {
        intentId: '3b000000-0000-4000-8000-00000000000a',
        partitionId: '31000000-0000-4000-8000-00000000000a',
        flowId: '32000000-0000-4000-8000-00000000000a',
        instrumentId: '36000000-0000-4000-8000-00000000000a',
        decision: 'REDUCED',
        reasonCode: 'BUDGET_CAP_EXCEEDED',
        requestedQuantity: '5.00000000',
        finalQuantity: '3.00000000',
        batchFinalizedAt: '2026-08-03T12:00:00Z',
      },
    ]));
    const client = createBotTradingClient({ fetchImpl });

    const [reason] = await client.listDecisionReasons(BOT);

    expect(reason.decision).toBe('REDUCED');
    expect(reason.requestedQuantity).toBe('5.00000000');
    expect(reason.finalQuantity).toBe('3.00000000');
  });

  it('reads the stop settlement actions', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([
      {
        actionId: '3c000000-0000-4000-8000-00000000000a',
        partitionId: '31000000-0000-4000-8000-00000000000a',
        flowId: '32000000-0000-4000-8000-00000000000a',
        instrumentId: '36000000-0000-4000-8000-00000000000a',
        reasonType: 'BOT_STOP',
        requestedQuantity: '3.00000000',
        generatedIntentId: '3b000000-0000-4000-8000-00000000000a',
        createdAt: '2026-08-03T12:00:00Z',
      },
    ]));
    const client = createBotTradingClient({ fetchImpl });

    const [action] = await client.listStopSettlement(BOT);

    expect(action.reasonType).toBe('BOT_STOP');
    expect(action.generatedIntentId).toBe('3b000000-0000-4000-8000-00000000000a');
  });

  it('refuses a malformed row rather than rendering a blank one', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([{ orderId: '', status: 'FILLED' }]));
    const client = createBotTradingClient({ fetchImpl });

    await expect(client.listOrders(BOT)).rejects.toThrow(/Invalid orderId/);
  });

  /**
   * The record is read as of when it happened, so the ticker of that moment leads. Showing the
   * current one only when it differs is what makes a rename read as one instrument renamed, and
   * keeps every unrenamed row free of a redundant bracket.
   */
  it('writes a ticker with the current one only when it changed', () => {
    expect(tickerLabel('OLDT', 'NEWT')).toBe('OLDT (NEWT)');
    expect(tickerLabel('AAPL', 'AAPL')).toBe('AAPL');
    expect(tickerLabel(null, 'NEWT')).toBe('NEWT');
    expect(tickerLabel('OLDT', null)).toBe('OLDT');
    expect(tickerLabel(null, null)).toBe('—');
  });

  it('surfaces a failed request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ message: 'nope' }, 404));
    const client = createBotTradingClient({ fetchImpl });

    await expect(client.listOrders(BOT)).rejects.toThrow(/\(404\)/);
  });
});
