export const STALE_RESOURCE_AGE_MS = 60 * 60 * 1_000;

export function hasActiveProjectRun(states: ReadonlyArray<{ running: boolean }>): boolean {
  return states.some((state) => state.running);
}

export function shouldReapContainer(running: boolean, created: string, now = Date.now()): boolean {
  return !running && Date.parse(created) < now - STALE_RESOURCE_AGE_MS;
}

export function shouldReapNetwork(containerCount: number, created: string, now = Date.now()): boolean {
  return containerCount === 0 && Date.parse(created) < now - STALE_RESOURCE_AGE_MS;
}

export function interpretDockerInspect(status: number | null, output: string): boolean {
  if (status === 0) return true;
  if (status === 1 && /(?:no such (?:object|container|network|volume)|(?:container|network|volume)\s+\S+\s+not found)/i.test(output)) return false;
  throw new Error(`Docker inspect failed: ${output.trim() || `exit ${String(status)}`}`);
}

export function isDockerContainerNameConflict(output: string): boolean {
  return /conflict.*container name.*already in use/i.test(output);
}
