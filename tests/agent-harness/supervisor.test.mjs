// Real worker_threads. Tool folders are written straight into the temp repo and started with
// startWorker(toolDir), which does not check the lock (loadHandlers does); the import-loop test goes
// through installTool + loadHandlers.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { ASSETS, tempRepo, until } from './helpers.mjs';

const lib = (f) => import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', f)).href);
const { createRuntime, loadHandlers } = await lib('runtime.mjs');
const { SPAWN_BARRIER, killGroups, startWorker } = await lib('supervisor.mjs');
const { installTool } = await lib('install.mjs');

const repo = await tempRepo();
const proxies = [];
const groups = [];
after(async () => {
  for (const pgid of groups) killGroup(pgid);
  for (const p of proxies) await p.close();
  await repo.cleanup();
});

const ids = { sessionId: 's1', agentId: 'main' };
const scratch = (name) => {
  const d = join(repo.dir, '.git', 'test-scratch', `${name}-${Date.now()}-${Math.random()}`);
  mkdirSync(d, { recursive: true });
  return d;
};

function writeTool(dir, name, source) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'tool.json'), JSON.stringify({ name, version: '0.1.0', handler: true }));
  writeFileSync(join(dir, 'handler.mjs'), source);
  return dir;
}

async function proxy(name, source) {
  const p = await startWorker(writeTool(join(repo.dir, '.agents', 'harness', name), name, source));
  proxies.push(p);
  return p;
}

const rt = (handlers, opts = {}) => createRuntime({ repoRoot: repo.dir, host: 'claude-code', handlers, ...opts });

function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

test('a handler that loops synchronously in its import is skipped after 2 s', async () => {
  const r = await tempRepo();
  try {
    const install = (name, source) => {
      const src = writeTool(join(r.dir, '..', `src-${name}-${Date.now()}-${Math.random()}`), name, source);
      assert.equal(installTool({ sourceDir: src, repoRoot: r.dir }).code, 0);
    };
    install('aloop', 'while (true) {}\nexport default {};\n');
    install('bgood', "export default { name: 'bgood', events: ['prompt'], handle: () => ({ context: 'ok' }) };\n");
    const start = Date.now();
    const { handlers, problems } = await loadHandlers(r.dir);
    const elapsed = Date.now() - start;
    proxies.push(...handlers);
    assert.ok(elapsed >= 1900 && elapsed < 4000, `took ${elapsed} ms`);
    assert.deepEqual(
      handlers.map((h) => h.name),
      ['bgood'],
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0], /aloop/);
    assert.match(problems[0], /loading/);
    const out = await createRuntime({ repoRoot: r.dir, host: 'claude-code', handlers, problems }).dispatch(
      { type: 'prompt' },
      ids,
    );
    assert.equal(out.context, 'ok');
  } finally {
    await r.cleanup();
  }
});

test('a handler that loops synchronously in handle before its first await: notice at the deadline, then a fresh worker', async () => {
  const dir = scratch('spin');
  const p = await proxy(
    'spin',
    `
    import { existsSync, writeFileSync } from 'node:fs';
    import { threadId } from 'node:worker_threads';
    export default {
      name: 'spin', events: ['tool.after'], timeouts: { 'tool.after': 300 },
      handle(ev) {
        if (!existsSync(ev.marker)) { writeFileSync(ev.marker, String(threadId)); while (true) {} }
        return { context: 'fresh ' + threadId };
      },
    };
  `,
  );
  const marker = join(dir, 'looped');
  const start = Date.now();
  const first = await rt([p]).dispatch({ type: 'tool.after', marker }, { ...ids, hostDeadline: Date.now() + 8000 });
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 1500, `returned after ${elapsed} ms`);
  assert.equal(first.context, undefined);
  assert.match(first.notices[0], /hook spin failed on tool\.after: timed out after 300 ms/);
  const second = await rt([p]).dispatch({ type: 'tool.after', marker }, ids);
  assert.match(second.context ?? '', /^fresh \d+$/);
  assert.notEqual(second.context, `fresh ${readFileSync(marker, 'utf8')}`, 'a different worker answered');
});

