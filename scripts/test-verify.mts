import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { editChecks, FULL_CHECKS } from './verify.mts';
import { runNode } from '../tests/agent-harness/helpers.mjs';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'verify.mts');
const VALIDATE = ['python3', 'scripts/skills.py', 'validate'];

const BIOME = 'node_modules/.bin/biome';
const BUILD = ['node', 'scripts/build.mts'];

test('editChecks maps a file to its argv list', () => {
  assert.deepEqual(editChecks('scripts/x.py'), [['python3', '-m', 'py_compile', 'scripts/x.py']]);
  assert.deepEqual(editChecks('skills/feature-rfc/SKILL.md'), [VALIDATE]);
  assert.deepEqual(editChecks('.claude-plugin/marketplace.json'), [VALIDATE]);
  assert.deepEqual(editChecks('README.md'), []);
});

test('edit of a source file lints it and builds', () => {
  assert.deepEqual(editChecks('src/verify-gate/lib/run.mts'), [[BIOME, 'check', 'src/verify-gate/lib/run.mts'], BUILD]);
});

test('edit of a data file under src builds', () => {
  assert.deepEqual(editChecks('src/hook-runtime/tool.json'), [BUILD]);
});

test('edit of a repo script lints it', () => {
  assert.deepEqual(editChecks('scripts/build.mts'), [[BIOME, 'check', 'scripts/build.mts']]);
});

test('edit of a harness test lints it', () => {
  assert.deepEqual(editChecks('tests/agent-harness/run.test.mjs'), [
    [BIOME, 'check', 'tests/agent-harness/run.test.mjs'],
  ]);
});

test('edit of a recorded fixture is not linted', () => {
  assert.deepEqual(editChecks('tests/agent-harness/fixtures/capability-handler/handler.mjs'), []);
});

test('edit of a generated file runs the build check', () => {
  const checks = editChecks('skills/agent-harness-verify-gate/assets/verify-gate/cli.mjs');
  assert.deepEqual(checks, [[...BUILD, '--check'], VALIDATE]);
  assert.ok(!checks.some((c) => c[0] === BIOME));
});

test('edit of an installed copy is not linted', () => {
  assert.ok(!editChecks('.agents/harness/verify-gate/cli.mjs').some((c) => c[0] === BIOME));
});

test('FULL_CHECKS is the full list', () => {
  assert.deepEqual(FULL_CHECKS, [
    VALIDATE,
    ['python3', '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_*.py'],
    ['pnpm', 'run', 'check'],
    ['node', '.agents/harness/hook-runtime/cli.mjs', 'check'],
    ['node', '.agents/harness/verify-gate/cli.mjs', 'check'],
    ['node', '.agents/harness/hooked-rules/cli.mjs', 'check'],
    ['node', '.agents/harness/hooked-rules/cli.mjs', 'pointers', '--check'],
  ]);
  assert.ok(!FULL_CHECKS.some((c) => c.join(' ') === 'pnpm test'));
});

test('edit of a rule file or AGENTS.md runs the pointer check', () => {
  const POINTER_CHECK = ['node', '.agents/harness/hooked-rules/cli.mjs', 'pointers', '--check'];
  assert.deepEqual(editChecks('.agents/hooked-rules/repo-commit-types.md'), [POINTER_CHECK]);
  assert.deepEqual(editChecks('AGENTS.md'), [POINTER_CHECK]);
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

test('a missing PyYAML fails with the install hint', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'repo-verify-'));
  try {
    await mkdir(join(dir, 'bin'));
    await writeFile(join(dir, 'bin', 'python3'), '#!/bin/sh\nexit 1\n');
    await chmod(join(dir, 'bin', 'python3'), 0o755);
    const env = { VERIFY_TRIGGER: 'turn-end', PATH: `${join(dir, 'bin')}:${process.env.PATH}` };
    const out = await runNode(script, [], { cwd: dir, env });
    assert.notEqual(out.code, 0);
    assert.match(out.stderr, /PyYAML is missing: pip install -r requirements-dev\.txt/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function editRun(stub: string | null) {
  const dir = await mkdtemp(join(tmpdir(), 'repo-verify-'));
  try {
    await mkdir(join(dir, 'scripts'));
    await writeFile(join(dir, 'scripts', 'x.mts'), 'export {};\n');
    if (stub !== null) {
      await mkdir(join(dir, 'node_modules', '.bin'), { recursive: true });
      await writeFile(join(dir, 'node_modules', '.bin', 'biome'), `#!/bin/sh\n${stub}\n`);
      await chmod(join(dir, 'node_modules', '.bin', 'biome'), 0o755);
    }
    return await runNode(script, [], { cwd: dir, env: { VERIFY_TRIGGER: 'edit', VERIFY_FILE: 'scripts/x.mts' } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a passing edit check prints nothing', async () => {
  const out = await editRun("echo 'Checked 1 file in 3ms. No fixes applied.' >&2; echo ok; exit 0");
  assert.equal(out.code, 0);
  assert.equal(out.stdout, '');
  assert.equal(out.stderr, '');
});

test('a passing edit check with large output prints nothing', async () => {
  const out = await editRun("head -c 2000000 /dev/zero | tr '\\0' a; exit 0");
  assert.equal(out.code, 0);
  assert.equal(out.stdout, '');
  assert.equal(out.stderr, '');
});

test('a failing edit check prints its output on stderr', async () => {
  const out = await editRun("echo 'x.mts:1 lint/bad'; exit 1");
  assert.equal(out.code, 1);
  assert.equal(out.stdout, '');
  assert.match(out.stderr, /x\.mts:1 lint\/bad/);
  assert.match(out.stderr, /verify: failed \(exit 1\): node_modules\/\.bin\/biome check scripts\/x\.mts/);
});

test('a failing edit check keeps stdout and stderr apart', async () => {
  const out = await editRun("printf 'stdout-fragment'; printf 'stderr-diagnostic\\n' >&2; exit 1");
  assert.equal(out.code, 1);
  assert.equal(
    out.stderr,
    'stdout-fragment\nstderr-diagnostic\nverify: failed (exit 1): node_modules/.bin/biome check scripts/x.mts\n',
  );
});

test('a stdout-only unterminated failure starts the failed line on a new line', async () => {
  const out = await editRun("printf 'stdout-fragment'; exit 1");
  assert.equal(out.code, 1);
  assert.equal(out.stderr, 'stdout-fragment\nverify: failed (exit 1): node_modules/.bin/biome check scripts/x.mts\n');
});

test('an edit check that cannot start reports it', async () => {
  const out = await editRun(null);
  assert.equal(out.code, 1);
  assert.match(out.stderr, /verify: failed \(spawnSync node_modules\/\.bin\/biome ENOENT\)/);
});
