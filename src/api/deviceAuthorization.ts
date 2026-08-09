import { getSessionAccessToken } from './sessionAccessToken';

export class DeviceAuthorizationApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'DeviceAuthorizationApiError';
  }
}

export interface DeviceAuthorizationApi {
  approve(userCode: string): Promise<void>;
  deny(userCode: string): Promise<void>;
}

/**
 * Approving a command-line client.
 *
 * <p>The account is never sent: the server reads it from this session. A body that could name an
 * account would let anyone approve a device onto somebody else's.
 */
export const createDeviceAuthorizationApi = (
  baseUrl = import.meta.env.VITE_API_BASE_URL ?? '',
  fetchImpl: typeof fetch = fetch,
  readToken: () => string | null = getSessionAccessToken,
): DeviceAuthorizationApi => {
  const root = baseUrl.replace(/\/$/, '');
  const send = async (path: string, userCode: string) => {
    const token = readToken();
    if (!token) throw new DeviceAuthorizationApiError(401, 'SIGN_IN_REQUIRED');
    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        method: 'POST',
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userCode }),
      });
    } catch {
      throw new DeviceAuthorizationApiError(0, 'NETWORK_ERROR');
    }
    if (!response.ok) {
      throw new DeviceAuthorizationApiError(
        response.status,
        response.status === 401 ? 'SIGN_IN_REQUIRED' : 'CODE_NOT_PENDING',
      );
    }
  };
  return {
    approve: (userCode) => send('/api/v1/auth/device/approve', userCode),
    deny: (userCode) => send('/api/v1/auth/device/deny', userCode),
  };
};
