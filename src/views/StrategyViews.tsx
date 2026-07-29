import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  DragEvent,
  FormEvent,
  HTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Boxes, Check, ChevronDown, ChevronRight, CircleDollarSign, GitBranch, GripVertical, Import, Layers3, Minus, Play, Plus, Rocket, Save, Search, ShieldCheck, Sparkles, Split, Timer, Trash2, TriangleAlert, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { strategies } from '../data/mockData';
import type { StrategySummary } from '../data/mockData';
import { Button, PageHeading, Panel, Status } from '../components/common';
import { Localized } from '../lib/i18n';
import {
  getBasicSectionLayout,
  getDefaultBasicCardPosition,
  getMovedBasicCardPosition,
  getStrategyCanvasWheelZoom,
} from '../lib/strategyCanvasLayout';
import type { CanvasPoint, CanvasSize, CardMoveGesture } from '../lib/strategyCanvasLayout';

type EditorMode = 'basic' | 'pro';
type Side = 'buy' | 'sell';
type BlockTone =
  | 'data'
  | 'indicator'
  | 'condition'
  | 'logic'
  | 'time'
  | 'order'
  | 'risk'
  | 'neutral'
  | 'universe'
  | 'portfolio'
  | 'buy'
  | 'sell';

interface BasicBlock {
  id: string;
  icon?: LucideIcon;
  label: string;
  op?: string;
  value?: string;
  tone: BlockTone;
}

interface StrategySection {
  id: string;
  symbol: string;
  allocation: number;
  x: number;
  y: number;
  width?: number;
  minHeight?: number;
  cards: Record<Side, string[]>;
  cardOrder: string[];
  cardPositions: Record<string, CanvasPoint>;
}

interface StrategyTemplate {
  id: string;
  name: string;
  category: string;
  indicator: string;
  buyTitle?: string;
  sellTitle?: string;
  buyOp: string;
  buyValue: string;
  sellOp: string;
  sellValue: string;
  description: string;
}

interface BlockLibraryCategory {
  name: string;
  tone: BlockTone;
  items: string[];
}

interface CardMeta {
  title: string;
  detail: string;
  explanation: string;
}

interface StrategyListItem extends StrategySummary {
  id: string;
  symbols: string[];
}

type LibraryDragPayload =
  | { type: 'template'; template: StrategyTemplate }
  | { type: 'block'; label: string; tone: BlockTone };

interface ValidationIssue {
  id: string;
  sectionId: string | null;
  cardId: string | null;
  message: string;
}

interface SaveFeedback {
  tone: 'positive' | 'warning';
  title: string;
  detail: string;
}

interface DraftRect extends CanvasPoint, CanvasSize {}

interface SectionMoveGesture extends CardMoveGesture {
  sectionId: string;
}

interface CardMoveState extends CardMoveGesture {
  sectionId: string;
  cardId: string;
}

interface BlockRuleInput {
  id?: string;
  label: string;
  op?: string;
  value?: string;
  tone?: BlockTone;
}

const statusTone = (state: string) => state === '출시 가능' ? 'positive' : 'warning';

interface StrategyHomeProps {
  openEditor: (mode: EditorMode) => void;
}

