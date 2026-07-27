import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Bot, Boxes, CircleDollarSign, Coins, GitBranch, GripVertical, LockKeyhole, Play, Plus, Save, Search, ShieldCheck, Timer, X } from 'lucide-react';
import { Button, DataTable, EmptyState, PageHeading, Status, TabPanel, Tabs } from '../components/common.jsx';
import { EquityChart } from '../components/EquityChart';
import { dateLabels, money, percent, signedMoney, walkSeries } from '../lib/equitySim';
import { bots } from '../data/mockData.js';
import { Localized } from '../lib/i18n.jsx';
import botAdaptive from '../assets/bots/bot-adaptive.svg';
import botAggressive from '../assets/bots/bot-aggressive.svg';
import botAnalytical from '../assets/bots/bot-analytical.svg';
import botBalanced from '../assets/bots/bot-balanced.svg';
import botConfident from '../assets/bots/bot-confident.svg';
import botDefensive from '../assets/bots/bot-defensive.svg';
import botFocus from '../assets/bots/bot-focus.svg';
import botHappy from '../assets/bots/bot-happy.svg';
import botHighGrowth from '../assets/bots/bot-high-growth.svg';
import botNormal from '../assets/bots/bot-normal.svg';
import botOpportunistic from '../assets/bots/bot-opportunistic.svg';
import botRelaxed from '../assets/bots/bot-relaxed.svg';
import {
  getBasicSectionLayout,
  getDefaultBasicCardPosition,
  getMovedBasicCardPosition,
  getStrategyCanvasWheelZoom,
} from '../lib/strategyCanvasLayout.js';
import { ReadOnlyStrategyBlock } from './StrategyViews.jsx';

/* ---------- Types ----------------------------------------------------------- */

type FilterId = 'personal' | 'competition';
type TabId = 'overview' | 'positions' | 'decisions';
type StepTone = 'universe' | 'data' | 'indicator' | 'condition' | 'risk' | 'order' | 'portfolio' | 'time';
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
  startedAt: string;
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
  op?: string;
}

interface LayoutPoint {
  x: number;
  y: number;
}

type SnapshotLayout = Record<string, LayoutPoint>;

/* One Basic partition: a symbol, its allocation, and its buy/sell groups.
   `plainBuy`/`plainSell` are the same rules in one plain-language sentence. */
interface SnapshotPartition {
  id: string;
  name: string;
  symbol: string;
  allocation: string;
  buy: SnapshotBlock[];
  sell: SnapshotBlock[];
  plainBuy: string;
  plainSell: string;
}

