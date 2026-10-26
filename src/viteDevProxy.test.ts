// @vitest-environment node
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { UserConfig, UserConfigFnObject } from 'vite';
import viteConfig from '../vite.config';

const resolve = (env: Record<string, string>) => {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return (viteConfig as UserConfigFnObject)({ mode: 'development', command: 'serve' }) as UserConfig;
};

describe('local dev server proxy', () => {
  afterEach(() => vi.unstubAllEnvs());

  test('upgrades market-data WebSockets through the backend target', () => {
    const proxy = resolve({ VITE_REAL_API_TARGET: 'http://backend-api:8080' }).server?.proxy;
    // marketData.ts opens /ws/v1/market-data/prices on the page origin when
    // VITE_API_BASE_URL is empty, so the dev server must forward the upgrade.
    expect(proxy?.['/ws']).toEqual({ target: 'http://backend-api:8080', changeOrigin: true, ws: true });
    expect(proxy?.['/api']).toEqual({ target: 'http://backend-api:8080', changeOrigin: true });
  });

  test('leaves the proxy off without a real API target', () => {
    vi.stubEnv('VITE_REAL_API_TARGET', '');
    expect(resolve({}).server).toBeUndefined();
  });
});
