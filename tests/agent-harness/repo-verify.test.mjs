import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { editChecks, FULL_CHECKS } from '../../scripts/verify.mjs';
import { runNode } from './helpers.mjs';

const script = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'verify.mjs');
const VALIDATE = ['python3', 'scripts/skills.py', 'validate'];

test('editChecks maps a file to its argv list', () => {
  assert.deepEqual(editChecks('a.mjs'), [['node', '--check', 'a.mjs']]);
  assert.deepEqual(editChecks('scripts/x.py'), [['python3', '-m', 'py_compile', 'scripts/x.py']]);
  assert.deepEqual(editChecks('skills/feature-rfc/SKILL.md'), [VALIDATE]);
  assert.deepEqual(editChecks('.claude-plugin/marketplace.json'), [VALIDATE]);
  assert.deepEqual(editChecks('README.md'), []);
});

test('skills files add the validator to the per-type checks', () => {
  assert.deepEqual(editChecks('skills/x/assets/t/a.mjs'), [['node', '--check', 'skills/x/assets/t/a.mjs'], VALIDATE]);
});

test('FULL_CHECKS is the full list', () => {
  assert.deepEqual(FULL_CHECKS, [
    VALIDATE,
    ['python3', '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_*.py'],
    ['npm', 'test'],
    ['node', '.agents/harness/hook-runtime/cli.mjs', 'check'],
    ['node', '.agents/harness/verify-gate/cli.mjs', 'check'],
  ]);
});

test('an invalid .json file fails the edit run', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'repo-verify-'));
  try {
    await writeFile(join(dir, 'bad.json'), '{ nope');
    await writeFile(join(dir, 'good.json'), '{"a": 1}');
    const env = { VERIFY_TRIGGER: 'edit' };
    const bad = await runNode(script, [], { cwd: dir, env: { ...env, VERIFY_FILE: 'bad.json' } });
    assert.notEqual(bad.code, 0);
    assert.match(bad.stderr, /bad\.json/);
    const good = await runNode(script, [], { cwd: dir, env: { ...env, VERIFY_FILE: 'good.json' } });
    assert.equal(good.code, 0, good.stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