test('a worker terminated during a spawned git add leaves no git process, no held gate lock, and no blocking index.lock', async () => {
  const dir = scratch('git');
  await repo.write('f.txt', 'hello\n');
  await repo.write('.gitattributes', 'f.txt filter=slow\n');
  const p = await proxy(
    'gitter',
    `
    export default {
      name: 'gitter', events: ['tool.after'], timeouts: { 'tool.after': 1500 },
      async handle(ev, c) {
        const lock = await c.lock.acquire(ev.gateDir);
        if (!lock) return { context: 'contended' };
        await c.spawn(['git', '-c', 'filter.slow.clean=touch "' + ev.marker + '"; sleep 30; cat', 'add', 'f.txt'],
          { cwd: c.repoRoot, env: { GIT_INDEX_FILE: ev.index } });
        await lock.release();
        return { context: 'done' };
      },
    };
  `,
  );
  const ev = {
    type: 'tool.after',
    gateDir: join(dir, 'gate'),
    marker: join(dir, 'filter-ran'),
    index: join(dir, 'index'),
  };
  const out = await rt([p]).dispatch(ev, { ...ids, hostDeadline: Date.now() + 10000 });
  assert.match(out.notices[0], /timed out/);
  assert.ok(existsSync(ev.marker), 'git add was running its clean filter');
  const locks = readdirSync(ev.gateDir)
    .filter((f) => /^gate\.lock\.\d+$/.test(f))
    .sort();
  const body = JSON.parse(readFileSync(join(ev.gateDir, locks[locks.length - 1]), 'utf8'));
  assert.equal(body.released, true, 'gate lock released');
  assert.ok(body.pgids.length >= 1, 'the spawned group was recorded in the lock');
  for (const pgid of body.pgids) assert.equal(groupAlive(pgid), false, `group ${pgid} is gone`);
  assert.equal(existsSync(`${ev.index}.lock`), false, 'no index.lock left');
  execFileSync('git', ['add', 'f.txt'], { cwd: repo.dir, env: { ...process.env, GIT_INDEX_FILE: ev.index } });
});

test('a worker terminated right after requesting a spawn leaves no orphan', async () => {
  const dir = scratch('orphan');
  const tag = `orphan-tag-${process.pid}-${Date.now()}`;
  const p = await proxy(
    'orphan',
    `
    export default {
      name: 'orphan', events: ['tool.after'], timeouts: { 'tool.after': 500 },
      handle(ev, c) {
        c.spawn([process.execPath, '-e', 'require("fs").writeFileSync(process.argv[1], "x"); setInterval(() => {}, 1000)', ev.marker, ev.tag]);
        while (true) {}
      },
    };
  `,
  );
  const marker = join(dir, 'started');
  const out = await rt([p]).dispatch({ type: 'tool.after', marker, tag }, { ...ids, hostDeadline: Date.now() + 10000 });
  assert.match(out.notices[0], /timed out/);
  assert.ok(existsSync(marker), 'the spawned process had started');
  const ps = execFileSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' });
  assert.equal(ps.split('\n').filter((l) => l.includes(tag)).length, 0, ps);
});

test('a late trace from a terminated event is dropped', async () => {
  const p = await proxy(
    'tracer',
    `
    export default {
      name: 'tracer', events: ['prompt'], timeouts: { prompt: 1000 },
      async handle(ev, c) {
        if (ev.mode === 'late') { setTimeout(() => c.trace('late-from-ended'), 100); return { context: 'first' }; }
        if (ev.mode === 'spin') {
          const until = c.deadline + 50;
          while (Date.now() < until) {}
          c.trace('late-from-terminated');
          while (true) {}
        }
        await new Promise((r) => setTimeout(r, 200));
        return { context: 'normal' };
      },
    };
  `,
  );
  const r = rt([p]);
  const o1 = await r.dispatch({ type: 'prompt', mode: 'late' }, ids);
  assert.equal(o1.outcomes.tracer, 'result');
  const o2 = await r.dispatch({ type: 'prompt' }, ids);
  assert.equal(o2.context, 'normal');
  assert.equal(o2.outcomes.tracer, 'result', 'a trace of an ended event is not credited to the next one');
  const o3 = await r.dispatch({ type: 'prompt', mode: 'spin' }, { ...ids, hostDeadline: Date.now() + 8000 });
  assert.equal(o3.outcomes.tracer, 'failed');
  const o4 = await r.dispatch({ type: 'prompt' }, ids);
  assert.equal(o4.outcomes.tracer, 'result', JSON.stringify(o4));
});

