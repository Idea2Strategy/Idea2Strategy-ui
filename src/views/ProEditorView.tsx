import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  DragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent,
} from 'react';
import {
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Calculator,
  CandlestickChart,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  GitBranch,
  Grid3X3,
  GripVertical,
  Layers3,
  LayoutGrid,
  ListRestart,
  MousePointer2,
  Pencil,
  Play,
  Plus,
  Redo2,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Split,
  Star,
  Timer,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '../components/common';
import { Localized } from '../lib/i18n';
import { getStrategyCanvasWheelZoom } from '../lib/strategyCanvasLayout';
import type { CanvasPoint, CardMoveGesture } from '../lib/strategyCanvasLayout';

type EditorMode = 'basic' | 'pro';
type LibraryView = 'nodes' | 'templates';
type InspectorTab = 'settings' | 'validation' | 'description';
type SaveState = 'saved' | 'saving' | 'dirty' | 'failed';
type ValidationState = 'incomplete' | 'ready';
type NodeLevel = 'core' | 'advanced';
type SettingKind = 'select' | 'number' | 'text' | 'symbols' | 'fixed';
type PortType =
  | 'flow'
  | 'symbol'
  | 'price'
  | 'volume'
  | 'number'
  | 'ratio'
  | 'money'
  | 'quantity'
  | 'time'
  | 'condition';

interface PortDefinition {
  id: string;
  label: string;
  type: PortType;
  optional?: boolean;
  testId?: string;
  groupId?: string;
  groupLabel?: string;
}

interface SettingDefinition {
  id: string;
  label: string;
  kind: SettingKind;
  placeholder?: string;
  options?: string[];
  unit?: string;
  min?: number;
  max?: number;
  required?: boolean;
  direct?: boolean;
  fixedValue?: string;
}

interface NodeBlueprint {
  id: string;
  title: string;
  category: string;
  level: NodeLevel;
  description: string;
  icon: LucideIcon;
  aliases?: string[];
  wide?: boolean;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  settings: SettingDefinition[];
}

interface GraphNode {
  id: string;
  blueprintId: string;
  title: string;
  x: number;
  y: number;
  collapsed: boolean;
  values: Record<string, string>;
}

interface LinkEnd {
  nodeId: string;
  portId: string;
}

interface GraphLink {
  id: string;
  from: LinkEnd;
  to: LinkEnd;
  type: PortType;
}

interface GraphGroup {
  id: string;
  title: string;
  nodeIds: string[];
  collapsed: boolean;
  color: string;
}

interface GraphState {
  nodes: GraphNode[];
  links: GraphLink[];
  groups: GraphGroup[];
}

interface LinkDraft {
  anchor: LinkEnd;
  direction: 'output' | 'input';
  type: PortType;
  origin: CanvasPoint;
  point: CanvasPoint;
  reconnectingLinkId?: string;
}

interface NodeMoveGesture extends CardMoveGesture {
  nodeId: string;
  groupId?: string;
}

interface NodePickerState {
  clientX: number;
  clientY: number;
  anchor: LinkEnd;
  direction: 'output' | 'input';
  type: PortType;
  reconnectingLinkId?: string;
}

interface SelectionGesture {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface LinkReconnectGesture {
  linkId: string;
  startX: number;
  startY: number;
  moved: boolean;
}

interface ValidationIssue {
  id: string;
  severity: 'error' | 'warning';
  nodeId: string | null;
  settingId?: string;
  portId?: string;
  title: string;
  detail: string;
  resolution: string;
}

interface NoticeState {
  tone: 'info' | 'error';
  title: string;
  detail?: string;
}

interface TemplateDefinition {
  id: string;
  title: string;
  level: NodeLevel;
  description: string;
  indicatorId: string;
}

interface ProEditorProps {
  goBack: () => void;
  openEditor?: (mode: EditorMode) => void;
  onLaunchBot?: () => void;
}

const STORAGE_KEY = 'i2s-pro-editor-draft-v2';
const EXPANDED_PORTS_STORAGE_KEY = 'i2s-pro-editor-expanded-ports-v1';
const FAVORITE_NODES_STORAGE_KEY = 'i2s-pro-editor-favorite-nodes-v1';
const NODE_HEADER_HEIGHT = 48;
const NODE_ROW_HEIGHT = 32;
const NODE_ROW_GAP = 1;
const NODE_BODY_PADDING = 6;
const NODE_FOOTER_HEIGHT = 5;
const NODE_WIDTH = 244;
const WIDE_NODE_WIDTH = 276;
const GRID_SIZE = 16;
const COLLAPSED_GROUP_WIDTH = 218;
const COLLAPSED_GROUP_HEIGHT = 62;
const GROUP_COLORS = ['#d6b567', '#67b7d6', '#8f7ee7', '#61b982', '#d97878', '#cf79a5'];

const CATEGORY_META: Record<string, { color: string; short: string }> = {
  '이벤트·흐름': { color: '#48d17f', short: 'FLOW' },
  '시장 데이터': { color: '#0ea5e9', short: 'DATA' },
  '값·계산': { color: '#8b5cf6', short: 'VALUE' },
  '기술 지표': { color: '#6366f1', short: 'INDICATOR' },
  '조건·분기': { color: '#eab308', short: 'CONDITION' },
  '포지션·계좌': { color: '#f97316', short: 'PORTFOLIO' },
  '자금 배분': { color: '#ec4899', short: 'ALLOCATION' },
  주문: { color: '#ef4444', short: 'ORDER' },
};
const CATEGORY_ORDER = ['이벤트·흐름', '시장 데이터', '값·계산', '기술 지표', '조건·분기', '포지션·계좌', '자금 배분', '주문'];

const PORT_META: Record<PortType, { label: string; color: string; shape: string }> = {
  flow: { label: '실행 흐름', color: '#e2e8f0', shape: 'diamond' },
  symbol: { label: '종목', color: '#2dd4bf', shape: 'circle' },
  price: { label: '가격', color: '#38bdf8', shape: 'circle' },
  volume: { label: '거래량', color: '#0284c7', shape: 'square' },
  number: { label: '수치', color: '#a78bfa', shape: 'circle' },
  ratio: { label: '비율', color: '#c084fc', shape: 'circle' },
  money: { label: '금액', color: '#fb7185', shape: 'square' },
  quantity: { label: '수량·횟수', color: '#94a3b8', shape: 'square' },
  time: { label: '시간·기간', color: '#64748b', shape: 'square' },
  condition: { label: '조건', color: '#facc15', shape: 'diamond' },
};

const NUMERIC_PORTS = new Set<PortType>(['price', 'number', 'ratio', 'money', 'quantity']);
const portsCompatible = (output: PortType, input: PortType) => (
  output === input || (input === 'number' && NUMERIC_PORTS.has(output))
);

type SelectOptionTone = 'neutral' | 'time' | 'entry' | 'exit' | 'order' | 'risk' | 'condition' | 'money' | 'calculation' | 'data';

const getSelectOptionMeta = (
  setting: SettingDefinition,
  option: string,
): { icon: LucideIcon; tone: SelectOptionTone; caption: string } => {
  const meaning = `${setting.id} ${setting.label} ${option}`;
  if (/봉|장 시작|장 마감|거래일|시간|시각|기간|분$/.test(meaning)) {
    return { icon: Clock3, tone: 'time', caption: '시간' };
  }
  if (/청산|공매도.*진입/.test(meaning)) {
    return { icon: ArrowDownToLine, tone: 'exit', caption: '청산·공매도' };
  }
  if (/진입|추가 매수|재진입/.test(meaning)) {
    return { icon: ArrowUpFromLine, tone: 'entry', caption: '진입' };
  }
  if (/포지션|주문/.test(meaning)) {
    return { icon: ArrowUpFromLine, tone: 'order', caption: '주문·포지션' };
  }
  if (/손실|고점|예산|제한|중단|건너뛰기|누락|지연|거래 정지|사용하지 않음/.test(meaning)) {
    return { icon: ShieldCheck, tone: 'risk', caption: '위험·예외' };
  }
  if (/조건|만족|포함|제외|같음|큼|작음|범위|통과|반대로/.test(meaning)) {
    return { icon: GitBranch, tone: 'condition', caption: '조건' };
  }
  if (/금액|현금|평가자산|비율|수익률/.test(meaning)) {
    return { icon: CircleDollarSign, tone: 'money', caption: '자금·비율' };
  }
  if (/계산|평균|합계|최고|최저|편차|더하기|빼기|곱하기|나누기|변화율|횟수/.test(meaning)) {
    return { icon: Calculator, tone: 'calculation', caption: '계산' };
  }
  if (/가격|수량|종목|데이터|정규장|장전|장후|휴장|현재|이전|고가|저가|종가/.test(meaning)) {
    return { icon: CandlestickChart, tone: 'data', caption: '시장 데이터' };
  }
  return { icon: Settings2, tone: 'neutral', caption: option ? setting.label : '미설정' };
};

const selectSetting = (
  id: string,
  label: string,
  options: string[],
  direct = true,
  required = direct,
): SettingDefinition => ({ id, label, kind: 'select', options, placeholder: '선택', direct, required });

const numberSetting = (
  id: string,
  label: string,
  unit = '',
  min?: number,
  max?: number,
  direct = true,
  required = direct,
): SettingDefinition => ({ id, label, kind: 'number', placeholder: '입력', unit, min, max, direct, required });

const indicatorBlueprint = (
  id: string,
  title: string,
  level: NodeLevel,
  inputs: PortDefinition[],
  outputs: PortDefinition[],
  settings: SettingDefinition[] = [numberSetting('period', '기간', '봉', 2, 10000)],
): NodeBlueprint => ({
  id,
  title,
  category: '기술 지표',
  level,
  description: `${title} 값을 계산합니다`,
  icon: Sparkles,
  inputs,
  outputs,
  settings,
});

const PRICE_INPUT: PortDefinition = { id: 'price', label: '가격', type: 'price' };
const HIGH_INPUT: PortDefinition = { id: 'high', label: '고가', type: 'price' };
const LOW_INPUT: PortDefinition = { id: 'low', label: '저가', type: 'price' };
const CLOSE_INPUT: PortDefinition = { id: 'close', label: '종가', type: 'price' };
const VOLUME_INPUT: PortDefinition = { id: 'volume', label: '거래량', type: 'volume' };

const NODE_BLUEPRINTS: NodeBlueprint[] = [
  {
    id: 'event',
    title: '이벤트 시작',
    category: '이벤트·흐름',
    level: 'core',
    description: '평가를 시작할 시점을 정합니다',
    icon: Clock3,
    inputs: [],
    outputs: [
      { id: 'flow', label: '실행', type: 'flow', testId: 'event-flow-output' },
      { id: 'time', label: '시각', type: 'time' },
    ],
    settings: [
      selectSetting('eventType', '이벤트', ['봉 마감', '장 시작', '장 마감 전', '장 마감', '포지션 진입', '포지션 청산']),
      selectSetting('timeframe', '봉 주기', ['이벤트 봉 주기', '1분봉', '3분봉', '5분봉', '15분봉', '30분봉', '1시간봉', '4시간봉', '일봉', '주봉']),
    ],
  },
  {
    id: 'universe',
    title: '종목 선택·반복',
    category: '이벤트·흐름',
    level: 'core',
    description: '선택한 종목마다 이후 흐름을 실행합니다',
    icon: ListRestart,
    aliases: ['직접 선택 바스켓', '종목 선택'],
    wide: true,
    inputs: [{ id: 'flow', label: '실행', type: 'flow' }],
    outputs: [
      { id: 'itemFlow', label: '반복 실행', type: 'flow' },
      { id: 'symbol', label: '현재 종목', type: 'symbol' },
      { id: 'index', label: '현재 순번', type: 'quantity' },
      { id: 'total', label: '전체 수', type: 'quantity' },
      { id: 'done', label: '반복 완료', type: 'flow' },
    ],
    settings: [
      { id: 'symbols', label: '종목', kind: 'symbols', placeholder: '종목 선택', direct: true, required: true },
      numberSetting('maxExposure', '최대 보유', '%', 0.1, 100),
      selectSetting('unavailable', '거래 불가', ['해당 종목 건너뛰기', '전체 흐름 중단'], false, true),
    ],
  },
  {
    id: 'market-data',
    title: '시세 데이터',
    category: '시장 데이터',
    level: 'core',
    description: '마감된 시세에서 필요한 값을 꺼냅니다',
    icon: CandlestickChart,
    inputs: [{ id: 'symbol', label: '종목', type: 'symbol' }],
    outputs: [
      { id: 'open', label: '시가', type: 'price', groupId: 'ohlc', groupLabel: '가격' },
      { id: 'high', label: '고가', type: 'price', groupId: 'ohlc', groupLabel: '가격' },
      { id: 'low', label: '저가', type: 'price', groupId: 'ohlc', groupLabel: '가격' },
      { id: 'close', label: '종가', type: 'price', groupId: 'ohlc', groupLabel: '가격' },
      { id: 'volume', label: '거래량', type: 'volume' },
    ],
    settings: [
      selectSetting('range', '데이터', ['현재 봉', '이전 거래일', '현재 거래일']),
      selectSetting('timeframe', '봉 주기', ['이벤트 봉 주기', '1분봉', '3분봉', '5분봉', '15분봉', '30분봉', '1시간봉', '4시간봉', '일봉', '주봉']),
      selectSetting('missing', '값 없음', ['흐름 중단', '값 없음으로 전달', '해당 종목 건너뛰기'], false, true),
    ],
  },
  {
    id: 'market-state',
    title: '시장·데이터 상태',
    category: '시장 데이터',
    level: 'advanced',
    description: '거래 시간과 데이터 상태를 확인합니다',
    icon: Layers3,
    inputs: [{ id: 'symbol', label: '종목', type: 'symbol' }],
    outputs: [{ id: 'state', label: '선택한 상태', type: 'condition' }],
    settings: [selectSetting('state', '확인 항목', ['정규장', '장전', '장후', '휴장', '거래 정지', '데이터 정상', '데이터 지연', '데이터 누락', '마지막 갱신 후 경과 시간'])],
  },
  {
    id: 'value',
    title: '값',
    category: '값·계산',
    level: 'core',
    description: '비교와 계산에 사용할 값을 만듭니다',
    icon: Calculator,
    inputs: [],
    outputs: [{ id: 'value', label: '값', type: 'number', testId: 'value-output' }],
    settings: [
      selectSetting('valueType', '종류', ['일반 숫자', '가격', '비율', '금액', '수량', '봉 수', '거래일 수', '분', '시각', '종목']),
      numberSetting('value', '값'),
    ],
  },
  {
    id: 'previous-value',
    title: '이전 값',
    category: '값·계산',
    level: 'core',
    description: '지정한 봉 수 이전 값을 가져옵니다',
    icon: Timer,
    inputs: [{ id: 'value', label: '시계열 값', type: 'number' }, { id: 'period', label: '이전 봉 수', type: 'quantity', optional: true }],
    outputs: [{ id: 'previous', label: '이전 값', type: 'number' }],
    settings: [numberSetting('period', '이전', '봉', 1, 10000)],
  },
  {
    id: 'period-calc',
    title: '기간 계산',
    category: '값·계산',
    level: 'core',
    description: '기간 안의 값을 집계합니다',
    icon: Calculator,
    inputs: [{ id: 'value', label: '계산할 값', type: 'number' }, { id: 'period', label: '계산 기간', type: 'quantity', optional: true }],
    outputs: [{ id: 'result', label: '계산 결과', type: 'number' }],
    settings: [
      selectSetting('method', '계산', ['평균', '합계', '최고', '최저', '표준편차', '조건 만족 횟수']),
      numberSetting('period', '기간', '봉', 2, 10000),
      selectSetting('current', '현재 봉', ['포함', '제외'], false),
    ],
  },
  {
    id: 'math',
    title: '수학 계산',
    category: '값·계산',
    level: 'core',
    description: '두 값을 계산합니다',
    icon: Calculator,
    inputs: [{ id: 'a', label: '값 A', type: 'number' }, { id: 'b', label: '값 B', type: 'number' }],
    outputs: [{ id: 'result', label: '계산 결과', type: 'number' }],
    settings: [selectSetting('method', '계산', ['더하기', '빼기', '곱하기', '나누기', '절댓값', '두 값 중 작은 값', '두 값 중 큰 값', '최솟값과 최댓값 사이로 제한'])],
  },
  {
    id: 'change',
    title: '변화 계산',
    category: '값·계산',
    level: 'core',
    description: '기준 대비 변화량을 계산합니다',
    icon: Calculator,
    inputs: [{ id: 'current', label: '현재 값', type: 'number' }, { id: 'base', label: '기준 값', type: 'number' }],
    outputs: [{ id: 'result', label: '변화', type: 'ratio' }],
    settings: [selectSetting('method', '방식', ['단순 차이', '변화율', '로그 수익률'])],
  },
  indicatorBlueprint('sma', 'SMA', 'core', [PRICE_INPUT], [{ id: 'result', label: '이동평균', type: 'price' }]),
  indicatorBlueprint('ema', 'EMA', 'core', [PRICE_INPUT], [{ id: 'result', label: '이동평균', type: 'price' }]),
  indicatorBlueprint('rsi', 'RSI', 'core', [PRICE_INPUT], [{ id: 'result', label: 'RSI', type: 'number', testId: 'rsi-output' }], [numberSetting('period', '기간', '봉', 2, 1000)]),
  indicatorBlueprint('macd', 'MACD', 'core', [PRICE_INPUT], [
    { id: 'macd', label: 'MACD선', type: 'number' },
    { id: 'signal', label: '신호선', type: 'number' },
    { id: 'histogram', label: '히스토그램', type: 'number' },
  ], [
    numberSetting('fast', '빠른 기간', '봉', 2, 1000),
    numberSetting('slow', '느린 기간', '봉', 3, 2000),
    numberSetting('signal', '신호 기간', '봉', 2, 1000),
  ]),
  indicatorBlueprint('bollinger', 'Bollinger Bands', 'core', [PRICE_INPUT], [
    { id: 'upper', label: '상단선', type: 'price' },
    { id: 'middle', label: '중앙선', type: 'price' },
    { id: 'lower', label: '하단선', type: 'price' },
    { id: 'width', label: '띠 너비', type: 'ratio' },
  ], [numberSetting('period', '기간', '봉', 2, 10000), numberSetting('deviation', '표준편차', '배', 0.1, 20)]),
  indicatorBlueprint('atr', 'ATR', 'core', [HIGH_INPUT, LOW_INPUT, CLOSE_INPUT], [{ id: 'result', label: '평균 변동폭', type: 'price' }]),
  indicatorBlueprint('wma', 'WMA', 'advanced', [PRICE_INPUT], [{ id: 'result', label: '이동평균', type: 'price' }]),
  indicatorBlueprint('adx', 'ADX', 'advanced', [HIGH_INPUT, LOW_INPUT, CLOSE_INPUT], [
    { id: 'strength', label: '추세 강도', type: 'number' },
    { id: 'up', label: '상승 강도', type: 'number' },
    { id: 'down', label: '하락 강도', type: 'number' },
  ]),
  indicatorBlueprint('supertrend', 'Supertrend', 'advanced', [HIGH_INPUT, LOW_INPUT, CLOSE_INPUT], [
    { id: 'line', label: '추세선', type: 'price' },
    { id: 'up', label: '상승 추세', type: 'condition' },
    { id: 'down', label: '하락 추세', type: 'condition' },
  ], [numberSetting('period', '기간', '봉', 2, 10000), numberSetting('multiple', '배수', '배', 0.1, 100)]),
  indicatorBlueprint('donchian', 'Donchian Channel', 'advanced', [HIGH_INPUT, LOW_INPUT], [
    { id: 'upper', label: '상단선', type: 'price' },
    { id: 'middle', label: '중앙선', type: 'price' },
    { id: 'lower', label: '하단선', type: 'price' },
  ], [numberSetting('period', '기간', '봉', 2, 10000), selectSetting('current', '현재 봉', ['포함', '제외'], false)]),
  indicatorBlueprint('stochastic', 'Stochastic', 'advanced', [HIGH_INPUT, LOW_INPUT, CLOSE_INPUT], [
    { id: 'fast', label: '빠른선', type: 'number' },
    { id: 'signal', label: '신호선', type: 'number' },
  ], [
    numberSetting('range', '가격 범위', '봉', 2, 10000),
    numberSetting('signal', '신호 기간', '봉', 1, 1000),
    numberSetting('smooth', '완화 기간', '봉', 1, 1000),
  ]),
  indicatorBlueprint('cci', 'CCI', 'advanced', [HIGH_INPUT, LOW_INPUT, CLOSE_INPUT], [{ id: 'result', label: 'CCI', type: 'number' }]),
  indicatorBlueprint('roc', 'ROC', 'advanced', [PRICE_INPUT], [{ id: 'result', label: '변화율', type: 'ratio' }], [numberSetting('period', '비교 기간', '봉', 1, 10000)]),
  indicatorBlueprint('momentum', 'Momentum', 'advanced', [PRICE_INPUT], [{ id: 'result', label: '차이', type: 'number' }], [numberSetting('period', '비교 기간', '봉', 1, 10000)]),
  indicatorBlueprint('obv', 'OBV', 'advanced', [CLOSE_INPUT, VOLUME_INPUT], [{ id: 'result', label: '누적 거래량', type: 'volume' }], []),
  indicatorBlueprint('mfi', 'MFI', 'advanced', [HIGH_INPUT, LOW_INPUT, CLOSE_INPUT, VOLUME_INPUT], [{ id: 'result', label: '자금 흐름', type: 'number' }], [numberSetting('period', '기간', '봉', 2, 1000)]),
  indicatorBlueprint('volatility', '변동성', 'advanced', [PRICE_INPUT], [{ id: 'result', label: '변동성', type: 'ratio' }], [
    numberSetting('period', '기간', '봉', 2, 10000),
    selectSetting('method', '계산', ['단순 수익률 표준편차', '로그 수익률 표준편차']),
    selectSetting('annualize', '연환산', ['사용하지 않음', '252거래일', '사용자 지정 거래일 수'], false),
  ]),
  {
    id: 'compare',
    title: '값 비교',
    category: '조건·분기',
    level: 'core',
    description: '같은 종류의 값을 비교합니다',
    icon: GitBranch,
    inputs: [
      { id: 'a', label: '값 A', type: 'number' },
      { id: 'b', label: '값 B', type: 'number' },
    ],
    outputs: [{ id: 'condition', label: '조건', type: 'condition', testId: 'condition-output' }],
    settings: [selectSetting('operator', '비교', ['A가 B보다 큼', 'A가 B보다 크거나 같음', 'A가 B보다 작음', 'A가 B보다 작거나 같음', 'A와 B가 같음', 'A와 B가 다름', '범위 안', '범위 밖'])],
  },
  {
    id: 'cross',
    title: '교차',
    category: '조건·분기',
    level: 'core',
    description: '두 값의 교차 시점을 찾습니다',
    icon: GitBranch,
    inputs: [{ id: 'a', label: '값 A', type: 'number' }, { id: 'b', label: '값 B', type: 'number' }],
    outputs: [{ id: 'condition', label: '조건', type: 'condition' }],
    settings: [selectSetting('direction', '방향', ['아래에서 위로 통과', '위에서 아래로 통과'])],
  },
  {
    id: 'logic',
    title: '논리 조합',
    category: '조건·분기',
    level: 'core',
    description: '여러 조건을 하나로 묶습니다',
    icon: Split,
    inputs: [
      { id: 'condition1', label: '조건 1', type: 'condition' },
      { id: 'condition2', label: '조건 2', type: 'condition', optional: true },
      { id: 'condition3', label: '조건 3', type: 'condition', optional: true },
    ],
    outputs: [{ id: 'condition', label: '조합된 조건', type: 'condition' }],
    settings: [selectSetting('method', '조합', ['모든 조건 만족', '하나 이상의 조건 만족', '조건 반대로 바꾸기'])],
  },
  {
    id: 'signal-rule',
    title: '신호 규칙',
    category: '조건·분기',
    level: 'advanced',
    description: '조건의 횟수와 재실행을 제어합니다',
    icon: Timer,
    inputs: [{ id: 'condition', label: '조건', type: 'condition' }],
    outputs: [{ id: 'condition', label: '가공된 조건', type: 'condition' }],
    settings: [
      selectSetting('rule', '규칙', ['N봉 연속 만족', '최근 M봉 동안 N회 이상 만족', '첫 조건 후 N봉 안에 두 번째 조건 만족', 'N봉 뒤에 전달', 'N봉 동안 재실행 제한', 'N거래일 동안 재실행 제한', '한 봉에 한 번', '한 거래일에 한 번', '한 포지션에 한 번', '전략 전체에서 한 번']),
      numberSetting('count', '횟수·기간', '봉', 1, 10000),
    ],
  },
  {
    id: 'branch',
    title: '조건 분기',
    category: '조건·분기',
    level: 'core',
    description: '조건에 따라 실행 흐름을 나눕니다',
    icon: GitBranch,
    inputs: [{ id: 'flow', label: '실행', type: 'flow' }, { id: 'condition', label: '조건', type: 'condition' }],
    outputs: [
      { id: 'met', label: '조건 만족', type: 'flow', testId: 'true-output' },
      { id: 'notMet', label: '조건 불만족', type: 'flow' },
    ],
    settings: [selectSetting('execution', '실행 시점', ['조건이 새로 만족될 때', '조건을 만족하는 동안 계속'])],
  },
  {
    id: 'portfolio-value',
    title: '포지션·계좌 값',
    category: '포지션·계좌',
    level: 'core',
    description: '선택한 계좌 값 하나를 출력합니다',
    icon: ShieldCheck,
    aliases: ['평균 진입가', '보유 수량', '최고 수익', '고점 하락'],
    inputs: [{ id: 'symbol', label: '종목', type: 'symbol', optional: true }],
    outputs: [{ id: 'value', label: '선택한 값', type: 'number' }],
    settings: [
      selectSetting('metric', '확인 항목', ['포지션 없음 여부', '매수 포지션 보유 여부', '공매도 포지션 보유 여부', '평균 진입가', '보유 수량', '포지션 평가금액', '미실현 수익률', '최고 수익률', '고점 대비 하락률', '보유 봉 수', '보유 거래일 수', '사용 가능 현금', '전체 평가자산']),
      selectSetting('direction', '포지션 방향', ['현재 포지션', '매수 포지션', '공매도 포지션'], false),
      selectSetting('peak', '고점 기준', ['최고 마감가', '최고 고가'], false),
    ],
  },
  {
    id: 'allocation',
    title: '주문 규모 계산',
    category: '자금 배분',
    level: 'advanced',
    description: '연결된 값으로 주문 규모를 계산합니다',
    icon: Calculator,
    wide: true,
    inputs: [
      { id: 'price', label: '현재 가격', type: 'price', optional: true },
      { id: 'equity', label: '전체 평가자산', type: 'money', optional: true },
      { id: 'cash', label: '사용 가능 현금', type: 'money', optional: true },
      { id: 'count', label: '전체 종목 수', type: 'quantity', optional: true },
      { id: 'stop', label: '손절 가격', type: 'price', optional: true },
      { id: 'volatility', label: '변동성', type: 'ratio', optional: true },
    ],
    outputs: [{ id: 'money', label: '주문 금액', type: 'money' }, { id: 'quantity', label: '주문 수량', type: 'quantity' }],
    settings: [selectSetting('method', '계산', ['선택 목록 균등 배분', '거래당 손실 한도 기준', '변동성 역비중', '연결된 금액 사용', '연결된 수량 사용'])],
  },
  {
    id: 'order',
    title: '주문 요청',
    category: '주문',
    level: 'core',
    description: '조건을 주문 요청으로 만듭니다',
    icon: CircleDollarSign,
    wide: true,
    inputs: [
      { id: 'flow', label: '실행', type: 'flow' },
      { id: 'symbol', label: '종목', type: 'symbol' },
      { id: 'sizeMoney', label: '주문 금액', type: 'money', optional: true },
      { id: 'sizeQuantity', label: '주문 수량', type: 'quantity', optional: true },
    ],
    outputs: [
      { id: 'after', label: '요청 완료', type: 'flow' },
      { id: 'money', label: '주문 금액', type: 'money' },
      { id: 'quantity', label: '주문 수량', type: 'quantity' },
    ],
    settings: [
      selectSetting('action', '행동', ['매수 포지션 진입', '매수 포지션 청산', '공매도 포지션 진입', '공매도 포지션 청산']),
      selectSetting('sizeMode', '규모', ['고정 금액', '고정 수량', '전체 평가자산의 비율', '사용 가능 현금의 비율', '기존 포지션의 비율', '전량', '외부에서 계산한 규모 사용']),
      numberSetting('priority', '우선순위', '', 1, 100),
      numberSetting('maxUse', '시점 최대', '%', 0.1, 100, false, true),
      selectSetting('oneOrderMaxMode', '1회 최대', ['제한 없음', '고정 금액', '사용 가능 현금의 비율', '전체 평가자산의 비율'], false, true),
      selectSetting('budgetShortage', '예산 부족', ['비례 축소 허용', '전액 가능할 때만 실행'], false, true),
      selectSetting('sameDirection', '같은 방향', ['신호 무시', '추가 진입', '기존 포지션 청산 후 재진입'], false, true),
      selectSetting('oppositeDirection', '반대 방향', ['신호 무시', '기존 포지션만 청산', '기존 포지션 청산 후 반대 방향 진입'], false, true),
      numberSetting('reentryGap', '재주문 간격', '봉', 1, 10000, false),
      numberSetting('maxEntries', '최대 진입', '회', 1, 1000, false),
      selectSetting('lotRule', '최소 단위', ['주문 수량 내림', '요청 건너뛰기'], false, true),
      selectSetting('duplicate', '중복 요청', ['첫 요청만 사용', '모든 요청 합산', '가장 큰 요청만 사용'], false, true),
      { id: 'orderType', label: '주문 방식', kind: 'fixed', fixedValue: '시장가', direct: false },
    ],
  },
];

const BLUEPRINT_BY_ID = Object.fromEntries(NODE_BLUEPRINTS.map((blueprint) => [blueprint.id, blueprint])) as Record<string, NodeBlueprint>;

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  { id: 'bar-loop', title: '봉 마감 종목 반복', level: 'core', description: '이벤트와 종목 반복의 기본 골격', indicatorId: 'rsi' },
  { id: 'streak', title: '연속 상승·하락', level: 'core', description: '연속 조건과 주문 흐름', indicatorId: 'signal-rule' },
  { id: 'average-breakout', title: '최근 평균 가격 돌파', level: 'core', description: '평균선 돌파 구조', indicatorId: 'sma' },
  { id: 'high-low-breakout', title: '최근 최고·최저 돌파', level: 'core', description: '기간 최고·최저 비교 구조', indicatorId: 'period-calc' },
  { id: 'open-change', title: '장 시작가 대비 변화', level: 'core', description: '장 시작가 변화 비교 구조', indicatorId: 'change' },
  { id: 'dip-buy', title: '하루 급락 매수', level: 'core', description: '일간 변화와 진입 흐름', indicatorId: 'change' },
  { id: 'scheduled-buy', title: '정기 매수', level: 'core', description: '일정 이벤트와 주문 요청', indicatorId: 'value' },
  { id: 'rsi-rebound', title: 'RSI 반등', level: 'core', description: 'RSI 비교와 조건 분기', indicatorId: 'rsi' },
  { id: 'sma-cross', title: 'SMA 교차', level: 'core', description: '두 평균선의 교차 구조', indicatorId: 'sma' },
  { id: 'macd-turn', title: 'MACD 전환', level: 'core', description: 'MACD 신호 비교 구조', indicatorId: 'macd' },
  { id: 'bollinger-reversal', title: 'Bollinger 반전', level: 'core', description: '밴드 경계 반전 구조', indicatorId: 'bollinger' },
  { id: 'fixed-stop', title: '고정 손절', level: 'core', description: '포지션 손실률 청산 구조', indicatorId: 'portfolio-value' },
  { id: 'fixed-profit', title: '고정 익절', level: 'core', description: '포지션 수익률 청산 구조', indicatorId: 'portfolio-value' },
  { id: 'max-hold', title: '최대 보유 기간', level: 'core', description: '보유 기간 청산 구조', indicatorId: 'portfolio-value' },
  { id: 'donchian', title: 'Donchian 돌파', level: 'advanced', description: '채널 돌파 추세 구조', indicatorId: 'donchian' },
  { id: 'supertrend', title: 'Supertrend 추세 전환', level: 'advanced', description: '추세 전환 조건 구조', indicatorId: 'supertrend' },
  { id: 'atr-stop', title: 'ATR 손절', level: 'advanced', description: '변동폭 기반 손절 구조', indicatorId: 'atr' },
  { id: 'atr-profit', title: 'ATR 익절', level: 'advanced', description: '변동폭 기반 익절 구조', indicatorId: 'atr' },
  { id: 'profit-protect', title: '수익 보호', level: 'advanced', description: '최고 수익과 하락률 보호', indicatorId: 'portfolio-value' },
  { id: 'long-short', title: '매수·공매도 방향 전환', level: 'advanced', description: '양방향 주문 분기 구조', indicatorId: 'branch' },
  { id: 'equal-allocation', title: '선택 목록 균등 금액', level: 'advanced', description: '균등 자금 배분 구조', indicatorId: 'allocation' },
  { id: 'risk-allocation', title: '거래당 손실 한도 기준 주문', level: 'advanced', description: '손실 한도 기반 주문 규모', indicatorId: 'allocation' },
  { id: 'volatility-allocation', title: '변동성 기준 주문', level: 'advanced', description: '변동성 역비중 주문 구조', indicatorId: 'volatility' },
];

const makeNode = (blueprintId: string, id: string, x: number, y: number): GraphNode => ({
  id,
  blueprintId,
  title: BLUEPRINT_BY_ID[blueprintId].title,
  x,
  y,
  collapsed: false,
  values: {},
});

const makeLink = (
  id: string,
  fromNodeId: string,
  fromPortId: string,
  toNodeId: string,
  toPortId: string,
): GraphLink => {
  const source = BLUEPRINT_BY_ID[INITIAL_BLUEPRINT_LOOKUP[fromNodeId] ?? fromNodeId]?.outputs.find((port) => port.id === fromPortId);
  return {
    id,
    from: { nodeId: fromNodeId, portId: fromPortId },
    to: { nodeId: toNodeId, portId: toPortId },
    type: source?.type ?? 'number',
  };
};

const INITIAL_BLUEPRINT_LOOKUP: Record<string, string> = {
  'pro-event': 'event',
  'pro-universe': 'universe',
  'pro-market': 'market-data',
  'pro-rsi': 'rsi',
  'pro-value': 'value',
  'pro-compare': 'compare',
  'pro-branch': 'branch',
  'pro-order': 'order',
};

const INITIAL_GRAPH: GraphState = {
  nodes: [
    makeNode('event', 'pro-event', 40, 160),
    makeNode('universe', 'pro-universe', 372, 160),
    makeNode('market-data', 'pro-market', 754, 160),
    makeNode('rsi', 'pro-rsi', 1086, 110),
    makeNode('value', 'pro-value', 1086, 360),
    makeNode('compare', 'pro-compare', 1418, 220),
    makeNode('branch', 'pro-branch', 1750, 220),
    makeNode('order', 'pro-order', 2082, 220),
  ],
  links: [
    makeLink('pro-link-1', 'pro-event', 'flow', 'pro-universe', 'flow'),
    makeLink('pro-link-2', 'pro-universe', 'itemFlow', 'pro-branch', 'flow'),
    makeLink('pro-link-3', 'pro-universe', 'symbol', 'pro-market', 'symbol'),
    makeLink('pro-link-4', 'pro-market', 'close', 'pro-rsi', 'price'),
    makeLink('pro-link-5', 'pro-rsi', 'result', 'pro-compare', 'a'),
    makeLink('pro-link-6', 'pro-value', 'value', 'pro-compare', 'b'),
    makeLink('pro-link-7', 'pro-compare', 'condition', 'pro-branch', 'condition'),
    makeLink('pro-link-8', 'pro-branch', 'met', 'pro-order', 'flow'),
    makeLink('pro-link-9', 'pro-universe', 'symbol', 'pro-order', 'symbol'),
  ],
  groups: [],
};

const getBlueprint = (node: GraphNode) => BLUEPRINT_BY_ID[node.blueprintId];
const nodeWidth = (node: GraphNode) => getBlueprint(node).wide ? WIDE_NODE_WIDTH : NODE_WIDTH;

const linkPath = (from: CanvasPoint, to: CanvasPoint) => {
  const distance = Math.abs(to.x - from.x);
  const curve = Math.max(54, Math.min(190, distance * 0.52));
  return `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`;
};

const cloneGraph = (graph: GraphState): GraphState => ({
  nodes: graph.nodes.map((node) => ({ ...node, values: { ...node.values } })),
  links: graph.links.map((link) => ({ ...link, from: { ...link.from }, to: { ...link.to } })),
  groups: (graph.groups ?? []).map((group, index) => ({ ...group, color: group.color || GROUP_COLORS[index % GROUP_COLORS.length], collapsed: Boolean(group.collapsed), nodeIds: [...group.nodeIds] })),
});

const normalizeGraphLinks = (links: GraphLink[]): GraphLink[] => {
  const usedTargets = new Set<string>();
  const usedIds = new Set<string>();
  const normalized: GraphLink[] = [];
  for (let index = links.length - 1; index >= 0; index -= 1) {
    const link = links[index];
    const targetKey = `${link.to.nodeId}:${link.to.portId}`;
    if (usedTargets.has(targetKey)) continue;
    usedTargets.add(targetKey);
    let id = link.id;
    let suffix = 1;
    while (usedIds.has(id)) {
      id = `${link.id}-recovered-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    normalized.unshift({ ...link, id, from: { ...link.from }, to: { ...link.to } });
  }
  return normalized;
};

const loadGraph = (): GraphState => {
  if (typeof localStorage === 'undefined') return cloneGraph(INITIAL_GRAPH);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneGraph(INITIAL_GRAPH);
    const parsed = JSON.parse(raw) as GraphState;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) return cloneGraph(INITIAL_GRAPH);
    const nodes = parsed.nodes.filter((node) => BLUEPRINT_BY_ID[node.blueprintId]).map((node) => ({
      ...node,
      collapsed: Boolean(node.collapsed),
      values: node.values ?? {},
    }));
    const ids = new Set(nodes.map((node) => node.id));
    const links = normalizeGraphLinks(parsed.links.filter((link) => ids.has(link.from.nodeId) && ids.has(link.to.nodeId)));
    const groups = (parsed.groups ?? [])
      .map((group, index) => ({ ...group, color: group.color || GROUP_COLORS[index % GROUP_COLORS.length], collapsed: Boolean(group.collapsed), nodeIds: group.nodeIds.filter((id) => ids.has(id)) }))
      .filter((group) => group.nodeIds.length > 1);
    return nodes.length ? { nodes, links, groups } : cloneGraph(INITIAL_GRAPH);
  } catch {
    return cloneGraph(INITIAL_GRAPH);
  }
};

const validateGraph = (graph: GraphState): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const inputLinked = (nodeId: string, portId: string) => graph.links.some((link) => link.to.nodeId === nodeId && link.to.portId === portId);

  if (!graph.nodes.some((node) => node.blueprintId === 'event')) {
    issues.push({
      id: 'missing-event',
      severity: 'error',
      nodeId: null,
      title: '이벤트 시작 노드가 없습니다',
      detail: '실행 시점을 정할 수 없어 전략을 출시할 수 없습니다.',
      resolution: '이벤트·흐름에서 이벤트 시작 노드를 추가하세요.',
    });
  }

  graph.nodes.forEach((node) => {
    const blueprint = getBlueprint(node);
    blueprint.inputs.filter((port) => !port.optional && !inputLinked(node.id, port.id)).forEach((port) => {
      issues.push({
        id: `${node.id}-port-${port.id}`,
        severity: 'error',
        nodeId: node.id,
        portId: port.id,
        title: `${node.title}의 ${port.label} 입력이 비어 있습니다`,
        detail: '필수 입력이 없어 이 노드를 평가할 수 없습니다.',
        resolution: `같은 종류의 ${PORT_META[port.type].label} 출력을 연결하세요.`,
      });
    });
    blueprint.settings.filter((setting) => {
      if (!setting.required || setting.kind === 'fixed') return false;
      if (node.blueprintId === 'order' && (setting.id === 'reentryGap' || setting.id === 'maxEntries')) return false;
      return true;
    }).forEach((setting) => {
      const value = node.values[setting.id]?.trim();
      if (!value) {
        issues.push({
          id: `${node.id}-setting-${setting.id}`,
          severity: 'error',
          nodeId: node.id,
          settingId: setting.id,
          title: `${node.title}의 ${setting.label}을 설정하지 않았습니다`,
          detail: '사용자의 선택 없이 투자 전략 값을 대신 채울 수 없습니다.',
          resolution: `${setting.label} 값을 직접 선택하거나 입력하세요.`,
        });
        return;
      }
      if (setting.kind === 'number') {
        const number = Number(value);
        if (!Number.isFinite(number) || (setting.min !== undefined && number < setting.min) || (setting.max !== undefined && number > setting.max)) {
          issues.push({
            id: `${node.id}-range-${setting.id}`,
            severity: 'error',
            nodeId: node.id,
            settingId: setting.id,
            title: `${node.title}의 ${setting.label} 값이 허용 범위를 벗어났습니다`,
            detail: '범위를 벗어난 값은 재현 가능한 주문 계산에 사용할 수 없습니다.',
            resolution: `${setting.min ?? '허용 최솟값'}부터 ${setting.max ?? '허용 최댓값'} 사이로 입력하세요.`,
          });
        }
      }
    });

    if (node.blueprintId === 'branch' && node.values.execution === '조건을 만족하는 동안 계속') {
      issues.push({
        id: `${node.id}-repeat-warning`,
        severity: 'warning',
        nodeId: node.id,
        settingId: 'execution',
        title: '조건을 만족하는 동안 반복 실행합니다',
        detail: '같은 조건이 유지되면 주문 요청이 반복될 수 있습니다.',
        resolution: '주문 요청의 재주문 간격과 최대 진입 횟수를 함께 확인하세요.',
      });
    }
    if (node.blueprintId === 'order'
      && node.values.sameDirection === '추가 진입'
      && !node.values.reentryGap
      && !node.values.maxEntries) {
      issues.push({
        id: `${node.id}-unsafe-reentry`,
        severity: 'error',
        nodeId: node.id,
        settingId: 'sameDirection',
        title: '추가 진입에 안전 제한이 없습니다',
        detail: '조건이 유지되면 제한 없이 주문 요청이 생성될 수 있습니다.',
        resolution: '재주문 간격 또는 한 포지션 최대 진입 횟수를 설정하세요.',
      });
    }
  });

  if (!graph.nodes.some((node) => node.blueprintId === 'order')) {
    issues.push({
      id: 'missing-order',
      severity: 'error',
      nodeId: null,
      title: '주문 요청 노드가 없습니다',
      detail: '조건을 만족해도 생성할 주문 요청이 없습니다.',
      resolution: '주문 카테고리에서 주문 요청 노드를 추가하세요.',
    });
  }

  graph.links.forEach((link) => {
    const fromNode = graph.nodes.find((node) => node.id === link.from.nodeId);
    const toNode = graph.nodes.find((node) => node.id === link.to.nodeId);
    const fromPort = fromNode && getBlueprint(fromNode).outputs.find((port) => port.id === link.from.portId);
    const toPort = toNode && getBlueprint(toNode).inputs.find((port) => port.id === link.to.portId);
    if (!fromNode || !toNode || !fromPort || !toPort || !portsCompatible(fromPort.type, toPort.type)) {
      issues.push({
        id: `unsupported-link-${link.id}`,
        severity: 'error',
        nodeId: toNode?.id ?? null,
        portId: toPort?.id,
        title: '지원하지 않는 포트 연결이 있습니다',
        detail: '저장된 연결의 종류가 현재 노드 정의와 맞지 않습니다.',
        resolution: '문제 연결을 삭제하고 같은 종류의 포트끼리 다시 연결하세요.',
      });
    }
  });

  return issues;
};

const describeStrategy = (graph: GraphState): Array<{ label: string; value: string }> => {
  const find = (blueprintId: string) => graph.nodes.find((node) => node.blueprintId === blueprintId);
  const event = find('event');
  const universe = find('universe');
  const order = find('order');
  const indicators = graph.nodes.filter((node) => getBlueprint(node).category === '기술 지표').map((node) => node.title);
  const warnings = validateGraph(graph).filter((issue) => issue.severity === 'warning').length;
  return [
    { label: '이벤트', value: event?.values.eventType || '설정 필요' },
    { label: '대상 종목', value: universe?.values.symbols || '설정 필요' },
    { label: '사용한 봉 주기', value: event?.values.timeframe || '설정 필요' },
    { label: '진입·청산 조건', value: indicators.length ? `${indicators.join(', ')} 기반 조건` : '조건 노드 연결 필요' },
    { label: '주문 규모', value: order?.values.sizeMode || '설정 필요' },
    { label: '주문 우선순위', value: order?.values.priority || '설정 필요' },
    { label: '재진입 방식', value: order?.values.sameDirection || '설정 필요' },
    { label: '주의사항', value: warnings ? `경고 ${warnings}개를 확인하세요` : '현재 표시할 경고가 없습니다' },
  ];
};

export function ProEditor({ goBack, openEditor, onLaunchBot }: ProEditorProps) {
  const [graph, setGraph] = useState<GraphState>(loadGraph);
  const [history, setHistory] = useState<GraphState[]>([]);
  const [future, setFuture] = useState<GraphState[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(['pro-compare']);
  const [pan, setPan] = useState<CanvasPoint>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 0, height: 0 });
  const [gridSnap, setGridSnap] = useState(false);
  const [panGesture, setPanGesture] = useState<CardMoveGesture | null>(null);
  const [nodeMove, setNodeMove] = useState<NodeMoveGesture | null>(null);
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [picker, setPicker] = useState<NodePickerState | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryView, setLibraryView] = useState<LibraryView>('nodes');
  const [showAdvancedNodes, setShowAdvancedNodes] = useState(false);
  const [favoriteNodeIds, setFavoriteNodeIds] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITE_NODES_STORAGE_KEY) ?? '[]');
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string' && Boolean(BLUEPRINT_BY_ID[id])) : [];
    } catch {
      return [];
    }
  });
  const [openSettingSelect, setOpenSettingSelect] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('settings');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [panelReopenTop, setPanelReopenTop] = useState({ left: 77, right: 77 });
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [expandedPortNodeIds, setExpandedPortNodeIds] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(EXPANDED_PORTS_STORAGE_KEY) ?? '[]');
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const [selectionGesture, setSelectionGesture] = useState<SelectionGesture | null>(null);
  const [boxSelectMode, setBoxSelectMode] = useState(false);
  const [highlightedIssueId, setHighlightedIssueId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('dirty');
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>(() => validateGraph(loadGraph()));
  const [validationState, setValidationState] = useState<ValidationState>('incomplete');
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [dragBlueprintId, setDragBlueprintId] = useState<string | null>(null);
  const [dragTemplateId, setDragTemplateId] = useState<string | null>(null);
  const [packagePreview, setPackagePreview] = useState<CanvasPoint | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [trashReady, setTrashReady] = useState(false);
  const [spacePanning, setSpacePanning] = useState(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const leftCollapseButtonRef = useRef<HTMLButtonElement | null>(null);
  const rightCollapseButtonRef = useRef<HTMLButtonElement | null>(null);
  const trashZoneRef = useRef<HTMLDivElement | null>(null);
  const moveOriginRef = useRef<GraphState | null>(null);
  const movingNodeIdsRef = useRef<string[]>([]);
  const moveChangedRef = useRef(false);
  const pointerRef = useRef<CanvasPoint | null>(null);
  const linkReconnectGestureRef = useRef<LinkReconnectGesture | null>(null);
  const suppressLinkClickRef = useRef<string | null>(null);
  const sequenceRef = useRef(100);
  const spacePanningRef = useRef(false);

  const collapsePanel = (side: 'left' | 'right', button: HTMLButtonElement | null) => {
    const layoutBounds = layoutRef.current?.getBoundingClientRect();
    const buttonBounds = button?.getBoundingClientRect();
    if (layoutBounds && buttonBounds && buttonBounds.height > 0) {
      setPanelReopenTop((current) => ({
        ...current,
        [side]: buttonBounds.top - layoutBounds.top,
      }));
    }
    if (side === 'left') setLeftCollapsed(true);
    else setRightCollapsed(true);
  };

  const nodeById = useMemo(
    () => Object.fromEntries(graph.nodes.map((node) => [node.id, node])) as Record<string, GraphNode>,
    [graph.nodes],
  );
  const selectedNode = selectedNodeIds.length === 1 ? nodeById[selectedNodeIds[0]] ?? null : null;
  const selectedBlueprint = selectedNode ? getBlueprint(selectedNode) : null;
  const inputLinked = (nodeId: string, portId: string) => graph.links.some((link) => link.to.nodeId === nodeId && link.to.portId === portId);
  const outputLinked = (nodeId: string, portId: string) => graph.links.some((link) => link.from.nodeId === nodeId && link.from.portId === portId);
  const portGroupValueKey = (direction: 'input' | 'output', groupId: string) => `port-group:${direction}:${groupId}`;
  const portGroupMembers = (node: GraphNode, direction: 'input' | 'output', groupId: string) => (
    (direction === 'input' ? getBlueprint(node).inputs : getBlueprint(node).outputs)
      .filter((port) => port.groupId === groupId)
  );
  const activeGroupedPort = (node: GraphNode, direction: 'input' | 'output', representative: PortDefinition) => {
    if (!representative.groupId) return representative;
    const members = portGroupMembers(node, direction, representative.groupId);
    const linked = members.find((port) => direction === 'input'
      ? inputLinked(node.id, port.id)
      : outputLinked(node.id, port.id));
    const savedId = node.values[portGroupValueKey(direction, representative.groupId)];
    const active = linked ?? members.find((port) => port.id === savedId) ?? members.find((port) => port.id === 'close') ?? members[0] ?? representative;
    return {
      ...active,
      groupId: representative.groupId,
      groupLabel: representative.groupLabel,
      label: active.label,
    };
  };
  const isAdvancedPort = (ports: PortDefinition[], port: PortDefinition) => port.optional || ports.indexOf(port) >= 2;
  const visiblePorts = (node: GraphNode, direction: 'input' | 'output') => {
    const ports = direction === 'input' ? getBlueprint(node).inputs : getBlueprint(node).outputs;
    const expanded = expandedPortNodeIds.includes(node.id);
    const visible = ports.filter((port) => !isAdvancedPort(ports, port)
      || expanded
      || (direction === 'input' ? inputLinked(node.id, port.id) : outputLinked(node.id, port.id)));
    const seenGroups = new Set<string>();
    return visible.flatMap((port) => {
      if (!port.groupId) return [port];
      if (seenGroups.has(port.groupId)) return [];
      seenGroups.add(port.groupId);
      return [activeGroupedPort(node, direction, port)];
    });
  };
  const advancedPortCount = (node: GraphNode) => {
    const blueprint = getBlueprint(node);
    return [
      ...blueprint.inputs.filter((port) => !port.groupId && isAdvancedPort(blueprint.inputs, port)),
      ...blueprint.outputs.filter((port) => !port.groupId && isAdvancedPort(blueprint.outputs, port)),
    ].length;
  };
  const displayNodeRowCount = (node: GraphNode) => {
    const directSettings = getBlueprint(node).settings.filter((setting) => setting.direct);
    return Math.max(visiblePorts(node, 'input').length, visiblePorts(node, 'output').length, directSettings.length, 1);
  };
  const displayNodeHeight = (node: GraphNode) => {
    const rowCount = displayNodeRowCount(node);
    return NODE_HEADER_HEIGHT
      + NODE_BODY_PADDING
      + rowCount * NODE_ROW_HEIGHT
      + Math.max(0, rowCount - 1) * NODE_ROW_GAP
      + NODE_FOOTER_HEIGHT;
  };
  const displayPortPoint = (node: GraphNode, direction: 'input' | 'output', portId: string): CanvasPoint => {
    const ports = visiblePorts(node, direction);
    const index = Math.max(0, ports.findIndex((port) => port.id === portId));
    return {
      x: node.x + (direction === 'output' ? nodeWidth(node) : 0),
      y: node.y + NODE_HEADER_HEIGHT + NODE_BODY_PADDING / 2 + index * (NODE_ROW_HEIGHT + NODE_ROW_GAP) + NODE_ROW_HEIGHT / 2,
    };
  };
  const issuesByNode = useMemo(() => {
    const map = new Map<string, ValidationIssue[]>();
    validationIssues.forEach((issue) => {
      if (!issue.nodeId) return;
      map.set(issue.nodeId, [...(map.get(issue.nodeId) ?? []), issue]);
    });
    return map;
  }, [validationIssues]);
  const highlightedIssue = validationIssues.find((issue) => issue.id === highlightedIssueId) ?? null;
  const highlightedFlowNodeIds = useMemo(() => {
    if (!highlightedIssue?.nodeId) return new Set<string>();
    const connected = new Set<string>([highlightedIssue.nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      graph.links.forEach((link) => {
        if (connected.has(link.from.nodeId) && !connected.has(link.to.nodeId)) {
          connected.add(link.to.nodeId);
          changed = true;
        }
        if (connected.has(link.to.nodeId) && !connected.has(link.from.nodeId)) {
          connected.add(link.from.nodeId);
          changed = true;
        }
      });
    }
    return connected;
  }, [graph.links, highlightedIssue]);
  const highlightedFlowLinkIds = useMemo(() => new Set(
    graph.links
      .filter((link) => highlightedFlowNodeIds.has(link.from.nodeId) && highlightedFlowNodeIds.has(link.to.nodeId))
      .map((link) => link.id),
  ), [graph.links, highlightedFlowNodeIds]);

  useEffect(() => {
    setValidationIssues(validateGraph(graph));
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
        setSaveState('saved');
      } catch {
        setSaveState('failed');
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [graph]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_PORTS_STORAGE_KEY, JSON.stringify(expandedPortNodeIds));
    } catch {
      // Editor preferences are optional; graph editing must remain available.
    }
  }, [expandedPortNodeIds]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITE_NODES_STORAGE_KEY, JSON.stringify(favoriteNodeIds));
    } catch {
      // Favorites are a convenience preference and must not block editing.
    }
  }, [favoriteNodeIds]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;
    const updateSize = () => {
      const bounds = element.getBoundingClientRect();
      setWorkspaceSize({ width: bounds.width, height: bounds.height });
    };
    updateSize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize);
    observer?.observe(element);
    window.addEventListener('resize', updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const recordChange = (updater: (current: GraphState) => GraphState, message?: string) => {
    setGraph((current) => {
      const snapshot = cloneGraph(current);
      const next = updater(cloneGraph(current));
      setHistory((items) => [...items.slice(-49), snapshot]);
      setFuture([]);
      setSaveState('dirty');
      setValidationState('incomplete');
      setHighlightedIssueId(null);
      if (message) setAnnouncement(message);
      return { ...next, links: normalizeGraphLinks(next.links) };
    });
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [cloneGraph(graph), ...items].slice(0, 50));
    setGraph(cloneGraph(previous));
    setSelectedNodeIds([]);
    setSaveState('dirty');
    setValidationState('incomplete');
    setAnnouncement('마지막 변경을 실행 취소했습니다.');
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((items) => items.slice(1));
    setHistory((items) => [...items.slice(-49), cloneGraph(graph)]);
    setGraph(cloneGraph(next));
    setSelectedNodeIds([]);
    setSaveState('dirty');
    setValidationState('incomplete');
    setAnnouncement('변경을 다시 실행했습니다.');
  };

  const duplicateSelected = () => {
    if (!selectedNodeIds.length) return;
    const idMap = new Map<string, string>();
    selectedNodeIds.forEach((id) => idMap.set(id, nextId('pro-copy')));
    const copies = graph.nodes.filter((node) => idMap.has(node.id)).map((node) => ({
      ...node,
      id: idMap.get(node.id)!,
      title: `${node.title} 복사본`,
      x: node.x + 32,
      y: node.y + 32,
      values: { ...node.values },
    }));
    const copiedLinks = graph.links.filter((link) => idMap.has(link.from.nodeId) && idMap.has(link.to.nodeId)).map((link) => ({
      ...link,
      id: nextId('pro-link'),
      from: { ...link.from, nodeId: idMap.get(link.from.nodeId)! },
      to: { ...link.to, nodeId: idMap.get(link.to.nodeId)! },
    }));
    recordChange((current) => ({
      nodes: [...current.nodes, ...copies],
      links: [...current.links, ...copiedLinks],
      groups: current.groups,
    }), `${copies.length}개 노드를 복제했습니다.`);
    setSelectedNodeIds(copies.map((node) => node.id));
  };

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => Boolean((target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]'));
    const keyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTypingTarget(event.target)) {
        event.preventDefault();
        spacePanningRef.current = true;
        setSpacePanning(true);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !isTypingTarget(event.target) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !isTypingTarget(event.target) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !isTypingTarget(event.target) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelectedLinkId(null);
        setSelectedNodeIds(graph.nodes.map((node) => node.id));
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !isTypingTarget(event.target) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setBoxSelectMode(true);
        setSelectedLinkId(null);
        return;
      }
      if (event.key === 'Escape' && !isTypingTarget(event.target)) {
        setSelectedNodeIds([]);
        setSelectedLinkId(null);
        setBoxSelectMode(false);
        setPicker(null);
        setLinkDraft(null);
        setHighlightedIssueId(null);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isTypingTarget(event.target) && selectedLinkId) {
        event.preventDefault();
        deleteLink(selectedLinkId);
        setSelectedLinkId(null);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isTypingTarget(event.target) && selectedNodeIds.length) {
        event.preventDefault();
        if (selectedNodeIds.length === 1) requestDeleteNode(selectedNodeIds[0]);
        else deleteSelectedNodes();
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spacePanningRef.current = false;
        setSpacePanning(false);
      }
    };
    const blur = () => {
      spacePanningRef.current = false;
      setSpacePanning(false);
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    };
  });

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

  const addNode = (blueprintId: string, point?: CanvasPoint) => {
    const blueprint = BLUEPRINT_BY_ID[blueprintId];
    if (!blueprint) return;
    const bounds = workspaceRef.current?.getBoundingClientRect();
    const center = point ?? (bounds
      ? worldPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      : { x: 420, y: 260 });
    const node = makeNode(blueprintId, nextId(`pro-${blueprintId}`), Math.round(center.x - (blueprint.wide ? WIDE_NODE_WIDTH : NODE_WIDTH) / 2), Math.round(center.y - 70));
    recordChange((current) => ({ ...current, nodes: [...current.nodes, node] }), `${node.title} 노드를 추가했습니다.`);
    setSelectedNodeIds([node.id]);
    setInspectorTab('settings');
    setRightCollapsed(false);
  };

  const requestDeleteNode = (nodeId: string) => {
    const connected = graph.links.filter((link) => link.from.nodeId === nodeId || link.to.nodeId === nodeId);
    if (connected.length > 1) {
      setPendingDeleteId(nodeId);
      return;
    }
    deleteNode(nodeId);
  };

  const deleteNode = (nodeId: string) => {
    const node = nodeById[nodeId];
    if (!node) return;
    recordChange((current) => ({
      nodes: current.nodes.filter((item) => item.id !== nodeId),
      links: current.links.filter((link) => link.from.nodeId !== nodeId && link.to.nodeId !== nodeId),
      groups: current.groups
        .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => id !== nodeId) }))
        .filter((group) => group.nodeIds.length > 1),
    }), `${node.title} 노드를 삭제했습니다.`);
    setSelectedNodeIds((ids) => ids.filter((id) => id !== nodeId));
    setPendingDeleteId(null);
  };

  const createGroup = () => {
    if (selectedNodeIds.length < 2) {
      setNotice({ tone: 'info', title: '노드를 두 개 이상 선택하세요', detail: 'Shift를 누른 채 노드를 선택한 뒤 그룹을 만들 수 있습니다.' });
      return;
    }
    const group: GraphGroup = {
      id: nextId('pro-group'),
      title: `노드 그룹 ${graph.groups.length + 1}`,
      nodeIds: [...selectedNodeIds],
      collapsed: false,
      color: GROUP_COLORS[graph.groups.length % GROUP_COLORS.length],
    };
    recordChange((current) => ({
      ...current,
      groups: [
        ...current.groups
          .map((item) => ({ ...item, nodeIds: item.nodeIds.filter((id) => !selectedNodeIds.includes(id)) }))
          .filter((item) => item.nodeIds.length > 1),
        group,
      ],
    }), `${selectedNodeIds.length}개 노드를 그룹으로 묶었습니다.`);
  };

  const deleteGroup = (groupId: string) => {
    recordChange((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== groupId),
    }), '노드 그룹을 해제했습니다.');
  };

  const deleteGroupWithNodes = (groupId: string) => {
    const group = graph.groups.find((item) => item.id === groupId);
    if (!group) return;
    const ids = new Set(group.nodeIds);
    recordChange((current) => ({
      nodes: current.nodes.filter((node) => !ids.has(node.id)),
      links: current.links.filter((link) => !ids.has(link.from.nodeId) && !ids.has(link.to.nodeId)),
      groups: current.groups
        .filter((item) => item.id !== groupId)
        .map((item) => ({ ...item, nodeIds: item.nodeIds.filter((id) => !ids.has(id)) }))
        .filter((item) => item.nodeIds.length > 1),
    }), `${group.title} 그룹과 내부 노드를 삭제했습니다.`);
    setSelectedNodeIds((selected) => selected.filter((id) => !ids.has(id)));
  };

  const deleteNodes = (nodeIds: string[], message?: string) => {
    if (!nodeIds.length) return;
    const ids = new Set(nodeIds);
    recordChange((current) => ({
      nodes: current.nodes.filter((node) => !ids.has(node.id)),
      links: current.links.filter((link) => !ids.has(link.from.nodeId) && !ids.has(link.to.nodeId)),
      groups: current.groups
        .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => !ids.has(id)) }))
        .filter((group) => group.nodeIds.length > 1),
    }), message ?? `${nodeIds.length}개 노드를 삭제했습니다.`);
    setSelectedNodeIds((selected) => selected.filter((id) => !ids.has(id)));
  };

  const deleteSelectedNodes = () => deleteNodes(selectedNodeIds);

  const beginGroupRename = (group: GraphGroup) => {
    setEditingGroupId(group.id);
    setGroupNameDraft(group.title);
  };

  const commitGroupRename = (groupId: string) => {
    const title = groupNameDraft.trim();
    const group = graph.groups.find((item) => item.id === groupId);
    setEditingGroupId(null);
    if (!group || !title || title === group.title) return;
    recordChange((current) => ({
      ...current,
      groups: current.groups.map((item) => item.id === groupId ? { ...item, title } : item),
    }), `그룹 이름을 ${title}(으)로 바꿨습니다.`);
  };

  const toggleGroup = (groupId: string) => {
    const group = graph.groups.find((item) => item.id === groupId);
    if (!group) return;
    recordChange((current) => ({
      ...current,
      groups: current.groups.map((item) => item.id === groupId ? { ...item, collapsed: !item.collapsed } : item),
    }), `${group.title} 그룹을 ${group.collapsed ? '펼쳤습니다' : '접었습니다'}.`);
    if (!group.collapsed) {
      setSelectedNodeIds((ids) => ids.filter((id) => !group.nodeIds.includes(id)));
    }
  };

  const organizeNodes = () => {
    if (selectedNodeIds.length < 2) return;
    recordChange((current) => {
      const scopeIds = new Set(selectedNodeIds);
      const selected = current.nodes.filter((node) => scopeIds.has(node.id));
      if (selected.length < 2) return current;
      const layers = new Map(selected.map((node) => [node.id, 0]));
      for (let pass = 0; pass < selected.length; pass += 1) {
        current.links.forEach((link) => {
          if (!scopeIds.has(link.from.nodeId) || !scopeIds.has(link.to.nodeId)) return;
          layers.set(link.to.nodeId, Math.max(layers.get(link.to.nodeId) ?? 0, (layers.get(link.from.nodeId) ?? 0) + 1));
        });
      }
      const baseX = Math.min(...selected.map((node) => node.x));
      const baseY = Math.max(72, Math.min(...selected.map((node) => node.y)));
      const positions = new Map<string, CanvasPoint>();
      const byLayer = new Map<number, GraphNode[]>();
      selected.forEach((node) => {
        const layer = layers.get(node.id) ?? 0;
        byLayer.set(layer, [...(byLayer.get(layer) ?? []), node]);
      });
      Array.from(byLayer.entries()).sort(([a], [b]) => a - b).forEach(([layer, nodes]) => {
        let y = baseY;
        [...nodes].sort((a, b) => {
          const categoryOrder = CATEGORY_ORDER.indexOf(getBlueprint(a).category) - CATEGORY_ORDER.indexOf(getBlueprint(b).category);
          return categoryOrder || a.y - b.y;
        }).forEach((node) => {
          positions.set(node.id, { x: baseX + layer * 332, y });
          y += displayNodeHeight(node) + 44;
        });
      });
      return {
        ...current,
        nodes: current.nodes.map((node) => {
          const position = positions.get(node.id);
          return position ? { ...node, ...position } : node;
        }),
      };
    }, '선택한 노드를 흐름에 맞게 정리했습니다.');
  };

  const cycleGroupColor = (groupId: string) => {
    recordChange((current) => ({
      ...current,
      groups: current.groups.map((group) => {
        if (group.id !== groupId) return group;
        const index = GROUP_COLORS.indexOf(group.color);
        return { ...group, color: GROUP_COLORS[(index + 1 + GROUP_COLORS.length) % GROUP_COLORS.length] };
      }),
    }), '그룹 색상을 변경했습니다.');
  };

  const startGroupMove = (event: ReactPointerEvent<HTMLElement>, group: GraphGroup) => {
    if (event.button !== 0) return;
    const anchor = graph.nodes.find((node) => group.nodeIds.includes(node.id));
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedNodeIds(group.nodeIds);
    collapsePanel('right', rightCollapseButtonRef.current);
    movingNodeIdsRef.current = group.nodeIds;
    moveOriginRef.current = cloneGraph(graph);
    moveChangedRef.current = false;
    setPanGesture(null);
    setNodeMove({
      nodeId: anchor.id,
      groupId: group.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: anchor.x,
      originY: anchor.y,
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const reachesNode = (startNodeId: string, targetNodeId: string, ignoredLinkId?: string) => {
    const visited = new Set<string>();
    const walk = (nodeId: string): boolean => {
      if (nodeId === targetNodeId) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      return graph.links
        .filter((link) => link.id !== ignoredLinkId && link.from.nodeId === nodeId)
        .some((link) => walk(link.to.nodeId));
    };
    return walk(startNodeId);
  };

  const rejectConnection = (title: string, detail: string) => {
    setNotice({ tone: 'error', title, detail });
    setAnnouncement(`${title}. ${detail}`);
  };

  const connect = (source: LinkEnd, target: LinkEnd, reconnectingLinkId?: string) => {
    const fromNode = nodeById[source.nodeId];
    const toNode = nodeById[target.nodeId];
    if (!fromNode || !toNode) return false;
    const fromPort = getBlueprint(fromNode).outputs.find((port) => port.id === source.portId);
    const toPort = getBlueprint(toNode).inputs.find((port) => port.id === target.portId);
    if (!fromPort || !toPort) return false;
    if (source.nodeId === target.nodeId) {
      rejectConnection('같은 노드 안에서는 연결할 수 없습니다', '다른 노드의 호환 입력으로 연결하세요.');
      return false;
    }
    if (!portsCompatible(fromPort.type, toPort.type)) {
      rejectConnection('서로 다른 종류의 포트입니다', `${PORT_META[fromPort.type].label} 출력은 ${PORT_META[toPort.type].label} 입력에 연결할 수 없습니다.`);
      return false;
    }
    if (reachesNode(target.nodeId, source.nodeId, reconnectingLinkId)) {
      rejectConnection('순환 연결은 만들 수 없습니다', 'Pro 전략은 왼쪽에서 오른쪽으로 실행되는 비순환 그래프입니다.');
      return false;
    }
    const link: GraphLink = {
      id: reconnectingLinkId ?? nextId('pro-link'),
      from: source,
      to: target,
      type: fromPort.type,
    };
    const replacing = graph.links.some((item) => (
      item.id !== reconnectingLinkId
      && item.to.nodeId === target.nodeId
      && item.to.portId === target.portId
    ));
    recordChange((current) => ({
      ...current,
      links: [
        ...current.links.filter((item) => (
          item.id !== reconnectingLinkId
          && (item.to.nodeId !== target.nodeId || item.to.portId !== target.portId)
        )),
        link,
      ],
    }), reconnectingLinkId
      ? `${toNode.title}의 ${toPort.label} 입력으로 연결을 옮겼습니다.`
      : replacing
        ? `${toNode.title}의 ${toPort.label} 연결을 교체했습니다.`
        : `${fromNode.title}과 ${toNode.title}을 연결했습니다.`);
    setNotice(null);
    return true;
  };

  const deleteLink = (linkId: string) => {
    recordChange((current) => ({ ...current, links: current.links.filter((link) => link.id !== linkId) }), '연결을 삭제했습니다.');
    setSelectedLinkId((selected) => selected === linkId ? null : selected);
  };

  const updateSetting = (nodeId: string, settingId: string, value: string) => {
    recordChange((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === nodeId
        ? { ...node, values: { ...node.values, [settingId]: value } }
        : node),
    }));
  };

  const switchPortVariant = (
    node: GraphNode,
    direction: 'input' | 'output',
    groupId: string,
    portId: string,
  ) => {
    const members = new Set(portGroupMembers(node, direction, groupId).map((port) => port.id));
    recordChange((current) => ({
      ...current,
      nodes: current.nodes.map((item) => item.id === node.id
        ? {
          ...item,
          values: {
            ...item.values,
            [portGroupValueKey(direction, groupId)]: portId,
          },
        }
        : item),
      links: current.links.map((link) => direction === 'output'
        ? (link.from.nodeId === node.id && members.has(link.from.portId)
          ? { ...link, from: { ...link.from, portId } }
          : link)
        : (link.to.nodeId === node.id && members.has(link.to.portId)
          ? { ...link, to: { ...link.to, portId } }
          : link)),
    }), `${node.title}의 출력 항목을 바꿨습니다.`);
  };

  const renameNode = (nodeId: string, title: string) => {
    recordChange((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, title } : node),
    }));
  };

  const startMove = (event: ReactPointerEvent<HTMLElement>, node: GraphNode, force = false) => {
    if (event.button !== 0) return;
    if (!(event.target as Element).closest('select, .pro-select-options')) setOpenSettingSelect(null);
    const multiple = event.shiftKey;
    const nextSelection = multiple
      ? (selectedNodeIds.includes(node.id) ? selectedNodeIds : [...selectedNodeIds, node.id])
      : (selectedNodeIds.includes(node.id) && selectedNodeIds.length > 1 ? selectedNodeIds : [node.id]);
    setSelectedNodeIds(nextSelection);
    setSelectedLinkId(null);
    setRightCollapsed(false);
    if (!force && (event.target as Element).closest('button, input, select, .pro-port')) return;
    event.preventDefault();
    event.stopPropagation();
    const movingIds = nextSelection;
    movingNodeIdsRef.current = movingIds;
    moveOriginRef.current = cloneGraph(graph);
    moveChangedRef.current = false;
    setPanGesture(null);
    setNodeMove({ nodeId: node.id, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const isPointerOverTrash = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = trashZoneRef.current?.getBoundingClientRect();
    if (!bounds) return false;
    return event.clientX >= bounds.left
      && event.clientX <= bounds.right
      && event.clientY >= bounds.top
      && event.clientY <= bounds.bottom;
  };

  const beginLink = (
    event: ReactPointerEvent<HTMLButtonElement>,
    node: GraphNode,
    port: PortDefinition,
    direction: 'output' | 'input',
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const incomingLink = direction === 'input'
      ? graph.links.find((link) => link.to.nodeId === node.id && link.to.portId === port.id)
      : undefined;
    const sourceNode = incomingLink ? nodeById[incomingLink.from.nodeId] : undefined;
    const sourcePort = sourceNode && incomingLink
      ? getBlueprint(sourceNode).outputs.find((item) => item.id === incomingLink.from.portId)
      : undefined;
    const origin = incomingLink && sourceNode
      ? displayPortPoint(sourceNode, 'output', incomingLink.from.portId)
      : displayPortPoint(node, direction, port.id);
    setLinkDraft({
      anchor: incomingLink?.from ?? { nodeId: node.id, portId: port.id },
      direction: incomingLink ? 'output' : direction,
      type: sourcePort?.type ?? port.type,
      origin,
      point: incomingLink ? displayPortPoint(node, 'input', port.id) : origin,
      reconnectingLinkId: incomingLink?.id,
    });
    setSelectedLinkId(null);
    setSelectedNodeIds([node.id]);
    setPicker(null);
  };

  const beginLinkReconnect = (event: ReactPointerEvent<SVGPathElement>, link: GraphLink) => {
    if (event.button !== 0) return;
    const sourceNode = nodeById[link.from.nodeId];
    const targetNode = nodeById[link.to.nodeId];
    if (!sourceNode || !targetNode) return;
    const sourcePort = getBlueprint(sourceNode).outputs.find((port) => port.id === link.from.portId);
    if (!sourcePort) return;
    event.preventDefault();
    event.stopPropagation();
    linkReconnectGestureRef.current = {
      linkId: link.id,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    setLinkDraft({
      anchor: link.from,
      direction: 'output',
      type: sourcePort.type,
      origin: displayPortPoint(sourceNode, 'output', link.from.portId),
      point: displayPortPoint(targetNode, 'input', link.to.portId),
      reconnectingLinkId: link.id,
    });
    setPicker(null);
  };

  const finishLinkReconnectGesture = () => {
    const gesture = linkReconnectGestureRef.current;
    if (gesture?.moved) {
      suppressLinkClickRef.current = gesture.linkId;
      window.setTimeout(() => {
        if (suppressLinkClickRef.current === gesture.linkId) suppressLinkClickRef.current = null;
      }, 0);
    }
    linkReconnectGestureRef.current = null;
  };

  const openPickerForPort = (node: GraphNode, port: PortDefinition, direction: 'output' | 'input') => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const point = displayPortPoint(node, direction, port.id);
    setPicker({
      clientX: bounds.left + pan.x + point.x * zoom,
      clientY: bounds.top + pan.y + point.y * zoom,
      anchor: { nodeId: node.id, portId: port.id },
      direction,
      type: port.type,
    });
    setPickerQuery('');
  };

  const releaseInput = (event: ReactPointerEvent<HTMLButtonElement>, node: GraphNode, port: PortDefinition) => {
    if (!linkDraft || linkDraft.direction !== 'output') return;
    event.stopPropagation();
    connect(linkDraft.anchor, { nodeId: node.id, portId: port.id }, linkDraft.reconnectingLinkId);
    finishLinkReconnectGesture();
    setLinkDraft(null);
  };

  const releaseOutput = (event: ReactPointerEvent<HTMLButtonElement>, node: GraphNode, port: PortDefinition) => {
    if (!linkDraft || linkDraft.direction !== 'input') return;
    event.stopPropagation();
    connect({ nodeId: node.id, portId: port.id }, linkDraft.anchor);
    setLinkDraft(null);
  };

  const startCanvasPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || nodeMove || linkDraft) return;
    const target = event.target as Element;
    if (target.closest('.pro-graph-node, .pro-port, .pro-graph-link-hit, .pro-compatible-picker')) return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    setOpenSettingSelect(null);
    if (event.shiftKey || boxSelectMode) {
      setSelectionGesture({ startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY });
      setSelectedLinkId(null);
      setPanGesture(null);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }
    setSelectedNodeIds([]);
    setSelectedLinkId(null);
    collapsePanel('right', rightCollapseButtonRef.current);
    setPicker(null);
    setPanGesture({ startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveCanvasPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const canvas = event.currentTarget.closest<HTMLElement>('.pro-canvas');
    canvas?.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`);
    canvas?.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`);
    canvas?.style.setProperty('--spotlight-opacity', '1');
    const previous = pointerRef.current;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    const linkGesture = linkReconnectGestureRef.current;
    if (linkGesture && !linkGesture.moved && Math.hypot(
      event.clientX - linkGesture.startX,
      event.clientY - linkGesture.startY,
    ) >= 4) {
      linkReconnectGestureRef.current = { ...linkGesture, moved: true };
    }
    if (selectionGesture) {
      setSelectionGesture((current) => current ? { ...current, currentX: event.clientX, currentY: event.clientY } : null);
      return;
    }
    if (nodeMove) {
      setTrashReady(isPointerOverTrash(event));
      const dx = (event.clientX - nodeMove.startX) / zoom;
      const dy = (event.clientY - nodeMove.startY) / zoom;
      const origin = moveOriginRef.current;
      moveChangedRef.current = moveChangedRef.current || Math.abs(dx) >= 1 || Math.abs(dy) >= 1;
      setGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) => {
          if (!movingNodeIdsRef.current.includes(node.id)) return node;
          const start = origin?.nodes.find((item) => item.id === node.id) ?? node;
          const nextX = start.x + dx;
          const nextY = Math.max(24, start.y + dy);
          return {
            ...node,
            x: gridSnap ? Math.round(nextX / GRID_SIZE) * GRID_SIZE : Math.round(nextX),
            y: gridSnap ? Math.max(24, Math.round(nextY / GRID_SIZE) * GRID_SIZE) : Math.round(nextY),
          };
        }),
      }));
      return;
    }
    if (linkDraft) {
      setLinkDraft((current) => current ? { ...current, point: worldPoint(event.clientX, event.clientY) } : null);
      return;
    }
    if (panGesture) {
      setPan({
        x: panGesture.originX + event.clientX - panGesture.startX,
        y: panGesture.originY + event.clientY - panGesture.startY,
      });
      return;
    }
    if (spacePanningRef.current && previous) {
      setPan((current) => ({
        x: current.x + event.clientX - previous.x,
        y: current.y + event.clientY - previous.y,
      }));
    }
  };

  const finishCanvasPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (selectionGesture) {
      const start = worldPoint(selectionGesture.startX, selectionGesture.startY);
      const end = worldPoint(event.clientX, event.clientY);
      const left = Math.min(start.x, end.x);
      const right = Math.max(start.x, end.x);
      const top = Math.min(start.y, end.y);
      const bottom = Math.max(start.y, end.y);
      setSelectedNodeIds(graph.nodes.filter((node) => (
        node.x < right
        && node.x + nodeWidth(node) > left
        && node.y < bottom
        && node.y + displayNodeHeight(node) > top
      )).map((node) => node.id));
      setSelectionGesture(null);
      setBoxSelectMode(false);
      setPanGesture(null);
      return;
    }
    const movedNodeIdsToDelete = nodeMove && !nodeMove.groupId && event.type !== 'pointercancel' && isPointerOverTrash(event)
      ? [...movingNodeIdsRef.current]
      : [];
    const nodeIdToDelete = movedNodeIdsToDelete.length === 1 ? movedNodeIdsToDelete[0] : null;
    const groupIdToDelete = nodeMove?.groupId && event.type !== 'pointercancel' && isPointerOverTrash(event)
      ? nodeMove.groupId
      : null;
    if (!movedNodeIdsToDelete.length && !groupIdToDelete && nodeMove && moveOriginRef.current && moveChangedRef.current) {
      const origin = moveOriginRef.current;
      setHistory((items) => [...items.slice(-49), origin]);
      setFuture([]);
      setSaveState('dirty');
      setValidationState('incomplete');
    }
    if (linkDraft && event.type !== 'pointercancel') {
      if (linkDraft.reconnectingLinkId) {
        const disconnectedLinkId = linkDraft.reconnectingLinkId;
        recordChange((current) => ({
          ...current,
          links: current.links.filter((link) => link.id !== disconnectedLinkId),
        }), '연결을 해제했습니다.');
        setSelectedLinkId(null);
      } else {
        setPicker({
          clientX: event.clientX,
          clientY: event.clientY,
          anchor: linkDraft.anchor,
          direction: linkDraft.direction,
          type: linkDraft.type,
          reconnectingLinkId: linkDraft.reconnectingLinkId,
        });
        setPickerQuery('');
      }
    }
    setNodeMove(null);
    setTrashReady(false);
    moveOriginRef.current = null;
    movingNodeIdsRef.current = [];
    moveChangedRef.current = false;
    setLinkDraft(null);
    setPanGesture(null);
    finishLinkReconnectGesture();
    if (movedNodeIdsToDelete.length > 1) {
      deleteNodes(movedNodeIdsToDelete, `${movedNodeIdsToDelete.length}개 선택 노드를 삭제했습니다.`);
    }
    if (nodeIdToDelete) requestDeleteNode(nodeIdToDelete);
    if (groupIdToDelete) deleteGroupWithNodes(groupIdToDelete);
  };

  const zoomWithWheel = (event: WheelEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('select, input, .pro-node-field')) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = getStrategyCanvasWheelZoom(
      zoom,
      pan,
      event.deltaY,
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    );
    if (!next) return;
    setZoom(next.zoom);
    setPan(next.pan);
  };

  const saveDraft = () => {
    setSaveState('saving');
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
      setSaveState('saved');
      setNotice({ tone: 'info', title: '초안을 이 기기에 저장했습니다', detail: '미완성 전략도 저장할 수 있으며, 검증 통과 전에는 출시할 수 없습니다.' });
      setAnnouncement('전략 초안을 저장했습니다.');
    } catch {
      setSaveState('failed');
      setNotice({ tone: 'error', title: '초안을 저장하지 못했습니다', detail: '브라우저 저장 공간을 확인한 뒤 다시 시도하세요.' });
    }
  };

  const runValidation = () => {
    if (highlightedIssueId) {
      setHighlightedIssueId(null);
      setAnnouncement('오류 경로 강조를 껐습니다.');
      return;
    }
    const issues = validateGraph(graph);
    setValidationIssues(issues);
    const errors = issues.filter((issue) => issue.severity === 'error');
    setValidationState(errors.length ? 'incomplete' : 'ready');
    setInspectorTab('validation');
    setRightCollapsed(false);
    if (errors.length) {
      setHighlightedIssueId(errors.find((issue) => issue.nodeId)?.id ?? null);
      setNotice({ tone: 'error', title: `출시를 막는 오류 ${errors.length}개가 있습니다`, detail: '검증 패널에서 항목을 선택하면 문제 위치로 이동합니다.' });
    } else {
      setHighlightedIssueId(null);
      const warningCount = issues.length;
      setNotice({ tone: 'info', title: '출시 가능한 구조입니다', detail: warningCount ? `경고 ${warningCount}개를 검토하세요.` : '현재 구조 검사에서 오류나 경고를 찾지 못했습니다.' });
    }
  };

  const launchBot = () => {
    if (validationState !== 'ready') return;
    if (onLaunchBot) {
      onLaunchBot();
      return;
    }
    setNotice({ tone: 'info', title: '출시 준비가 완료되었습니다', detail: '서비스 연결 후 봇 출시 화면으로 이동합니다.' });
  };

  const focusIssue = (issue: ValidationIssue) => {
    if (!issue.nodeId) return;
    const node = nodeById[issue.nodeId];
    if (!node) return;
    setSelectedNodeIds([node.id]);
    setHighlightedIssueId(issue.id);
    if (issue.portId) setExpandedPortNodeIds((ids) => ids.includes(node.id) ? ids : [...ids, node.id]);
    setRightCollapsed(false);
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (bounds) {
      setPan({
        x: bounds.width / 2 - (node.x + nodeWidth(node) / 2) * zoom,
        y: bounds.height / 2 - (node.y + displayNodeHeight(node) / 2) * zoom,
      });
    }
    requestAnimationFrame(() => {
      const setting = issue.settingId
        ? document.querySelector<HTMLElement>(`[data-node-setting="${node.id}-${issue.settingId}"]`)
        : document.querySelector<HTMLElement>(`[data-testid="pro-node-${node.id}"]`);
      setting?.focus?.();
    });
  };

  const startLibraryDrag = (event: DragEvent<HTMLElement>, blueprintId: string) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-i2s-pro-node', blueprintId);
    setDragBlueprintId(blueprintId);
  };

  const startPackageDrag = (event: DragEvent<HTMLButtonElement>, templateId: string) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-i2s-pro-package', templateId);
    setDragTemplateId(templateId);
  };

  const dropLibraryNode = (event: DragEvent<HTMLDivElement>) => {
    const blueprintId = event.dataTransfer.getData('application/x-i2s-pro-node') || dragBlueprintId;
    if (!blueprintId) return;
    event.preventDefault();
    addNode(blueprintId, worldPoint(event.clientX, event.clientY));
    setDragBlueprintId(null);
  };

  const insertTemplate = (template: TemplateDefinition, centerOverride?: CanvasPoint) => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    const center = centerOverride ?? (bounds
      ? worldPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      : { x: 600, y: 300 });
    const ids = {
      event: nextId('pro-event'),
      universe: nextId('pro-universe'),
      market: nextId('pro-market'),
      indicator: nextId(`pro-${template.indicatorId}`),
      value: nextId('pro-value'),
      compare: nextId('pro-compare'),
      branch: nextId('pro-branch'),
      order: nextId('pro-order'),
    };
    const startX = center.x - 540;
    const startY = center.y - 180;
    const indicatorId = BLUEPRINT_BY_ID[template.indicatorId] ? template.indicatorId : 'rsi';
    const nodes = [
      makeNode('event', ids.event, startX, startY + 80),
      makeNode('universe', ids.universe, startX + 340, startY + 80),
      makeNode('market-data', ids.market, startX + 720, startY + 80),
      makeNode(indicatorId, ids.indicator, startX + 1060, startY),
      makeNode('value', ids.value, startX + 1060, startY + 270),
      makeNode('compare', ids.compare, startX + 1400, startY + 120),
      makeNode('branch', ids.branch, startX + 1740, startY + 120),
      makeNode('order', ids.order, startX + 2080, startY + 120),
    ];
    const tempGraph: GraphState = { nodes, links: [], groups: [] };
    const link = (fromId: string, fromPortId: string, toId: string, toPortId: string): GraphLink | null => {
      const fromNode = nodes.find((node) => node.id === fromId)!;
      const toNode = nodes.find((node) => node.id === toId)!;
      const output = getBlueprint(fromNode).outputs.find((item) => item.id === fromPortId);
      const input = getBlueprint(toNode).inputs.find((item) => item.id === toPortId);
      if (!output || !input || !portsCompatible(output.type, input.type)) return null;
      return { id: nextId('pro-link'), from: { nodeId: fromId, portId: fromPortId }, to: { nodeId: toId, portId: toPortId }, type: output.type };
    };
    const indicatorBlueprint = BLUEPRINT_BY_ID[indicatorId];
    const indicatorInput = indicatorBlueprint.inputs[0];
    const indicatorOutput = indicatorBlueprint.outputs[0];
    const marketOutput = indicatorInput?.type === 'volume' ? 'volume'
      : indicatorInput?.type === 'price' ? (indicatorInput.id === 'high' ? 'high' : indicatorInput.id === 'low' ? 'low' : 'close')
        : 'close';
    tempGraph.links = [
      link(ids.event, 'flow', ids.universe, 'flow'),
      link(ids.universe, 'itemFlow', ids.branch, 'flow'),
      link(ids.universe, 'symbol', ids.market, 'symbol'),
      ...(indicatorInput ? [link(ids.market, marketOutput, ids.indicator, indicatorInput.id)] : []),
      ...(indicatorOutput?.type === 'number' ? [link(ids.indicator, indicatorOutput.id, ids.compare, 'a')] : []),
      link(ids.value, 'value', ids.compare, 'b'),
      link(ids.compare, 'condition', ids.branch, 'condition'),
      link(ids.branch, 'met', ids.order, 'flow'),
      link(ids.universe, 'symbol', ids.order, 'symbol'),
    ].filter((item): item is GraphLink => item !== null);
    const packageGroup: GraphGroup = {
      id: nextId('pro-group'),
      title: template.title,
      nodeIds: nodes.map((node) => node.id),
      collapsed: false,
      color: GROUP_COLORS[graph.groups.length % GROUP_COLORS.length],
    };
    recordChange((current) => ({
      nodes: [...current.nodes, ...tempGraph.nodes],
      links: [...current.links, ...tempGraph.links],
      groups: [...current.groups, packageGroup],
    }), `${template.title} 패키지를 추가했습니다.`);
    setSelectedNodeIds([ids.event]);
  };

  const dragOverCanvas = (event: DragEvent<HTMLDivElement>) => {
    if (!dragBlueprintId && !dragTemplateId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (dragTemplateId) setPackagePreview(worldPoint(event.clientX, event.clientY));
  };

  const dropOnCanvas = (event: DragEvent<HTMLDivElement>) => {
    const templateId = event.dataTransfer.getData('application/x-i2s-pro-package') || dragTemplateId;
    if (templateId) {
      event.preventDefault();
      const template = TEMPLATE_DEFINITIONS.find((item) => item.id === templateId);
      if (template) insertTemplate(template, worldPoint(event.clientX, event.clientY));
      setDragTemplateId(null);
      setPackagePreview(null);
      return;
    }
    dropLibraryNode(event);
  };

  const pickerItems = useMemo(() => {
    if (!picker) return [];
    const query = pickerQuery.trim().toLowerCase();
    return NODE_BLUEPRINTS.filter((blueprint) => picker.direction === 'output'
      ? blueprint.inputs.some((port) => portsCompatible(picker.type, port.type))
      : blueprint.outputs.some((port) => portsCompatible(port.type, picker.type)))
      .filter((blueprint) => !query || `${blueprint.title} ${blueprint.description} ${(blueprint.aliases ?? []).join(' ')}`.toLowerCase().includes(query));
  }, [picker, pickerQuery]);

  const addFromPicker = (blueprint: NodeBlueprint) => {
    if (!picker) return;
    const point = worldPoint(picker.clientX, picker.clientY);
    const node = makeNode(
      blueprint.id,
      nextId(`pro-${blueprint.id}`),
      Math.round(point.x - (picker.direction === 'input' ? (blueprint.wide ? WIDE_NODE_WIDTH : NODE_WIDTH) : 0)),
      Math.round(point.y - NODE_HEADER_HEIGHT),
    );
    const input = picker.direction === 'output'
      ? blueprint.inputs.find((port) => portsCompatible(picker.type, port.type))
      : undefined;
    const output = picker.direction === 'input'
      ? blueprint.outputs.find((port) => portsCompatible(port.type, picker.type))
      : undefined;
    if (picker.direction === 'output' && !input) return;
    if (picker.direction === 'input' && !output) return;
    const link: GraphLink = picker.direction === 'output'
      ? {
        id: picker.reconnectingLinkId ?? nextId('pro-link'),
        from: picker.anchor,
        to: { nodeId: node.id, portId: input!.id },
        type: picker.type,
      }
      : {
        id: nextId('pro-link'),
        from: { nodeId: node.id, portId: output!.id },
        to: picker.anchor,
        type: output!.type,
      };
    recordChange((current) => ({
      nodes: [...current.nodes, node],
      links: [
        ...current.links.filter((item) => item.id !== picker.reconnectingLinkId),
        link,
      ],
      groups: current.groups,
    }), `${blueprint.title} 노드를 추가하고 연결했습니다.`);
    setSelectedNodeIds([node.id]);
    setPicker(null);
  };

  const filteredBlueprints = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return NODE_BLUEPRINTS.filter((blueprint) => blueprint.level === 'core' || showAdvancedNodes)
      .filter((blueprint) => !query || `${blueprint.title} ${blueprint.description} ${(blueprint.aliases ?? []).join(' ')}`.toLowerCase().includes(query));
  }, [libraryQuery, showAdvancedNodes]);

  const filteredTemplates = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return TEMPLATE_DEFINITIONS.filter((template) => !query || `${template.title} ${template.description}`.toLowerCase().includes(query));
  }, [libraryQuery]);

  const groupedLibrary = useMemo(() => {
    const groups = new Map<string, NodeBlueprint[]>();
    filteredBlueprints.forEach((blueprint) => {
      const key = blueprint.category;
      groups.set(key, [...(groups.get(key) ?? []), blueprint]);
    });
    return CATEGORY_ORDER
      .filter((key) => groups.has(key))
      .map((key) => [key, groups.get(key)!.toSorted((a, b) => (
        a.level === b.level ? 0 : a.level === 'core' ? -1 : 1
      ))] as const);
  }, [filteredBlueprints]);

  const toggleFavoriteNode = (blueprintId: string) => {
    setFavoriteNodeIds((ids) => ids.includes(blueprintId)
      ? ids.filter((id) => id !== blueprintId)
      : [...ids, blueprintId]);
  };

  const renderLibraryBlueprint = (blueprint: NodeBlueprint, pinned = false) => {
    const favorite = favoriteNodeIds.includes(blueprint.id);
    return <div
      className={`pro-library-node-card${blueprint.level === 'advanced' ? ' is-advanced' : ' is-core'}${dragBlueprintId === blueprint.id ? ' is-dragging' : ''}${pinned ? ' is-pinned' : ''}`}
      key={`${pinned ? 'favorite' : 'category'}-${blueprint.id}`}
      style={{ '--category-color': CATEGORY_META[blueprint.category].color } as CSSProperties}
    >
      <div
        role="button"
        tabIndex={0}
        className={`pro-library-node-main${blueprint.level === 'advanced' ? ' is-advanced' : ' is-core'}${dragBlueprintId === blueprint.id ? ' is-dragging' : ''}`}
        style={{ '--category-color': CATEGORY_META[blueprint.category].color } as CSSProperties}
        aria-label={`${blueprint.title} 노드 추가`}
        draggable
        onDragStart={(event) => startLibraryDrag(event, blueprint.id)}
        onDragEnd={() => setDragBlueprintId(null)}
        onClick={() => addNode(blueprint.id)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          addNode(blueprint.id);
        }}
      >
        <span className="pro-library-icon">{blueprint.id === 'event' ? <Play data-testid="pro-start-library-icon" size={15} fill="currentColor" /> : <blueprint.icon size={15} />}</span>
        <span className="pro-library-node-copy">
          <span className="pro-library-title-row">
            <strong>{blueprint.title}</strong>
            <button
              type="button"
              className={`pro-library-favorite${favorite ? ' is-active' : ''}`}
              aria-label={`${blueprint.title} ${favorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'}`}
              aria-pressed={favorite}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                toggleFavoriteNode(blueprint.id);
              }}
              onKeyDown={(event) => event.stopPropagation()}
            ><Star size={10} fill={favorite ? 'currentColor' : 'none'} /></button>
            <em className={`pro-library-level-badge is-${blueprint.level}`}>{blueprint.level === 'advanced' ? '확장' : '핵심'}</em>
          </span>
          <small>{blueprint.description}</small>
        </span>
        <Plus className="pro-library-add-icon" size={14} />
      </div>
    </div>;
  };

  const renderSettingControl = (node: GraphNode, setting: SettingDefinition, compact = false) => {
    const value = node.values[setting.id] ?? '';
    const selectKey = `${node.id}:${setting.id}:${compact ? 'node' : 'inspector'}`;
    const common = {
      'data-node-setting': `${node.id}-${setting.id}`,
      'aria-label': `${node.title} ${setting.label}`,
      value,
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => event.stopPropagation(),
    };
    if (setting.kind === 'fixed') return <span className="pro-fixed-value">{setting.fixedValue}</span>;
    if (setting.kind === 'select') return <span className={`pro-select-shell${openSettingSelect === selectKey ? ' is-open' : ''}`}>
      <select
        {...common}
        className="pro-node-field"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus();
          setOpenSettingSelect((current) => current === selectKey ? null : selectKey);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
            event.preventDefault();
            setOpenSettingSelect(selectKey);
          }
          if (event.key === 'Escape') setOpenSettingSelect(null);
        }}
        onChange={(event) => {
          updateSetting(node.id, setting.id, event.target.value);
          setOpenSettingSelect(null);
        }}
        onWheel={(event) => event.stopPropagation()}
      >
        <option value="">{setting.placeholder ?? '선택'}</option>
        {setting.options?.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      {openSettingSelect === selectKey && <span
        className="pro-select-options"
        role="listbox"
        aria-label={`${node.title} ${setting.label} 선택`}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        {[setting.placeholder ?? '선택', ...(setting.options ?? [])].map((option, index) => {
          const optionValue = index === 0 ? '' : option;
          const optionMeta = getSelectOptionMeta(setting, optionValue);
          const OptionIcon = optionMeta.icon;
          return <button
            type="button"
            role="option"
            aria-label={option}
            aria-selected={value === optionValue}
            className={`tone-${optionMeta.tone}${value === optionValue ? ' is-selected' : ''}`}
            key={`${optionValue || 'placeholder'}-${index}`}
            onClick={() => {
              updateSetting(node.id, setting.id, optionValue);
              setOpenSettingSelect(null);
            }}
          >
            <span className="pro-select-option-icon" aria-hidden="true"><OptionIcon size={13} /></span>
            <span className="pro-select-option-copy">
              <strong>{option}</strong>
              <small className="pro-select-option-caption">{optionMeta.caption}</small>
            </span>
            {value === optionValue && <Check className="pro-select-option-check" size={12} aria-hidden="true" />}
          </button>;
        })}
      </span>}
    </span>;
    if (setting.kind === 'symbols') return <input
      {...common}
      className="pro-node-field"
      placeholder={compact ? '종목 선택' : 'AAPL, MSFT'}
      onChange={(event) => updateSetting(node.id, setting.id, event.target.value)}
    />;
    return <span className="pro-number-field">
      <input
        {...common}
        className="pro-node-field"
        type={setting.kind === 'number' ? 'number' : 'text'}
        min={setting.min}
        max={setting.max}
        placeholder={setting.placeholder ?? '입력'}
        onChange={(event) => updateSetting(node.id, setting.id, event.target.value)}
      />
      {setting.unit && <b>{setting.unit}</b>}
    </span>;
  };

  const renderPort = (node: GraphNode, port: PortDefinition, direction: 'input' | 'output') => {
    const blueprint = getBlueprint(node);
    const nodePorts = direction === 'input' ? blueprint.inputs : blueprint.outputs;
    const advanced = isAdvancedPort(nodePorts, port);
    const linked = direction === 'input' ? inputLinked(node.id, port.id) : outputLinked(node.id, port.id);
    const oppositeDirection = linkDraft && linkDraft.direction !== direction;
    const compatible = Boolean(
      oppositeDirection
      && linkDraft.anchor.nodeId !== node.id
      && (direction === 'input'
        ? portsCompatible(linkDraft.type, port.type)
        : portsCompatible(port.type, linkDraft.type)),
    );
    const blocked = Boolean(oppositeDirection && !compatible);
    const compatibleNodeTitles = NODE_BLUEPRINTS
      .filter((candidate) => candidate.id !== blueprint.id)
      .filter((candidate) => {
        const candidatePorts = direction === 'input' ? candidate.outputs : candidate.inputs;
        return candidatePorts.some((candidatePort) => direction === 'input'
          ? portsCompatible(candidatePort.type, port.type)
          : portsCompatible(port.type, candidatePort.type));
      })
      .map((candidate) => candidate.title);
    const compatiblePreview = compatibleNodeTitles.slice(0, 2).join(', ');
    const compatibilityHint = compatibleNodeTitles.length
      ? `${compatiblePreview}${compatibleNodeTitles.length > 2 ? ` 외 ${compatibleNodeTitles.length - 2}개` : ''}`
      : '현재 연결 가능한 노드 없음';
    const portButton = <button
      type="button"
      className={`pro-port is-${direction} port-${port.type}${advanced ? ' is-advanced' : ''}${linked ? ' is-linked' : ''}${compatible ? ' is-compatible' : ''}${blocked ? ' is-blocked' : ''}`}
      style={{ '--port-color': PORT_META[port.type].color } as CSSProperties}
      data-testid={port.testId}
      aria-label={`${node.title} ${port.label} ${direction === 'input' ? '입력' : '출력'} 연결부 · ${PORT_META[port.type].label}`}
      onPointerDown={(event) => beginLink(event, node, port, direction)}
      onPointerUp={direction === 'input' ? (event) => releaseInput(event, node, port) : undefined}
      onPointerUpCapture={direction === 'output' ? (event) => releaseOutput(event, node, port) : undefined}
      onClick={() => openPickerForPort(node, port, direction)}
    >
      {direction === 'output' && <span className={port.groupId ? 'pro-port-variant-label' : undefined}>
        {port.label}
        {port.groupId && <ChevronRight className="pro-port-variant-cue" size={9} aria-hidden="true" />}
      </span>}
      <i data-shape={PORT_META[port.type].shape} aria-hidden="true" />
      {direction === 'input' && <span>{port.label}</span>}
      {compatible && <span className="pro-port-drop-label" aria-hidden="true">{port.label}</span>}
      {!port.groupId && <span className="pro-port-tooltip" role="tooltip">
        <b>{PORT_META[port.type].label} · {direction === 'input' ? '입력' : '출력'}</b>
        <small>{blocked
          ? `${PORT_META[linkDraft!.type].label} 포트와 연결할 수 없음`
          : direction === 'input' && linked
            ? `연결 교체 가능 · ${compatibilityHint}`
            : `연결 가능: ${compatibilityHint}`}</small>
      </span>}
    </button>;
    if (!port.groupId) return portButton;
    const members = portGroupMembers(node, direction, port.groupId);
    return <span className={`pro-port-variant-shell is-${direction}`} style={{ '--port-color': PORT_META[port.type].color } as CSSProperties}>
      {portButton}
      <span className="pro-port-variant-menu" role="menu" aria-label={`${port.groupLabel ?? port.label} 출력 선택`}>
        {members.map((member) => <button
          key={member.id}
          type="button"
          role="menuitem"
          className={member.id === port.id ? 'is-active' : ''}
          aria-label={`${member.label} 출력으로 사용`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => switchPortVariant(node, direction, port.groupId!, member.id)}
        >{member.label}</button>)}
      </span>
    </span>;
  };

  const groupBounds = (group: GraphGroup) => {
    const nodes = graph.nodes.filter((node) => group.nodeIds.includes(node.id));
    if (nodes.length < 2) return null;
    const left = Math.min(...nodes.map((node) => node.x)) - 24;
    const top = Math.min(...nodes.map((node) => node.y)) - 48;
    const right = Math.max(...nodes.map((node) => node.x + nodeWidth(node))) + 24;
    const bottom = Math.max(...nodes.map((node) => node.y + displayNodeHeight(node))) + 24;
    return { nodes, left, top, right, bottom };
  };

  const collapsedGroupForNode = (nodeId: string) => graph.groups.find((group) => group.collapsed && group.nodeIds.includes(nodeId));

  const groupLinkPoint = (group: GraphGroup, direction: 'input' | 'output'): CanvasPoint | null => {
    const bounds = groupBounds(group);
    if (!bounds) return null;
    return {
      x: bounds.left + (direction === 'output' ? COLLAPSED_GROUP_WIDTH : 0),
      y: bounds.top + COLLAPSED_GROUP_HEIGHT / 2,
    };
  };

  const renderGroup = (group: GraphGroup) => {
    const bounds = groupBounds(group);
    if (!bounds) return null;
    const { nodes, left, top, right, bottom } = bounds;
    const hasIncoming = graph.links.some((link) => !group.nodeIds.includes(link.from.nodeId) && group.nodeIds.includes(link.to.nodeId));
    const hasOutgoing = graph.links.some((link) => group.nodeIds.includes(link.from.nodeId) && !group.nodeIds.includes(link.to.nodeId));
    const externalLinkSummary = Array.from(graph.links.reduce((summary, link) => {
      const incoming = !group.nodeIds.includes(link.from.nodeId) && group.nodeIds.includes(link.to.nodeId);
      const outgoing = group.nodeIds.includes(link.from.nodeId) && !group.nodeIds.includes(link.to.nodeId);
      if (!incoming && !outgoing) return summary;
      const key = `${incoming ? 'in' : 'out'}-${link.type}`;
      const current = summary.get(key);
      summary.set(key, {
        direction: incoming ? 'in' as const : 'out' as const,
        type: link.type,
        count: (current?.count ?? 0) + 1,
      });
      return summary;
    }, new Map<string, { direction: 'in' | 'out'; type: PortType; count: number }>()).values());
    return <section
      key={group.id}
      className={`pro-node-group${group.collapsed ? ' is-collapsed' : ''}`}
      data-testid={`pro-group-${group.id}`}
      style={{
        left,
        top,
        width: group.collapsed ? COLLAPSED_GROUP_WIDTH : right - left,
        height: group.collapsed ? COLLAPSED_GROUP_HEIGHT : bottom - top,
        '--group-color': group.color,
      } as CSSProperties}
    >
      <header onPointerDown={(event) => startGroupMove(event, group)}>
        <Layers3 size={13} />
        {editingGroupId === group.id
          ? <input
            autoFocus
            aria-label={`${group.title} 그룹 이름`}
            value={groupNameDraft}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => setGroupNameDraft(event.target.value)}
            onBlur={() => commitGroupRename(group.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setEditingGroupId(null);
            }}
          />
          : <strong>{group.title}</strong>}
        <button
          type="button"
          className="is-color"
          aria-label={`${group.title} 그룹 색상 변경`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => cycleGroupColor(group.id)}
        ><i style={{ background: group.color }} /></button>
        <button
          type="button"
          className="is-rename"
          aria-label={`${group.title} 그룹 이름 수정`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => beginGroupRename(group)}
        ><Pencil size={11} /></button>
        <span>{nodes.length}</span>
        <button
          type="button"
          className="is-toggle"
          aria-label={`${group.title} 그룹 ${group.collapsed ? '펼치기' : '접기'}`}
          aria-expanded={!group.collapsed}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => toggleGroup(group.id)}
        ><ChevronDown size={12} /></button>
        <button
          type="button"
          aria-label={`${group.title} 그룹 해제`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => deleteGroup(group.id)}
        ><X size={12} /></button>
      </header>
      {group.collapsed && <aside className="pro-group-link-summary" aria-label={`${group.title} 외부 연결 요약`}>
        {externalLinkSummary.map((item) => <span
          key={`${item.direction}-${item.type}`}
          style={{ '--port-color': PORT_META[item.type].color } as CSSProperties}
          title={`${item.direction === 'in' ? '들어오는' : '나가는'} ${PORT_META[item.type].label} 연결 ${item.count}개`}
        ><i data-direction={item.direction} />{PORT_META[item.type].label} ×{item.count}</span>)}
      </aside>}
      {group.collapsed && hasIncoming && <i className="pro-group-proxy is-input" aria-hidden="true" />}
      {group.collapsed && hasOutgoing && <i className="pro-group-proxy is-output" aria-hidden="true" />}
    </section>;
  };

  const renderNode = (node: GraphNode) => {
    const blueprint = getBlueprint(node);
    const meta = CATEGORY_META[blueprint.category];
    const isStartNode = blueprint.id === 'event';
    const isOrderNode = blueprint.id === 'order';
    const directSettings = blueprint.settings.filter((setting) => setting.direct);
    const inputs = visiblePorts(node, 'input');
    const outputs = visiblePorts(node, 'output');
    const rowCount = displayNodeRowCount(node);
    const advancedCount = advancedPortCount(node);
    const portsExpanded = expandedPortNodeIds.includes(node.id);
    const nodeIssues = issuesByNode.get(node.id) ?? [];
    const selected = selectedNodeIds.includes(node.id);
    const isLinkAnchor = linkDraft?.anchor.nodeId === node.id;
    const isCompatibleLinkTarget = Boolean(linkDraft && !isLinkAnchor && (
      linkDraft.direction === 'output'
        ? blueprint.inputs.some((port) => portsCompatible(linkDraft.type, port.type))
        : blueprint.outputs.some((port) => portsCompatible(port.type, linkDraft.type))
    ));
    const isIncompatibleLinkTarget = Boolean(linkDraft && !isLinkAnchor && !isCompatibleLinkTarget);
    return <article
      key={node.id}
      tabIndex={0}
      className={`pro-graph-node${isStartNode ? ' is-start-node' : ''}${isOrderNode ? ' is-order-node' : ''}${selected ? ' is-selected' : ''}${movingNodeIdsRef.current.includes(node.id) && nodeMove ? ' is-moving' : ''}${nodeIssues.some((issue) => issue.severity === 'error') ? ' has-error' : ''}${highlightedFlowNodeIds.has(node.id) ? ' is-validation-flow' : ''}${highlightedIssue?.nodeId === node.id ? ' is-validation-focus' : ''}${highlightedIssue && !highlightedFlowNodeIds.has(node.id) ? ' is-validation-muted' : ''}${isLinkAnchor ? ' is-link-source' : ''}${isCompatibleLinkTarget ? ' is-link-compatible' : ''}${isIncompatibleLinkTarget ? ' is-link-incompatible' : ''}`}
      data-testid={`pro-node-${node.id}`}
      style={{
        left: node.x,
        top: node.y,
        width: nodeWidth(node),
      height: displayNodeHeight(node),
        '--node-color': isStartNode ? '#48d17f' : meta.color,
      } as CSSProperties}
      onPointerDown={(event) => startMove(event, node)}
      onFocus={() => {
        setSelectedNodeIds([node.id]);
        setRightCollapsed(false);
      }}
      onClick={(event) => {
        if (event.detail !== 0 || (event.target as Element).closest('button, input, select')) return;
        setSelectedNodeIds((ids) => event.shiftKey
          ? (ids.includes(node.id) ? ids.filter((id) => id !== node.id) : [...ids, node.id])
          : [node.id]);
      }}
    >
      <header className="pro-node-header">
        <button
          type="button"
          className="pro-node-drag"
          aria-label={`${node.title} 노드 자유 이동`}
          onPointerDown={(event) => startMove(event, node, true)}
        ><GripVertical size={15} /></button>
        <span className="pro-node-icon">{isStartNode ? <Play size={15} aria-hidden="true" fill="currentColor" /> : <blueprint.icon size={15} aria-hidden="true" />}</span>
        <span className="pro-node-heading">
          <small>{isStartNode ? 'START · 전략 실행' : `${meta.short} · ${blueprint.level === 'advanced' ? '확장' : '핵심'}`}</small>
          <strong>{node.title}</strong>
        </span>
        {nodeIssues.length > 0 && <span className="pro-node-issue-count" aria-label={`검증 문제 ${nodeIssues.length}개`}><TriangleAlert size={10} />{nodeIssues.length}</span>}
        {advancedCount > 0 && <button
          type="button"
          className={`pro-node-port-toggle${portsExpanded ? ' is-expanded' : ''}`}
          aria-label={`${node.title} 추가 포트 ${portsExpanded ? '접기' : '펼치기'}`}
          aria-expanded={portsExpanded}
          title={`추가 포트 ${advancedCount}개 ${portsExpanded ? '접기' : '보기'}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setExpandedPortNodeIds((ids) => ids.includes(node.id) ? ids.filter((id) => id !== node.id) : [...ids, node.id])}
        ><span>+{advancedCount}</span><ChevronDown size={11} /></button>}
      </header>
      <div className="pro-node-rows">
        {Array.from({ length: rowCount }, (_, index) => {
          const input = inputs[index];
          const output = outputs[index];
          const setting = directSettings[index];
          return <div className={`pro-node-row${input ? ' has-input' : ''}${output ? ' has-output' : ''}${setting ? ' has-setting' : ''}`} key={`${node.id}-row-${index}`}>
            <span className="pro-port-slot is-input">{input && renderPort(node, input, 'input')}</span>
            <span className="pro-node-row-setting">
              {setting
                ? <><label>{setting.label}</label>{renderSettingControl(node, setting, true)}</>
                : null}
            </span>
            <span className="pro-port-slot is-output">{output && renderPort(node, output, 'output')}</span>
          </div>;
        })}
      </div>
    </article>;
  };

  const errors = validationIssues.filter((issue) => issue.severity === 'error');
  const warnings = validationIssues.filter((issue) => issue.severity === 'warning');
  const minimapWidth = 176;
  const minimapHeight = 92;
  const minimapPadding = 8;
  const minimapLeft = graph.nodes.length ? Math.min(...graph.nodes.map((node) => node.x)) : 0;
  const minimapTop = graph.nodes.length ? Math.min(...graph.nodes.map((node) => node.y)) : 0;
  const minimapRight = graph.nodes.length ? Math.max(...graph.nodes.map((node) => node.x + nodeWidth(node))) : 1;
  const minimapBottom = graph.nodes.length ? Math.max(...graph.nodes.map((node) => node.y + displayNodeHeight(node))) : 1;
  const minimapScale = Math.min(
    (minimapWidth - minimapPadding * 2) / Math.max(1, minimapRight - minimapLeft),
    (minimapHeight - minimapPadding * 2) / Math.max(1, minimapBottom - minimapTop),
  );
  const minimapPoint = (point: CanvasPoint) => ({
    x: minimapPadding + (point.x - minimapLeft) * minimapScale,
    y: minimapPadding + (point.y - minimapTop) * minimapScale,
  });
  const viewportOrigin = minimapPoint({ x: -pan.x / zoom, y: -pan.y / zoom });
  const viewportWidth = workspaceSize.width / zoom * minimapScale;
  const viewportHeight = workspaceSize.height / zoom * minimapScale;
  const saveLabel: Record<SaveState, string> = {
    saved: '저장됨',
    saving: '저장 중',
    dirty: '저장되지 않은 변경사항',
    failed: '저장 실패',
  };
  const trashSubject = nodeMove?.groupId
    ? graph.groups.find((group) => group.id === nodeMove.groupId)?.title ?? '그룹'
    : movingNodeIdsRef.current.length > 1
      ? `${movingNodeIdsRef.current.length}개 노드`
      : nodeMove
        ? nodeById[nodeMove.nodeId]?.title ?? '노드'
        : '노드';

  return <Localized><div className="page editor-page pro-editor-page pro-editor-v2 editor-shell-page">
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    <div className="pro-editor-commandbar floating-editor-controls" role="toolbar" aria-label="Pro 편집 작업">
      <div className="pro-editor-context">
        <Button className="floating-editor-button" kind="ghost" icon={ArrowLeft} onClick={goBack}>목록</Button>
        <div className="floating-editor-mode-controls" role="group" aria-label="편집기 전환">
          <Button className="floating-editor-button" onClick={() => openEditor?.('basic')}>Basic 편집기</Button>
          <Button className="floating-editor-button active" onClick={() => openEditor?.('pro')}>Pro 편집기</Button>
        </div>
        <div className="pro-history-controls" role="group" aria-label="변경 이력">
          <button type="button" className="floating-editor-button" aria-label="실행 취소" disabled={!history.length} onClick={undo}><Undo2 size={14} /></button>
          <button type="button" className="floating-editor-button" aria-label="다시 실행" disabled={!future.length} onClick={redo}><Redo2 size={14} /></button>
        </div>
      </div>
      <div className="pro-editor-actions">
        <span className={`pro-save-state is-${saveState}`}><i />{saveLabel[saveState]}</span>
        <button type="button" className={`pro-validation-state is-${validationState}`} aria-label="검증" onClick={runValidation}>
          {validationState === 'ready' ? <Check size={13} /> : <TriangleAlert size={13} />}
          {validationState === 'ready' ? `출시 가능${warnings.length ? ` · 경고 ${warnings.length}` : ''}` : `미완성 · 오류 ${errors.length}`}
        </button>
        {highlightedIssueId && <button type="button" className="pro-validation-clear" aria-label="검증 강조 끄기" onClick={() => setHighlightedIssueId(null)}><X size={12} />강조 끄기</button>}
        <Button className="floating-editor-button" icon={Save} onClick={saveDraft}>저장</Button>
        <Button className="floating-editor-button pro-launch-button" disabled={validationState !== 'ready'} onClick={launchBot}>개인 봇 출시</Button>
      </div>
    </div>

    <div ref={layoutRef} className={`editor-layout pro-layout full-editor-workspace${leftCollapsed ? ' is-library-collapsed' : ''}${rightCollapsed ? ' is-inspector-collapsed' : ''}`} data-testid="pro-editor-workspace">
      <aside className="editor-palette node-library-panel panel floating-editor-panel pro-side-panel is-left" data-testid="pro-node-library">
        <div className="palette-title">
          <span>NODES</span>
          <Boxes size={15} />
          {!leftCollapsed && <button ref={leftCollapseButtonRef} type="button" aria-expanded="true" aria-label="노드 라이브러리 접기" onClick={(event) => collapsePanel('left', event.currentTarget)}>
            <ChevronLeft size={15} />
          </button>}
        </div>
        <div className="pro-side-panel-content" aria-hidden={leftCollapsed || undefined}>
          <p className="library-intro">노드를 끌어 놓거나 선택해 추가하세요. 연결부의 모양과 이름이 같아야 연결됩니다.</p>
          <div className="pro-library-primary-tabs" role="tablist" aria-label="Pro 구성 요소">
            <button type="button" role="tab" aria-selected={libraryView === 'nodes'} onClick={() => setLibraryView('nodes')}>노드 라이브러리</button>
            <button type="button" role="tab" aria-selected={libraryView === 'templates'} onClick={() => setLibraryView('templates')}>전략 패키지 <b>{TEMPLATE_DEFINITIONS.length}</b></button>
          </div>
          <label className="palette-search"><Search size={14} /><input aria-label={libraryView === 'nodes' ? '노드 검색' : '전략 패키지 검색'} placeholder={libraryView === 'nodes' ? '노드, 별칭, 손절' : '전략 이름, 지표'} value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} /></label>
          {libraryView === 'nodes' && <button
            type="button"
            className={`pro-advanced-node-toggle${showAdvancedNodes ? ' is-active' : ''}`}
            aria-pressed={showAdvancedNodes}
            aria-label={showAdvancedNodes ? '확장 노드 숨기기' : '확장 노드 함께 보기'}
            onClick={() => setShowAdvancedNodes((shown) => !shown)}
          >
            <span><Sparkles size={12} /><b>확장 노드</b><small>필요할 때 분류 안에 함께 표시</small></span>
            <i aria-hidden="true" />
          </button>}
          <div className="pro-library-scroll">
            {libraryView === 'nodes' && favoriteNodeIds.length > 0 && <section
              className="pro-library-category is-input-group pro-library-favorites"
              role="region"
              aria-label="즐겨찾는 노드"
              style={{ '--category-color': '#d6ae43' } as CSSProperties}
            >
              <header className="is-sticky"><span><Star size={10} fill="currentColor" /> 즐겨찾기</span><b>{favoriteNodeIds.length}</b></header>
              {favoriteNodeIds.map((id) => BLUEPRINT_BY_ID[id]).filter(Boolean).map((blueprint) => renderLibraryBlueprint(blueprint, true))}
            </section>}
            {libraryView === 'nodes' && groupedLibrary.map(([groupKey, items]) => {
              const categoryMeta = CATEGORY_META[groupKey];
              return <section
                className="pro-library-category is-input-group"
                key={groupKey}
                role="region"
                aria-label={`${groupKey} 색상 묶음`}
                style={{ '--category-color': categoryMeta.color } as CSSProperties}
              >
                <header className="is-sticky"><span>{groupKey}</span><b>{items.length}</b></header>
                {items.map((blueprint) => renderLibraryBlueprint(blueprint))}
              </section>;
            })}
            {libraryView === 'templates' && <>
              {(['core', 'advanced'] as const).map((level) => <section className="pro-template-section" key={level}>
                <header className="is-sticky"><span>{level === 'core' ? '핵심 전략 패키지' : '확장 전략 패키지'}</span></header>
                {filteredTemplates.filter((template) => template.level === level).map((template) => <div className="basic-package-card-stack" key={template.id}>
                  <span className="basic-package-layer" aria-hidden="true" />
                  <span className="basic-package-layer" aria-hidden="true" />
                  <button
                    type="button"
                    className={`template-card pro-package-card basic-package-card${dragTemplateId === template.id ? ' is-library-dragging' : ''}`}
                    draggable
                    onDragStart={(event) => startPackageDrag(event, template.id)}
                    onDragEnd={() => { setDragTemplateId(null); setPackagePreview(null); }}
                    onClick={() => insertTemplate(template)}
                  >
                    <span className={`template-icon basic-package-bundle-icon ${template.level === 'advanced' ? 'tone-반전' : 'tone-추세'}`}><Layers3 size={15} /></span>
                    <span className="template-card-copy"><span className="basic-package-kind">PACKAGE</span><strong>{template.title}</strong><small>{template.description}</small><em>8개 노드 · 9개 연결</em></span>
                    <Plus size={14} />
                  </button>
                </div>)}
              </section>)}
            </>}
          </div>
        </div>
      </aside>

      <section
        className={`editor-canvas pro-canvas pro-canvas-v2${highlightedIssueId ? ' is-validation-reviewing' : ''}`}
        aria-label="Pro 전략 캔버스"
        style={{
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          '--canvas-pan-x': `${pan.x}px`,
          '--canvas-pan-y': `${pan.y}px`,
        } as CSSProperties}
      >
        <div className="cursor-dot-spotlight" data-testid="pro-cursor-dot-spotlight" aria-hidden="true" />
        <div className="pro-graph-controls" role="group" aria-label="그래프 도구">
          <button type="button" className="floating-editor-button" aria-label="노드 그룹 만들기" onClick={createGroup}><Layers3 size={14} /> 그룹 만들기</button>
          <button
            type="button"
            className={`floating-editor-button${gridSnap ? ' active' : ''}`}
            aria-label="그리드 스냅"
            aria-pressed={gridSnap}
            onClick={() => setGridSnap((value) => !value)}
          ><Grid3X3 size={14} /> 그리드 스냅</button>
          <button type="button" className="floating-editor-button" aria-label="노드 정리" disabled={selectedNodeIds.length < 2} onClick={organizeNodes}><LayoutGrid size={14} /> 노드 정리</button>
        </div>
        <div className="floating-zoom-controls" role="group" aria-label="캔버스 확대/축소">
          <button type="button" className="floating-editor-button" aria-label="축소" disabled={zoom <= .35} onClick={() => setZoom((value) => Math.max(.35, Number((value - .1).toFixed(2))))}>−</button>
          <button type="button" className="floating-editor-button zoom-level" aria-label="배율 초기화" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{Math.round(zoom * 100)}%</button>
          <button type="button" className="floating-editor-button" aria-label="확대" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, Number((value + .1).toFixed(2))))}>+</button>
        </div>
        <div className="mobile-editor-notice"><Split size={24} /><strong>Pro 그래프 편집은 데스크톱에서 사용할 수 있습니다</strong><span>작은 화면에서는 구성을 확인할 수 있습니다.</span></div>
        <div
          ref={(element) => { workspaceRef.current = element; }}
          className={`graph-workspace pro-graph-workspace${panGesture || spacePanning ? ' is-panning' : ''}${spacePanning ? ' is-space-panning' : ''}${boxSelectMode ? ' is-box-selecting' : ''}${nodeMove ? ' is-moving-node' : ''}${linkDraft ? ' is-linking' : ''}`}
          data-testid="pro-graph-surface"
          onPointerDown={startCanvasPan}
          onPointerMove={moveCanvasPointer}
          onPointerUp={finishCanvasPointer}
          onPointerCancel={finishCanvasPointer}
          onPointerLeave={(event) => {
            pointerRef.current = null;
            event.currentTarget.closest<HTMLElement>('.pro-canvas')?.style.setProperty('--spotlight-opacity', '0');
          }}
          onWheel={zoomWithWheel}
          onDragOver={dragOverCanvas}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setPackagePreview(null); }}
          onDrop={dropOnCanvas}
        >
          <div className="graph-world pro-graph-world" data-testid="pro-graph-world" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}>
            {packagePreview && <div
              className="pro-package-preview"
              data-testid="pro-package-preview"
              style={{ left: packagePreview.x - 540, top: packagePreview.y - 180, width: 2380, height: 560 } as CSSProperties}
            ><Sparkles size={14} /><strong>{TEMPLATE_DEFINITIONS.find((item) => item.id === dragTemplateId)?.title ?? '전략 패키지'}</strong><span>이 위치에 노드 그룹을 추가합니다</span></div>}
            {graph.groups.map(renderGroup)}
            <svg className="graph-links pro-graph-links" aria-label="전략 연결선" viewBox="-10000 -10000 20000 20000" preserveAspectRatio="none">
              {graph.links.map((link) => {
                const reconnectingFromLine = linkReconnectGestureRef.current?.linkId === link.id;
                if (linkDraft?.reconnectingLinkId === link.id && !reconnectingFromLine) return null;
                const fromNode = nodeById[link.from.nodeId];
                const toNode = nodeById[link.to.nodeId];
                if (!fromNode || !toNode) return null;
                const fromGroup = collapsedGroupForNode(fromNode.id);
                const toGroup = collapsedGroupForNode(toNode.id);
                if (fromGroup && toGroup && fromGroup.id === toGroup.id) return null;
                const from = fromGroup ? groupLinkPoint(fromGroup, 'output') : displayPortPoint(fromNode, 'output', link.from.portId);
                const to = toGroup ? groupLinkPoint(toGroup, 'input') : displayPortPoint(toNode, 'input', link.to.portId);
                if (!from || !to) return null;
                const path = linkPath(from, to);
                const fromPort = getBlueprint(fromNode).outputs.find((port) => port.id === link.from.portId);
                const toPort = getBlueprint(toNode).inputs.find((port) => port.id === link.to.portId);
                const sourceType = fromPort?.type ?? link.type;
                const targetType = toPort?.type ?? link.type;
                const color = PORT_META[sourceType].color;
                const targetColor = PORT_META[targetType].color;
                const adapted = sourceType !== targetType;
                const gradientId = `pro-link-gradient-${link.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
                return <g
                  key={`${link.id}:${from.x}:${from.y}:${to.x}:${to.y}`}
                  className={`${adapted ? 'is-adapted ' : ''}${reconnectingFromLine ? 'is-reconnecting-origin ' : ''}${selectedLinkId === link.id ? 'is-selected ' : ''}${highlightedFlowLinkIds.has(link.id) ? 'is-validation-flow' : ''}${highlightedIssue && !highlightedFlowLinkIds.has(link.id) ? ' is-validation-muted' : ''}`}
                  style={{
                    '--link-color': adapted ? `url(#${gradientId})` : color,
                    '--link-source-color': color,
                    '--link-target-color': targetColor,
                  } as CSSProperties}
                >
                  {adapted && <defs>
                    <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={from.x} y1={from.y} x2={to.x} y2={to.y}>
                      <stop offset="0%" stopColor={color} />
                      <stop offset="100%" stopColor={targetColor} />
                    </linearGradient>
                  </defs>}
                  <path className={`pro-graph-link port-${link.type}`} d={path} />
                  {adapted && <g className="pro-link-adapter" role="img" aria-label={`${PORT_META[sourceType].label}에서 ${PORT_META[targetType].label}로 변환`}>
                    <rect x={midpoint.x - 4} y={midpoint.y - 4} width="8" height="8" rx="2" transform={`rotate(45 ${midpoint.x} ${midpoint.y})`} />
                  </g>}
                  <path
                    className="pro-graph-link-hit"
                    d={path}
                    role="button"
                    tabIndex={0}
                    aria-label={`${fromNode.title}에서 ${toNode.title} 연결 선택`}
                    onPointerDown={(event) => beginLinkReconnect(event, link)}
                    onPointerUp={(event) => {
                      const gesture = linkReconnectGestureRef.current;
                      if (gesture?.linkId === link.id && !gesture.moved) {
                        event.stopPropagation();
                        linkReconnectGestureRef.current = null;
                        setLinkDraft(null);
                      }
                    }}
                    onClick={() => {
                      if (suppressLinkClickRef.current === link.id) {
                        suppressLinkClickRef.current = null;
                        return;
                      }
                      setSelectedNodeIds([]);
                      setSelectedLinkId(link.id);
                    }}
                    onKeyDown={(event: ReactKeyboardEvent<SVGPathElement>) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedNodeIds([]);
                        setSelectedLinkId(link.id);
                      }
                    }}
                  />
                </g>;
              })}
              {linkDraft && <path
                className={`pro-graph-link is-draft port-${linkDraft.type}`}
                style={{ '--link-color': PORT_META[linkDraft.type].color } as CSSProperties}
                d={linkDraft.direction === 'output'
                  ? linkPath(linkDraft.origin, linkDraft.point)
                  : linkPath(linkDraft.point, linkDraft.origin)}
              />}
            </svg>
            {graph.nodes.filter((node) => !collapsedGroupForNode(node.id)).map(renderNode)}
            {selectedLinkId && (() => {
              const link = graph.links.find((item) => item.id === selectedLinkId);
              if (!link) return null;
              const fromNode = nodeById[link.from.nodeId];
              const toNode = nodeById[link.to.nodeId];
              if (!fromNode || !toNode) return null;
              const from = displayPortPoint(fromNode, 'output', link.from.portId);
              const to = displayPortPoint(toNode, 'input', link.to.portId);
              return <div
                className="pro-link-selection-toolbar"
                style={{ left: (from.x + to.x) / 2, top: (from.y + to.y) / 2 } as CSSProperties}
                role="toolbar"
                aria-label="선택 연결 작업"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <span>연결 선택됨</span>
                <button type="button" aria-label="선택 연결 삭제" onClick={() => deleteLink(link.id)}><Trash2 size={11} /></button>
              </div>;
            })()}
            {selectedNodeIds.length > 0 && (() => {
              const selected = graph.nodes.filter((node) => selectedNodeIds.includes(node.id));
              if (!selected.length) return null;
              const left = Math.min(...selected.map((node) => node.x));
              const top = Math.min(...selected.map((node) => node.y));
              const right = Math.max(...selected.map((node) => node.x + nodeWidth(node)));
              const bottom = Math.max(...selected.map((node) => node.y + displayNodeHeight(node)));
              const visibleTop = -pan.y / zoom;
              const placeBelow = top - visibleTop < 58;
              return <div
                className={`pro-selection-toolbar${placeBelow ? ' is-below' : ''}`}
                style={{ left: (left + right) / 2, top: placeBelow ? bottom + 8 : top - 8 } as CSSProperties}
                role="toolbar"
                aria-label="선택 노드 빠른 작업"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <b>{selected.length}</b>
                {selected.length > 1 && <button type="button" onClick={organizeNodes}><LayoutGrid size={11} />정리</button>}
                {selected.length > 1 && <button type="button" onClick={createGroup}><Layers3 size={11} />그룹</button>}
                <button type="button" className="is-copy" aria-label="선택 노드 복제" title="복제" onClick={duplicateSelected}><Copy size={12} /></button>
                <button type="button" className="is-delete" aria-label="선택 노드 삭제" title="삭제" onClick={deleteSelectedNodes}><Trash2 size={12} /></button>
              </div>;
            })()}
          </div>
          {selectionGesture && (() => {
            const bounds = workspaceRef.current?.getBoundingClientRect();
            const offsetX = bounds?.left ?? 0;
            const offsetY = bounds?.top ?? 0;
            return <div
              className="pro-selection-marquee"
              data-testid="pro-selection-marquee"
              style={{
                left: Math.min(selectionGesture.startX, selectionGesture.currentX) - offsetX,
                top: Math.min(selectionGesture.startY, selectionGesture.currentY) - offsetY,
                width: Math.abs(selectionGesture.currentX - selectionGesture.startX),
                height: Math.abs(selectionGesture.currentY - selectionGesture.startY),
              }}
            />;
          })()}
          {!graph.nodes.length && <div className="pro-canvas-empty">
            <GitBranch size={24} />
            <strong>전략 그래프를 시작하세요</strong>
            <span>패키지로 전체 흐름을 만들거나 노드를 직접 끌어 놓을 수 있습니다.</span>
            <button type="button" onClick={() => { setLeftCollapsed(false); setLibraryView('templates'); }}>전략 패키지 보기</button>
          </div>}
        </div>

        <aside
          className="pro-graph-navigator"
          style={{ left: leftCollapsed ? 18 : 292 }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header><MousePointer2 size={12} /><strong>전략 탐색</strong><span>{graph.nodes.length}</span></header>
          <svg
            className="pro-minimap"
            role="img"
            aria-label="전략 미니맵"
            viewBox={`0 0 ${minimapWidth} ${minimapHeight}`}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const mapX = (event.clientX - rect.left) / Math.max(1, rect.width) * minimapWidth;
              const mapY = (event.clientY - rect.top) / Math.max(1, rect.height) * minimapHeight;
              const worldX = minimapLeft + (mapX - minimapPadding) / minimapScale;
              const worldY = minimapTop + (mapY - minimapPadding) / minimapScale;
              const bounds = workspaceRef.current?.getBoundingClientRect();
              if (bounds) setPan({ x: bounds.width / 2 - worldX * zoom, y: bounds.height / 2 - worldY * zoom });
            }}
          >
            {graph.nodes.map((node) => {
              const point = minimapPoint(node);
              return <rect
                key={node.id}
                x={point.x}
                y={point.y}
                width={Math.max(3, nodeWidth(node) * minimapScale)}
                height={Math.max(3, displayNodeHeight(node) * minimapScale)}
                rx="1.5"
                fill={node.blueprintId === 'event' ? '#48d17f' : CATEGORY_META[getBlueprint(node).category].color}
                opacity={selectedNodeIds.includes(node.id) ? 1 : .64}
              />;
            })}
            <rect
              className="pro-minimap-viewport"
              x={viewportOrigin.x}
              y={viewportOrigin.y}
              width={viewportWidth}
              height={viewportHeight}
              rx="2"
            />
          </svg>
        </aside>

        {picker && <section
          className="pro-compatible-picker"
          role="dialog"
          aria-label="호환 노드 선택"
          style={{
            left: Math.max(8, Math.min(picker.clientX, window.innerWidth - 276)),
            top: Math.max(84, Math.min(picker.clientY, window.innerHeight - 390)),
          } as CSSProperties}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header><span><i style={{ '--port-color': PORT_META[picker.type].color } as CSSProperties} />{PORT_META[picker.type].label} {picker.direction === 'output' ? '출력' : '입력'}</span><button type="button" aria-label="호환 노드 선택 닫기" onClick={() => setPicker(null)}><X size={14} /></button></header>
          <label><Search size={14} /><input autoFocus aria-label="호환 노드 검색" placeholder="연결할 노드 검색" value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} /></label>
          <div>
            {pickerItems.length ? pickerItems.map((blueprint) => <button type="button" key={blueprint.id} onClick={() => addFromPicker(blueprint)}>
              <blueprint.icon size={15} /><span><strong>{blueprint.title}</strong><small>{blueprint.category}</small></span><Plus size={13} />
            </button>) : <p>연결할 수 있는 노드가 없습니다.</p>}
          </div>
        </section>}
      </section>

      <aside className="editor-inspector node-inspector panel floating-editor-panel pro-side-panel is-right" data-testid="pro-node-inspector">
        <div className="inspector-title">
          <span>INSPECTOR</span>
          <Settings2 size={15} />
          {!rightCollapsed && <button ref={rightCollapseButtonRef} type="button" aria-expanded="true" aria-label="설정 패널 접기" onClick={(event) => collapsePanel('right', event.currentTarget)}>
            <ChevronRight size={15} />
          </button>}
        </div>
        <div className="pro-side-panel-content" aria-hidden={rightCollapsed || undefined}>
          <div className="pro-inspector-tabs" role="tablist" aria-label="Pro 상세 패널">
            {([
              ['settings', '설정'],
              ['validation', `검증 ${errors.length + warnings.length}`],
              ['description', '전략 설명'],
            ] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={inspectorTab === id} onClick={() => setInspectorTab(id)}>{label}</button>)}
          </div>
          <div className="pro-inspector-scroll">
            {inspectorTab === 'settings' && (selectedNode && selectedBlueprint ? <>
              <section className="pro-inspector-node-heading" style={{ '--node-color': CATEGORY_META[selectedBlueprint.category].color } as CSSProperties}>
                <span><selectedBlueprint.icon size={16} /></span>
                <div><small>{selectedBlueprint.category}</small><input aria-label="노드 이름" value={selectedNode.title} onChange={(event) => renameNode(selectedNode.id, event.target.value)} /></div>
              </section>
              <section className="pro-inspector-section">
                <header><strong>기본 설정</strong><small>노드에서 자주 바꾸는 항목</small></header>
                {selectedBlueprint.settings.filter((setting) => setting.direct).map((setting) => <label key={setting.id}>
                  <span>{setting.label}{setting.required && <b>필수</b>}</span>
                  {renderSettingControl(selectedNode, setting)}
                </label>)}
              </section>
              <section className="pro-inspector-section">
                <header><strong>고급 설정</strong><small>필요할 때만 조정</small></header>
                {selectedBlueprint.settings.filter((setting) => !setting.direct).length
                  ? selectedBlueprint.settings.filter((setting) => !setting.direct).map((setting) => <label key={setting.id}>
                    <span>{setting.label}</span>{renderSettingControl(selectedNode, setting)}
                  </label>)
                  : <p className="pro-inspector-empty">이 노드에는 별도 고급 설정이 없습니다.</p>}
              </section>
              <section className="pro-inspector-section pro-port-help">
                <header><strong>포트 설명</strong><small>색과 모양을 함께 확인</small></header>
                <div className="pro-port-direction-groups">
                  {([
                    { direction: '입력', ports: selectedBlueprint.inputs, icon: ArrowDownToLine },
                    { direction: '출력', ports: selectedBlueprint.outputs, icon: ArrowUpFromLine },
                  ] as const).map(({ direction, ports, icon: DirectionIcon }) => ports.length > 0 && <section
                    key={direction}
                    className={`pro-port-direction is-${direction === '입력' ? 'input' : 'output'}`}
                    role="group"
                    aria-label={`${direction} 포트`}
                  >
                    <header><DirectionIcon size={12} /><strong>{direction}</strong><small>{ports.length}</small></header>
                    {ports.map((port) => <span key={port.id}>
                      <i style={{ '--port-color': PORT_META[port.type].color } as CSSProperties} data-shape={PORT_META[port.type].shape} />
                      <b>{port.label}</b><small>{PORT_META[port.type].label}{port.optional ? ' · 선택' : ''}</small>
                    </span>)}
                  </section>)}
                </div>
              </section>
              <section className="pro-inspector-actions">
                <Button kind="ghost" icon={Trash2} onClick={() => requestDeleteNode(selectedNode.id)}>노드 삭제</Button>
              </section>
            </> : <div className="pro-inspector-empty-state"><MousePointer2 size={22} /><strong>노드를 선택하세요</strong><span>자주 쓰는 값은 노드에서, 전체 설정은 이 패널에서 편집합니다.</span></div>)}

            {inspectorTab === 'validation' && <div className="pro-validation-list">
              <header>
                <strong>{errors.length ? `미완성 · 오류 ${errors.length}` : '출시 가능'}</strong>
                <button
                  type="button"
                  className={`pro-validation-highlight-toggle${highlightedIssueId ? ' is-active' : ''}`}
                  aria-label="오류 경로 강조"
                  aria-pressed={Boolean(highlightedIssueId)}
                  disabled={!errors.length}
                  onClick={() => {
                    if (highlightedIssueId) setHighlightedIssueId(null);
                    else {
                      const issue = validationIssues.find((item) => item.severity === 'error' && item.nodeId);
                      if (issue) focusIssue(issue);
                    }
                  }}
                ><i aria-hidden="true" /><span>경로 강조</span></button>
              </header>
              {validationIssues.length ? validationIssues.map((issue) => <button type="button" key={issue.id} className={`is-${issue.severity}${highlightedIssueId === issue.id ? ' is-active' : ''}`} onClick={() => focusIssue(issue)}>
                <span>{issue.severity === 'error' ? <TriangleAlert size={15} /> : <ShieldCheck size={15} />}</span>
                <span><strong>{issue.title}</strong><small>{issue.detail}</small><em>{issue.resolution}</em></span>
                <ChevronRight size={14} />
              </button>) : <div className="pro-validation-empty"><Check size={22} /><strong>구조 검사를 통과했습니다</strong><span>검증은 수익성이나 실제 체결을 보장하지 않습니다.</span></div>}
            </div>}

            {inspectorTab === 'description' && <div className="pro-strategy-description">
              <p>현재 그래프 설정을 읽기 쉽게 정리한 설명입니다. 실행 결과를 예측하거나 보장하지 않습니다.</p>
              {describeStrategy(graph).map((item) => <dl key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></dl>)}
              <aside><TriangleAlert size={15} /><span>공매도 결과에는 실제 대주 가능 여부와 차입 비용이 반영되지 않습니다.</span></aside>
            </div>}
          </div>
        </div>
      </aside>
      {leftCollapsed && <button type="button" className="pro-panel-edge-handle is-panel-title-height is-left" style={{ top: panelReopenTop.left }} aria-label="노드 라이브러리 펼치기" onClick={() => setLeftCollapsed(false)}>
        <Boxes size={15} /><ChevronRight size={14} />
      </button>}
      {rightCollapsed && <button type="button" className="pro-panel-edge-handle is-panel-title-height is-right" style={{ top: panelReopenTop.right }} aria-label="설정 패널 펼치기" onClick={() => setRightCollapsed(false)}>
        <ChevronLeft size={14} /><Settings2 size={15} />
      </button>}
    </div>

    {nodeMove && <div
      ref={trashZoneRef}
      className={`editor-trash-zone is-pointer-trash${trashReady ? ' is-ready' : ''}`}
      role="region"
      aria-label={`${trashSubject} 삭제 영역`}
      data-testid="pro-trash-zone"
    >
      <span className="editor-trash-icon"><Trash2 size={18} aria-hidden="true" /></span>
      <span className="editor-trash-copy">
        <strong>{trashSubject} 버리기</strong>
        <small>여기에 놓으면 삭제됩니다</small>
      </span>
    </div>}

    {notice && <div className={`pro-editor-notice pro-editor-notice-v2 is-${notice.tone}`} role="alert">
      <span>{notice.tone === 'error' ? <TriangleAlert size={16} /> : <Check size={16} />}</span>
      <div><strong>{notice.title}</strong>{notice.detail && <small>{notice.detail}</small>}</div>
      <button type="button" aria-label="알림 닫기" onClick={() => setNotice(null)}><X size={14} /></button>
    </div>}

    {pendingDeleteId && <div className="pro-delete-dialog-backdrop" role="presentation">
      <section className="pro-delete-dialog" role="dialog" aria-modal="true" aria-label="연결된 노드 삭제 확인">
        <span><Trash2 size={18} /></span>
        <div><strong>연결된 노드를 삭제할까요?</strong><p>노드와 연결 {graph.links.filter((link) => link.from.nodeId === pendingDeleteId || link.to.nodeId === pendingDeleteId).length}개가 함께 삭제됩니다. 실행 취소로 되돌릴 수 있습니다.</p></div>
        <footer><Button onClick={() => setPendingDeleteId(null)}>취소</Button><Button kind="primary" onClick={() => deleteNode(pendingDeleteId)}>삭제</Button></footer>
      </section>
    </div>}
  </div></Localized>;
}
