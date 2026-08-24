import { getSessionAccessToken } from './sessionAccessToken';

export type UserCaseType = 'INQUIRY' | 'REPORT' | 'APPEAL';
export type UserCaseStatus = 'OPEN' | 'NEEDS_INFORMATION' | 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED';
export type OperatorCaseAction =
  | 'ASSIGN' | 'REASSIGN' | 'UNASSIGN' | 'START_REVIEW' | 'REQUEST_INFORMATION'
  | 'RESOLVE' | 'REJECT' | 'APPLY_SANCTION' | 'RELEASE_SANCTION';
export type SanctionType = 'SUSPENSION' | 'PERMANENT';

export interface EvidenceReference {
  storageObjectId: string;
  sourceDomain: string;
  sourceResourceId: string;
}

export interface UserCaseView {
  id: string;
  accountId: string;
  type: UserCaseType;
  status: UserCaseStatus;
  version: number;
  evidenceObjectIds: string[];
  updatedAt: string;
}

export interface UserCaseSummary {
  id: string;
  type: UserCaseType;
  status: UserCaseStatus;
  subject: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserCasePage {
  items: UserCaseSummary[];
  nextCursor: string | null;
}

export interface UserCaseHistoryItem {
  actor: 'CUSTOMER' | 'SUPPORT' | 'SYSTEM';
  status: UserCaseStatus;
  message: string;
  createdAt: string;
}

export interface UserCaseDetail {
  id: string;
  type: UserCaseType;
  status: UserCaseStatus;
  subject: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  responseDeadlineAt: string | null;
  history: UserCaseHistoryItem[];
}

export interface OperatorEvidenceView {
  evidenceId: string;
  kind: string;
  status: string;
  sourceDomain: string;
  ownershipVerified: boolean;
  linkedAt: string;
  attributes: Record<string, unknown>;
}

export interface OperatorCaseSummary {
  caseId: string;
  type: UserCaseType;
  status: UserCaseStatus;
  version: number;
  assigneeOperatorId: string | null;
  updatedAt: string;
}

export interface OperatorCaseDetail extends OperatorCaseSummary {
  evidence: OperatorEvidenceView[];
}

export interface OperatorCasePage {
  items: OperatorCaseSummary[];
  nextCursor: string | null;
}

export interface CommandReceipt {
  status?: string;
  code: string;
  correlationId: string;
  caseVersion?: number;
  aggregateVersion?: number;
  assignmentId?: string | null;
  sanctionReference?: string;
}

export class AccountOperationsApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly correlationId: string | null,
  ) {
    super(code);
    this.name = 'AccountOperationsApiError';
  }

  get permissionDenied() { return this.status === 401 || this.status === 403; }
  get conflict() { return this.status === 409; }
  get retryable() { return this.status === 0 || this.status === 429 || this.status >= 500; }
}

interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null;
  getOperatorCsrfToken?: () => string | null;
  createCorrelationId?: () => string;
}

export interface AccountOperationsClient {
  submitCase(input: { type: UserCaseType; subject: string; description: string; evidence: EvidenceReference[] }, idempotencyKey: string, signal?: AbortSignal): Promise<UserCaseView>;
  addCaseEvidence(caseId: string, expectedVersion: number, evidence: EvidenceReference[], idempotencyKey: string, signal?: AbortSignal): Promise<UserCaseView>;
  userCases(cursor?: string | null, limit?: number, signal?: AbortSignal): Promise<UserCasePage>;
  userCase(caseId: string, signal?: AbortSignal): Promise<UserCaseDetail>;
  operatorCaseQueue(query: { types: UserCaseType[]; statuses?: UserCaseStatus[]; assigneeOperatorId?: string; cursor?: string; limit?: number }, signal?: AbortSignal): Promise<OperatorCasePage>;
  operatorCase(caseId: string, signal?: AbortSignal): Promise<OperatorCaseDetail>;
  commandCase(caseId: string, action: OperatorCaseAction, input: {
    expectedVersion: number;
    assigneeOperatorId?: string | null;
    reasonCode: string;
    customerMessage?: string | null;
    evidenceIds?: string[];
    sanctionId?: string | null;
    sanctionType?: SanctionType | null;
    sanctionExpiresAt?: string | null;
    expectedSanctionVersion?: number;
  }, idempotencyKey: string, signal?: AbortSignal): Promise<CommandReceipt>;
  grantOperator(input: { targetOperatorId: string; roleId: string; expiresAt?: string | null; reasonCode: string }, idempotencyKey: string, signal?: AbortSignal): Promise<CommandReceipt>;
  revokeOperator(input: { targetOperatorId: string; assignmentId: string; reasonCode: string }, idempotencyKey: string, signal?: AbortSignal): Promise<CommandReceipt>;
  applySanction(accountId: string, input: { sanctionId: string; type: SanctionType; reasonCode: string; expiresAt?: string | null; sourceCaseId?: string | null; expectedVersion: number }, idempotencyKey: string, signal?: AbortSignal): Promise<CommandReceipt>;
  liftSanction(accountId: string, sanctionId: string, input: { reasonCode: string; expectedVersion: number }, idempotencyKey: string, signal?: AbortSignal): Promise<CommandReceipt>;
}