test('a proof of the same handler is answered while that handler awaits it', async () => {
  const p = await proxy(
    'prover',
    `
    export default {
      name: 'prover', events: ['prompt'],
      proofs: { mine: (c) => 'mine for ' + c.agentId, fine: () => null },
      async handle(ev, c) { return { context: (await c.proof('mine')) + ' / ' + (await c.proof('fine')) }; },
    };
  `,
  );
  assert.deepEqual(p.events, ['prompt']);
  const out = await rt([p]).dispatch({ type: 'prompt' }, ids);
  assert.equal(out.context, 'mine for main / null');
  assert.equal(await rt([p]).proof('fine', { ...ids, deadline: Date.now() + 2000 }), null);
});

test('ack and release reach the worker that produced the block', async () => {
  const dir = scratch('ack');
  const p = await proxy(
    'acker',
    `
    import { writeFileSync } from 'node:fs';
    import { join } from 'node:path';
    import { randomUUID } from 'node:crypto';
    const id = randomUUID();
    export default {
      name: 'acker', events: ['turn.end'],
      async handle(ev) {
        await new Promise((r) => setTimeout(r, 200));
        return {
          block: id,
          ack: () => writeFileSync(join(ev.dir, 'ack-' + id), id),
          release: () => writeFileSync(join(ev.dir, 'release-' + id), id),
        };
      },
    };
  `,
  );
  const r = rt([p]);
  const [a, b] = await Promise.all([
    r.dispatch({ type: 'turn.end', dir }, ids),
    r.dispatch({ type: 'turn.end', dir }, ids),
  ]);
  assert.notEqual(a.block, b.block, 'two workers of the pool answered');
  await a.ack();
  await b.release();
  assert.equal(readFileSync(join(dir, `ack-${a.block}`), 'utf8'), a.block);
  assert.equal(readFileSync(join(dir, `release-${b.block}`), 'utf8'), b.block);
  assert.equal(existsSync(join(dir, `release-${a.block}`)), false);
});

test('config changes between events reach the worker', async () => {
  const p = await proxy(
    'cfg',
    `
    export default { name: 'cfg', events: ['prompt'], handle: (ev, c) => ({ context: JSON.stringify(c.config) }) };
  `,
  );
  const r = rt([p]);
  await repo.write('.agents/harness.json', JSON.stringify({ cfg: { n: 1 } }));
  assert.equal((await r.dispatch({ type: 'prompt' }, ids)).context, '{"n":1}');
  await repo.write('.agents/harness.json', JSON.stringify({ cfg: { n: 2 } }));
  assert.equal((await r.dispatch({ type: 'prompt' }, ids)).context, '{"n":2}');
  await repo.write('.agents/harness.json', '{}');
});

test('the barrier holds the command until go', async () => {
  const dir = scratch('barrier-hold');
  const mark = join(dir, 'ran');
  const child = spawn('/bin/sh', ['-c', SPAWN_BARRIER, 'agent-harness-spawn', 'sh', '-c', 'touch "$0"', mark], {
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
  });
  const closed = new Promise((resolve) => child.on('close', resolve));
  const gate = /** @type {import('node:stream').Writable} */ (child.stdio[3]);
  try {
    await sleep(200);
    assert.equal(existsSync(mark), false, 'the command did not run before go');
    gate.write('go\n');
    assert.equal(await closed, 0);
    assert.ok(existsSync(mark), 'the command ran after go');
  } finally {
    gate.end();
  }
});

test('the barrier exits 125 and runs nothing on EOF', () => {
  const dir = scratch('barrier-eof');
  const mark = join(dir, 'ran');
  const fd = openSync('/dev/null', 'r');
  try {
    const r = spawnSync('/bin/sh', ['-c', SPAWN_BARRIER, 'agent-harness-spawn', 'sh', '-c', 'touch "$0"', mark], {
      stdio: ['ignore', 'pipe', 'pipe', fd],
      timeout: 5000,
    });
    assert.equal(r.status, 125);
    assert.equal(existsSync(mark), false);
  } finally {
    closeSync(fd);
  }
});

