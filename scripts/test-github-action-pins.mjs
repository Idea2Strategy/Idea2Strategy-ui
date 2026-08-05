import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expected = new Map([
  ["actions/checkout", ["3d3c42e5aac5ba805825da76410c181273ba90b1", "v7.0.1"]],
  ["actions/setup-node", ["820762786026740c76f36085b0efc47a31fe5020", "v7.0.0"]],
  ["actions/upload-artifact", ["043fb46d1a93c77aae656e7c1c64a875d1fc6a0a", "v7.0.1"]],
  ["pnpm/action-setup", ["0977fd99725f1db4007ccb2928dbb4e90d06cc86", "v6.0.10"]],
]);
const uses = /^\s*(?:-\s+)?uses:\s+([^\s@]+)@([^\s#]+)(?:\s+#\s+(\S+))?\s*$/;

test("workflow actions use reviewed immutable Node.js 24 pins", async () => {
  const workflowRoot = path.join(root, ".github", "workflows");
  const files = (await readdir(workflowRoot)).filter((file) => file.endsWith(".yml"));
  let observed = 0;
  for (const file of files) {
    const lines = (await readFile(path.join(workflowRoot, file), "utf8")).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.includes("uses:")) return;
      const match = uses.exec(line);
      assert.ok(match, `${file}:${index + 1} has an invalid action reference`);
      const [, action, revision, tag] = match;
      assert.ok(expected.has(action), `${file}:${index + 1} uses unreviewed action ${action}`);
      assert.deepEqual([revision, tag], expected.get(action), `${file}:${index + 1} has a stale action pin`);
      observed += 1;
    });
  }
  assert.ok(observed > 0);
});