export function createAccountOperationsClient({
  baseUrl = '', fetchImpl = fetch, getAccessToken, getOperatorCsrfToken,
  createCorrelationId = () => crypto.randomUUID(),
}: ClientOptions = {}): AccountOperationsClient {
  const root = baseUrl.replace(/\/$/, '');
  const request = async (
    path: string,
    init: RequestInit = {},
    correlationId = createCorrelationId(),
    token = getAccessToken?.(),
    credentials: RequestCredentials = 'include',
  ) => {
    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        ...init, credentials,
        headers: {
          Accept: 'application/json', 'X-Correlation-Id': correlationId,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers,
        },
      });
    } catch {
      throw new AccountOperationsApiError(0, 'NETWORK_ERROR', correlationId);
    }
    if (!response.ok) throw await readError(response, correlationId);
    return response;
  };
  const operatorRequest = (path: string, init: RequestInit = {}, correlationId = createCorrelationId()) => {
    const csrf = getOperatorCsrfToken?.();
    return request(path, { ...init, headers: { ...(csrf ? { 'X-Operator-CSRF': csrf } : {}), ...init.headers } },
      correlationId, null, 'include');
  };
  const commandBody = async (input: Record<string, unknown>, idempotencyKey: string) => {
    const correlationId = createCorrelationId();
    return { ...input, correlationId, idempotencyKey, requestHash: await sha256(stableJson(input)) };
  };

  return {
    async submitCase(input, idempotencyKey, signal) {
      return readUserCase(await json(await request('/api/v1/cases', {
        method: 'POST', signal, headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input),
      })));
    },
    async addCaseEvidence(caseId, expectedVersion, evidence, idempotencyKey, signal) {
      return readUserCase(await json(await request(`/api/v1/cases/${encodeURIComponent(caseId)}/evidence`, {
        method: 'POST', signal, headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ expectedVersion, evidence }),
      })));
    },
    async userCases(cursor = null, limit = 10, signal) {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      return readUserCasePage(await json(await request(`/api/v1/cases?${params}`, { signal })));
    },
    async userCase(caseId, signal) {
      return readUserCaseDetail(await json(await request(`/api/v1/cases/${encodeURIComponent(caseId)}`, { signal })));
    },
    async operatorCaseQueue(query, signal) {
      const params = new URLSearchParams();
      query.types.forEach((value) => params.append('type', value));
      query.statuses?.forEach((value) => params.append('status', value));
      if (query.assigneeOperatorId) params.set('assigneeOperatorId', query.assigneeOperatorId);
      if (query.cursor) params.set('cursor', query.cursor);
      params.set('limit', String(query.limit ?? 50));
      return readOperatorPage(await json(await operatorRequest(`/api/v1/operations/cases?${params}`, { signal })));
    },
    async operatorCase(caseId, signal) {
      return readOperatorDetail(await json(await operatorRequest(`/api/v1/operations/cases/${encodeURIComponent(caseId)}`, { signal })));
    },
    async commandCase(caseId, action, input, idempotencyKey, signal) {
      return readReceipt(await json(await operatorRequest(`/api/v1/operations/cases/${encodeURIComponent(caseId)}/commands/${action}`, {
        method: 'POST', signal, headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          expectedVersion: input.expectedVersion, assigneeOperatorId: input.assigneeOperatorId ?? null,
          reasonCode: input.reasonCode, customerMessage: input.customerMessage ?? null,
          evidenceIds: input.evidenceIds ?? [], sanctionId: input.sanctionId ?? null,
          sanctionType: input.sanctionType ?? null, sanctionExpiresAt: input.sanctionExpiresAt ?? null,
          expectedSanctionVersion: input.expectedSanctionVersion ?? 0,
        }),
      })));
    },
    async grantOperator(input, idempotencyKey, signal) {
      const body = await commandBody({ ...input, expiresAt: input.expiresAt ?? null }, idempotencyKey);
      return readReceipt(await json(await operatorRequest('/api/v1/operations/rbac/assignments/grants', {
        method: 'POST', signal, body: JSON.stringify(body),
      }, String(body.correlationId))));
    },
    async revokeOperator(input, idempotencyKey, signal) {
      const body = await commandBody(input, idempotencyKey);
      return readReceipt(await json(await operatorRequest('/api/v1/operations/rbac/assignments/revocations', {
        method: 'POST', signal, body: JSON.stringify(body),
      }, String(body.correlationId))));
    },
    async applySanction(accountId, input, idempotencyKey, signal) {
      const body = await commandBody({ ...input, expiresAt: input.expiresAt ?? null, sourceCaseId: input.sourceCaseId ?? null }, idempotencyKey);
      return readReceipt(await json(await operatorRequest(`/api/v1/operations/accounts/${encodeURIComponent(accountId)}/sanctions`, {
        method: 'POST', signal, body: JSON.stringify(body),
      }, String(body.correlationId))));
    },
    async liftSanction(accountId, sanctionId, input, idempotencyKey, signal) {
      const body = await commandBody(input, idempotencyKey);
      return readReceipt(await json(await operatorRequest(`/api/v1/operations/accounts/${encodeURIComponent(accountId)}/sanctions/${encodeURIComponent(sanctionId)}:lift`, {
        method: 'POST', signal, body: JSON.stringify(body),
      }, String(body.correlationId))));
    },
  };
}