test('spawn runs through the supervisor and returns exit status and output', async () => {
  const p = await proxy(
    'spawner',
    `
    import { isMainThread } from 'node:worker_threads';
    export default {
      name: 'spawner', events: ['prompt'],
      async handle(ev, c) {
        const r = await c.spawn(['sh', '-c', 'echo $$ >&2; echo out; echo err >&2; exit 3'], { cwd: c.repoRoot });
        const t = await c.spawn(['sh', '-c', 'sleep 30'], { cwd: c.repoRoot, timeoutMs: 100 });
        return { context: JSON.stringify({ main: isMainThread, code: r.code, stdout: r.stdout, stderr: r.stderr,
          pgid: r.pgid, timedOut: t.timedOut, tsig: t.signal }) };
      },
    };
  `,
  );
  const out = await rt([p]).dispatch({ type: 'prompt' }, ids);
  const r = JSON.parse(out.context);
  assert.equal(r.main, false);
  assert.equal(r.code, 3);
  assert.equal(r.stdout, 'out\n');
  assert.equal(typeof r.pgid, 'number');
  const [first, ...rest] = r.stderr.split('\n');
  assert.equal(first, String(r.pgid), 'the first stderr line is the pid of the spawned group');
  assert.equal(rest.join('\n'), 'err\n');
  assert.equal(r.timedOut, true);
  assert.equal(r.tsig, 'SIGTERM');
});

test('spawn errors through the supervisor name the command', async () => {
  const dir = scratch('spawn-errors');
  const nx = join(dir, 'nx');
  writeFileSync(nx, '#!/bin/sh\necho no\n');
  chmodSync(nx, 0o644);
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'hello'), '#!/bin/sh\necho hi\n');
  chmodSync(join(bin, 'hello'), 0o755);
  const p = await proxy(
    'spawnerr',
    `
    import { join } from 'node:path';
    export default {
      name: 'spawnerr', events: ['prompt'],
      async handle(ev, c) {
        const call = async (argv, opts = {}) => {
          try {
            const r = await c.spawn(argv, { cwd: c.repoRoot, ...opts });
            return r.stdout;
          } catch (err) {
            return 'error: ' + err.message;
          }
        };
        const out = {};
        out.missing = await call(['agent-harness-no-such-cmd']);
        out.noexec = await call([ev.nx]);
        out.badcwd = await call(['true'], { cwd: join(ev.dir, 'missing') });
        out.hello = await call(['hello'], { env: { PATH: ev.bin + ':' + process.env.PATH } });
        out.empty = await call(['']);
        out.nul = await call(['a' + String.fromCharCode(0) + 'b']);
        out.numeric = await call([42]);
        return { context: JSON.stringify(out) };
      },
    };
  `,
  );
  const out = await rt([p]).dispatch({ type: 'prompt', dir, nx, bin }, ids);
  const r = JSON.parse(out.context);
  assert.match(r.missing, /spawn agent-harness-no-such-cmd ENOENT/);
  assert.match(r.noexec, /EACCES/);
  assert.ok(r.noexec.includes(nx), r.noexec);
  assert.match(r.badcwd, /spawn true ENOENT/);
  assert.match(r.empty, /argument 'file'/);
  assert.match(r.empty, /cannot be empty/);
  assert.match(r.nul, /argument 'file'/);
  assert.match(r.nul, /must be a string without null bytes/);
  assert.match(r.numeric, /spawn 42 ENOENT/);
  assert.equal(r.hello, 'hi\n');
});

