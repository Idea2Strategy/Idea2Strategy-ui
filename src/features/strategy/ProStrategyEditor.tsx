import {
  Background,
  ConnectionLineType,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnNodeDrag,
  type NodeMouseHandler,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Activity,
  AlertTriangle,
  AlignHorizontalDistributeCenter,
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Clock3,
  Copy,
  CopyPlus,
  Database,
  Eye,
  EyeOff,
  FolderOpen,
  Grid3X3,
  Layers3,
  LineChart,
  ListTree,
  LockKeyhole,
  MousePointer2,
  PanelBottom,
  Pencil,
  PieChart,
  Plus,
  Redo2,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Sigma,
  Trash2,
  Undo2,
  Ungroup,
  X,
  Zap,
} from 'lucide-react';
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { portShapeLabel, proLibrary } from '../../data';
import {
  loadBasicEditorSnapshot,
  proEditorStorageKey,
} from '../../strategyStorage';
import type {
  BasicBlockKind,
  Blueprint,
  GroupNodeData,
  GroupProxyPort,
  PortDefinition,
  PortType,
  StrategyNodeData,
  StrategyEditorStatus,
  StrategySaveState,
  StrategyTutorialAction,
  TutorialExitRequest,
  ValidationIssue,
} from '../../types';
import {
  ParameterField,
  PortLegend,
  PortSwatch,
  portTooltip,
  portTypeClass,
} from './StrategyControls';

type FlowNode = Node<StrategyNodeData | GroupNodeData>;
type ConnectionState = {
  nodeId: string;
  port: PortDefinition;
  handleType: 'source' | 'target';
  stage: string;
} | null;
type InspectorTab = 'settings' | 'ports' | 'validation';
type PreviewTab = 'market' | 'signal' | 'validation' | 'quality';
type HistorySnapshot = { nodes: FlowNode[]; edges: Edge[] };
type ProEditorSnapshot = {
  nodes: FlowNode[];
  edges: Edge[];
  blueprints: Blueprint[];
};
type NodeDeleteDragState = {
  nodeIds: string[];
  overZone: boolean;
};

const COLLAPSED_GROUP_MAX_WIDTH = 336;
const COLLAPSED_GROUP_MIN_HEIGHT = 104;
const COLLAPSED_GROUP_PORT_START = 76;
const COLLAPSED_GROUP_PORT_GAP = 34;

const stageOrder: Record<string, number> = {
  유니버스: 0,
  '시장 데이터': 1,
  '특징·지표': 2,
  '조건·신호': 3,
  '일정·제어': 3,
  포트폴리오: 4,
  위험관리: 5,
  '주문 실행': 6,
  '관찰·기록': 7,
};

function cloneNodeData(data: StrategyNodeData): StrategyNodeData {
  return {
    ...data,
    inputs: data.inputs.map((port) => ({ ...port })),
    outputs: data.outputs.map((port) => ({ ...port })),
    parameterSchema: data.parameterSchema.map((schema) => ({
      ...schema,
      options: schema.options?.map((option) => ({ ...option })),
    })),
    parameters: { ...data.parameters },
    connectionHint: null,
    connectionTimeframe: undefined,
    connectionDirection: null,
    connectionStage: null,
    connectionObservation: false,
    tutorialRole: undefined,
    onParameterChange: undefined,
  };
}

function cloneFlowNodes(nodes: FlowNode[]) {
  return nodes.map((node) => ({
    ...node,
    selected: false,
    position: { ...node.position },
    style: node.style ? { ...node.style } : undefined,
    data: node.type === 'strategy'
      ? cloneNodeData(node.data as StrategyNodeData)
      : { ...(node.data as GroupNodeData) },
  }));
}

function cloneEdges(edges: Edge[]) {
  return edges.map((edge) => ({
    ...edge,
    style: edge.style ? { ...edge.style } : undefined,
    markerEnd: edge.markerEnd && typeof edge.markerEnd === 'object' ? { ...edge.markerEnd } : edge.markerEnd,
  }));
}

function libraryNode(blockId: string, id: string, x: number, y: number): FlowNode {
  const definition = proLibrary.find((item) => item.blockId === blockId);
  if (!definition) throw new Error(`Missing strategy block: ${blockId}`);
  return {
    id,
    type: 'strategy',
    position: { x, y },
    data: cloneNodeData(definition),
  };
}

const initialNodes: FlowNode[] = [
  libraryNode('direct-universe', 'node-universe', 70, 110),
  libraryNode('price-bars', 'node-price', 370, 110),
  libraryNode('moving-average', 'node-indicator', 670, 110),
  libraryNode('condition', 'node-condition', 970, 110),
  libraryNode('target-weight', 'node-weight', 1270, 110),
  libraryNode('risk-guard', 'node-risk', 1570, 110),
  libraryNode('paper-order', 'node-order', 1870, 110),
  libraryNode('decision-record', 'node-record', 1570, 410),
];

function executionEdge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): Edge {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#83928e' },
    style: { stroke: '#83928e', strokeWidth: 1.6 },
  };
}

const initialEdges: Edge[] = [
  executionEdge('edge-universe-price', 'node-universe', 'universe', 'node-price', 'universe'),
  executionEdge('edge-price-indicator', 'node-price', 'price', 'node-indicator', 'price'),
  executionEdge('edge-indicator-condition', 'node-indicator', 'scalar', 'node-condition', 'scalar'),
  executionEdge('edge-condition-weight', 'node-condition', 'signal', 'node-weight', 'signal'),
  executionEdge('edge-weight-risk', 'node-weight', 'weights', 'node-risk', 'weights'),
  executionEdge('edge-risk-order', 'node-risk', 'approved', 'node-order', 'approved'),
];

function loadProEditorSnapshot(strategyId: string): ProEditorSnapshot | null {
  try {
    const stored = window.localStorage.getItem(proEditorStorageKey(strategyId));
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<ProEditorSnapshot>;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges) || !Array.isArray(parsed.blueprints)) {
      return null;
    }
    return {
      nodes: cloneFlowNodes(parsed.nodes),
      edges: cloneEdges(parsed.edges),
      blueprints: parsed.blueprints.map((blueprint) => ({
        ...blueprint,
        nodes: blueprint.nodes.map(cloneNodeData),
        positions: blueprint.positions?.map((position) => ({ ...position })),
        edges: blueprint.edges?.map((edge) => ({ ...edge })),
      })),
    };
  } catch {
    return null;
  }
}

function convertedProSnapshot(strategyId: string): ProEditorSnapshot {
  const basic = loadBasicEditorSnapshot(strategyId);
  if (!basic) {
    return {
      nodes: cloneFlowNodes(initialNodes),
      edges: cloneEdges(initialEdges),
      blueprints: [],
    };
  }

  const blockMap: Partial<Record<BasicBlockKind, string>> = {
    asset: 'direct-universe',
    price: 'price-bars',
    indicator: 'moving-average',
    condition: 'condition',
    portfolio: 'target-weight',
    risk: 'risk-guard',
    order: 'paper-order',
    record: 'decision-record',
  };
  const convertedNodes = basic.blockIds.flatMap((basicId, index) => {
    const blockId = blockMap[basicId];
    if (!blockId) return [];
    const node = libraryNode(blockId, `converted-${basicId}`, 80 + index * 300, basicId === 'record' ? 390 : 120);
    const data = node.data as StrategyNodeData;
    const sourceValues = basic.values[basicId] ?? {};
    const parameters = { ...data.parameters };
    data.parameterSchema.forEach((schema) => {
      if (sourceValues[schema.key] !== undefined) parameters[schema.key] = sourceValues[schema.key];
    });
    if (basicId === 'indicator' && sourceValues.method === 'roc') parameters.method = '';
    if (basicId === 'record') {
      parameters.scope = sourceValues.record === 'changes' ? 'changes' : 'all';
    }
    return [{
      ...node,
      data: { ...data, parameters },
    }];
  });
  const nodeIds = new Set(convertedNodes.map((node) => node.id));
  const edgeDefinitions = [
    ['converted-asset', 'universe', 'converted-price', 'universe'],
    ['converted-price', 'price', 'converted-indicator', 'price'],
    ['converted-indicator', 'scalar', 'converted-condition', 'scalar'],
    ['converted-condition', 'signal', 'converted-portfolio', 'signal'],
    ['converted-portfolio', 'weights', 'converted-risk', 'weights'],
    ['converted-risk', 'approved', 'converted-order', 'approved'],
  ] as const;
  const convertedEdges = edgeDefinitions.flatMap(([source, sourceHandle, target, targetHandle], index) => (
    nodeIds.has(source) && nodeIds.has(target)
      ? [executionEdge(`converted-edge-${index}`, source, sourceHandle, target, targetHandle)]
      : []
  ));

  return {
    nodes: convertedNodes,
    edges: convertedEdges,
    blueprints: [],
  };
}

function isStrategyNode(node: FlowNode | undefined): node is Node<StrategyNodeData> {
  return Boolean(node && node.type === 'strategy');
}

function isMissing(value: string | number | boolean | undefined) {
  return value === '' || value === undefined || value === null;
}

function effectivePort(data: StrategyNodeData, port: PortDefinition): PortDefinition {
  if (data.blockId === 'price-bars' && (port.type === 'PriceSeries' || port.type === 'VolumeSeries')) {
    const timeframe = data.parameters.timeframe;
    return {
      ...port,
      timeframe: timeframe === '1m' || timeframe === '5m' || timeframe === '1d'
        ? timeframe
        : port.timeframe,
    };
  }
  if (data.blockId === 'resample' && port.id === 'price-out') {
    const timeframe = data.parameters.target;
    return {
      ...port,
      timeframe: timeframe === '1m' || timeframe === '5m' || timeframe === '1d'
        ? timeframe
        : port.timeframe,
    };
  }
  return { ...port };
}

function findPort(
  data: StrategyNodeData,
  handleId: string | null | undefined,
  handleType: 'source' | 'target',
) {
  const ports = handleType === 'source' ? data.outputs : data.inputs;
  const port = ports.find((item) => item.id === handleId);
  return port ? effectivePort(data, port) : undefined;
}

function portsMatch(source: PortDefinition, target: PortDefinition) {
  if (source.type !== target.type) return false;
  if (source.timeframe && target.timeframe && source.timeframe !== target.timeframe) return false;
  if (source.observation && !target.observation) return false;
  return true;
}

function createsCycle(sourceId: string, targetId: string, edges: Edge[]) {
  const links = new Map<string, string[]>();
  edges.forEach((edge) => {
    links.set(edge.source, [...(links.get(edge.source) ?? []), edge.target]);
  });
  const queue = [targetId];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (current === sourceId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(links.get(current) ?? []));
  }
  return false;
}