interface SnapshotStep extends SnapshotBlock {
  id: string;
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
  layout: SnapshotLayout;
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
const INITIAL_CAPITAL = 10000;
const CAPITALS: Record<string, number> = { 'Atlas 07': 24892.40, 'Room Beta': 10184.12, 'Pair Lab': 9790 };

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
      { kind: 'fill', time: '07.23 10:14 ET', side: '매수', symbol: 'SPY', quantity: '12주', price: '$634.06', partition: 'SECTION 01 · SPY', rule: '시초 15분 고가 $632.80 돌파 → 예산 25% 시장가 매수' },
      { kind: 'note', tone: 'neutral', time: '07.23 10:14 ET', title: '예산 상한 검사 통과', detail: '요청 $7,608 · 한도 $8,000' },
      { kind: 'note', tone: 'muted', time: '07.23 10:13 ET', title: 'AAPL 조건 미충족 · 주문 없음', detail: '현재가 $216.42 · 시초 15분 고가 $217.10 미돌파' },
      { kind: 'fill', time: '07.22 14:02 ET', side: '매도', symbol: 'AAPL', quantity: '6주', price: '$215.88', partition: 'SECTION 01 · AAPL', rule: '시초 범위 저가 이탈 → 보유 수량 100% 시장가 매도' },
      { kind: 'fill', time: '07.21 09:47 ET', side: '매수', symbol: 'MSFT', quantity: '9주', price: '$492.30', partition: 'SECTION 01 · MSFT', rule: '시초 15분 고가 돌파 → 예산 25% 시장가 매수' },
    ],
    snapshot: {
      mode: 'Basic',
      version: 'v4',
      takenAt: '2026.06.08 09:30 ET',
      plain: 'AAPL · MSFT · SPY의 장 시작 후 15분 가격 범위를 계산해 고가 돌파 시 매수하고, 저가 이탈 또는 장 마감 전에 전량 매도합니다.',
      layout: {
        'section-01': { x: 290, y: 108 },
        'section-01-buy': { x: 24, y: 112 },
        'section-01-sell': { x: 310, y: 112 },
      },
      partitions: [
        {
          id: 'section-01',
          name: 'SECTION 01',
          symbol: 'AAPL · MSFT · SPY',
          allocation: '40%',
          buy: [
            { tone: 'time', name: '1m BAR', value: '' },
            { tone: 'indicator', name: 'OPENING RANGE', value: '15m' },
            { tone: 'condition', name: 'BREAKOUT', op: '>', value: 'OR HIGH' },
            { tone: 'risk', name: 'BUDGET', value: '25%' },
            { tone: 'order', name: 'BUY', value: 'MARKET' },
          ],
          sell: [
            { tone: 'condition', name: 'POSITION', value: 'OPEN' },
            { tone: 'condition', name: 'BREAKDOWN', op: '<', value: 'OR LOW' },
            { tone: 'time', name: 'EXIT TIME', value: '15:55 ET' },
            { tone: 'order', name: 'SELL', value: '100%' },
          ],
          plainBuy: '장 시작 후 15분의 고가를 1분봉 종가가 돌파하면 전략 예산의 25%를 시장가로 매수합니다.',
          plainSell: '포지션 보유 중 1분봉 종가가 시초 범위 저가 아래로 내려가거나 15:55 ET가 되면 전량 시장가로 매도합니다.',
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
      layout: {
        universe: { x: 40, y: 140 },
        market: { x: 290, y: 140 },
        momentum: { x: 540, y: 140 },
        condition: { x: 790, y: 140 },
        portfolio: { x: 1040, y: 140 },
        order: { x: 1290, y: 140 },
      },
      steps: [
        { id: 'universe', tone: 'universe', category: '유니버스', name: '직접 선택 바스켓', value: 'NVDA · MSFT · TSLA' },
        { id: 'market', tone: 'data', category: '시장 데이터', name: '가격·거래량', value: '1일봉 · 최대 지연 1일' },
        { id: 'momentum', tone: 'indicator', category: '지표', name: '모멘텀 순위', value: '기간 20일' },
        { id: 'condition', tone: 'condition', category: '조건', name: '상위 순위 여부', value: '상위 2종목', note: '분기 · 참/거짓 2갈래' },
        { id: 'portfolio', tone: 'portfolio', category: '포트폴리오', name: '목표 비중', value: '상위 2종목 50% · 50%', note: '합류 · 두 갈래 재결합' },
        { id: 'order', tone: 'order', category: '주문 실행', name: '리밸런싱 주문', value: '시장가' },
      ],
    },
  },
  'Pair Lab': {
    strategy: 'Pair Spread Monitor · v1',
    monthReturn: -.021,
    dailyVol: .005,
    cash: '$9,790.00',
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
      layout: {
        universe: { x: 40, y: 140 },
        market: { x: 290, y: 140 },
        spread: { x: 540, y: 140 },
        condition: { x: 790, y: 140 },
        risk: { x: 1040, y: 140 },
        order: { x: 1290, y: 140 },
      },
      steps: [
        { id: 'universe', tone: 'universe', category: '유니버스', name: '페어 바스켓', value: 'KO · PEP' },
        { id: 'market', tone: 'data', category: '시장 데이터', name: '가격 데이터', value: '1시간봉' },
        { id: 'spread', tone: 'indicator', category: '지표', name: '스프레드 z-점수', value: '기간 30' },
        { id: 'condition', tone: 'condition', category: '조건', name: '스프레드 이탈', value: '|z| 2 초과', note: '분기 · 방향별 2갈래' },
        { id: 'risk', tone: 'risk', category: '위험관리', name: '예산 상한', value: '$18,000' },
        { id: 'order', tone: 'order', category: '주문 실행', name: '페어 주문', value: '양방향 · 시장가' },
      ],
    },
  },
};

/* Theme-aware categorical tones for the composition bar segments. */
const COMPOSITION_TONES = ['var(--tone-data)', 'var(--tone-indicator)', 'var(--tone-universe)', 'var(--tone-return)', 'var(--tone-sharpe)'];

interface BotIconOption {
  id: string;
  label: string;
  src: string;
}

interface BotIconColor {
  id: string;
  label: string;
  value: string;
}

interface BotIconSelection {
  iconId: string;
  colorId: string;
}

/* The 12 repository-owned bot drawings are always presented as a 4 × 3 grid. */
const BOT_ICON_OPTIONS: BotIconOption[] = [
  { id: 'focus', label: '집중형 봇', src: botFocus },
  { id: 'aggressive', label: '공격형 봇', src: botAggressive },
  { id: 'balanced', label: '균형형 봇', src: botBalanced },
  { id: 'defensive', label: '방어형 봇', src: botDefensive },
  { id: 'relaxed', label: '릴렉스형 봇', src: botRelaxed },
  { id: 'high-growth', label: '고성장형 봇', src: botHighGrowth },
  { id: 'analytical', label: '분석형 봇', src: botAnalytical },
  { id: 'adaptive', label: '적응형 봇', src: botAdaptive },
  { id: 'confident', label: '자신감형 봇', src: botConfident },
  { id: 'happy', label: '행복한 봇', src: botHappy },
  { id: 'normal', label: '기본형 봇', src: botNormal },
  { id: 'opportunistic', label: '기회포착형 봇', src: botOpportunistic },
];