test('the pgid is in the held lock when the command runs', async () => {
  const dir = scratch('pgid-lock');
  const p = await proxy(
    'pgidlock',
    `
    export default {
      name: 'pgidlock', events: ['prompt'],
      async handle(ev, c) {
        await c.lock.acquire(ev.gate);
        await c.spawn(['sh', '-c', 'echo $$ > "$0/pid"; cat "$0/gate/gate.lock.1" > "$0/seen.json"', ev.dir]);
        return { context: 'ok' };
      },
    };
  `,
  );
  const out = await rt([p]).dispatch({ type: 'prompt', gate: join(dir, 'gate'), dir }, ids);
  assert.equal(out.context, 'ok');
  const pid = Number(readFileSync(join(dir, 'pid'), 'utf8').trim());
  const seen = JSON.parse(readFileSync(join(dir, 'seen.json'), 'utf8'));
  assert.ok(seen.pgids.includes(pid), JSON.stringify(seen));
});

test('arguments arrive unchanged with no lock held', async () => {
  const argv = ['printf', '%s|', 'a b', 'q\'"', '$HOME', '-n'];
  const p = await proxy(
    'argpass',
    `
    export default {
      name: 'argpass', events: ['prompt'],
      async handle(ev, c) {
        const r = await c.spawn(${JSON.stringify(argv)});
        return { context: r.stdout };
      },
    };
  `,
  );
  const out = await rt([p]).dispatch({ type: 'prompt' }, ids);
  assert.equal(out.context, 'a b|q\'"|$HOME|-n|');
});

test('a command reached through a symlink and .. resolves like the shell', async () => {
  const dir = scratch('raw-path');
  mkdirSync(join(dir, 'a', 'b'), { recursive: true });
  writeFileSync(join(dir, 'a', 'cmd'), '#!/bin/sh\necho through-link\n');
  chmodSync(join(dir, 'a', 'cmd'), 0o755);
  symlinkSync(join('a', 'b'), join(dir, 'link'));
  const p = await proxy(
    'rawpath',
    `
    export default {
      name: 'rawpath', events: ['prompt'],
      async handle(ev, c) {
        try {
          const r = await c.spawn(['./link/../cmd'], { cwd: ev.dir });
          return { context: r.stdout };
        } catch (err) {
          return { context: 'error: ' + err.message };
        }
      },
    };
  `,
  );
  const out = await rt([p]).dispatch({ type: 'prompt', dir }, ids);
  assert.equal(out.context, 'through-link\n');
});

test('a spawn with no PATH uses the shell default', async () => {
  const p = await proxy(
    'nopath',
    `
    export default {
      name: 'nopath', events: ['prompt'],
      async handle(ev, c) {
        const r = await c.spawn(['true'], { env: { PATH: undefined } });
        return { context: JSON.stringify({ code: r.code, pgid: typeof r.pgid }) };
      },
    };
  `,
  );
  const out = await rt([p]).dispatch({ type: 'prompt' }, ids);
  assert.deepEqual(JSON.parse(out.context), { code: 0, pgid: 'number' });
});

test('a command name starting with - is rejected before it runs', async () => {
  const dir = scratch('leading-dash');
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const mark = join(dir, 'ran');
  writeFileSync(join(bin, '-hello'), `#!/bin/sh\ntouch '${mark}'\n`);
  chmodSync(join(bin, '-hello'), 0o755);
  const p = await proxy(
    'dashcmd',
    `
    export default {
      name: 'dashcmd', events: ['prompt'],
      async handle(ev, c) {
        try {
          await c.spawn(['-hello'], { env: { PATH: ev.bin + ':' + process.env.PATH } });
          return { context: 'ran' };
        } catch (err) {
          return { context: 'error: ' + err.message };
        }
      },
    };
  `,
  );
  const out = await rt([p]).dispatch({ type: 'prompt', bin }, ids);
  assert.match(out.context, /spawn -hello ENOENT/);
  assert.equal(existsSync(mark), false);
});

