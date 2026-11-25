// verify-gate cli.mjs (design D6 install/update/check, spec "Manual run"), spawned against temp
// repos, plus a real node:test failure counted across turn ends.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, runNode, tempRepo } from './helpers.mjs';
import { fire, proofCtx, turnEnd, verifyRepo } from './verify-helpers.mjs';

const { createVerifyHandler } = await import(pathToFileURL(join(ASSETS.verifyGate, 'handler.mjs')).href);
const HR_CLI = join(ASSETS.hookRuntime, 'cli.mjs');
const VG_CLI = join(ASSETS.verifyGate, 'cli.mjs');
const cleanups = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const vg = (r, ...args) => runNode(VG_CLI, [...args, '--repo', r.dir], { cwd: r.dir });
const installedVg = (r, ...args) => runNode(join(r.dir, '.agents/harness/verify-gate/cli.mjs'), args, { cwd: r.dir });
const json = (r, rel) => JSON.parse(readFileSync(join(r.dir, rel), 'utf8'));

async function repo(opts) {
  const r = await tempRepo(opts);
  cleanups.push(r.cleanup);
  return r;
}

async function withRuntime(files) {
  const r = await repo({ files });
  const out = await runNode(HR_CLI, ['install', '--repo', r.dir], { cwd: r.dir });
  assert.equal(out.code, 0, out.stderr);
  return r;
}

const setSection = (r, section) => {
  const cfg = json(r, '.agents/harness.json');
  cfg['verify-gate'] = section;
  writeFileSync(join(r.dir, '.agents/harness.json'), `${JSON.stringify(cfg, null, 2)}\n`);
};

test('install refuses without hook-runtime', async () => {
  const r = await repo();
  const out = await vg(r, 'install');
  assert.equal(out.code, 1);
  assert.match(out.stderr, /hook-runtime/);
  assert.equal(existsSync(join(r.dir, '.agents/harness/verify-gate')), false);
});

test('install adds the command stub and check fails with "set verify-gate.command"', async () => {
  const r = await withRuntime();
  const out = await vg(r, 'install');
  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(json(r, '.agents/harness.json')['verify-gate'], { command: [] });
  assert.ok(json(r, '.agents/harness/lock.json').tools['verify-gate'].files['handler.mjs']);
  const check = await installedVg(r, 'check');
  assert.equal(check.code, 1);
  assert.match(check.stderr, /set verify-gate\.command/);
});

test('check passes once the command is set', async () => {
  const r = await withRuntime();
  assert.equal((await vg(r, 'install')).code, 0);
  setSection(r, { command: ['node', '-e', '0'] });
  const check = await installedVg(r, 'check');
  assert.equal(check.code, 0, check.stderr);
  assert.match(check.stdout, /verify-gate: ok/);
});

test('maxBlocks 5 is rejected by check; other bad values too', async () => {
  const r = await withRuntime();
  assert.equal((await vg(r, 'install')).code, 0);
  for (const [section, re] of /** @type {[object, RegExp][]} */ ([
    [{ command: ['x'], maxBlocks: 5 }, /maxBlocks.*1.*3/],
    [{ command: ['x'], maxBlocks: 0 }, /maxBlocks.*1.*3/],
    [{ command: ['x'], timeoutSeconds: -1 }, /timeoutSeconds/],
    [{ command: ['x'], taskFiles: 'a' }, /taskFiles/],
    [{ command: 'npm test' }, /set verify-gate\.command/],
  ])) {
    setSection(r, section);
    const check = await installedVg(r, 'check');
    assert.equal(check.code, 1, JSON.stringify(section));
    assert.match(check.stderr, re);
  }
});

test('check fails when hook-runtime is missing from the lock', async () => {
  const r = await withRuntime();
  assert.equal((await vg(r, 'install')).code, 0);
  setSection(r, { command: ['node', '-e', '0'] });
  const lock = json(r, '.agents/harness/lock.json');
  delete lock.tools['hook-runtime'];
  writeFileSync(join(r.dir, '.agents/harness/lock.json'), JSON.stringify(lock));
  const check = await installedVg(r, 'check');
  assert.equal(check.code, 1);
  assert.match(check.stderr, /hook-runtime/);
});

