import { getSessionAccessToken } from './sessionAccessToken';

export class BotOperationsApiError extends Error {
  constructor(public readonly status: number) {
    super(`Bot operations request failed (${status})`);
    this.name = 'BotOperationsApiError';
  }

  get unauthenticated(): boolean {
    return this.status === 401;
  }
}

export type BotOperationsState =
  | 'waiting'
  | 'running'
  | 'action-required'
  | 'stopping'
  | 'stopped'
  | 'data-degraded'
  | 'settlement-failed';

export interface BotOperationsView {
  botId: string;
  name: string;
  state: BotOperationsState;
  lifecycleChangedAt: string;
  executionBlockedAt: string | null;
  executionBlockReasonCode: string | null;
  lastEventSequence: number;
  instruments: Array<{ instrumentId: string; symbol: string }>;
}

export interface BotJudgmentLogEntry {
  eventId: string;
  sequence: number;
  eventType: string;
  occurredAt: string;
  summary: Record<string, unknown>;
}

export interface BotJudgmentLogPage {
  entries: BotJudgmentLogEntry[];
  nextAfterSequence: number;
  hasMore: boolean;
}

export interface BotExecutionPreflight {
  botId: string;
  ready: boolean;
  issues: Array<{ code: string; detail: string }>;
}

export interface BotContinuation {
  botId: string;
  dueAt: string;
  renewalAvailableFrom: string;
  lastRenewedAt: string | null;
  renewalAllowed: boolean;
}

export interface BotOperationsClient {
  listOperations(signal?: AbortSignal): Promise<BotOperationsView[]>;
  listJudgments(
    botId: string,
    afterSequence: number,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<BotJudgmentLogPage>;
  runBot(botId: string, signal?: AbortSignal): Promise<void>;
  stopBot(botId: string, reasonCode: string, signal?: AbortSignal): Promise<void>;
  deleteBot?(botId: string, signal?: AbortSignal): Promise<void>;
  getPreflight?(botId: string, signal?: AbortSignal): Promise<BotExecutionPreflight>;
  getContinuation?(botId: string, signal?: AbortSignal): Promise<BotContinuation>;
  renewContinuation?(botId: string, signal?: AbortSignal): Promise<BotContinuation>;
}

interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null;
}

const STATES = new Set<BotOperationsState>([
  'waiting',
  'running',
  'action-required',
  'stopping',
  'stopped',
  'data-degraded',
  'settlement-failed',
]);

export function createBotOperationsClient({
  baseUrl = '',
  fetchImpl = fetch,
  getAccessToken = getSessionAccessToken,
}: ClientOptions = {}): BotOperationsClient {
  const root = baseUrl.replace(/\/$/, '');

  const requestResponse = async (
    path: string,
    signal?: AbortSignal,
    init: RequestInit = {},
  ): Promise<Response> => {
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
      throw new BotOperationsApiError(response.status);
    }
    return response;
  };
  const request = async (path: string, signal?: AbortSignal, init: RequestInit = {}): Promise<unknown> => (
    (await requestResponse(path, signal, init)).json()
  );

  return {
    async listOperations(signal) {
      const payload = await request('/api/v1/bots/operations', signal);
      if (!Array.isArray(payload)) {
        throw new Error('Invalid bot operations response');
      }
      return payload.map(readBotOperationsView);
    },

    async listJudgments(botId, afterSequence, limit = 50, signal) {
      const query = new URLSearchParams({
        afterSequence: String(afterSequence),
        limit: String(limit),
      });
      const payload = await request(
        `/api/v1/bots/${encodeURIComponent(botId)}/judgments?${query.toString()}`,
        signal,
      );
      return readJudgmentPage(payload);
    },

    async runBot(botId, signal) {
      await request(`/api/v1/bots/${encodeURIComponent(botId)}/run`, signal, {
        method: 'POST',
      });
    },

    async stopBot(botId, reasonCode, signal) {
      await request(`/api/v1/bots/${encodeURIComponent(botId)}/stop`, signal, {
        method: 'POST',
        body: JSON.stringify({ reasonCode }),
      });
    },

    async deleteBot(botId, signal) {
      await requestResponse(`/api/v1/bots/${encodeURIComponent(botId)}`, signal, {
        method: 'DELETE',
      });
    },

    async getPreflight(botId, signal) {
      return readPreflight(await request(
        `/api/v1/bots/${encodeURIComponent(botId)}/preflight`, signal,
      ));
    },

    async getContinuation(botId, signal) {
      return readContinuation(await request(
        `/api/v1/bots/${encodeURIComponent(botId)}/continuation`, signal,
      ));
    },

    async renewContinuation(botId, signal) {
      return readContinuation(await request(
        `/api/v1/bots/${encodeURIComponent(botId)}/continuation/renew`, signal, { method: 'POST' },
      ));
    },
  };
}

