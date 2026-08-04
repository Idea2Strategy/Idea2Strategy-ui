import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface PendingCode { challenge: string; nonce: string; clientId: string; redirectUri: string }

export interface MockOperatorIdp { url: string; close(): Promise<void> }

export async function startMockOperatorIdp(port: number): Promise<MockOperatorIdp> {
  const url = `http://127.0.0.1:${port}`;
  const codes = new Map<string, PendingCode>();
  const server = createServer(async (request, response) => {
    const target = new URL(request.url ?? '/', url);
    if (target.pathname === '/health') return json(response, 200, { status: 'ok' });
    if (target.pathname === '/authorize') {
      const redirectUri = required(target, 'redirect_uri');
      const code = randomUUID();
      if (required(target, 'response_type') !== 'code' || required(target, 'code_challenge_method') !== 'S256') {
        return json(response, 400, { error: 'invalid_request' });
      }
      codes.set(code, {
        challenge: required(target, 'code_challenge'),
        nonce: required(target, 'nonce'),
        clientId: required(target, 'client_id'),
        redirectUri,
      });
      const callback = new URL(redirectUri);
      callback.searchParams.set('code', code);
      callback.searchParams.set('state', required(target, 'state'));
      response.writeHead(302, { Location: callback.href });
      return response.end();
    }
    if (target.pathname === '/token' && request.method === 'POST') {
      const body = new URLSearchParams(await readBody(request));
      const code = body.get('code') ?? '';
      const pending = codes.get(code);
      const verifier = body.get('code_verifier') ?? '';
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      if (!pending || body.get('grant_type') !== 'authorization_code'
          || body.get('client_id') !== pending.clientId || body.get('redirect_uri') !== pending.redirectUri
          || challenge !== pending.challenge) {
        return json(response, 400, { error: 'invalid_grant' }, cors());
      }
      codes.delete(code);
      const now = Math.floor(Date.now() / 1000);
      return json(response, 200, {
        access_token: jwt({ iss: url, aud: 'idea2strategy-operator', iat: now, exp: now + 300 }),
        id_token: jwt({ iss: url, aud: pending.clientId, nonce: pending.nonce, iat: now, exp: now + 300 }),
        token_type: 'Bearer',
        expires_in: 300,
      }, cors());
    }
    if (target.pathname === '/logout') {
      response.writeHead(302, { Location: required(target, 'post_logout_redirect_uri') });
      return response.end();
    }
    return json(response, 404, { error: 'not_found' });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return { url, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

function required(url: URL, name: string) {
  const value = url.searchParams.get(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function jwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.${encode('mock-signature')}`;
}

function cors() {
  return { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4318', Vary: 'Origin' };
}

function json(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}
