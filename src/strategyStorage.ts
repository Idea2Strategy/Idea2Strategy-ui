import type { BasicBlockKind, Mode } from './types';

export type StrategyMeta = {
  id: string;
  name: string;
  mode: Mode;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

export type StrategyWorkspace = {
  activeStrategyId: string;
  strategies: StrategyMeta[];
};

export type StrategyVersion = {
  id: string;
  number: number;
  strategyName: string;
  mode: Mode;
  createdAt: string;
  summary: string;
  basicSnapshot: string | null;
  proSnapshot: string | null;
};

export type BasicEditorValues = Record<
  BasicBlockKind,
  Record<string, string | number | boolean>
>;

export type BasicEditorSnapshot = {
  blockIds: BasicBlockKind[];
  values: BasicEditorValues;
};

const workspaceKey = 'i2s-strategy-workspace-v1';
const activeStrategyKey = 'i2s-active-strategy-id';

export function basicEditorStorageKey(strategyId: string) {
  return `i2s-strategy-basic-v1:${strategyId}`;
}

export function proEditorStorageKey(strategyId: string) {
  return `i2s-strategy-pro-v1:${strategyId}`;
}

function strategyVersionStorageKey(strategyId: string) {
  return `i2s-strategy-versions-v1:${strategyId}`;
}

function createDefaultWorkspace(): StrategyWorkspace {
  const now = new Date().toISOString();
  const strategy: StrategyMeta = {
    id: `strategy-${Date.now()}`,
    name: '새 전략',
    mode: 'basic',
    createdAt: now,
    updatedAt: now,
  };
  return {
    activeStrategyId: strategy.id,
    strategies: [strategy],
  };
}

function isMode(value: unknown): value is Mode {
  return value === 'basic' || value === 'pro';
}

function isStrategyMeta(value: unknown): value is StrategyMeta {
  if (!value || typeof value !== 'object') return false;
  const strategy = value as Partial<StrategyMeta>;
  return typeof strategy.id === 'string'
    && typeof strategy.name === 'string'
    && isMode(strategy.mode)
    && typeof strategy.createdAt === 'string'
    && typeof strategy.updatedAt === 'string'
    && (strategy.archivedAt === undefined || typeof strategy.archivedAt === 'string');
}

function isStrategyVersion(value: unknown): value is StrategyVersion {
  if (!value || typeof value !== 'object') return false;
  const version = value as Partial<StrategyVersion>;
  return typeof version.id === 'string'
    && typeof version.number === 'number'
    && typeof version.strategyName === 'string'
    && isMode(version.mode)
    && typeof version.createdAt === 'string'
    && typeof version.summary === 'string'
    && (version.basicSnapshot === null || typeof version.basicSnapshot === 'string')
    && (version.proSnapshot === null || typeof version.proSnapshot === 'string');
}

export function loadStrategyWorkspace(): StrategyWorkspace {
  try {
    const stored = window.localStorage.getItem(workspaceKey);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<StrategyWorkspace>;
      const strategies = Array.isArray(parsed.strategies)
        ? parsed.strategies.filter(isStrategyMeta)
        : [];
      if (strategies.length) {
        const activeStrategies = strategies.filter((strategy) => !strategy.archivedAt);
        if (!activeStrategies.length) {
          const replacement = createStrategyMeta('basic', strategies.length + 1);
          const repaired = {
            activeStrategyId: replacement.id,
            strategies: [replacement, ...strategies],
          };
          saveStrategyWorkspace(repaired);
          return repaired;
        }
        const preferredId = window.localStorage.getItem(activeStrategyKey)
          ?? parsed.activeStrategyId;
        const activeStrategyId = activeStrategies.some((strategy) => strategy.id === preferredId)
          ? preferredId!
          : activeStrategies[0].id;
        return { activeStrategyId, strategies };
      }
    }
  } catch {}
  const fallback = createDefaultWorkspace();
  saveStrategyWorkspace(fallback);
  return fallback;
}

