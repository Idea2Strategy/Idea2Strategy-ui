import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasActiveProjectRun, interpretDockerInspect, isDockerContainerNameConflict, shouldReapContainer, shouldReapNetwork } from './dockerResourcePolicy';
import { backendReadyTimeoutMs, powershellPolicyArguments } from './realApiRuntimePolicy';

const projectLabel = 'com.idea2strategy.a23-real-api=true';
const backendPort = Number(process.env.A23_BACKEND_PORT);
if (!Number.isInteger(backendPort) || backendPort < 1024 || backendPort > 65_535) {
  throw new Error('A23_BACKEND_PORT must be assigned by playwright.real-api.config.ts');
}

const run = (program: string, args: string[], cwd?: string) => execFileSync(program, args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const docker = (...args: string[]) => run('docker', args);
const dockerLogs = (container: string) => {
  const result = spawnSync('docker', ['logs', container], { encoding: 'utf8' });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
};

export default async function globalSetup(): Promise<() => void> {
  const rootDir = exactCleanRepository(
    process.env.A23_ROOT_DIR ?? path.join('..'),
    process.env.A23_ROOT_REVISION,
    'A23_ROOT_DIR',
  );
  const backendDir = exactCleanRepository(
    process.env.A23_BACKEND_DIR ?? path.join('..', 'backend'),
    process.env.A23_BACKEND_REVISION ?? run('git', ['rev-parse', 'HEAD:backend'], rootDir),
    'A23_BACKEND_DIR',
  );
  const bundle = path.join(rootDir, 'db', 'flyway-ci-bundle');
  if (!existsSync(path.join(bundle, 'migration-bundle.manifest'))) {
    throw new Error(`Pinned root Flyway bundle is missing: ${bundle}`);
  }
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const runLabel = `com.idea2strategy.a23-real-api.run=${suffix}`;
  const network = `a23-real-${suffix}`;
  const lock = 'idea2strategy-a23-real-api-lock';
  const postgres = `a23-postgres-${suffix}`;
  const backend = `a23-backend-${suffix}`;
  const databasePassword = randomBytes(24).toString('base64url');
  const emailEncryptionKey = randomBytes(32).toString('base64');
  const lookupHmacKey = randomBytes(32).toString('base64');
  const verificationHmacKey = randomBytes(32).toString('base64');
  const refreshTokenHmacKey = randomBytes(32).toString('base64');
  const customerJwtSigningKey = randomBytes(32).toString('base64');
  const gradleCache = gradleCacheSource();
  const ownedContainers = new Set<string>();
  let networkCreated = false;
  let started = false;
  let cleaning = false;

  const cleanup = (reportFailures: boolean) => {
    if (cleaning) return;
    cleaning = true;
    const failures: string[] = [];
    delete process.env.A23_POSTGRES_CONTAINER;
    delete process.env.A23_VERIFICATION_HMAC_KEY;
    for (const container of ownedContainers) {
      try {
        if (resourceExists('container', container)) docker('rm', '-f', container);
      } catch (cause) { failures.push(`container ${container}: ${String(cause)}`); }
    }
    try {
      if (networkCreated && resourceExists('network', network)) docker('network', 'rm', network);
    } catch (cause) { failures.push(`network ${network}: ${String(cause)}`); }
    cleaning = false;
    if (reportFailures && failures.length > 0) {
      throw new Error(`A23 real API teardown failed:\n${failures.join('\n')}`);
    }
  };
  const signal = (name: NodeJS.Signals) => {
    try { cleanup(false); } finally { process.kill(process.pid, name); }
  };
  const onSigInt = () => signal('SIGINT');
  const onSigTerm = () => signal('SIGTERM');
  const onExit = () => cleanup(false);
  process.once('SIGINT', onSigInt);
  process.once('SIGTERM', onSigTerm);
  process.once('exit', onExit);

  try {
    verifyCanonicalBundle(rootDir);
    assertNoActiveProjectRun();
    sweepStaleResources();
    acquireRunLock(lock, runLabel, ownedContainers);
    docker('network', 'create', '--label', projectLabel, '--label', runLabel, network);
    networkCreated = true;
    docker('run', '-d', '--name', postgres, '--network', network,
      '--network-alias', 'postgres', '--label', projectLabel, '--label', runLabel,
      '-e', `POSTGRES_PASSWORD=${databasePassword}`, '-e', 'POSTGRES_DB=a23', 'postgres:16-alpine');
    ownedContainers.add(postgres);
    await waitForPostgres(postgres);
    docker('run', '--rm', '--network', network, '--label', projectLabel, '--label', runLabel,
      '-v', `${bundle}:/flyway/sql:ro`, 'redgate/flyway:11-alpine',
      '-url=jdbc:postgresql://postgres:5432/a23', '-user=postgres', `-password=${databasePassword}`,
      'migrate');
    docker('run', '--rm', '--network', network, '--label', projectLabel, '--label', runLabel,
      '-v', `${bundle}:/flyway/sql:ro`, 'redgate/flyway:11-alpine',
      '-url=jdbc:postgresql://postgres:5432/a23', '-user=postgres', `-password=${databasePassword}`,
      'validate');
    seedStrategyInstruments(postgres);

    docker('run', '-d', '--name', backend, '--network', network,
      '--label', projectLabel, '--label', runLabel,
      '-p', `127.0.0.1:${backendPort}:8080`, '-v', `${backendDir}:/workspace`,
      '-v', `${gradleCache}:/home/gradle/.gradle`, '-w', '/workspace',
      '-e', 'SERVER_PORT=8080', '-e', 'SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/a23',
      '-e', 'SPRING_DATASOURCE_USERNAME=postgres', '-e', `SPRING_DATASOURCE_PASSWORD=${databasePassword}`,
      '-e', 'SPRING_JPA_HIBERNATE_DDL_AUTO=none',
      '-e', `IDENTITY_CRYPTO_EMAIL_ENCRYPTION_KEY=${emailEncryptionKey}`,
      '-e', `IDENTITY_CRYPTO_LOOKUP_HMAC_KEY=${lookupHmacKey}`,
      '-e', `IDENTITY_CRYPTO_VERIFICATION_HMAC_KEY=${verificationHmacKey}`,
      // Child PR CI remains compatible with the root-pinned pre-JWT backend during the cross-repository merge.
      '-e', `IDENTITY_CRYPTO_SESSION_HMAC_KEY=${refreshTokenHmacKey}`,
      '-e', `IDENTITY_CRYPTO_REFRESH_TOKEN_HMAC_KEY=${refreshTokenHmacKey}`,
      '-e', `IDENTITY_CRYPTO_CUSTOMER_JWT_SIGNING_KEY=${customerJwtSigningKey}`,
      'gradle:8.14.3-jdk21', 'gradle', ':apps:backend-api:bootRun', '--no-daemon',
      '--project-cache-dir', '/tmp/a23-project-cache');
    ownedContainers.add(backend);
    await waitForBackend(backend);
    process.env.A23_POSTGRES_CONTAINER = postgres;
    process.env.A23_VERIFICATION_HMAC_KEY = verificationHmacKey;
    started = true;
  } finally {
    if (!started) cleanup(true);
  }

  return () => {
    process.removeListener('SIGINT', onSigInt);
    process.removeListener('SIGTERM', onSigTerm);
    process.removeListener('exit', onExit);
    cleanup(true);
  };
}

function seedStrategyInstruments(postgres: string): void {
  const rows = [
    ['52000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'AAPL', 'STOCK'],
    ['52000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002', 'MSFT', 'STOCK'],
    ['52000000-0000-4000-8000-000000000003', '53000000-0000-4000-8000-000000000003', 'SPY', 'ETF'],
  ];
  const instruments = rows.map(([instrumentId, , symbol, assetType]) =>
    `('${instrumentId}','${assetType}'::market_data.asset_type,'XNAS','USD','e2e-${symbol}','2000-01-01',now())`).join(',');
  const symbols = rows.map(([instrumentId, symbolId, symbol]) =>
    `('${symbolId}','${instrumentId}','XNAS','${symbol}','2000-01-01T00:00:00Z')`).join(',');
  docker('exec', postgres, 'psql', '-U', 'postgres', '-d', 'a23', '-v', 'ON_ERROR_STOP=1', '-c',
    `insert into market_data.instruments (id,asset_type,primary_exchange_mic,currency_code,provider_reference,listed_at,created_at) values ${instruments}; `
    + `insert into market_data.instrument_symbols (id,instrument_id,exchange_mic,symbol,effective_from) values ${symbols};`);
}

function gradleCacheSource(): string {
  const configured = process.env.A23_GRADLE_CACHE_DIR?.trim();
  if (configured) {
    const directory = path.resolve(configured);
    mkdirSync(directory, { recursive: true });
    return directory;
  }
  const volume = 'a23-real-api-gradle-cache';
  if (!resourceExists('volume', volume)) {
    docker('volume', 'create', '--label', projectLabel,
      '--label', 'com.idea2strategy.a23-real-api.cache=true', volume);
  }
  return volume;
}

function exactCleanRepository(value: string, revision: string | undefined, variable: string): string {
  const repository = path.resolve(value);
  if (!existsSync(path.join(repository, '.git'))) {
    throw new Error(`${variable} must point to a Git worktree: ${repository}`);
  }
  const actual = run('git', ['rev-parse', 'HEAD'], repository);
  if (revision && actual !== revision) throw new Error(`${variable} must be exact ${revision}; found ${actual}`);
  const status = run('git', ['status', '--porcelain=v1'], repository);
  if (status !== '') throw new Error(`${variable} must be clean; found:\n${status}`);
  return repository;
}

function verifyCanonicalBundle(rootDir: string): void {
  const source = readFileSync(path.join(rootDir, 'scripts', 'test-flyway-ci-bundle.ps1'), 'utf8');
  const dockerSection = source.indexOf('$suffix = [guid]');
  if (dockerSection < 0) throw new Error('Root Flyway verification policy has an unknown layout');
  const escapedRoot = rootDir.replaceAll("'", "''");
  const policy = source.slice(0, dockerSection).replace(
    "$root = Split-Path -Parent $PSScriptRoot",
    `$root = '${escapedRoot}'`,
  );
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'a23-flyway-policy-'));
  const policyPath = path.join(temporary, 'verify-pinned-bundle.ps1');
  writeFileSync(policyPath, policy, { encoding: 'utf8', mode: 0o600 });
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  try { run(shell, powershellPolicyArguments(process.platform, policyPath), rootDir); }
  finally { rmSync(temporary, { recursive: true, force: true }); }
}

