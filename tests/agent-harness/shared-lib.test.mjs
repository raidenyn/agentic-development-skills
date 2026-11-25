import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASSETS } from './helpers.mjs';

test('shared lib files are byte-identical across both tools', () => {
  for (const f of ['config.mjs', 'state.mjs', 'install.mjs']) {
    const a = readFileSync(join(ASSETS.hookRuntime, 'lib', f));
    const b = readFileSync(join(ASSETS.verifyGate, 'lib', f));
    assert.ok(a.equals(b), `${f} differs between hook-runtime and verify-gate`);
  }
});
