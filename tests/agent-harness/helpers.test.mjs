import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { ASSETS, runNode, tempRepo } from './helpers.mjs';

test('tempRepo creates a committed repo', async () => {
  const repo = await tempRepo();
  try {
    assert.match(repo.git('rev-parse', 'HEAD').trim(), /^[0-9a-f]{40}$/);
  } finally {
    await repo.cleanup();
  }
});

test('ASSETS point at the tool folders and runNode runs a script', async () => {
  assert.ok(existsSync(ASSETS.hookRuntime + '/tool.json'));
  assert.ok(existsSync(ASSETS.verifyGate + '/tool.json'));
  const r = await runNode('-e', ['console.log(1)'], { input: '' });
  assert.equal(r.code, 0);
});
