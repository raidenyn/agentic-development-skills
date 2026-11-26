// Claude Code signal cleanup (design D4, C3): the exported onSignal unit, the listener-free main(),
// and the spawned entry against process groups that outlive a killed hook.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { ASSETS, tempRepo, until } from './helpers.mjs';
import { installBoth, verifyRepo } from './verify-helpers.mjs';

const { main, closeAll, onSignal } = await import(pathToFileURL(join(ASSETS.hookRuntime, 'claude.mjs')).href);
const { installTool } = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'install.mjs')).href);

const CLAUDE_MJS = join(ASSETS.hookRuntime, 'claude.mjs');
const FIXTURES = join(import.meta.dirname, 'fixtures', 'claude');

function timeout(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve('timeout'), ms);
    t.unref();
  });
}

function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

const groups = new Set();
const cleanups = [];
after(async () => {
  for (const pgid of groups) {
    try {
      process.kill(-pgid, 'SIGKILL');
    } catch {}
  }
  for (const c of cleanups) await c();
});

const stopPayload = (root) => {
  const p = JSON.parse(readFileSync(join(FIXTURES, 'Stop.json'), 'utf8').replaceAll('/REPO', root));
  // A root turn end with running subagents is a notice and is never charged; clear them so the gate
  // would charge a failure.
  p.background_tasks = [];
  return p;
};

const GROUP_SH = 'echo $$ > "$PGID_FILE"\nsleep 30\n';
const TRAP_SH = 'trap "" TERM\necho $$ > "$PGID_FILE"\nsleep 30\n';

// ---- onSignal, in process ------------------------------------------------------------------------

test('onSignal releases a pending result before it closes, then exits 0', async () => {
  const order = [];
  let exitCode;
  await onSignal({
    pending: {
      release: async () => {
        order.push('release');
      },
    },
    closeAll: async (opts) => {
      order.push('close');
      assert.ok(opts.cleanupDeadline > Date.now(), 'a cleanup deadline was passed');
    },
    exit: (code) => {
      exitCode = code;
    },
  });
  assert.deepEqual(order, ['release', 'close']);
  assert.equal(exitCode, 0);
});

test('onSignal with no pending result closes and exits 0', async () => {
  let closed = false;
  let exitCode;
  await onSignal({
    pending: null,
    closeAll: async () => {
      closed = true;
    },
    exit: (code) => {
      exitCode = code;
    },
  });
  assert.equal(closed, true);
  assert.equal(exitCode, 0);
});

test('onSignal bounds a release that never settles at about 1 s', async () => {
  const t0 = Date.now();
  let closed = false;
  await onSignal({
    pending: { release: () => new Promise(() => {}) },
    closeAll: async () => {
      closed = true;
    },
    exit: () => {},
  });
  const elapsed = Date.now() - t0;
  assert.equal(closed, true, 'closeAll ran once the release bound passed');
  assert.ok(elapsed >= 950, `release was allowed about 1 s (${elapsed} ms)`);
  assert.ok(elapsed < 1500, `the bound is about 1 s (${elapsed} ms)`);
});

// ---- main() installs no listeners ---------------------------------------------------------------

test('main() in process installs no SIGTERM listener', async () => {
  const r = await tempRepo();
  cleanups.push(r.cleanup);
  const src = join(r.dir, '.git', 'src-test-handler');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'tool.json'), JSON.stringify({ name: 'test-handler', version: '0.1.0', handler: true }));
  writeFileSync(
    join(src, 'handler.mjs'),
    "export default { name: 'test-handler', events: ['turn.end'], handle: () => null };\n",
  );
  assert.equal(installTool({ sourceDir: src, repoRoot: r.dir }).code, 0);

  const before = process.listenerCount('SIGTERM');
  const result = await main({
    stdin: JSON.stringify(stopPayload(r.dir)),
    cwd: r.dir,
    env: { CLAUDE_PROJECT_DIR: r.dir },
  });
  assert.equal(result.text, '');
  assert.equal(process.listenerCount('SIGTERM'), before, 'main() installs no signal listener');
  // A runtime really was created: close it so no worker outlives the test.
  if (typeof closeAll === 'function') await closeAll({ cleanupDeadline: Date.now() + 1000 });
});

// ---- the spawned entry against process groups --------------------------------------------------

/** @param {string} repo @param {{ env?: Record<string, string>, payload?: unknown }} [opts] */
function spawnEntry(repo, { env = {}, payload } = {}) {
  const child = spawn(process.execPath, [CLAUDE_MJS], {
    cwd: repo,
    detached: true,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  groups.add(child.pid);
  const out = { stdout: '', stderr: '' };
  child.stdout.on('data', (d) => (out.stdout += d));
  child.stderr.on('data', (d) => (out.stderr += d));
  child.stdin.on('error', () => {});
  if (payload !== undefined) child.stdin.end(JSON.stringify(payload));
  const exited = new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal })));
  return { child, out, exited };
}

async function fixtureRepo({ script = GROUP_SH, name = 'verify.sh' } = {}) {
  const r = await verifyRepo();
  cleanups.push(r.cleanup);
  const file = name === 'verify.sh' ? r.script : join(r.gitDir, name);
  writeFileSync(file, script);
  chmodSync(file, 0o755);
  await installBoth(r);
  if (file !== r.script) await r.setConfig({ command: ['sh', file], base: 'main' });
  return r;
}