function readPreflight(value: unknown): BotExecutionPreflight {
  const report = object(value, 'Invalid bot preflight response');
  if (!Array.isArray(report.issues)) throw new Error('Invalid bot preflight issues');
  return {
    botId: string(report.botId, 'botId'),
    ready: boolean(report.ready, 'ready'),
    issues: report.issues.map((value) => {
      const issue = object(value, 'Invalid bot preflight issue');
      return { code: string(issue.code, 'code'), detail: string(issue.detail, 'detail') };
    }),
  };
}

function readContinuation(value: unknown): BotContinuation {
  const continuation = object(value, 'Invalid bot continuation response');
  return {
    botId: string(continuation.botId, 'botId'),
    dueAt: string(continuation.dueAt, 'dueAt'),
    renewalAvailableFrom: string(continuation.renewalAvailableFrom, 'renewalAvailableFrom'),
    lastRenewedAt: nullableString(continuation.lastRenewedAt, 'lastRenewedAt'),
    renewalAllowed: boolean(continuation.renewalAllowed, 'renewalAllowed'),
  };
}

function readBotOperationsView(value: unknown): BotOperationsView {
  const item = object(value, 'Invalid bot operations item');
  const state = string(item.state, 'state');
  if (!STATES.has(state as BotOperationsState)) {
    throw new Error(`Unsupported bot operations state: ${state}`);
  }
  return {
    botId: string(item.botId, 'botId'),
    name: string(item.name, 'name'),
    state: state as BotOperationsState,
    lifecycleChangedAt: string(item.lifecycleChangedAt, 'lifecycleChangedAt'),
    executionBlockedAt: nullableString(item.executionBlockedAt, 'executionBlockedAt'),
    executionBlockReasonCode: nullableString(item.executionBlockReasonCode, 'executionBlockReasonCode'),
    lastEventSequence: nonNegativeInteger(item.lastEventSequence, 'lastEventSequence'),
    instruments: Array.isArray(item.instruments) ? item.instruments.map((value) => {
      const instrument = object(value, 'Invalid bot operations instrument');
      return {
        instrumentId: string(instrument.instrumentId, 'instrumentId'),
        symbol: string(instrument.symbol, 'symbol'),
      };
    }) : [],
  };
}

function readJudgmentPage(value: unknown): BotJudgmentLogPage {
  const page = object(value, 'Invalid judgment log response');
  if (!Array.isArray(page.entries)) {
    throw new Error('Invalid judgment log entries');
  }
  return {
    entries: page.entries.map((entry) => {
      const item = object(entry, 'Invalid judgment log entry');
      return {
        eventId: string(item.eventId, 'eventId'),
        sequence: positiveInteger(item.sequence, 'sequence'),
        eventType: string(item.eventType, 'eventType'),
        occurredAt: string(item.occurredAt, 'occurredAt'),
        summary: object(item.summary, 'summary'),
      };
    }),
    nextAfterSequence: nonNegativeInteger(page.nextAfterSequence, 'nextAfterSequence'),
    hasMore: boolean(page.hasMore, 'hasMore'),
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

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = nonNegativeInteger(value, label);
  if (parsed === 0) {
    throw new Error(`Invalid ${label}`);
  }
  return parsed;
}

export const defaultBotOperationsClient = createBotOperationsClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
});
