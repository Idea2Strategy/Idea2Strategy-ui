export type OperatorAssignmentStatus =
  | 'ACTIVE' | 'FUTURE' | 'EXPIRED' | 'REVOKED' | 'STALE_CATALOG' | 'UNMIGRATED';

export interface OperatorRole { id: string; code: string; hierarchyRank: number }
export interface OperatorPermission { id: string; code: string }
export interface OperatorRolePermission { roleId: string; permissionId: string; delegable: boolean }
export interface OperatorAssignment {
  id: string;
  operatorId: string;
  roleId: string;
  roleCode: string;
  catalogVersion: string | null;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revocationReasonCode: string | null;
  status: OperatorAssignmentStatus;
}

export interface OperatorSelf {
  operatorId: string;
  catalogVersion: string;
  currentMfa: boolean;
  mfaAuthenticatedAt: string | null;
  lastMfaVerifiedAt: string | null;
  roles: OperatorRole[];
  permissions: OperatorPermission[];
  assignments: OperatorAssignment[];
}

export interface OperatorCatalog {
  catalogVersion: string;
  roles: OperatorRole[];
  permissions: OperatorPermission[];
  rolePermissions: OperatorRolePermission[];
}

export interface OperatorAssignments { operatorId: string; assignments: OperatorAssignment[] }
export interface OperatorReadResult<T> { view: T; correlationId: string }

export class OperatorRbacApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly correlationId: string | null,
  ) {
    super(code);
    this.name = 'OperatorRbacApiError';
  }

  get authenticationRequired() { return this.status === 401; }
  get forbidden() { return this.status === 403; }
  get notFound() { return this.status === 404; }
  get conflict() { return this.status === 409; }
  get retryable() { return this.status === 0 || this.status === 429 || this.status >= 500; }
}

export interface OperatorRbacClient {
  me(signal?: AbortSignal): Promise<OperatorReadResult<OperatorSelf>>;
  catalog(signal?: AbortSignal): Promise<OperatorReadResult<OperatorCatalog>>;
  assignments(operatorId: string, signal?: AbortSignal): Promise<OperatorReadResult<OperatorAssignments>>;
}

interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getOperatorAccessToken?: () => string | null;
  createCorrelationId?: () => string;
}

export function createOperatorRbacClient({
  baseUrl = '', fetchImpl = fetch, getOperatorAccessToken,
  createCorrelationId = () => crypto.randomUUID(),
}: ClientOptions = {}): OperatorRbacClient {
  const root = baseUrl.replace(/\/$/, '');
  const request = async (path: string, signal?: AbortSignal) => {
    const correlationId = createCorrelationId();
    const token = getOperatorAccessToken?.();
    if (!token) throw new OperatorRbacApiError(401, 'OPERATOR_AUTHENTICATION_REQUIRED', correlationId);
    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        signal,
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          'X-Correlation-Id': correlationId,
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      throw new OperatorRbacApiError(0, 'NETWORK_ERROR', correlationId);
    }
    if (!response.ok) throw await readError(response, correlationId);
    try { return await response.json() as unknown; }
    catch { throw new OperatorRbacApiError(0, 'INVALID_RESPONSE', correlationId); }
  };

  return {
    async me(signal) { return readResult(await request('/api/v1/operations/me', signal), readSelf); },
    async catalog(signal) { return readResult(await request('/api/v1/operations/rbac/catalog', signal), readCatalog); },
    async assignments(operatorId, signal) {
      return readResult(await request(`/api/v1/operations/rbac/operators/${encodeURIComponent(operatorId)}/assignments`, signal), readAssignments);
    },
  };
}

async function readError(response: Response, fallbackCorrelationId: string) {
  let body: Record<string, unknown> = {};
  try { body = object(await response.json()); } catch { /* protocol fallback */ }
  const code = typeof body.code === 'string' ? body.code
    : response.status === 401 ? 'OPERATOR_AUTHENTICATION_REQUIRED'
      : response.status === 403 ? 'OPERATOR_RBAC_READ_FORBIDDEN'
        : response.status === 404 ? 'OPERATOR_NOT_FOUND'
          : response.status === 409 ? 'OPERATOR_RBAC_CATALOG_VERSION_CONFLICT'
            : 'OPERATOR_RBAC_READ_FAILED';
  const correlationId = typeof body.correlationId === 'string' ? body.correlationId
    : response.headers.get('X-Correlation-Id') ?? fallbackCorrelationId;
  return new OperatorRbacApiError(response.status, code, correlationId);
}

