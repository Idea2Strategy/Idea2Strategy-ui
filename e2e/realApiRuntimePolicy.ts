const minimumReadySeconds = 60;
const maximumReadySeconds = 1_200;
const defaultReadySeconds = 600;

export function backendReadyTimeoutMs(value: string | undefined): number {
  const seconds = value === undefined ? defaultReadySeconds : Number(value);
  if (!Number.isInteger(seconds) || seconds < minimumReadySeconds || seconds > maximumReadySeconds) {
    throw new Error(`A23_BACKEND_READY_TIMEOUT_SECONDS must be an integer between ${minimumReadySeconds} and ${maximumReadySeconds}`);
  }
  return seconds * 1_000;
}

export function powershellPolicyArguments(platform: NodeJS.Platform, policyPath: string): string[] {
  return platform === 'win32'
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', policyPath]
    : ['-NoProfile', '-File', policyPath];
}

export function unexpectedRepositoryChanges(
  status: string,
  allowedDirtyGitlinks: readonly string[],
  isTrackedGitlink: (path: string) => boolean,
): string[] {
  const allowed = new Set(allowedDirtyGitlinks);
  return status.replaceAll('\r', '').split('\n').filter(Boolean).filter((line) => {
    const match = /^ M (.+)$/.exec(line);
    return !match || !allowed.has(match[1]) || !isTrackedGitlink(match[1]);
  });
}

export function developmentSeedRelativePath(kind: 'runtime-policy' | 'scoring'): string[] {
  return kind === 'runtime-policy'
    ? ['config', 'development', 'runtime-policy', 'policy-seed.sql']
    : ['config', 'development', 'scoring', 'scoring-template-seed.sql'];
}