function checkConnection(
  connection: Connection,
  nodes: FlowNode[],
  edges: Edge[],
): { valid: true; sourcePort: PortDefinition; targetPort: PortDefinition } | { valid: false; message: string } {
  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  if (!isStrategyNode(sourceNode) || !isStrategyNode(targetNode)) {
    return {
      valid: false,
      message: '문제: 그룹이나 빈 공간에는 연결할 수 없습니다. 영향: 실행 흐름이 정의되지 않습니다. 해결: 노드의 타입 포트끼리 연결하세요.',
    };
  }
  if (sourceNode.id === targetNode.id) {
    return {
      valid: false,
      message: '문제: 같은 노드의 출력과 입력을 직접 연결했습니다. 영향: 암묵적 순환이 생깁니다. 해결: 이전 값처럼 상태가 명시된 블록을 사용하세요.',
    };
  }
  if (sourceNode.data.disabled || targetNode.data.disabled) {
    return {
      valid: false,
      message: '문제: 비활성화된 노드가 포함되어 있습니다. 영향: 실행 흐름에서 이 연결을 사용할 수 없습니다. 해결: 노드를 다시 활성화하거나 다른 노드에 연결하세요.',
    };
  }
  const sourcePort = findPort(sourceNode.data, connection.sourceHandle, 'source');
  const targetPort = findPort(targetNode.data, connection.targetHandle, 'target');
  if (!sourcePort || !targetPort) {
    return {
      valid: false,
      message: '문제: 연결 시작점 또는 도착점의 타입을 확인할 수 없습니다. 영향: 구조 검사를 진행할 수 없습니다. 해결: 표시된 포트의 중심에서 다시 연결하세요.',
    };
  }
  if (sourcePort.type !== targetPort.type) {
    return {
      valid: false,
      message: `문제: ${sourcePort.type} ${portShapeLabel[sourcePort.type]} 출력은 ${targetPort.type} ${portShapeLabel[targetPort.type]} 입력에 맞지 않습니다. 영향: 데이터 의미가 달라 실행할 수 없습니다. 해결: 두 포트의 모양과 타입 레이블이 같은 중간 블록을 사용하세요.`,
    };
  }
  if (sourcePort.timeframe && targetPort.timeframe && sourcePort.timeframe !== targetPort.timeframe) {
    return {
      valid: false,
      message: `문제: ${sourcePort.type}<${sourcePort.timeframe}>을 ${targetPort.type}<${targetPort.timeframe}>에 직접 연결했습니다. 영향: 서로 다른 시각의 값이 섞입니다. 해결: 리샘플 블록으로 시간축과 타임존을 명시하세요.`,
    };
  }
  if (sourcePort.observation && !targetPort.observation) {
    return {
      valid: false,
      message: '문제: 관찰 전용 출력이 실행 입력으로 향했습니다. 영향: 기록 결과가 주문 판단에 역으로 개입합니다. 해결: 관찰 포트는 점선 관찰 입력에만 연결하세요.',
    };
  }
  if ((stageOrder[sourceNode.data.stage] ?? 0) > (stageOrder[targetNode.data.stage] ?? 0)) {
    return {
      valid: false,
      message: `문제: ${sourceNode.data.stage} 단계에서 ${targetNode.data.stage} 단계로 역방향 연결했습니다. 영향: 미래 결과가 이전 판단에 사용됩니다. 해결: 유니버스에서 기록 방향으로 연결하세요.`,
    };
  }
  if (createsCycle(sourceNode.id, targetNode.id, edges)) {
    return {
      valid: false,
      message: '문제: 이 연결은 그래프 순환을 만듭니다. 영향: 계산 종료 시점을 정할 수 없습니다. 해결: 이전 값·쿨다운·롤링 윈도우처럼 상태가 명시된 블록을 사용하세요.',
    };
  }
  const occupied = edges.some(
    (edge) => edge.target === targetNode.id && edge.targetHandle === targetPort.id,
  );
  if (occupied) {
    return {
      valid: false,
      message: `문제: ‘${targetPort.label}’ 입력은 이미 연결되어 있습니다. 영향: 어떤 값을 사용할지 모호합니다. 해결: 기존 연결을 지우거나 명시적인 결합 블록을 추가하세요.`,
    };
  }
  return { valid: true, sourcePort, targetPort };
}

function buildGraphIssues(nodes: FlowNode[], edges: Edge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const strategyNodes = nodes.filter(isStrategyNode);

  if (!strategyNodes.length) {
    issues.push({
      id: 'empty-strategy',
      severity: 'error',
      title: '전략 그래프가 비어 있습니다.',
      message: '검사할 실행 흐름이 없어 전략을 완료할 수 없습니다.',
      solution: '왼쪽 라이브러리에서 시작 노드를 끌어 놓고 필요한 흐름을 직접 구성하세요.',
    });
    return issues;
  }

  if (!strategyNodes.some(
    (node) => node.data.stage === '주문 실행' && !node.data.disabled,
  )) {
    issues.push({
      id: 'missing-order-flow',
      severity: 'error',
      title: '주문까지 이어지는 실행 흐름이 없습니다.',
      message: '일부 계산 노드만으로는 전략을 완료하거나 봇을 만들 수 없습니다.',
      solution: '조건, 목표 비중과 위험 검사를 거쳐 주문 실행 노드까지 직접 연결하세요.',
    });
  }

  strategyNodes.forEach((node) => {
    const data = node.data;
    if (data.locked) {
      issues.push({
        id: `${node.id}-locked`,
        severity: 'error',
        nodeId: node.id,
        title: `${data.label}: 필요한 데이터 능력이 없습니다.`,
        message: data.lockReason ?? '현재 환경에서 이 블록을 실행할 수 없습니다.',
        solution: '지원 데이터가 연결될 때까지 잠긴 블록을 사용하지 마세요.',
      });
    }
    if (data.disabled) {
      issues.push({
        id: `${node.id}-disabled`,
        severity: 'info',
        nodeId: node.id,
        title: `${data.label} 노드가 비활성화되어 있습니다.`,
        message: '연결은 보존되지만 검사와 실행 흐름에서는 제외됩니다.',
        solution: '의도한 상태인지 확인하고 필요하면 다시 활성화하세요.',
      });
      return;
    }
    data.parameterSchema.forEach((schema) => {
      if (schema.required && isMissing(data.parameters[schema.key])) {
        issues.push({
          id: `${node.id}-${schema.key}`,
          severity: 'error',
          nodeId: node.id,
          title: `${data.label}: ${schema.label} 입력이 필요합니다.`,
          message: '필수값이 비어 있어 전략을 완료할 수 없습니다.',
          solution: '추천값 없이 사용 목적에 맞는 값을 직접 입력하거나 선택하세요.',
        });
      }
    });
    data.inputs.filter((port) => !port.optional).forEach((port) => {
      const connected = edges.some(
        (edge) => edge.target === node.id && edge.targetHandle === port.id,
      );
      if (!connected) {
        issues.push({
          id: `${node.id}-input-${port.id}`,
          severity: 'error',
          nodeId: node.id,
          title: `${data.label}: ${port.label} 입력이 연결되지 않았습니다.`,
          message: `${port.type} ${portShapeLabel[port.type]} 데이터가 없어 이 노드를 계산할 수 없습니다.`,
          solution: `왼쪽 단계에서 같은 ${portTypeClass(port.type).replace('port-shape--', '')} 타입 포트를 연결하세요.`,
        });
      }
    });
    if (data.blockId === 'moving-average') {
      const period = Number(data.parameters.period);
      if (!isMissing(data.parameters.period) && period > 60) {
        issues.push({
          id: `${node.id}-warmup`,
          severity: 'warning',
          nodeId: node.id,
          title: '현재 미리보기 구간보다 계산 기간이 깁니다.',
          message: '간편 미리보기에는 값이 늦게 나타날 수 있고 봇은 데이터가 쌓일 때까지 워밍업 상태가 됩니다.',
          solution: '실제 데이터 보유 기간을 확인하거나 충분한 워밍업 기간을 확보하세요.',
        });
      }
    }
    if (data.blockId === 'target-weight') {
      const allocation = Number(data.parameters.allocation);
      const cash = Number(data.parameters.cash);
      if (
        !isMissing(data.parameters.allocation)
        && !isMissing(data.parameters.cash)
        && allocation + cash > 100
      ) {
        issues.push({
          id: `${node.id}-cash-conflict`,
          severity: 'error',
          nodeId: node.id,
          title: '목표 비중과 최소 현금을 동시에 만족할 수 없습니다.',
          message: `총 비중 ${allocation}%와 최소 현금 ${cash}%의 합이 100%를 넘습니다.`,
          solution: '두 값의 합이 100% 이하가 되도록 사용자가 직접 조정하세요.',
        });
      }
    }
  });

  edges.forEach((edge) => {
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);
    if (!isStrategyNode(sourceNode) || !isStrategyNode(targetNode)) return;
    const sourcePort = findPort(sourceNode.data, edge.sourceHandle, 'source');
    const targetPort = findPort(targetNode.data, edge.targetHandle, 'target');
    if (!sourcePort || !targetPort) {
      issues.push({
        id: `${edge.id}-missing-port`,
        severity: 'error',
        title: '연결의 포트 정보를 찾을 수 없습니다.',
        message: '블록 정의가 변경되어 기존 연결이 유효하지 않습니다.',
        solution: '연결선을 지우고 표시된 포트로 다시 연결하세요.',
      });
      return;
    }
    if (!portsMatch(sourcePort, targetPort)) {
      issues.push({
        id: `${edge.id}-type`,
        severity: 'error',
        nodeId: targetNode.id,
        title: '연결 타입 또는 시간축이 일치하지 않습니다.',
        message: `${sourcePort.type}${sourcePort.timeframe ? `<${sourcePort.timeframe}>` : ''} → ${targetPort.type}${targetPort.timeframe ? `<${targetPort.timeframe}>` : ''} 연결입니다.`,
        solution: '동일한 모양·타입을 사용하고 시간축이 다르면 리샘플 블록을 추가하세요.',
      });
    }
    if (sourceNode.data.disabled || targetNode.data.disabled) {
      issues.push({
        id: `${edge.id}-disabled`,
        severity: 'warning',
        nodeId: sourceNode.data.disabled ? sourceNode.id : targetNode.id,
        title: '비활성 노드에 연결된 흐름이 있습니다.',
        message: '현재 실행에서는 이 연결이 무시됩니다.',
        solution: '노드를 활성화하거나 사용하지 않는 연결을 정리하세요.',
      });
    }
  });

  const weightNode = strategyNodes.find(
    (node) => node.data.blockId === 'target-weight' && !node.data.disabled,
  );
  const riskNode = strategyNodes.find(
    (node) => node.data.blockId === 'risk-guard' && !node.data.disabled,
  );
  if (weightNode && riskNode) {
    const allocation = Number(weightNode.data.parameters.allocation);
    const maxWeight = Number(riskNode.data.parameters.maxWeight);
    if (
      !isMissing(weightNode.data.parameters.allocation)
      && !isMissing(riskNode.data.parameters.maxWeight)
      && maxWeight < allocation
    ) {
      issues.push({
        id: 'risk-precedence',
        severity: 'info',
        nodeId: riskNode.id,
        title: '종목당 최대 제한이 목표 비중보다 우선합니다.',
        message: `입력한 목표 비중 ${allocation}%는 종목당 최대 ${maxWeight}%에 맞춰 축소될 수 있습니다.`,
        solution: '의도한 제한이라면 유지하고 주문 미리보기에서 축소 결과를 확인하세요.',
      });
    }
  }
  if (!strategyNodes.some((node) => node.data.stage === '관찰·기록' && !node.data.disabled)) {
    issues.push({
      id: 'missing-observer',
      severity: 'info',
      title: '판단 근거 기록 노드가 없습니다.',
      message: '실행에는 영향이 없지만 이후 주문이 만들어진 이유를 추적하기 어렵습니다.',
      solution: '필요하면 관찰·기록 카테고리의 결정 기록 노드를 추가하세요.',
    });
  }
  return issues;
}

function edgeAppearance(observation: boolean) {
  return {
    markerEnd: { type: MarkerType.ArrowClosed, color: observation ? '#0E7490' : '#83928e' },
    style: {
      stroke: observation ? '#0E7490' : '#83928e',
      strokeWidth: 1.6,
      strokeDasharray: observation ? '6 5' : undefined,
    },
    animated: observation,
  };
}

function groupProxyHandleId(
  direction: GroupProxyPort['direction'],
  port: PortDefinition,
) {
  return [
    'group-proxy',
    direction,
    port.type,
    port.timeframe ?? 'any',
    port.observation ? 'observation' : 'execution',
  ].join('-');
}

function pointerClientPosition(event: MouseEvent | TouchEvent) {
  if ('touches' in event) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return { x: event.clientX, y: event.clientY };
}

function pointInsideElement(
  point: { x: number; y: number } | null,
  element: HTMLElement | null,
) {
  if (!point || !element) return false;
  const rect = element.getBoundingClientRect();
  return (
    point.x >= rect.left
    && point.x <= rect.right
    && point.y >= rect.top
    && point.y <= rect.bottom
  );
}

