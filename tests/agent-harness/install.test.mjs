import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, tempRepo } from './helpers.mjs';

const lib = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'install.mjs')).href);
const { installTool, checkTool, readLock, installHookRuntime } = lib;

function fakeTool(root, version, files) {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'tool.json'), JSON.stringify({ name: 'fake', version }));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
const v1 = { 'a.mjs': 'a\n', 'lib/b.mjs': 'b\n' };

async function setup() {
  const r = await tempRepo();
  const src = (name, version, files = v1) => fakeTool(join(r.dir, '..', `src-${name}-${Date.now()}-${Math.random()}`), version, files);
  return { r, src };
}

function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[p.slice(dir.length)] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

test('fresh install copies files and writes the lock', async () => {
  const { r, src } = await setup();
  const s = src('a', '0.1.0');
  const res = installTool({ sourceDir: s, repoRoot: r.dir, mode: 'install' });
  assert.equal(res.code, 0);
  for (const f of ['tool.json', 'a.mjs', 'lib/b.mjs']) {
    assert.deepEqual(readFileSync(join(r.dir, '.agents/harness/fake', f)), readFileSync(join(s, f)));
  }
  const lock = readLock(r.dir);
  assert.equal(lock.tools.fake.version, '0.1.0');
  assert.match(lock.tools.fake.files['a.mjs'], /^[0-9a-f]{64}$/);
  assert.ok(readFileSync(join(r.dir, '.agents/harness/lock.json'), 'utf8').endsWith('\n'));
  await r.cleanup();
});

test('repeated install changes nothing', async () => {
  const { r, src } = await setup();
  const s = src('a', '0.1.0');
  installTool({ sourceDir: s, repoRoot: r.dir, mode: 'install' });
  const before = [r.git('status', '--porcelain'), snapshot(r.dir)];
  const res = installTool({ sourceDir: s, repoRoot: r.dir, mode: 'install' });
  assert.equal(res.code, 0);
  assert.equal(res.changed, false);
  assert.deepEqual([r.git('status', '--porcelain'), snapshot(r.dir)], before);
  await r.cleanup();
});

test('install refuses another installed version', async () => {
  const { r, src } = await setup();
  installTool({ sourceDir: src('a', '0.0.9'), repoRoot: r.dir, mode: 'install' });
  const res = installTool({ sourceDir: src('b', '0.1.0'), repoRoot: r.dir, mode: 'install' });
  assert.equal(res.code, 1);
  assert.match(res.messages.join('\n'), /update/);
  await r.cleanup();
});

test('update replaces an older version', async () => {
  const { r, src } = await setup();
  installTool({ sourceDir: src('a', '0.1.0', { 'old.mjs': 'o\n' }), repoRoot: r.dir });
  const res = installTool({ sourceDir: src('b', '0.2.0', { 'new.mjs': 'n\n' }), repoRoot: r.dir, mode: 'update' });
  assert.equal(res.code, 0);
  assert.equal(existsSync(join(r.dir, '.agents/harness/fake/old.mjs')), false);
  assert.equal(existsSync(join(r.dir, '.agents/harness/fake/new.mjs')), true);
  assert.equal(readLock(r.dir).tools.fake.version, '0.2.0');
  await r.cleanup();
});

test('update refuses an edited copy and says how to restore it', async () => {
  const { r, src } = await setup();
  installTool({ sourceDir: src('a', '0.1.0'), repoRoot: r.dir });
  writeFileSync(join(r.dir, '.agents/harness/fake/lib/b.mjs'), 'edited\n');
  const before = snapshot(r.dir);
  const res = installTool({ sourceDir: src('b', '0.2.0', { 'x.mjs': 'x\n' }), repoRoot: r.dir, mode: 'update' });
  assert.equal(res.code, 1);
  const msg = res.messages.join('\n');
  assert.match(msg, /lib\/b\.mjs/);
  assert.match(msg, /git checkout --/);
  assert.match(msg, /lock entry/);
  assert.doesNotMatch(msg, /--force/);
  assert.deepEqual(snapshot(r.dir), before);
  await r.cleanup();
});

test('check reports a differing byte, a missing file and an extra file', async () => {
  const { r, src } = await setup();
  installTool({ sourceDir: src('a', '0.1.0'), repoRoot: r.dir });
  const dir = join(r.dir, '.agents/harness/fake');
  assert.deepEqual(checkTool({ toolDir: dir, repoRoot: r.dir }), []);
  writeFileSync(join(dir, 'a.mjs'), 'A\n');
  await import('node:fs').then((fs) => fs.rmSync(join(dir, 'lib/b.mjs')));
  writeFileSync(join(dir, 'extra.mjs'), 'e\n');
  const problems = checkTool({ toolDir: dir, repoRoot: r.dir }).join('\n');
  assert.match(problems, /a\.mjs/);
  assert.match(problems, /lib\/b\.mjs/);
  assert.match(problems, /extra\.mjs/);
  await r.cleanup();
});

test('check reports a missing lock entry', async () => {
  const { r, src } = await setup();
  const s = src('a', '0.1.0');
  assert.match(checkTool({ toolDir: s, repoRoot: r.dir }).join('\n'), /lock entry/);
  await r.cleanup();
});

test('a host-config refusal leaves everything unchanged', async () => {
  const { r, src } = await setup();
  await r.write('.claude/settings.json', '{\n  // comment\n}\n');
  const before = [r.git('status', '--porcelain'), snapshot(r.dir)];
  const res = installHookRuntime({ sourceDir: src('a', '0.1.0'), repoRoot: r.dir, events: { PreToolUse: 10, Stop: 1800 } });
  assert.equal(res.code, 1);
  assert.deepEqual([r.git('status', '--porcelain'), snapshot(r.dir)], before);
  assert.equal(existsSync(join(r.dir, 'opencode.json')), false);
  assert.equal(existsSync(join(r.dir, '.agents')), false);
  await r.cleanup();
});

test('a broken harness.json refuses the whole install', async () => {
  const { r, src } = await setup();
  await r.write('.agents/harness.json', '{nope');
  const res = installHookRuntime({ sourceDir: src('a', '0.1.0'), repoRoot: r.dir, events: { Stop: 1800 } });
  assert.equal(res.code, 1);
  assert.equal(existsSync(join(r.dir, '.agents/harness/lock.json')), false);
  assert.equal(existsSync(join(r.dir, '.claude')), false);
  await r.cleanup();
});

test('installHookRuntime installs, merges both host configs, and is idempotent', async () => {
  const { r, src } = await setup();
  const s = src('a', '0.1.0');
  const args = { sourceDir: s, repoRoot: r.dir, events: { PreToolUse: 10, Stop: 1800 } };
  const res = installHookRuntime(args);
  assert.equal(res.code, 0);
  assert.equal(readLock(r.dir).tools.fake.version, '0.1.0');
  assert.ok(existsSync(join(r.dir, '.claude/settings.json')));
  assert.ok(existsSync(join(r.dir, 'opencode.json')));
  const before = snapshot(r.dir);
  const again = installHookRuntime(args);
  assert.equal(again.code, 0);
  assert.equal(again.changed, false);
  assert.deepEqual(snapshot(r.dir), before);
  await r.cleanup();
});