export function StrategyHome({ openEditor }: StrategyHomeProps) {
  const [items, setItems] = useState<StrategyListItem[]>(() => strategies.map((strategy, index) => ({
    ...strategy,
    id: `strategy-${index}`,
    symbols: index === 0 ? ['AAPL', 'MSFT'] : index === 1 ? ['SPY', 'QQQ'] : ['NVDA'],
  })));
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'all' | 'basic' | 'pro'>('all');
  const [state, setState] = useState<'all' | 'launchable' | 'incomplete'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [draggedStrategyId, setDraggedStrategyId] = useState<string | null>(null);

  const filteredItems = useMemo(() => items.filter((strategy) => {
    const matchesQuery = strategy.name.toLowerCase().includes(query.trim().toLowerCase());
    const matchesMode = mode === 'all' || strategy.mode.toLowerCase() === mode;
    const matchesState = state === 'all'
      || (state === 'launchable' ? strategy.state === '출시 가능' : strategy.state === '미완성');
    return matchesQuery && matchesMode && matchesState;
  }), [items, mode, query, state]);

  const launchableCount = items.filter((strategy) => strategy.state === '출시 가능').length;
  const incompleteCount = items.filter((strategy) => strategy.state === '미완성').length;

  const reorderStrategy = (sourceId: string | null, targetId: string) => {
    if (!sourceId || sourceId === targetId) return;
    setItems((current) => {
      const sourceIndex = current.findIndex((strategy) => strategy.id === sourceId);
      const targetIndex = current.findIndex((strategy) => strategy.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [source] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
  };

  const dropOnStrategy = (event: DragEvent<HTMLElement>, strategyId: string) => {
    event.preventDefault();
    reorderStrategy(draggedStrategyId, strategyId);
    setDraggedStrategyId(null);
  };

  return <Localized><div className="page balanced-strategy-home">
    <PageHeading
      eyebrow="STRATEGY DESK / PRIVATE"
      title="전략"
      description="작성 중인 전략을 이어가거나 새 전략을 시작하세요."
      actions={<Button kind="primary" icon={Plus} onClick={() => setShowCreate(true)}>새 전략</Button>}
    />

    <div className="balanced-strategy-grid is-list-only">
      <section className="strategy-library panel">
        <header className="strategy-library-head">
          <div className="strategy-title-group"><div><h2>내 전략</h2><span>{filteredItems.length}</span></div><div className="strategy-counts" data-testid="strategy-counts"><span>전체 <b>{items.length}</b></span><span>출시 가능 <b>{launchableCount}</b></span><span>미완성 <b>{incompleteCount}</b></span></div></div>
          <label className="strategy-search"><Search size={16} /><input type="search" aria-label="전략 검색" placeholder="이름으로 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </header>
        <div className="strategy-filter-row">
          <div className="strategy-filter-group" aria-label="전략 모드 필터">
            <button className={mode === 'all' ? 'active' : ''} aria-label="전체 전략 보기" onClick={() => setMode('all')}>전체</button>
            <button className={mode === 'basic' ? 'active' : ''} aria-label="Basic 전략만 보기" onClick={() => setMode('basic')}>Basic</button>
            <button className={mode === 'pro' ? 'active' : ''} aria-label="Pro 전략만 보기" onClick={() => setMode('pro')}>Pro</button>
          </div>
          <div className="strategy-filter-group is-secondary" aria-label="전략 상태 필터">
            <button className={state === 'all' ? 'active' : ''} onClick={() => setState('all')}>모든 상태</button>
            <button className={state === 'launchable' ? 'active' : ''} onClick={() => setState('launchable')}>출시 가능</button>
            <button className={state === 'incomplete' ? 'active' : ''} onClick={() => setState('incomplete')}>미완성</button>
          </div>
        </div>
        <div className="strategy-rows" data-testid="strategy-list">
          {filteredItems.map((strategy) => <article
            className="strategy-row"
            key={strategy.id}
            data-testid={`strategy-row-${strategy.name}`}
            draggable
            onDragStart={() => setDraggedStrategyId(strategy.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => dropOnStrategy(event, strategy.id)}
          >
            <GripVertical className="strategy-drag-handle" size={16} aria-hidden="true" />
            <span className={`strategy-mode-icon mode-${strategy.mode.toLowerCase()}`} aria-hidden="true">{strategy.mode[0]}</span>
            <div className="strategy-row-main"><strong>{strategy.name}</strong><span>{strategy.symbols.join(' · ')} · {strategy.updated}</span></div>
            <span className="strategy-mode-label">{strategy.mode}</span>
            <Status tone={statusTone(strategy.state)}>{strategy.state}</Status>
            <div className="strategy-row-actions">
              <button aria-label={`${strategy.name} 열기`} title="열기" onClick={(event) => { event.stopPropagation(); openEditor(strategy.mode.toLowerCase() as EditorMode); }}><ChevronRight size={17} /></button>
            </div>
          </article>)}
          {filteredItems.length === 0 && <div className="strategy-empty"><Search size={20} /><strong>조건에 맞는 전략이 없습니다.</strong><button onClick={() => { setQuery(''); setMode('all'); setState('all'); }}>필터 초기화</button></div>}
        </div>
      </section>

    </div>

    {showCreate && <div className="strategy-dialog-backdrop" onMouseDown={() => { setShowCreate(false); setShowImport(false); }}>
      <section role="dialog" aria-modal="true" aria-label="새 전략 선택" className="strategy-create-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><h2>{showImport ? '기존 전략 가져오기' : '새 전략'}</h2><p>{showImport ? '가져올 전략을 선택하세요.' : '새로 만들거나 기존 전략에서 시작하세요.'}</p></div><button aria-label="새 전략 선택 닫기" onClick={() => { setShowCreate(false); setShowImport(false); }}><X size={18} /></button></header>
        {!showImport ? <div className="strategy-create-options">
          <button aria-label="Basic으로 시작" onClick={() => { setShowCreate(false); openEditor('basic'); }}><span className="create-icon is-basic"><Boxes size={20} /></span><span><strong>Basic</strong><small>편집기에서 블록으로 구성</small></span><ChevronRight size={18} /></button>
          <button aria-label="Pro로 시작" onClick={() => { setShowCreate(false); openEditor('pro'); }}><span className="create-icon is-pro"><GitBranch size={20} /></span><span><strong>Pro</strong><small>편집기에서 노드로 구성</small></span><ChevronRight size={18} /></button>
          <button className="create-import-option" aria-label="기존 전략 가져오기" onClick={() => setShowImport(true)}><span className="create-icon is-import"><Import size={20} /></span><span><strong>기존 전략 가져오기</strong><small>원본은 그대로 두고 새 초안 생성</small></span><ChevronRight size={18} /></button>
        </div> : <div className="strategy-import-list">{items.map((strategy) => <button key={strategy.id} aria-label={`${strategy.name} 가져오기`} onClick={() => { setShowCreate(false); setShowImport(false); openEditor(strategy.mode.toLowerCase() as EditorMode); }}><span className={`strategy-mode-icon mode-${strategy.mode.toLowerCase()}`}>{strategy.mode[0]}</span><span><strong>{strategy.name}</strong><small>{strategy.mode} · {strategy.symbols.join(', ')}</small></span><Import size={16} /></button>)}</div>}
      </section>
    </div>}
  </div></Localized>;
}

const INITIAL_BASIC_BLOCKS: Record<Side, BasicBlock[]> = {
  buy: [
    { id: 'buy-trigger-block', icon: Play, label: '1m BAR', tone: 'time' },
    { id: 'buy-rsi-block', icon: Timer, label: 'RSI', op: '<', value: '30', tone: 'indicator' },
    { id: 'buy-budget-block', icon: CircleDollarSign, label: 'BUDGET', value: '25%', tone: 'risk' },
  ],
  sell: [
    { id: 'sell-position-block', icon: Play, label: 'POSITION', value: 'OPEN', tone: 'condition' },
    { id: 'sell-rsi-block', icon: Timer, label: 'RSI', op: '>', value: '70', tone: 'indicator' },
  ],
};

const INITIAL_STRATEGY_SECTIONS: StrategySection[] = [{
  id: 'section-1',
  symbol: 'AAPL · MSFT · SPY',
  allocation: 40,
  x: 290,
  y: 108,
  cards: { buy: ['primary-buy'], sell: ['primary-sell'] },
  cardOrder: ['primary-buy', 'primary-sell'],
  cardPositions: {
    'primary-buy': { x: 24, y: 112 },
    'primary-sell': { x: 310, y: 112 },
  },
}];

const getDefaultCardPosition = getDefaultBasicCardPosition;

const INITIAL_CARD_BLOCKS: Record<string, BasicBlock[]> = {
  'primary-buy': INITIAL_BASIC_BLOCKS.buy,
  'primary-sell': INITIAL_BASIC_BLOCKS.sell,
};

const createDefaultCardBlocks = (cardId: string, side: Side): BasicBlock[] => side === 'buy'
  ? [{ id: `${cardId}-trigger-block`, icon: Play, label: 'PRICE BAR', tone: 'data' }]
  : [{ id: `${cardId}-position-block`, icon: Play, label: 'POSITION', value: 'OPEN', tone: 'condition' }];

const TEMPLATE_LIBRARY: StrategyTemplate[] = [
  { id: 'rsi', name: 'RSI 반등', category: '모멘텀', indicator: 'RSI', buyTitle: 'RSI 반등 매수', sellTitle: 'RSI 과열 매도', buyOp: '<', buyValue: '30', sellOp: '>', sellValue: '70', description: '과매도에서 사고 과매수에서 정리해요' },
  { id: 'sma', name: 'SMA 교차', category: '추세', indicator: 'SMA', buyOp: '↑', buyValue: '20 / 60', sellOp: '↓', sellValue: '20 / 60', description: '단기선과 장기선의 교차를 따라가요' },
  { id: 'macd', name: 'MACD 전환', category: '추세', indicator: 'MACD', buyOp: '↑', buyValue: 'SIGNAL', sellOp: '↓', sellValue: 'SIGNAL', description: '추세가 바뀌는 순간을 찾아요' },
  { id: 'supertrend', name: 'Supertrend 추종', category: '추세', indicator: 'Supertrend', buyOp: '=', buyValue: 'UP', sellOp: '=', sellValue: 'DOWN', description: '큰 추세 방향에 맞춰 움직여요' },
  { id: 'bollinger', name: 'Bollinger 반전', category: '변동성', indicator: 'Bollinger', buyOp: '<', buyValue: 'LOWER', sellOp: '>', sellValue: 'UPPER', description: '가격이 밴드 끝에 닿을 때 대응해요' },
  { id: 'donchian', name: 'Donchian 돌파', category: '변동성', indicator: 'Donchian', buyOp: '↑', buyValue: 'HIGH 20', sellOp: '↓', sellValue: 'LOW 20', description: '최근 가격 범위를 벗어날 때 따라가요' },
  { id: 'volume-sma', name: '거래량 돌파', category: '거래량', indicator: 'Volume SMA', buyOp: '>', buyValue: '150%', sellOp: '<', sellValue: '70%', description: '평소보다 거래가 몰리는 종목을 찾아요' },
  { id: 'stochastic', name: 'Stochastic 반등', category: '모멘텀', indicator: 'Stochastic', buyOp: '↑', buyValue: '20', sellOp: '↓', sellValue: '80', description: '빠른 과매도·과매수 신호를 사용해요' },
];

const BLOCK_LIBRARY: BlockLibraryCategory[] = [
  { name: '데이터', tone: 'data', items: ['Open', 'High', 'Low', 'Close', 'HL2', 'HLC3', 'Volume', 'VWAP'] },
  { name: '추세 지표', tone: 'indicator', items: ['SMA', 'EMA', 'MACD', 'ADX', 'Supertrend'] },
  { name: '모멘텀 지표', tone: 'indicator', items: ['RSI', 'Stochastic', 'ROC', 'CCI', 'Williams %R'] },
  { name: '변동성 지표', tone: 'indicator', items: ['ATR', 'Bollinger', 'Keltner', 'Donchian'] },
  { name: '거래량 지표', tone: 'indicator', items: ['Volume SMA', 'OBV', 'CMF', 'VWAP'] },
  { name: '조건', tone: 'condition', items: ['A > B', 'A < B', '상향돌파', '하향돌파', 'N봉 연속', '포지션 상태'] },
  { name: '논리', tone: 'logic', items: ['AND', 'OR', 'NOT'] },
  { name: '시간·이벤트', tone: 'time', items: ['장 시작 후 N분', '특정 시각', '쿨다운', '최대 보유시간'] },
  { name: '주문', tone: 'order', items: ['매수', '매도', '공매도', '숏커버', '시장가', '지정가', '다음 봉 체결'] },
  { name: '위험관리', tone: 'risk', items: ['손절', '익절', '트레일링', '최대 포지션', '일일 최대손실'] },
];

const INITIAL_CARD_META: Record<string, CardMeta> = {
  'primary-buy': {
    title: '매수 컨테이너',
    detail: '가격 갱신 · 종목별 평가',
    explanation: '새로운 1분봉이 완성되고, RSI가 30 아래로 내려오면 전략 예산의 25%로 시장가 매수 후보를 만듭니다.',
  },
  'primary-sell': {
    title: '매도 컨테이너',
    detail: '포지션 상태 · 종목별 평가',
    explanation: '포지션을 보유한 상태에서 RSI가 70 위로 올라가면 보유 수량 100%의 매도 후보를 만듭니다.',
  },
};

const createTemplateBlocks = (template: StrategyTemplate, cardId: string, side: Side): BasicBlock[] => side === 'buy'
  ? [
    { id: `${cardId}-event`, icon: Play, label: '다음 봉 체결', tone: 'time' },
    { id: `${cardId}-indicator`, icon: Timer, label: template.indicator, op: template.buyOp, value: template.buyValue, tone: 'indicator' },
    { id: `${cardId}-budget`, icon: CircleDollarSign, label: 'BUDGET', value: '25%', tone: 'risk' },
  ]
  : [
    { id: `${cardId}-position`, icon: Play, label: '포지션 상태', value: 'OPEN', tone: 'condition' },
    { id: `${cardId}-indicator`, icon: Timer, label: template.indicator, op: template.sellOp, value: template.sellValue, tone: 'indicator' },
  ];

const createLibraryBlock = (label: string, tone: BlockTone, id: string): BasicBlock => {
  const valueByTone: Partial<Record<BlockTone, string | undefined>> = {
    data: '현재',
    indicator: '14',
    condition: '설정',
    logic: undefined,
    time: '설정',
    order: '기본',
    risk: '설정',
  };
  const iconByTone: Partial<Record<BlockTone, LucideIcon>> = {
    time: Timer,
    order: CircleDollarSign,
    risk: ShieldCheck,
  };
  return {
    id,
    icon: iconByTone[tone] ?? GitBranch,
    label,
    value: valueByTone[tone],
    tone,
  };
};

const blockOperatorCopy: Record<string, string> = {
  '<': '미만',
  '>': '초과',
  '=': '같은지',
  '↑': '상향 돌파하는지',
  '↓': '하향 돌파하는지',
};

const BLOCK_OPERATORS = ['<', '>', '=', '↑', '↓'];

const getBlockValueOptions = (block: BlockRuleInput): string[] => {
  const normalizedLabel = block.label.toUpperCase();
  if (normalizedLabel.includes('POSITION') || block.label.includes('포지션')) return ['OPEN', 'CLOSED', 'ANY'];
  if (block.tone === 'data') return ['현재', '이전 봉', '2봉 전'];
  if (block.tone === 'condition') return ['설정', 'TRUE', 'FALSE', 'OPEN', 'CLOSED'];
  if (block.tone === 'time') return ['설정', '1분', '5분', '15분', '60분'];
  if (block.tone === 'order') return ['기본', '시장가', '지정가', '다음 봉 체결'];
  if (block.tone === 'risk') return ['설정', '1%', '2%', '5%', '10%', '25%'];
  if (block.value === 'SIGNAL') return ['SIGNAL', 'ZERO', 'HISTOGRAM'];
  if (block.value === 'UP' || block.value === 'DOWN') return ['UP', 'DOWN'];
  if (block.value === 'LOWER' || block.value === 'UPPER') return ['LOWER', 'MIDDLE', 'UPPER'];
  if (String(block.value).includes(' / ')) return ['5 / 20', '10 / 30', '20 / 60', '50 / 200'];
  if (String(block.value).includes('HIGH') || String(block.value).includes('LOW')) return ['HIGH 20', 'LOW 20', 'HIGH 60', 'LOW 60'];
  return [String(block.value)];
};

const getNumericValue = (value: string | number | null | undefined) => {
  const match = String(value ?? '').trim().match(/^(-?\d+(?:\.\d+)?)(%)?$/);
  return match ? { number: Number(match[1]), suffix: match[2] ?? '' } : null;
};

const positionValueCopy: Record<string, string> = {
  OPEN: '포지션을 보유 중',
  CLOSED: '포지션을 보유하지 않음',
  ANY: '포지션 상태와 무관',
};

const getBlockRule = (block: BlockRuleInput, side?: string): ReactNode => {
  if (block.id === 'buy-trigger-block') return <><b>1분봉</b> 하나가 새로 완성될 때마다</>;
  if (block.id === 'buy-rsi-block') return <><b>RSI(14)</b>가 <b>{block.value} {blockOperatorCopy[block.op as string] ?? block.op}</b>인지 확인하고</>;
  if (block.id === 'buy-budget-block') return <>조건을 만족하면 전략 예산의 <b>{block.value}</b>를 사용해</>;
  if (block.id === 'sell-position-block') return <>먼저 현재 <b>{positionValueCopy[block.value as string] ?? block.value}</b>인지 확인하고</>;
  if (block.id === 'sell-rsi-block') return <><b>RSI(14)</b>가 <b>{block.value} {blockOperatorCopy[block.op as string] ?? block.op}</b>인지 확인한 뒤</>;

  const operatorCopy = blockOperatorCopy[block.op as string] ?? block.op;
  if (block.tone === 'time') return <><b>{block.label}</b> 이벤트가 발생하면</>;
  if (block.tone === 'data') return <><b>{block.label}</b> 데이터를 읽고</>;
  if (block.tone === 'indicator') return <><b>{block.label}</b>{block.value && <>의 기준값 <b>{block.value}</b></>}{operatorCopy && <>으로 <b>{operatorCopy}</b></>} 확인한 뒤</>;
  if (block.tone === 'condition') return <><b>{block.label}</b>{block.value && <>이 <b>{block.value}</b> 상태인지</>} 확인하고</>;
  if (block.tone === 'logic') return <><b>{block.label}</b> 논리로 앞의 조건을 연결하고</>;
  if (block.tone === 'risk') return <>위험 한도를 <b>{block.value ?? '설정값'}</b>으로 제한한 뒤</>;
  if (block.tone === 'order') return <><b>{block.label}</b> 주문 조건을 적용하고</>;
  return <><b>{block.label}</b> 블록의 설정값을 확인하고</>;
};

const getTerminalRule = (side?: string): ReactNode => side === 'buy'
  ? <>다음 봉에서 <b>시장가 매수</b> 후보를 만듭니다.</>
  : <>보유 수량의 <b>100%</b>를 <b>시장가 매도</b> 후보로 만듭니다.</>;

interface BlockRuleNoteProps {
  side: string;
  step: number;
  children?: ReactNode;
}

const BlockRuleNote = ({ side, step, children }: BlockRuleNoteProps) => <aside role="note" aria-label={`${step}단계 규칙 설명`} className={`strategy-rule-note is-${side}`}>
  <span>{String(step).padStart(2, '0')}</span>
  <p>{children}</p>
</aside>;

interface NumericBlockValueProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}

const NumericBlockValue = ({ label, value, onChange }: NumericBlockValueProps) => {
  const numeric = getNumericValue(value)!;
  const valueRef = useRef(numeric.number);
  const repeatTimerRef = useRef<number | null>(null);
  const repeatStartedAtRef = useRef(0);
  const repeatedRef = useRef(false);
  valueRef.current = numeric.number;

  const update = (next: number | string) => {
    const bounded = Math.max(0, Math.min(numeric.suffix === '%' || label === 'RSI' ? 100 : 9999, Number(next)));
    valueRef.current = Number.isFinite(bounded) ? bounded : 0;
    onChange(`${Number.isFinite(bounded) ? bounded : 0}${numeric.suffix}`);
  };

  const stopRepeating = () => {
    if (repeatTimerRef.current !== null) window.clearTimeout(repeatTimerRef.current);
    repeatTimerRef.current = null;
  };

  const cancelRepeating = () => {
    stopRepeating();
    repeatedRef.current = false;
  };

  const repeatChange = (delta: number, delay: number) => {
    repeatTimerRef.current = window.setTimeout(() => {
      repeatedRef.current = true;
      update(valueRef.current + delta);
      const elapsed = Date.now() - repeatStartedAtRef.current;
      repeatChange(delta, elapsed > 1400 ? 45 : elapsed > 750 ? 75 : 110);
    }, delay);
  };

  const beginRepeating = (event: ReactPointerEvent<HTMLButtonElement>, delta: number) => {
    if (event.button !== 0) return;
    stopRepeating();
    repeatedRef.current = false;
    repeatStartedAtRef.current = Date.now();
    repeatChange(delta, 360);
  };

  const clickOnce = (delta: number) => {
    if (repeatedRef.current) {
      repeatedRef.current = false;
      return;
    }
    update(valueRef.current + delta);
  };

  useEffect(() => {
    window.addEventListener('blur', cancelRepeating);
    return () => {
      window.removeEventListener('blur', cancelRepeating);
      cancelRepeating();
    };
  }, []);

  return <span className="block-number-stepper" aria-label={`${label} 숫자 설정`} onPointerDown={(event) => event.stopPropagation()}>
    <button
      type="button"
      aria-label={`${label} 값 감소`}
      title="길게 눌러 빠르게 조정"
      onPointerDown={(event) => beginRepeating(event, -1)}
      onPointerUp={stopRepeating}
      onPointerCancel={cancelRepeating}
      onPointerLeave={cancelRepeating}
      onClick={() => clickOnce(-1)}
    ><Minus size={11} aria-hidden="true" /></button>
    <label><span className="sr-only">{label} 값</span><input type="number" min="0" max={numeric.suffix === '%' || label === 'RSI' ? 100 : 9999} value={numeric.number} onChange={(event) => update(event.target.value)} /></label>
    <b aria-hidden="true">{numeric.suffix}</b>
    <button
      type="button"
      aria-label={`${label} 값 증가`}
      title="길게 눌러 빠르게 조정"
      onPointerDown={(event) => beginRepeating(event, 1)}
      onPointerUp={stopRepeating}
      onPointerCancel={cancelRepeating}
      onPointerLeave={cancelRepeating}
      onClick={() => clickOnce(1)}
    ><Plus size={11} aria-hidden="true" /></button>
  </span>;
};

interface CustomBlockSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  compact?: boolean;
}

const CustomBlockSelect = ({ label, value, options, onChange, compact = false }: CustomBlockSelectProps) => {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const closeFromViewportChange = () => setOpen(false);
    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeWithEscape);
    window.addEventListener('resize', closeFromViewportChange);
    window.addEventListener('scroll', closeFromViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeWithEscape);
      window.removeEventListener('resize', closeFromViewportChange);
      window.removeEventListener('scroll', closeFromViewportChange, true);
    };
  }, [open]);

  const showMenu = () => {
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = compact ? 62 : Math.max(112, bounds.width);
    const estimatedHeight = Math.min(164, options.length * 29 + 8);
    const opensUpward = window.innerHeight - bounds.bottom < estimatedHeight + 8;
    setMenuPosition({
      left: Math.max(8, Math.min(window.innerWidth - width - 8, bounds.right - width)),
      top: opensUpward ? Math.max(8, bounds.top - estimatedHeight - 4) : bounds.bottom + 4,
      width,
    });
    setOpen(true);
  };

  const moveSelection = (direction: number) => {
    const currentIndex = Math.max(0, options.indexOf(value));
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    onChange(options[nextIndex]);
    showMenu();
  };

  return <span
    className={`block-custom-select ${compact ? 'is-compact' : ''} ${open ? 'is-open' : ''}`}
    ref={rootRef}
    onPointerDown={(event) => event.stopPropagation()}
  >
    <button
      ref={triggerRef}
      type="button"
      className="block-custom-select-trigger"
      role="combobox"
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      data-value={value}
      onClick={() => open ? setOpen(false) : showMenu()}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          moveSelection(event.key === 'ArrowDown' ? 1 : -1);
        }
      }}
    ><span>{value}</span><ChevronDown size={11} aria-hidden="true" /></button>
    {open && menuPosition && createPortal(<span
      ref={menuRef}
      className={`block-custom-select-menu ${compact ? 'is-compact' : ''}`}
      role="listbox"
      aria-label={`${label} 옵션`}
      style={menuPosition}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {options.map((option) => <button
        key={option}
        type="button"
        role="option"
        aria-selected={option === value}
        onClick={() => {
          onChange(option);
          setOpen(false);
        }}
      ><span>{option}</span>{option === value && <Check size={11} aria-hidden="true" />}</button>)}
    </span>, document.body)}
  </span>;
};

interface BlockProps {
  icon?: LucideIcon;
  label: string;
  value?: string;
  op?: string;
  tone?: BlockTone;
  locked?: boolean;
  onChange?: (patch: { op?: string; value?: string }) => void;
}

const Block = ({ icon: Icon, label, value, op, tone = 'neutral', locked = false, onChange }: BlockProps) => {
  const numeric = getNumericValue(value);
  const block = { label, value, op, tone };
  return <div className={`scratch-block block-${tone}`}>
    {Icon && <Icon size={15} />}
    <span>{label}</span>
    {op && (locked
      ? <b className="block-op">{op}</b>
      : <CustomBlockSelect compact label={`${label} 연산자`} value={op} options={BLOCK_OPERATORS} onChange={(nextOp) => onChange!({ op: nextOp })} />)}
    {value && (locked
      ? <span className="block-value is-locked">{value}</span>
      : numeric
        ? <NumericBlockValue label={label} value={value} onChange={(nextValue) => onChange!({ value: nextValue })} />
        : <CustomBlockSelect label={`${label} 값 선택`} value={value} options={getBlockValueOptions(block)} onChange={(nextValue) => onChange!({ value: nextValue })} />)}
  </div>;
};

interface StrategyBlockProps extends BlockProps {
  id: string;
  fixed?: boolean;
  dragging?: boolean;
  dragProps?: HTMLAttributes<HTMLDivElement> & { 'data-drop-target'?: string };
  showRule?: boolean;
  rule?: ReactNode;
  ruleSide?: 'left' | 'right';
  ruleStep?: number;
}

const StrategyBlock = ({ id, fixed = false, dragging = false, dragProps = {}, showRule = false, rule, ruleSide = 'right', ruleStep = 1, ...blockProps }: StrategyBlockProps) => <div
  className={`block-with-copy ${fixed ? 'fixed-terminal-block' : 'draggable-strategy-block'} ${dragging ? 'is-dragging' : ''}`}
  data-testid={id}
  aria-disabled={fixed ? 'true' : undefined}
  aria-label={fixed ? undefined : `${blockProps.label} 블록. 드래그하거나 Alt와 방향키로 이동`}
  draggable={fixed ? undefined : true}
  tabIndex={fixed ? undefined : 0}
  {...dragProps}
>{!fixed && <GripVertical className="block-drag-handle" size={14} aria-hidden="true" />}<Block {...blockProps} locked={fixed} />{showRule && <BlockRuleNote side={ruleSide} step={ruleStep}>{rule}</BlockRuleNote>}</div>;

/* Shared by read-only strategy surfaces so launched snapshots keep the exact
   block silhouette, tone system, spacing, and terminal shape of the editor. */
export interface ReadOnlyStrategyBlockProps extends BlockProps {
  id: string;
  fixed?: boolean;
  showRule?: boolean;
  rule?: ReactNode;
  ruleSide?: 'left' | 'right';
  ruleStep?: number;
}

