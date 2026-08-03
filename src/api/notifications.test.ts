import { describe, expect, it, vi } from 'vitest';
import { createNotificationClient, NotificationApiError } from './notifications';

const item = {
  id: 'notification-1', typeCode: 'ACCOUNT_SANCTION_APPLIED', mandatory: true,
  templateVersion: 'v1', locale: 'ko-KR', templateArguments: { reason: 'POLICY' },
  createdAt: '2026-08-03T00:00:00Z', readAt: null,
};

describe('notification API client', () => {
  it('lists owned notifications with paired cursor, bearer token, and correlation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [item], nextCreatedAt: item.createdAt, nextId: item.id }), { status: 200 }));
    const client = createNotificationClient({ fetchImpl, getAccessToken: () => 'session-token', createCorrelationId: () => 'corr-list' });
    await expect(client.list({ beforeCreatedAt: '2026-08-04T00:00:00Z', beforeId: 'notification-2' }, 10))
      .resolves.toEqual({ items: [item], nextCreatedAt: item.createdAt, nextId: item.id });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('beforeCreatedAt=2026-08-04T00%3A00%3A00Z');
    expect(url).toContain('beforeId=notification-2');
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer session-token', 'X-Correlation-Id': 'corr-list' }));
  });

  it('marks only the owned notification read using the exact PUT endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createNotificationClient({ fetchImpl, getAccessToken: () => 'token', createCorrelationId: () => 'corr-read' });
    await client.markRead('notification/unsafe');
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/account/notifications/notification%2Funsafe/read', expect.objectContaining({ method: 'PUT' }));
  });

  it('loads and replaces versioned channel preferences without allowing unknown channels', async () => {
    const preference = { typeCode: 'CASE_UPDATED', policyVersion: 'policy-v1', mandatory: false, enabledChannels: ['APP', 'EMAIL'] };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([preference]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(preference), { status: 200 }));
    const client = createNotificationClient({ fetchImpl, getAccessToken: () => 'token', createCorrelationId: () => 'corr-preference' });
    await expect(client.preferences()).resolves.toEqual([preference]);
    await expect(client.replacePreference('CASE/UPDATED', ['APP', 'EMAIL'])).resolves.toEqual(preference);
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/account/notifications/preferences/CASE%2FUPDATED');
    expect(JSON.parse(String((fetchImpl.mock.calls[1][1] as RequestInit).body))).toEqual({ enabledChannels: ['APP', 'EMAIL'] });
  });

  it('rejects an incomplete server cursor instead of guessing pagination semantics', async () => {
    const client = createNotificationClient({ fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], nextCreatedAt: item.createdAt, nextId: null }), { status: 200 })), getAccessToken: () => 'token' });
    await expect(client.list()).rejects.toThrow('Invalid notification cursor');
  });

  it('normalizes API and network failures with a user-visible correlation id', async () => {
    const failed = createNotificationClient({
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'NOTIFICATION_NOT_AVAILABLE' }), { status: 404, headers: { 'X-Correlation-Id': 'server-corr' } })),
      getAccessToken: () => 'token',
      createCorrelationId: () => 'client-corr',
    });
    await expect(failed.markRead('missing')).rejects.toEqual(expect.objectContaining<Partial<NotificationApiError>>({ status: 404, code: 'NOTIFICATION_NOT_AVAILABLE', correlationId: 'server-corr' }));
    const offline = createNotificationClient({ fetchImpl: vi.fn().mockRejectedValue(new TypeError('offline')), getAccessToken: () => 'token', createCorrelationId: () => 'corr-offline' });
    await expect(offline.list()).rejects.toEqual(expect.objectContaining({ status: 0, code: 'NETWORK_ERROR', correlationId: 'corr-offline', retryable: true }));
  });

  it('fails closed before a request when the required bearer session is missing', async () => {
    const fetchImpl = vi.fn();
    const client = createNotificationClient({ fetchImpl, getAccessToken: () => null, createCorrelationId: () => 'corr-auth' });
    await expect(client.list()).rejects.toEqual(expect.objectContaining({ status: 401, code: 'AUTHENTICATION_REQUIRED', correlationId: 'corr-auth', authenticationRequired: true }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
