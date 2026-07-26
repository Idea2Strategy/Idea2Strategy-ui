import { useState } from 'react';
import type { ReactNode } from 'react';
import { Bot, Coins, MessageSquareText, Plus, RefreshCw, Search } from 'lucide-react';
import { Button, DataTable, EmptyState, PageHeading, Status, TabPanel, Tabs } from '../components/common.jsx';
import { EquityChart } from '../components/EquityChart';
import { dateLabels, money, percent, signedMoney, walkSeries } from '../lib/equitySim';
import { bots } from '../data/mockData.js';
import { Localized } from '../lib/i18n.jsx';

/* ---------- Types ----------------------------------------------------------- */

type FilterId = 'all' | 'running' | 'evaluating' | 'attention';
type TabId = 'overview' | 'positions' | 'decisions' | 'strategy';
type StepTone = 'universe' | 'data' | 'indicator' | 'condition' | 'risk' | 'order' | 'portfolio';
type LogScope = 'fills' | 'all';
type LogPeriod = 'all' | 'today' | 'week' | 'month';

interface BotRecord {
  name: string;
  state: string;
  capital: string;
  change: string;
  strategies: number;
  room: string;
  labels: string[];
  startDaysAgo: number;
}

interface Position {
  symbol: string;
  qty: string;
  avg: string;
  price: string;
  pnl: string;
  rate: string;
  /* Numeric share of equity, for the composition bar. */
  shareValue: number;
  share: string;
}

/*
  The decision log is the single timeline: fills are the decisions that
  produced orders (attributed to the partition whose strategy created them),
  and notes are everything else — checks passed, deferrals, unmet conditions.
*/
type LogEvent =
  | { kind: 'fill'; time: string; side: '매수' | '매도'; symbol: string; quantity: string; price: string; partition: string; rule: string }
  | { kind: 'note'; tone: 'positive' | 'neutral' | 'muted'; time: string; title: string; detail: string };

interface SnapshotBlock {
  tone: StepTone;
  name: string;
  value: string;
}

/* One Basic partition: a symbol, its allocation, and its buy/sell groups.
   `plainBuy`/`plainSell` are the same rules in one plain-language sentence. */
interface SnapshotPartition {
  name: string;
  symbol: string;
  allocation: string;
  buy: SnapshotBlock[];
  sell: SnapshotBlock[];
  plainBuy: string;
  plainSell: string;
}

interface SnapshotStep extends SnapshotBlock {
  category: string;
  note?: string;
}

/*
  Launching severs the link to the source strategy entirely — whether the
  source was later edited or deleted is not a concept the bot knows about, so
  the snapshot carries no "source state".
*/
type StrategySnapshot = {
  version: string;
  takenAt: string;
  plain: string;
} & (
  | { mode: 'Basic'; partitions: SnapshotPartition[] }
  | { mode: 'Pro'; steps: SnapshotStep[] }
);

interface BotDetail {
  strategy: string;
  monthReturn: number;
  dailyVol: number;
  cash: string;
  cashShare: number;
  invested: string;
  positions: Position[];
  events: LogEvent[];
  snapshot: StrategySnapshot;
}

const botList = bots as BotRecord[];

/* ---------- Data ------------------------------------------------------------ */

const SAMPLE_END_DATE = Date.UTC(2026, 6, 23);
const CAPITALS: Record<string, number> = { 'Atlas 07': 24892.40, 'Room Beta': 10184.12, 'Pair Lab': 18940.08 };

