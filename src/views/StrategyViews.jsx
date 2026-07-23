import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Boxes, Check, ChevronDown, ChevronRight, CircleDollarSign, GitBranch, GripVertical, Import, Layers3, LockKeyhole, Minus, Play, Plus, Save, Search, ShieldCheck, Sparkles, Split, Timer, Trash2, X } from 'lucide-react';
import { strategies } from '../data/mockData.js';
import { Button, DataTable, FilterButton, HelpNote, PageHeading, Panel, SearchBar, StatCard, Status } from '../components/common.jsx';
import { Localized } from '../lib/i18n.jsx';

const statusTone = (state) => state === '검증 완료' ? 'positive' : state === '미완성' ? 'warning' : 'neutral';

export function StrategyHome({ openEditor, variant = 'balanced' }) {
  return variant === 'terminal'
    ? <TerminalStrategyHome openEditor={openEditor} />
    : <BalancedStrategyHome openEditor={openEditor} />;
}

function BalancedStrategyHome({ openEditor }) {
  const [items, setItems] = useState(() => strategies.map((strategy, index) => ({
    ...strategy,
    id: `strategy-${index}`,
    symbols: index === 0 ? ['AAPL', 'MSFT'] : index === 1 ? ['SPY', 'QQQ'] : ['NVDA'],
  })));
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('all');
  const [state, setState] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [draggedStrategyId, setDraggedStrategyId] = useState(null);

  const filteredItems = useMemo(() => items.filter((strategy) => {
    const matchesQuery = strategy.name.toLowerCase().includes(query.trim().toLowerCase());
    const matchesMode = mode === 'all' || strategy.mode.toLowerCase() === mode;
    const needsInput = strategy.state === '미완성' || strategy.backtest === '데이터 확인';
    const matchesState = state === 'all' || (state === 'ready' ? strategy.state === '검증 완료' : needsInput);
    return matchesQuery && matchesMode && matchesState;
  }), [items, mode, query, state]);

  const readyCount = items.filter((strategy) => strategy.state === '검증 완료').length;
  const needsInputCount = items.filter((strategy) => strategy.state === '미완성' || strategy.backtest === '데이터 확인').length;

  const reorderStrategy = (sourceId, targetId) => {
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

  const dropOnStrategy = (event, strategyId) => {
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
          <div className="strategy-title-group"><div><h2>내 전략</h2><span>{filteredItems.length}</span></div><div className="strategy-counts" data-testid="strategy-counts"><span>전체 <b>{items.length}</b></span><span>준비 완료 <b>{readyCount}</b></span><span>확인 필요 <b>{needsInputCount}</b></span></div></div>
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
            <button className={state === 'ready' ? 'active' : ''} onClick={() => setState('ready')}>준비 완료</button>
            <button className={state === 'needs' ? 'active' : ''} onClick={() => setState('needs')}>확인 필요</button>
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
              <button aria-label={`${strategy.name} 열기`} title="열기" onClick={(event) => { event.stopPropagation(); openEditor(strategy.mode.toLowerCase()); }}><ChevronRight size={17} /></button>
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
        </div> : <div className="strategy-import-list">{items.map((strategy) => <button key={strategy.id} aria-label={`${strategy.name} 가져오기`} onClick={() => { setShowCreate(false); setShowImport(false); openEditor(strategy.mode.toLowerCase()); }}><span className={`strategy-mode-icon mode-${strategy.mode.toLowerCase()}`}>{strategy.mode[0]}</span><span><strong>{strategy.name}</strong><small>{strategy.mode} · {strategy.symbols.join(', ')}</small></span><Import size={16} /></button>)}</div>}
      </section>
    </div>}
  </div></Localized>;
}

function TerminalStrategyHome({ openEditor }) {
  const columns = [
    { key: 'name', label: '전략', render: (row) => <button className="table-primary" onClick={() => openEditor(row.mode.toLowerCase())}><span className={`mode-mark mode-${row.mode.toLowerCase()}`}>{row.mode[0]}</span><span><strong>{row.name}</strong><small>{row.updated}</small></span></button> },
    { key: 'mode', label: '모드' },
    { key: 'state', label: '검증', render: (row) => <Status tone={statusTone(row.state)}>{row.state}</Status> },
    { key: 'backtest', label: '백테스트' },
    { key: 'action', label: '', render: (row) => <Button kind="ghost" onClick={() => openEditor(row.mode.toLowerCase())}>열기</Button> },
  ];
  return <div className="page strategy-home">
    <PageHeading eyebrow="STRATEGY WORKSPACE" title="전략 스튜디오" description="전략을 작성하고 검증한 뒤 잠긴 버전으로 출시합니다." actions={<Button kind="primary" icon={Plus} onClick={() => openEditor('basic')}>새 전략</Button>} />
    <div className="stats-grid three"><StatCard label="작업본" value="03" detail="미저장 변경 없음" icon={Layers3} /><StatCard label="검증 준비" value="01" detail="출시 전 확인 가능" trend="READY" icon={ShieldCheck} /><StatCard label="출시 전략" value="08" detail="자동 백테스트 7/8" icon={LockKeyhole} /></div>
    <div className="content-grid strategy-grid">
      <Panel className="span-3" title="내 전략" subtitle="현재 작업본과 출시된 상태" action={<div className="toolbar-inline"><SearchBar placeholder="전략 검색" /><FilterButton /></div>}><DataTable columns={columns} rows={strategies} /></Panel>
    </div>
  </div>;
}

