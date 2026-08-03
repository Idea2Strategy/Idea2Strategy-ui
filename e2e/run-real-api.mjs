import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const allocatePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : null;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});

const appPort = await allocatePort();
const backendPort = await allocatePort();
if (!appPort || !backendPort || appPort === backendPort) throw new Error('Unable to allocate isolated E2E ports');

const windows = process.platform === 'win32';
const command = windows ? process.env.ComSpec ?? 'cmd.exe' : 'pnpm';
const args = windows
  ? ['/d', '/s', '/c', 'pnpm exec playwright test --config playwright.real-api.config.ts']
  : ['exec', 'playwright', 'test', '--config', 'playwright.real-api.config.ts'];
const child = spawn(command, args, {
  stdio: 'inherit',
  env: { ...process.env, A23_APP_PORT: String(appPort), A23_BACKEND_PORT: String(backendPort) },
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}
child.once('error', (error) => { throw error; });
child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
