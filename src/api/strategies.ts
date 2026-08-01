export type StrategyMode = 'BASIC' | 'PRO';

export interface StrategyLibraryItem {
  id: string;
  kind: 'draft' | 'released' | 'package' | 'template';
  mode: StrategyMode;
  name: string;
  description: string | null;
  status: string;
  validationStatus: string | null;
  backtestStatus: string | null;
  editable: boolean;
  updatedAt: string;
  version: string | null;
}

export interface StrategyLibraryPage {
  items: StrategyLibraryItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface StrategyLibraryClient {
  list(limit?: number, cursor?: string, signal?: AbortSignal): Promise<StrategyLibraryPage>;
}

interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null;
}

const MODES = new Set<StrategyMode>(['BASIC', 'PRO']);
const KINDS = new Set<StrategyLibraryItem['kind']>(['draft', 'released', 'package', 'template']);

export function createStrategyLibraryClient({
  baseUrl = '',
  fetchImpl = fetch,
  getAccessToken,
}: ClientOptions = {}): StrategyLibraryClient {
  const root = baseUrl.replace(/\/$/, '');
  return {
    async list(limit = 50, cursor, signal) {
      const query = new URLSearchParams({ limit: String(limit) });
      if (cursor) query.set('cursor', cursor);
      const token = getAccessToken?.();
      const response = await fetchImpl(`${root}/api/v1/strategies?${query.toString()}`, {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal,
      });
      if (!response.ok) {
        throw new Error(`Strategy library request failed (${response.status})`);
      }
      return readPage(await response.json());
    },
  };
}

function readPage(value: unknown): StrategyLibraryPage {
  const page = object(value, 'Invalid strategy library response');
  if (!Array.isArray(page.items)) throw new Error('Invalid strategy library items');
  return {
    items: page.items.map(readItem),
    nextCursor: nullableString(page.nextCursor, 'nextCursor'),
    hasMore: boolean(page.hasMore, 'hasMore'),
  };
}

function readItem(value: unknown): StrategyLibraryItem {
  const item = object(value, 'Invalid strategy library item');
  const mode = string(item.mode, 'mode');
  const kind = string(item.kind, 'kind');
  if (!MODES.has(mode as StrategyMode)) throw new Error(`Unsupported strategy mode: ${mode}`);
  if (!KINDS.has(kind as StrategyLibraryItem['kind'])) throw new Error(`Unsupported strategy kind: ${kind}`);
  return {
    id: string(item.id, 'id'),
    kind: kind as StrategyLibraryItem['kind'],
    mode: mode as StrategyMode,
    name: string(item.name, 'name'),
    description: nullableString(item.description, 'description'),
    status: string(item.status, 'status'),
    validationStatus: nullableString(item.validationStatus, 'validationStatus'),
    backtestStatus: nullableString(item.backtestStatus, 'backtestStatus'),
    editable: boolean(item.editable, 'editable'),
    updatedAt: string(item.updatedAt, 'updatedAt'),
    version: nullableString(item.version, 'version'),
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(label);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid ${label}`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : string(value, label);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}`);
  return value;
}

export const defaultStrategyLibraryClient = createStrategyLibraryClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
});
