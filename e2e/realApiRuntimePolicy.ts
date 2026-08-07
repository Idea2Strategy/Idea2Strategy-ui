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