function readResult<T>(value: unknown, readView: (value: unknown) => T): OperatorReadResult<T> {
  const result = object(value);
  return { view: readView(result.view), correlationId: text(result.correlationId, 'correlationId') };
}

function readSelf(value: unknown): OperatorSelf {
  const view = object(value);
  return {
    operatorId: text(view.operatorId, 'operatorId'), catalogVersion: text(view.catalogVersion, 'catalogVersion'),
    currentMfa: bool(view.currentMfa, 'currentMfa'), mfaAuthenticatedAt: nullableText(view.mfaAuthenticatedAt),
    lastMfaVerifiedAt: nullableText(view.lastMfaVerifiedAt), roles: array(view.roles, readRole, 'roles'),
    permissions: array(view.permissions, readPermission, 'permissions'),
    assignments: array(view.assignments, readAssignment, 'assignments'),
  };
}

function readCatalog(value: unknown): OperatorCatalog {
  const view = object(value);
  return {
    catalogVersion: text(view.catalogVersion, 'catalogVersion'), roles: array(view.roles, readRole, 'roles'),
    permissions: array(view.permissions, readPermission, 'permissions'),
    rolePermissions: array(view.rolePermissions, (item) => {
      const mapping = object(item);
      return { roleId: text(mapping.roleId, 'roleId'), permissionId: text(mapping.permissionId, 'permissionId'), delegable: bool(mapping.delegable, 'delegable') };
    }, 'rolePermissions'),
  };
}

function readAssignments(value: unknown): OperatorAssignments {
  const view = object(value);
  return { operatorId: text(view.operatorId, 'operatorId'), assignments: array(view.assignments, readAssignment, 'assignments') };
}

function readRole(value: unknown): OperatorRole {
  const role = object(value);
  return { id: text(role.id, 'role id'), code: text(role.code, 'role code'), hierarchyRank: integer(role.hierarchyRank, 'hierarchyRank') };
}
function readPermission(value: unknown): OperatorPermission {
  const permission = object(value);
  return { id: text(permission.id, 'permission id'), code: text(permission.code, 'permission code') };
}
function readAssignment(value: unknown): OperatorAssignment {
  const assignment = object(value);
  return {
    id: text(assignment.id, 'assignment id'), operatorId: text(assignment.operatorId, 'operatorId'),
    roleId: text(assignment.roleId, 'roleId'), roleCode: text(assignment.roleCode, 'roleCode'),
    catalogVersion: nullableText(assignment.catalogVersion), grantedAt: text(assignment.grantedAt, 'grantedAt'),
    expiresAt: nullableText(assignment.expiresAt), revokedAt: nullableText(assignment.revokedAt),
    revocationReasonCode: nullableText(assignment.revocationReasonCode),
    status: enumeration(assignment.status, ['ACTIVE', 'FUTURE', 'EXPIRED', 'REVOKED', 'STALE_CATALOG', 'UNMIGRATED'], 'assignment status'),
  };
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid API response');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string) { if (typeof value !== 'string' || !value) throw new Error(`Invalid ${label}`); return value; }
function nullableText(value: unknown) { return value == null ? null : text(value, 'string'); }
function bool(value: unknown, label: string) { if (typeof value !== 'boolean') throw new Error(`Invalid ${label}`); return value; }
function integer(value: unknown, label: string) { if (!Number.isSafeInteger(value)) throw new Error(`Invalid ${label}`); return Number(value); }
function array<T>(value: unknown, read: (value: unknown) => T, label: string) { if (!Array.isArray(value)) throw new Error(`Invalid ${label}`); return value.map(read); }
function enumeration<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  const result = text(value, label); if (!allowed.includes(result as T)) throw new Error(`Invalid ${label}`); return result as T;
}