/*
  Per-bot operating detail. Selecting a bot drives every panel — a chart that
  ignores the row the person just read is worse than no chart. The equity curve
  is the same seeded simulation the Home aggregate uses, so the two pages agree.
*/
const botDetails: Record<string, BotDetail> = {
  'Atlas 07': {
    strategy: 'Opening Range Flow · v4',
    monthReturn: .054,
    dailyVol: .011,
    cash: '$6,214.08',
    cashShare: 35.8,
    invested: '$18,678.32',
    positions: [
      { symbol: 'AAPL', qty: '18', avg: '$214.08', price: '$216.42', pnl: '+$42.12', rate: '+1.09%', shareValue: 15.6, share: '15.6%' },
      { symbol: 'MSFT', qty: '9', avg: '$492.30', price: '$497.18', pnl: '+$43.92', rate: '+0.99%', shareValue: 18.0, share: '18.0%' },
      { symbol: 'SPY', qty: '12', avg: '$632.14', price: '$634.06', pnl: '+$23.04', rate: '+0.30%', shareValue: 30.6, share: '30.6%' },
    ],
    events: [
      { kind: 'fill', time: '07.23 10:14 ET', side: '매수', symbol: 'SPY', quantity: '12주', price: '$634.06', partition: 'SECTION 01 · SPY', rule: '1분봉 · RSI 30 미만 → 예산 25% 시장가 매수' },
      { kind: 'note', tone: 'neutral', time: '07.23 10:14 ET', title: '예산 상한 검사 통과', detail: '요청 $7,608 · 한도 $8,000' },
      { kind: 'note', tone: 'muted', time: '07.23 10:13 ET', title: 'AAPL 조건 미충족 · 주문 없음', detail: '최초 실패 조건 RSI(14) 34.2 · 기준 30 미만' },
      { kind: 'fill', time: '07.22 14:02 ET', side: '매도', symbol: 'AAPL', quantity: '6주', price: '$215.88', partition: 'SECTION 02 · AAPL', rule: '포지션 보유 중 · RSI 70 초과 → 보유 50% 매도' },
      { kind: 'fill', time: '07.21 09:47 ET', side: '매수', symbol: 'MSFT', quantity: '9주', price: '$492.30', partition: 'SECTION 03 · MSFT', rule: 'MACD 시그널 상향 교차 → 예산 20% 시장가 매수' },
    ],
    snapshot: {
      mode: 'Basic',
      version: 'v4',
      takenAt: '2026.06.08 09:30 ET',
      plain: '파티션 3개가 SPY · AAPL · MSFT를 각각 독립적으로 평가합니다.',
      partitions: [
        {
          name: 'SECTION 01',
          symbol: 'SPY',
          allocation: '40%',
          buy: [
            { tone: 'data', name: '가격 데이터', value: '1분봉' },
            { tone: 'indicator', name: 'RSI', value: '기간 14' },
            { tone: 'condition', name: '매수 조건', value: 'RSI 30 미만' },
            { tone: 'order', name: '매수 주문', value: '전략 예산의 25% · 시장가' },
          ],
          sell: [
            { tone: 'condition', name: '매도 조건', value: 'RSI 70 초과 · 포지션 보유 중' },
            { tone: 'order', name: '매도 주문', value: '보유 수량 100% · 시장가' },
          ],
          plainBuy: '1분봉에서 RSI(14)가 30 미만으로 내려가면 전략 예산의 25%를 시장가로 매수합니다.',
          plainSell: '포지션 보유 중 RSI(14)가 70을 넘으면 보유 수량 전체를 시장가로 매도합니다.',
        },
        {
          name: 'SECTION 02',
          symbol: 'AAPL',
          allocation: '30%',
          buy: [
            { tone: 'data', name: '가격 데이터', value: '1분봉' },
            { tone: 'indicator', name: 'RSI', value: '기간 14' },
            { tone: 'condition', name: '매수 조건', value: 'RSI 30 미만' },
            { tone: 'order', name: '매수 주문', value: '전략 예산의 25% · 시장가' },
          ],
          sell: [
            { tone: 'condition', name: '매도 조건', value: 'RSI 70 초과 · 포지션 보유 중' },
            { tone: 'order', name: '매도 주문', value: '보유 수량 50% · 시장가' },
          ],
          plainBuy: '1분봉에서 RSI(14)가 30 미만으로 내려가면 전략 예산의 25%를 시장가로 매수합니다.',
          plainSell: '포지션 보유 중 RSI(14)가 70을 넘으면 보유 수량의 50%를 시장가로 매도합니다.',
        },
        {
          name: 'SECTION 03',
          symbol: 'MSFT',
          allocation: '30%',
          buy: [
            { tone: 'data', name: '가격 데이터', value: '1분봉' },
            { tone: 'indicator', name: 'MACD', value: '12 · 26 · 9' },
            { tone: 'condition', name: '매수 조건', value: '시그널 상향 교차' },
            { tone: 'order', name: '매수 주문', value: '전략 예산의 20% · 시장가' },
          ],
          sell: [
            { tone: 'condition', name: '매도 조건', value: '시그널 하향 교차 · 포지션 보유 중' },
            { tone: 'order', name: '매도 주문', value: '보유 수량 100% · 시장가' },
          ],
          plainBuy: 'MACD(12·26·9) 시그널이 상향 교차하면 전략 예산의 20%를 시장가로 매수합니다.',
          plainSell: '포지션 보유 중 시그널이 하향 교차하면 보유 수량 전체를 시장가로 매도합니다.',
        },
      ],
    },
  },
  'Room Beta': {
    strategy: 'Momentum Rotation · v2',
    monthReturn: .049,
    dailyVol: .009,
    cash: '$2,940.16',
    cashShare: 54.2,
    invested: '$7,243.96',
    positions: [
      { symbol: 'NVDA', qty: '24', avg: '$118.40', price: '$121.06', pnl: '+$63.84', rate: '+2.25%', shareValue: 28.4, share: '28.4%' },
      { symbol: 'MSFT', qty: '4', avg: '$441.60', price: '$444.20', pnl: '+$10.40', rate: '+0.59%', shareValue: 17.4, share: '17.4%' },
    ],
    events: [
      { kind: 'note', tone: 'neutral', time: '07.23 09:30 ET', title: '대회 평가 구간 진행 중', detail: 'Momentum Lab · 12일 남음' },
      { kind: 'fill', time: '07.23 09:41 ET', side: '매수', symbol: 'NVDA', quantity: '24주', price: '$118.40', partition: '그래프 · 리밸런싱', rule: '모멘텀 상위 2종목 → 목표 비중 50% 매수' },
      { kind: 'note', tone: 'muted', time: '07.23 09:40 ET', title: 'TSLA 조건 미충족 · 주문 없음', detail: '최초 실패 조건 변동성 기준' },
      { kind: 'fill', time: '07.16 09:35 ET', side: '매도', symbol: 'TSLA', quantity: '6주', price: '$249.12', partition: '그래프 · 리밸런싱', rule: '모멘텀 순위 이탈 → 전량 매도' },
    ],
    snapshot: {
      mode: 'Pro',
      version: 'v2',
      takenAt: '2026.06.11 09:30 ET',
      plain: '매일 모멘텀 순위를 계산해 상위 2종목을 각각 50% 목표 비중으로 리밸런싱하고, 순위에서 벗어난 종목은 전량 매도합니다.',
      steps: [
        { tone: 'universe', category: '유니버스', name: '직접 선택 바스켓', value: 'NVDA · MSFT · TSLA' },
        { tone: 'data', category: '시장 데이터', name: '가격·거래량', value: '1일봉 · 최대 지연 1일' },
        { tone: 'indicator', category: '지표', name: '모멘텀 순위', value: '기간 20일' },
        { tone: 'condition', category: '조건', name: '상위 순위 여부', value: '상위 2종목', note: '분기 · 참/거짓 2갈래' },
        { tone: 'portfolio', category: '포트폴리오', name: '목표 비중', value: '상위 2종목 50% · 50%', note: '합류 · 두 갈래 재결합' },
        { tone: 'order', category: '주문 실행', name: '리밸런싱 주문', value: '시장가' },
      ],
    },
  },
  'Pair Lab': {
    strategy: 'Pair Spread Monitor · v1',
    monthReturn: -.021,
    dailyVol: .005,
    cash: '$18,940.08',
    cashShare: 100,
    invested: '$0.00',
    positions: [],
    events: [
      /* A budget-cap deferral is normal flow: the bot retries on the next
         evaluation. It is recorded, not escalated. */
      { kind: 'note', tone: 'muted', time: '07.23 10:02 ET', title: 'KO·PEP 페어 주문 보류', detail: '예산 상한 $18,000 초과 · 다음 평가에서 재시도' },
      { kind: 'note', tone: 'muted', time: '07.23 10:01 ET', title: 'PEP 조건 미충족 · 주문 없음', detail: '최초 실패 조건 스프레드 기준' },
      { kind: 'fill', time: '07.14 11:20 ET', side: '매도', symbol: 'KO', quantity: '24주', price: '$63.88', partition: '그래프 · 페어 청산', rule: '|z| 0.5 미만 복귀 → 양방향 청산' },
      { kind: 'fill', time: '07.09 10:05 ET', side: '매수', symbol: 'KO', quantity: '24주', price: '$63.12', partition: '그래프 · 페어 진입', rule: '|z| 2 초과 → 저평가 종목 매수' },
    ],
    snapshot: {
      mode: 'Pro',
      version: 'v1',
      takenAt: '2026.07.05 09:30 ET',
      plain: 'KO·PEP 스프레드의 z-점수가 2를 넘으면 저평가 종목을 매수하고, 0.5 미만으로 복귀하면 양방향을 청산합니다.',
      steps: [
        { tone: 'universe', category: '유니버스', name: '페어 바스켓', value: 'KO · PEP' },
        { tone: 'data', category: '시장 데이터', name: '가격 데이터', value: '1시간봉' },
        { tone: 'indicator', category: '지표', name: '스프레드 z-점수', value: '기간 30' },
        { tone: 'condition', category: '조건', name: '스프레드 이탈', value: '|z| 2 초과', note: '분기 · 방향별 2갈래' },
        { tone: 'risk', category: '위험관리', name: '예산 상한', value: '$18,000' },
        { tone: 'order', category: '주문 실행', name: '페어 주문', value: '양방향 · 시장가' },
      ],
    },
  },
};