test('a deadline that passes while the event waits for a worker to load: no post, no leak, lock free', async () => {
  const dir = scratch('loadwait');
  const p = await proxy(
    'loadwait',
    `
    import { writeFileSync } from 'node:fs';
    export default {
      name: 'loadwait', events: ['prompt'],
      async handle(ev, c) {
        if (ev.mode === 'spin') { while (true) {} }
        writeFileSync(ev.marker, 'ran');
        await c.lock.acquire(ev.gate);
        await new Promise(() => {});
      },
    };
  `,
  );
  const r = rt([p]);
  const ev = { type: 'prompt', mode: 'hang', gate: join(dir, 'gate'), marker: join(dir, 'ran') };
  const o1 = await r.dispatch(
    { type: 'prompt', mode: 'spin' },
    { ...ids, workDeadline: Date.now() + 200, hostDeadline: Date.now() + 5000 },
  );
  assert.match(o1.notices[0], /timed out/);
  // The replacement worker is still loading now; this event's deadline passes before it is ready.
  const start = Date.now();
  const o2 = await r.dispatch(ev, { ...ids, workDeadline: Date.now() + 5, hostDeadline: Date.now() + 5000 });
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 1000, `returned after ${elapsed} ms, not at the cleanup deadline`);
  assert.match(o2.notices[0], /hook loadwait failed on prompt: timed out/);
  await new Promise((res) => setTimeout(res, 800));
  assert.equal(existsSync(ev.marker), false, 'the event was not posted to the worker');
  const held = existsSync(ev.gate)
    ? readdirSync(ev.gate)
        .filter((f) => /^gate\.lock\.\d+$/.test(f))
        .filter((f) => JSON.parse(readFileSync(join(ev.gate, f), 'utf8')).released !== true)
    : [];
  assert.deepEqual(held, [], 'no gate lock is held');
  assert.equal(p.workerGens().length, 1, 'one live worker, none leaked');
  const o3 = await r.dispatch(
    { type: 'prompt', mode: 'spin' },
    { ...ids, workDeadline: Date.now() + 300, hostDeadline: Date.now() + 5000 },
  );
  assert.match(o3.notices[0], /timed out/);
});

// A dead hook's groups, recorded in its lock, are reaped before the next acquire takes the gate
// lock (design D3). A group that traps TERM only dies by the SIGKILL that confirmUntil forces.
function spawnGroup(script) {
  const child = spawn('sh', ['-c', script], { detached: true, stdio: 'ignore' });
  child.unref();
  return child.pid;
}

// A group that ignores SIGTERM, and has installed the trap before `ready` exists.
function spawnTrappingGroup(dir) {
  const ready = join(dir, 'ready');
  const child = spawn('sh', ['-c', 'trap "" TERM; : > "$1"; sleep 30; :', 'sh', ready], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return { pgid: child.pid, ready };
}

function killGroup(pgid) {
  try {
    process.kill(-pgid, 'SIGKILL');
  } catch {}
}

function deadPid() {
  return spawnSync(process.execPath, ['-e', '0']).pid;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code !== 'ESRCH';
  }
}

// gate.lock.1 as a hook that died with its groups still recorded.
function seedLock(gate, pgids) {
  mkdirSync(gate, { recursive: true });
  writeFileSync(join(gate, 'gate.lock.1'), JSON.stringify({ pid: deadPid(), at: Date.now(), pgids }));
}

test('killGroups with confirmUntil sends SIGKILL before it returns', async () => {
  const { pgid, ready } = spawnTrappingGroup(scratch('killer'));
  try {
    await until(() => existsSync(ready), 2000, 'the group to trap TERM');
    assert.equal(groupAlive(pgid), true, 'the group is running');
    const start = Date.now();
    await killGroups([pgid], { cleanupDeadline: Date.now() + 10_000, confirmUntil: Date.now() + 300 });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `killGroups resolved after ${elapsed} ms`);
    assert.ok(elapsed >= 250, `SIGTERM did not end the group before confirmUntil (${elapsed} ms)`);
    await until(() => !groupAlive(pgid), 500, `group ${pgid} to die`);
  } finally {
    killGroup(pgid);
  }
});

test("the next acquire reaps a dead holder's groups", async () => {
  const dir = scratch('reap');
  const gate = join(dir, 'gate');
  const pgid = spawnGroup('sleep 30');
  const p = await proxy(
    'reaper',
    `
    export default {
      name: 'reaper', events: ['prompt'],
      async handle(ev, c) {
        await c.lock.acquire(ev.gate);
        return { context: 'ok' };
      },
    };
  `,
  );
  try {
    seedLock(gate, [pgid]);
    const out = await rt([p]).dispatch({ type: 'prompt', gate }, ids);
    assert.equal(out.context, 'ok');
    assert.equal(groupAlive(pgid), false, "the dead holder's group was reaped");
    await until(
      () => {
        try {
          return JSON.parse(readFileSync(join(gate, 'gate.lock.2'), 'utf8')).released === true;
        } catch {
          return false;
        }
      },
      4000,
      'gate.lock.2 to be released',
    );
  } finally {
    killGroup(pgid);
  }
});

