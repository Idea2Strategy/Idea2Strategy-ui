import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('real API CI uses the latest root integration and its exact backend submodule', async () => {
  const workflow = await readFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  const job = workflow.slice(workflow.indexOf('  real-account-api:'));

  assert.match(job, /repository: Idea2Strategy\/Idea2Strategy\s+ref: develop\s+path: root/);
  assert.match(job, /git -C root submodule update --init --depth 1 backend/);
  assert.doesNotMatch(job, /repository: Idea2Strategy\/Idea2Strategy-backend/);
  assert.doesNotMatch(job, /ref: [0-9a-f]{40}/);
  assert.match(job, /A23_BACKEND_DIR: \$\{\{ github\.workspace \}\}\/root\/backend/);
  assert.match(job, /A23_ROOT_DIR: \$\{\{ github\.workspace \}\}\/root/);
  assert.match(job, /A23_GRADLE_CACHE_DIR: \$\{\{ runner\.temp \}\}\/a23-real-api-gradle-cache/);
});
