import { describe, expect, it } from 'vitest';
import { backendReadyTimeoutMs, developmentSeedRelativePath, powershellPolicyArguments, unexpectedRepositoryChanges } from './realApiRuntimePolicy';

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

  it('allows only explicitly named, tracked gitlinks to be dirty', () => {
    const trackedGitlinks = new Set(['backend', 'backtest-engine']);
    const classify = (status: string) => unexpectedRepositoryChanges(
      status,
      ['backend', 'backtest-engine'],
      (path) => trackedGitlinks.has(path),
    );

    expect(classify(' M backend\n M backtest-engine')).toEqual([]);
    expect(classify(' M backend\n?? backend/db-migration/V999__forged.sql')).toEqual([
      '?? backend/db-migration/V999__forged.sql',
    ]);
    expect(classify('M  backend')).toEqual(['M  backend']);
    expect(unexpectedRepositoryChanges(' M UI', ['UI'], () => false)).toEqual([' M UI']);
  });

  it('uses the canonical development seed directories', () => {
    expect(developmentSeedRelativePath('runtime-policy')).toEqual([
      'config', 'development', 'runtime-policy', 'policy-seed.sql',
    ]);
    expect(developmentSeedRelativePath('scoring')).toEqual([
      'config', 'development', 'scoring', 'scoring-template-seed.sql',
    ]);
  });
});