/* Theme-aware categorical tones for the composition bar segments. */
const COMPOSITION_TONES = ['var(--tone-data)', 'var(--tone-indicator)', 'var(--tone-universe)', 'var(--tone-return)', 'var(--tone-sharpe)'];

/*
  Bot personas: an emoji the person picks to say how the bot behaves. It rides
  in the exact tile the generic robot icon used, so the list layout does not
  change — only the glyph does.
*/
const BOT_PERSONAS: Array<{ emoji: string; label: string }> = [
  { emoji: '🎯', label: '집중' },
  { emoji: '🔥', label: '공격적' },
  { emoji: '⚖️', label: '균형' },
  { emoji: '🛡️', label: '방어적' },
  { emoji: '🌊', label: '릴렉스' },
  { emoji: '🚀', label: '고성장' },
];
const DEFAULT_EMOJI: Record<string, string> = { 'Atlas 07': '🎯', 'Room Beta': '🔥', 'Pair Lab': '🌊' };

/*
  Decision-log filters. The default shows fills only — the log's day-to-day
  question is "뭘 사고팔았지"; engine records (unmet conditions, deferrals,
  passed checks) appear when the person opts into the full record.
*/
const LOG_PERIODS: Array<{ id: LogPeriod; label: string }> = [
  { id: 'all', label: '전체 기간' },
  { id: 'today', label: '오늘' },
  { id: 'week', label: '최근 1주' },
  { id: 'month', label: '최근 1개월' },
];
const PERIOD_DAYS: Record<LogPeriod, number> = { all: Number.POSITIVE_INFINITY, today: 0, week: 7, month: 30 };