export const ReadOnlyStrategyBlock = ({
  id,
  fixed = false,
  showRule = false,
  rule,
  ruleSide = 'right',
  ruleStep = 1,
  ...blockProps
}: ReadOnlyStrategyBlockProps) => {
  const resolvedRule = rule ?? (fixed
    ? getTerminalRule(blockProps.tone)
    : getBlockRule(blockProps, blockProps.tone));
  return <div
    className={`block-with-copy ${fixed ? 'fixed-terminal-block' : 'draggable-strategy-block'} is-read-only`}
    data-testid={id}
    aria-label={`${blockProps.label} 읽기 전용 블록`}
  >
    {!fixed && <GripVertical className="block-drag-handle" size={14} aria-hidden="true" />}
    <Block {...blockProps} locked />
    {showRule && <BlockRuleNote side={ruleSide} step={ruleStep}>{resolvedRule}</BlockRuleNote>}
  </div>;
};

interface BasicEditorProps {
  goBack: () => void;
  openEditor?: (mode: EditorMode) => void;
  onLaunchBot?: (bot: { name: string; description: string }) => void;
}

export function BasicEditor({ goBack, openEditor, onLaunchBot }: BasicEditorProps) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState('section-1');
  const [selectedCardId, setSelectedCardId] = useState<string | null>('primary-buy');
  const [sections, setSections] = useState<StrategySection[]>(INITIAL_STRATEGY_SECTIONS);
  const [cardBlocks, setCardBlocks] = useState<Record<string, BasicBlock[]>>(INITIAL_CARD_BLOCKS);
  const [cardMeta, setCardMeta] = useState<Record<string, CardMeta>>(INITIAL_CARD_META);
  const [draggedBlock, setDraggedBlock] = useState<{ cardId: string; blockId: string } | null>(null);
  const [draggedCard, setDraggedCard] = useState<{ sectionId: string; side: Side; cardId: string } | null>(null);
  const [libraryDrag, setLibraryDrag] = useState<LibraryDragPayload | null>(null);
  const [dragTarget, setDragTarget] = useState<{ cardId: string; index: number } | null>(null);
  const [customBlockCount, setCustomBlockCount] = useState(0);
  const [cardCount, setCardCount] = useState(2);
  const [drawMode, setDrawMode] = useState(false);
  const [drawStart, setDrawStart] = useState<CanvasPoint | null>(null);
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null);
  const [pan, setPan] = useState<CanvasPoint>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panGesture, setPanGesture] = useState<CardMoveGesture | null>(null);
  const [spacePanning, setSpacePanning] = useState(false);
  const spacePanningRef = useRef(false);
  const pointerPositionRef = useRef<CanvasPoint | null>(null);
  const [sectionMove, setSectionMove] = useState<SectionMoveGesture | null>(null);
  const [cardMove, setCardMove] = useState<CardMoveState | null>(null);
  const trashZoneRef = useRef<HTMLDivElement | null>(null);
  const [trashReady, setTrashReady] = useState(false);
  const cardElementsRef = useRef(new Map<string, HTMLDivElement>());
  const [cardSizes, setCardSizes] = useState<Record<string, CanvasSize>>({});
  const [announcement, setAnnouncement] = useState('');
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);
  const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
  const [botName, setBotName] = useState('');
  const [botDescription, setBotDescription] = useState('');
  const [templateQuery, setTemplateQuery] = useState('');
  const [blockQuery, setBlockQuery] = useState('');
  const toggleGroup = (group: string) => setActiveGroup((current) => current === group ? null : group);
  const filteredTemplates = useMemo(() => TEMPLATE_LIBRARY.filter((template) => (
    `${template.name} ${template.category} ${template.indicator}`.toLowerCase().includes(templateQuery.trim().toLowerCase())
  )), [templateQuery]);
  const filteredBlockLibrary = useMemo(() => BLOCK_LIBRARY.map((category) => ({
    ...category,
    items: category.items.filter((item) => item.toLowerCase().includes(blockQuery.trim().toLowerCase())),
  })).filter((category) => category.items.length > 0), [blockQuery]);
  const validationIssues = useMemo<ValidationIssue[]>(() => {
    if (sections.length === 0) {
      return [{
        id: 'strategy-no-section',
        sectionId: null,
        cardId: null,
        message: '매수 컨테이너가 포함된 파티션을 하나 이상 만들어 주세요.',
      }];
    }

    return sections.flatMap((section, sectionIndex): ValidationIssue[] => {
      const sectionLabel = `PARTITION ${String(sectionIndex + 1).padStart(2, '0')}`;
      if (section.cards.buy.length === 0) {
        return [{
          id: `${section.id}-no-buy`,
          sectionId: section.id,
          cardId: null,
          message: `${sectionLabel}에 매수 컨테이너가 필요합니다.`,
        }];
      }
      return section.cards.buy
        .filter((cardId) => (cardBlocks[cardId]?.length ?? 0) === 0)
        .map((cardId) => ({
          id: `${cardId}-empty`,
          sectionId: section.id,
          cardId,
          message: `${sectionLabel}의 매수 컨테이너에 조건 블록을 하나 이상 추가해 주세요.`,
        }));
    });
  }, [cardBlocks, sections]);
  const validationSignature = validationIssues.map((issue) => issue.id).join('|');
  const isLaunchable = validationIssues.length === 0;
  const invalidSectionIds = new Set(validationIssues.map((issue) => issue.sectionId).filter(Boolean));
  const invalidCardIds = new Set(validationIssues.map((issue) => issue.cardId).filter(Boolean));

  useEffect(() => {
    setSaveFeedback(null);
  }, [validationSignature]);

  useEffect(() => {
    if (!saveFeedback) return undefined;

    const dismissTimer = window.setTimeout(() => {
      setSaveFeedback(null);
    }, 2_000);

    return () => window.clearTimeout(dismissTimer);
  }, [saveFeedback]);

  const saveStrategy = () => {
    const nextFeedback: SaveFeedback = isLaunchable
      ? {
        tone: 'positive',
        title: '출시 가능 상태로 저장했습니다.',
        detail: '현재 확인 항목을 모두 만족합니다.',
      }
      : {
        tone: 'warning',
        title: '미완성 상태로 저장했습니다.',
        detail: '매수 조건을 완성하면 출시할 수 있습니다.',
      };
    setSaveFeedback(nextFeedback);
    setAnnouncement(`${nextFeedback.title} ${nextFeedback.detail}`);
  };

  const closeLaunchDialog = () => {
    setLaunchDialogOpen(false);
    setBotName('');
    setBotDescription('');
  };

  const preparePersonalBotLaunch = () => {
    if (!isLaunchable) {
      const nextFeedback: SaveFeedback = {
        tone: 'warning',
        title: `출시하려면 ${validationIssues.length}개 항목을 완성해 주세요.`,
        detail: validationIssues[0].message,
      };
      setSaveFeedback(nextFeedback);
      setAnnouncement(`${nextFeedback.title} ${nextFeedback.detail}`);
      return;
    }

    setSaveFeedback(null);
    setLaunchDialogOpen(true);
    setAnnouncement('개인 운용 봇 정보를 입력해 주세요.');
  };

  const launchPersonalBot = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = botName.trim();
    const description = botDescription.trim();
    if (!name || !description) return;

    closeLaunchDialog();
    onLaunchBot?.({ name, description });
  };

  useEffect(() => {
    if (!launchDialogOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLaunchDialog();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [launchDialogOpen]);

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
  }, [activeGroup, cardBlocks, sections]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => (target as Element | null)?.closest?.('input, textarea, select, button, [role="combobox"], [contenteditable="true"]');
    const stopSpacePanning = () => {
      spacePanningRef.current = false;
      setSpacePanning(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isTypingTarget(event.target)) return;
      event.preventDefault();
      if (spacePanningRef.current) return;
      spacePanningRef.current = true;
      setSpacePanning(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') stopSpacePanning();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', stopSpacePanning);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', stopSpacePanning);
    };
  }, []);

  const moveBlock = (sourceCardId: string, blockId: string, targetCardId: string, targetIndex: number) => {
    const movingLabel = cardBlocks[sourceCardId].find((block) => block.id === blockId)?.label ?? '선택한';
    setCardBlocks((current) => {
      const sourceBlocks = [...current[sourceCardId]];
      const sourceIndex = sourceBlocks.findIndex((block) => block.id === blockId);
      if (sourceIndex < 0) return current;

      const [movingBlock] = sourceBlocks.splice(sourceIndex, 1);
      const targetBlocks = sourceCardId === targetCardId ? sourceBlocks : [...current[targetCardId]];
      const adjustedIndex = sourceCardId === targetCardId && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      const insertionIndex = Math.max(0, Math.min(adjustedIndex, targetBlocks.length));
      targetBlocks.splice(insertionIndex, 0, movingBlock);

      return sourceCardId === targetCardId
        ? { ...current, [sourceCardId]: targetBlocks }
        : { ...current, [sourceCardId]: sourceBlocks, [targetCardId]: targetBlocks };
    });
    setAnnouncement(`${movingLabel} 조건 블록을 이동했습니다.`);
  };

  const startDragging = (event: DragEvent<HTMLDivElement>, cardId: string, blockId: string) => {
    event.stopPropagation();
    if ((event.target as Element).closest?.('button, input, select')) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', blockId);
    setDraggedBlock({ cardId, blockId });
  };

  const dropBlock = (event: DragEvent<HTMLElement>, targetCardId: string, targetIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    if (draggedBlock) moveBlock(draggedBlock.cardId, draggedBlock.blockId, targetCardId, targetIndex);
    setDraggedBlock(null);
    setDragTarget(null);
  };

  const moveWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>, cardId: string, blockId: string, index: number) => {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveBlock(cardId, blockId, cardId, Math.max(0, index - 1));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveBlock(cardId, blockId, cardId, Math.min(cardBlocks[cardId].length, index + 2));
    } else if (cardId === 'primary-buy' && event.key === 'ArrowRight') {
      event.preventDefault();
      moveBlock(cardId, blockId, 'primary-sell', cardBlocks['primary-sell'].length);
    } else if (cardId === 'primary-sell' && event.key === 'ArrowLeft') {
      event.preventDefault();
      moveBlock(cardId, blockId, 'primary-buy', cardBlocks['primary-buy'].length);
    }
  };

  const addBlock = (cardId: string, side: Side) => {
    const nextCount = customBlockCount + 1;
    setCustomBlockCount(nextCount);
    setCardBlocks((current) => ({
      ...current,
      [cardId]: [...current[cardId], {
        id: cardId === 'primary-buy' || cardId === 'primary-sell'
          ? `${side}-custom-block-${nextCount}`
          : `${cardId}-custom-block-${nextCount}`,
        icon: Timer,
        label: '이동평균',
        op: side === 'buy' ? '>' : '<',
        value: '20',
        tone: 'indicator',
      }],
    }));
    setAnnouncement(`${side === 'buy' ? '매수' : '매도'} 컨테이너에 이동평균 조건을 추가했습니다.`);
  };

  const applyTemplate = (template: StrategyTemplate, targetSectionId: string = activeSectionId) => {
    const targetSection = sections.find((section) => section.id === targetSectionId) ?? sections[0];
    if (!targetSection) return;
    const nextCardCount = cardCount + 1;
    const buyCardId = `${targetSection.id}-${template.id}-buy-${nextCardCount}`;
    const sellCardId = `${targetSection.id}-${template.id}-sell-${nextCardCount + 1}`;
    setCardCount(nextCardCount + 1);
    setCardBlocks((current) => ({
      ...current,
      [buyCardId]: createTemplateBlocks(template, buyCardId, 'buy'),
      [sellCardId]: createTemplateBlocks(template, sellCardId, 'sell'),
    }));
    setCardMeta((current) => ({
      ...current,
      [buyCardId]: {
        title: template.buyTitle ?? `${template.name} 매수`,
        detail: `${template.category} 패키지 · 쉬운 시작`,
        explanation: `${template.description} 매수 조건을 만족하면 주문 후보를 만듭니다.`,
      },
      [sellCardId]: {
        title: template.sellTitle ?? `${template.name} 매도`,
        detail: `${template.category} 패키지 · 자동 청산`,
        explanation: `${template.description} 반대 신호가 나오면 보유 포지션을 정리합니다.`,
      },
    }));
    setSections((current) => current.map((section) => section.id === targetSection.id
      ? {
        ...section,
        cards: {
          buy: [...section.cards.buy, buyCardId],
          sell: [...section.cards.sell, sellCardId],
        },
        cardOrder: [...section.cardOrder, buyCardId, sellCardId],
        cardPositions: {
          ...section.cardPositions,
          [buyCardId]: getDefaultCardPosition(section.cardOrder.length),
          [sellCardId]: getDefaultCardPosition(section.cardOrder.length + 1),
        },
      }
      : section));
    setSelectedCardId(buyCardId);
    setActiveSectionId(targetSection.id);
    setAnnouncement(`${template.name} 패키지의 매수·매도 컨테이너를 ${targetSection.id.replace('section-', 'PARTITION ')}에 추가했습니다.`);
  };

  const addLibraryBlock = (label: string, tone: BlockTone, targetCardId: string | null = selectedCardId, targetIndex?: number) => {
    if (!targetCardId || !cardBlocks[targetCardId]) {
      setAnnouncement('먼저 블록을 넣을 매수 또는 매도 컨테이너를 선택해 주세요.');
      return;
    }
    const nextCount = customBlockCount + 1;
    setCustomBlockCount(nextCount);
    setCardBlocks((current) => {
      const nextBlocks = [...current[targetCardId]];
      const insertionIndex = targetIndex == null
        ? nextBlocks.length
        : Math.max(0, Math.min(targetIndex, nextBlocks.length));
      nextBlocks.splice(insertionIndex, 0, createLibraryBlock(label, tone, `${targetCardId}-library-${nextCount}`));
      return { ...current, [targetCardId]: nextBlocks };
    });
    setSelectedCardId(targetCardId);
    setAnnouncement(`${label} 블록을 대상 컨테이너에 추가했습니다.`);
  };

  const startLibraryDrag = (event: DragEvent<HTMLButtonElement>, payload: LibraryDragPayload) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', payload.type === 'template' ? payload.template.name : payload.label);
    setLibraryDrag(payload);
  };

  const finishLibraryDrag = () => {
    setLibraryDrag(null);
    setDragTarget(null);
  };

  const deleteBlock = (cardId: string, blockId: string) => {
    const blockLabel = cardBlocks[cardId]?.find((block) => block.id === blockId)?.label ?? '선택한';
    setCardBlocks((current) => ({
      ...current,
      [cardId]: (current[cardId] ?? []).filter((block) => block.id !== blockId),
    }));
    setDraggedBlock(null);
    setDragTarget(null);
    setTrashReady(false);
    setAnnouncement(`${blockLabel} 블록을 삭제했습니다.`);
  };

  const deleteStrategyCard = (sectionId: string, cardId: string) => {
    setSections((current) => current.map((section) => {
      if (section.id !== sectionId) return section;
      const cardPositions = { ...section.cardPositions };
      delete cardPositions[cardId];
      return {
        ...section,
        cards: {
          buy: section.cards.buy.filter((id) => id !== cardId),
          sell: section.cards.sell.filter((id) => id !== cardId),
        },
        cardOrder: section.cardOrder.filter((id) => id !== cardId),
        cardPositions,
      };
    }));
    setCardBlocks((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
    setCardMeta((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
    setSelectedCardId((current) => current === cardId ? null : current);
    setActiveGroup((current) => current === cardId ? null : current);
    setDraggedCard(null);
    setCardMove(null);
    setTrashReady(false);
    setAnnouncement('컨테이너를 삭제했습니다.');
  };

  const deleteSection = (sectionId: string) => {
    const targetSection = sections.find((section) => section.id === sectionId);
    const deletedCardIds = new Set<string | null>(targetSection?.cardOrder ?? []);
    const remainingSections = sections.filter((section) => section.id !== sectionId);
    setSections(remainingSections);
    setCardBlocks((current) => Object.fromEntries(
      Object.entries(current).filter(([cardId]) => !deletedCardIds.has(cardId))
    ));
    setCardMeta((current) => Object.fromEntries(
      Object.entries(current).filter(([cardId]) => !deletedCardIds.has(cardId))
    ));
    setActiveSectionId((current) => current === sectionId ? (remainingSections[0]?.id ?? '') : current);
    setSelectedCardId((current) => deletedCardIds.has(current) ? null : current);
    setActiveGroup((current) => deletedCardIds.has(current) ? null : current);
    setSectionMove(null);
    setTrashReady(false);
    setAnnouncement('파티션을 삭제했습니다.');
  };

  const isPointerOverTrash = (event: { clientX: number; clientY: number }) => {
    const bounds = trashZoneRef.current?.getBoundingClientRect();
    if (!bounds) return false;
    return event.clientX >= bounds.left
      && event.clientX <= bounds.right
      && event.clientY >= bounds.top
      && event.clientY <= bounds.bottom;
  };

  const dropOnTrash = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (draggedBlock) {
      deleteBlock(draggedBlock.cardId, draggedBlock.blockId);
    } else if (draggedCard) {
      deleteStrategyCard(draggedCard.sectionId, draggedCard.cardId);
    }
  };

  const dropLibraryBlock = (event: DragEvent<HTMLElement>, targetCardId: string, targetIndex?: number) => {
    if (libraryDrag?.type !== 'block') return false;
    event.preventDefault();
    event.stopPropagation();
    addLibraryBlock(libraryDrag.label, libraryDrag.tone, targetCardId, targetIndex);
    finishLibraryDrag();
    return true;
  };

  const updateStrategyBlock = (cardId: string, blockId: string, patch: Partial<BasicBlock>) => {
    setCardBlocks((current) => ({
      ...current,
      [cardId]: current[cardId].map((block) => block.id === blockId ? { ...block, ...patch } : block),
    }));
    setAnnouncement('블록 설정을 변경했습니다.');
  };

  const renderEditableBlocks = (cardId: string, side: Side, showRules: boolean) => cardBlocks[cardId].map((block, index) => <StrategyBlock
    key={block.id}
    {...block}
    showRule={showRules}
    rule={getBlockRule(block, side)}
    ruleSide={side === 'buy' ? 'right' : 'left'}
    ruleStep={index + 1}
    onChange={(patch) => updateStrategyBlock(cardId, block.id, patch)}
    dragging={draggedBlock?.blockId === block.id}
    dragProps={{
      onDragStart: (event) => startDragging(event, cardId, block.id),
      onDragEnd: () => { setDraggedBlock(null); setDragTarget(null); setTrashReady(false); },
      onDragOver: (event) => {
        if (libraryDrag?.type === 'block') {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setDragTarget({ cardId, index });
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDragTarget({ cardId, index });
      },
      onDragLeave: () => setDragTarget(null),
      onDrop: (event) => {
        if (!dropLibraryBlock(event, cardId, index)) dropBlock(event, cardId, index);
      },
      onKeyDown: (event) => moveWithKeyboard(event, cardId, block.id, index),
      'data-drop-target': dragTarget?.cardId === cardId && dragTarget?.index === index ? 'true' : undefined,
    }}
  />);

  const updateSection = (sectionId: string, patch: Partial<StrategySection>) => setSections((current) => current.map((section) => (
    section.id === sectionId ? { ...section, ...patch } : section
  )));

  const updateCardPosition = (sectionId: string, cardId: string, position: CanvasPoint) => {
    setSections((current) => current.map((section) => section.id === sectionId
      ? {
        ...section,
        cardPositions: {
          ...section.cardPositions,
          [cardId]: position,
        },
      }
      : section));
  };

  const getSectionLayout = (section: StrategySection) => {
    return getBasicSectionLayout(
      section.cardOrder,
      (cardId, index) => section.cardPositions?.[cardId] ?? getDefaultCardPosition(index),
      cardSizes,
    );
  };

  const addStrategyCard = (sectionId: string, side: Side) => {
    const section = sections.find((item) => item.id === sectionId)!;
    const nextCardCount = cardCount + 1;
    const cardId = `${sectionId}-${side}-${section.cards[side].length + 1}-${nextCardCount}`;
    setCardCount(nextCardCount);
    setCardBlocks((current) => ({ ...current, [cardId]: createDefaultCardBlocks(cardId, side) }));
    setCardMeta((current) => ({
      ...current,
      [cardId]: {
        title: `${side === 'buy' ? '매수' : '매도'} 컨테이너`,
        detail: '직접 구성 · 블록을 추가해 보세요',
        explanation: `오른쪽 BLOCKS에서 조건을 골라 ${side === 'buy' ? '매수' : '매도'} 규칙을 구성합니다.`,
      },
    }));
    setSections((current) => current.map((item) => item.id === sectionId
      ? {
        ...item,
        cards: { ...item.cards, [side]: [...item.cards[side], cardId] },
        cardOrder: [...item.cardOrder, cardId],
        cardPositions: {
          ...item.cardPositions,
          [cardId]: getDefaultCardPosition(item.cardOrder.length),
        },
      }
      : item));
    setActiveSectionId(sectionId);
    setSelectedCardId(cardId);
    setAnnouncement(`${sectionId.replace('section-', 'PARTITION ')}에 ${side === 'buy' ? '매수' : '매도'} 컨테이너를 추가했습니다.`);
  };

  const startCardDrag = (event: DragEvent<HTMLDivElement>, sectionId: string, side: Side, cardId: string) => {
    if (draggedBlock) return;
    if ((event.target as Element).closest?.('.strategy-card-move-handle')) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', cardId);
    setDraggedCard({ sectionId, side, cardId });
  };

  const moveStrategyCard = (targetSectionId: string, targetIndex: number) => {
    if (!draggedCard || draggedBlock) return;
    const sourceSection = sections.find((section) => section.id === draggedCard.sectionId)!;
    if (draggedCard.side === 'buy' && sourceSection.cards.buy.length === 1 && sourceSection.id !== targetSectionId) {
      setAnnouncement('각 파티션에는 매수 컨테이너가 하나 이상 필요합니다.');
      setDraggedCard(null);
      return;
    }
    setSections((current) => current.map((section) => {
      const side = draggedCard.side;
      if (section.id === draggedCard.sectionId && section.id === targetSectionId) {
        const cardOrder = [...section.cardOrder];
        const sourceIndex = cardOrder.indexOf(draggedCard.cardId);
        if (sourceIndex < 0) return section;
        cardOrder.splice(sourceIndex, 1);
        const adjustedIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        cardOrder.splice(Math.max(0, Math.min(adjustedIndex, cardOrder.length)), 0, draggedCard.cardId);
        return { ...section, cardOrder };
      }
      if (section.id === draggedCard.sectionId) {
        const cardPositions = { ...section.cardPositions };
        delete cardPositions[draggedCard.cardId];
        return {
          ...section,
          cards: { ...section.cards, [side]: section.cards[side].filter((id) => id !== draggedCard.cardId) },
          cardOrder: section.cardOrder.filter((id) => id !== draggedCard.cardId),
          cardPositions,
        };
      }
      if (section.id === targetSectionId && !section.cards[side].includes(draggedCard.cardId)) {
        const cards = [...section.cards[side]];
        cards.push(draggedCard.cardId);
        const cardOrder = [...section.cardOrder];
        cardOrder.splice(Math.max(0, Math.min(targetIndex, cardOrder.length)), 0, draggedCard.cardId);
        return {
          ...section,
          cards: { ...section.cards, [side]: cards },
          cardOrder,
          cardPositions: {
            ...section.cardPositions,
            [draggedCard.cardId]: getDefaultCardPosition(section.cardOrder.length),
          },
        };
      }
      return section;
    }));
    setAnnouncement(`${draggedCard.side === 'buy' ? '매수' : '매도'} 블록의 위치를 변경했습니다.`);
    setDraggedCard(null);
  };

  const dropCardOnSection = (event: DragEvent<HTMLElement>, targetSectionId: string) => {
    event.preventDefault();
    if (!draggedCard) return;
    const targetSection = sections.find((section) => section.id === targetSectionId)!;
    moveStrategyCard(targetSectionId, targetSection.cardOrder.length);
  };

  const dropOnSection = (event: DragEvent<HTMLElement>, targetSectionId: string) => {
    if (libraryDrag?.type === 'template') {
      event.preventDefault();
      event.stopPropagation();
      applyTemplate(libraryDrag.template, targetSectionId);
      finishLibraryDrag();
      return;
    }
    dropCardOnSection(event, targetSectionId);
  };

  const dropCardBefore = (event: DragEvent<HTMLElement>, targetSectionId: string, targetIndex: number) => {
    if (!draggedCard) return;
    event.preventDefault();
    event.stopPropagation();
    moveStrategyCard(targetSectionId, targetIndex);
  };

  const pointInSurface = (event: ReactPointerEvent<HTMLDivElement>): CanvasPoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left - pan.x) / zoom,
      y: (event.clientY - bounds.top - pan.y) / zoom,
    };
  };

  const beginCanvasGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (drawMode) {
      const point = pointInSurface(event);
      setDrawStart(point);
      setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 });
    } else {
      setPanGesture({ startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y });
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const zoomCanvasWithWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (drawMode || sectionMove || cardMove) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    const next = getStrategyCanvasWheelZoom(zoom, pan, event.deltaY, cursorX, cursorY);
    if (!next) return;
    setZoom(next.zoom);
    setPan(next.pan);
  };

  const updateCursorSpotlight = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const canvas = event.currentTarget.closest<HTMLElement>('.basic-canvas');
    if (!canvas) return;
    canvas.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`);
    canvas.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`);
    canvas.style.setProperty('--spotlight-opacity', '1');
  };

  const hideCursorSpotlight = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.closest<HTMLElement>('.basic-canvas')?.style.setProperty('--spotlight-opacity', '0');
    pointerPositionRef.current = null;
  };

  const updateCanvasGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    updateCursorSpotlight(event);
    const previousPointer = pointerPositionRef.current;
    pointerPositionRef.current = { x: event.clientX, y: event.clientY };
    if (cardMove) {
      setTrashReady(isPointerOverTrash(event));
      updateCardPosition(
        cardMove.sectionId,
        cardMove.cardId,
        getMovedBasicCardPosition(cardMove, event.clientX, event.clientY, zoom),
      );
      return;
    }
    if (sectionMove) {
      setTrashReady(isPointerOverTrash(event));
      updateSection(sectionMove.sectionId, {
        x: sectionMove.originX + (event.clientX - sectionMove.startX) / zoom,
        y: sectionMove.originY + (event.clientY - sectionMove.startY) / zoom,
      });
      return;
    }
    if (panGesture) {
      setPan({
        x: panGesture.originX + event.clientX - panGesture.startX,
        y: panGesture.originY + event.clientY - panGesture.startY,
      });
      return;
    }
    if (spacePanningRef.current) {
      if (previousPointer) {
        setPan((current) => ({
          x: current.x + event.clientX - previousPointer.x,
          y: current.y + event.clientY - previousPointer.y,
        }));
      }
      return;
    }
    if (drawStart) {
      const point = pointInSurface(event);
      setDraftRect({
        x: Math.min(drawStart.x, point.x),
        y: Math.min(drawStart.y, point.y),
        width: Math.abs(point.x - drawStart.x),
        height: Math.abs(point.y - drawStart.y),
      });
    }
  };

  const finishCanvasGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const shouldDelete = event?.type !== 'pointercancel' && isPointerOverTrash(event);
    if (shouldDelete && cardMove) {
      deleteStrategyCard(cardMove.sectionId, cardMove.cardId);
      setDrawStart(null);
      setDraftRect(null);
      setPanGesture(null);
      return;
    }
    if (shouldDelete && sectionMove) {
      deleteSection(sectionMove.sectionId);
      setDrawStart(null);
      setDraftRect(null);
      setPanGesture(null);
      return;
    }
    if (drawStart && draftRect && draftRect.width >= 120 && draftRect.height >= 100) {
      const sectionNumber = sections.length + 1;
      const sectionId = `section-${sectionNumber}`;
      const buyCardId = `${sectionId}-buy-1`;
      setCardBlocks((current) => ({ ...current, [buyCardId]: createDefaultCardBlocks(buyCardId, 'buy') }));
      setCardMeta((current) => ({
        ...current,
        [buyCardId]: {
          title: '매수 컨테이너',
          detail: '직접 구성 · 블록을 추가해 보세요',
          explanation: '오른쪽 BLOCKS에서 조건을 골라 매수 규칙을 구성합니다.',
        },
      }));
      setSections((current) => [...current, {
        id: sectionId,
        symbol: '종목 선택',
        allocation: 10,
        x: draftRect.x,
        y: draftRect.y,
        width: Math.max(600, draftRect.width),
        minHeight: Math.max(340, draftRect.height),
        cards: { buy: [buyCardId], sell: [] },
        cardOrder: [buyCardId],
        cardPositions: { [buyCardId]: getDefaultCardPosition(0) },
      }]);
      setActiveSectionId(sectionId);
      setSelectedCardId(buyCardId);
      setAnnouncement(`PARTITION ${String(sectionNumber).padStart(2, '0')}을 만들었습니다. 매수 컨테이너가 기본으로 포함됩니다.`);
    }
    if (drawStart) setDrawMode(false);
    setDrawStart(null);
    setDraftRect(null);
    setPanGesture(null);
    setSectionMove(null);
    setCardMove(null);
    setTrashReady(false);
  };

  const beginSectionMove = (event: ReactPointerEvent<HTMLElement>, section: StrategySection) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveSectionId(section.id);
    setSectionMove({ sectionId: section.id, startX: event.clientX, startY: event.clientY, originX: section.x, originY: section.y });
    event.currentTarget.closest('.section-workspace')?.setPointerCapture?.(event.pointerId);
  };

  const beginSectionAreaMove = (event: ReactPointerEvent<HTMLElement>, section: StrategySection) => {
    if (event.button !== 0) return;
    if ((event.target as Element).closest?.('button, input, select, label, .strategy-card')) return;
    beginSectionMove(event, section);
  };

  const beginCardMove = (event: ReactPointerEvent<HTMLElement>, section: StrategySection, cardId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const position = section.cardPositions?.[cardId] ?? getDefaultCardPosition(section.cardOrder.indexOf(cardId));
    setActiveSectionId(section.id);
    setSelectedCardId(cardId);
    setCardMove({
      sectionId: section.id,
      cardId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    });
    event.currentTarget.closest('.section-workspace')?.setPointerCapture?.(event.pointerId);
  };

  const renderStrategyCard = (section: StrategySection, side: Side, cardId: string, cardIndex: number) => {
    const isPrimary = cardId === `primary-${side}`;
    const testId = isPrimary ? `basic-${side}-group` : `strategy-card-${cardId}`;
    const stackTestId = isPrimary ? `basic-${side}-stack` : `strategy-stack-${cardId}`;
    const explanationId = `${cardId}-translation`;
    const isExplained = activeGroup === cardId;
    const isSelected = selectedCardId === cardId;
    const sideLabel = side === 'buy' ? '매수' : '매도';
    const terminalValue = side === 'buy' ? 'MARKET' : '100%';
    const meta = cardMeta[cardId] ?? {
      title: `${sideLabel} 컨테이너`,
      detail: '직접 구성 · 블록을 추가해 보세요',
      explanation: `오른쪽 BLOCKS에서 조건을 골라 ${sideLabel} 규칙을 구성합니다.`,
    };
    const position = section.cardPositions?.[cardId] ?? getDefaultCardPosition(cardIndex);
    return <div
      key={cardId}
      className={`strategy-container content-sized-strategy ${side}-container strategy-card ${isExplained ? 'is-explained' : ''} ${isSelected ? 'is-selected' : ''} ${invalidCardIds.has(cardId) ? 'has-validation-error' : ''} ${draggedCard?.cardId === cardId ? 'is-card-dragging' : ''} ${cardMove?.cardId === cardId ? 'is-free-moving' : ''} ${libraryDrag?.type === 'block' ? 'is-library-drop-ready' : ''}`}
      data-testid={testId}
      data-strategy-card={cardId}
      data-selected={isSelected ? 'true' : undefined}
      ref={(element) => {
        if (element) cardElementsRef.current.set(cardId, element);
        else cardElementsRef.current.delete(cardId);
      }}
      style={{ left: position.x, top: position.y }}
      draggable
      onDragStart={(event) => startCardDrag(event, section.id, side, cardId)}
      onDragEnd={() => { setDraggedCard(null); setTrashReady(false); }}
      onDragOver={(event) => {
        if (libraryDrag?.type === 'block') {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          return;
        }
        if (draggedCard) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(event) => {
        if (!dropLibraryBlock(event, cardId, cardBlocks[cardId].length)) dropCardBefore(event, section.id, cardIndex);
      }}
    >
      <button
        className="strategy-card-move-handle"
        type="button"
        draggable="false"
        aria-label={`${sideLabel} 컨테이너 자유 이동${isPrimary ? '' : ` ${cardIndex + 1}`}`}
        onPointerDown={(event) => beginCardMove(event, section, cardId)}
      ><GripVertical size={14} /><span>MOVE</span></button>
      <button
        className="strategy-container-header"
        aria-label={`${sideLabel} 컨테이너 자연어 설명${isPrimary ? '' : ` ${cardIndex + 1}`}`}
        aria-expanded={isExplained}
        aria-controls={explanationId}
        onClick={() => {
          setActiveSectionId(section.id);
          setSelectedCardId(cardId);
          toggleGroup(cardId);
        }}
      ><span className="container-symbol">{side === 'buy' ? 'B' : 'S'}</span><div><strong>{meta.title}</strong><small>{meta.detail}</small>{isSelected && <em className="strategy-target-badge">블록 대상</em>}{invalidCardIds.has(cardId) && <em className="strategy-validation-badge">조건 필요</em>}</div><span>{cardBlocks[cardId].length + 1} BLOCKS</span></button>
      <div id={explanationId} className="block-stack" data-testid={stackTestId} aria-label={`${sideLabel} 컨테이너 규칙 흐름`} onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = libraryDrag?.type === 'block' ? 'copy' : 'move';
      }} onDrop={(event) => {
        if (!dropLibraryBlock(event, cardId, cardBlocks[cardId].length)) dropBlock(event, cardId, cardBlocks[cardId].length);
      }}>
        {renderEditableBlocks(cardId, side, isExplained)}
        <button className="block-add" onClick={() => addBlock(cardId, side)}><Plus size={14} /> 블록 추가</button>
      </div>
      <footer className="strategy-container-footer" aria-label={`고정 ${sideLabel} 출력`}><StrategyBlock id={isPrimary ? `${side}-order-block` : `${cardId}-order-block`} fixed icon={Check} label={side.toUpperCase()} value={terminalValue} tone={side} showRule={isExplained} rule={getTerminalRule(side)} ruleSide={side === 'buy' ? 'right' : 'left'} ruleStep={cardBlocks[cardId].length + 1} /></footer>
    </div>;
  };

  const trashItemLabel = draggedBlock
    ? '블록'
    : (draggedCard || cardMove)
      ? '컨테이너'
      : sectionMove
        ? '파티션'
        : null;

  return <Localized><div
    className="page editor-page basic-editor-page editor-shell-page"
    onPointerDownCapture={(event) => {
      if (!activeGroup) return;
      if ((event.target as Element).closest?.('.strategy-container-header')) return;
      setActiveGroup(null);
    }}
  >
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    <div className="basic-editor-commandbar floating-editor-controls" role="toolbar" aria-label="Basic 편집 작업">
      <div className="basic-editor-context"><Button className="floating-editor-button" kind="ghost" icon={ArrowLeft} onClick={goBack}>목록</Button><div className="floating-editor-mode-controls" role="group" aria-label="편집기 전환"><Button className="floating-editor-button active" onClick={() => openEditor?.('basic')}>Basic 편집기</Button><Button className="floating-editor-button" onClick={() => openEditor?.('pro')}>Pro 편집기</Button></div></div>
      <div className="basic-editor-actions">
        <Button className="floating-editor-button" icon={Save} onClick={saveStrategy}>저장</Button>
        <div className="editor-launch-action">
          <Button
            className="floating-editor-button"
            kind="primary"
            icon={Rocket}
            aria-describedby="personal-bot-launch-tooltip"
            onClick={preparePersonalBotLaunch}
          >개인 봇 출시</Button>
          <span className="editor-action-tooltip" id="personal-bot-launch-tooltip" role="tooltip">
            <strong>개인 운용 봇</strong>
            <small>전략을 검증하고 바로 출시해요.</small>
          </span>
        </div>
      </div>
    </div>
    <div className="editor-layout basic-layout full-editor-workspace" data-testid="basic-editor-workspace">
      <div className="basic-editor-left-rail" data-testid="basic-editor-left-rail">
        <section
          className={`basic-validation-summary ${isLaunchable ? 'is-launchable' : 'is-incomplete'}`}
          role="region"
          aria-label="전략 완성도"
          aria-live="polite"
        >
          <span className="basic-validation-icon" aria-hidden="true">
            {isLaunchable ? <Check size={15} /> : <TriangleAlert size={15} />}
          </span>
          <div>
            <strong>{isLaunchable ? '출시 가능한 전략' : '미완성 전략'}</strong>
            <small>{isLaunchable ? '현재 필수 조건을 모두 만족합니다.' : '아래 조건을 만족해야 출시가 가능합니다.'}</small>
            {!isLaunchable && <ul>{validationIssues.map((issue) => <li key={issue.id}>{issue.message}</li>)}</ul>}
          </div>
        </section>
        <aside className="editor-palette template-library-panel panel floating-editor-panel" data-testid="basic-templates-panel">
          <div className="palette-title"><span>PACKAGES</span><Sparkles size={15} /></div>
          <p className="library-intro">잘 몰라도 괜찮아요. 원하는 방식을 고르면 매수와 매도 규칙을 함께 만들어 드려요.</p>
          <label className="palette-search"><Search size={14} /><input aria-label="패키지 검색" placeholder="RSI, 추세, 돌파" value={templateQuery} onChange={(event) => setTemplateQuery(event.target.value)} /></label>
          <div className="template-list">
            {filteredTemplates.map((template) => <button
              key={template.id}
              className={`template-card ${libraryDrag?.type === 'template' && libraryDrag.template.id === template.id ? 'is-library-dragging' : ''}`}
              aria-label={`${template.name} 패키지 적용`}
              draggable
              onDragStart={(event) => startLibraryDrag(event, { type: 'template', template })}
              onDragEnd={finishLibraryDrag}
              onClick={() => applyTemplate(template)}
            >
              <span className={`template-icon tone-${template.category}`}><Sparkles size={14} /></span>
              <span><strong>{template.name}</strong><small>{template.description}</small></span>
              <Plus size={14} />
            </button>)}
          </div>
          <div className="library-target">
            <span>추가 위치</span>
            <strong>PARTITION {activeSectionId.replace('section-', '').padStart(2, '0')}</strong>
            <small>클릭하거나 원하는 파티션으로 드래그하세요.</small>
          </div>
        </aside>
      </div>
      <section
        className="editor-canvas basic-canvas"
        aria-label="Basic 전략 캔버스"
        style={{
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          '--canvas-pan-x': `${pan.x}px`,
          '--canvas-pan-y': `${pan.y}px`,
        } as CSSProperties}
      >
        <div className="cursor-dot-spotlight" data-testid="cursor-dot-spotlight" aria-hidden="true" />
        <div className="section-draw-controls" role="group" aria-label="파티션 도구">
          <button className={`floating-editor-button ${drawMode ? 'active' : ''}`} aria-label="파티션 그리기" aria-pressed={drawMode} onClick={() => setDrawMode((current) => !current)}><Plus size={14} /> 파티션 그리기</button>
          <span>{drawMode ? '빈 공간을 드래그해 파티션을 만드세요' : `${sections.length}개 파티션 · 휠: 확대/축소 · 파티션 드래그: 이동`}</span>
        </div>
        <div className="floating-zoom-controls" role="group" aria-label="캔버스 확대/축소">
          <button className="floating-editor-button" aria-label="축소" disabled={zoom <= .5} onClick={() => setZoom((current) => Math.max(.5, Number((current - .1).toFixed(1))))}>−</button>
          <button className="floating-editor-button zoom-level" aria-label="배율 초기화" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{Math.round(zoom * 100)}%</button>
          <button className="floating-editor-button" aria-label="확대" disabled={zoom >= 2} onClick={() => setZoom((current) => Math.min(2, Number((current + .1).toFixed(1))))}>+</button>
        </div>
        <div className="mobile-editor-notice"><Boxes size={24} /><strong>전략 편집은 데스크톱에서 사용할 수 있습니다</strong><span>현재 화면에서는 구성만 조회할 수 있습니다.</span></div>
        <div
          className={`section-workspace ${drawMode ? 'is-drawing-mode' : ''} ${panGesture || spacePanning ? 'is-panning' : ''} ${spacePanning ? 'is-space-panning' : ''} ${cardMove ? 'is-moving-card' : ''}`}
          data-testid="section-drawing-surface"
          onPointerDown={beginCanvasGesture}
          onPointerMove={updateCanvasGesture}
          onPointerUp={finishCanvasGesture}
          onPointerCancel={finishCanvasGesture}
          onPointerLeave={hideCursorSpotlight}
          onWheel={zoomCanvasWithWheel}
        >
          <div className="section-world" data-testid="section-world" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}>
          {draftRect && <div className="section-draft-rectangle" aria-hidden="true" style={{ left: draftRect.x, top: draftRect.y, width: draftRect.width, height: draftRect.height }} />}
          {sections.map((section, sectionIndex) => {
            const sectionNumber = String(sectionIndex + 1).padStart(2, '0');
            const sectionLayout = getSectionLayout(section);
            return <article
              key={section.id}
              className={`strategy-section-frame ${activeSectionId === section.id ? 'is-selected' : ''} ${invalidSectionIds.has(section.id) ? 'has-validation-error' : ''} ${draggedCard ? 'is-card-drop-ready' : ''} ${sectionMove?.sectionId === section.id ? 'is-section-moving' : ''} ${libraryDrag?.type === 'template' ? 'is-template-drop-ready' : ''}`}
              data-testid={`strategy-${section.id}`}
              aria-label={`PARTITION ${sectionNumber}`}
              style={{ left: section.x, top: section.y, width: sectionLayout.width, height: sectionLayout.height }}
              onClick={() => setActiveSectionId(section.id)}
              onPointerDown={(event) => beginSectionAreaMove(event, section)}
              onDragOver={(event) => {
                if (libraryDrag?.type === 'template') {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                  return;
                }
                if (draggedCard) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(event) => dropOnSection(event, section.id)}
            >
              <i className="section-corner corner-top-left" aria-hidden="true" />
              <i className="section-corner corner-top-right" aria-hidden="true" />
              <header className="strategy-section-header">
                <button className="section-move-handle" data-testid={`${section.id}-move-handle`} aria-label={`PARTITION ${sectionNumber} 이동`} onPointerDown={(event) => beginSectionMove(event, section)}><GripVertical size={16} /></button>
                <div className="section-identity"><span>PARTITION {sectionNumber}</span><strong>{section.symbol}</strong><small>매수 {section.cards.buy.length} · 매도 {section.cards.sell.length}</small></div>
                <div className="section-settings">
                  <label><span>종목</span><select aria-label={`PARTITION ${sectionNumber} 종목`} value={section.symbol} onChange={(event) => updateSection(section.id, { symbol: event.target.value })}><option>종목 선택</option><option>AAPL</option><option>MSFT</option><option>SPY</option><option>NVDA</option><option>AAPL · MSFT · SPY</option></select></label>
                  <label><span>전체 자본 대비</span><span className="section-allocation"><input type="number" min="1" max="100" aria-label={`PARTITION ${sectionNumber} 전체 자본 대비 투자비율`} value={section.allocation} onChange={(event) => updateSection(section.id, { allocation: Number(event.target.value) })} /><b>%</b></span></label>
                </div>
                <div className="section-card-actions"><button onClick={() => addStrategyCard(section.id, 'buy')}><Plus size={13} /> 매수 컨테이너 추가</button><button onClick={() => addStrategyCard(section.id, 'sell')}><Plus size={13} /> 매도 컨테이너 추가</button></div>
              </header>
              <div className="section-strategy-grid">
                {section.cardOrder.map((cardId, cardIndex) => renderStrategyCard(section, section.cards.buy.includes(cardId) ? 'buy' : 'sell', cardId, cardIndex))}
                {section.cards.buy.length === 0 && <button
                  className="required-buy-slot"
                  aria-label={`PARTITION ${sectionNumber} 필수 매수 컨테이너 추가`}
                  onClick={() => addStrategyCard(section.id, 'buy')}
                ><TriangleAlert size={18} /><strong>매수 컨테이너가 필요해요</strong><span>필수 항목 · 추가해야 출시할 수 있어요</span></button>}
                {section.cards.sell.length === 0 && <button className="optional-sell-slot" onClick={() => addStrategyCard(section.id, 'sell')}><Plus size={18} /><strong>매도 컨테이너 추가</strong><span>선택 사항 · 없어도 저장할 수 있어요</span></button>}
              </div>
            </article>;
          })}
          </div>
        </div>
      </section>
      <aside className="editor-inspector block-library-panel panel floating-editor-panel" data-testid="basic-block-library">
        <div className="inspector-title"><span>BLOCKS</span><Boxes size={15} /></div>
        <div className="block-library-target">
          <span>블록을 넣을 곳</span>
          <strong>{cardMeta[selectedCardId!]?.title ?? '컨테이너를 선택해 주세요'}</strong>
          <small>클릭하거나 원하는 컨테이너로 드래그하세요.</small>
        </div>
        <label className="palette-search"><Search size={14} /><input aria-label="블록 검색" placeholder="MACD, 조건, 손절" value={blockQuery} onChange={(event) => setBlockQuery(event.target.value)} /></label>
        <div className="block-category-list">
          {filteredBlockLibrary.map((category) => <details className={`block-category tone-${category.tone}`} open key={category.name}>
            <summary><ChevronDown size={14} /><span>{category.name}</span><b>{category.items.length}</b></summary>
            <div className="block-chip-list">
              {category.items.map((item) => <button
                key={`${category.name}-${item}`}
                className={libraryDrag?.type === 'block' && libraryDrag.label === item && libraryDrag.tone === category.tone ? 'is-library-dragging' : ''}
                aria-label={`${item} 블록 추가`}
                draggable
                onDragStart={(event) => startLibraryDrag(event, { type: 'block', label: item, tone: category.tone })}
                onDragEnd={finishLibraryDrag}
                onClick={() => addLibraryBlock(item, category.tone)}
              >{item}<Plus size={11} /></button>)}
            </div>
          </details>)}
        </div>
      </aside>
    </div>
    {trashItemLabel && <div
      ref={(element) => { trashZoneRef.current = element; }}
      className={`editor-trash-zone ${cardMove || sectionMove ? 'is-pointer-trash' : ''} ${trashReady ? 'is-ready' : ''}`}
      role="region"
      aria-label={`${trashItemLabel} 삭제 영역`}
      data-testid="editor-trash-zone"
      onDragEnter={(event) => {
        event.preventDefault();
        setTrashReady(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setTrashReady(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTrashReady(false);
      }}
      onDrop={dropOnTrash}
    >
      <span className="editor-trash-icon"><Trash2 size={18} aria-hidden="true" /></span>
      <span className="editor-trash-copy"><strong>{trashItemLabel} 버리기</strong><small>여기에 놓으면 삭제됩니다</small></span>
    </div>}
    {saveFeedback && <div className={`editor-save-toast is-bottom-center tone-${saveFeedback.tone}`} role="alert" aria-atomic="true">
      <span aria-hidden="true">{saveFeedback.tone === 'positive' ? <Check size={16} /> : <TriangleAlert size={16} />}</span>
      <div><strong>{saveFeedback.title}</strong><small>{saveFeedback.detail}</small></div>
      <button type="button" aria-label="저장 알림 닫기" onClick={() => setSaveFeedback(null)}><X size={14} /></button>
    </div>}
    {launchDialogOpen && createPortal(<div
      className="personal-bot-launch-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeLaunchDialog();
      }}
    >
      <section
        className="personal-bot-launch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="personal-bot-launch-title"
      >
        <header>
          <span className="personal-bot-launch-icon" aria-hidden="true"><Rocket size={18} /></span>
          <div>
            <small>PERSONAL BOT</small>
            <h2 id="personal-bot-launch-title">개인 운용 봇 출시</h2>
            <p>전략을 실행할 봇의 이름과 설명을 정해 주세요.</p>
          </div>
          <button type="button" aria-label="출시 창 닫기" onClick={closeLaunchDialog}><X size={17} /></button>
        </header>
        <form onSubmit={launchPersonalBot}>
          <label className="personal-bot-launch-field">
            <span><strong>봇 이름</strong><small>{botName.length}/40</small></span>
            <input
              autoFocus
              aria-label="봇 이름"
              maxLength={40}
              placeholder="예: Momentum Scout"
              value={botName}
              onChange={(event) => setBotName(event.target.value)}
            />
            <small>봇 목록에서 쉽게 찾을 수 있는 이름을 입력해 주세요.</small>
          </label>
          <label className="personal-bot-launch-field">
            <span><strong>봇 설명</strong><small>{botDescription.length}/160</small></span>
            <textarea
              aria-label="봇 설명"
              maxLength={160}
              rows={4}
              placeholder="이 봇이 어떤 전략으로 운용되는지 간단히 설명해 주세요."
              value={botDescription}
              onChange={(event) => setBotDescription(event.target.value)}
            />
          </label>
          <div className="personal-bot-launch-note">
            <ShieldCheck size={16} aria-hidden="true" />
            <span><strong>개인 운용으로 시작합니다</strong><small>출시 후 봇 운영 화면에서 상태를 확인할 수 있어요.</small></span>
          </div>
          <footer>
            <Button type="button" onClick={closeLaunchDialog}>취소</Button>
            <Button
              type="submit"
              kind="primary"
              icon={Rocket}
              disabled={!botName.trim() || !botDescription.trim()}
            >봇 출시하기</Button>
          </footer>
        </form>
      </section>
    </div>, document.body)}
  </div></Localized>;
}

