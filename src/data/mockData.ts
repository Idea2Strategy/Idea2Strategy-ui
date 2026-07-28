export interface StrategySummary {
  name: string;
  mode: 'Basic' | 'Pro';
  state: string;
  updated: string;
  blocks: number;
  backtest: string;
}

export interface BotSummary {
  name: string;
  state: string;
  capital: string;
  change: string;
  strategies: number;
  room: string;
  labels: string[];
  startDaysAgo: number;
  startedAt: string;
}

export interface NotificationItem {
  id: string;
  kind: string;
  severity: 'action' | 'info' | 'success';
  target?: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  bot: string;
  score: number;
  return: number;
  drawdown: number;
  sharpe: number;
  volatility: number;
  winRate: number;
  trades: number;
  mine: boolean;
}

export const strategies: StrategySummary[] = [
  { name: 'Opening Range Flow', mode: 'Basic', state: '출시 가능', updated: '07.23 09:41 ET', blocks: 7, backtest: '가능' },
  { name: 'Pair Spread Monitor', mode: 'Pro', state: '미완성', updated: '07.22 15:18 ET', blocks: 14, backtest: '가능' },
  { name: 'Volume Regime Draft', mode: 'Pro', state: '미완성', updated: '07.21 11:05 ET', blocks: 11, backtest: '데이터 확인' },
];

export const templates = [
  { type: '매수', name: 'RSI 하향 기준', detail: 'RSI · 하향 · 매수', fields: 3 },
  { type: '매도', name: '이동평균 하향 교차', detail: 'MA · 교차 · 매도', fields: 4 },
  { type: 'Pro', name: 'Pair spread structure', detail: '병렬 · 스프레드 · 균형', fields: 9 },
];

/*
  `labels` group bots for aggregate selection (a person can run up to ten).
  `startDaysAgo` is the bot's launch date relative to the sample end date —
  bots launched inside a chart window enter the aggregate as a capital-inflow
  step, never as fake performance.
*/
export const bots: BotSummary[] = [
  { name: 'Atlas 07', state: '실행 중', capital: '$10,540.00', change: '+5.40%', strategies: 2, room: '개인 봇', labels: ['개인'], startDaysAgo: 380, startedAt: '2025.07.08 09:30 ET' },
  { name: 'Room Beta', state: '평가 중', capital: '$10,490.00', change: '+4.90%', strategies: 1, room: 'Momentum Lab', labels: ['대회'], startDaysAgo: 45, startedAt: '2026.06.08 09:30 ET' },
  /* A budget-cap deferral is part of normal operation — the bot retries on the
     next evaluation — so it is not an attention state. */
  { name: 'Pair Lab', state: '실행 중', capital: '$9,790.00', change: '-2.10%', strategies: 2, room: '개인 봇', labels: ['개인', '페어'], startDaysAgo: 18, startedAt: '2026.07.05 09:30 ET' },
];

export const positions = [
  { symbol: 'AAPL', qty: '18', avg: '$214.08', price: '$216.42', pnl: '+$42.12', share: '15.6%' },
  { symbol: 'MSFT', qty: '9', avg: '$492.30', price: '$497.18', pnl: '+$43.92', share: '18.0%' },
  { symbol: 'SPY', qty: '12', avg: '$632.14', price: '$634.06', pnl: '+$23.04', share: '30.6%' },
];

export const equitySeries = [10000, 10042, 10018, 10096, 10120, 10088, 10164, 10148, 10211, 10192, 10248, 10276, 10312, 10296, 10358];
export const botSeries = [24000, 24120, 24078, 24260, 24318, 24492, 24370, 24630, 24780, 24892];

export const trades = [
  { time: '07.18 10:14', symbol: 'SPY', side: '매수', order: '$1,480.20', fill: '$1,482.08', fee: '$2.96', result: '체결' },
  { time: '07.17 14:42', symbol: 'MSFT', side: '매도', order: '$2,965.44', fill: '$2,961.20', fee: '$5.92', result: '부분 체결' },
  { time: '07.15 09:48', symbol: 'AAPL', side: '매수', order: '$2,140.80', fill: '$2,143.12', fee: '$4.28', result: '체결' },
  { time: '07.11 11:03', symbol: 'QQQ', side: '매수', order: '$1,880.00', fill: '—', fee: '—', result: '거절' },
];

