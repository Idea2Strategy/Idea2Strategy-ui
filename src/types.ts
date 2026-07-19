export type Route = 'home' | 'strategy' | 'bots' | 'rooms';
export type Mode = 'basic' | 'pro';
export type BotState = 'running' | 'paused' | 'stopped' | 'attention' | 'ended';
export type BotTab = 'overview' | 'orders' | 'backtest' | 'activity';
export type RoomTab = 'browse' | 'joined' | 'mine' | 'create';
export type RoomStatus = '모집 중' | '진행 중' | '예정' | '모집 중단' | '종료';
export type CompetitionMetricKey =
  | 'cumulativeReturn'
  | 'maxDrawdown'
  | 'volatility'
  | 'sharpe'
  | 'winRate'
  | 'tradeCount';

export type BasicBlockKind =
  | 'asset'
  | 'price'
  | 'indicator'
  | 'condition'
  | 'exit'
  | 'portfolio'
  | 'risk'
  | 'order'
  | 'record';

export type PortType =
  | 'Universe'
  | 'Asset'
  | 'AssetPair'
  | 'PriceSeries'
  | 'VolumeSeries'
  | 'Scalar'
  | 'BooleanSignal'
  | 'ScoreVector'
  | 'WeightVector'
  | 'PositionState'
  | 'OrderIntent'
  | 'ApprovedOrder'
  | 'EventTrigger'
  | 'Metric';

export type PortDefinition = {
  id: string;
  label: string;
  type: PortType;
  timeframe?: '1m' | '5m' | '1d';
  optional?: boolean;
  observation?: boolean;
};

export type ParameterSchema = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'toggle';
  placeholder?: string;
  suffix?: string;
  required?: boolean;
  primary?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
};

export type BasicBlockDefinition = {
  id: BasicBlockKind;
  order: number;
  stage: string;
  title: string;
  description: string;
  color: string;
  input?: PortDefinition;
  output?: PortDefinition;
  parameters: ParameterSchema[];
};

export type StrategyNodeData = Record<string, unknown> & {
  blockId: string;
  label: string;
  stage: string;
  detail: string;
  description: string;
  color: string;
  icon: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  parameterSchema: ParameterSchema[];
  parameters: Record<string, string | number | boolean>;
  formula?: string;
  dataCapability?: string;
  locked?: boolean;
  lockReason?: string;
  disabled?: boolean;
  connectionHint?: PortType | null;
  connectionNodeId?: string | null;
  connectionNodeState?: 'origin' | 'compatible' | 'incompatible' | null;
  connectionCompatibleHandleIds?: string[];
  connectionTimeframe?: PortDefinition['timeframe'];
  connectionDirection?: 'source' | 'target' | null;
  connectionStage?: string | null;
  connectionObservation?: boolean;
  tutorialRole?: 'connection-source' | 'connection-target' | 'settings-target';
  onParameterChange?: (nodeId: string, key: string, value: string | number | boolean) => void;
};

export type GroupProxyPort = {
  id: string;
  direction: 'input' | 'output';
  port: PortDefinition;
  count: number;
  connections: string[];
};

export type GroupNodeData = Record<string, unknown> & {
  label: string;
  count: number;
  collapsed: boolean;
  expandedWidth: number;
  expandedHeight: number;
  proxyPorts?: GroupProxyPort[];
  onToggle: (id: string) => void;
  onSaveBlueprint: (id: string) => void;
  onUngroup: (id: string) => void;
};

export type Blueprint = {
  id: string;
  name: string;
  nodes: StrategyNodeData[];
  positions?: Array<{ x: number; y: number }>;
  edges?: Array<{
    sourceIndex: number;
    targetIndex: number;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    observation?: boolean;
  }>;
  createdAt?: string;
};

export type ValidationIssue = {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  solution: string;
  nodeId?: string;
};

export type StrategyEditorStatus = {
  errorCount: number;
  warningCount: number;
  infoCount: number;
  itemCount: number;
  isReady: boolean;
};

export type StrategySaveState = 'saving' | 'saved' | 'error';

export type StrategyTutorialAction =
  | 'basic-asset-placed'
  | 'basic-asset-configured'
  | 'basic-price-placed'
  | 'basic-price-configured'
  | 'pro-universe-placed'
  | 'pro-market-placed'
  | 'pro-connected'
  | 'pro-configured';

export type TutorialExitRequest = {
  sessionId: number;
  action: 'restore' | 'keep';
};

export type Bot = {
  id: number;
  name: string;
  state: BotState;
  strategy: string;
  version: string;
  symbols: string[];
  openOrders: number;
  positionCount: number;
  nextCheck: string;
  issue?: string;
  activity: string[];
  strategyId?: string;
  initialCapital?: string;
  schedule?: string;
  orderPolicy?: string;
  notifyIssues?: boolean;
  notifyOrders?: boolean;
  notifyDailySummary?: boolean;
};

export type Room = {
  id: number;
  name: string;
  owner: string;
  status: RoomStatus;
  period: string;
  members: number;
  joined?: boolean;
  mine?: boolean;
  official?: boolean;
  recruitmentStart?: string;
  recruitmentEnd?: string;
  competitionStart?: string;
  competitionEnd?: string;
  submissionLimit?: number;
  initialCapital?: string;
  universeRule?: string;
  benchmark?: string;
  executionRule?: string;
  costRule?: string;
};

export type CompetitionMetrics = Record<CompetitionMetricKey, string>;

export type RoomSubmissionStatus = '제출 완료' | '변경 잠금' | '제출 대기' | '철회';

export type RoomSubmission = {
  id: string;
  roomId: number;
  participantName: string;
  botId?: number;
  botName?: string;
  strategyVersion?: string;
  status: RoomSubmissionStatus;
  submittedAt?: string;
  isMine?: boolean;
  metrics?: CompetitionMetrics;
};

export type RoomOperation = {
  id: string;
  roomId: number;
  createdAt: string;
  actor: string;
  title: string;
  detail: string;
};
