import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasActiveProjectRun, interpretDockerInspect, isDockerContainerNameConflict, shouldReapContainer, shouldReapNetwork } from './dockerResourcePolicy';

const now = Date.parse('2026-08-03T04:00:00Z');

describe('real API Docker resource policy', () => {
  it('runs against the current superproject checkout instead of stale hard-coded revisions', () => {
    const setup = readFileSync(resolve(process.cwd(), 'e2e/realApiGlobalSetup.ts'), 'utf8');
    expect(setup).not.toMatch(/const (backend|root)Revision = '[0-9a-f]{40}'/);
    expect(setup).toContain("path.join('..', 'backend')");
    expect(setup).toContain("path.join('..')");
  });

  it('keeps the extracted Flyway verifier independent of optional PowerShell cmdlets', () => {
    const policy = readFileSync(resolve(process.cwd(), '..', 'scripts', 'test-flyway-ci-bundle.ps1'), 'utf8');
    const dockerSection = policy.indexOf('$suffix = [guid]');
    expect(dockerSection).toBeGreaterThan(0);
    expect(policy.slice(0, dockerSection)).not.toContain('Get-FileHash');
  });
  it('never reaps another running process and ages stopped resources before recovery', () => {
    expect(shouldReapContainer(true, '2026-08-03T01:00:00Z', now)).toBe(false);
    expect(shouldReapContainer(false, '2026-08-03T03:30:00Z', now)).toBe(false);
    expect(shouldReapContainer(false, '2026-08-03T02:00:00Z', now)).toBe(true);
    expect(shouldReapNetwork(1, '2026-08-03T01:00:00Z', now)).toBe(false);
    expect(shouldReapNetwork(0, '2026-08-03T02:00:00Z', now)).toBe(true);
  });

  it('fails closed when the shared backend checkout already has an active harness run', () => {
    expect(hasActiveProjectRun([{ running: false }, { running: true }])).toBe(true);
    expect(hasActiveProjectRun([{ running: false }])).toBe(false);
    expect(hasActiveProjectRun([])).toBe(false);
  });

  it('treats only an explicit not-found as absence', () => {
    expect(interpretDockerInspect(0, '[]')).toBe(true);
    expect(interpretDockerInspect(1, 'Error: No such object: old-run')).toBe(false);
    expect(interpretDockerInspect(1, 'Error response from daemon: network old-run not found')).toBe(false);
    expect(() => interpretDockerInspect(1, 'permission denied while trying to connect to Docker'))
      .toThrow(/permission denied/);
    expect(() => interpretDockerInspect(null, 'Docker daemon unavailable')).toThrow(/daemon unavailable/);
  });

  it('classifies only the atomic lock-name conflict as another owner', () => {
    expect(isDockerContainerNameConflict(
      'Conflict. The container name "/idea2strategy-a23-real-api-lock" is already in use by container "abc".',
    )).toBe(true);
    expect(isDockerContainerNameConflict('permission denied while connecting to Docker')).toBe(false);
  });
});
