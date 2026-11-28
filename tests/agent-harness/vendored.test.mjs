import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOLS = [
  ['hook-runtime', 'agent-harness-hook-runtime'],
  ['hooked-rules', 'agent-harness-hooked-rules'],
  ['verify-gate', 'agent-harness-verify-gate'],
];

async function walk(dir, base = dir) {
  const out = new Map();
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) for (const [k, v] of await walk(full, base)) out.set(k, v);
    else out.set(full.slice(base.length + 1), await readFile(full));
  }
  return out;
}

for (const [tool, skill] of TOOLS) {
  test(`.agents/harness/${tool} equals the skill's copy byte for byte`, async () => {
    const source = await walk(join(root, 'skills', skill, 'assets', tool));
    let copy;
    try {
      copy = await walk(join(root, '.agents', 'harness', tool));
    } catch {
      assert.fail(`.agents/harness/${tool} is missing: run update`);
    }
    assert.deepEqual([...copy.keys()].sort(), [...source.keys()].sort(), `file lists differ: run update`);
    for (const [rel, bytes] of source) {
      assert.ok(bytes.equals(copy.get(rel)), `${rel} differs: run update`);
    }
  });
}