const INITIAL_BASIC_BLOCKS = {
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

const INITIAL_STRATEGY_SECTIONS = [{
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

const SECTION_HEADER_HEIGHT = 96;
const SECTION_MIN_WIDTH = 600;
const SECTION_PADDING = 24;
const STRATEGY_CARD_WIDTH = 260;
const STRATEGY_CARD_FALLBACK_HEIGHT = 286;

const getDefaultCardPosition = (index) => ({
  x: SECTION_PADDING + (index % 3) * (STRATEGY_CARD_WIDTH + 26),
  y: 112 + Math.floor(index / 3) * (STRATEGY_CARD_FALLBACK_HEIGHT + 24),
});

const INITIAL_CARD_BLOCKS = {
  'primary-buy': INITIAL_BASIC_BLOCKS.buy,
  'primary-sell': INITIAL_BASIC_BLOCKS.sell,
};

const createDefaultCardBlocks = (cardId, side) => side === 'buy'
  ? [{ id: `${cardId}-trigger-block`, icon: Play, label: 'PRICE BAR', tone: 'data' }]
  : [{ id: `${cardId}-position-block`, icon: Play, label: 'POSITION', value: 'OPEN', tone: 'condition' }];

const TEMPLATE_LIBRARY = [
  { id: 'rsi', name: 'RSI 반등', category: '모멘텀', indicator: 'RSI', buyTitle: 'RSI 반등 매수', sellTitle: 'RSI 과열 매도', buyOp: '<', buyValue: '30', sellOp: '>', sellValue: '70', description: '과매도에서 사고 과매수에서 정리해요' },
  { id: 'sma', name: 'SMA 교차', category: '추세', indicator: 'SMA', buyOp: '↑', buyValue: '20 / 60', sellOp: '↓', sellValue: '20 / 60', description: '단기선과 장기선의 교차를 따라가요' },
  { id: 'macd', name: 'MACD 전환', category: '추세', indicator: 'MACD', buyOp: '↑', buyValue: 'SIGNAL', sellOp: '↓', sellValue: 'SIGNAL', description: '추세가 바뀌는 순간을 찾아요' },
  { id: 'supertrend', name: 'Supertrend 추종', category: '추세', indicator: 'Supertrend', buyOp: '=', buyValue: 'UP', sellOp: '=', sellValue: 'DOWN', description: '큰 추세 방향에 맞춰 움직여요' },
  { id: 'bollinger', name: 'Bollinger 반전', category: '변동성', indicator: 'Bollinger', buyOp: '<', buyValue: 'LOWER', sellOp: '>', sellValue: 'UPPER', description: '가격이 밴드 끝에 닿을 때 대응해요' },
  { id: 'donchian', name: 'Donchian 돌파', category: '변동성', indicator: 'Donchian', buyOp: '↑', buyValue: 'HIGH 20', sellOp: '↓', sellValue: 'LOW 20', description: '최근 가격 범위를 벗어날 때 따라가요' },
  { id: 'volume-sma', name: '거래량 돌파', category: '거래량', indicator: 'Volume SMA', buyOp: '>', buyValue: '150%', sellOp: '<', sellValue: '70%', description: '평소보다 거래가 몰리는 종목을 찾아요' },
  { id: 'stochastic', name: 'Stochastic 반등', category: '모멘텀', indicator: 'Stochastic', buyOp: '↑', buyValue: '20', sellOp: '↓', sellValue: '80', description: '빠른 과매도·과매수 신호를 사용해요' },
];

const BLOCK_LIBRARY = [
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

const INITIAL_CARD_META = {
  'primary-buy': {
    title: '매수 전략',
    detail: '가격 갱신 · 종목별 평가',
    explanation: '새로운 1분봉이 완성되고, RSI가 30 아래로 내려오면 전략 예산의 25%로 시장가 매수 후보를 만듭니다.',
  },
  'primary-sell': {
    title: '매도 전략',
    detail: '포지션 상태 · 종목별 평가',
    explanation: '포지션을 보유한 상태에서 RSI가 70 위로 올라가면 보유 수량 100%의 매도 후보를 만듭니다.',
  },
};

const createTemplateBlocks = (template, cardId, side) => side === 'buy'
  ? [
    { id: `${cardId}-event`, icon: Play, label: '다음 봉 체결', tone: 'time' },
    { id: `${cardId}-indicator`, icon: Timer, label: template.indicator, op: template.buyOp, value: template.buyValue, tone: 'indicator' },
    { id: `${cardId}-budget`, icon: CircleDollarSign, label: 'BUDGET', value: '25%', tone: 'risk' },
  ]
  : [
    { id: `${cardId}-position`, icon: Play, label: '포지션 상태', value: 'OPEN', tone: 'condition' },
    { id: `${cardId}-indicator`, icon: Timer, label: template.indicator, op: template.sellOp, value: template.sellValue, tone: 'indicator' },
  ];

const createLibraryBlock = (label, tone, id) => {
  const valueByTone = {
    data: '현재',
    indicator: '14',
    condition: '설정',
    logic: undefined,
    time: '설정',
    order: '기본',
    risk: '설정',
  };
  const iconByTone = {
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

const blockOperatorCopy = {
  '<': '미만',
  '>': '초과',
  '=': '같은지',
  '↑': '상향 돌파하는지',
  '↓': '하향 돌파하는지',
};

const BLOCK_OPERATORS = ['<', '>', '=', '↑', '↓'];

const getBlockValueOptions = (block) => {
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

const getNumericValue = (value) => {
  const match = String(value ?? '').trim().match(/^(-?\d+(?:\.\d+)?)(%)?$/);
  return match ? { number: Number(match[1]), suffix: match[2] ?? '' } : null;
};

const positionValueCopy = {
  OPEN: '포지션을 보유 중',
  CLOSED: '포지션을 보유하지 않음',
  ANY: '포지션 상태와 무관',
};

const getBlockRule = (block, side) => {
  if (block.id === 'buy-trigger-block') return <><b>1분봉</b> 하나가 새로 완성될 때마다</>;
  if (block.id === 'buy-rsi-block') return <><b>RSI(14)</b>가 <b>{block.value} {blockOperatorCopy[block.op] ?? block.op}</b>인지 확인하고</>;
  if (block.id === 'buy-budget-block') return <>조건을 만족하면 전략 예산의 <b>{block.value}</b>를 사용해</>;
  if (block.id === 'sell-position-block') return <>먼저 현재 <b>{positionValueCopy[block.value] ?? block.value}</b>인지 확인하고</>;
  if (block.id === 'sell-rsi-block') return <><b>RSI(14)</b>가 <b>{block.value} {blockOperatorCopy[block.op] ?? block.op}</b>인지 확인한 뒤</>;

  const operatorCopy = blockOperatorCopy[block.op] ?? block.op;
  if (block.tone === 'time') return <><b>{block.label}</b> 이벤트가 발생하면</>;
  if (block.tone === 'data') return <><b>{block.label}</b> 데이터를 읽고</>;
  if (block.tone === 'indicator') return <><b>{block.label}</b>{block.value && <>의 기준값 <b>{block.value}</b></>}{operatorCopy && <>으로 <b>{operatorCopy}</b></>} 확인한 뒤</>;
  if (block.tone === 'condition') return <><b>{block.label}</b>{block.value && <>이 <b>{block.value}</b> 상태인지</>} 확인하고</>;
  if (block.tone === 'logic') return <><b>{block.label}</b> 논리로 앞의 조건을 연결하고</>;
  if (block.tone === 'risk') return <>위험 한도를 <b>{block.value ?? '설정값'}</b>으로 제한한 뒤</>;
  if (block.tone === 'order') return <><b>{block.label}</b> 주문 조건을 적용하고</>;
  return <><b>{block.label}</b> 블록의 설정값을 확인하고</>;
};

const getTerminalRule = (side) => side === 'buy'
  ? <>다음 봉에서 <b>시장가 매수</b> 후보를 만듭니다.</>
  : <>보유 수량의 <b>100%</b>를 <b>시장가 매도</b> 후보로 만듭니다.</>;

const BlockRuleNote = ({ side, step, children }) => <aside role="note" aria-label={`${step}단계 규칙 설명`} className={`strategy-rule-note is-${side}`}>
  <span>{String(step).padStart(2, '0')}</span>
  <p>{children}</p>
</aside>;

const NumericBlockValue = ({ label, value, onChange }) => {
  const numeric = getNumericValue(value);
  const update = (next) => {
    const bounded = Math.max(0, Math.min(numeric.suffix === '%' || label === 'RSI' ? 100 : 9999, Number(next)));
    onChange(`${Number.isFinite(bounded) ? bounded : 0}${numeric.suffix}`);
  };
  return <span className="block-number-stepper" aria-label={`${label} 숫자 설정`} onPointerDown={(event) => event.stopPropagation()}>
    <button type="button" aria-label={`${label} 값 감소`} onClick={() => update(numeric.number - 1)}><Minus size={11} aria-hidden="true" /></button>
    <label><span className="sr-only">{label} 값</span><input type="number" min="0" max={numeric.suffix === '%' || label === 'RSI' ? 100 : 9999} value={numeric.number} onChange={(event) => update(event.target.value)} /></label>
    <b aria-hidden="true">{numeric.suffix}</b>
    <button type="button" aria-label={`${label} 값 증가`} onClick={() => update(numeric.number + 1)}><Plus size={11} aria-hidden="true" /></button>
  </span>;
};

const CustomBlockSelect = ({ label, value, options, onChange, compact = false }) => {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeWithEscape = (event) => {
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

  const moveSelection = (direction) => {
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

const Block = ({ icon: Icon, label, value, op, tone = 'neutral', locked = false, onChange }) => {
  const numeric = getNumericValue(value);
  const block = { label, value, op, tone };
  return <div className={`scratch-block block-${tone}`}>
    {Icon && <Icon size={15} />}
    <span>{label}</span>
    {op && (locked
      ? <b className="block-op">{op}</b>
      : <CustomBlockSelect compact label={`${label} 연산자`} value={op} options={BLOCK_OPERATORS} onChange={(nextOp) => onChange({ op: nextOp })} />)}
    {value && (locked
      ? <span className="block-value is-locked">{value}</span>
      : numeric
        ? <NumericBlockValue label={label} value={value} onChange={(nextValue) => onChange({ value: nextValue })} />
        : <CustomBlockSelect label={`${label} 값 선택`} value={value} options={getBlockValueOptions(block)} onChange={(nextValue) => onChange({ value: nextValue })} />)}
  </div>;
};
const StrategyBlock = ({ id, fixed = false, dragging = false, dragProps = {}, showRule = false, rule, ruleSide = 'right', ruleStep = 1, ...blockProps }) => <div
  className={`block-with-copy ${fixed ? 'fixed-terminal-block' : 'draggable-strategy-block'} ${dragging ? 'is-dragging' : ''}`}
  data-testid={id}
  aria-disabled={fixed ? 'true' : undefined}
  aria-label={fixed ? undefined : `${blockProps.label} 블록. 드래그하거나 Alt와 방향키로 이동`}
  draggable={fixed ? undefined : true}
  tabIndex={fixed ? undefined : 0}
  {...dragProps}
>{!fixed && <GripVertical className="block-drag-handle" size={14} aria-hidden="true" />}<Block {...blockProps} locked={fixed} />{showRule && <BlockRuleNote side={ruleSide} step={ruleStep}>{rule}</BlockRuleNote>}</div>;

export function BasicEditor({ goBack, openEditor }) {
  const [activeGroup, setActiveGroup] = useState(null);
  const [activeSectionId, setActiveSectionId] = useState('section-1');
  const [selectedCardId, setSelectedCardId] = useState('primary-buy');
  const [sections, setSections] = useState(INITIAL_STRATEGY_SECTIONS);
  const [cardBlocks, setCardBlocks] = useState(INITIAL_CARD_BLOCKS);
  const [cardMeta, setCardMeta] = useState(INITIAL_CARD_META);
  const [draggedBlock, setDraggedBlock] = useState(null);
  const [draggedCard, setDraggedCard] = useState(null);
  const [libraryDrag, setLibraryDrag] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const [customBlockCount, setCustomBlockCount] = useState(0);
  const [cardCount, setCardCount] = useState(2);
  const [drawMode, setDrawMode] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [draftRect, setDraftRect] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panGesture, setPanGesture] = useState(null);
  const [spacePanning, setSpacePanning] = useState(false);
  const spacePanningRef = useRef(false);
  const pointerPositionRef = useRef(null);
  const [sectionMove, setSectionMove] = useState(null);
  const [cardMove, setCardMove] = useState(null);
  const trashZoneRef = useRef(null);
  const [trashReady, setTrashReady] = useState(false);
  const cardElementsRef = useRef(new Map());
  const [cardSizes, setCardSizes] = useState({});
  const [announcement, setAnnouncement] = useState('');
  const [templateQuery, setTemplateQuery] = useState('');
  const [blockQuery, setBlockQuery] = useState('');
  const toggleGroup = (group) => setActiveGroup((current) => current === group ? null : group);
  const filteredTemplates = useMemo(() => TEMPLATE_LIBRARY.filter((template) => (
    `${template.name} ${template.category} ${template.indicator}`.toLowerCase().includes(templateQuery.trim().toLowerCase())
  )), [templateQuery]);
  const filteredBlockLibrary = useMemo(() => BLOCK_LIBRARY.map((category) => ({
    ...category,
    items: category.items.filter((item) => item.toLowerCase().includes(blockQuery.trim().toLowerCase())),
  })).filter((category) => category.items.length > 0), [blockQuery]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      setCardSizes((current) => {
        let changed = false;
        const next = { ...current };
        entries.forEach((entry) => {
          const cardId = entry.target.dataset.strategyCard;
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
    const isTypingTarget = (target) => target?.closest?.('input, textarea, select, button, [role="combobox"], [contenteditable="true"]');
    const stopSpacePanning = () => {
      spacePanningRef.current = false;
      setSpacePanning(false);
    };
    const handleKeyDown = (event) => {
      if (event.code !== 'Space' || isTypingTarget(event.target)) return;
      event.preventDefault();
      if (spacePanningRef.current) return;
      spacePanningRef.current = true;
      setSpacePanning(true);
    };
    const handleKeyUp = (event) => {
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

  const moveBlock = (sourceCardId, blockId, targetCardId, targetIndex) => {
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

  const startDragging = (event, cardId, blockId) => {
    event.stopPropagation();
    if (event.target.closest?.('button, input, select')) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', blockId);
    setDraggedBlock({ cardId, blockId });
  };

  const dropBlock = (event, targetCardId, targetIndex) => {
    event.preventDefault();
    event.stopPropagation();
    if (draggedBlock) moveBlock(draggedBlock.cardId, draggedBlock.blockId, targetCardId, targetIndex);
    setDraggedBlock(null);
    setDragTarget(null);
  };

  const moveWithKeyboard = (event, cardId, blockId, index) => {
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

  const addBlock = (cardId, side) => {
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
    setAnnouncement(`${side === 'buy' ? '매수' : '매도'} 전략에 이동평균 조건을 추가했습니다.`);
  };

  const applyTemplate = (template, targetSectionId = activeSectionId) => {
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
        detail: `${template.category} 템플릿 · 쉬운 시작`,
        explanation: `${template.description} 매수 조건을 만족하면 주문 후보를 만듭니다.`,
      },
      [sellCardId]: {
        title: template.sellTitle ?? `${template.name} 매도`,
        detail: `${template.category} 템플릿 · 자동 청산`,
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
    setAnnouncement(`${template.name} 템플릿의 매수·매도 블록을 ${targetSection.id.replace('section-', 'SECTION ')}에 추가했습니다.`);
  };

  const addLibraryBlock = (label, tone, targetCardId = selectedCardId, targetIndex) => {
    if (!targetCardId || !cardBlocks[targetCardId]) {
      setAnnouncement('먼저 블록을 넣을 매수 또는 매도 전략을 선택해 주세요.');
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
    setAnnouncement(`${label} 블록을 대상 전략에 추가했습니다.`);
  };

  const startLibraryDrag = (event, payload) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', payload.type === 'template' ? payload.template.name : payload.label);
    setLibraryDrag(payload);
  };

  const finishLibraryDrag = () => {
    setLibraryDrag(null);
    setDragTarget(null);
  };

  const deleteBlock = (cardId, blockId) => {
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

  const deleteStrategyCard = (sectionId, cardId) => {
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
    setAnnouncement('전략을 삭제했습니다.');
  };

  const deleteSection = (sectionId) => {
    const targetSection = sections.find((section) => section.id === sectionId);
    const deletedCardIds = new Set(targetSection?.cardOrder ?? []);
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

  const isPointerOverTrash = (event) => {
    const bounds = trashZoneRef.current?.getBoundingClientRect();
    if (!bounds) return false;
    return event.clientX >= bounds.left
      && event.clientX <= bounds.right
      && event.clientY >= bounds.top
      && event.clientY <= bounds.bottom;
  };

  const dropOnTrash = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (draggedBlock) {
      deleteBlock(draggedBlock.cardId, draggedBlock.blockId);
    } else if (draggedCard) {
      deleteStrategyCard(draggedCard.sectionId, draggedCard.cardId);
    }
  };

  const dropLibraryBlock = (event, targetCardId, targetIndex) => {
    if (libraryDrag?.type !== 'block') return false;
    event.preventDefault();
    event.stopPropagation();
    addLibraryBlock(libraryDrag.label, libraryDrag.tone, targetCardId, targetIndex);
    finishLibraryDrag();
    return true;
  };

  const updateStrategyBlock = (cardId, blockId, patch) => {
    setCardBlocks((current) => ({
      ...current,
      [cardId]: current[cardId].map((block) => block.id === blockId ? { ...block, ...patch } : block),
    }));
    setAnnouncement('블록 설정을 변경했습니다.');
  };

  const renderEditableBlocks = (cardId, side, showRules) => cardBlocks[cardId].map((block, index) => <StrategyBlock
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

  const updateSection = (sectionId, patch) => setSections((current) => current.map((section) => (
    section.id === sectionId ? { ...section, ...patch } : section
  )));

  const updateCardPosition = (sectionId, cardId, position) => {
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

  const getSectionLayout = (section) => {
    const bounds = section.cardOrder.reduce((current, cardId, index) => {
      const position = section.cardPositions?.[cardId] ?? getDefaultCardPosition(index);
      const size = cardSizes[cardId] ?? { width: STRATEGY_CARD_WIDTH, height: STRATEGY_CARD_FALLBACK_HEIGHT };
      return {
        right: Math.max(current.right, position.x + size.width),
        bottom: Math.max(current.bottom, position.y + size.height),
      };
    }, { right: 0, bottom: SECTION_HEADER_HEIGHT });

    return {
      width: Math.max(SECTION_MIN_WIDTH, Math.ceil(bounds.right + SECTION_PADDING)),
      height: Math.max(SECTION_HEADER_HEIGHT + 120, Math.ceil(bounds.bottom + SECTION_PADDING)),
    };
  };

  const addStrategyCard = (sectionId, side) => {
    const section = sections.find((item) => item.id === sectionId);
    const nextCardCount = cardCount + 1;
    const cardId = `${sectionId}-${side}-${section.cards[side].length + 1}-${nextCardCount}`;
    setCardCount(nextCardCount);
    setCardBlocks((current) => ({ ...current, [cardId]: createDefaultCardBlocks(cardId, side) }));
    setCardMeta((current) => ({
      ...current,
      [cardId]: {
        title: `${side === 'buy' ? '매수' : '매도'} 전략`,
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
    setAnnouncement(`${sectionId.replace('section-', 'SECTION ')}에 ${side === 'buy' ? '매수' : '매도'} 블록을 추가했습니다.`);
  };

  const startCardDrag = (event, sectionId, side, cardId) => {
    if (draggedBlock) return;
    if (event.target.closest?.('.strategy-card-move-handle')) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', cardId);
    setDraggedCard({ sectionId, side, cardId });
  };

  const moveStrategyCard = (targetSectionId, targetIndex) => {
    if (!draggedCard || draggedBlock) return;
    const sourceSection = sections.find((section) => section.id === draggedCard.sectionId);
    if (draggedCard.side === 'buy' && sourceSection.cards.buy.length === 1 && sourceSection.id !== targetSectionId) {
      setAnnouncement('각 섹션에는 매수 블록이 하나 이상 필요합니다.');
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

  const dropCardOnSection = (event, targetSectionId) => {
    event.preventDefault();
    if (!draggedCard) return;
    const targetSection = sections.find((section) => section.id === targetSectionId);
    moveStrategyCard(targetSectionId, targetSection.cardOrder.length);
  };

  const dropOnSection = (event, targetSectionId) => {
    if (libraryDrag?.type === 'template') {
      event.preventDefault();
      event.stopPropagation();
      applyTemplate(libraryDrag.template, targetSectionId);
      finishLibraryDrag();
      return;
    }
    dropCardOnSection(event, targetSectionId);
  };

  const dropCardBefore = (event, targetSectionId, targetIndex) => {
    if (!draggedCard) return;
    event.preventDefault();
    event.stopPropagation();
    moveStrategyCard(targetSectionId, targetIndex);
  };

  const pointInSurface = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left - pan.x) / zoom,
      y: (event.clientY - bounds.top - pan.y) / zoom,
    };
  };

  const beginCanvasGesture = (event) => {
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

  const zoomCanvasWithWheel = (event) => {
    event.preventDefault();
    if (drawMode || sectionMove || cardMove) return;
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextZoom = Math.max(.5, Math.min(2, Number((zoom + direction * .1).toFixed(1))));
    if (nextZoom === zoom) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    const worldX = (cursorX - pan.x) / zoom;
    const worldY = (cursorY - pan.y) / zoom;
    setZoom(nextZoom);
    setPan({
      x: Number((cursorX - worldX * nextZoom).toFixed(2)),
      y: Number((cursorY - worldY * nextZoom).toFixed(2)),
    });
  };

  const updateCursorSpotlight = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const canvas = event.currentTarget.closest('.basic-canvas');
    if (!canvas) return;
    canvas.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`);
    canvas.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`);
    canvas.style.setProperty('--spotlight-opacity', '1');
  };

  const hideCursorSpotlight = (event) => {
    event.currentTarget.closest('.basic-canvas')?.style.setProperty('--spotlight-opacity', '0');
    pointerPositionRef.current = null;
  };

  const updateCanvasGesture = (event) => {
    updateCursorSpotlight(event);
    const previousPointer = pointerPositionRef.current;
    pointerPositionRef.current = { x: event.clientX, y: event.clientY };
    if (cardMove) {
      setTrashReady(isPointerOverTrash(event));
      updateCardPosition(cardMove.sectionId, cardMove.cardId, {
        x: Math.max(0, cardMove.originX + (event.clientX - cardMove.startX) / zoom),
        y: Math.max(SECTION_HEADER_HEIGHT, cardMove.originY + (event.clientY - cardMove.startY) / zoom),
      });
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

  const finishCanvasGesture = (event) => {
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
          title: '매수 전략',
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
      setAnnouncement(`SECTION ${String(sectionNumber).padStart(2, '0')}을 만들었습니다. 매수 블록이 기본으로 포함됩니다.`);
    }
    if (drawStart) setDrawMode(false);
    setDrawStart(null);
    setDraftRect(null);
    setPanGesture(null);
    setSectionMove(null);
    setCardMove(null);
    setTrashReady(false);
  };

  const beginSectionMove = (event, section) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveSectionId(section.id);
    setSectionMove({ sectionId: section.id, startX: event.clientX, startY: event.clientY, originX: section.x, originY: section.y });
    event.currentTarget.closest('.section-workspace')?.setPointerCapture?.(event.pointerId);
  };

  const beginSectionAreaMove = (event, section) => {
    if (event.button !== 0) return;
    if (event.target.closest?.('button, input, select, label, .strategy-card')) return;
    beginSectionMove(event, section);
  };

  const beginCardMove = (event, section, cardId) => {
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

  const renderStrategyCard = (section, side, cardId, cardIndex) => {
    const isPrimary = cardId === `primary-${side}`;
    const testId = isPrimary ? `basic-${side}-group` : `strategy-card-${cardId}`;
    const stackTestId = isPrimary ? `basic-${side}-stack` : `strategy-stack-${cardId}`;
    const explanationId = `${cardId}-translation`;
    const isExplained = activeGroup === cardId;
    const isSelected = selectedCardId === cardId;
    const sideLabel = side === 'buy' ? '매수' : '매도';
    const terminalValue = side === 'buy' ? 'MARKET' : '100%';
    const meta = cardMeta[cardId] ?? {
      title: `${sideLabel} 전략`,
      detail: '직접 구성 · 블록을 추가해 보세요',
      explanation: `오른쪽 BLOCKS에서 조건을 골라 ${sideLabel} 규칙을 구성합니다.`,
    };
    const position = section.cardPositions?.[cardId] ?? getDefaultCardPosition(cardIndex);
    return <div
      key={cardId}
      className={`strategy-container content-sized-strategy ${side}-container strategy-card ${isExplained ? 'is-explained' : ''} ${isSelected ? 'is-selected' : ''} ${draggedCard?.cardId === cardId ? 'is-card-dragging' : ''} ${cardMove?.cardId === cardId ? 'is-free-moving' : ''} ${libraryDrag?.type === 'block' ? 'is-library-drop-ready' : ''}`}
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
        aria-label={`${sideLabel} 전략 자유 이동${isPrimary ? '' : ` ${cardIndex + 1}`}`}
        onPointerDown={(event) => beginCardMove(event, section, cardId)}
      ><GripVertical size={14} /><span>MOVE</span></button>
      <button
        className="strategy-container-header"
        aria-label={`${sideLabel} 전략 자연어 설명${isPrimary ? '' : ` ${cardIndex + 1}`}`}
        aria-expanded={isExplained}
        aria-controls={explanationId}
        onClick={() => {
          setActiveSectionId(section.id);
          setSelectedCardId(cardId);
          toggleGroup(cardId);
        }}
      ><span className="container-symbol">{side === 'buy' ? 'B' : 'S'}</span><div><strong>{meta.title}</strong><small>{meta.detail}</small>{isSelected && <em className="strategy-target-badge">블록 대상</em>}</div><span>{cardBlocks[cardId].length + 1} BLOCKS</span></button>
      <div id={explanationId} className="block-stack" data-testid={stackTestId} aria-label={`${sideLabel} 전략 규칙 흐름`} onDragOver={(event) => {
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
      ? '전략'
      : sectionMove
        ? '파티션'
        : null;

  return <Localized><div className="page editor-page basic-editor-page">
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    <div className="basic-editor-commandbar floating-editor-controls" role="toolbar" aria-label="Basic 편집 작업">
      <div className="basic-editor-context"><Button className="floating-editor-button" kind="ghost" icon={ArrowLeft} onClick={goBack}>목록</Button><div className="floating-editor-mode-controls" role="group" aria-label="편집기 전환"><Button className="floating-editor-button active" onClick={() => openEditor?.('basic')}>Basic 편집기</Button><Button className="floating-editor-button" onClick={() => openEditor?.('pro')}>Pro 편집기</Button></div></div>
      <div className="basic-editor-actions"><Button className="floating-editor-button" icon={Save}>저장</Button><Button className="floating-editor-button" kind="primary" icon={ShieldCheck}>검증</Button></div>
    </div>
    <div className="editor-layout basic-layout full-editor-workspace" data-testid="basic-editor-workspace">
      <aside className="editor-palette template-library-panel panel floating-editor-panel" data-testid="basic-templates-panel">
        <div className="palette-title"><span>TEMPLATES</span><Sparkles size={15} /></div>
        <p className="library-intro">잘 몰라도 괜찮아요. 원하는 방식을 고르면 매수와 매도 규칙을 함께 만들어 드려요.</p>
        <label className="palette-search"><Search size={14} /><input aria-label="템플릿 검색" placeholder="RSI, 추세, 돌파" value={templateQuery} onChange={(event) => setTemplateQuery(event.target.value)} /></label>
        <div className="template-list">
          {filteredTemplates.map((template) => <button
            key={template.id}
            className={`template-card ${libraryDrag?.type === 'template' && libraryDrag.template.id === template.id ? 'is-library-dragging' : ''}`}
            aria-label={`${template.name} 템플릿 적용`}
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
          <strong>SECTION {activeSectionId.replace('section-', '').padStart(2, '0')}</strong>
          <small>클릭하거나 원하는 파티션으로 드래그하세요.</small>
        </div>
      </aside>
      <section
        className="editor-canvas basic-canvas"
        aria-label="Basic 전략 캔버스"
        style={{
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          '--canvas-pan-x': `${pan.x}px`,
          '--canvas-pan-y': `${pan.y}px`,
        }}
      >
        <div className="cursor-dot-spotlight" data-testid="cursor-dot-spotlight" aria-hidden="true" />
        <div className="section-draw-controls" role="group" aria-label="섹션 도구">
          <button className={`floating-editor-button ${drawMode ? 'active' : ''}`} aria-label="섹션 그리기" aria-pressed={drawMode} onClick={() => setDrawMode((current) => !current)}><Plus size={14} /> 섹션 그리기</button>
          <span>{drawMode ? '빈 공간을 드래그해 섹션을 만드세요' : `${sections.length}개 섹션 · 휠: 확대/축소 · 파티션 드래그: 이동`}</span>
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
              className={`strategy-section-frame ${activeSectionId === section.id ? 'is-selected' : ''} ${draggedCard ? 'is-card-drop-ready' : ''} ${sectionMove?.sectionId === section.id ? 'is-section-moving' : ''} ${libraryDrag?.type === 'template' ? 'is-template-drop-ready' : ''}`}
              data-testid={`strategy-${section.id}`}
              aria-label={`SECTION ${sectionNumber}`}
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
                <button className="section-move-handle" data-testid={`${section.id}-move-handle`} aria-label={`SECTION ${sectionNumber} 이동`} onPointerDown={(event) => beginSectionMove(event, section)}><GripVertical size={16} /></button>
                <div className="section-identity"><span>SECTION {sectionNumber}</span><strong>{section.symbol}</strong><small>매수 {section.cards.buy.length} · 매도 {section.cards.sell.length}</small></div>
                <div className="section-settings">
                  <label><span>종목</span><select aria-label={`SECTION ${sectionNumber} 종목`} value={section.symbol} onChange={(event) => updateSection(section.id, { symbol: event.target.value })}><option>종목 선택</option><option>AAPL</option><option>MSFT</option><option>SPY</option><option>NVDA</option><option>AAPL · MSFT · SPY</option></select></label>
                  <label><span>전체 자본 대비</span><span className="section-allocation"><input type="number" min="1" max="100" aria-label={`SECTION ${sectionNumber} 전체 자본 대비 투자비율`} value={section.allocation} onChange={(event) => updateSection(section.id, { allocation: Number(event.target.value) })} /><b>%</b></span></label>
                </div>
                <div className="section-card-actions"><button onClick={() => addStrategyCard(section.id, 'buy')}><Plus size={13} /> 매수 블록 추가</button><button onClick={() => addStrategyCard(section.id, 'sell')}><Plus size={13} /> 매도 블록 추가</button></div>
              </header>
              <div className="section-strategy-grid">
                {section.cardOrder.map((cardId, cardIndex) => renderStrategyCard(section, section.cards.buy.includes(cardId) ? 'buy' : 'sell', cardId, cardIndex))}
                {section.cards.sell.length === 0 && <button className="optional-sell-slot" onClick={() => addStrategyCard(section.id, 'sell')}><Plus size={18} /><strong>매도 블록 추가</strong><span>선택 사항 · 없어도 저장할 수 있어요</span></button>}
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
          <strong>{cardMeta[selectedCardId]?.title ?? '전략을 선택해 주세요'}</strong>
          <small>클릭하거나 원하는 전략 카드로 드래그하세요.</small>
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
        if (!event.currentTarget.contains(event.relatedTarget)) setTrashReady(false);
      }}
      onDrop={dropOnTrash}
    >
      <span className="editor-trash-icon"><Trash2 size={18} aria-hidden="true" /></span>
      <span className="editor-trash-copy"><strong>{trashItemLabel} 버리기</strong><small>여기에 놓으면 삭제됩니다</small></span>
    </div>}
  </div></Localized>;
}

const GraphNode = ({ className = '', icon: Icon, kicker, title, detail, outputs = [], x, y, children }) => <article className={`graph-node ${className}`} style={{ left: x, top: y }}><header>{Icon && <Icon size={15} />}<span>{kicker}</span><button aria-label={`${title} 메뉴`}>•••</button></header><strong>{title}</strong><small>{detail}</small>{children}{outputs.length > 0 && <div className="node-outputs">{outputs.map((output) => <span key={output.label} className={`node-output output-${output.tone}`}><small>{output.label}</small><i /></span>)}</div>}</article>;

export function ProEditor({ goBack }) {
  const [picker, setPicker] = useState(null);
  const [addedNode, setAddedNode] = useState(false);
  const releaseConnection = (event) => setPicker({ x: event.clientX, y: event.clientY });
  return <Localized><div className="page editor-page pro-page"><PageHeading eyebrow="PRO · DRAFT" title="Pro 전략 편집기" description="타입이 맞는 노드를 좌우로 연결해 분기·다종목·자금 정책을 명시합니다." meta={<Status tone="warning">필수 정책 2개 남음</Status>} actions={<><Button kind="ghost" icon={ArrowLeft} onClick={goBack}>목록</Button><Button icon={Save}>저장</Button><Button kind="primary" icon={ShieldCheck}>검증</Button></>} />
    <div className="pro-editor-shell"><aside className="pro-rail panel"><Search size={17} />{[['TRG', Play], ['VAL', Layers3], ['LOG', GitBranch], ['ORD', CircleDollarSign], ['POL', ShieldCheck]].map(([label, Icon], index) => <button key={label} className={index === 1 ? 'active' : ''}><Icon size={17} /><span>{label}</span></button>)}</aside>
      <section className="editor-canvas pro-canvas" onClick={() => picker && setPicker(null)}><div className="canvas-toolbar"><span>Pair Spread Monitor · v0.8</span><span className="canvas-zoom">GRID 16 &nbsp; · &nbsp; 82%</span></div><div className="mobile-editor-notice"><Split size={24} /><strong>Pro 그래프 편집은 데스크톱 전용입니다</strong><span>넓은 화면에서 연결과 노드 배치를 편집하세요.</span></div><svg className="graph-links" viewBox="0 0 1120 600" aria-hidden="true"><path d="M210 208 C280 208 270 154 340 154" /><path d="M505 154 C560 154 550 122 615 122" /><path d="M505 168 C560 168 550 305 615 305" className="link-false" /><path d="M780 122 C840 122 820 228 890 228" /><path d="M780 305 C840 305 820 246 890 246" className="link-false" /></svg>
        <GraphNode icon={Play} kicker="TRIGGER" title="Bar closed" detail="1 minute · regular session" x={48} y={150} outputs={[{ label: 'event', tone: 'event' }]} />
        <GraphNode icon={GitBranch} kicker="CONDITION" title="Spread threshold" detail="z-score · user input" x={340} y={98} outputs={[{ label: 'true', tone: 'true' }, { label: 'false', tone: 'false' }]}><button data-testid="true-output" className="connection-handle true-handle" aria-label="true 출력 연결" onPointerUp={releaseConnection}><span>TRUE</span><i /></button></GraphNode>
        <GraphNode icon={CircleDollarSign} kicker="CANDIDATE" title="Open pair" detail="two order intents" x={615} y={66} outputs={[{ label: 'candidate', tone: 'event' }]} /><GraphNode icon={Timer} kicker="STATE" title="Wait next event" detail="no order candidate" x={615} y={249} outputs={[{ label: 'state', tone: 'false' }]} /><GraphNode icon={ShieldCheck} kicker="FINALIZE" title="Order processor" detail="deduplicate · budget · risk" x={890} y={172} outputs={[{ label: 'orders', tone: 'true' }]} />{addedNode && <GraphNode className="new-node" icon={ShieldCheck} kicker="CONDITION" title="Position check" detail="explicit state condition" x={545} y={410} outputs={[{ label: 'true', tone: 'true' }, { label: 'false', tone: 'false' }]} />}
        {picker && <div role="dialog" aria-label="호환 노드 선택" className="node-picker" style={{ left: `${picker.x}px`, top: `${picker.y}px` }} onClick={(event) => event.stopPropagation()}><header><div><span>TRUE OUTPUT</span><strong>호환 노드 선택</strong></div><button aria-label="호환 노드 선택 닫기" onClick={() => setPicker(null)}><X size={15} /></button></header><label><Search size={14} /><input autoFocus aria-label="호환 노드 검색" placeholder="노드 검색" /></label><p>조건 · 비교</p><button aria-label="포지션 확인" onClick={() => { setAddedNode(true); setPicker(null); }}><ShieldCheck size={16} /><span><strong>포지션 확인</strong><small>보유 수량과 상태 비교</small></span><kbd>↵</kbd></button><button aria-label="값 비교"><GitBranch size={16} /><span><strong>값 비교</strong><small>같은 타입의 두 값 비교</small></span></button><p>주문 후보</p><button aria-label="매수 후보"><CircleDollarSign size={16} /><span><strong>매수 후보</strong><small>시장 주문 후보 생성</small></span></button></div>}<div className="graph-minimap"><span /><i /><b /></div>
      </section><aside className="node-inspector panel"><div className="inspector-title"><span>NODE SETTINGS</span><button aria-label="설정 닫기"><X size={15} /></button></div><div className="node-id">CONDITION · 04</div><h3>Spread threshold</h3><div className="inspector-section"><label>Left value</label><button className="select-field">Pair z-score <ChevronDown size={14} /></button></div><div className="inspector-section"><label>Operator</label><button className="select-field">Greater than <ChevronDown size={14} /></button></div><div className="inspector-section"><label>User input</label><div className="empty-input"><span>값을 입력하세요</span><b>required</b></div></div><div className="port-legend"><span><i className="port true" /> TRUE · compatible 8</span><span><i className="port false" /> FALSE · compatible 6</span></div></aside>
    </div>
  </div></Localized>;
}