const BOT_ICON_COLORS: BotIconColor[] = [
  { id: 'gray', label: '회색', value: '#565958' },
  { id: 'light-gray', label: '연한 회색', value: '#a6a59f' },
  { id: 'brown', label: '갈색', value: '#9d725b' },
  { id: 'yellow', label: '노란색', value: '#c59636' },
  { id: 'orange', label: '주황색', value: '#d17526' },
  { id: 'green', label: '초록색', value: '#5d8f70' },
  { id: 'blue', label: '파란색', value: '#5686bd' },
  { id: 'purple', label: '보라색', value: '#8769b6' },
  { id: 'pink', label: '분홍색', value: '#b65b89' },
  { id: 'red', label: '빨간색', value: '#c35b50' },
];

const FALLBACK_BOT_ICON: BotIconSelection = { iconId: 'normal', colorId: 'gray' };
const DEFAULT_BOT_ICONS: Record<string, BotIconSelection> = {
  'Atlas 07': { iconId: 'focus', colorId: 'gray' },
  'Room Beta': { iconId: 'aggressive', colorId: 'red' },
  'Pair Lab': { iconId: 'relaxed', colorId: 'blue' },
};

function BotGlyph({ selection, testId }: { selection: BotIconSelection; testId?: string }): ReactNode {
  const icon = BOT_ICON_OPTIONS.find((option) => option.id === selection.iconId) ?? BOT_ICON_OPTIONS[0];
  const color = BOT_ICON_COLORS.find((option) => option.id === selection.colorId) ?? BOT_ICON_COLORS[0];
  const style = {
    '--bot-icon-mask': `url("${icon.src}")`,
    '--bot-icon-color': color.value,
  } as CSSProperties;

  return <span
    className="bot-icon-glyph"
    aria-hidden="true"
    data-testid={testId}
    data-icon={icon.id}
    data-color={color.id}
    style={style}
  />;
}

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

const botOperationFilters: Array<{ id: FilterId; label: string }> = [
  { id: 'personal', label: '개인 운용' },
  { id: 'competition', label: '대회 참가 중' },
];