const PRO_NODE_WIDTH = 196;
const PRO_PORT_START = 88;
const PRO_PORT_GAP = 26;

type ProPortType = 'universe' | 'series' | 'scalar' | 'signal' | 'order';

interface ProPort {
  id: string;
  type: ProPortType;
  label: string;
  testId?: string;
}

interface ProNodeBlueprint {
  id: string;
  kicker: string;
  title: string;
  detail: string;
  icon: LucideIcon;
  group?: string;
  inputs: ProPort[];
  outputs: ProPort[];
}

interface ProNodeLibraryCategory {
  category: string;
  tone: BlockTone;
  items: ProNodeBlueprint[];
}

interface ProNode {
  id: string;
  blueprintId: string;
  kicker: string;
  title: string;
  detail: string;
  tone: BlockTone;
  icon: LucideIcon;
  inputs: ProPort[];
  outputs: ProPort[];
  params: { threshold: string; timeframe: string };
  x: number;
  y: number;
}

interface ProLinkEnd {
  nodeId: string;
  portId: string;
}

interface ProLink {
  id: string;
  from: ProLinkEnd;
  to: ProLinkEnd;
}

interface NodeMoveGesture extends CardMoveGesture {
  nodeId: string;
}

interface LinkDraft {
  source: ProLinkEnd;
  type: ProPortType;
  origin: CanvasPoint;
  point: CanvasPoint;
}