export function saveStrategyWorkspace(workspace: StrategyWorkspace) {
  window.localStorage.setItem(workspaceKey, JSON.stringify(workspace));
  window.localStorage.setItem(activeStrategyKey, workspace.activeStrategyId);
}

export function createStrategyMeta(mode: Mode, index: number): StrategyMeta {
  const now = new Date().toISOString();
  return {
    id: `strategy-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    name: `새 ${mode === 'basic' ? 'Basic' : 'Pro'} 전략 ${index}`,
    mode,
    createdAt: now,
    updatedAt: now,
  };
}

export function copyStrategyEditorData(sourceId: string, targetId: string) {
  const pairs = [
    [basicEditorStorageKey(sourceId), basicEditorStorageKey(targetId)],
    [proEditorStorageKey(sourceId), proEditorStorageKey(targetId)],
  ];
  pairs.forEach(([sourceKey, targetKey]) => {
    const value = window.localStorage.getItem(sourceKey);
    if (value) window.localStorage.setItem(targetKey, value);
  });
}

export function removeStrategyEditorData(strategyId: string) {
  window.localStorage.removeItem(basicEditorStorageKey(strategyId));
  window.localStorage.removeItem(proEditorStorageKey(strategyId));
  window.localStorage.removeItem(strategyVersionStorageKey(strategyId));
}

export function loadBasicEditorSnapshot(strategyId: string): BasicEditorSnapshot | null {
  try {
    const stored = window.localStorage.getItem(basicEditorStorageKey(strategyId));
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<BasicEditorSnapshot>;
    if (!Array.isArray(parsed.blockIds) || !parsed.values || typeof parsed.values !== 'object') {
      return null;
    }
    return parsed as BasicEditorSnapshot;
  } catch {
    return null;
  }
}

export function saveBasicEditorSnapshot(strategyId: string, snapshot: BasicEditorSnapshot) {
  window.localStorage.setItem(basicEditorStorageKey(strategyId), JSON.stringify(snapshot));
}

export function loadStrategyVersions(strategyId: string): StrategyVersion[] {
  try {
    const stored = window.localStorage.getItem(strategyVersionStorageKey(strategyId));
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStrategyVersion).sort((left, right) => right.number - left.number);
  } catch {
    return [];
  }
}

export function createStrategyVersion(strategy: StrategyMeta, summary: string): StrategyVersion {
  const versions = loadStrategyVersions(strategy.id);
  const version: StrategyVersion = {
    id: `version-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    number: Math.max(0, ...versions.map((item) => item.number)) + 1,
    strategyName: strategy.name,
    mode: strategy.mode,
    createdAt: new Date().toISOString(),
    summary,
    basicSnapshot: window.localStorage.getItem(basicEditorStorageKey(strategy.id)),
    proSnapshot: window.localStorage.getItem(proEditorStorageKey(strategy.id)),
  };
  window.localStorage.setItem(
    strategyVersionStorageKey(strategy.id),
    JSON.stringify([version, ...versions]),
  );
  return version;
}

export function restoreStrategyVersion(strategyId: string, version: StrategyVersion) {
  if (version.basicSnapshot === null) {
    window.localStorage.removeItem(basicEditorStorageKey(strategyId));
  } else {
    window.localStorage.setItem(basicEditorStorageKey(strategyId), version.basicSnapshot);
  }
  if (version.proSnapshot === null) {
    window.localStorage.removeItem(proEditorStorageKey(strategyId));
  } else {
    window.localStorage.setItem(proEditorStorageKey(strategyId), version.proSnapshot);
  }
}

export function formatStrategyUpdatedAt(value: string) {
  const updated = new Date(value).getTime();
  const seconds = Math.max(0, Math.round((Date.now() - updated) / 1000));
  if (seconds < 30) return '방금 저장';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전 저장`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전 저장`;
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