export interface AdminMcpClient {
  invoke(toolName: string, input: { registryVersion: string; requestSchemaVersion: string; targetId: string; targetVersion?: number | null; input: Record<string, unknown> }, idempotencyKey: string, signal?: AbortSignal): Promise<{ status: string; code: string; result: Record<string, unknown>; correlationId: string }>;
}

export function createAdminMcpClient(options: ClientOptions = {}): AdminMcpClient {
  const root = (options.baseUrl ?? '').replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const correlation = options.createCorrelationId ?? (() => crypto.randomUUID());
  return {
    async invoke(toolName, input, idempotencyKey, signal) {
      const correlationId = correlation();
      const csrf = options.getOperatorCsrfToken?.();
      let response: Response;
      try {
        response = await fetchImpl(`${root}/mcp/v1/tools/${encodeURIComponent(toolName)}:invoke`, {
          method: 'POST', signal, credentials: 'include',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey, 'X-Correlation-Id': correlationId, ...(csrf ? { 'X-Operator-CSRF': csrf } : {}) },
          body: JSON.stringify({ ...input, targetVersion: input.targetVersion ?? null }),
        });
      } catch {
        throw new AccountOperationsApiError(0, 'NETWORK_ERROR', correlationId);
      }
      if (!response.ok) throw await readError(response, correlationId);
      const value = object(await json(response));
      return {
        status: text(value.status, 'status'), code: text(value.code, 'code'),
        result: object(value.result), correlationId: text(value.correlationId, 'correlationId'),
      };
    },
  };
}

async function readError(response: Response, fallbackCorrelationId: string) {
  let body: Record<string, unknown> = {};
  try { body = object(await response.json()); } catch { /* keep protocol fallback */ }
  const code = typeof body.code === 'string' ? body.code
    : typeof body.title === 'string' ? body.title
      : typeof body.detail === 'string' ? body.detail
        : response.status === 401 ? 'AUTHENTICATION_REQUIRED' : response.status === 403 ? 'FORBIDDEN' : 'REQUEST_FAILED';
  const correlationId = typeof body.correlationId === 'string' ? body.correlationId
    : response.headers.get('X-Correlation-Id') ?? fallbackCorrelationId;
  return new AccountOperationsApiError(response.status, code, correlationId);
}

async function json(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new Error('Invalid API response'); }
}