interface ProPicker {
  x: number;
  y: number;
  type: ProPortType;
  source: ProLinkEnd;
}

type ProNotice =
  | { kind: 'error'; problem: string; impact: string; fix: string; count?: number }
  | { kind: 'info'; message: string }
  | { kind: 'undo'; message: string; restore: { node: ProNode; links: ProLink[] } };

interface ProValidationIssue {
  nodeId: string | null;
  problem: string;
  impact: string;
  fix: string;
}

const PRO_PORT_TYPES: Record<ProPortType, { name: string; shape: string }> = {
  universe: { name: '종목 집합', shape: '이중 원' },
  series: { name: '시세 계열', shape: '정사각형' },
  scalar: { name: '지표 값', shape: '마름모' },
  signal: { name: '판단 신호', shape: '삼각형' },
  order: { name: '주문 후보', shape: '육각형' },
};

const describePortType = (type: ProPortType) => PRO_PORT_TYPES[type] ?? { name: type, shape: '기본 모양' };

const PRO_NODE_LIBRARY: ProNodeLibraryCategory[] = [
  {
    category: '유니버스',
    tone: 'universe',
    items: [{
      id: 'basket',
      kicker: 'UNIVERSE',
      title: '직접 선택 바스켓',
      detail: '사용자가 직접 고른 종목 집합',
      icon: Boxes,
      inputs: [],
      outputs: [{ id: 'out', type: 'universe', label: '종목 집합' }],
    }],
  },
  {
    category: '시장 데이터',
    tone: 'data',
    items: [{
      id: 'quotes',
      kicker: 'DATA',
      title: '가격·거래량',
      detail: '시간축을 직접 선택합니다',
      icon: Layers3,
      inputs: [{ id: 'in', type: 'universe', label: '종목 집합' }],
      outputs: [{ id: 'out', type: 'series', label: '시세 계열' }],
    }],
  },
  {
    category: '특징 · 지표',
    tone: 'indicator',
    items: [{
      id: 'feature',
      kicker: 'FEATURE',
      title: '지표 계산',
      detail: '기간을 직접 입력합니다',
      icon: Sparkles,
      inputs: [{ id: 'in', type: 'series', label: '시세 계열' }],
      outputs: [{ id: 'out', type: 'scalar', label: '지표 값' }],
    }],
  },
  {
    category: '조건 · 신호',
    tone: 'condition',
    items: [{
      id: 'compare',
      kicker: 'CONDITION',
      title: '값 비교',
      detail: '같은 타입의 두 값 비교',
      icon: GitBranch,
      group: '조건 · 비교',
      inputs: [{ id: 'in', type: 'scalar', label: '지표 값' }],
      outputs: [{ id: 'true', type: 'signal', label: '참 신호' }, { id: 'false', type: 'signal', label: '거짓 신호' }],
    }, {
      id: 'position',
      kicker: 'CONDITION',
      title: '포지션 확인',
      detail: '보유 수량과 상태 비교',
      icon: ShieldCheck,
      group: '조건 · 비교',
      inputs: [{ id: 'in', type: 'signal', label: '판단 신호' }],
      outputs: [{ id: 'true', type: 'signal', label: '참 신호' }, { id: 'false', type: 'signal', label: '거짓 신호' }],
    }],
  },
  {
    category: '일정 · 제어',
    tone: 'logic',
    items: [{
      id: 'branch',
      kicker: 'CONTROL',
      title: '분기',
      detail: '같은 신호를 여러 갈래로 보냅니다',
      icon: Split,
      inputs: [{ id: 'in', type: 'signal', label: '판단 신호' }],
      outputs: [{ id: 'a', type: 'signal', label: '갈래 1' }, { id: 'b', type: 'signal', label: '갈래 2' }],
    }, {
      id: 'merge',
      kicker: 'CONTROL',
      title: '합류',
      detail: '여러 갈래를 하나로 모읍니다',
      icon: Import,
      inputs: [{ id: 'a', type: 'signal', label: '갈래 1' }, { id: 'b', type: 'signal', label: '갈래 2' }],
      outputs: [{ id: 'out', type: 'signal', label: '판단 신호' }],
    }],
  },
  {
    category: '주문 실행',
    tone: 'order',
    items: [{
      id: 'buy-candidate',
      kicker: 'CANDIDATE',
      title: '매수 후보',
      detail: '시장 주문 후보를 만듭니다',
      icon: CircleDollarSign,
      group: '주문 후보',
      inputs: [{ id: 'in', type: 'signal', label: '판단 신호' }],
      outputs: [{ id: 'out', type: 'order', label: '주문 후보' }],
    }, {
      id: 'sell-candidate',
      kicker: 'CANDIDATE',
      title: '매도 후보',
      detail: '보유 포지션 청산 후보를 만듭니다',
      icon: CircleDollarSign,
      group: '주문 후보',
      inputs: [{ id: 'in', type: 'signal', label: '판단 신호' }],
      outputs: [{ id: 'out', type: 'order', label: '주문 후보' }],
    }],
  },
  {
    category: '위험관리',
    tone: 'risk',
    items: [{
      id: 'processor',
      kicker: 'FINALIZE',
      title: '주문 처리기',
      detail: '중복 제거 · 예산 · 위험 검사',
      icon: ShieldCheck,
      inputs: [{ id: 'in', type: 'order', label: '주문 후보' }],
      outputs: [{ id: 'out', type: 'order', label: '모의 주문' }],
    }],
  },
];