function buildCollapsedGroupView(nodes: FlowNode[], edges: Edge[]) {
  const collapsedGroupIds = new Set(
    nodes
      .filter((node) => node.type === 'group' && (node.data as GroupNodeData).collapsed)
      .map((node) => node.id),
  );
  const collapsedGroupByChild = new Map<string, string>();
  nodes.forEach((node) => {
    if (node.parentId && collapsedGroupIds.has(node.parentId)) {
      collapsedGroupByChild.set(node.id, node.parentId);
    }
  });
  const proxyPortsByGroup = new Map<string, Map<string, GroupProxyPort>>();

  const addProxyPort = (
    groupId: string,
    direction: GroupProxyPort['direction'],
    port: PortDefinition,
    connection: string,
  ) => {
    const ports = proxyPortsByGroup.get(groupId) ?? new Map<string, GroupProxyPort>();
    proxyPortsByGroup.set(groupId, ports);
    const id = groupProxyHandleId(direction, port);
    const current = ports.get(id);
    if (current) {
      current.count += 1;
      if (!current.connections.includes(connection)) current.connections.push(connection);
      return id;
    }
    ports.set(id, {
      id,
      direction,
      port: { ...port },
      count: 1,
      connections: [connection],
    });
    return id;
  };

  const renderedEdges = edges.map((edge) => {
    const sourceGroupId = collapsedGroupByChild.get(edge.source);
    const targetGroupId = collapsedGroupByChild.get(edge.target);
    if (sourceGroupId && targetGroupId && sourceGroupId === targetGroupId) {
      return { ...edge, hidden: true };
    }
    if (!sourceGroupId && !targetGroupId) return edge;
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);
    if (!isStrategyNode(sourceNode) || !isStrategyNode(targetNode)) return edge;
    let source = edge.source;
    let sourceHandle = edge.sourceHandle;
    let target = edge.target;
    let targetHandle = edge.targetHandle;

    if (sourceGroupId) {
      const sourcePort = findPort(sourceNode.data, edge.sourceHandle, 'source');
      if (!sourcePort) return { ...edge, hidden: true };
      source = sourceGroupId;
      sourceHandle = addProxyPort(
        sourceGroupId,
        'output',
        sourcePort,
        `${sourceNode.data.label} → ${targetNode.data.label}`,
      );
    }
    if (targetGroupId) {
      const targetPort = findPort(targetNode.data, edge.targetHandle, 'target');
      if (!targetPort) return { ...edge, hidden: true };
      target = targetGroupId;
      targetHandle = addProxyPort(
        targetGroupId,
        'input',
        targetPort,
        `${sourceNode.data.label} → ${targetNode.data.label}`,
      );
    }

    return {
      ...edge,
      source,
      sourceHandle,
      target,
      targetHandle,
      hidden: false,
      className: `${edge.className ?? ''} is-group-proxy-edge`.trim(),
    };
  });

  const proxyPortLists = new Map(
    Array.from(proxyPortsByGroup.entries()).map(([groupId, ports]) => [
      groupId,
      Array.from(ports.values()),
    ]),
  );
  const signature = Array.from(proxyPortLists.entries())
    .map(([groupId, ports]) => `${groupId}:${ports.map((port) => `${port.id}:${port.count}`).join(',')}`)
    .join('|');
  return { renderedEdges, proxyPortLists, collapsedGroupIds, signature };
}

export function ProStrategyEditor({
  resetRequest = 0,
  validationRequest = 0,
  tutorialStep = 0,
  tutorialSessionId = 0,
  tutorialPracticeActive = false,
  tutorialStartsFromBlank = false,
  tutorialExitRequest,
  onTutorialAction,
  onTutorialSessionReady,
  onStatusChange,
  strategyId,
  convertFromBasic = false,
  saveRequest = 0,
  onSaveStateChange,
  onSaved,
}: {
  resetRequest?: number;
  validationRequest?: number;
  tutorialStep?: number;
  tutorialSessionId?: number;
  tutorialPracticeActive?: boolean;
  tutorialStartsFromBlank?: boolean;
  tutorialExitRequest?: TutorialExitRequest | null;
  onTutorialAction?: (action: StrategyTutorialAction) => void;
  onTutorialSessionReady?: (sessionId: number, wasBlank: boolean) => void;
  onStatusChange?: (status: StrategyEditorStatus) => void;
  strategyId: string;
  convertFromBasic?: boolean;
  saveRequest?: number;
  onSaveStateChange?: (state: StrategySaveState) => void;
  onSaved?: () => void;
}) {
  return (
    <StrategyEditorBoundary>
      <ReactFlowProvider>
        <ProEditorInner
          resetRequest={resetRequest}
          validationRequest={validationRequest}
          tutorialStep={tutorialStep}
          tutorialSessionId={tutorialSessionId}
          tutorialPracticeActive={tutorialPracticeActive}
          tutorialStartsFromBlank={tutorialStartsFromBlank}
          tutorialExitRequest={tutorialExitRequest}
          onTutorialAction={onTutorialAction}
          onTutorialSessionReady={onTutorialSessionReady}
          onStatusChange={onStatusChange}
          strategyId={strategyId}
          convertFromBasic={convertFromBasic}
          saveRequest={saveRequest}
          onSaveStateChange={onSaveStateChange}
          onSaved={onSaved}
        />
      </ReactFlowProvider>
    </StrategyEditorBoundary>
  );
}

class StrategyEditorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Pro strategy editor failed', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="strategy-editor-fallback">
          <CircleAlert size={28} />
          <h2>Pro 편집기를 표시하지 못했습니다</h2>
          <p>현재 화면의 편집 세션을 복구하지 못했습니다. 화면을 다시 불러오거나 Basic 모드로 전환해 주세요.</p>
          <button onClick={() => window.location.reload()}>화면 다시 불러오기</button>
          <small>{this.state.error}</small>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProEditorInner({
  resetRequest,
  validationRequest,
  tutorialStep,
  tutorialSessionId,
  tutorialPracticeActive,
  tutorialStartsFromBlank,
  tutorialExitRequest,
  onTutorialAction,
  onTutorialSessionReady,
  onStatusChange,
  strategyId,
  convertFromBasic,
  saveRequest,
  onSaveStateChange,
  onSaved,
}: {
  resetRequest: number;
  validationRequest: number;
  tutorialStep: number;
  tutorialSessionId: number;
  tutorialPracticeActive: boolean;
  tutorialStartsFromBlank: boolean;
  tutorialExitRequest?: TutorialExitRequest | null;
  onTutorialAction?: (action: StrategyTutorialAction) => void;
  onTutorialSessionReady?: (sessionId: number, wasBlank: boolean) => void;
  onStatusChange?: (status: StrategyEditorStatus) => void;
  strategyId: string;
  convertFromBasic: boolean;
  saveRequest: number;
  onSaveStateChange?: (state: StrategySaveState) => void;
  onSaved?: () => void;
}) {
  const [initialSnapshot] = useState<ProEditorSnapshot>(() => (
    convertFromBasic
      ? convertedProSnapshot(strategyId)
      : loadProEditorSnapshot(strategyId) ?? {
        nodes: cloneFlowNodes(initialNodes),
        edges: cloneEdges(initialEdges),
        blueprints: [],
      }
  ));
  const [nodes, setNodes] = useState<FlowNode[]>(() => cloneFlowNodes(initialSnapshot.nodes));
  const [edges, setEdges] = useState<Edge[]>(() => cloneEdges(initialSnapshot.edges));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>(() => initialSnapshot.blueprints);
  const [showBlueprints, setShowBlueprints] = useState(false);
  const [blueprintQuery, setBlueprintQuery] = useState('');
  const [previewBlueprintId, setPreviewBlueprintId] = useState<string | null>(null);
  const [editingBlueprintId, setEditingBlueprintId] = useState<string | null>(null);
  const [blueprintDraftName, setBlueprintDraftName] = useState('');
  const [pendingBlueprintDelete, setPendingBlueprintDelete] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    convertFromBasic
      ? 'Basic 구조를 Pro 초안으로 변환했습니다. 종료 조건과 Pro 전용 필수값을 다시 확인하세요.'
      : null,
  );
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('전체');
  const [activeConnection, setActiveConnection] = useState<ConnectionState>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('settings');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('market');
  const [historyTick, setHistoryTick] = useState(0);
  const [nodeDeleteDrag, setNodeDeleteDrag] = useState<NodeDeleteDragState | null>(null);
  const [deleteUndoAvailable, setDeleteUndoAvailable] = useState(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const deleteZoneRef = useRef<HTMLDivElement | null>(null);
  const draggedNodeIdsRef = useRef<string[]>([]);
  const dragStartSnapshotRef = useRef<HistorySnapshot | null>(null);
  const historyRef = useRef<{ past: HistorySnapshot[]; future: HistorySnapshot[] }>({
    past: [],
    future: [],
  });
  const lastResetRequest = useRef(resetRequest);
  const lastValidationRequest = useRef(validationRequest);
  const lastTutorialSession = useRef(0);
  const lastTutorialExitSession = useRef(0);
  const tutorialBackup = useRef<HistorySnapshot | null>(null);
  const tutorialNodeIds = useRef<{ universe?: string; market?: string }>({});
  const suppressNextSave = useRef(false);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    if (
      !tutorialPracticeActive
      || tutorialSessionId <= 0
      || lastTutorialSession.current === tutorialSessionId
    ) return;
    lastTutorialSession.current = tutorialSessionId;
    const backup: HistorySnapshot = tutorialStartsFromBlank
      ? { nodes: [], edges: [] }
      : { nodes: cloneFlowNodes(nodes), edges: cloneEdges(edges) };
    tutorialBackup.current = backup;
    tutorialNodeIds.current = {};
    onTutorialSessionReady?.(
      tutorialSessionId,
      backup.nodes.filter((node) => node.type === 'strategy').length === 0,
    );
    setNodes([]);
    setEdges([]);
    nodesRef.current = [];
    edgesRef.current = [];
    setSelectedIds([]);
    setQuery('');
    setCategory('전체');
    setActiveConnection(null);
    setInspectorTab('settings');
    historyRef.current = { past: [], future: [] };
    setHistoryTick((value) => value + 1);
    setMessage('튜토리얼 연습 공간입니다. 종료할 때 기존 Pro 그래프를 복원합니다.');
  }, [
    edges,
    nodes,
    onTutorialSessionReady,
    tutorialPracticeActive,
    tutorialSessionId,
    tutorialStartsFromBlank,
  ]);

  useEffect(() => {
    if (
      !tutorialExitRequest
      || tutorialExitRequest.sessionId !== tutorialSessionId
      || lastTutorialExitSession.current === tutorialExitRequest.sessionId
    ) return;
    lastTutorialExitSession.current = tutorialExitRequest.sessionId;
    if (tutorialExitRequest.action === 'restore' && tutorialBackup.current) {
      const restoredNodes = cloneFlowNodes(tutorialBackup.current.nodes);
      const restoredEdges = cloneEdges(tutorialBackup.current.edges);
      suppressNextSave.current = true;
      setNodes(restoredNodes);
      setEdges(restoredEdges);
      nodesRef.current = restoredNodes;
      edgesRef.current = restoredEdges;
      setSelectedIds([]);
      setMessage(
        restoredNodes.some((node) => node.type === 'strategy')
          ? '튜토리얼 전의 Pro 그래프를 복원했습니다.'
          : '튜토리얼 전의 빈 Pro 편집기로 돌아왔습니다.',
      );
    } else {
      setMessage('튜토리얼 연습 내용을 현재 Pro 전략에 유지했습니다.');
    }
    tutorialBackup.current = null;
    tutorialNodeIds.current = {};
  }, [tutorialExitRequest, tutorialSessionId]);

  useEffect(() => {
    if (tutorialPracticeActive) {
      onSaveStateChange?.('saved');
      return;
    }
    if (suppressNextSave.current) {
      suppressNextSave.current = false;
      return;
    }
    onSaveStateChange?.('saving');
    const saveTimer = window.setTimeout(() => {
      try {
        const snapshot: ProEditorSnapshot = {
          nodes: cloneFlowNodes(nodes),
          edges: cloneEdges(edges),
          blueprints: blueprints.map((blueprint) => ({
            ...blueprint,
            nodes: blueprint.nodes.map(cloneNodeData),
            positions: blueprint.positions?.map((position) => ({ ...position })),
            edges: blueprint.edges?.map((edge) => ({ ...edge })),
          })),
        };
        window.localStorage.setItem(proEditorStorageKey(strategyId), JSON.stringify(snapshot));
        onSaveStateChange?.('saved');
        onSaved?.();
      } catch {
        onSaveStateChange?.('error');
      }
    }, 320);
    return () => window.clearTimeout(saveTimer);
  }, [
    blueprints,
    edges,
    nodes,
    onSaveStateChange,
    onSaved,
    saveRequest,
    strategyId,
    tutorialPracticeActive,
  ]);

  const checkpoint = useCallback(() => {
    setDeleteUndoAvailable(false);
    historyRef.current.past.push({
      nodes: cloneFlowNodes(nodesRef.current),
      edges: cloneEdges(edgesRef.current),
    });
    historyRef.current.past = historyRef.current.past.slice(-40);
    historyRef.current.future = [];
    setHistoryTick((value) => value + 1);
  }, []);

  const undo = () => {
    const previous = historyRef.current.past.pop();
    if (!previous) return;
    historyRef.current.future.push({
      nodes: cloneFlowNodes(nodesRef.current),
      edges: cloneEdges(edgesRef.current),
    });
    setNodes(cloneFlowNodes(previous.nodes));
    setEdges(cloneEdges(previous.edges));
    setSelectedIds([]);
    setDeleteUndoAvailable(false);
    setMessage('직전 편집을 실행 취소했습니다.');
    setHistoryTick((value) => value + 1);
  };

  const redo = () => {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push({
      nodes: cloneFlowNodes(nodesRef.current),
      edges: cloneEdges(edgesRef.current),
    });
    setNodes(cloneFlowNodes(next.nodes));
    setEdges(cloneEdges(next.edges));
    setSelectedIds([]);
    setDeleteUndoAvailable(false);
    setMessage('취소했던 편집을 다시 적용했습니다.');
    setHistoryTick((value) => value + 1);
  };

  const selectNode = useCallback((nodeId?: string) => {
    setSelectedIds(nodeId ? [nodeId] : []);
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === nodeId })));
    if (nodeId) setInspectorTab('settings');
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    if (changes.some((change) => change.type === 'remove')) checkpoint();
    setNodes((current) => applyNodeChanges(changes, current));
  }, [checkpoint]);

  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    if (changes.some((change) => change.type === 'remove')) checkpoint();
    setEdges((current) => applyEdgeChanges(changes, current));
  }, [checkpoint]);

  const updateNodeParameter = useCallback((
    nodeId: string,
    key: string,
    value: string | number | boolean,
  ) => {
    checkpoint();
    setNodes((current) => current.map((node) => (
      node.id === nodeId && node.type === 'strategy'
        ? {
          ...node,
          data: {
            ...(node.data as StrategyNodeData),
            parameters: {
              ...(node.data as StrategyNodeData).parameters,
              [key]: value,
            },
          },
        }
        : node
    )));
  }, [checkpoint]);

  const updateNodeLabel = (nodeId: string, label: string) => {
    checkpoint();
    setNodes((current) => current.map((node) => (
      node.id === nodeId && node.type === 'strategy'
        ? { ...node, data: { ...(node.data as StrategyNodeData), label } }
        : node
    )));
  };

  const toggleGroup = useCallback((groupId: string) => {
    checkpoint();
    setNodes((current) => {
      const group = current.find((node) => node.id === groupId);
      if (!group || group.type !== 'group') return current;
      const data = group.data as GroupNodeData;
      const collapsed = !data.collapsed;
      const expandedWidth = data.expandedWidth
        || (typeof group.style?.width === 'number' ? group.style.width : COLLAPSED_GROUP_MAX_WIDTH);
      return current.map((node) => {
        if (node.id === groupId) {
          return {
            ...node,
            data: { ...data, collapsed, expandedWidth },
            style: {
              ...node.style,
              width: collapsed ? Math.min(expandedWidth, COLLAPSED_GROUP_MAX_WIDTH) : expandedWidth,
              height: collapsed ? COLLAPSED_GROUP_MIN_HEIGHT : data.expandedHeight,
            },
          };
        }
        if (node.parentId === groupId) return { ...node, hidden: collapsed };
        return node;
      });
    });
  }, [checkpoint]);

  const buildBlueprint = useCallback((
    selectedNodes: FlowNode[],
    name: string,
  ): Blueprint => {
    const strategyNodes = selectedNodes.filter(isStrategyNode);
    const absolutePositions = strategyNodes.map((node) => {
      const parent = node.parentId
        ? nodesRef.current.find((candidate) => candidate.id === node.parentId)
        : null;
      return {
        x: node.position.x + (parent?.position.x ?? 0),
        y: node.position.y + (parent?.position.y ?? 0),
      };
    });
    const minX = Math.min(...absolutePositions.map((position) => position.x));
    const minY = Math.min(...absolutePositions.map((position) => position.y));
    const nodeIndex = new Map(strategyNodes.map((node, index) => [node.id, index]));
    return {
      id: `blueprint-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      name,
      nodes: strategyNodes.map((node) => cloneNodeData(node.data as StrategyNodeData)),
      positions: absolutePositions.map((position) => ({
        x: position.x - minX,
        y: position.y - minY,
      })),
      edges: edgesRef.current
        .filter((edge) => nodeIndex.has(edge.source) && nodeIndex.has(edge.target))
        .map((edge) => ({
          sourceIndex: nodeIndex.get(edge.source)!,
          targetIndex: nodeIndex.get(edge.target)!,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          observation: Boolean(edge.animated),
        })),
      createdAt: new Date().toISOString(),
    };
  }, []);

  const saveBlueprintFromGroup = useCallback((groupId: string) => {
    const children = nodesRef.current.filter(
      (node) => node.parentId === groupId && node.type === 'strategy',
    );
    if (!children.length) return;
    setBlueprints((saved) => [
      ...saved,
      buildBlueprint(children, `개인 블루프린트 ${saved.length + 1}`),
    ]);
    setShowBlueprints(true);
    setMessage('선택한 그룹을 본인 계정 전용 블루프린트로 저장했습니다.');
  }, [buildBlueprint]);

  const ungroup = useCallback((groupId: string) => {
    checkpoint();
    setNodes((current) => {
      const group = current.find((node) => node.id === groupId);
      if (!group) return current;
      return current
        .filter((node) => node.id !== groupId)
        .map((node) => (
          node.parentId === groupId
            ? {
              ...node,
              parentId: undefined,
              extent: undefined,
              hidden: false,
              position: {
                x: group.position.x + node.position.x,
                y: group.position.y + node.position.y,
              },
            }
            : node
        ));
    });
    setMessage('그룹을 해제했습니다. 내부 노드는 현재 위치를 유지합니다.');
  }, [checkpoint]);

  const createGroup = () => {
    const selected = nodes.filter(
      (node) => selectedIds.includes(node.id) && node.type === 'strategy' && !node.parentId,
    );
    if (selected.length < 2) return;
    checkpoint();
    const minX = Math.min(...selected.map((node) => node.position.x));
    const minY = Math.min(...selected.map((node) => node.position.y));
    const maxX = Math.max(...selected.map(
      (node) => node.position.x + (node.measured?.width ?? 242),
    ));
    const maxY = Math.max(...selected.map(
      (node) => node.position.y + (node.measured?.height ?? 170),
    ));
    const groupId = `group-${Date.now()}`;
    const groupX = minX - 28;
    const groupY = minY - 66;
    const width = maxX - minX + 56;
    const height = maxY - minY + 94;
    const groupNode: FlowNode = {
      id: groupId,
      type: 'group',
      position: { x: groupX, y: groupY },
      data: {
        label: `노드 그룹 ${nodes.filter((node) => node.type === 'group').length + 1}`,
        count: selected.length,
        collapsed: false,
        expandedWidth: width,
        expandedHeight: height,
        onToggle: toggleGroup,
        onSaveBlueprint: saveBlueprintFromGroup,
        onUngroup: ungroup,
      },
      style: { width, height },
      selectable: true,
      zIndex: -1,
    };
    setNodes((current) => [
      groupNode,
      ...current.map((node) => (
        selectedIds.includes(node.id)
          ? {
            ...node,
            parentId: groupId,
            extent: 'parent' as const,
            position: { x: node.position.x - groupX, y: node.position.y - groupY },
            selected: false,
          }
          : node
      )),
    ]);
    setSelectedIds([]);
    setMessage('선택한 노드를 그룹으로 묶었습니다. 그룹을 접거나 한 번에 이동할 수 있습니다.');
  };

  const saveSelectedBlueprint = () => {
    const selected = nodes.filter(
      (node) => selectedIds.includes(node.id) && node.type === 'strategy',
    );
    if (!selected.length) return;
    setBlueprints((current) => [
      ...current,
      buildBlueprint(selected, `개인 블루프린트 ${current.length + 1}`),
    ]);
    setShowBlueprints(true);
    setMessage('선택한 노드를 본인 계정에서만 쓰는 블루프린트로 저장했습니다.');
  };

  const startBlueprintRename = (blueprint: Blueprint) => {
    setEditingBlueprintId(blueprint.id);
    setBlueprintDraftName(blueprint.name);
    setPendingBlueprintDelete(null);
  };

  const saveBlueprintName = () => {
    const nextName = blueprintDraftName.trim();
    if (!editingBlueprintId || !nextName) return;
    setBlueprints((current) => current.map((blueprint) => (
      blueprint.id === editingBlueprintId
        ? { ...blueprint, name: nextName }
        : blueprint
    )));
    setEditingBlueprintId(null);
    setBlueprintDraftName('');
    setMessage('블루프린트 이름을 변경했습니다.');
  };

  const deleteBlueprint = (blueprintId: string) => {
    setBlueprints((current) => current.filter((blueprint) => blueprint.id !== blueprintId));
    setPendingBlueprintDelete(null);
    if (previewBlueprintId === blueprintId) setPreviewBlueprintId(null);
    if (editingBlueprintId === blueprintId) setEditingBlueprintId(null);
    setMessage('블루프린트를 삭제했습니다. 현재 캔버스의 노드는 그대로 유지됩니다.');
  };

  const addNode = (data: StrategyNodeData, position?: { x: number; y: number }) => {
    if (data.locked) {
      setMessage(`문제: ‘${data.label}’ 블록은 잠겨 있습니다. 영향: 현재 데이터로 실행할 수 없습니다. 해결: ${data.lockReason}`);
      return null;
    }
    checkpoint();
    const id = `node-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const nextData = cloneNodeData(data);
    if (tutorialPracticeActive && data.blockId === 'price-bars') {
      nextData.parameters = { ...nextData.parameters, timeframe: '', freshness: '' };
    }
    setNodes((current) => [...current, {
      id,
      type: 'strategy',
      position: position ?? { x: 220 + current.length * 24, y: 230 + (current.length % 4) * 150 },
      data: nextData,
    }]);
    selectNode(id);
    return id;
  };

  const insertBlueprint = (blueprint: Blueprint) => {
    checkpoint();
    const stamp = Date.now();
    const insertedNodeIds = blueprint.nodes.map((_, index) => `node-${stamp}-${index}`);
    setNodes((current) => [
      ...current,
      ...blueprint.nodes.map((data, index) => ({
        id: insertedNodeIds[index],
        type: 'strategy',
        position: blueprint.positions?.[index]
          ? {
            x: 250 + blueprint.positions[index].x,
            y: 260 + blueprint.positions[index].y,
          }
          : { x: 250 + index * 280, y: 360 },
        data: cloneNodeData(data),
      })),
    ]);
    if (blueprint.edges?.length) {
      setEdges((current) => [
        ...current,
        ...blueprint.edges!.map((edge, index) => ({
          id: `edge-blueprint-${stamp}-${index}`,
          source: insertedNodeIds[edge.sourceIndex],
          target: insertedNodeIds[edge.targetIndex],
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          type: 'smoothstep',
          ...edgeAppearance(Boolean(edge.observation)),
        })),
      ]);
    }
    setMessage('블루프린트의 배치와 내부 연결을 유지해 캔버스에 추가했습니다.');
  };

  const onConnect = (connection: Connection) => {
    const result = checkConnection(connection, nodesRef.current, edgesRef.current);
    setActiveConnection(null);
    if (!result.valid) {
      setMessage(result.message);
      return;
    }
    checkpoint();
    const observation = Boolean(result.sourcePort.observation || result.targetPort.observation);
    setEdges((current) => addEdge({
      ...connection,
      id: `edge-${Date.now()}`,
      type: 'smoothstep',
      ...edgeAppearance(observation),
    }, current));
    setMessage(
      observation
        ? '관찰 전용 점선으로 연결했습니다. 이 흐름은 주문 판단에 영향을 주지 않습니다.'
        : `${result.sourcePort.type} 타입 연결이 확인됐습니다.`,
    );
    const tutorialUniverseId = tutorialNodeIds.current.universe;
    const tutorialMarketId = tutorialNodeIds.current.market;
    if (
      tutorialStep === 3
      && connection.source === tutorialUniverseId
      && connection.target === tutorialMarketId
      && connection.sourceHandle === 'universe'
      && connection.targetHandle === 'universe'
    ) {
      selectNode(tutorialMarketId);
      onTutorialAction?.('pro-connected');
    }
  };

  const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const blockId = event.dataTransfer.getData('application/x-i2s-node');
    const item = proLibrary.find((node) => node.blockId === blockId);
    if (!item) return;
    const nodeId = addNode(item, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    if (!nodeId) return;
    if (tutorialStep === 1 && item.blockId === 'direct-universe') {
      tutorialNodeIds.current.universe = nodeId;
      onTutorialAction?.('pro-universe-placed');
    }
    if (tutorialStep === 2 && item.blockId === 'price-bars') {
      tutorialNodeIds.current.market = nodeId;
      onTutorialAction?.('pro-market-placed');
    }
  };

  const duplicateSelected = () => {
    const selected = nodes.find(
      (node) => selectedIds.includes(node.id) && node.type === 'strategy',
    );
    if (!selected) return;
    checkpoint();
    const id = `node-${Date.now()}-copy`;
    setNodes((current) => [...current, {
      ...selected,
      id,
      parentId: undefined,
      extent: undefined,
      position: {
        x: selected.position.x + 36,
        y: selected.position.y + 36,
      },
      data: cloneNodeData(selected.data as StrategyNodeData),
      selected: true,
    }]);
    selectNode(id);
    setMessage('노드를 복제했습니다. 기존 연결은 복제하지 않아 의도치 않은 주문 흐름을 막습니다.');
  };

  const toggleSelectedDisabled = () => {
    const selected = nodes.find(
      (node) => selectedIds.includes(node.id) && node.type === 'strategy',
    );
    if (!selected) return;
    checkpoint();
    const disabled = !(selected.data as StrategyNodeData).disabled;
    setNodes((current) => current.map((node) => (
      node.id === selected.id
        ? {
          ...node,
          data: { ...(node.data as StrategyNodeData), disabled },
        }
        : node
    )));
    setMessage(disabled ? '노드를 비활성화했습니다. 연결은 보존되지만 실행에서 제외됩니다.' : '노드를 다시 활성화했습니다.');
  };

  const deleteNodeIds = useCallback((
    nodeIds: string[],
    options?: { skipCheckpoint?: boolean; source?: 'button' | 'keyboard' | 'drop' },
  ) => {
    const selectedSet = new Set(nodeIds);
    if (!selectedSet.size) return;
    if (!options?.skipCheckpoint) checkpoint();
    setNodes((current) => {
      const selectedGroups = current.filter(
        (node) => selectedSet.has(node.id) && node.type === 'group',
      );
      const groupPositions = new Map(selectedGroups.map((group) => [group.id, group.position]));
      const next = current
        .filter((node) => !selectedSet.has(node.id))
        .map((node) => {
          if (node.parentId && groupPositions.has(node.parentId)) {
            const parentPosition = groupPositions.get(node.parentId)!;
            return {
              ...node,
              parentId: undefined,
              extent: undefined,
              hidden: false,
              position: {
                x: parentPosition.x + node.position.x,
                y: parentPosition.y + node.position.y,
              },
            };
          }
          return node;
        });
      nodesRef.current = next;
      return next;
    });
    setEdges((current) => {
      const next = current.filter(
        (edge) => !selectedSet.has(edge.source) && !selectedSet.has(edge.target),
      );
      edgesRef.current = next;
      return next;
    });
    setSelectedIds([]);
    setDeleteUndoAvailable(true);
    setMessage(
      options?.source === 'drop'
        ? `${selectedSet.size}개 항목을 삭제 영역에 놓아 삭제했습니다.`
        : `${selectedSet.size}개 선택 항목을 삭제했습니다. 그룹 삭제 시 내부 노드는 보존됩니다.`,
    );
  }, [checkpoint]);

  const deleteSelected = useCallback(() => {
    deleteNodeIds(selectedIds, { source: 'button' });
  }, [deleteNodeIds, selectedIds]);

  const finishNodeDeleteDrag = useCallback(() => {
    draggedNodeIdsRef.current = [];
    dragStartSnapshotRef.current = null;
    setNodeDeleteDrag(null);
  }, []);

  const restoreDragStartSnapshot = useCallback((notice: string) => {
    const snapshot = dragStartSnapshotRef.current;
    if (!snapshot) return;
    const restoredNodes = cloneFlowNodes(snapshot.nodes);
    const restoredEdges = cloneEdges(snapshot.edges);
    setNodes(restoredNodes);
    setEdges(restoredEdges);
    nodesRef.current = restoredNodes;
    edgesRef.current = restoredEdges;
    setSelectedIds([]);
    historyRef.current.past.pop();
    setHistoryTick((value) => value + 1);
    setMessage(notice);
  }, []);

  const handleNodeDragStart = useCallback<OnNodeDrag<FlowNode>>((_, node, draggedNodes) => {
    if (tutorialStep > 0) {
      checkpoint();
      return;
    }
    dragStartSnapshotRef.current = {
      nodes: cloneFlowNodes(nodesRef.current),
      edges: cloneEdges(edgesRef.current),
    };
    checkpoint();
    const nodeIds = (draggedNodes.length ? draggedNodes : [node]).map((item) => item.id);
    draggedNodeIdsRef.current = nodeIds;
    setNodeDeleteDrag({
      nodeIds,
      overZone: false,
    });
  }, [checkpoint, tutorialStep]);

  const handleNodeDrag = useCallback<OnNodeDrag<FlowNode>>((event) => {
    if (!draggedNodeIdsRef.current.length) return;
    const point = pointerClientPosition(event);
    const overZone = pointInsideElement(point, deleteZoneRef.current);
    setNodeDeleteDrag((current) => current
      ? { ...current, overZone }
      : current);
  }, []);

  const handleNodeDragStop = useCallback<OnNodeDrag<FlowNode>>((event) => {
    if (!draggedNodeIdsRef.current.length) return;
    const point = pointerClientPosition(event);
    const overZone = pointInsideElement(point, deleteZoneRef.current);
    const nodeIds = [...draggedNodeIdsRef.current];

    if (overZone) {
      deleteNodeIds(nodeIds, { skipCheckpoint: true, source: 'drop' });
    }
    finishNodeDeleteDrag();
  }, [deleteNodeIds, finishNodeDeleteDrag]);

  useEffect(() => {
    const handleDeleteShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = Boolean(
        target?.matches('input, textarea, select')
        || target?.isContentEditable,
      );
      if (event.key === 'Escape' && draggedNodeIdsRef.current.length) {
        event.preventDefault();
        restoreDragStartSnapshot('노드 이동과 삭제를 취소하고 원래 위치로 되돌렸습니다.');
        finishNodeDeleteDrag();
        return;
      }
      if (
        tutorialStep > 0
        || isEditing
        || !selectedIds.length
        || (event.key !== 'Delete' && event.key !== 'Backspace')
      ) return;
      event.preventDefault();
      deleteNodeIds(selectedIds, { source: 'keyboard' });
    };
    window.addEventListener('keydown', handleDeleteShortcut);
    return () => window.removeEventListener('keydown', handleDeleteShortcut);
  }, [
    deleteNodeIds,
    finishNodeDeleteDrag,
    restoreDragStartSnapshot,
    selectedIds,
    tutorialStep,
  ]);

  const autoLayout = () => {
    checkpoint();
    setNodes((current) => {
      const counters = new Map<number, number>();
      return current.map((node) => {
        if (node.type !== 'strategy' || node.parentId) return node;
        const data = node.data as StrategyNodeData;
        const column = stageOrder[data.stage] ?? 0;
        const row = counters.get(column) ?? 0;
        counters.set(column, row + 1);
        return {
          ...node,
          position: { x: 70 + column * 300, y: 85 + row * 230 },
        };
      });
    });
    setMessage('실행 단계 기준으로 자동 정렬했습니다. 그룹 내부 배치는 유지했습니다.');
    window.setTimeout(() => fitView({ padding: 0.16, duration: 350 }), 40);
  };

  const issues = useMemo(() => buildGraphIssues(nodes, edges), [nodes, edges]);
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const infoCount = issues.filter((issue) => issue.severity === 'info').length;
  const strategyNodeCount = nodes.filter((node) => node.type === 'strategy').length;
  const selectedNode = nodes.find(
    (node) => selectedIds.includes(node.id) && node.type === 'strategy',
  );
  const selectedData = selectedNode?.data as StrategyNodeData | undefined;
  const selectedIssues = selectedNode
    ? issues.filter((issue) => issue.nodeId === selectedNode.id)
    : [];
  const categories = useMemo(
    () => ['전체', ...Array.from(new Set(proLibrary.map((item) => item.stage)))],
    [],
  );
  const filteredLibrary = proLibrary.filter((item) => (
    `${item.label} ${item.stage} ${item.detail}`.toLowerCase().includes(query.toLowerCase())
    && (category === '전체' || item.stage === category)
  ));
  const filteredBlueprints = blueprints.filter((blueprint) => (
    `${blueprint.name} ${blueprint.nodes.map((node) => `${node.stage} ${node.label}`).join(' ')}`
      .toLowerCase()
      .includes(blueprintQuery.trim().toLowerCase())
  ));
  const tutorialSourceId = tutorialStep === 1
    ? 'direct-universe'
    : tutorialStep === 2
      ? 'price-bars'
      : null;
  const groupCount = nodes.filter((node) => node.type === 'group').length;
  const collapsedGroupView = useMemo(
    () => buildCollapsedGroupView(nodes, edges),
    [edges, nodes],
  );

  useEffect(() => {
    if (!collapsedGroupView.collapsedGroupIds.size) return;
    const updateTimer = window.setTimeout(() => {
      collapsedGroupView.collapsedGroupIds.forEach((groupId) => updateNodeInternals(groupId));
    }, 0);
    return () => window.clearTimeout(updateTimer);
  }, [collapsedGroupView.signature, updateNodeInternals]);

  useEffect(() => {
    if (tutorialStep !== 4 || !tutorialNodeIds.current.market) return;
    const marketNode = nodes.find(
      (node) => node.id === tutorialNodeIds.current.market && node.type === 'strategy',
    );
    if (!marketNode) return;
    const data = marketNode.data as StrategyNodeData;
    if (
      !isMissing(data.parameters.timeframe)
      && !isMissing(data.parameters.freshness)
    ) {
      onTutorialAction?.('pro-configured');
    }
  }, [nodes, onTutorialAction, tutorialStep]);

  useEffect(() => {
    onStatusChange?.({
      errorCount: errors.length,
      warningCount: warnings.length,
      infoCount,
      itemCount: strategyNodeCount,
      isReady: strategyNodeCount > 0 && errors.length === 0,
    });
  }, [errors.length, infoCount, onStatusChange, strategyNodeCount, warnings.length]);

  const renderedNodes = useMemo(() => nodes.map((node) => {
    if (node.type !== 'strategy') {
      const data = node.data as GroupNodeData;
      const proxyPorts = collapsedGroupView.proxyPortLists.get(node.id) ?? [];
      const inputCount = proxyPorts.filter((port) => port.direction === 'input').length;
      const outputCount = proxyPorts.filter((port) => port.direction === 'output').length;
      const expandedWidth = data.expandedWidth
        || (typeof node.style?.width === 'number' ? node.style.width : COLLAPSED_GROUP_MAX_WIDTH);
      const collapsedHeight = Math.max(
        COLLAPSED_GROUP_MIN_HEIGHT,
        COLLAPSED_GROUP_PORT_START + Math.max(inputCount, outputCount) * COLLAPSED_GROUP_PORT_GAP,
      );
      return {
        ...node,
        style: {
          ...node.style,
          width: data.collapsed ? Math.min(expandedWidth, COLLAPSED_GROUP_MAX_WIDTH) : expandedWidth,
          height: data.collapsed ? collapsedHeight : data.expandedHeight,
        },
        data: {
          ...data,
          expandedWidth,
          proxyPorts,
          onToggle: toggleGroup,
          onSaveBlueprint: saveBlueprintFromGroup,
          onUngroup: ungroup,
        },
      };
    }
    const data = node.data as StrategyNodeData;
    const candidatePorts = activeConnection
      ? activeConnection.handleType === 'source' ? data.inputs : data.outputs
      : [];
    const connectionCompatibleHandleIds = activeConnection && node.id !== activeConnection.nodeId
      ? candidatePorts.filter((port) => {
        const connection: Connection = activeConnection.handleType === 'source'
          ? {
            source: activeConnection.nodeId,
            sourceHandle: activeConnection.port.id,
            target: node.id,
            targetHandle: port.id,
          }
          : {
            source: node.id,
            sourceHandle: port.id,
            target: activeConnection.nodeId,
            targetHandle: activeConnection.port.id,
          };
        return checkConnection(connection, nodes, edges).valid;
      }).map((port) => port.id)
      : [];
    const connectionNodeState: StrategyNodeData['connectionNodeState'] = !activeConnection
      ? null
      : node.id === activeConnection.nodeId
        ? 'origin'
        : connectionCompatibleHandleIds.length
          ? 'compatible'
          : 'incompatible';
    const tutorialRole: StrategyNodeData['tutorialRole'] = tutorialStep === 3
      ? node.id === tutorialNodeIds.current.universe
        ? 'connection-source'
        : node.id === tutorialNodeIds.current.market
          ? 'connection-target'
          : undefined
      : tutorialStep === 4 && node.id === tutorialNodeIds.current.market
        ? 'settings-target'
        : undefined;
    return {
      ...node,
      data: {
        ...data,
        inputs: data.inputs.map((port) => effectivePort(data, port)),
        outputs: data.outputs.map((port) => effectivePort(data, port)),
        onParameterChange: updateNodeParameter,
        connectionHint: activeConnection?.port.type ?? null,
        connectionNodeId: activeConnection?.nodeId ?? null,
        connectionNodeState,
        connectionCompatibleHandleIds,
        connectionTimeframe: activeConnection?.port.timeframe,
        connectionDirection: activeConnection?.handleType ?? null,
        connectionStage: activeConnection?.stage ?? null,
        connectionObservation: Boolean(activeConnection?.port.observation),
        tutorialRole,
      },
    };
  }), [
    activeConnection,
    collapsedGroupView.proxyPortLists,
    edges,
    nodes,
    saveBlueprintFromGroup,
    toggleGroup,
    tutorialStep,
    ungroup,
    updateNodeParameter,
  ]);

  const nodeTypes = useMemo(() => ({
    strategy: StrategyFlowNode,
    group: GroupFlowNode,
  }), []);

  const handleSelectionChange = useCallback(({ nodes: selected }: { nodes: FlowNode[] }) => {
    const nextIds = selected.map((node) => node.id);
    setSelectedIds((current) => (
      current.length === nextIds.length && current.every((id, index) => id === nextIds[index])
        ? current
        : nextIds
    ));
    if (selected.length === 1 && selected[0].type === 'strategy') {
      setInspectorTab('settings');
    }
  }, []);

  const handleNodeClick = useCallback<NodeMouseHandler<FlowNode>>((event, clickedNode) => {
    const nextIds = event.shiftKey
      ? selectedIds.includes(clickedNode.id)
        ? selectedIds.filter((id) => id !== clickedNode.id)
        : [...selectedIds, clickedNode.id]
      : [clickedNode.id];
    setSelectedIds(nextIds);
    setNodes((current) => current.map((node) => ({
      ...node,
      selected: nextIds.includes(node.id),
    })));
    if (clickedNode.type === 'strategy') setInspectorTab('settings');
  }, [selectedIds]);

  const runValidation = () => {
    if (!issues.length) {
      setMessage('전략 검사 완료: 현재 구조 오류·경고가 없습니다. 수익 가능성을 검증한 결과는 아닙니다.');
      return;
    }
    const first = errors[0] ?? warnings[0] ?? issues[0];
    if (first.nodeId) selectNode(first.nodeId);
    setInspectorTab('validation');
    setMessage(`${first.severity === 'error' ? '오류' : first.severity === 'warning' ? '경고' : '정보'}: ${first.title} 해결: ${first.solution}`);
  };

  useEffect(() => {
    if (lastResetRequest.current === resetRequest) return;
    lastResetRequest.current = resetRequest;
    setNodes([]);
    setEdges([]);
    nodesRef.current = [];
    edgesRef.current = [];
    setSelectedIds([]);
    setActiveConnection(null);
    setInspectorTab('settings');
    setPreviewOpen(false);
    historyRef.current = { past: [], future: [] };
    setHistoryTick((value) => value + 1);
    setMessage('빈 Pro 편집기로 초기화했습니다. 왼쪽 라이브러리에서 노드를 끌어 배치하세요.');
  }, [resetRequest]);

  useEffect(() => {
    if (lastValidationRequest.current === validationRequest) return;
    lastValidationRequest.current = validationRequest;
    runValidation();
  }, [validationRequest]);

  const flowSequence = nodes
    .filter(isStrategyNode)
    .filter((node) => !node.data.disabled)
    .sort((a, b) => (stageOrder[a.data.stage] ?? 0) - (stageOrder[b.data.stage] ?? 0));

  return (
    <div className="builder-workspace pro-workspace">
      <aside className="block-library pro-library">
        <PanelHeading icon={<Box size={16} />} eyebrow="NODE LIBRARY" title="블록 라이브러리" count={proLibrary.length} />
        <label className="library-search">
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="블록 또는 역할 검색" />
        </label>
        <label className="library-category-filter">
          <span>카테고리</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <div className="pro-caution">
          <LockKeyhole size={16} />
          <span>특정 종목·수치·전략 조합을 추천하지 않습니다. 잠긴 블록은 필요한 데이터가 연결되기 전까지 사용할 수 없습니다.</span>
        </div>
        <PortLegend />
        <div className="block-library__scroll">
          {filteredLibrary.map((item) => (
            <button
              key={item.blockId}
              className={`library-block pro-library-block ${item.locked ? 'is-locked' : ''} ${item.blockId === tutorialSourceId ? 'tutorial-focus tutorial-focus--source' : ''}`}
              draggable={!item.locked}
              aria-disabled={item.locked}
              title={item.locked ? item.lockReason : item.description}
              onDragStart={(event) => {
                if (item.locked) return;
                event.dataTransfer.setData('application/x-i2s-node', item.blockId);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => {
                if (item.blockId === tutorialSourceId) return;
                addNode(item);
              }}
              style={{ '--block-color': item.color } as React.CSSProperties}
            >
              <i />
              <span>
                <small>{item.stage}</small>
                <strong>{item.label}</strong>
                <em>{item.detail}</em>
                <span className="library-port-signature">
                  {item.inputs.slice(0, 2).map((port) => <PortSwatch key={port.id} port={port} />)}
                  <b>{item.inputs.length ? item.inputs.map((port) => port.type).join(' · ') : '입력 없음'}</b>
                  <span>→</span>
                  <b>{item.outputs.length ? item.outputs.map((port) => port.type).join(' · ') : '종단'}</b>
                  {item.outputs.slice(0, 2).map((port) => <PortSwatch key={port.id} port={port} />)}
                </span>
                {item.locked && <span className="locked-reason">필요 데이터: {item.dataCapability}</span>}
              </span>
              {item.locked ? <LockKeyhole size={14} /> : <Plus size={15} />}
            </button>
          ))}
        </div>
        <button className="blueprint-toggle" onClick={() => setShowBlueprints((value) => !value)}>
          <FolderOpen size={15} /><span>내 블루프린트</span><em>{blueprints.length}</em>
          {showBlueprints ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {showBlueprints && (
          <div className="blueprint-manager">
            {blueprints.length > 0 && (
              <label className="blueprint-search">
                <Search size={13} />
                <input
                  value={blueprintQuery}
                  onChange={(event) => setBlueprintQuery(event.target.value)}
                  placeholder="이름·노드 검색"
                  aria-label="블루프린트 검색"
                />
              </label>
            )}
            <div className="blueprint-list">
            {blueprints.length === 0 ? (
              <p>저장된 블루프린트가 없습니다.<small>선택 노드나 그룹을 본인 계정에만 저장할 수 있습니다.</small></p>
            ) : filteredBlueprints.length === 0 ? (
              <p>검색 결과가 없습니다.<small>다른 이름이나 노드 역할로 검색해 보세요.</small></p>
            ) : filteredBlueprints.map((blueprint) => (
              <article key={blueprint.id} className="blueprint-item">
                {editingBlueprintId === blueprint.id ? (
                  <div className="blueprint-rename">
                    <input
                      autoFocus
                      value={blueprintDraftName}
                      onChange={(event) => setBlueprintDraftName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') saveBlueprintName();
                        if (event.key === 'Escape') setEditingBlueprintId(null);
                      }}
                      maxLength={32}
                      aria-label="블루프린트 이름"
                    />
                    <button onClick={saveBlueprintName} disabled={!blueprintDraftName.trim()} aria-label="이름 저장"><Check size={13} /></button>
                    <button onClick={() => setEditingBlueprintId(null)} aria-label="이름 변경 취소"><X size={13} /></button>
                  </div>
                ) : (
                  <div className="blueprint-item__head">
                    <button className="blueprint-item__insert" onClick={() => insertBlueprint(blueprint)}>
                      <CopyPlus size={14} />
                      <span><strong>{blueprint.name}</strong><small>{blueprint.nodes.length}개 노드 · 내부 연결 {blueprint.edges?.length ?? 0}개</small></span>
                    </button>
                    <div className="blueprint-item__actions">
                      <button
                        onClick={() => setPreviewBlueprintId((current) => current === blueprint.id ? null : blueprint.id)}
                        aria-label={`${blueprint.name} 미리보기`}
                        title="구성 미리보기"
                      >
                        <Eye size={13} />
                      </button>
                      <button onClick={() => startBlueprintRename(blueprint)} aria-label={`${blueprint.name} 이름 변경`} title="이름 변경">
                        <Pencil size={13} />
                      </button>
                      <button
                        className="is-danger"
                        onClick={() => setPendingBlueprintDelete(blueprint.id)}
                        aria-label={`${blueprint.name} 삭제`}
                        title="삭제"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )}
                {previewBlueprintId === blueprint.id && (
                  <div className="blueprint-preview">
                    <strong>포함된 실행 구조</strong>
                    <ol>
                      {blueprint.nodes.map((node, index) => (
                        <li key={`${blueprint.id}-${index}`}>
                          <span>{node.stage}</span>{node.label}
                        </li>
                      ))}
                    </ol>
                    <small>삽입하면 저장 당시의 상대 위치와 내부 연결을 함께 복원합니다.</small>
                  </div>
                )}
                {pendingBlueprintDelete === blueprint.id && (
                  <div className="blueprint-delete-confirm">
                    <span>이 블루프린트만 삭제할까요?</span>
                    <button onClick={() => setPendingBlueprintDelete(null)}>취소</button>
                    <button className="is-danger" onClick={() => deleteBlueprint(blueprint.id)}>삭제</button>
                  </div>
                )}
              </article>
            ))}
            </div>
          </div>
        )}
      </aside>

      <section className="flow-workspace">
        <div className="flow-toolbar">
          <div className="flow-toolbar__primary">
            <button onClick={undo} disabled={!historyRef.current.past.length} title="실행 취소"><Undo2 size={14} /></button>
            <button onClick={redo} disabled={!historyRef.current.future.length} title="다시 실행"><Redo2 size={14} /></button>
            <button onClick={autoLayout}><AlignHorizontalDistributeCenter size={14} /> 자동 정렬</button>
            <button disabled={selectedIds.length < 2} onClick={createGroup}><Layers3 size={14} /> 그룹</button>
            <button disabled={!selectedIds.length} onClick={saveSelectedBlueprint}><Save size={14} /> 블루프린트</button>
            <button onClick={() => fitView({ padding: 0.2, duration: 350 })}><MousePointer2 size={14} /> 전체 보기</button>
            <button className={errors.length ? 'has-errors' : ''} onClick={runValidation}>
              <ShieldCheck size={14} /> 전략 검사 {errors.length > 0 && <em>{errors.length}</em>}
            </button>
          </div>
          {nodeDeleteDrag ? (
            <span>중앙 하단 삭제 박스에 놓으면 즉시 삭제됩니다. 박스 아래 가장자리에서는 화면이 아래로 이동합니다.</span>
          ) : selectedIds.length > 0 ? (
            <div className="flow-toolbar__selection" aria-label={`${selectedIds.length}개 노드 선택 작업`}>
              <strong>{selectedIds.length}개 선택</strong>
              <button onClick={duplicateSelected} disabled={selectedIds.length !== 1}><Copy size={13} /> 복제</button>
              <button onClick={toggleSelectedDisabled} disabled={selectedIds.length !== 1}><EyeOff size={13} /> 비활성</button>
              <button className="is-danger" onClick={deleteSelected}><Trash2 size={13} /> 삭제</button>
            </div>
          ) : (
            <span>
              {activeConnection
              ? '연결할 수 있는 노드만 밝게 표시됩니다. 어두운 노드는 현재 포트와 연결할 수 없습니다.'
              : '노드를 자유롭게 이동하고 같은 모양의 포트끼리 연결하세요'}
            </span>
          )}
        </div>
        <div
          className={`flow-canvas ${
            tutorialStep === 1 || tutorialStep === 2
              ? 'tutorial-focus tutorial-focus--target'
              : tutorialStep === 3 || tutorialStep === 4
                ? 'tutorial-interaction-surface'
                : ''
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={renderedNodes}
            edges={collapsedGroupView.renderedEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            onConnect={onConnect}
            onConnectStart={(_, params) => {
              const node = nodesRef.current.find((item) => item.id === params.nodeId);
              if (!isStrategyNode(node) || !params.handleId || !params.handleType) return;
              const port = findPort(node.data, params.handleId, params.handleType);
              if (!port) return;
              setActiveConnection({
                nodeId: node.id,
                port,
                handleType: params.handleType,
                stage: node.data.stage,
              });
            }}
            onConnectEnd={() => setActiveConnection(null)}
            onNodeClick={handleNodeClick}
            onSelectionChange={handleSelectionChange}
            onPaneClick={() => setSelectedIds([])}
            connectionLineType={ConnectionLineType.SmoothStep}
            selectionMode={SelectionMode.Partial}
            panOnDrag={[1, 2]}
            autoPanOnNodeDrag
            autoPanSpeed={14}
            selectionOnDrag
            multiSelectionKeyCode="Shift"
            deleteKeyCode={null}
            minZoom={0.3}
            maxZoom={1.6}
            defaultViewport={{ x: 30, y: 90, zoom: 0.65 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} color="#d7dfdc" />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(node) => node.type === 'group' ? '#d9e8e5' : String((node.data as StrategyNodeData).color ?? '#557d77')}
              maskColor="rgba(245,248,247,.76)"
              pannable
              zoomable
            />
          </ReactFlow>
          <div
            ref={deleteZoneRef}
            className={`node-delete-dropzone ${nodeDeleteDrag ? 'is-visible' : ''} ${nodeDeleteDrag?.overZone ? 'is-hovered' : ''}`}
            data-node-trash-zone
            aria-hidden={!nodeDeleteDrag}
            aria-live="polite"
          >
            <span className="node-delete-dropzone__icon"><Trash2 size={19} /></span>
            <div>
              <strong>
                {nodeDeleteDrag?.overZone
                  ? `놓으면 ${nodeDeleteDrag.nodeIds.length}개 즉시 삭제`
                  : '여기에 놓아 삭제'}
              </strong>
              <small>대기 없이 삭제 · 실행 취소 가능</small>
            </div>
          </div>
          <div className={`node-delete-pan-hint ${nodeDeleteDrag ? 'is-visible' : ''}`} aria-hidden="true">
            <ChevronDown size={12} /> 박스 아래로 이동하면 화면 이동
          </div>
        </div>
        <StrategyPreview
          open={previewOpen}
          tab={previewTab}
          issues={issues}
          nodes={nodes}
          onToggle={() => setPreviewOpen((value) => !value)}
          onTab={setPreviewTab}
        />
        {message && (
          <div className="connection-toast" role="status">
            <span>{message}</span>
            {deleteUndoAvailable && (
              <button className="connection-toast__undo" onClick={undo}>
                <Undo2 size={13} /> 실행 취소
              </button>
            )}
            <button
              className="connection-toast__close"
              onClick={() => {
                setMessage(null);
                setDeleteUndoAvailable(false);
              }}
              aria-label="알림 닫기"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </section>

      <aside className={`inspector-panel pro-inspector ${tutorialStep === 4 ? 'tutorial-focus tutorial-focus--target tutorial-focus--panel' : ''}`}>
        <PanelHeading icon={<MousePointer2 size={16} />} eyebrow="INSPECTOR" title="전략 확인" />
        <div className={`validation-summary ${errors.length ? 'has-error' : warnings.length ? 'has-warning' : 'is-valid'}`}>
          <span>{errors.length ? <CircleAlert size={15} /> : warnings.length ? <AlertTriangle size={15} /> : <Check size={15} />}</span>
          <div>
            <strong>{errors.length ? `완료 차단 오류 ${errors.length}개` : warnings.length ? `확인할 경고 ${warnings.length}개` : '현재 구조 오류 없음'}</strong>
            <small>오류는 차단, 경고는 확인 후 진행, 정보는 동작 설명입니다.</small>
          </div>
        </div>

        <div className="inspector-scroll">
          {selectedData && selectedNode ? (
            <div className="node-inspector">
              <div className="node-inspector__head" style={{ '--block-color': selectedData.color } as React.CSSProperties}>
                <i />
                <span>{selectedData.stage}</span>
                <div className="node-inspector__title-row">
                  <strong>{selectedData.label}</strong>
                  <button type="button" className="node-help" aria-label="노드 설명 보기">
                    <CircleHelp size={15} />
                    <span className="node-help__tooltip" role="tooltip">
                      <strong>이 노드는 무엇을 하나요?</strong>
                      <p>{selectedData.description}</p>
                      {selectedData.formula && <code>{selectedData.formula}</code>}
                      {selectedData.dataCapability && <small>필요 데이터: {selectedData.dataCapability}</small>}
                      <em>설명은 기능 이해를 위한 것이며 특정 종목·수치·성과를 추천하지 않습니다.</em>
                    </span>
                  </button>
                </div>
                <p>{selectedData.detail}</p>
              </div>
              <div className="inspector-tabs" role="tablist" aria-label="노드 상세">
                <button role="tab" aria-selected={inspectorTab === 'settings'} onClick={() => setInspectorTab('settings')}>설정</button>
                <button role="tab" aria-selected={inspectorTab === 'ports'} onClick={() => setInspectorTab('ports')}>입력·출력</button>
                <button role="tab" aria-selected={inspectorTab === 'validation'} onClick={() => setInspectorTab('validation')}>
                  검증 {selectedIssues.length > 0 && <em>{selectedIssues.length}</em>}
                </button>
              </div>

              {inspectorTab === 'settings' && (
                <div className="inspector-tab-panel">
                  <label className="node-label-field">
                    <span>표시 이름</span>
                    <input value={selectedData.label} onChange={(event) => updateNodeLabel(selectedNode.id, event.target.value)} />
                  </label>
                  {selectedData.parameterSchema.length ? selectedData.parameterSchema.map((schema) => (
                    <ParameterField
                      key={schema.key}
                      schema={schema}
                      value={selectedData.parameters[schema.key]}
                      onChange={(value) => updateNodeParameter(selectedNode.id, schema.key, value)}
                    />
                  )) : (
                    <div className="data-requirement"><strong>추가 설정 없음</strong><p>연결된 입력 타입만 확인하면 됩니다.</p></div>
                  )}
                  {selectedData.disabled && (
                    <div className="data-requirement is-disabled"><strong>현재 비활성화됨</strong><p>연결은 보존되지만 실행과 계산에서 제외됩니다.</p></div>
                  )}
                </div>
              )}

              {inspectorTab === 'ports' && (
                <div className="inspector-tab-panel port-detail-list">
                  <strong>입력</strong>
                  {selectedData.inputs.length ? selectedData.inputs.map((port) => {
                    const current = effectivePort(selectedData, port);
                    return (
                      <article key={port.id}>
                        <PortSwatch port={current} />
                        <div><strong>{current.label}</strong><small>{current.type}{current.timeframe ? `<${current.timeframe}>` : ''}</small></div>
                        <em>{current.optional ? '선택' : '필수'}</em>
                      </article>
                    );
                  }) : <p>입력 없이 시작하는 노드입니다.</p>}
                  <strong>출력</strong>
                  {selectedData.outputs.length ? selectedData.outputs.map((port) => {
                    const current = effectivePort(selectedData, port);
                    return (
                      <article key={port.id}>
                        <PortSwatch port={current} />
                        <div><strong>{current.label}</strong><small>{current.type}{current.timeframe ? `<${current.timeframe}>` : ''}</small></div>
                        <em>{current.observation ? '관찰' : '실행'}</em>
                      </article>
                    );
                  }) : <p>오른쪽 출력이 없는 종단 노드입니다.</p>}
                  <div className="data-requirement"><strong>포트 읽는 법</strong><p>색은 카테고리, 모양은 데이터 타입입니다. 같은 모양이어도 시간축이 다르면 직접 연결되지 않습니다.</p></div>
                </div>
              )}

              {inspectorTab === 'validation' && (
                <div className="inspector-tab-panel strategy-issue-list">
                  {selectedIssues.length ? selectedIssues.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} />
                  )) : (
                    <div className="issue-empty"><Check size={16} /><span>이 노드에서 발견된 항목이 없습니다.</span></div>
                  )}
                </div>
              )}

              <div className="node-inspector__actions">
                <button onClick={duplicateSelected}><Copy size={13} /> 복제</button>
                <button onClick={toggleSelectedDisabled}>
                  {selectedData.disabled ? <Eye size={13} /> : <EyeOff size={13} />}
                  {selectedData.disabled ? '활성화' : '비활성화'}
                </button>
                <button onClick={deleteSelected}><Trash2 size={13} /> 삭제</button>
              </div>
            </div>
          ) : (
            <div className="strategy-summary-panel">
              <div className="summary-metrics">
                <article><Grid3X3 size={14} /><span>전략 노드</span><strong>{nodes.filter((node) => node.type === 'strategy').length}</strong></article>
                <article><ArrowRight size={14} /><span>연결</span><strong>{edges.length}</strong></article>
                <article><CircleAlert size={14} /><span>오류</span><strong>{errors.length}</strong></article>
                <article><AlertTriangle size={14} /><span>경고</span><strong>{warnings.length}</strong></article>
              </div>
              <div className="strategy-facts">
                <div><span>실행 시간축</span><strong>{String((nodes.find((node) => isStrategyNode(node) && node.data.blockId === 'price-bars')?.data as StrategyNodeData | undefined)?.parameters.timeframe || '미입력')}</strong></div>
                <div><span>최대 예상 노출</span><strong>{String((nodes.find((node) => isStrategyNode(node) && node.data.blockId === 'target-weight')?.data as StrategyNodeData | undefined)?.parameters.allocation || '미입력')}{(nodes.find((node) => isStrategyNode(node) && node.data.blockId === 'target-weight')?.data as StrategyNodeData | undefined)?.parameters.allocation !== '' ? '%' : ''}</strong></div>
                <div><span>필요 워밍업</span><strong>{String((nodes.find((node) => isStrategyNode(node) && node.data.blockId === 'moving-average')?.data as StrategyNodeData | undefined)?.parameters.period || '미입력')}</strong></div>
                <div><span>공유 상태</span><strong>본인 계정 전용</strong></div>
              </div>
              <div className="strategy-issue-list summary-issues">
                {issues.slice(0, 5).map((issue) => (
                  <button key={issue.id} onClick={() => issue.nodeId && selectNode(issue.nodeId)}>
                    <IssueCard issue={issue} compact />
                  </button>
                ))}
                {!issues.length && <div className="issue-empty"><Check size={16} /><span>현재 발견된 구조 문제가 없습니다.</span></div>}
              </div>
              <details className="sequence-list">
                <summary><ListTree size={14} /> 접근성용 실행 순서 목록</summary>
                <ol>
                  {flowSequence.map((node) => (
                    <li key={node.id}>
                      <span>{stageOrder[node.data.stage] + 1}</span>
                      <button onClick={() => selectNode(node.id)}>{node.data.stage} · {node.data.label}</button>
                    </li>
                  ))}
                </ol>
              </details>
            </div>
          )}
        </div>

        <dl className="inspect-stats">
          <div><dt>전체 노드</dt><dd>{nodes.filter((node) => node.type === 'strategy').length}</dd></div>
          <div><dt>연결</dt><dd>{edges.length}</dd></div>
          <div><dt>그룹</dt><dd>{groupCount}</dd></div>
          <div><dt>개인 블루프린트</dt><dd>{blueprints.length}</dd></div>
        </dl>
        <div className="inspector-note">
          <LockKeyhole size={15} />
          <p>블루프린트는 본인 계정에서만 저장·재사용되며 다른 사용자나 방에 공유할 수 없습니다.</p>
        </div>
      </aside>
    </div>
  );
}

function StrategyFlowNode({ id, data, selected }: NodeProps<Node<StrategyNodeData, 'strategy'>>) {
  const primaryParameters = data.parameterSchema.filter((schema) => schema.primary).slice(0, 2);
  const requiredMissing = data.parameterSchema.some(
    (schema) => schema.required && isMissing(data.parameters[schema.key]),
  );
  const candidateClass = (port: PortDefinition, side: 'source' | 'target') => {
    if (!data.connectionHint || !data.connectionDirection) return '';
    if (id === data.connectionNodeId) return 'is-origin';
    const isOpposite = data.connectionDirection === 'source' ? side === 'target' : side === 'source';
    if (!isOpposite) return '';
    return data.connectionCompatibleHandleIds?.includes(port.id) ? 'is-compatible' : 'is-incompatible';
  };
  const connectionCandidateState = data.connectionNodeState
    ? `is-connection-${data.connectionNodeState}`
    : '';
  const portTop = (index: number, total: number) => `${((index + 1) / (total + 1)) * 100}%`;
  const tutorialPortClass = (port: PortDefinition, side: 'source' | 'target') => {
    if (
      data.tutorialRole === 'connection-source'
      && side === 'source'
      && port.type === 'Universe'
    ) return 'tutorial-port-focus tutorial-focus--source';
    if (
      data.tutorialRole === 'connection-target'
      && side === 'target'
      && port.type === 'Universe'
    ) return 'tutorial-port-focus tutorial-focus--target';
    return '';
  };

  return (
    <article
      className={`strategy-flow-node ${selected ? 'is-selected' : ''} ${data.disabled ? 'is-disabled' : ''} ${data.locked ? 'is-locked' : ''} ${requiredMissing ? 'has-missing-input' : ''} ${connectionCandidateState} ${data.tutorialRole === 'settings-target' ? 'tutorial-focus tutorial-focus--source' : ''}`}
      style={{ '--block-color': data.color } as React.CSSProperties}
    >
      {data.inputs.map((port, index) => (
        <span
          key={port.id}
          className="node-port-wrap node-port-wrap--target"
          style={{ top: portTop(index, data.inputs.length) }}
        >
          <Handle
            id={port.id}
            type="target"
            position={Position.Left}
            className={`flow-port flow-port--target ${candidateClass(port, 'target')} ${tutorialPortClass(port, 'target')}`}
            isConnectable={!data.disabled && !data.locked}
            aria-label={`${port.label} ${port.type} 입력`}
            title={portTooltip(port, `${port.label} 입력`)}
          >
            <PortSwatch port={port} className="flow-port__glyph" />
          </Handle>
          <small>{port.label}{port.timeframe ? ` · ${port.timeframe}` : ''}</small>
        </span>
      ))}
      <div className="strategy-flow-node__top">
        <span>{data.stage}</span>
        <NodeIcon icon={data.icon} />
      </div>
      <strong>{data.label}</strong>
      <small>{data.detail}</small>
      {primaryParameters.length > 0 && (
        <div className="strategy-flow-node__fields">
          {primaryParameters.map((schema) => (
            <ParameterField
              key={schema.key}
              schema={schema}
              value={data.parameters[schema.key]}
              onChange={(value) => data.onParameterChange?.(id, schema.key, value)}
              compact
            />
          ))}
        </div>
      )}
      <em className={requiredMissing ? 'is-warning' : ''}>
        {data.disabled ? <><EyeOff size={11} /> 실행 제외</> : data.locked ? <><LockKeyhole size={11} /> 데이터 잠김</> : requiredMissing ? <><CircleAlert size={11} /> 필수값 입력 필요</> : <><Check size={11} /> 편집 가능</>}
      </em>
      {data.outputs.map((port, index) => (
        <span
          key={port.id}
          className="node-port-wrap node-port-wrap--source"
          style={{ top: portTop(index, data.outputs.length) }}
        >
          <small>{port.label}{port.timeframe ? ` · ${port.timeframe}` : ''}</small>
          <Handle
            id={port.id}
            type="source"
            position={Position.Right}
            className={`flow-port flow-port--source ${candidateClass(port, 'source')} ${tutorialPortClass(port, 'source')}`}
            isConnectable={!data.disabled && !data.locked}
            aria-label={`${port.label} ${port.type} 출력`}
            title={portTooltip(port, `${port.label} 출력`)}
          >
            <PortSwatch port={port} className="flow-port__glyph" />
          </Handle>
        </span>
      ))}
    </article>
  );
}

function NodeIcon({ icon }: { icon: string }) {
  const props = { size: 14 };
  if (icon === 'grid') return <Grid3X3 {...props} />;
  if (icon === 'wave') return <Activity {...props} />;
  if (icon === 'function') return <Sigma {...props} />;
  if (icon === 'bolt') return <Zap {...props} />;
  if (icon === 'pie') return <PieChart {...props} />;
  if (icon === 'shield') return <Shield {...props} />;
  if (icon === 'arrow') return <ArrowRight {...props} />;
  if (icon === 'eye') return <Eye {...props} />;
  if (icon === 'clock') return <Clock3 {...props} />;
  return <Box {...props} />;
}

function GroupFlowNode({ id, data, selected }: NodeProps<Node<GroupNodeData, 'group'>>) {
  const inputPorts = (data.proxyPorts ?? []).filter((port) => port.direction === 'input');
  const outputPorts = (data.proxyPorts ?? []).filter((port) => port.direction === 'output');
  const connectionCount = (data.proxyPorts ?? []).reduce((count, port) => count + port.count, 0);

  const renderProxyPort = (proxy: GroupProxyPort, index: number) => {
    const isInput = proxy.direction === 'input';
    return (
      <span
        key={proxy.id}
        className={`group-proxy-port group-proxy-port--${proxy.direction}`}
        style={{ top: COLLAPSED_GROUP_PORT_START + index * COLLAPSED_GROUP_PORT_GAP }}
      >
        <Handle
          id={proxy.id}
          type={isInput ? 'target' : 'source'}
          position={isInput ? Position.Left : Position.Right}
          className={`group-proxy-handle flow-port flow-port--${isInput ? 'target' : 'source'}`}
          isConnectable={false}
          aria-label={`${isInput ? '입력' : '출력'} ${proxy.port.type} 외부 연결 ${proxy.count}개`}
        >
          <PortSwatch port={proxy.port} className="flow-port__glyph" />
        </Handle>
        <span className="group-proxy-port__meta">
          <span>{isInput ? '입력' : '출력'}</span>
          <strong>{proxy.port.type}</strong>
          {proxy.port.timeframe && <small>{proxy.port.timeframe}</small>}
          <em aria-label={`${proxy.count}개 연결`}>{proxy.count}</em>
        </span>
        <span className="group-proxy-port__tooltip" role="tooltip">
          <strong>{isInput ? '그룹 입력' : '그룹 출력'} · {proxy.port.type}{proxy.port.timeframe ? ` · ${proxy.port.timeframe}` : ''}</strong>
          {proxy.connections.map((connection) => <small key={connection}>{connection}</small>)}
        </span>
      </span>
    );
  };

  return (
    <section className={`group-flow-node ${selected ? 'is-selected' : ''} ${data.collapsed ? 'is-collapsed' : ''}`}>
      <header>
        <div className="group-flow-node__identity">
          <button className="group-flow-node__toggle nodrag" onClick={() => data.onToggle(id)} aria-label={data.collapsed ? '그룹 펼치기' : '그룹 접기'}>
            {data.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <span className="group-flow-node__icon"><Layers3 size={14} /></span>
          <div>
            <strong>{data.label}</strong>
            <small>
              {data.count}개 노드 · {data.collapsed ? `외부 연결 ${connectionCount}개` : '함께 이동'}
            </small>
          </div>
        </div>
        <div className="group-flow-node__actions nodrag">
          <button onClick={() => data.onSaveBlueprint(id)} title="개인 블루프린트 저장"><Save size={13} /></button>
          <button onClick={() => data.onUngroup(id)} title="그룹 해제"><Ungroup size={13} /></button>
        </div>
      </header>
      {data.collapsed && inputPorts.map(
        (proxy, index) => renderProxyPort(proxy, index),
      )}
      {data.collapsed && outputPorts.map(
        (proxy, index) => renderProxyPort(proxy, index),
      )}
    </section>
  );
}

function IssueCard({
  issue,
  compact = false,
}: {
  issue: ValidationIssue;
  compact?: boolean;
}) {
  return (
    <article className={`strategy-issue is-${issue.severity} ${compact ? 'is-compact' : ''}`}>
      {issue.severity === 'error' ? <CircleAlert size={14} /> : issue.severity === 'warning' ? <AlertTriangle size={14} /> : <CircleHelp size={14} />}
      <div>
        <strong>{issue.title}</strong>
        {!compact && <p>{issue.message}</p>}
        {!compact && <small>해결: {issue.solution}</small>}
      </div>
    </article>
  );
}

function StrategyPreview({
  open,
  tab,
  issues,
  nodes,
  onToggle,
  onTab,
}: {
  open: boolean;
  tab: PreviewTab;
  issues: ValidationIssue[];
  nodes: FlowNode[];
  onToggle: () => void;
  onTab: (tab: PreviewTab) => void;
}) {
  const capabilities = Array.from(new Set(
    nodes
      .filter(isStrategyNode)
      .map((node) => node.data.dataCapability)
      .filter(Boolean),
  ));
  return (
    <section className={`strategy-preview ${open ? 'is-open' : ''}`}>
      <header>
        <button className="strategy-preview__toggle" onClick={onToggle}>
          <PanelBottom size={14} />
          미리보기·간편 검증
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div role="tablist" aria-label="전략 미리보기">
          <button role="tab" aria-selected={tab === 'market'} onClick={() => { onTab('market'); if (!open) onToggle(); }}>시장 차트</button>
          <button role="tab" aria-selected={tab === 'signal'} onClick={() => { onTab('signal'); if (!open) onToggle(); }}>신호 미리보기</button>
          <button role="tab" aria-selected={tab === 'validation'} onClick={() => { onTab('validation'); if (!open) onToggle(); }}>간편 검증</button>
          <button role="tab" aria-selected={tab === 'quality'} onClick={() => { onTab('quality'); if (!open) onToggle(); }}>데이터 품질</button>
        </div>
        <span>{issues.filter((issue) => issue.severity === 'error').length} 오류 · {issues.filter((issue) => issue.severity === 'warning').length} 경고</span>
      </header>
      {open && (
        <div className="strategy-preview__body">
          {tab === 'market' && (
            <div className="preview-chart">
              <div>
                <LineChart size={16} />
                <strong>사용자 데이터 연결 전 구조 미리보기</strong>
                <span>실제 가격이나 성과를 임의로 만들지 않습니다.</span>
              </div>
              <svg viewBox="0 0 720 90" role="img" aria-label="데이터가 연결되면 가격과 지표가 표시될 빈 차트">
                <path d="M0 74 H720 M0 45 H720 M0 16 H720" />
                <polyline points="0,60 80,60 150,48 230,48 300,35 390,35 470,53 550,53 630,28 720,28" />
              </svg>
              <p>이 선은 화면 구조 안내용이며 특정 종목의 가격·수익률·신호가 아닙니다.</p>
            </div>
          )}
          {tab === 'signal' && (
            <div className="preview-flow">
              <strong>실행 순서와 관찰 흐름</strong>
              <div>
                {nodes.filter(isStrategyNode).filter((node) => !node.data.disabled).sort(
                  (a, b) => (stageOrder[a.data.stage] ?? 0) - (stageOrder[b.data.stage] ?? 0),
                ).map((node) => (
                  <span key={node.id} style={{ '--block-color': node.data.color } as React.CSSProperties}>
                    <i />{node.data.label}
                  </span>
                ))}
              </div>
              <p>연결된 실제 데이터가 준비되면 신호 발생 시각을 표시합니다. 현재는 구조만 보여줍니다.</p>
            </div>
          )}
          {tab === 'validation' && (
            <div className="preview-validation">
              <article><span>A</span><div><strong>자동 2구간 검증 1회</strong><p>사용자가 기간을 정하면 앞·뒤 구간을 나눠 동일 비용 가정으로 검사합니다.</p></div></article>
              <article><span>B</span><div><strong>사용자 설정 검증 1회</strong><p>시작·종료일, 수수료, 슬리피지, 초기 가상자금을 실행 전에 직접 확인합니다.</p></div></article>
              <aside><ShieldCheck size={15} /> 배당·기업행사 반영 범위와 사용 가능 데이터 시작일은 실행 직전에 다시 표시합니다.</aside>
            </div>
          )}
          {tab === 'quality' && (
            <div className="preview-quality">
              <div><Database size={16} /><strong>필요 데이터 능력</strong><span>{capabilities.length || 0}개</span></div>
              {capabilities.length ? capabilities.map((capability) => (
                <article key={capability}>
                  <Check size={13} />
                  <span>{capability}</span>
                  <strong>{capability === 'short_availability_live' ? '현재 미지원' : '데모 정의됨'}</strong>
                </article>
              )) : <p>데이터 능력이 명시된 노드가 없습니다.</p>}
              <small>실제 최신성·결측·기업행사 상태는 공급자 연결 후 서버 기준으로 표시합니다.</small>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PanelHeading({
  icon,
  eyebrow,
  title,
  count,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  count?: number;
}) {
  return (
    <div className="panel-heading">
      <span>{icon}</span>
      <div><small>{eyebrow}</small><h2>{title}</h2></div>
      {typeof count === 'number' && <em>{count}</em>}
    </div>
  );
}