function sweepStaleResources(): void {
  const containers = docker('ps', '-aq', '--filter', `label=${projectLabel}`).split(/\s+/).filter(Boolean);
  for (const container of containers) {
    const [state] = JSON.parse(docker('container', 'inspect', container)) as Array<{
      Created: string; State: { Running: boolean };
    }>;
    if (shouldReapContainer(state.State.Running, state.Created)) docker('rm', '-f', container);
  }
  const networks = docker('network', 'ls', '-q', '--filter', `label=${projectLabel}`).split(/\s+/).filter(Boolean);
  for (const network of networks) {
    const [state] = JSON.parse(docker('network', 'inspect', network)) as Array<{
      Created: string; Containers: Record<string, unknown>;
    }>;
    if (shouldReapNetwork(Object.keys(state.Containers ?? {}).length, state.Created)) {
      docker('network', 'rm', network);
    }
  }
}

function assertNoActiveProjectRun(): void {
  const containers = docker('ps', '-q', '--filter', `label=${projectLabel}`).split(/\s+/).filter(Boolean);
  const states = containers.map((container) => {
    const [state] = JSON.parse(docker('container', 'inspect', container)) as Array<{
      Name: string; State: { Running: boolean };
    }>;
    return { name: state.Name.replace(/^\//, ''), running: state.State.Running };
  });
  if (hasActiveProjectRun(states)) {
    throw new Error(`Another A23 real API run owns the shared backend checkout: ${states
      .filter((state) => state.running).map((state) => state.name).join(', ')}`);
  }
}

function acquireRunLock(lock: string, runLabel: string, ownedContainers: Set<string>): void {
  try {
    docker('create', '--name', lock, '--label', projectLabel, '--label', runLabel,
      'postgres:16-alpine', 'sh', '-c', 'trap exit TERM INT; while :; do sleep 3600; done');
  } catch (cause) {
    const output = commandFailureOutput(cause);
    if (isDockerContainerNameConflict(output)) {
      throw new Error('Another A23 real API run atomically acquired the shared backend lock');
    }
    throw cause;
  }
  ownedContainers.add(lock);
  docker('start', lock);
}

function commandFailureOutput(cause: unknown): string {
  if (typeof cause !== 'object' || cause === null) return String(cause);
  const failure = cause as { message?: unknown; stdout?: unknown; stderr?: unknown };
  return [failure.message, failure.stdout, failure.stderr]
    .filter((value): value is string | Buffer => typeof value === 'string' || Buffer.isBuffer(value))
    .map((value) => value.toString()).join('\n');
}

function resourceExists(kind: 'container' | 'network' | 'volume', name: string): boolean {
  const result = spawnSync('docker', [kind, 'inspect', name], { encoding: 'utf8' });
  const message = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  try { return interpretDockerInspect(result.status, message); }
  catch (cause) { throw new Error(`Unable to inspect Docker ${kind} ${name}`, { cause }); }
}

async function waitForPostgres(container: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { docker('exec', container, 'pg_isready', '-U', 'postgres', '-d', 'a23'); return; }
    catch { await delay(1_000); }
  }
  throw new Error('ephemeral PostgreSQL did not become ready');
}

async function waitForBackend(container: string): Promise<void> {
  const timeoutMs = backendReadyTimeoutMs(process.env.A23_BACKEND_READY_TIMEOUT_SECONDS);
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/actuator/health`);
      if (response.ok) return;
    } catch { /* backend is still compiling or starting */ }
    if (attempt > 0 && attempt % 30 === 0) {
      const running = docker('inspect', '-f', '{{.State.Running}}', container);
      if (running !== 'true') throw new Error(`backend container exited: ${container}\n${dockerLogs(container)}`);
    }
    attempt += 1;
    await delay(1_000);
  }
  throw new Error(`backend did not become healthy within ${timeoutMs / 1_000}s: ${container}\n${dockerLogs(container)}`);
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