const PRO_BLUEPRINTS = Object.fromEntries(PRO_NODE_LIBRARY.flatMap((category) => category.items.map((item): [string, ProNodeBlueprint & { category: string; tone: BlockTone }] => [
  item.id,
  { ...item, category: category.category, tone: category.tone },
])));

const proNodeHeight = (node: ProNode) => PRO_PORT_START + Math.max(node.inputs.length, node.outputs.length, 1) * PRO_PORT_GAP + 12;

const proPortPoint = (node: ProNode, direction: 'in' | 'out', index: number): CanvasPoint => ({
  x: node.x + (direction === 'out' ? PRO_NODE_WIDTH : 0),
  y: node.y + PRO_PORT_START + index * PRO_PORT_GAP,
});

const proLinkPath = (from: CanvasPoint, to: CanvasPoint) => {
  const curve = Math.max(46, Math.min(150, Math.abs(to.x - from.x) * .55));
  return `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`;
};

const createProNode = (blueprintId: string, id: string, x: number, y: number, overrides: Partial<ProNode> = {}): ProNode => {
  const blueprint = PRO_BLUEPRINTS[blueprintId];
  return {
    id,
    blueprintId,
    kicker: blueprint.kicker,
    title: blueprint.title,
    detail: blueprint.detail,
    tone: blueprint.tone,
    icon: blueprint.icon,
    inputs: blueprint.inputs.map((port) => ({ ...port })),
    outputs: blueprint.outputs.map((port) => ({ ...port })),
    params: { threshold: '', timeframe: '' },
    x,
    y,
    ...overrides,
  };
};

const INITIAL_PRO_NODES: ProNode[] = [
  createProNode('basket', 'node-basket', 24, 176),
  createProNode('quotes', 'node-quotes', 256, 176),
  createProNode('feature', 'node-feature-a', 488, 40, { title: '지표 계산 A' }),
  createProNode('feature', 'node-feature-b', 488, 312, { title: '지표 계산 B' }),
  createProNode('compare', 'node-compare-a', 720, 40, {
    title: '값 비교 A',
    outputs: [{ id: 'true', type: 'signal', label: '참 신호', testId: 'true-output' }, { id: 'false', type: 'signal', label: '거짓 신호' }],
  }),
  createProNode('compare', 'node-compare-b', 720, 312, { title: '값 비교 B' }),
  createProNode('merge', 'node-merge', 952, 172),
  createProNode('buy-candidate', 'node-buy', 1184, 176),
  createProNode('processor', 'node-processor', 1416, 176),
];

const INITIAL_PRO_LINKS: ProLink[] = [
  { id: 'link-1', from: { nodeId: 'node-basket', portId: 'out' }, to: { nodeId: 'node-quotes', portId: 'in' } },
  { id: 'link-2', from: { nodeId: 'node-quotes', portId: 'out' }, to: { nodeId: 'node-feature-a', portId: 'in' } },
  { id: 'link-3', from: { nodeId: 'node-quotes', portId: 'out' }, to: { nodeId: 'node-feature-b', portId: 'in' } },
  { id: 'link-4', from: { nodeId: 'node-feature-a', portId: 'out' }, to: { nodeId: 'node-compare-a', portId: 'in' } },
  { id: 'link-5', from: { nodeId: 'node-feature-b', portId: 'out' }, to: { nodeId: 'node-compare-b', portId: 'in' } },
  { id: 'link-6', from: { nodeId: 'node-compare-a', portId: 'true' }, to: { nodeId: 'node-merge', portId: 'a' } },
  { id: 'link-7', from: { nodeId: 'node-compare-b', portId: 'true' }, to: { nodeId: 'node-merge', portId: 'b' } },
  { id: 'link-8', from: { nodeId: 'node-merge', portId: 'out' }, to: { nodeId: 'node-buy', portId: 'in' } },
  { id: 'link-9', from: { nodeId: 'node-buy', portId: 'out' }, to: { nodeId: 'node-processor', portId: 'in' } },
];

const PRO_TIMEFRAMES = ['1분', '5분', '15분', '1시간', '1일'];

interface ProEditorProps {
  goBack: () => void;
  openEditor?: (mode: EditorMode) => void;
}