async function startedGroup(r) {
  const file = join(r.gitDir, 'verify.pgid');
  await until(() => existsSync(file) && readFileSync(file, 'utf8').trim() !== '', 10000, 'the verify group to start');
  const pgid = Number(readFileSync(file, 'utf8').trim());
  groups.add(pgid);
  return pgid;
}

let deadRun = null;

test('SIGKILL of the entry leaves the verify group running (the C3 criterion)', async () => {
  const r = await fixtureRepo();
  const entry = spawnEntry(r.dir, {
    env: { PGID_FILE: join(r.gitDir, 'verify.pgid') },
    payload: stopPayload(r.dir),
  });
  const pgid = await startedGroup(r);
  process.kill(entry.child.pid, 'SIGKILL');
  const res = await entry.exited;
  assert.equal(res.signal, 'SIGKILL');
  assert.equal(groupAlive(pgid), true, 'the detached verify group outlives its killed hook');
  deadRun = { r, pgid };
});

test("the next run reaps the dead entry's recorded group before it runs", async () => {
  assert.ok(deadRun, 'the SIGKILL test ran first');
  const { r, pgid } = deadRun;
  const mark = join(r.gitDir, 'reap.mark');
  await r.setConfig({
    command: ['sh', '-c', `kill -0 -${pgid} 2>/dev/null && echo alive > "${mark}" || echo gone > "${mark}"`],
    base: 'main',
  });
  const entry = spawnEntry(r.dir, { payload: stopPayload(r.dir) });
  const res = await entry.exited;
  assert.equal(res.code, 0, entry.out.stderr);
  assert.equal(readFileSync(mark, 'utf8').trim(), 'gone', 'the old group was gone before the new command ran');
  assert.equal(groupAlive(pgid), false);
});

test('SIGTERM exits 0 with empty stdout, kills the group and releases the lock', async () => {
  const r = await fixtureRepo();
  const payload = stopPayload(r.dir);
  const entry = spawnEntry(r.dir, {
    env: { PGID_FILE: join(r.gitDir, 'verify.pgid') },
    payload,
  });
  const pgid = await startedGroup(r);
  entry.child.kill('SIGTERM');
  const res = await Promise.race([entry.exited, timeout(6000)]);
  assert.notEqual(res, 'timeout', 'the entry exited within 6 s');
  assert.equal(res.code, 0, entry.out.stderr);
  assert.equal(entry.out.stdout, '', 'a signalled hook prints nothing');
  assert.equal(groupAlive(pgid), false, 'the verify group is gone');
  const lockDir = join(r.gitDir, 'agent-harness', 'verify-gate');
  const locks = readdirSync(lockDir)
    .filter((f) => /^gate\.lock\.\d+$/.test(f))
    .sort();
  assert.ok(locks.length > 0, 'a gate lock was written');
  const newest = JSON.parse(readFileSync(join(lockDir, locks.at(-1)), 'utf8'));
  assert.equal(newest.released, true, 'the newest lock is released');
  const blocks = r.blocks('claude-code', payload.session_id);
  assert.deepEqual(blocks?.charges ?? [], [], 'the interrupted turn end charged nothing');
});

test('SIGTERM kills a group that traps SIGTERM, and the process exits within 5 s', async () => {
  const r = await fixtureRepo({ script: TRAP_SH, name: 'verify-trap.sh' });
  const entry = spawnEntry(r.dir, {
    env: { PGID_FILE: join(r.gitDir, 'verify.pgid') },
    payload: stopPayload(r.dir),
  });
  const pgid = await startedGroup(r);
  const t0 = Date.now();
  entry.child.kill('SIGTERM');
  const res = await Promise.race([entry.exited, timeout(5000)]);
  assert.notEqual(res, 'timeout', 'the entry exited within 5 s');
  assert.equal(res.code, 0, entry.out.stderr);
  assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms`);
  assert.equal(groupAlive(pgid), false, 'SIGKILL reached the group that ignored SIGTERM');
});

// The listeners must exist before stdin is read. Node's libuv already catches SIGTERM at startup
// (SigCgt bit 15 is set in a plain process), so the SIGHUP bit, which only a process.on('SIGHUP')
// raises, proves the listener loop installed every signal (SIGTERM, SIGHUP, SIGINT).
function listenersInstalled(pid) {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const m = status.match(/^SigCgt:\s*([0-9a-f]+)$/m);
    if (!m) return false;
    const mask = BigInt(`0x${m[1]}`);
    return (mask & (1n << 14n)) !== 0n && (mask & 1n) !== 0n;
  } catch {
    return false;
  }
}

test('SIGTERM before the payload: the listeners are already installed and the exit is 0 with empty stdout', {
  skip: process.platform !== 'linux' && 'the SigCgt poll is Linux only',
}, async () => {
  const r = await fixtureRepo();
  const entry = spawnEntry(r.dir, { env: { PGID_FILE: join(r.gitDir, 'verify.pgid') } });
  await until(() => listenersInstalled(entry.child.pid), 5000, 'the entry to install its signal listeners');
  entry.child.kill('SIGTERM');
  const res = await Promise.race([entry.exited, timeout(4000)]);
  assert.notEqual(res, 'timeout');
  assert.equal(res.code, 0, entry.out.stderr);
  assert.equal(entry.out.stdout, '');
});
