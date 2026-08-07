import { describe, expect, it } from 'vitest';
import { backendReadyTimeoutMs, powershellPolicyArguments } from './realApiRuntimePolicy';

describe('real API runtime policy', () => {
  it('allows a cold Gradle build enough time to become healthy', () => {
    expect(backendReadyTimeoutMs(undefined)).toBe(600_000);
    expect(backendReadyTimeoutMs('720')).toBe(720_000);
  });

  it('rejects readiness timeouts that would hide a broken runner configuration', () => {
    expect(() => backendReadyTimeoutMs('59')).toThrow(/60 and 1200/);
    expect(() => backendReadyTimeoutMs('not-a-number')).toThrow(/60 and 1200/);
    expect(() => backendReadyTimeoutMs('1201')).toThrow(/60 and 1200/);
  });

  it('bypasses the local Windows execution policy only for the generated verifier', () => {
    expect(powershellPolicyArguments('win32', 'C:\\temp\\verify.ps1')).toEqual([
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\temp\\verify.ps1',
    ]);
    expect(powershellPolicyArguments('linux', '/tmp/verify.ps1')).toEqual([
      '-NoProfile', '-File', '/tmp/verify.ps1',
    ]);
  });
});
