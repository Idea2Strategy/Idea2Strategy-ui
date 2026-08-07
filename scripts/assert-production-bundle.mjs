import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const assets = path.resolve('dist', 'assets');
const files = (await readdir(assets)).filter((file) => file.endsWith('.js'));
assert.ok(files.length > 0, 'production bundle has no JavaScript assets');

const code = (await Promise.all(files.map((file) => readFile(path.join(assets, file), 'utf8')))).join('\n');
for (const marker of ['Bot 3F9A', 'Volume Regime Draft']) {
  assert.ok(!code.includes(marker), `prototype fixture leaked into production bundle: ${marker}`);
}
assert.ok(!files.some((file) => file.startsWith('mockData-')), 'mockData chunk leaked into production bundle');
