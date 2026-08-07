import { getSessionAccessToken } from './sessionAccessToken';

export class DashboardApiError extends Error {
  constructor(public readonly status: number) {
    super(`Dashboard request failed (${status})`);
    this.name = 'DashboardApiError';
  }

  get unauthenticated(): boolean {
    return this.status === 401;
  }
}

export type DashboardBotState =
  | 'waiting'
  | 'running'
  | 'action-required'
  | 'stopping'
  | 'stopped'
  | 'data-degraded'
  | 'settlement-failed';

export interface DashboardPerformance {
  equityAmount: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number | null;
  calculationRulesVersion: string;
  updatedAt: string;
}

export interface DashboardCompetition {
  roomId: string;
  roomName: string;
  roomStatus: string;
  participationStatus: string;
  evaluationEndsAt: string;
  timezoneName: string;
}

export interface DashboardBot {
  botId: string;
  name: string;
  state: DashboardBotState;
  lifecycleChangedAt: string;
  performance: DashboardPerformance | null;
  competition: DashboardCompetition | null;
}

export interface DashboardSnapshot {
  generatedAt: string;
  bots: DashboardBot[];
}

export interface DashboardClient {
  getSnapshot(signal?: AbortSignal): Promise<DashboardSnapshot>;
}

interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null;
}

const STATES = new Set<DashboardBotState>([
  'waiting',
  'running',
  'action-required',
  'stopping',
  'stopped',
  'data-degraded',
  'settlement-failed',
]);

export function createDashboardClient({
  baseUrl = '',
  fetchImpl = fetch,
  getAccessToken = getSessionAccessToken,
}: ClientOptions = {}): DashboardClient {
  const root = baseUrl.replace(/\/$/, '');
  return {
    async getSnapshot(signal) {
      const token = getAccessToken?.();
      const response = await fetchImpl(`${root}/api/v1/dashboard`, {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal,
      });
      if (!response.ok) {
        throw new DashboardApiError(response.status);
      }
      return readSnapshot(await response.json());
    },
  };
}

function readSnapshot(value: unknown): DashboardSnapshot {
  const snapshot = object(value, 'Invalid dashboard response');
  if (!Array.isArray(snapshot.bots)) {
    throw new Error('Invalid dashboard bots');
  }
  return {
    generatedAt: string(snapshot.generatedAt, 'generatedAt'),
    bots: snapshot.bots.map(readBot),
  };
}

function readBot(value: unknown): DashboardBot {
  const bot = object(value, 'Invalid dashboard bot');
  const state = string(bot.state, 'state');
  if (!STATES.has(state as DashboardBotState)) {
    throw new Error(`Unsupported dashboard bot state: ${state}`);
  }
  return {
    botId: string(bot.botId, 'botId'),
    name: string(bot.name, 'name'),
    state: state as DashboardBotState,
    lifecycleChangedAt: string(bot.lifecycleChangedAt, 'lifecycleChangedAt'),
    performance: bot.performance === null ? null : readPerformance(bot.performance),
    competition: bot.competition === null ? null : readCompetition(bot.competition),
  };
}

function readPerformance(value: unknown): DashboardPerformance {
  const performance = object(value, 'Invalid dashboard performance');
  return {
    equityAmount: finiteNumber(performance.equityAmount, 'equityAmount'),
    totalReturnPct: finiteNumber(performance.totalReturnPct, 'totalReturnPct'),
    maxDrawdownPct: finiteNumber(performance.maxDrawdownPct, 'maxDrawdownPct'),
    sharpeRatio: performance.sharpeRatio === null
      ? null
      : finiteNumber(performance.sharpeRatio, 'sharpeRatio'),
    calculationRulesVersion: string(performance.calculationRulesVersion, 'calculationRulesVersion'),
    updatedAt: string(performance.updatedAt, 'updatedAt'),
  };
}

function readCompetition(value: unknown): DashboardCompetition {
  const competition = object(value, 'Invalid dashboard competition');
  return {
    roomId: string(competition.roomId, 'roomId'),
    roomName: string(competition.roomName, 'roomName'),
    roomStatus: string(competition.roomStatus, 'roomStatus'),
    participationStatus: string(competition.participationStatus, 'participationStatus'),
    evaluationEndsAt: string(competition.evaluationEndsAt, 'evaluationEndsAt'),
    timezoneName: string(competition.timezoneName, 'timezoneName'),
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

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export const defaultDashboardClient = createDashboardClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
});