export function ProEditor({ goBack, openEditor }: ProEditorProps) {
  const [nodes, setNodes] = useState<ProNode[]>(INITIAL_PRO_NODES);
  const [links, setLinks] = useState<ProLink[]>(INITIAL_PRO_LINKS);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('node-compare-a');
  const [pan, setPan] = useState<CanvasPoint>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panGesture, setPanGesture] = useState<CardMoveGesture | null>(null);
  const [spacePanning, setSpacePanning] = useState(false);
  const [nodeMove, setNodeMove] = useState<NodeMoveGesture | null>(null);
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  const [picker, setPicker] = useState<ProPicker | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [libraryDrag, setLibraryDrag] = useState<ProNodeBlueprint | null>(null);
  const [nodeQuery, setNodeQuery] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [notice, setNotice] = useState<ProNotice | null>(null);
  const [trashReady, setTrashReady] = useState(false);
  const spacePanningRef = useRef(false);
  const pointerPositionRef = useRef<CanvasPoint | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const trashZoneRef = useRef<HTMLDivElement | null>(null);
  const sequenceRef = useRef(INITIAL_PRO_LINKS.length);

  const nodeById = useMemo(() => Object.fromEntries(nodes.map((node): [string, ProNode] => [node.id, node])), [nodes]);
  const filteredLibrary = useMemo(() => PRO_NODE_LIBRARY.map((category) => ({
    ...category,
    items: category.items.filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(nodeQuery.trim().toLowerCase())),
  })).filter((category) => category.items.length > 0), [nodeQuery]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const isInputLinked = (nodeId: string, portId: string) => links.some((link) => link.to.nodeId === nodeId && link.to.portId === portId);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => (target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
    const stopSpacePanning = () => {
      spacePanningRef.current = false;
      setSpacePanning(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTypingTarget(event.target)) {
        event.preventDefault();
        if (spacePanningRef.current) return;
        spacePanningRef.current = true;
        setSpacePanning(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') stopSpacePanning();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', stopSpacePanning);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', stopSpacePanning);
    };
  }, []);

  const nextId = (prefix: string) => {
    sequenceRef.current += 1;
    return `${prefix}-${sequenceRef.current}`;
  };

  const worldPoint = (clientX: number, clientY: number): CanvasPoint => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: (clientX - bounds.left - pan.x) / zoom,
      y: (clientY - bounds.top - pan.y) / zoom,
    };
  };

  const reachesNode = (startNodeId: string, targetNodeId: string) => {
    const visited = new Set<string>();
    const walk = (nodeId: string): boolean => {
      if (nodeId === targetNodeId) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      return links.filter((link) => link.from.nodeId === nodeId).some((link) => walk(link.to.nodeId));
    };
    return walk(startNodeId);
  };

  const rejectConnection = (problem: string, impact: string, fix: string) => {
    setNotice({ kind: 'error', problem, impact, fix });
    setAnnouncement(`연결하지 못했습니다. ${problem} ${impact} ${fix}`);
  };

  const connectPorts = (source: ProLinkEnd, target: ProLinkEnd) => {
    const fromNode = nodeById[source.nodeId];
    const toNode = nodeById[target.nodeId];
    const fromPort = fromNode?.outputs.find((port) => port.id === source.portId);
    const toPort = toNode?.inputs.find((port) => port.id === target.portId);
    if (!fromNode || !toNode || !fromPort || !toPort) return;

    if (fromNode.id === toNode.id) {
      rejectConnection('같은 노드의 출력과 입력을 연결했습니다.', '실행 순서를 정할 수 없어 연결을 저장하지 않았습니다.', '다른 노드의 입력 연결부에 놓아 주세요.');
      return;
    }
    if (fromPort.type !== toPort.type) {
      const from = describePortType(fromPort.type);
      const to = describePortType(toPort.type);
      rejectConnection(`${from.name} 출력을 ${to.name} 입력에 연결했습니다.`, '타입이 달라 값을 전달할 수 없어 연결을 저장하지 않았습니다.', `같은 모양(${from.shape})의 연결부끼리 이어 주세요.`);
      return;
    }
    if (isInputLinked(target.nodeId, target.portId)) {
      rejectConnection('이 입력 연결부에는 이미 연결이 있습니다.', '입력 하나는 값 하나만 받을 수 있어 연결을 저장하지 않았습니다.', '기존 연결을 지우거나 합류 노드로 여러 갈래를 모아 주세요.');
      return;
    }
    if (reachesNode(target.nodeId, source.nodeId)) {
      rejectConnection('연결이 실행 순서를 되돌리는 순환을 만듭니다.', '순환이 있으면 실행 순서를 정할 수 없어 연결을 저장하지 않았습니다.', '앞 단계로 돌아가지 않는 방향으로 연결해 주세요.');
      return;
    }

    setLinks((current) => [...current, { id: nextId('link'), from: source, to: target }]);
    setNotice(null);
    setAnnouncement(`${fromNode.title}의 ${fromPort.label} 출력을 ${toNode.title}의 ${toPort.label} 입력에 연결했습니다.`);
  };

  const deleteNode = (nodeId: string) => {
    const node = nodeById[nodeId];
    if (!node) return;
    const removedLinks = links.filter((link) => link.from.nodeId === nodeId || link.to.nodeId === nodeId);
    setNodes((current) => current.filter((item) => item.id !== nodeId));
    setLinks((current) => current.filter((link) => link.from.nodeId !== nodeId && link.to.nodeId !== nodeId));
    setSelectedNodeId((current) => current === nodeId ? null : current);
    setNodeMove(null);
    setTrashReady(false);
    setNotice({ kind: 'undo', message: `${node.title} 노드와 연결 ${removedLinks.length}개를 삭제했습니다.`, restore: { node, links: removedLinks } });
    setAnnouncement(`${node.title} 노드를 삭제했습니다. 실행 취소로 되돌릴 수 있습니다.`);
  };

  const undoDelete = () => {
    if (notice?.kind !== 'undo') return;
    const { node, links: removedLinks } = notice.restore;
    setNodes((current) => [...current, node]);
    setLinks((current) => [...current, ...removedLinks]);
    setSelectedNodeId(node.id);
    setNotice(null);
    setAnnouncement(`${node.title} 노드와 연결을 복원했습니다.`);
  };

  const deleteLink = (linkId: string) => {
    setLinks((current) => current.filter((link) => link.id !== linkId));
    setAnnouncement('연결을 삭제했습니다.');
  };

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => (target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
    const handleDelete = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (!selectedNodeId || isTypingTarget(event.target)) return;
      event.preventDefault();
      deleteNode(selectedNodeId);
    };
    window.addEventListener('keydown', handleDelete);
    return () => window.removeEventListener('keydown', handleDelete);
  });

  const addNode = (blueprintId: string, position: CanvasPoint) => {
    const node = createProNode(blueprintId, nextId(`node-${blueprintId}`), Math.round(position.x), Math.round(position.y));
    setNodes((current) => [...current, node]);
    setSelectedNodeId(node.id);
    setNotice(null);
    setAnnouncement(`${node.title} 노드를 캔버스에 추가했습니다.`);
    return node;
  };

  const addNodeAtViewportCenter = (blueprintId: string) => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    const center = bounds && bounds.width
      ? worldPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      : { x: 260, y: 220 };
    addNode(blueprintId, { x: center.x - PRO_NODE_WIDTH / 2, y: center.y - PRO_PORT_START / 2 });
  };

  const addNodeFromPicker = (item: ProNodeBlueprint) => {
    if (!picker) return;
    const point = worldPoint(picker.x, picker.y);
    const node = createProNode(item.id, nextId(`node-${item.id}`), Math.round(point.x), Math.round(point.y - PRO_PORT_START));
    const targetPort = node.inputs.find((port) => port.type === picker.type);
    setNodes((current) => [...current, node]);
    if (picker.source && targetPort) {
      setLinks((current) => [...current, { id: nextId('link'), from: picker.source, to: { nodeId: node.id, portId: targetPort.id } }]);
    }
    setSelectedNodeId(node.id);
    setPicker(null);
    setPickerQuery('');
    setNotice(null);
    setAnnouncement(`${node.title} 노드를 추가하고 연결했습니다.`);
  };

  const pickerGroups = useMemo(() => {
    if (!picker) return [];
    const query = pickerQuery.trim().toLowerCase();
    const groups = new Map<string, Array<ProNodeBlueprint & { tone: BlockTone }>>();
    PRO_NODE_LIBRARY.forEach((category) => category.items.forEach((item) => {
      if (!item.inputs.some((port) => port.type === picker.type)) return;
      if (query && !`${item.title} ${item.detail}`.toLowerCase().includes(query)) return;
      const name = item.group ?? category.category;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push({ ...item, tone: category.tone });
    }));
    return [...groups.entries()].map(([name, items]) => ({ name, items }));
  }, [picker, pickerQuery]);

  const isPointerOverTrash = (event: { clientX: number; clientY: number }) => {
    const bounds = trashZoneRef.current?.getBoundingClientRect();
    if (!bounds) return false;
    return event.clientX >= bounds.left && event.clientX <= bounds.right
      && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
  };

  const beginNodeMove = (event: ReactPointerEvent<HTMLElement>, node: ProNode, fromHandle = false) => {
    if (event.button !== 0) return;
    if (!fromHandle && (event.target as Element).closest?.('button, input, select, .graph-port')) return;
    event.stopPropagation();
    setSelectedNodeId(node.id);
    setNodeMove({ nodeId: node.id, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y });
    workspaceRef.current?.setPointerCapture?.(event.pointerId);
  };

  const beginLink = (event: ReactPointerEvent<HTMLButtonElement>, node: ProNode, portId: string, type: ProPortType) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const index = node.outputs.findIndex((port) => port.id === portId);
    const origin = proPortPoint(node, 'out', index);
    setSelectedNodeId(node.id);
    setLinkDraft({ source: { nodeId: node.id, portId }, type, origin, point: origin });
  };

  const releaseOnOutput = (event: ReactPointerEvent<HTMLButtonElement>, node: ProNode, portId: string, type: ProPortType) => {
    event.stopPropagation();
    if (linkDraft && linkDraft.source.nodeId !== node.id) {
      setLinkDraft(null);
      rejectConnection('출력 연결부끼리 연결했습니다.', '출력은 다른 노드의 입력으로만 이어질 수 있어 연결을 저장하지 않았습니다.', '왼쪽 방향의 입력 연결부에 놓아 주세요.');
      return;
    }
    setLinkDraft(null);
    setPicker({ x: event.clientX, y: event.clientY, type, source: { nodeId: node.id, portId } });
    setPickerQuery('');
  };

  const releaseOnInput = (event: ReactPointerEvent<HTMLButtonElement>, node: ProNode, portId: string) => {
    if (!linkDraft) return;
    event.stopPropagation();
    connectPorts(linkDraft.source, { nodeId: node.id, portId });
    setLinkDraft(null);
  };

  const beginCanvasGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    setPicker(null);
    setPanGesture({ startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const updateCursorSpotlight = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const canvas = event.currentTarget.closest<HTMLElement>('.pro-canvas');
    if (!canvas) return;
    canvas.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`);
    canvas.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`);
    canvas.style.setProperty('--spotlight-opacity', '1');
  };

  const hideCursorSpotlight = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.closest<HTMLElement>('.pro-canvas')?.style.setProperty('--spotlight-opacity', '0');
    pointerPositionRef.current = null;
  };

  const updateCanvasGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    updateCursorSpotlight(event);
    const previousPointer = pointerPositionRef.current;
    pointerPositionRef.current = { x: event.clientX, y: event.clientY };
    if (nodeMove) {
      setTrashReady(isPointerOverTrash(event));
      setNodes((current) => current.map((node) => node.id === nodeMove.nodeId
        ? {
          ...node,
          x: Math.round(nodeMove.originX + (event.clientX - nodeMove.startX) / zoom),
          y: Math.round(nodeMove.originY + (event.clientY - nodeMove.startY) / zoom),
        }
        : node));
      return;
    }
    if (linkDraft) {
      const point = worldPoint(event.clientX, event.clientY);
      setLinkDraft((current) => current ? { ...current, point } : current);
      return;
    }
    if (panGesture) {
      setPan({
        x: panGesture.originX + event.clientX - panGesture.startX,
        y: panGesture.originY + event.clientY - panGesture.startY,
      });
      return;
    }
    if (spacePanningRef.current && previousPointer) {
      setPan((current) => ({
        x: current.x + event.clientX - previousPointer.x,
        y: current.y + event.clientY - previousPointer.y,
      }));
    }
  };

  const finishCanvasGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const cancelled = event?.type === 'pointercancel';
    if (nodeMove && !cancelled && isPointerOverTrash(event)) {
      deleteNode(nodeMove.nodeId);
    } else if (linkDraft && !cancelled) {
      setPicker({ x: event.clientX, y: event.clientY, type: linkDraft.type, source: linkDraft.source });
      setPickerQuery('');
    }
    setLinkDraft(null);
    setNodeMove(null);
    setPanGesture(null);
    setTrashReady(false);
  };

  const zoomCanvasWithWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (nodeMove || linkDraft) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    const next = getStrategyCanvasWheelZoom(zoom, pan, event.deltaY, cursorX, cursorY);
    if (!next) return;
    setZoom(next.zoom);
    setPan(next.pan);
  };

  const fitGraphToView = () => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || nodes.length === 0) return;
    const graph = nodes.reduce((current, node) => ({
      left: Math.min(current.left, node.x),
      top: Math.min(current.top, node.y),
      right: Math.max(current.right, node.x + PRO_NODE_WIDTH),
      bottom: Math.max(current.bottom, node.y + proNodeHeight(node)),
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const margin = 64;
    const nextZoom = Math.max(.5, Math.min(1, Number(Math.min(
      (bounds.width - margin * 2) / (graph.right - graph.left),
      (bounds.height - margin * 2) / (graph.bottom - graph.top),
    ).toFixed(2))));
    setZoom(nextZoom);
    setPan({
      x: Number((bounds.width / 2 - (graph.left + graph.right) / 2 * nextZoom).toFixed(2)),
      y: Number((bounds.height / 2 - (graph.top + graph.bottom) / 2 * nextZoom).toFixed(2)),
    });
    setAnnouncement('그래프 전체가 보이도록 배율을 맞췄습니다.');
  };

  const startLibraryDrag = (event: DragEvent<HTMLButtonElement>, item: ProNodeBlueprint) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', item.id);
    setLibraryDrag(item);
  };

  const dropLibraryNode = (event: DragEvent<HTMLDivElement>) => {
    if (!libraryDrag) return;
    event.preventDefault();
    const point = worldPoint(event.clientX, event.clientY);
    addNode(libraryDrag.id, { x: point.x - PRO_NODE_WIDTH / 2, y: point.y - PRO_PORT_START / 2 });
    setLibraryDrag(null);
  };

  const updateSelectedParam = (key: 'threshold' | 'timeframe', value: string) => {
    setNodes((current) => current.map((node) => node.id === selectedNodeId
      ? { ...node, params: { ...node.params, [key]: value } }
      : node));
  };

  const renameSelectedNode = (title: string) => {
    setNodes((current) => current.map((node) => node.id === selectedNodeId ? { ...node, title } : node));
  };

  const runValidation = () => {
    const issues: ProValidationIssue[] = [];
    if (nodes.length === 0) {
      issues.push({
        nodeId: null,
        problem: '전략 그래프가 비어 있습니다.',
        impact: '실행할 노드가 없어 봇 생성 단계로 넘어갈 수 없습니다.',
        fix: '왼쪽 NODES에서 노드를 캔버스로 끌어와 시작해 주세요.',
      });
    }
    nodes.forEach((node) => {
      const missing = node.inputs.filter((port) => !isInputLinked(node.id, port.id));
      if (missing.length > 0) {
        issues.push({
          nodeId: node.id,
          problem: `${node.title} 노드의 ${missing.map((port) => port.label).join(', ')} 입력이 연결되지 않았습니다.`,
          impact: '입력값이 없으면 이 노드를 실행할 수 없습니다.',
          fix: '앞 단계 노드의 같은 모양 출력과 연결해 주세요.',
        });
      }
      if (node.blueprintId === 'compare' && !node.params.threshold.trim()) {
        issues.push({
          nodeId: node.id,
          problem: `${node.title} 노드의 기준값이 비어 있습니다.`,
          impact: '비교 기준이 없으면 참·거짓을 판단할 수 없습니다.',
          fix: '오른쪽 설정에서 기준값을 직접 입력해 주세요.',
        });
      }
      if (node.blueprintId === 'quotes' && !node.params.timeframe) {
        issues.push({
          nodeId: node.id,
          problem: `${node.title} 노드의 시간축이 선택되지 않았습니다.`,
          impact: '시간축이 없으면 어떤 주기의 데이터를 읽을지 정할 수 없습니다.',
          fix: '오른쪽 설정에서 시간축을 직접 선택해 주세요.',
        });
      }
    });

    if (issues.length === 0) {
      setNotice({ kind: 'info', message: '구조 검사에서 문제를 찾지 못했습니다. 구조 검사 통과는 수익성이나 안전성을 보장하지 않습니다.' });
      setAnnouncement('구조 검사에서 문제를 찾지 못했습니다.');
      return;
    }
    const [first] = issues;
    if (first.nodeId) setSelectedNodeId(first.nodeId);
    setNotice({ kind: 'error', problem: first.problem, impact: first.impact, fix: first.fix, count: issues.length });
    setAnnouncement(`구조 검사에서 ${issues.length}개 문제를 찾았습니다. ${first.problem}`);
  };

  const saveDraft = () => {
    setNotice({ kind: 'info', message: '샘플 편집기에서는 서버에 저장하지 않습니다. 지금 구성한 그래프는 이 화면에서만 유지됩니다.' });
    setAnnouncement('샘플 편집기에서는 서버에 저장하지 않습니다.');
  };

  const renderPort = (node: ProNode, port: ProPort, index: number, direction: 'in' | 'out') => {
    const meta = describePortType(port.type);
    const linked = direction === 'in'
      ? isInputLinked(node.id, port.id)
      : links.some((link) => link.from.nodeId === node.id && link.from.portId === port.id);
    const compatible = linkDraft !== null
      && direction === 'in'
      && linkDraft.type === port.type
      && linkDraft.source.nodeId !== node.id
      && !linked;
    return <button
      key={port.id}
      type="button"
      data-testid={port.testId}
      className={`graph-port graph-port--${direction} ${linked ? 'is-linked' : ''} ${compatible ? 'is-compatible' : ''}`}
      style={{ top: PRO_PORT_START + index * PRO_PORT_GAP - 11 }}
      aria-label={`${node.title} ${port.label} ${direction === 'in' ? '입력 연결부' : '출력 연결부'} · ${meta.name} ${meta.shape}`}
      onPointerDown={direction === 'out' ? (event) => beginLink(event, node, port.id, port.type) : undefined}
      onPointerUp={direction === 'out'
        ? (event) => releaseOnOutput(event, node, port.id, port.type)
        : (event) => releaseOnInput(event, node, port.id)}
    >
      <i className={`port-shape port-shape--${port.type}`} aria-hidden="true" />
      <span>{port.label}</span>
    </button>;
  };

  const linkTargetReady = (node: ProNode) => linkDraft !== null
    && linkDraft.source.nodeId !== node.id
    && node.inputs.some((port) => port.type === linkDraft.type && !isInputLinked(node.id, port.id));

  const trashItemLabel = nodeMove ? '노드' : null;

  return <Localized><div className="page editor-page pro-editor-page editor-shell-page">
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    <div className="pro-editor-commandbar floating-editor-controls" role="toolbar" aria-label="Pro 편집 작업">
      <div className="pro-editor-context">
        <Button className="floating-editor-button" kind="ghost" icon={ArrowLeft} onClick={goBack}>목록</Button>
        {/* Same clean bar as Basic: navigation and actions only. The strategy
            name/version belongs to the list and save flow, and the sample-data
            disclosure lives on the help page (2026-07-26 decision). */}
        <div className="floating-editor-mode-controls" role="group" aria-label="편집기 전환">
          <Button className="floating-editor-button" onClick={() => openEditor?.('basic')}>Basic 편집기</Button>
          <Button className="floating-editor-button active" onClick={() => openEditor?.('pro')}>Pro 편집기</Button>
        </div>
      </div>
      <div className="pro-editor-actions">
        <Button className="floating-editor-button" icon={Save} onClick={saveDraft}>저장</Button>
        <Button className="floating-editor-button" kind="primary" icon={ShieldCheck} onClick={runValidation}>검증</Button>
      </div>
    </div>
    <div className="editor-layout pro-layout full-editor-workspace" data-testid="pro-editor-workspace">
      <aside className="editor-palette node-library-panel panel floating-editor-panel" data-testid="pro-node-library">
        <div className="palette-title"><span>NODES</span><Boxes size={15} /></div>
        <p className="library-intro">노드를 캔버스로 끌어다 놓고 같은 모양의 연결부끼리 이으세요. 하나의 출력은 여러 노드로 갈라질 수 있습니다.</p>
        <label className="palette-search"><Search size={14} /><input aria-label="노드 검색" placeholder="지표, 조건, 주문" value={nodeQuery} onChange={(event) => setNodeQuery(event.target.value)} /></label>
        <div className="block-category-list">
          {filteredLibrary.map((category) => <details className={`block-category tone-${category.tone}`} open key={category.category}>
            <summary><ChevronDown size={14} /><span>{category.category}</span><b>{category.items.length}</b></summary>
            <div className="node-chip-list">
              {category.items.map((item) => <button
                key={item.id}
                type="button"
                className={libraryDrag?.id === item.id ? 'is-library-dragging' : ''}
                aria-label={`${item.title} 노드 추가`}
                draggable
                onDragStart={(event) => startLibraryDrag(event, item)}
                onDragEnd={() => setLibraryDrag(null)}
                onClick={() => addNodeAtViewportCenter(item.id)}
              >
                <item.icon size={14} aria-hidden="true" />
                <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                <Plus size={12} />
              </button>)}
            </div>
          </details>)}
        </div>
      </aside>
      <section
        className="editor-canvas pro-canvas"
        aria-label="Pro 전략 캔버스"
        style={{
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          '--canvas-pan-x': `${pan.x}px`,
          '--canvas-pan-y': `${pan.y}px`,
        } as CSSProperties}
      >
        <div className="cursor-dot-spotlight" data-testid="cursor-dot-spotlight" aria-hidden="true" />
        <div className="pro-graph-controls" role="group" aria-label="그래프 도구">
          <button type="button" className="floating-editor-button" aria-label="전체 보기" onClick={fitGraphToView}><Split size={14} /> 전체 보기</button>
          <span>{`노드 ${nodes.length} · 연결 ${links.length} · 휠: 확대/축소 · 빈 공간 드래그: 이동`}</span>
        </div>
        <div className="floating-zoom-controls" role="group" aria-label="캔버스 확대/축소">
          <button type="button" className="floating-editor-button" aria-label="축소" disabled={zoom <= .5} onClick={() => setZoom((current) => Math.max(.5, Number((current - .1).toFixed(1))))}>−</button>
          <button type="button" className="floating-editor-button zoom-level" aria-label="배율 초기화" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{Math.round(zoom * 100)}%</button>
          <button type="button" className="floating-editor-button" aria-label="확대" disabled={zoom >= 2} onClick={() => setZoom((current) => Math.min(2, Number((current + .1).toFixed(1))))}>+</button>
        </div>
        <div className="mobile-editor-notice"><Split size={24} /><strong>Pro 그래프 편집은 데스크톱에서 사용할 수 있습니다</strong><span>현재 화면에서는 구성만 조회할 수 있습니다.</span></div>
        <div
          ref={(element) => { workspaceRef.current = element; }}
          className={`graph-workspace ${panGesture || spacePanning ? 'is-panning' : ''} ${spacePanning ? 'is-space-panning' : ''} ${nodeMove ? 'is-moving-node' : ''} ${linkDraft ? 'is-linking' : ''}`}
          data-testid="pro-graph-surface"
          onPointerDown={beginCanvasGesture}
          onPointerMove={updateCanvasGesture}
          onPointerUp={finishCanvasGesture}
          onPointerCancel={finishCanvasGesture}
          onPointerLeave={hideCursorSpotlight}
          onWheel={zoomCanvasWithWheel}
          onDragOver={(event) => { if (libraryDrag) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
          onDrop={dropLibraryNode}
        >
          <div className="graph-world" data-testid="pro-graph-world" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}>
            <svg className="graph-links" aria-label="전략 연결선">
              {links.map((link) => {
                const fromNode = nodeById[link.from.nodeId];
                const toNode = nodeById[link.to.nodeId];
                if (!fromNode || !toNode) return null;
                const fromIndex = fromNode.outputs.findIndex((port) => port.id === link.from.portId);
                const toIndex = toNode.inputs.findIndex((port) => port.id === link.to.portId);
                if (fromIndex < 0 || toIndex < 0) return null;
                const path = proLinkPath(proPortPoint(fromNode, 'out', fromIndex), proPortPoint(toNode, 'in', toIndex));
                const label = `${fromNode.title} ${fromNode.outputs[fromIndex].label} 출력과 ${toNode.title} ${toNode.inputs[toIndex].label} 입력 연결 삭제`;
                return <g key={link.id}>
                  <path className="graph-link" d={path} />
                  <path
                    className="graph-link-hit"
                    d={path}
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    onClick={() => deleteLink(link.id)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); deleteLink(link.id); } }}
                  />
                </g>;
              })}
              {linkDraft && <path className="graph-link is-draft" d={proLinkPath(linkDraft.origin, linkDraft.point)} />}
            </svg>
            {nodes.map((node) => {
              const Icon = node.icon;
              return <article
                key={node.id}
                className={`graph-node tone-${node.tone} ${selectedNodeId === node.id ? 'is-selected' : ''} ${nodeMove?.nodeId === node.id ? 'is-node-moving' : ''} ${linkDraft ? (linkDraft.source.nodeId === node.id ? 'is-link-source' : linkTargetReady(node) ? 'is-link-ready' : 'is-link-blocked') : ''}`}
                data-testid={`pro-node-${node.id}`}
                style={{ left: node.x, top: node.y, width: PRO_NODE_WIDTH, height: proNodeHeight(node) }}
                onPointerDown={(event) => beginNodeMove(event, node)}
                onClick={() => setSelectedNodeId(node.id)}
              >
                <header>
                  {Icon && <Icon size={14} aria-hidden="true" />}
                  <span>{node.kicker}</span>
                  <button
                    type="button"
                    className="graph-node-handle"
                    aria-label={`${node.title} 노드 자유 이동`}
                    onPointerDown={(event) => beginNodeMove(event, node, true)}
                  ><GripVertical size={13} /></button>
                </header>
                <strong>{node.title}</strong>
                <small>{node.detail}</small>
                {node.inputs.map((port, index) => renderPort(node, port, index, 'in'))}
                {node.outputs.map((port, index) => renderPort(node, port, index, 'out'))}
              </article>;
            })}
          </div>
        </div>
        {picker && <div
          role="dialog"
          aria-label="호환 노드 선택"
          className="node-picker"
          style={{ left: `${picker.x}px`, top: `${picker.y}px` }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header>
            <div><span>{describePortType(picker.type).name} 출력</span><strong>호환 노드 선택</strong></div>
            <button type="button" aria-label="호환 노드 선택 닫기" onClick={() => setPicker(null)}><X size={15} /></button>
          </header>
          <label><Search size={14} /><input autoFocus aria-label="호환 노드 검색" placeholder="노드 검색" value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} /></label>
          {pickerGroups.length === 0 && <p className="node-picker-empty">검색어와 맞는 호환 노드가 없습니다.</p>}
          {pickerGroups.map((group) => <div key={group.name}>
            <p>{group.name}</p>
            {group.items.map((item) => <button
              key={item.id}
              type="button"
              aria-label={item.title}
              onClick={() => addNodeFromPicker(item)}
            >
              <item.icon size={16} aria-hidden="true" />
              <span><strong>{item.title}</strong><small>{item.detail}</small></span>
            </button>)}
          </div>)}
        </div>}
      </section>
      <aside className="editor-inspector node-inspector panel floating-editor-panel" data-testid="pro-node-inspector">
        <div className="inspector-title"><span>NODE SETTINGS</span>{selectedNode && <button type="button" aria-label="노드 설정 닫기" onClick={() => setSelectedNodeId(null)}><X size={15} /></button>}</div>
        {selectedNode ? <>
          <div className="node-id">{selectedNode.kicker} · {selectedNode.id}</div>
          <div className="inspector-section">
            <label htmlFor="pro-node-title">노드 이름</label>
            <input id="pro-node-title" value={selectedNode.title} onChange={(event) => renameSelectedNode(event.target.value)} />
          </div>
          <div className="inspector-section">
            <label htmlFor="pro-node-threshold">기준값 직접 입력</label>
            <div className="empty-input">
              <input id="pro-node-threshold" placeholder="값을 입력하세요" value={selectedNode.params.threshold} onChange={(event) => updateSelectedParam('threshold', event.target.value)} />
              {!selectedNode.params.threshold && <b>required</b>}
            </div>
          </div>
          <div className="inspector-section">
            <label htmlFor="pro-node-timeframe">시간축</label>
            <select id="pro-node-timeframe" value={selectedNode.params.timeframe} onChange={(event) => updateSelectedParam('timeframe', event.target.value)}>
              <option value="">시간축 선택</option>
              {PRO_TIMEFRAMES.map((timeframe) => <option key={timeframe} value={timeframe}>{timeframe}</option>)}
            </select>
          </div>
          <div className="inspector-ports">
            <p>연결부 타입</p>
            {[...selectedNode.inputs.map((port) => ({ port, direction: '입력 연결부' })), ...selectedNode.outputs.map((port) => ({ port, direction: '출력 연결부' }))].map(({ port, direction }) => {
              const meta = describePortType(port.type);
              return <span key={`${direction}-${port.id}`}>
                <i className={`port-shape port-shape--${port.type}`} aria-hidden="true" />
                <b>{port.label}</b>
                <small>{direction} · {meta.name} · {meta.shape}</small>
              </span>;
            })}
          </div>
          <div className="inspector-actions">
            <Button kind="ghost" icon={Trash2} onClick={() => deleteNode(selectedNode.id)}>노드 삭제</Button>
          </div>
        </> : <p className="inspector-empty">노드를 선택하면 설정과 연결부를 확인할 수 있습니다.</p>}
      </aside>
    </div>
    {notice && <div className="pro-editor-notice" role="alert" data-tone={notice.kind}>
      {notice.kind === 'error'
        ? <div>
          <strong>문제 · {notice.problem}</strong>
          <span>영향 · {notice.impact}</span>
          <span>해결 · {notice.fix}</span>
          {(notice.count ?? 0) > 1 && <small>남은 문제 {(notice.count ?? 0) - 1}개</small>}
        </div>
        : <div><strong>{notice.message}</strong></div>}
      <div className="pro-editor-notice-actions">
        {notice.kind === 'undo' && <Button kind="ghost" onClick={undoDelete}>실행 취소</Button>}
        <button type="button" aria-label="알림 닫기" onClick={() => setNotice(null)}><X size={15} /></button>
      </div>
    </div>}
    {trashItemLabel && <div
      ref={(element) => { trashZoneRef.current = element; }}
      className={`editor-trash-zone is-pointer-trash ${trashReady ? 'is-ready' : ''}`}
      role="region"
      aria-label={`${trashItemLabel} 삭제 영역`}
      data-testid="pro-trash-zone"
    >
      <span className="editor-trash-icon"><Trash2 size={18} aria-hidden="true" /></span>
      <span className="editor-trash-copy"><strong>{trashItemLabel} 버리기</strong><small>여기에 놓으면 삭제됩니다</small></span>
    </div>}
  </div></Localized>;
}
