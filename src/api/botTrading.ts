export interface BotOrder {
  orderId: string;
  partitionId: string | null;
  instrumentId: string | null;
  side: string;
  orderType: string;
  timeInForce: string;
  requestedQuantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  status: string;
  acceptedAt: string;
}

export interface BotFill {
  fillId: string;
  orderId: string;
  instrumentId: string | null;
  quantity: string;
  fillPrice: string;
  grossAmount: string;
  feeAmount: string;
  settlementCashDelta: string;
  occurredAt: string;
}

export interface BotPosition {
  flowId: string;
  partitionId: string;
  instrumentId: string;
  longQuantity: string;
  shortQuantity: string;
  costBasisAmount: string;
  lastEventSequence: number;
}

export interface BotPartitionBudget {
  partitionId: string;
  budgetCapAmount: string;
  activeReservationAmount: string;
  investedAmount: string;
}

export interface BotBudget {
  currencyCode: string | null;
  availableCashAmount: string | null;
  activeReservationAmount: string | null;
  investedAmount: string | null;
  valuationAt: string | null;
  valuationStatus: string;
  lastEventSequence: number;
  partitions: BotPartitionBudget[];
}

export interface BotDecisionReason {
  intentId: string;
  partitionId: string;
  flowId: string;
  instrumentId: string;
  decision: string;
  reasonCode: string;
  requestedQuantity: string | null;
  finalQuantity: string | null;
  batchFinalizedAt: string | null;
}

export interface BotStopSettlementAction {
  actionId: string;
  partitionId: string;
  flowId: string;
  instrumentId: string;
  reasonType: string;
  requestedQuantity: string;
  generatedIntentId: string;
  createdAt: string;
}

/**
 * The bot's trading and ledger record.
 *
 * <p>Read only, and deliberately so: policy.user.no-direct-orders means the product has no way for
 * a user to place an order outside their locked strategy, so there is nothing here that writes.
 */
export interface BotTradingClient {
  listOrders(botId: string, limit?: number, signal?: AbortSignal): Promise<BotOrder[]>;
  listFills(botId: string, limit?: number, signal?: AbortSignal): Promise<BotFill[]>;
  listPositions(botId: string, signal?: AbortSignal): Promise<BotPosition[]>;
  getBudget(botId: string, signal?: AbortSignal): Promise<BotBudget>;
  listDecisionReasons(
    botId: string,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<BotDecisionReason[]>;
  listStopSettlement(botId: string, signal?: AbortSignal): Promise<BotStopSettlementAction[]>;
}

interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null;
}

export function createBotTradingClient({
  baseUrl = '',
  fetchImpl = fetch,
  getAccessToken,
}: ClientOptions = {}): BotTradingClient {
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
      throw new Error(`Bot trading request failed (${response.status})`);
    }
    return response.json();
  };

  const collection = async <T>(
    botId: string,
    resource: string,
    limit: number | undefined,
    read: (value: unknown) => T,
    signal?: AbortSignal,
  ): Promise<T[]> => {
    const query = limit === undefined ? '' : `?limit=${encodeURIComponent(String(limit))}`;
    const payload = await request(
      `/api/v1/bots/${encodeURIComponent(botId)}/${resource}${query}`,
      signal,
    );
    if (!Array.isArray(payload)) {
      throw new Error(`Invalid bot ${resource} response`);
    }
    return payload.map(read);
  };

  return {
    listOrders: (botId, limit, signal) =>
      collection(botId, 'orders', limit, readOrder, signal),
    listFills: (botId, limit, signal) => collection(botId, 'fills', limit, readFill, signal),
    listPositions: (botId, signal) =>
      collection(botId, 'positions', undefined, readPosition, signal),
    listDecisionReasons: (botId, limit, signal) =>
      collection(botId, 'decision-reasons', limit, readDecisionReason, signal),
    listStopSettlement: (botId, signal) =>
      collection(botId, 'stop-settlement', undefined, readStopSettlementAction, signal),

    async getBudget(botId, signal) {
      return readBudget(
        await request(`/api/v1/bots/${encodeURIComponent(botId)}/budget`, signal),
      );
    },
  };
}

/**
 * Amounts and quantities stay strings all the way to the screen.
 *
 * <p>The server sends them as exact decimals; parsing them into a JavaScript number would round
 * a cost basis or a fee to whatever binary floating point happens to be nearest, and a ledger that
 * disagrees with itself by a cent is worse than one that is hard to sort.
 */
function decimal(value: unknown, label: string): string {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  throw new Error(`Invalid ${label}`);
}