test('an event that ended during the reap gets an error and leaves no held lock', async () => {
  const dir = scratch('endafter');
  const gate = join(dir, 'gate');
  const file = join(dir, 'acquire');
  const { pgid, ready } = spawnTrappingGroup(dir);
  const p = await proxy(
    'endafter',
    `
    import { writeFileSync } from 'node:fs';
    export default {
      name: 'endafter', events: ['prompt'],
      handle(ev, c) {
        c.lock.acquire(ev.gate).then(
          () => writeFileSync(ev.file, 'ok'),
          (e) => writeFileSync(ev.file, String(e.message)),
        );
        return { context: 'ok' };
      },
    };
  `,
  );
  try {
    await until(() => existsSync(ready), 2000, 'the group to trap TERM');
    seedLock(gate, [pgid]);
    const start = Date.now();
    const out = await rt([p]).dispatch(
      { type: 'prompt', gate, file },
      { ...ids, workDeadline: start + 300, hostDeadline: start + 5000 },
    );
    assert.equal(out.context, 'ok');
    await until(() => existsSync(file), 4000, 'the acquire to settle');
    assert.match(readFileSync(file, 'utf8'), /ended/, 'the acquire failed with the event-ended error');
    await until(() => !groupAlive(pgid), 1000, `group ${pgid} to die`);
    const held = readdirSync(gate)
      .filter((f) => /^gate\.lock\.\d+$/.test(f))
      .map((f) => JSON.parse(readFileSync(join(gate, f), 'utf8')))
      .filter((body) => body.released !== true && pidAlive(body.pid));
    assert.deepEqual(held, [], 'no gate lock is held by a live pid');
  } finally {
    killGroup(pgid);
  }
});

test('a vanished group is skipped without delay', async () => {
  const dir = scratch('vanished');
  const gate = join(dir, 'gate');
  const p = await proxy(
    'vanished',
    `
    export default {
      name: 'vanished', events: ['prompt'],
      async handle(ev, c) {
        const lock = await c.lock.acquire(ev.gate);
        return { context: lock ? 'held' : 'contended' };
      },
    };
  `,
  );
  seedLock(gate, [deadPid()]);
  const start = Date.now();
  const out = await rt([p]).dispatch({ type: 'prompt', gate }, ids);
  const elapsed = Date.now() - start;
  assert.equal(out.context, 'held');
  assert.ok(elapsed < 1000, `returned after ${elapsed} ms`);
});

test('runtime.close with a cleanup deadline kills a TERM-trapping group while its spawn is in flight', async () => {
  const dir = scratch('closer');
  const marker = join(dir, 'pgid');
  const p = await proxy(
    'closer',
    `
    export default {
      name: 'closer', events: ['prompt'],
      handle(ev, c) {
        return c.spawn(['sh', '-c', 'echo $$ > "$1"; trap "" TERM; sleep 30; :', 'sh', ev.marker], { cwd: c.repoRoot });
      },
    };
  `,
  );
  // A handler without close is ignored rather than making close fail.
  const r = rt([p, { name: 'plain', events: [], handle: () => null }]);
  const inFlight = r.dispatch({ type: 'prompt', marker }, ids).catch((err) => err);
  const pidText = () => (existsSync(marker) ? readFileSync(marker, 'utf8').trim() : '');
  await until(() => /^\d+$/.test(pidText()), 2000, 'the spawned group to record its pid');
  const pgid = Number(pidText());
  groups.push(pgid);
  assert.equal(groupAlive(pgid), true, 'the group is running');
  const start = Date.now();
  await r.close({ cleanupDeadline: Date.now() + 1500 });
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2000, `close resolved after ${elapsed} ms`);
  await until(() => !groupAlive(pgid), Math.max(200, 2000 - elapsed), `group ${pgid} to die`);
  await inFlight;
});
