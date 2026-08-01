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

export interface StrategyDocument {
  strategyId: string;
  semanticDocument: Record<string, unknown>;
  presentationDocument: Record<string, unknown>;
  semanticSchemaVersion: string;
  presentationSchemaVersion: string;
  semanticHash: string;
  presentationHash: string;
  editSequence: number;
  updatedAt: string;
}

export interface StrategyEditLease {
  leaseToken: string;
  expiresAt: string;
}

export interface SaveStrategyDocumentInput {
  expectedEditSequence: number;
  leaseToken: string;
  semanticDocument: Record<string, unknown>;
  presentationDocument: Record<string, unknown>;
}

export interface StrategyAuthoringClient {
  createBasic(name: string, description?: string, signal?: AbortSignal): Promise<{ id: string; mode: 'BASIC' }>;
  getDocument(strategyId: string, signal?: AbortSignal): Promise<StrategyDocument>;
  acquireLease(strategyId: string, signal?: AbortSignal): Promise<StrategyEditLease>;
  heartbeatLease(strategyId: string, leaseToken: string, signal?: AbortSignal): Promise<{ expiresAt: string }>;
  releaseLease(strategyId: string, leaseToken: string, signal?: AbortSignal): Promise<void>;
  saveDocument(strategyId: string, input: SaveStrategyDocumentInput, signal?: AbortSignal): Promise<StrategyDocument>;
}

export interface BasicCatalogInstrument {
  id: string;
  assetType: string;
  primaryExchangeMic: string;
  currencyCode: string;
  symbol: string;
}

export interface BasicStrategyCatalog {
  version: {
    id: string;
    languageVersion: string;
    schemaVersion: string;
    catalogVersion: string;
    dataRequirementVersion: string;
    definitionHash: string;
    publishedAt: string;
    retiredAt: string | null;
  };
  elements: Array<{
    id: string;
    catalogId: string;
    elementCode: string;
    elementKind: string;
    parameterSchema: Record<string, unknown>;
    inputPortSchema: Record<string, unknown>;
    outputPortSchema: Record<string, unknown>;
    executionContract: Record<string, unknown>;
    definitionHash: string;
  }>;
  features: Array<{
    id: string;
    catalogId: string;
    featureCode: string;
    calculatorVersion: string;
    resolution: string;
    normalizedParameters: Record<string, unknown>;
    outputValueType: string;
    requiredHistoryPoints: number;
    definitionHash: string;
  }>;
  instruments: BasicCatalogInstrument[];
}

export interface StrategyCatalogClient {
  getBasic(signal?: AbortSignal): Promise<BasicStrategyCatalog>;
}