const matchesBotFilter = (bot: BotRecord, filter: FilterId): boolean => {
  const isCompetitionBot = bot.labels.includes('대회');
  return filter === 'competition' ? isCompetitionBot : !isCompetitionBot;
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

interface StrategyLayoutModalProps {
  botName: string;
  detail: BotDetail;
  layout: SnapshotLayout;
  onClose: () => void;
  onSave: (layout: SnapshotLayout) => void;
}

interface ItemMove {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  kind: 'card' | 'item';
}

interface CanvasPan {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

const cloneLayout = (layout: SnapshotLayout): SnapshotLayout =>
  Object.fromEntries(Object.entries(layout).map(([id, point]) => [id, { ...point }]));

const snapshotBlockIcon = (tone: StepTone) => {
  if (tone === 'data' || tone === 'time') return Play;
  if (tone === 'indicator') return Timer;
  if (tone === 'condition') return GitBranch;
  if (tone === 'risk') return ShieldCheck;
  if (tone === 'order') return CircleDollarSign;
  return Boxes;
};

const snapshotPortType = (step: SnapshotStep, direction: 'in' | 'out'): string | null => {
  if (step.tone === 'universe') return direction === 'out' ? 'universe' : null;
  if (step.tone === 'data') return direction === 'in' ? 'universe' : 'series';
  if (step.tone === 'indicator') return direction === 'in' ? 'series' : 'scalar';
  if (step.tone === 'condition') return direction === 'in' ? 'scalar' : 'signal';
  if (step.tone === 'risk' || step.tone === 'portfolio') return direction === 'in' ? 'signal' : 'order';
  if (step.tone === 'order') return direction === 'in' ? 'order' : null;
  return null;
};

const snapshotLinkPath = (from: LayoutPoint, to: LayoutPoint): string => {
  const curve = Math.max(46, Math.min(150, Math.abs(to.x - from.x) * .55));
  return `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`;
};

function StrategyLayoutModal({ botName, detail, layout, onClose, onSave }: StrategyLayoutModalProps): ReactNode {
  const snapshot = detail.snapshot;
  const strategyName = detail.strategy.split(' · ')[0];
  const [draft, setDraft] = useState<SnapshotLayout>(() => cloneLayout(layout));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<LayoutPoint>({ x: 0, y: 0 });
  const [cardSizes, setCardSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [itemMove, setItemMove] = useState<ItemMove | null>(null);
  const [panGesture, setPanGesture] = useState<CanvasPan | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cardElementsRef = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      setCardSizes((current) => {
        let changed = false;
        const next = { ...current };
        entries.forEach((entry) => {
          const cardId = (entry.target as HTMLElement).dataset.strategyCard;
          if (!cardId) return;
          const width = Math.ceil(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
          const height = Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
          if (next[cardId]?.width === width && next[cardId]?.height === height) return;
          next[cardId] = { width, height };
          changed = true;
        });
        return changed ? next : current;
      });
    });
    cardElementsRef.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [snapshot.mode]);

  const beginItemMove = (event: ReactPointerEvent<HTMLElement>, id: string, kind: ItemMove['kind'] = 'item') => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const position = draft[id] ?? { x: 0, y: 0 };
    setItemMove({
      id,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      kind,
    });
    event.currentTarget.closest('.snapshot-layout-viewport')?.setPointerCapture?.(event.pointerId);
  };

  const beginSectionAreaMove = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest?.('button, input, select, label, .strategy-card')) return;
    beginItemMove(event, id);
  };

  const beginCanvasGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.button !== 0) return;
    event.preventDefault();
    setPanGesture({
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const updateCanvasGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`);
    event.currentTarget.style.setProperty('--spotlight-opacity', '1');

    if (itemMove) {
      const position = itemMove.kind === 'card'
        ? getMovedBasicCardPosition(itemMove, event.clientX, event.clientY, zoom)
        : {
            x: itemMove.originX + (event.clientX - itemMove.startX) / zoom,
            y: itemMove.originY + (event.clientY - itemMove.startY) / zoom,
          };
      setDraft((current) => ({ ...current, [itemMove.id]: position }));
      return;
    }

    if (panGesture) {
      setPan({
        x: panGesture.originX + event.clientX - panGesture.startX,
        y: panGesture.originY + event.clientY - panGesture.startY,
      });
    }
  };

  const finishCanvasGesture = () => {
    setItemMove(null);
    setPanGesture(null);
  };

  const zoomCanvasWithWheel = (event: WheelEvent, viewport: HTMLDivElement) => {
    event.preventDefault();
    if (itemMove) return;
    const bounds = viewport.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    const next = getStrategyCanvasWheelZoom(zoom, pan, event.deltaY, cursorX, cursorY);
    if (!next) return;
    setZoom(next.zoom);
    setPan(next.pan);
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const handleWheel = (event: WheelEvent) => zoomCanvasWithWheel(event, viewport);
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [itemMove, pan, zoom]);

  const getSnapshotSectionLayout = (partition: SnapshotPartition) => {
    const cardIds = (['buy', 'sell'] as const).map((side) => `${partition.id}-${side}`);
    return getBasicSectionLayout(
      cardIds,
      (cardId, index) => draft[cardId] ?? getDefaultBasicCardPosition(index),
      cardSizes,
    );
  };

  return <div
    className="snapshot-layout-backdrop"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <section
      role="dialog"
      aria-modal="true"
      aria-label={`${botName} 전략 구성`}
      aria-describedby="snapshot-layout-scope-description snapshot-layout-controls-description"
      className="snapshot-layout-dialog"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className="snapshot-layout-header">
        <div>
          <span className={`bots-snapshot-mode is-${snapshot.mode.toLowerCase()}`}>{snapshot.mode}</span>
          <div>
            <small>{botName}</small>
            <h2>{`${strategyName} · ${snapshot.version}`}</h2>
          </div>
        </div>
        <button ref={closeButtonRef} type="button" className="snapshot-layout-close" aria-label="전략 구성 닫기" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="snapshot-layout-toolbar">
        <span>{`스냅샷 ${snapshot.takenAt}`}</span>
        <div role="group" aria-label="전략 구성 확대/축소">
          <button type="button" aria-label="축소" disabled={zoom <= .5} onClick={() => setZoom((current) => Math.max(.5, Number((current - .1).toFixed(1))))}>−</button>
          <button type="button" aria-label="배율 초기화" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{Math.round(zoom * 100)}%</button>
          <button type="button" aria-label="확대" disabled={zoom >= 2} onClick={() => setZoom((current) => Math.min(2, Number((current + .1).toFixed(1))))}>+</button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`snapshot-layout-viewport editor-canvas ${snapshot.mode === 'Basic' ? 'basic-canvas' : 'pro-canvas'} ${panGesture ? 'is-panning' : ''} ${itemMove?.kind === 'card' ? 'is-moving-card' : ''}`}
        data-testid="snapshot-strategy-canvas"
        style={{
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          '--canvas-pan-x': `${pan.x}px`,
          '--canvas-pan-y': `${pan.y}px`,
        } as CSSProperties}
        onPointerDown={beginCanvasGesture}
        onPointerMove={updateCanvasGesture}
        onPointerUp={finishCanvasGesture}
        onPointerCancel={finishCanvasGesture}
        onPointerLeave={(event) => event.currentTarget.style.setProperty('--spotlight-opacity', '0')}
      >
        <div className="cursor-dot-spotlight" data-testid="snapshot-cursor-dot-spotlight" aria-hidden="true" />
        <div
          className={`snapshot-layout-world is-${snapshot.mode.toLowerCase()} ${snapshot.mode === 'Basic' ? 'section-world' : 'graph-world'}`}
          style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
        >
          {snapshot.mode === 'Pro' && <svg className="graph-links" aria-label="전략 연결선">
            {snapshot.steps.slice(0, -1).map((step, index) => {
              const nextStep = snapshot.steps[index + 1];
              const from = draft[step.id];
              const to = draft[nextStep.id];
              if (!from || !to) return null;
              return <path
                key={`${step.id}-${nextStep.id}`}
                className="graph-link"
                d={snapshotLinkPath(
                  { x: from.x + 196, y: from.y + 88 },
                  { x: to.x, y: to.y + 88 },
                )}
              />;
            })}
          </svg>}

          {snapshot.mode === 'Basic' && snapshot.partitions.map((partition) => {
            const point = draft[partition.id] ?? { x: 0, y: 0 };
            const sectionLayout = getSnapshotSectionLayout(partition);
            return <article
              key={partition.id}
              className={`strategy-section-frame snapshot-read-only-section ${itemMove?.id === partition.id ? 'is-section-moving' : ''}`}
              aria-label={`${partition.name} 전략 블록`}
              data-testid={`snapshot-layout-item-${partition.id}`}
              data-x={point.x}
              data-y={point.y}
              style={{ left: point.x, top: point.y, width: sectionLayout.width, height: sectionLayout.height }}
              onPointerDown={(event) => beginSectionAreaMove(event, partition.id)}
            >
              <i className="section-corner corner-top-left" aria-hidden="true" />
              <i className="section-corner corner-top-right" aria-hidden="true" />
              <header className="strategy-section-header">
                <span className="section-move-handle" aria-hidden="true"><GripVertical size={16} /></span>
                <div className="section-identity">
                  <span>{partition.name}</span>
                  <strong>{partition.symbol}</strong>
                  <small>매수 1 · 매도 1</small>
                </div>
                <div className="section-settings" aria-label={`${partition.name} 설정 요약`}>
                  <label><span>종목</span><span className="snapshot-section-symbol">{partition.symbol}</span></label>
                  <label><span>전체 자본 대비</span><span className="section-allocation"><input aria-label={`${partition.name} 전체 자본 대비 투자비율`} value={partition.allocation.replace('%', '')} disabled readOnly /><b>%</b></span></label>
                </div>
              </header>
              <div className="section-strategy-grid">
                {([
                  ['매수 전략', 'buy', partition.buy],
                  ['매도 전략', 'sell', partition.sell],
                ] as const).map(([label, side, blocks], sideIndex) => {
                  const flowBlocks = blocks.filter((block) => block.tone !== 'order');
                  const terminal = blocks.find((block) => block.tone === 'order');
                  const cardLayoutId = `${partition.id}-${side}`;
                  const cardPoint = draft[cardLayoutId] ?? getDefaultBasicCardPosition(sideIndex);
                  const isExplained = activeGroup === cardLayoutId;
                  return <section
                    key={side}
                    className={`strategy-container content-sized-strategy ${side}-container strategy-card snapshot-read-only-card ${isExplained ? 'is-explained' : ''} ${itemMove?.id === cardLayoutId ? 'is-free-moving' : ''}`}
                    data-testid={`snapshot-layout-card-${cardLayoutId}`}
                    data-strategy-card={cardLayoutId}
                    data-x={cardPoint.x}
                    data-y={cardPoint.y}
                    ref={(element) => {
                      if (element) cardElementsRef.current.set(cardLayoutId, element);
                      else cardElementsRef.current.delete(cardLayoutId);
                    }}
                    style={{ left: cardPoint.x, top: cardPoint.y }}
                  >
                    <button
                      className="strategy-card-move-handle"
                      type="button"
                      aria-label={`${label} 자유 이동`}
                      onPointerDown={(event) => beginItemMove(event, cardLayoutId, 'card')}
                    ><GripVertical size={14} /><span>MOVE</span></button>
                    <button
                      type="button"
                      className="strategy-container-header"
                      aria-label={`${label} 자연어 설명`}
                      aria-expanded={isExplained}
                      aria-controls={`${cardLayoutId}-rules`}
                      onClick={() => setActiveGroup((current) => current === cardLayoutId ? null : cardLayoutId)}
                    >
                      <span className="container-symbol">{side === 'buy' ? 'B' : 'S'}</span>
                      <div><strong>{label}</strong><small>{side === 'buy' ? '가격 갱신 · 종목별 평가' : '포지션 상태 · 종목별 평가'}</small></div>
                      <span>{flowBlocks.length + 1} BLOCKS</span>
                    </button>
                    <div id={`${cardLayoutId}-rules`} className="block-stack" aria-label={`${label} 규칙 흐름`}>
                      {flowBlocks.map((block, blockIndex) => <ReadOnlyStrategyBlock
                        key={`${block.name}-${blockIndex}`}
                        id={`${partition.id}-${side}-${blockIndex}`}
                        icon={snapshotBlockIcon(block.tone)}
                        label={block.name}
                        op={block.op}
                        value={block.value}
                        tone={block.tone}
                        showRule={isExplained}
                        ruleSide={side === 'buy' ? 'right' : 'left'}
                        ruleStep={blockIndex + 1}
                      />)}
                    </div>
                    <footer className="strategy-container-footer">
                      <ReadOnlyStrategyBlock
                        id={`${partition.id}-${side}-terminal`}
                        fixed
                        icon={CircleDollarSign}
                        label={side.toUpperCase()}
                        value={terminal?.value ?? (side === 'buy' ? 'MARKET' : '100%')}
                        tone={side}
                        showRule={isExplained}
                        ruleSide={side === 'buy' ? 'right' : 'left'}
                        ruleStep={flowBlocks.length + 1}
                      />
                    </footer>
                  </section>;
                })}
              </div>
            </article>;
          })}

          {snapshot.mode === 'Pro' && snapshot.steps.map((step) => {
            const point = draft[step.id] ?? { x: 0, y: 0 };
            const Icon = snapshotBlockIcon(step.tone);
            const inputType = snapshotPortType(step, 'in');
            const outputType = snapshotPortType(step, 'out');
            return <article
              key={step.id}
              className={`graph-node tone-${step.tone} snapshot-read-only-node ${itemMove?.id === step.id ? 'is-node-moving' : ''}`}
              aria-label={`${step.name} 전략 노드`}
              data-testid={`snapshot-layout-item-${step.id}`}
              data-x={point.x}
              data-y={point.y}
              style={{ left: point.x, top: point.y, width: 196, height: 126 }}
              onPointerDown={(event) => beginItemMove(event, step.id)}
            >
              <header>
                <Icon size={14} aria-hidden="true" />
                <span>{step.category}</span>
                <span className="graph-node-handle" aria-hidden="true"><GripVertical size={13} /></span>
              </header>
              <strong>{step.name}</strong>
              <small>{step.note ? `${step.value} · ${step.note}` : step.value}</small>
              {inputType && <span className="graph-port graph-port--in is-linked" style={{ top: 77 }} aria-hidden="true">
                <i className={`port-shape port-shape--${inputType}`} /><span>입력</span>
              </span>}
              {outputType && <span className="graph-port graph-port--out is-linked" style={{ top: 77 }} aria-hidden="true">
                <i className={`port-shape port-shape--${outputType}`} /><span>출력</span>
              </span>}
            </article>;
          })}
        </div>
      </div>

      <footer className="snapshot-layout-footer">
        <div className="snapshot-layout-scope">
          <span className="snapshot-layout-scope-icon"><LockKeyhole size={15} aria-hidden="true" /></span>
          <span>
            <strong>현재 봇 전용 배치</strong>
            <small id="snapshot-layout-scope-description">이 배치는 현재 봇의 스냅샷 화면에만 적용되며 전략 내용에는 영향을 주지 않습니다.</small>
            <small id="snapshot-layout-controls-description">빈 공간 드래그: 화면 이동 · 블록 드래그: 위치 변경</small>
          </span>
        </div>
        <div>
          <Button onClick={onClose}>취소</Button>
          <Button kind="primary" icon={Save} onClick={() => onSave(cloneLayout(draft))}>배치 저장</Button>
        </div>
      </footer>
    </section>
  </div>;
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
  const [filter, setFilter] = useState<FilterId>('personal');
  const [selectedName, setSelectedName] = useState<string>(botList[0].name);
  const [tab, setTab] = useState<TabId>('overview');
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [savedLayouts, setSavedLayouts] = useState<Record<string, SnapshotLayout>>(
    () => Object.fromEntries(Object.entries(botDetails).map(([name, item]) => [name, cloneLayout(item.snapshot.layout)])),
  );
  const [botIcons, setBotIcons] = useState<Record<string, BotIconSelection>>(DEFAULT_BOT_ICONS);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [colorVariantsOpen, setColorVariantsOpen] = useState(false);
  const [pendingIconId, setPendingIconId] = useState(FALLBACK_BOT_ICON.iconId);
  const [logQuery, setLogQuery] = useState('');
  const [logScope, setLogScope] = useState<LogScope>('fills');
  const [logPeriod, setLogPeriod] = useState<LogPeriod>('all');

  const visibleBots = botList.filter((bot) => matchesBotFilter(bot, filter));
  const selected = visibleBots.find((bot) => bot.name === selectedName) ?? visibleBots[0] ?? null;
  const detail = selected ? botDetails[selected.name] : null;
  const attention = botList.filter((bot) => bot.state === '조치 필요');
  const healthyCount = botList.length - attention.length;

  useEffect(() => {
    if (!iconPickerOpen) return undefined;

    const dismissIconPicker = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.bots-icon-anchor')) {
        setIconPickerOpen(false);
        setColorVariantsOpen(false);
        return;
      }
      if (
        colorVariantsOpen
        && !target.closest('.bots-icon-variants')
        && !target.closest('.bots-icon-shape-button')
      ) {
        setColorVariantsOpen(false);
      }
    };

    document.addEventListener('pointerdown', dismissIconPicker);
    return () => document.removeEventListener('pointerdown', dismissIconPicker);
  }, [colorVariantsOpen, iconPickerOpen]);

  const selectBot = (bot: BotRecord) => {
    setSelectedName(bot.name);
    setTab('overview');
    setLayoutOpen(false);
    setIconPickerOpen(false);
    setColorVariantsOpen(false);
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

  // Up to 30 days of the selected bot's curve, shown as P&L with the rate in
  // the tooltip. A newer bot starts at its real launch date instead of showing
  // invented pre-launch history.
  const chartDays = selected ? Math.min(30, selected.startDaysAgo) : 30;
  const series = selected && detail ? walkSeries(selected.name, chartDays, CAPITALS[selected.name], detail.monthReturn, detail.dailyVol) : [];
  const botProfit = series.map((value) => value - series[0]);
  const botRates = series.map((value) => (value / series[0] - 1) * 100);
  const chartDates = dateLabels(SAMPLE_END_DATE, chartDays);
  const isYoungBot = chartDays < 30;
  const chartTitle = isYoungBot ? `운용 시작 후 ${chartDays}일 손익` : '최근 30일 손익';
  const chartRange = chartDates.length > 0 ? `${chartDates[0]}–${chartDates[chartDates.length - 1]} · ${chartDays}일` : '';
  const isCompetitionBot = selected?.labels.includes('대회') ?? false;
  const startLabel = isCompetitionBot ? '대회 참가 시간' : '운용 시작 시간';

  return <Localized><div className="page bots-page">
    <PageHeading
      eyebrow="LIVE OPERATIONS"
      title="봇 운영 센터"
      description={attention.length > 0
        ? `봇 ${botList.length}개 중 ${healthyCount}개가 정상 실행 중이에요. ${attention.map((bot) => bot.name).join(', ')} 하나만 확인하면 됩니다.`
        : `봇 ${botList.length}개가 모두 정상 실행 중이에요. 확인할 문제가 없습니다.`}
      actions={<Button kind="primary" icon={Plus}>봇 출시</Button>}
    />

    <div className="bots-workspace">
      <section className="bots-list-panel panel" aria-labelledby="bots-list-title">
        <header className="bots-list-head">
          <div><span>MY BOTS</span><h2 id="bots-list-title">봇 목록</h2></div>
          <div className="bots-filter" role="group" aria-label="봇 운용 유형 필터">
            {botOperationFilters.map((option) => <button
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
            <span className="bots-list-icon" aria-hidden="true">
              <BotGlyph selection={botIcons[bot.name] ?? FALLBACK_BOT_ICON} testId={`bot-icon-${bot.name}-list`} />
            </span>
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
          detail="다른 운용 유형을 선택하면 나머지 봇을 확인할 수 있습니다."
          action={<Button onClick={() => setFilter(filter === 'personal' ? 'competition' : 'personal')}>
            {filter === 'personal' ? '대회 참가 봇 보기' : '개인 운용 봇 보기'}
          </Button>}
        />}
      </section>

      {selected && detail ? <section className="bots-detail-panel panel" aria-label={`${selected.name} 운영 상세`}>
        {/* The identity row is the bot icon tile and the name — where the bot
            runs is on the list row, and the strategy belongs to the snapshot
            tab, so neither is repeated here. */}
        <header className="bots-detail-head">
          <div className="bots-detail-identity">
            <span className="bots-icon-anchor">
              <button
                type="button"
                className="bots-detail-icon"
                aria-label={`${selected.name} 아이콘 설정`}
                aria-expanded={iconPickerOpen}
                onClick={() => {
                  if (!iconPickerOpen) {
                    setPendingIconId((botIcons[selected.name] ?? FALLBACK_BOT_ICON).iconId);
                    setColorVariantsOpen(false);
                  }
                  setIconPickerOpen((open) => !open);
                }}
              >
                <BotGlyph selection={botIcons[selected.name] ?? FALLBACK_BOT_ICON} testId={`bot-icon-${selected.name}-detail`} />
              </button>
              {iconPickerOpen && <div
                className="bots-icon-picker"
                role="group"
                aria-label="봇 아이콘 선택"
              >
                <span className="bots-icon-picker-label">아이콘</span>
                <div className="bots-icon-grid" role="group" aria-label="아이콘 모양">
                  {BOT_ICON_OPTIONS.map((icon) => {
                    const variantsVisible = pendingIconId === icon.id && colorVariantsOpen;
                    return <div
                      className={`bots-icon-cell${variantsVisible ? ' variants-open' : ''}`}
                      key={icon.id}
                    >
                      <button
                        type="button"
                        className={`bots-icon-shape-button${variantsVisible ? ' active' : ''}`}
                        aria-label={`${icon.label} 아이콘`}
                        aria-pressed={variantsVisible}
                        onClick={() => {
                          if (variantsVisible) {
                            setColorVariantsOpen(false);
                            return;
                          }
                          setPendingIconId(icon.id);
                          setColorVariantsOpen(true);
                        }}
                      >
                        <BotGlyph selection={{ iconId: icon.id, colorId: 'gray' }} />
                      </button>
                      {variantsVisible && <div
                        className="bots-icon-variants"
                        role="group"
                        aria-label={`${icon.label} 아이콘 색상 선택`}
                      >
                        {BOT_ICON_COLORS.map((color) => {
                          const currentIcon = botIcons[selected.name] ?? FALLBACK_BOT_ICON;
                          const active = currentIcon.iconId === icon.id && currentIcon.colorId === color.id;
                          return <button
                            key={color.id}
                            type="button"
                            aria-label={`${icon.label} 아이콘 ${color.label} 적용`}
                            aria-pressed={active}
                            className={active ? 'active' : ''}
                            onClick={() => {
                              setBotIcons((current) => ({
                                ...current,
                                [selected.name]: { iconId: icon.id, colorId: color.id },
                              }));
                              setIconPickerOpen(false);
                              setColorVariantsOpen(false);
                            }}
                          >
                            <BotGlyph selection={{ iconId: icon.id, colorId: color.id }} />
                          </button>;
                        })}
                      </div>}
                    </div>;
                  })}
                </div>
              </div>}
            </span>
            <h2>{selected.name}</h2>
          </div>
          <Status tone={botTone(selected.state)}>{selected.state}</Status>
        </header>

        <div className="bots-detail-tabbar" role="group" aria-label={`${selected.name} 상세 탐색`}>
          <Tabs
            label={`${selected.name} 상세 보기 방식`}
            value={tab}
            onChange={(next: TabId) => setTab(next)}
            items={[
              { id: 'overview', label: '개요' },
              { id: 'positions', label: '포지션', count: detail.positions.length },
              { id: 'decisions', label: '판단 기록', count: detail.events.length },
            ]}
          />
          <button type="button" className="bots-layout-open" onClick={() => setLayoutOpen(true)}>
            <Boxes size={14} aria-hidden="true" />전략 구성 보기
          </button>
        </div>

        {tab === 'overview' && <TabPanel id="overview">
          <div className="bots-overview-figures">
            <div><span>총자산</span><strong>{selected.capital}</strong><small>{`${signedMoney(botProfit[botProfit.length - 1])} · ${percent(detail.monthReturn)}`}</small></div>
            <div><span>초기 자산</span><strong>{money(INITIAL_CAPITAL)}</strong><small>모든 봇 동일</small></div>
            <div><span>투자 중</span><strong>{detail.invested}</strong></div>
            {/* Cash IS the buying power here — the product has no margin, so a
                separate buying-power figure would just repeat this number. */}
            <div><span>현금</span><strong>{detail.cash}</strong><small>주문 가능 금액</small></div>
          </div>
          <div className="bots-overview-timing">
            <span><Timer size={14} aria-hidden="true" />{startLabel}</span>
            <strong>{selected.startedAt}</strong>
            <small>{isCompetitionBot ? `${selected.room} 참가 ${selected.startDaysAgo}일째` : `${selected.startDaysAgo}일째 운용 중`}</small>
          </div>
          <div className="bots-overview-chart">
            <header>
              <div><h3>{chartTitle}</h3><small>{chartRange}</small></div>
              <span className={botProfit[botProfit.length - 1] >= 0 ? 'positive' : 'negative'}>{signedMoney(botProfit[botProfit.length - 1])}</span>
            </header>
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

      </section> : null}
    </div>

    {layoutOpen && selected && detail && <StrategyLayoutModal
      botName={selected.name}
      detail={detail}
      layout={savedLayouts[selected.name] ?? detail.snapshot.layout}
      onClose={() => setLayoutOpen(false)}
      onSave={(nextLayout) => {
        setSavedLayouts((current) => ({ ...current, [selected.name]: nextLayout }));
        setLayoutOpen(false);
      }}
    />}
  </div></Localized>;
}