function readUserCase(value: unknown): UserCaseView {
  const v = object(value);
  return {
    id: text(v.id, 'case id'), accountId: text(v.accountId, 'account id'),
    type: enumeration(v.type, ['INQUIRY', 'REPORT', 'APPEAL'], 'case type'),
    status: enumeration(v.status, ['OPEN', 'NEEDS_INFORMATION', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'], 'case status'),
    version: positive(v.version, 'case version'), evidenceObjectIds: strings(v.evidenceObjectIds), updatedAt: text(v.updatedAt, 'updatedAt'),
  };
}

function readUserCaseSummary(value: unknown): UserCaseSummary {
  const v = object(value);
  return {
    id: text(v.id, 'case id'),
    type: enumeration(v.type, ['INQUIRY', 'REPORT', 'APPEAL'], 'case type'),
    status: enumeration(v.status, ['OPEN', 'NEEDS_INFORMATION', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'], 'case status'),
    subject: text(v.subject, 'case subject'), createdAt: text(v.createdAt, 'createdAt'), updatedAt: text(v.updatedAt, 'updatedAt'),
  };
}

function readUserCasePage(value: unknown): UserCasePage {
  const v = object(value);
  if (!Array.isArray(v.items)) throw new Error('Invalid case items');
  return { items: v.items.map(readUserCaseSummary), nextCursor: nullableText(v.nextCursor) };
}

function readUserCaseDetail(value: unknown): UserCaseDetail {
  const v = object(value);
  if (!Array.isArray(v.history)) throw new Error('Invalid case history');
  return {
    ...readUserCaseSummary(v),
    description: text(v.description, 'case description'),
    responseDeadlineAt: nullableText(v.responseDeadlineAt),
    history: v.history.map((entry) => {
      const item = object(entry);
      return {
        actor: enumeration(item.actor, ['CUSTOMER', 'SUPPORT', 'SYSTEM'], 'case actor'),
        status: enumeration(item.status, ['OPEN', 'NEEDS_INFORMATION', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'], 'case status'),
        message: text(item.message, 'case message'), createdAt: text(item.createdAt, 'createdAt'),
      };
    }),
  };
}

function readSummary(value: unknown): OperatorCaseSummary {
  const v = object(value);
  return {
    caseId: text(v.caseId, 'case id'), type: enumeration(v.type, ['INQUIRY', 'REPORT', 'APPEAL'], 'case type'),
    status: enumeration(v.status, ['OPEN', 'NEEDS_INFORMATION', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'], 'case status'),
    version: positive(v.version, 'case version'), assigneeOperatorId: nullableText(v.assigneeOperatorId), updatedAt: text(v.updatedAt, 'updatedAt'),
  };
}

function readOperatorPage(value: unknown): OperatorCasePage {
  const v = object(value);
  if (!Array.isArray(v.items)) throw new Error('Invalid case items');
  return { items: v.items.map(readSummary), nextCursor: nullableText(v.nextCursor) };
}

function readOperatorDetail(value: unknown): OperatorCaseDetail {
  const v = object(value);
  if (!Array.isArray(v.evidence)) throw new Error('Invalid case evidence');
  return {
    ...readSummary(v), evidence: v.evidence.map((item) => {
      const evidence = object(item);
      return {
        evidenceId: text(evidence.evidenceId, 'evidence id'), kind: text(evidence.kind, 'evidence kind'),
        status: text(evidence.status, 'evidence status'), sourceDomain: text(evidence.sourceDomain, 'source domain'),
        ownershipVerified: boolean(evidence.ownershipVerified, 'ownershipVerified'), linkedAt: text(evidence.linkedAt, 'linkedAt'),
        attributes: object(evidence.attributes),
      };
    }),
  };
}

function readReceipt(value: unknown): CommandReceipt {
  const v = object(value);
  const receipt: CommandReceipt = { code: text(v.code, 'code'), correlationId: text(v.correlationId, 'correlationId') };
  if (typeof v.status === 'string') receipt.status = v.status;
  if (typeof v.caseVersion === 'number') receipt.caseVersion = positive(v.caseVersion, 'caseVersion');
  if (typeof v.aggregateVersion === 'number') receipt.aggregateVersion = nonNegative(v.aggregateVersion, 'aggregateVersion');
  if ('assignmentId' in v) receipt.assignmentId = nullableText(v.assignmentId);
  if (typeof v.sanctionReference === 'string') receipt.sanctionReference = v.sanctionReference;
  return receipt;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid API response');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string { if (typeof value !== 'string' || !value) throw new Error(`Invalid ${label}`); return value; }
function nullableText(value: unknown): string | null { return value == null ? null : text(value, 'string'); }
function boolean(value: unknown, label: string): boolean { if (typeof value !== 'boolean') throw new Error(`Invalid ${label}`); return value; }
function positive(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`Invalid ${label}`); return Number(value); }
function nonNegative(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`Invalid ${label}`); return Number(value); }
function strings(value: unknown): string[] { if (!Array.isArray(value)) throw new Error('Invalid string array'); return value.map((item) => text(item, 'string')); }
function enumeration<T extends string>(value: unknown, values: readonly T[], label: string): T { const result = text(value, label); if (!values.includes(result as T)) throw new Error(`Invalid ${label}`); return result as T; }

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const defaultAccountOperationsClient = createAccountOperationsClient({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? '', getAccessToken: getSessionAccessToken });
export const defaultAdminMcpClient = createAdminMcpClient({ baseUrl: import.meta.env.VITE_ADMIN_MCP_BASE_URL ?? '' });
