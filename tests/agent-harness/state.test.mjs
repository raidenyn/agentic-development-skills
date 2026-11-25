import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, tempRepo } from './helpers.mjs';

const S = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'state.mjs')).href);
const { acquireGateLock, writeJsonAtomic, sessionStateDir, gitDir, toolStateDir, updateGateLock } = S;

const dir = () => mkdtempSync(join(tmpdir(), 'gate-'));
const locks = (d) => readdirSync(d).filter((f) => /^gate\.lock\.\d+$/.test(f)).sort((a, b) => Number(a.split('.')[2]) - Number(b.split('.')[2]));
const put = (d, n, v) => writeFileSync(join(d, `gate.lock.${n}`), JSON.stringify(v));
const deadPid = () => {
  const r = spawnSync(process.execPath, ['-e', '0']);
  return r.pid;
};

test('sessionStateDir differs per agent', async () => {
  const r = await tempRepo();
  const a = sessionStateDir({ repoRoot: r.dir, tool: 'verify-gate', host: 'claude', sessionId: 's/1', agentId: 'main' });
  const b = sessionStateDir({ repoRoot: r.dir, tool: 'verify-gate', host: 'claude', sessionId: 's/1', agentId: 'a1' });
  assert.notEqual(a, b);
  assert.ok(existsSync(a) && existsSync(b));
  const base = join(gitDir(r.dir), 'agent-harness', 'verify-gate', 'sessions');
  assert.ok(a.startsWith(base) && b.startsWith(base));
  assert.ok(a.startsWith(toolStateDir(r.dir, 'verify-gate')));
  assert.ok(!a.slice(base.length).includes('s/1'));
  await r.cleanup();
});

test('state lives outside the work tree', async () => {
  const r = await tempRepo();
  sessionStateDir({ repoRoot: r.dir, tool: 'verify-gate', host: 'h', sessionId: 's', agentId: 'main' });
  assert.equal(r.git('status', '--porcelain'), '');
  await r.cleanup();
});

test('the lock is exclusive', () => {
  const d = dir();
  const a = acquireGateLock(d);
  assert.equal(a.path, join(d, 'gate.lock.1'));
  assert.equal(acquireGateLock(d), null);
  a.release();
  const b = acquireGateLock(d);
  assert.equal(b.path, join(d, 'gate.lock.2'));
  b.release();
});

test("a dead owner's lock is taken over", () => {
  const d = dir();
  put(d, 3, { pid: deadPid(), at: Date.now() });
  const h = acquireGateLock(d);
  assert.equal(h.path, join(d, 'gate.lock.4'));
  assert.ok(existsSync(join(d, 'gate.lock.3')));
  h.release();
});

test("a live owner's lock is never taken over", () => {
  const d = dir();
  put(d, 2, { pid: process.pid, at: 0 });
  assert.equal(acquireGateLock(d), null);
});

test('two contenders against a dead owner', () => {
  const d = dir();
  put(d, 3, { pid: deadPid(), at: 1 });
  let inner;
  const outer = acquireGateLock(d, {
    beforeLink() {
      inner = acquireGateLock(d);
    },
  });
  assert.equal(inner.path, join(d, 'gate.lock.4'));
  assert.equal(outer, null);
  assert.ok(!existsSync(join(d, 'gate.lock.5')));
});

test('a paused stale contender cannot displace a live owner', () => {
  const d = dir();
  put(d, 5, { pid: deadPid(), at: 1 });
  let c;
  const a = acquireGateLock(d, {
    beforeLink() {
      acquireGateLock(d).release(); // B: 6
      c = acquireGateLock(d); // C: 7
    },
  });
  assert.equal(a, null);
  assert.equal(c.path, join(d, 'gate.lock.7'));
  assert.equal(JSON.parse(readFileSync(c.path, 'utf8')).released, undefined);
  assert.equal(locks(d).at(-1), 'gate.lock.7');
  c.release();
});

test('variant: pruned low number is linked, then the contender backs off', () => {
  const d = dir();
  put(d, 5, { pid: deadPid(), at: 1 });
  let c;
  const a = acquireGateLock(d, {
    beforeLink() {
      acquireGateLock(d).release(); // 6
      c = acquireGateLock(d); // 7
      unlinkSync(join(d, 'gate.lock.6'));
    },
  });
  assert.equal(a, null);
  assert.equal(JSON.parse(readFileSync(join(d, 'gate.lock.6'), 'utf8')).released, true);
  assert.equal(JSON.parse(readFileSync(c.path, 'utf8')).released, undefined);
  c.release();
});

test('a reader never sees a half-written owner, and update rewrites the file', () => {
  const d = dir();
  const h = acquireGateLock(d);
  const body = JSON.parse(readFileSync(h.path, 'utf8'));
  assert.equal(body.pid, process.pid);
  assert.deepEqual(body.pgids ?? [], []);
  updateGateLock(h, { pgids: [123] });
  assert.deepEqual(JSON.parse(readFileSync(h.path, 'utf8')).pgids, [123]);
  h.update({ pgids: [] });
  assert.equal(readdirSync(d).filter((f) => !f.startsWith('gate.lock.')).length, 0);
  h.release();
  assert.equal(JSON.parse(readFileSync(h.path, 'utf8')).released, true);
});

test('old lower files are pruned and the highest file is never deleted', () => {
  const d = dir();
  const old = new Date(Date.now() - 2 * 3600e3);
  for (const n of [1, 2]) {
    put(d, n, { pid: 1, released: true });
    utimesSync(join(d, `gate.lock.${n}`), old, old);
  }
  put(d, 3, { pid: 1, released: true });
  const h = acquireGateLock(d);
  assert.deepEqual(locks(d), ['gate.lock.3', 'gate.lock.4']);
  h.release();
  for (let i = 0; i < 4; i++) acquireGateLock(d).release();
  assert.equal(locks(d).at(-1), 'gate.lock.8');
  assert.ok(existsSync(join(d, 'gate.lock.8')));
});

test('writeJsonAtomic leaves no partial file (reader never sees invalid JSON)', async () => {
  const { spawn } = await import('node:child_process');
  const d = dir();
  const f = join(d, 'y.json');
  writeJsonAtomic(f, { n: 0 });
  const big = 'z'.repeat(300000);
  const script = join(d, 'writer.mjs');
  writeFileSync(script, `
    import { writeJsonAtomic } from ${JSON.stringify(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'state.mjs')).href)};
    for (let i = 1; i <= 200; i++) writeJsonAtomic(${JSON.stringify(f)}, { n: i, big: ${JSON.stringify(big)} });
  `);
  const child = spawn(process.execPath, [script], { stdio: 'ignore' });
  let done = false;
  child.on('close', () => (done = true));
  let reads = 0;
  while (!done) {
    JSON.parse(readFileSync(f, 'utf8'));
    reads++;
    await new Promise((r) => setImmediate(r));
  }
  assert.ok(reads > 0);
});