/* Event times are 'MM.DD HH:MM ET' strings; the sample "today" is 07.23. */
const eventDaysAgo = (time: string): number => {
  const match = time.match(/^(\d{2})\.(\d{2})/);
  if (!match) return 0;
  return Math.round((SAMPLE_END_DATE - Date.UTC(2026, Number(match[1]) - 1, Number(match[2]))) / 86400000);
};

const botStateFilters: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'running', label: '실행' },
  { id: 'evaluating', label: '평가' },
  { id: 'attention', label: '확인' },
];

const matchesBotFilter = (bot: BotRecord, filter: FilterId): boolean => {
  if (filter === 'all') return true;
  if (filter === 'running') return bot.state === '실행 중';
  if (filter === 'evaluating') return bot.state === '평가 중';
  return bot.state === '조치 필요';
};

/* Each state gets its own tone: running green, evaluating blue, attention
   amber — two different states must never share a colour. */
const botTone = (state: string): 'positive' | 'info' | 'warning' =>
  state === '실행 중' ? 'positive' : state === '평가 중' ? 'info' : 'warning';

interface PositionColumn {
  key: string;
  label: string;
  render?: (row: Position) => ReactNode;
}

/* ---------- Page ------------------------------------------------------------ */

/*
  Bot operations: a master list on the left, the selected bot's detail on the
  right, everything else behind tabs.

  Positions is current state only (composition and holdings); everything with a
  time axis — fills included — lives in the decision log, so the same event is
  never told in two places. Budget-cap deferrals are normal operation (the bot
  retries next evaluation) and are recorded there, never escalated.
*/
export function BotsView(): ReactNode {
  const [filter, setFilter] = useState<FilterId>('all');
  const [selectedName, setSelectedName] = useState<string>(botList[0].name);
  const [tab, setTab] = useState<TabId>('overview');
  const [plainOpen, setPlainOpen] = useState(false);
  const [botEmojis, setBotEmojis] = useState<Record<string, string>>(DEFAULT_EMOJI);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [logQuery, setLogQuery] = useState('');
  const [logScope, setLogScope] = useState<LogScope>('fills');
  const [logPeriod, setLogPeriod] = useState<LogPeriod>('all');

  const visibleBots = botList.filter((bot) => matchesBotFilter(bot, filter));
  const selected = visibleBots.find((bot) => bot.name === selectedName) ?? visibleBots[0] ?? null;
  const detail = selected ? botDetails[selected.name] : null;
  const attention = botList.filter((bot) => bot.state === '조치 필요');
  const healthyCount = botList.length - attention.length;

  const selectBot = (bot: BotRecord) => {
    setSelectedName(bot.name);
    setTab('overview');
    setPlainOpen(false);
    setEmojiPickerOpen(false);
    setLogQuery('');
    setLogScope('fills');
    setLogPeriod('all');
  };

  const visibleEvents = (detail?.events ?? []).filter((event) => {
    if (logScope === 'fills' && event.kind !== 'fill') return false;
    if (eventDaysAgo(event.time) > PERIOD_DAYS[logPeriod]) return false;
    const query = logQuery.trim().toLowerCase();
    if (!query) return true;
    const haystack = event.kind === 'fill'
      ? `${event.side} ${event.symbol} ${event.quantity} ${event.price} ${event.partition} ${event.rule}`
      : `${event.title} ${event.detail}`;
    return haystack.toLowerCase().includes(query);
  });

  const positionColumns: PositionColumn[] = [
    { key: 'symbol', label: '종목', render: (row) => <strong>{row.symbol}</strong> },
    { key: 'qty', label: '수량' }, { key: 'avg', label: '평균가' }, { key: 'price', label: '현재가' },
    { key: 'pnl', label: '평가손익', render: (row) => <span className={row.pnl.startsWith('+') ? 'positive' : 'negative'}>{row.pnl}</span> },
    { key: 'rate', label: '수익률', render: (row) => <span className={row.rate.startsWith('+') ? 'positive' : 'negative'}>{row.rate}</span> },
    { key: 'share', label: '비중' },
  ];

  // The selected bot's 30-day curve, shown as P&L with the rate in the tooltip
  // — the same reading as the Home aggregate.
  const chartDays = 30;
  const series = selected && detail ? walkSeries(selected.name, chartDays, CAPITALS[selected.name], detail.monthReturn, detail.dailyVol) : [];
  const botProfit = series.map((value) => value - series[0]);
  const botRates = series.map((value) => (value / series[0] - 1) * 100);
  const chartDates = dateLabels(SAMPLE_END_DATE, chartDays);

  return <Localized><div className="page bots-page">
    <PageHeading
      eyebrow="LIVE OPERATIONS"
      title="봇 운영 센터"
      description={attention.length > 0
        ? `봇 ${botList.length}개 중 ${healthyCount}개가 정상 실행 중이에요. ${attention.map((bot) => bot.name).join(', ')} 하나만 확인하면 됩니다.`
        : `봇 ${botList.length}개가 모두 정상 실행 중이에요. 확인할 문제가 없습니다.`}
      actions={<><Button icon={RefreshCw}>새로고침</Button><Button kind="primary" icon={Plus}>봇 출시</Button></>}
    />

    <div className="bots-workspace">
      <section className="bots-list-panel panel" aria-labelledby="bots-list-title">
        <header className="bots-list-head">
          <div><span>MY BOTS</span><h2 id="bots-list-title">봇 목록</h2></div>
          <div className="bots-filter" role="group" aria-label="봇 상태 필터">
            {botStateFilters.map((option) => <button
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              className={filter === option.id ? 'active' : ''}
              onClick={() => setFilter(option.id)}
            >{option.label}</button>)}
          </div>
        </header>
        {/* The list item and the control are separate elements: putting
            role="listitem" on the button itself would drop its button semantics,
            so it would no longer be announced as something you can activate. */}
        {visibleBots.length > 0 ? <div className="bots-list" role="list" aria-label="봇 목록 결과">
          {visibleBots.map((bot) => <div role="listitem" key={bot.name}><button
            type="button"
            aria-label={`${bot.name} 상세 보기`}
            aria-pressed={selected?.name === bot.name}
            className={selected?.name === bot.name ? 'active' : ''}
            onClick={() => selectBot(bot)}
          >
            <span className="bots-list-icon" aria-hidden="true">{botEmojis[bot.name] ?? '🤖'}</span>
            {/* One template string, not interpolated fragments: Localized
                translates whole text nodes, and a number in the middle would
                split this into untranslatable pieces. */}
            <span className="bots-list-copy"><strong>{bot.name}</strong><small>{`${bot.room} · 전략 ${bot.strategies}개`}</small></span>
            <span className="bots-list-figures"><b>{bot.capital}</b><em className={bot.change.startsWith('+') ? 'positive' : 'negative'}>{bot.change}</em></span>
            <Status tone={botTone(bot.state)}>{bot.state}</Status>
          </button></div>)}
        </div> : <EmptyState
          icon={Bot}
          title="조건에 맞는 봇이 없습니다."
          detail="다른 상태 필터를 선택하면 나머지 봇을 확인할 수 있습니다."
          action={<Button onClick={() => setFilter('all')}>전체 보기</Button>}
        />}
      </section>

      {selected && detail ? <section className="bots-detail-panel panel" aria-label={`${selected.name} 운영 상세`}>
        {/* The identity row is the emoji tile and the name — where the bot
            runs is on the list row, and the strategy belongs to the snapshot
            tab, so neither is repeated here. */}
        <header className="bots-detail-head">
          <div className="bots-detail-identity">
            <span className="bots-emoji-anchor">
              <button
                type="button"
                className="bots-detail-emoji"
                aria-label={`${selected.name} 이모지 설정`}
                aria-expanded={emojiPickerOpen}
                onClick={() => setEmojiPickerOpen((open) => !open)}
              >{botEmojis[selected.name] ?? '🤖'}</button>
              {emojiPickerOpen && <div className="bots-emoji-picker" role="group" aria-label="봇 이모지 선택">
                {BOT_PERSONAS.map((persona) => <button
                  key={persona.emoji}
                  type="button"
                  aria-pressed={botEmojis[selected.name] === persona.emoji}
                  className={botEmojis[selected.name] === persona.emoji ? 'active' : ''}
                  onClick={() => {
                    setBotEmojis((current) => ({ ...current, [selected.name]: persona.emoji }));
                    setEmojiPickerOpen(false);
                  }}
                ><i aria-hidden="true">{persona.emoji}</i><small>{persona.label}</small></button>)}
              </div>}
            </span>
            <h2>{selected.name}</h2>
          </div>
          <Status tone={botTone(selected.state)}>{selected.state}</Status>
        </header>

        <Tabs
          label={`${selected.name} 상세 보기 방식`}
          value={tab}
          onChange={(next: TabId) => setTab(next)}
          items={[
            { id: 'overview', label: '개요' },
            { id: 'positions', label: '포지션', count: detail.positions.length },
            { id: 'decisions', label: '판단 기록', count: detail.events.length },
            { id: 'strategy', label: '전략 스냅샷' },
          ]}
        />

        {tab === 'overview' && <TabPanel id="overview">
          <div className="bots-overview-figures">
            <div><span>총자산</span><strong>{selected.capital}</strong><small>{`${signedMoney(botProfit[botProfit.length - 1])} · ${percent(detail.monthReturn)}`}</small></div>
            <div><span>투자 중</span><strong>{detail.invested}</strong></div>
            {/* Cash IS the buying power here — the product has no margin, so a
                separate buying-power figure would just repeat this number. */}
            <div><span>현금</span><strong>{detail.cash}</strong><small>주문 가능 금액</small></div>
          </div>
          <div className="bots-overview-chart">
            <header><h3>최근 30일 손익</h3><span>{money(series[series.length - 1])}</span></header>
            <EquityChart
              values={botProfit}
              rates={botRates}
              dates={chartDates}
              format={signedMoney}
              ariaLabel={`${selected.name} 손익과 수익률 차트`}
            />
          </div>
        </TabPanel>}

        {tab === 'positions' && <TabPanel id="positions">
          {/* What the equity is made of right now: each holding's share of the
              bot, plus cash. The legend carries the numbers so colour is never
              the only signal. */}
          <div className="bots-composition" role="group" aria-label={`${selected.name} 자산 구성`}>
            <h3>자산 구성</h3>
            <div className="bots-composition-bar" aria-hidden="true">
              {detail.positions.map((position, index) => <i
                key={position.symbol}
                style={{ width: `${position.shareValue}%`, background: COMPOSITION_TONES[index % COMPOSITION_TONES.length] }}
              />)}
              <i className="is-cash" style={{ width: `${detail.cashShare}%` }} />
            </div>
            <ul className="bots-composition-legend">
              {detail.positions.map((position, index) => <li key={position.symbol}>
                <i style={{ background: COMPOSITION_TONES[index % COMPOSITION_TONES.length] }} aria-hidden="true" />
                <strong>{position.symbol}</strong>
                <b>{position.share}</b>
              </li>)}
              <li>
                <i className="is-cash" aria-hidden="true" />
                <strong>현금</strong>
                <b>{`${detail.cashShare.toFixed(1)}%`}</b>
              </li>
            </ul>
          </div>

          {detail.positions.length > 0
            ? <DataTable columns={positionColumns} rows={detail.positions} rowKey="symbol" />
            : <EmptyState
              icon={Coins}
              title="보유 중인 포지션이 없습니다."
              detail="이 봇은 현재 전액을 현금으로 보유하고 있습니다."
            />}
        </TabPanel>}

        {tab === 'decisions' && <TabPanel id="decisions">
          {/* One timeline, one row grammar: kind chip · what happened · where
              and when. Fills show by default; engine records (unmet
              conditions, deferrals, passed checks) join when the person opts
              into the full record. */}
          <div className="bots-log-tools">
            <label className="bots-log-search">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                aria-label="판단 기록 검색"
                placeholder="종목·내용 검색"
                value={logQuery}
                onChange={(event) => setLogQuery(event.target.value)}
              />
            </label>
            <div className="bots-filter" role="group" aria-label="판단 기록 종류 필터">
              <button type="button" aria-pressed={logScope === 'fills'} className={logScope === 'fills' ? 'active' : ''} onClick={() => setLogScope('fills')}>매수·매도만</button>
              <button type="button" aria-pressed={logScope === 'all'} className={logScope === 'all' ? 'active' : ''} onClick={() => setLogScope('all')}>전체 기록</button>
            </div>
            <select aria-label="판단 기록 기간 선택" value={logPeriod} onChange={(event) => setLogPeriod(event.target.value as LogPeriod)}>
              {LOG_PERIODS.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}
            </select>
          </div>

          {visibleEvents.length > 0 ? <div className="bots-event-list" role="list" aria-label={`${selected.name} 판단 기록 목록`}>
            {visibleEvents.map((event, index) => event.kind === 'fill'
              ? <div role="listitem" key={`fill-${event.time}-${index}`} className="bots-event">
                <span className={`bots-event-kind ${event.side === '매수' ? 'is-buy' : 'is-sell'}`}>{event.side}</span>
                <span className="bots-event-copy">
                  <strong>{`${event.symbol} ${event.quantity} · ${event.price}`}</strong>
                  <small>{event.rule}</small>
                </span>
                <span className="bots-event-meta">
                  <b>{event.partition}</b>
                  <time>{event.time}</time>
                </span>
              </div>
              : <div role="listitem" key={`note-${event.time}-${index}`} className={`bots-event is-note tone-${event.tone}`}>
                <span className="bots-event-kind is-log">기록</span>
                <span className="bots-event-copy">
                  <strong>{event.title}</strong>
                  <small>{event.detail}</small>
                </span>
                <span className="bots-event-meta">
                  <time>{event.time}</time>
                </span>
              </div>)}
          </div> : <EmptyState
            icon={Search}
            title="조건에 맞는 기록이 없습니다."
            detail="검색어를 지우거나 종류·기간 필터를 넓히면 나머지 기록을 볼 수 있습니다."
            action={<Button onClick={() => { setLogQuery(''); setLogScope('all'); setLogPeriod('all'); }}>필터 초기화</Button>}
          />}
          <p className="bots-decision-note">전체 기록을 선택하면 주문으로 이어지지 않은 판단도 최초 실패 조건과 함께 남깁니다. 예산 상한 보류는 정상 동작이며 다음 평가에서 자동으로 재시도합니다.</p>
        </TabPanel>}

        {/* The launch-time snapshot. Launching severs the link to the source
            strategy entirely, so there is nothing to say about the source —
            only what this bot runs. Basic keeps the real hierarchy (bot >
            partitions > buy/sell strategies > blocks); Pro is a single graph,
            shown as its execution order because free node placement makes a
            frozen canvas heavy to render and hard to scan. */}
        {tab === 'strategy' && <TabPanel id="strategy">
          <div className="bots-snapshot-meta">
            <div>
              <span className={`bots-snapshot-mode is-${detail.snapshot.mode.toLowerCase()}`}>{detail.snapshot.mode}</span>
              <div>
                <strong>{`${detail.strategy.split(' · ')[0]} · ${detail.snapshot.version}`}</strong>
                <small>{`스냅샷 ${detail.snapshot.takenAt}`}</small>
              </div>
            </div>
            <button
              type="button"
              className={`bots-plain-toggle ${plainOpen ? 'active' : ''}`}
              aria-pressed={plainOpen}
              onClick={() => setPlainOpen((open) => !open)}
            ><MessageSquareText size={14} aria-hidden="true" />자연어 설명</button>
          </div>
          <p className="bots-snapshot-note">출시 시점의 스냅샷입니다. 이후 원본 전략을 수정하거나 삭제해도 이 봇에는 영향이 없습니다.</p>
          {plainOpen && <p className="bots-snapshot-plain">{detail.snapshot.plain}</p>}

          {detail.snapshot.mode === 'Basic' && <div className="bots-snapshot-partitions">
            {detail.snapshot.partitions.map((partition) => <section key={partition.name} className="bots-snapshot-partition" aria-label={`${partition.name} 파티션`}>
              <header>
                <strong>{partition.name}</strong>
                <span className="bots-snapshot-symbol">{partition.symbol}</span>
                <small>{`투자비율 ${partition.allocation}`}</small>
              </header>
              <div className="bots-snapshot-groups">
                <div className="bots-snapshot-group is-buy">
                  <h4>매수 전략</h4>
                  <ol>
                    {partition.buy.map((block, index) => <li key={`${block.name}-${index}`}>
                      <span className={`bots-snapshot-dot tone-${block.tone}`} aria-hidden="true" />
                      <strong>{block.name}</strong>
                      <small>{block.value}</small>
                    </li>)}
                  </ol>
                  {plainOpen && <p className="bots-snapshot-plain is-group">{partition.plainBuy}</p>}
                </div>
                <div className="bots-snapshot-group is-sell">
                  <h4>매도 전략</h4>
                  <ol>
                    {partition.sell.map((block, index) => <li key={`${block.name}-${index}`}>
                      <span className={`bots-snapshot-dot tone-${block.tone}`} aria-hidden="true" />
                      <strong>{block.name}</strong>
                      <small>{block.value}</small>
                    </li>)}
                  </ol>
                  {plainOpen && <p className="bots-snapshot-plain is-group">{partition.plainSell}</p>}
                </div>
              </div>
            </section>)}
          </div>}

          {detail.snapshot.mode === 'Pro' && <>
            <p className="bots-snapshot-note is-secondary">Pro 그래프는 배치 좌표가 아닌 실행 순서 기준으로 표시합니다.</p>
            <ol className="bots-snapshot-steps" aria-label={`${selected.name} 전략 실행 순서`}>
              {detail.snapshot.steps.map((step, index) => <li key={`${step.name}-${index}`}>
                <span className={`bots-snapshot-dot tone-${step.tone}`} aria-hidden="true" />
                <span className="bots-snapshot-copy">
                  <small>{step.category}</small>
                  <strong>{step.name}</strong>
                </span>
                <span className="bots-snapshot-value">
                  <b>{step.value}</b>
                  {step.note && <small>{step.note}</small>}
                </span>
              </li>)}
            </ol>
          </>}
        </TabPanel>}
      </section> : null}
    </div>
  </div></Localized>;
}
