import type { Bot } from './types';

export type BacktestStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BacktestConfig = {
  strategyVersion: string;
  periodMode: 'official' | 'custom';
  start: string;
  end: string;
  initialCapital: string;
  fee: string;
  slippage: string;
  benchmark: string;
  marketHours: string;
  split: boolean;
  splitDate: string;
  corporateActions: boolean;
  dividends: boolean;
  shortAvailability: boolean;
  missingDataPolicy: string;
};

export type BacktestMetrics = {
  cumulativeReturn: string;
  maxDrawdown: string;
  volatility: string;
  sharpe: string;
  winRate: string;
  tradeCount: string;
};

export type BacktestRun = {
  id: string;
  botId: number;
  botName: string;
  status: BacktestStatus;
  createdAt: string;
  updatedAt: string;
  progress: number;
  stage: string;
  config: BacktestConfig;
  metrics?: BacktestMetrics;
  failureReason?: string;
};

const backtestStorageKey = 'i2s-backtest-runs-v1';

function defaultConfig(version: string): BacktestConfig {
  return {
    strategyVersion: version,
    periodMode: 'official',
    start: '2024-01-02',
    end: '2025-12-31',
    initialCapital: '100000',
    fee: '1',
    slippage: '2',
    benchmark: '사용자 지정 시장 지수',
    marketHours: '정규장만',
    split: true,
    splitDate: '2025-01-02',
    corporateActions: true,
    dividends: true,
    shortAvailability: false,
    missingDataPolicy: '해당 시점 주문 건너뛰기',
  };
}

function seedRuns(bot: Bot): BacktestRun[] {
  const now = Date.now();
  const completedConfig = defaultConfig(bot.version);
  return [
    {
      id: `seed-completed-${bot.id}`,
      botId: bot.id,
      botName: bot.name,
      status: 'completed',
      createdAt: new Date(now - 86400000).toISOString(),
      updatedAt: new Date(now - 86400000 + 180000).toISOString(),
      progress: 100,
      stage: '결과 계산 완료',
      config: completedConfig,
      metrics: {
        cumulativeReturn: '+4.2%',
        maxDrawdown: '-6.8%',
        volatility: '12.4%',
        sharpe: '0.61',
        winRate: '55.6%',
        tradeCount: '18건',
      },
    },
    {
      id: `seed-failed-${bot.id}`,
      botId: bot.id,
      botName: bot.name,
      status: 'failed',
      createdAt: new Date(now - 3 * 86400000).toISOString(),
      updatedAt: new Date(now - 3 * 86400000 + 35000).toISOString(),
      progress: 28,
      stage: '입력 데이터 확인',
      config: {
        ...completedConfig,
        periodMode: 'custom',
        start: '2025-01-02',
        end: '2025-06-30',
        split: false,
        splitDate: '',
      },
      failureReason: '선택 기간의 일부 종목에서 가격 데이터가 연속적으로 누락됐습니다.',
    },
    {
      id: `seed-cancelled-${bot.id}`,
      botId: bot.id,
      botName: bot.name,
      status: 'cancelled',
      createdAt: new Date(now - 7 * 86400000).toISOString(),
      updatedAt: new Date(now - 7 * 86400000 + 52000).toISOString(),
      progress: 46,
      stage: '사용자 취소',
      config: {
        ...completedConfig,
        split: false,
        splitDate: '',
      },
    },
  ];
}

function readAllRuns(): BacktestRun[] {
  try {
    const stored = window.localStorage.getItem(backtestStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed as BacktestRun[] : [];
  } catch {
    return [];
  }
}

function writeAllRuns(runs: BacktestRun[]) {
  window.localStorage.setItem(backtestStorageKey, JSON.stringify(runs));
}

export function loadBacktestRuns(bot: Bot): BacktestRun[] {
  const allRuns = readAllRuns();
  const runs = allRuns.filter((run) => run.botId === bot.id);
  if (runs.length) {
    return runs.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
  if (bot.strategyId) return [];
  const seeds = seedRuns(bot);
  writeAllRuns([...seeds, ...allRuns]);
  return seeds;
}

export function saveBacktestRuns(botId: number, runs: BacktestRun[]) {
  const otherRuns = readAllRuns().filter((run) => run.botId !== botId);
  writeAllRuns([...runs, ...otherRuns]);
}

export function deleteBacktestRuns(botId: number) {
  writeAllRuns(readAllRuns().filter((run) => run.botId !== botId));
}

export function createBacktestRun(bot: Bot, config: BacktestConfig): BacktestRun {
  const now = new Date().toISOString();
  return {
    id: `backtest-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    botId: bot.id,
    botName: bot.name,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    progress: 4,
    stage: '실행 대기열 등록',
    config,
  };
}

export const completedMetrics: BacktestMetrics = {
  cumulativeReturn: '+3.7%',
  maxDrawdown: '-5.9%',
  volatility: '11.8%',
  sharpe: '0.58',
  winRate: '53.1%',
  tradeCount: '32건',
};

export function formatBacktestTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