for (const mode of ['install', 'update']) {
  test(`${mode}: an edited copy refused`, async () => {
    const r = await withRuntime();
    assert.equal((await vg(r, 'install')).code, 0);
    appendFileSync(join(r.dir, '.agents/harness/verify-gate/handler.mjs'), '// edited\n');
    const out = await vg(r, mode);
    assert.equal(out.code, 1);
    assert.match(out.stderr, /handler\.mjs differs from the lock/);
    assert.match(out.stderr, /git checkout --/);
  });

  test(`${mode}: an unknown own key rejected`, async () => {
    const r = await withRuntime();
    setSection(r, { command: ['x'], bogus: 1 });
    const out = await vg(r, mode);
    assert.equal(out.code, 1);
    assert.match(out.stderr, /unknown key "bogus"/);
    assert.equal(json(r, '.agents/harness/lock.json').tools['verify-gate'], undefined, 'nothing written');
  });

  test(`${mode}: a foreign top-level key ignored`, async () => {
    const r = await withRuntime();
    const cfg = json(r, '.agents/harness.json');
    cfg['other-tool'] = { anything: true };
    writeFileSync(join(r.dir, '.agents/harness.json'), JSON.stringify(cfg));
    const out = await vg(r, mode);
    assert.equal(out.code, 0, out.stderr);
    assert.deepEqual(json(r, '.agents/harness.json')['other-tool'], { anything: true });
  });
}

test('run exits 0 on a pass and 1 on a failure', async () => {
  const r = await verifyRepo({ files: { 'src/a.js': 'a\n' } });
  cleanups.push(r.cleanup);
  const ok = await vg(r, 'run');
  assert.equal(ok.code, 0, ok.stderr + ok.stdout);
  assert.match(ok.stdout, /verify: passed/);
  const h = createVerifyHandler();
  assert.equal(await h.proofs['verify-pass'](proofCtx(r)), null, 'verify-pass holds afterwards');
  const again = await vg(r, 'run');
  assert.equal(again.code, 0);
  assert.match(again.stdout, /no change since the last full pass/);
  assert.equal(r.log().length, 1);
  r.fail('E7 broken\n');
  await r.write('src/a.js', 'b\n');
  const bad = await vg(r, 'run');
  assert.equal(bad.code, 1);
  assert.match(bad.stdout + bad.stderr, /E7 broken/);
});

test('two real processes at once: the second waits for the lock, then takes the shortcut or runs', async () => {
  const r = await verifyRepo({ files: { 'src/a.js': 'a\n' } });
  cleanups.push(r.cleanup);
  r.setSleep(1);
  const [a, b] = await Promise.all([vg(r, 'run'), vg(r, 'run')]);
  assert.equal(a.code, 0, a.stderr);
  assert.equal(b.code, 0, b.stderr);
  const outs = [a.stdout, b.stdout].join('\n');
  assert.match(outs, /verify: passed/);
  assert.ok(r.log().length >= 1 && r.log().length <= 2);
  assert.doesNotThrow(() => JSON.parse(readFileSync(join(r.toolDir, 'pass.json'), 'utf8')));
});

test('four consecutive turn ends with a real, consistently failing node:test file (changing duration_ms) count as one failure, so the fourth gets the notice', async () => {
  const r = await verifyRepo({ files: { 'src/a.js': 'a\n' } });
  cleanups.push(r.cleanup);
  const testFile = join(r.gitDir, 'fail.test.mjs');
  writeFileSync(
    testFile,
    "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n" +
      "test('always fails', async () => { await new Promise((r) => setTimeout(r, Math.random() * 30)); assert.equal(1 + 1, 3); });\n",
  );
  // The outer node --test exports NODE_TEST_CONTEXT, which would make the inner run report to it.
  await r.setConfig({ command: ['env', '-u', 'NODE_TEST_CONTEXT', process.execPath, '--test', testFile] });
  const h = createVerifyHandler();
  const texts = [];
  for (let i = 1; i <= 4; i++) {
    await r.write('src/a.js', `edit ${i}\n`);
    const { result } = await fire(h, r, turnEnd());
    texts.push(result.block ?? result.context);
    if (i < 4) assert.match(result.block ?? '', new RegExp(`attempt ${i} of 3`), result.context);
  }
  assert.match(texts[0], /duration_ms/);
  assert.match(texts[3], /^verify: still failing after 3 blocks; continuing\./);
});
