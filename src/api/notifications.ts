import { getSessionAccessToken } from './sessionAccessToken';

export type NotificationChannel = 'APP' | 'EMAIL';

export interface NotificationRecord {
  id: string;
  typeCode: string;
  mandatory: boolean;
  templateVersion: string;
  locale: string;
  templateArguments: Record<string, string>;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPage {
  items: NotificationRecord[];
  nextCreatedAt: string | null;
  nextId: string | null;
}

export interface NotificationPreference {
  typeCode: string;
  policyVersion: string;
  mandatory: boolean;
  enabledChannels: NotificationChannel[];
}

export class NotificationApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly correlationId: string | null) {
    super(code);
    this.name = 'NotificationApiError';
  }
  get authenticationRequired() { return this.status === 400 && this.code === 'INVALID_NOTIFICATION_REQUEST' || this.status === 401; }
  get retryable() { return this.status === 0 || this.status === 429 || this.status >= 500; }
}

interface NotificationClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null;
  createCorrelationId?: () => string;
}

export interface NotificationClient {
  list(cursor?: { beforeCreatedAt: string; beforeId: string } | null, limit?: number, signal?: AbortSignal): Promise<NotificationPage>;
  markRead(notificationId: string, signal?: AbortSignal): Promise<void>;
  preferences(signal?: AbortSignal): Promise<NotificationPreference[]>;
  replacePreference(typeCode: string, enabledChannels: NotificationChannel[], signal?: AbortSignal): Promise<NotificationPreference>;
}

export function createNotificationClient({
  baseUrl = '', fetchImpl = fetch, getAccessToken, createCorrelationId = () => crypto.randomUUID(),
}: NotificationClientOptions = {}): NotificationClient {
  const root = baseUrl.replace(/\/$/, '');
  const request = async (path: string, init: RequestInit = {}) => {
    const correlationId = createCorrelationId();
    const token = getAccessToken?.();
    if (!token) throw new NotificationApiError(401, 'AUTHENTICATION_REQUIRED', correlationId);
    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        credentials: 'include', ...init,
        headers: {
          Accept: 'application/json', 'X-Correlation-Id': correlationId,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers,
        },
      });
    } catch {
      throw new NotificationApiError(0, 'NETWORK_ERROR', correlationId);
    }
    if (!response.ok) throw await readError(response, correlationId);
    return response;
  };
  return {
    async list(cursor = null, limit = 20, signal) {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) {
        params.set('beforeCreatedAt', cursor.beforeCreatedAt);
        params.set('beforeId', cursor.beforeId);
      }
      return readPage(await json(await request(`/api/v1/account/notifications?${params}`, { signal })));
    },
    async markRead(notificationId, signal) {
      await request(`/api/v1/account/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PUT', signal });
    },
    async preferences(signal) {
      const value = await json(await request('/api/v1/account/notifications/preferences', { signal }));
      if (!Array.isArray(value)) throw new Error('Invalid notification preferences');
      return value.map(readPreference);
    },
    async replacePreference(typeCode, enabledChannels, signal) {
      return readPreference(await json(await request(`/api/v1/account/notifications/preferences/${encodeURIComponent(typeCode)}`, {
        method: 'PUT', signal, body: JSON.stringify({ enabledChannels }),
      })));
    },
  };
}

async function readError(response: Response, fallbackCorrelationId: string) {
  let body: Record<string, unknown> = {};
  try { body = object(await response.json()); } catch { /* protocol fallback */ }
  const code = typeof body.code === 'string' ? body.code : response.status === 401 ? 'AUTHENTICATION_REQUIRED' : 'NOTIFICATION_REQUEST_FAILED';
  return new NotificationApiError(response.status, code, response.headers.get('X-Correlation-Id') ?? fallbackCorrelationId);
}

async function json(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new Error('Invalid notification API response'); }
}

function readPage(value: unknown): NotificationPage {
  const page = object(value);
  if (!Array.isArray(page.items)) throw new Error('Invalid notification items');
  const nextCreatedAt = nullableText(page.nextCreatedAt);
  const nextId = nullableText(page.nextId);
  if ((nextCreatedAt === null) !== (nextId === null)) throw new Error('Invalid notification cursor');
  return { items: page.items.map(readRecord), nextCreatedAt, nextId };
}

function readRecord(value: unknown): NotificationRecord {
  const item = object(value);
  const args = object(item.templateArguments);
  return {
    id: text(item.id, 'notification id'), typeCode: text(item.typeCode, 'typeCode'), mandatory: bool(item.mandatory, 'mandatory'),
    templateVersion: text(item.templateVersion, 'templateVersion'), locale: text(item.locale, 'locale'),
    templateArguments: Object.fromEntries(Object.entries(args).map(([key, value]) => [key, text(value, `template argument ${key}`)])),
    createdAt: text(item.createdAt, 'createdAt'), readAt: nullableText(item.readAt),
  };
}

function readPreference(value: unknown): NotificationPreference {
  const preference = object(value);
  if (!Array.isArray(preference.enabledChannels)) throw new Error('Invalid enabledChannels');
  const channels: NotificationChannel[] = preference.enabledChannels.map((channel) => enumeration<NotificationChannel>(channel, ['APP', 'EMAIL'], 'notification channel'));
  if (!channels.includes('APP')) throw new Error('APP notification channel is required');
  return {
    typeCode: text(preference.typeCode, 'typeCode'), policyVersion: text(preference.policyVersion, 'policyVersion'),
    mandatory: bool(preference.mandatory, 'mandatory'), enabledChannels: channels,
  };
}

function object(value: unknown): Record<string, unknown> { if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid API response'); return value as Record<string, unknown>; }
function text(value: unknown, label: string): string { if (typeof value !== 'string' || !value) throw new Error(`Invalid ${label}`); return value; }
function nullableText(value: unknown): string | null { return value == null ? null : text(value, 'string'); }
function bool(value: unknown, label: string): boolean { if (typeof value !== 'boolean') throw new Error(`Invalid ${label}`); return value; }
function enumeration<T extends string>(value: unknown, values: readonly T[], label: string): T { const result = text(value, label); if (!values.includes(result as T)) throw new Error(`Invalid ${label}`); return result as T; }

export const defaultNotificationClient = createNotificationClient({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? '', getAccessToken: getSessionAccessToken });