function nullableDecimal(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : decimal(value, label);
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : string(value, label);
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function readOrder(value: unknown): BotOrder {
  const item = object(value, 'Invalid bot order');
  return {
    orderId: string(item.orderId, 'orderId'),
    partitionId: nullableString(item.partitionId, 'partitionId'),
    instrumentId: nullableString(item.instrumentId, 'instrumentId'),
    side: string(item.side, 'side'),
    orderType: string(item.orderType, 'orderType'),
    timeInForce: string(item.timeInForce, 'timeInForce'),
    requestedQuantity: decimal(item.requestedQuantity, 'requestedQuantity'),
    filledQuantity: decimal(item.filledQuantity, 'filledQuantity'),
    remainingQuantity: decimal(item.remainingQuantity, 'remainingQuantity'),
    status: string(item.status, 'status'),
    acceptedAt: string(item.acceptedAt, 'acceptedAt'),
  };
}

function readFill(value: unknown): BotFill {
  const item = object(value, 'Invalid bot fill');
  return {
    fillId: string(item.fillId, 'fillId'),
    orderId: string(item.orderId, 'orderId'),
    instrumentId: nullableString(item.instrumentId, 'instrumentId'),
    quantity: decimal(item.quantity, 'quantity'),
    fillPrice: decimal(item.fillPrice, 'fillPrice'),
    grossAmount: decimal(item.grossAmount, 'grossAmount'),
    feeAmount: decimal(item.feeAmount, 'feeAmount'),
    settlementCashDelta: decimal(item.settlementCashDelta, 'settlementCashDelta'),
    occurredAt: string(item.occurredAt, 'occurredAt'),
  };
}

function readPosition(value: unknown): BotPosition {
  const item = object(value, 'Invalid bot position');
  return {
    flowId: string(item.flowId, 'flowId'),
    partitionId: string(item.partitionId, 'partitionId'),
    instrumentId: string(item.instrumentId, 'instrumentId'),
    longQuantity: decimal(item.longQuantity, 'longQuantity'),
    shortQuantity: decimal(item.shortQuantity, 'shortQuantity'),
    costBasisAmount: decimal(item.costBasisAmount, 'costBasisAmount'),
    lastEventSequence: nonNegativeInteger(item.lastEventSequence, 'lastEventSequence'),
  };
}

function readBudget(value: unknown): BotBudget {
  const item = object(value, 'Invalid bot budget');
  const partitions = item.partitions;
  if (!Array.isArray(partitions)) {
    throw new Error('Invalid bot budget partitions');
  }
  return {
    currencyCode: nullableString(item.currencyCode, 'currencyCode'),
    availableCashAmount: nullableDecimal(item.availableCashAmount, 'availableCashAmount'),
    activeReservationAmount: nullableDecimal(
      item.activeReservationAmount,
      'activeReservationAmount',
    ),
    investedAmount: nullableDecimal(item.investedAmount, 'investedAmount'),
    valuationAt: nullableString(item.valuationAt, 'valuationAt'),
    valuationStatus: string(item.valuationStatus, 'valuationStatus'),
    lastEventSequence: nonNegativeInteger(item.lastEventSequence, 'lastEventSequence'),
    partitions: partitions.map(readPartitionBudget),
  };
}

function readPartitionBudget(value: unknown): BotPartitionBudget {
  const item = object(value, 'Invalid partition budget');
  return {
    partitionId: string(item.partitionId, 'partitionId'),
    budgetCapAmount: decimal(item.budgetCapAmount, 'budgetCapAmount'),
    activeReservationAmount: decimal(item.activeReservationAmount, 'activeReservationAmount'),
    investedAmount: decimal(item.investedAmount, 'investedAmount'),
  };
}

function readDecisionReason(value: unknown): BotDecisionReason {
  const item = object(value, 'Invalid bot decision reason');
  return {
    intentId: string(item.intentId, 'intentId'),
    partitionId: string(item.partitionId, 'partitionId'),
    flowId: string(item.flowId, 'flowId'),
    instrumentId: string(item.instrumentId, 'instrumentId'),
    decision: string(item.decision, 'decision'),
    reasonCode: string(item.reasonCode, 'reasonCode'),
    requestedQuantity: nullableDecimal(item.requestedQuantity, 'requestedQuantity'),
    finalQuantity: nullableDecimal(item.finalQuantity, 'finalQuantity'),
    batchFinalizedAt: nullableString(item.batchFinalizedAt, 'batchFinalizedAt'),
  };
}

function readStopSettlementAction(value: unknown): BotStopSettlementAction {
  const item = object(value, 'Invalid stop settlement action');
  return {
    actionId: string(item.actionId, 'actionId'),
    partitionId: string(item.partitionId, 'partitionId'),
    flowId: string(item.flowId, 'flowId'),
    instrumentId: string(item.instrumentId, 'instrumentId'),
    reasonType: string(item.reasonType, 'reasonType'),
    requestedQuantity: decimal(item.requestedQuantity, 'requestedQuantity'),
    generatedIntentId: string(item.generatedIntentId, 'generatedIntentId'),
    createdAt: string(item.createdAt, 'createdAt'),
  };
}

export const defaultBotTradingClient = createBotTradingClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
});
