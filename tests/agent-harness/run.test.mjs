// runCommand (design D3 "Cleanup", D5 "Every run") with the direct child_process spawn, which puts
// each child in its own process group (detached: true) like the supervisor does.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, directSpawn, until } from './helpers.mjs';

const { runCommand } = await import(pathToFileURL(join(ASSETS.verifyGate, 'lib', 'run.mjs')).href);

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
};

const scratch = () => mkdtempSync(join(tmpdir(), 'agent-harness-run-'));
const far = () => Date.now() + 60_000;
const base = (extra) => ({
  spawn: directSpawn,
  cwd: tmpdir(),
  env: {},
  timeoutMs: 30_000,
  deadline: far(),
  cleanupDeadline: far() + 6000,
  ...extra,
});

// A shell that starts `sleep 30` in the background, records its pid, then waits on it.
const sleeper = (pidFile) => ['/bin/sh', '-c', `sleep 30 & echo $! > "${pidFile}"; wait`];

test('abort kills the group and resolves after exit', async () => {
  const dir = scratch();
  try {
    const pidFile = join(dir, 'pid');
    const ctl = new AbortController();
    const p = runCommand(base({ argv: sleeper(pidFile), signal: ctl.signal }));
    let pid;
    await until(() => {
      try {
        pid = Number(readFileSync(pidFile, 'utf8'));
        return pid > 0;
      } catch {
        return false;
      }
    });
    ctl.abort();
    const r = await p;
    assert.equal(r.exitKind, 'aborted');
    assert.equal(r.timedOut, false);
    assert.equal(alive(pid), false, 'the background child is gone');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('passes env through and returns code 0', async () => {
  const r = await runCommand(
    base({ argv: ['/bin/sh', '-c', 'echo "trigger=$VERIFY_TRIGGER"'], env: { VERIFY_TRIGGER: 'edit' } }),
  );
  assert.equal(r.code, 0);
  assert.equal(r.exitKind, 'exit');
  assert.equal(r.signal, null);
  assert.equal(r.spawnError, null);
  assert.equal(r.tail, 'trigger=edit\n');
});

test('nonzero code and tail of the last 60 lines', async () => {
  const r = await runCommand(
    base({ argv: ['/bin/sh', '-c', 'i=1; while [ $i -le 100 ]; do echo "line $i"; i=$((i+1)); done; exit 3'] }),
  );
  assert.equal(r.code, 3);
  assert.equal(r.exitKind, 'exit');
  const lines = r.tail.trimEnd().split('\n');
  assert.equal(lines.length, 60);
  assert.equal(lines[0], 'line 41');
  assert.equal(lines[59], 'line 100');
});

test('stderr is part of the tail', async () => {
  const r = await runCommand(base({ argv: ['/bin/sh', '-c', 'echo out; echo err >&2; exit 1'] }));
  assert.match(r.tail, /out/);
  assert.match(r.tail, /err/);
});

test('a signal exit reports the real signal name', async () => {
  const r = await runCommand(base({ argv: ['/bin/sh', '-c', 'kill -SEGV $$'] }));
  assert.equal(r.exitKind, 'signal');
  assert.equal(r.signal, 'SIGSEGV');
  assert.equal(r.code, null);
});

test('timeout kills the process group', async () => {
  const dir = scratch();
  try {
    const pidFile = join(dir, 'pid');
    const t0 = Date.now();
    const r = await runCommand(base({ argv: sleeper(pidFile), timeoutMs: 300 }));
    assert.equal(r.exitKind, 'timeout');
    assert.equal(r.timedOut, true);
    assert.ok(Date.now() - t0 < 5000);
    const pid = Number(readFileSync(pidFile, 'utf8'));
    assert.equal(alive(pid), false, 'the sleep 30 child is gone');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a group member that ignores SIGTERM gets SIGKILL before the cleanup deadline', async () => {
  const dir = scratch();
  try {
    const pidFile = join(dir, 'pid');
    const argv = ['/bin/sh', '-c', `(trap '' TERM; exec sleep 30) >/dev/null 2>&1 & echo $! > "${pidFile}"; wait`];
    const t0 = Date.now();
    const r = await runCommand(base({ argv, timeoutMs: 200, deadline: t0 + 200, cleanupDeadline: t0 + 2500 }));
    const took = Date.now() - t0;
    assert.equal(r.exitKind, 'timeout');
    const pid = Number(readFileSync(pidFile, 'utf8'));
    assert.equal(alive(pid), false, 'SIGKILL reached it');
    assert.ok(took >= 1000 && took < 2500, `escalated within the cleanup deadline (${took} ms)`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ENOENT gives spawnError naming the command', async () => {
  const r = await runCommand(base({ argv: ['no-such-command-xyz', 'arg'] }));
  assert.equal(r.exitKind, 'spawn-error');
  assert.equal(r.code, null);
  assert.match(r.spawnError, /no-such-command-xyz/);
  assert.match(r.spawnError, /ENOENT/);
});

test('output over maxBytes is truncated, not fatal', async () => {
  const r = await runCommand(
    base({
      argv: [process.execPath, '-e', 'for (let i = 1; i <= 50000; i++) console.log("row " + i + " " + "x".repeat(40))'],
      maxBytes: 64 * 1024,
    }),
  );
  assert.equal(r.code, 0);
  const lines = r.tail.trimEnd().split('\n');
  assert.equal(lines.length, 60);
  assert.match(lines[59], /^row 50000 /);
});