export const rooms = [
  { name: 'Momentum Lab', phase: '평가 중', bots: '8 / 10', remaining: '12일 04시간', score: '복합 점수 v2', privacy: '공개' },
  { name: 'ETF Discipline', phase: '제출 중', bots: '5 / 10', remaining: '3일 18시간', score: '최대 낙폭', privacy: '공개' },
  { name: 'Quant Study 04', phase: '모집 중', bots: '3 / 8', remaining: '6일 09시간', score: '수익률', privacy: '비밀' },
];

/*
  Competition entries carry every comparable metric so the ranking can be sorted
  by whichever one the person cares about, rather than presenting a single
  composite score as the one true answer.
*/
export const leaderboard: LeaderboardEntry[] = [
  { rank: 1, bot: 'Bot 3F9A', score: 82.41, return: 4.18, drawdown: -1.08, sharpe: 1.94, volatility: 8.4, winRate: 61.2, trades: 48, mine: false },
  { rank: 2, bot: 'Room Beta', score: 80.92, return: 3.84, drawdown: -0.94, sharpe: 2.08, volatility: 7.1, winRate: 58.7, trades: 31, mine: true },
  { rank: 3, bot: 'Bot 8C21', score: 78.07, return: 3.58, drawdown: -1.44, sharpe: 1.62, volatility: 9.8, winRate: 55.4, trades: 62, mine: false },
  { rank: 4, bot: 'Bot 11D0', score: 74.36, return: 2.96, drawdown: -1.12, sharpe: 1.71, volatility: 8.9, winRate: 52.1, trades: 27, mine: false },
];

/*
  `severity` drives the shape and icon of a notification, not just its colour, so
  the list stays readable without relying on hue. `target` is the product page a
  notification leads to; entries with no useful destination omit it and render
  without a navigation affordance.
*/
/*
  Action severity is reserved for user-actionable, time-bound items (the
  renewal deadline). Routine engine events — budget-cap deferrals, data
  checks — are info: the bot handles them itself on the next evaluation.
*/
export const notifications: NotificationItem[] = [
  { id: 'n-0', kind: '조치 필요', severity: 'action', target: 'home', title: 'Atlas 07 계속 실행 확인', detail: '무소속 봇은 기한 전에 연장해야 계속 실행됩니다 · 08.10까지 (D-18)', time: '오늘', unread: true },
  { id: 'n-1', kind: '데이터', severity: 'info', target: 'bots', title: 'Pair Lab 데이터 확인', detail: '새 주문 평가를 보류하고 기존 상태를 유지합니다. 다음 평가에서 재시도합니다.', time: '4분 전', unread: true },
  { id: 'n-2', kind: '체결', severity: 'success', target: 'bots', title: 'Atlas 07 · SPY 전량 체결', detail: '12주 · 평균 $634.06 · 수수료 $15.22', time: '18분 전', unread: false },
  { id: 'n-3', kind: '대회', severity: 'info', target: 'rooms', title: 'Momentum Lab 평가 12일 남음', detail: '평가 종료 시점에 공식 결과가 확정됩니다.', time: '1시간 전', unread: false },
  { id: 'n-4', kind: '백테스트', severity: 'success', target: 'backtest', title: 'Opening Range Flow 완료', detail: '2023 Q3–2026 Q2 공식 구간 처리가 완료되었습니다.', time: '어제', unread: false },
  { id: 'n-6', kind: '데이터', severity: 'info', title: '시장 데이터 지연 복구', detail: '09:12 ET부터 12분간 지연된 시세가 정상 수집으로 돌아왔습니다.', time: '2일 전', unread: false },
];

export const monthlyFailures = [
  { label: '거래량 기준 미충족', value: 184 },
  { label: '포지션 보유 조건', value: 96 },
  { label: 'RSI 기준 미충족', value: 244 },
  { label: '예산 상한 도달', value: 31 },
];

export const ticker: Array<[string, string, string]> = [
  ['S&P 500', '6,377.82', '+0.41%'],
  ['NASDAQ', '21,028.14', '+0.63%'],
  ['VIX', '15.26', '-2.18%'],
  ['MARKET', 'OPEN', '03:42:18'],
];