export class StrategyApiError extends Error {
  constructor(public readonly status: number, operation: string) {
    super(`${operation} failed (${status})`);
    this.name = 'StrategyApiError';
  }
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

export function createStrategyAuthoringClient({
  baseUrl = '',
  fetchImpl = fetch,
  getAccessToken,
}: ClientOptions = {}): StrategyAuthoringClient {
  const root = baseUrl.replace(/\/$/, '');
  const request = async (path: string, operation: string, init: RequestInit = {}) => {
    const token = getAccessToken?.();
    const response = await fetchImpl(`${root}${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) throw new StrategyApiError(response.status, operation);
    return response;
  };
  const leasePath = (strategyId: string) => `/api/v1/strategies/${encodeURIComponent(strategyId)}/edit-lease`;
  const documentPath = (strategyId: string) => `/api/v1/strategies/${encodeURIComponent(strategyId)}/document`;

  return {
    async createBasic(name, description, signal) {
      const response = await request('/api/v1/strategies', 'Strategy creation', {
        method: 'POST', signal,
        body: JSON.stringify({ name, description: description?.trim() || null, mode: 'BASIC' }),
      });
      const result = object(await response.json(), 'Invalid strategy creation response');
      const mode = string(result.mode, 'mode');
      if (mode !== 'BASIC') throw new Error(`Unsupported strategy mode: ${mode}`);
      return { id: string(result.id, 'id'), mode };
    },
    async getDocument(strategyId, signal) {
      const response = await request(documentPath(strategyId), 'Strategy document request', { signal });
      return readDocument(await response.json());
    },
    async acquireLease(strategyId, signal) {
      const response = await request(leasePath(strategyId), 'Strategy edit lease acquisition', { method: 'POST', signal });
      const result = object(await response.json(), 'Invalid strategy edit lease response');
      return { leaseToken: string(result.leaseToken, 'leaseToken'), expiresAt: string(result.expiresAt, 'expiresAt') };
    },
    async heartbeatLease(strategyId, leaseToken, signal) {
      const response = await request(leasePath(strategyId), 'Strategy edit lease heartbeat', {
        method: 'PUT', signal, body: JSON.stringify({ leaseToken }),
      });
      const result = object(await response.json(), 'Invalid strategy edit lease response');
      return { expiresAt: string(result.expiresAt, 'expiresAt') };
    },
    async releaseLease(strategyId, leaseToken, signal) {
      await request(leasePath(strategyId), 'Strategy edit lease release', {
        method: 'DELETE', signal, body: JSON.stringify({ leaseToken }),
      });
    },
    async saveDocument(strategyId, input, signal) {
      const response = await request(documentPath(strategyId), 'Strategy document save', {
        method: 'PUT', signal, body: JSON.stringify(input),
      });
      return readDocument(await response.json());
    },
  };
}

export function createStrategyCatalogClient({
  baseUrl = '',
  fetchImpl = fetch,
  getAccessToken,
}: ClientOptions = {}): StrategyCatalogClient {
  const root = baseUrl.replace(/\/$/, '');
  return {
    async getBasic(signal) {
      const query = new URLSearchParams({
        languageVersion: 'basic/v1',
        schemaVersion: 'schema/v1',
        catalogVersion: 'catalog/v1',
      });
      const token = getAccessToken?.();
      const response = await fetchImpl(`${root}/api/v1/strategy-catalogs/basic?${query.toString()}`, {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal,
      });
      if (!response.ok) throw new StrategyApiError(response.status, 'Basic strategy catalog request');
      return readBasicCatalog(await response.json());
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

function readDocument(value: unknown): StrategyDocument {
  const document = object(value, 'Invalid strategy document response');
  return {
    strategyId: string(document.strategyId, 'strategyId'),
    semanticDocument: object(document.semanticDocument, 'Invalid semanticDocument'),
    presentationDocument: object(document.presentationDocument, 'Invalid presentationDocument'),
    semanticSchemaVersion: string(document.semanticSchemaVersion, 'semanticSchemaVersion'),
    presentationSchemaVersion: string(document.presentationSchemaVersion, 'presentationSchemaVersion'),
    semanticHash: string(document.semanticHash, 'semanticHash'),
    presentationHash: string(document.presentationHash, 'presentationHash'),
    editSequence: nonNegativeInteger(document.editSequence, 'editSequence'),
    updatedAt: string(document.updatedAt, 'updatedAt'),
  };
}

function readBasicCatalog(value: unknown): BasicStrategyCatalog {
  const catalog = object(value, 'Invalid Basic strategy catalog response');
  const version = object(catalog.version, 'Invalid Basic strategy catalog version');
  if (!Array.isArray(catalog.elements) || !Array.isArray(catalog.features) || !Array.isArray(catalog.instruments)) {
    throw new Error('Invalid Basic strategy catalog collections');
  }
  return {
    version: {
      id: string(version.id, 'catalog version id'),
      languageVersion: string(version.languageVersion, 'languageVersion'),
      schemaVersion: string(version.schemaVersion, 'schemaVersion'),
      catalogVersion: string(version.catalogVersion, 'catalogVersion'),
      dataRequirementVersion: string(version.dataRequirementVersion, 'dataRequirementVersion'),
      definitionHash: string(version.definitionHash, 'catalog definitionHash'),
      publishedAt: string(version.publishedAt, 'publishedAt'),
      retiredAt: nullableString(version.retiredAt, 'retiredAt'),
    },
    elements: catalog.elements.map((value) => {
      const element = object(value, 'Invalid Basic strategy catalog element');
      return {
        id: string(element.id, 'element id'),
        catalogId: string(element.catalogId, 'element catalogId'),
        elementCode: string(element.elementCode, 'elementCode'),
        elementKind: string(element.elementKind, 'elementKind'),
        parameterSchema: object(element.parameterSchema, 'Invalid parameterSchema'),
        inputPortSchema: object(element.inputPortSchema, 'Invalid inputPortSchema'),
        outputPortSchema: object(element.outputPortSchema, 'Invalid outputPortSchema'),
        executionContract: object(element.executionContract, 'Invalid executionContract'),
        definitionHash: string(element.definitionHash, 'element definitionHash'),
      };
    }),
    features: catalog.features.map((value) => {
      const feature = object(value, 'Invalid Basic strategy catalog feature');
      return {
        id: string(feature.id, 'feature id'),
        catalogId: string(feature.catalogId, 'feature catalogId'),
        featureCode: string(feature.featureCode, 'featureCode'),
        calculatorVersion: string(feature.calculatorVersion, 'calculatorVersion'),
        resolution: string(feature.resolution, 'resolution'),
        normalizedParameters: object(feature.normalizedParameters, 'Invalid normalizedParameters'),
        outputValueType: string(feature.outputValueType, 'outputValueType'),
        requiredHistoryPoints: nonNegativeInteger(feature.requiredHistoryPoints, 'requiredHistoryPoints'),
        definitionHash: string(feature.definitionHash, 'feature definitionHash'),
      };
    }),
    instruments: catalog.instruments.map((value) => {
      const instrument = object(value, 'Invalid Basic strategy catalog instrument');
      return {
        id: string(instrument.id, 'instrument id'),
        assetType: string(instrument.assetType, 'assetType'),
        primaryExchangeMic: string(instrument.primaryExchangeMic, 'primaryExchangeMic'),
        currencyCode: string(instrument.currencyCode, 'currencyCode'),
        symbol: string(instrument.symbol, 'symbol'),
      };
    }),
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

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`Invalid ${label}`);
  return value as number;
}

export const defaultStrategyLibraryClient = createStrategyLibraryClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
});

export const defaultStrategyAuthoringClient = createStrategyAuthoringClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
});

export const defaultStrategyCatalogClient = createStrategyCatalogClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
});
