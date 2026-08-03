import { describe, expect, it } from 'vitest';
import { hasActiveProjectRun, interpretDockerInspect, isDockerContainerNameConflict, shouldReapContainer, shouldReapNetwork } from './dockerResourcePolicy';

const now = Date.parse('2026-08-03T04:00:00Z');

describe('real API Docker resource policy', () => {
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
