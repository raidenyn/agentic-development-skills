// The no-change turn-end benchmark (design D7). Not part of `npm test`:
//   node tests/agent-harness/bench-no-change.mjs
// Installs both tools into a temp repo whose verify command appends to a log in the git dir and
// exits 0, makes one full pass, then times 20 Stop events through spawned claude.mjs and 20
// session.execution.succeeded events through the OpenCode plugin's setup with a fake event stream.
// Only events whose trace has outcomes["verify-gate"] === "no-change" are counted. Prints, per
// host, the median host-to-outcome time (Claude Code: spawn to child exit, including Node startup;
// OpenCode: pushing the event to its settled trace line) and the median in-runtime time (receivedAt
// to settledAt). Asserts that the command ran only for the full pass.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, fakeOpencodeCtx, runNode, until } from './helpers.mjs';
import { installBoth, verifyRepo } from './verify-helpers.mjs';

const RUNS = 20;
const { createOpencodePlugin } = await import(
  pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'opencode-adapter.mjs')).href
);
const STOP = JSON.parse(readFileSync(new URL('./fixtures/claude/Stop.json', import.meta.url), 'utf8'));

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmt = (ms) => `${ms.toFixed(1)} ms`;

function traceLines(r) {
  const f = join(r.gitDir, 'agent-harness', 'hook-runtime', 'trace.jsonl');
  return existsSync(f)
    ? readFileSync(f, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
}

function spawnStop(r) {
  const payload = JSON.stringify({ ...STOP, cwd: r.dir, background_tasks: [] });
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const child = spawn(process.execPath, [join(r.dir, '.agents/harness/hook-runtime/claude.mjs')], {
      cwd: r.dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: r.dir, AGENT_HARNESS_TRACE: '1' },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, ms: performance.now() - t0 }));
    child.stdin.end(payload);
  });
}

const r = await verifyRepo({ files: { 'src/a.js': 'a\n' } });
try {
  await installBoth(r);
  const pass = await runNode(join(r.dir, '.agents/harness/verify-gate/cli.mjs'), ['run'], { cwd: r.dir });
  assert.equal(pass.code, 0, pass.stderr + pass.stdout);
  assert.equal(r.log().length, 1, 'one full pass');

  // Claude Code
  const claudeHost = [];
  const claudeRuntime = [];
  for (let i = 0; i < RUNS; i++) {
    const before = traceLines(r).length;
    const res = await spawnStop(r);
    assert.equal(res.code, 0);
    assert.equal(res.out, '', 'a no-change Stop prints nothing');
    const t = traceLines(r)[before];
    if (t?.outcomes?.['verify-gate'] !== 'no-change') continue;
    claudeHost.push(res.ms);
    claudeRuntime.push(t.settledAt - t.receivedAt);
  }

  // OpenCode
  process.env.AGENT_HARNESS_TRACE = '1';
  const ROOT = 'ses_bench000000000000000000001';
  const f = fakeOpencodeCtx(r.dir, { sessions: { [ROOT]: { id: ROOT } } });
  const dispose = await createOpencodePlugin().setup(f.ctx);
  const ocHost = [];
  const ocRuntime = [];
  try {
    for (let i = 0; i < RUNS; i++) {
      const before = traceLines(r).length;
      const pushedAt = Date.now();
      f.emit('session.execution.started', ROOT);
      f.emit('session.execution.succeeded', ROOT);
      await until(
        () =>
          traceLines(r)
            .slice(before)
            .some((l) => l.event === 'turn.end'),
        10000,
        'turn-end trace line',
      );
      const t = traceLines(r)
        .slice(before)
        .find((l) => l.event === 'turn.end');
      if (t.outcomes?.['verify-gate'] !== 'no-change') continue;
      ocHost.push(t.settledAt - pushedAt);
      ocRuntime.push(t.settledAt - t.receivedAt);
    }
  } finally {
    await dispose();
    delete process.env.AGENT_HARNESS_TRACE;
  }

  assert.equal(r.log().length, 1, 'the command ran zero times after the full pass');
  assert.ok(claudeHost.length && ocHost.length, 'some no-change outcomes were traced');
  console.log(
    `claude-code: ${claudeHost.length}/${RUNS} no-change; median host-to-outcome ${fmt(median(claudeHost))}, in-runtime ${fmt(median(claudeRuntime))}`,
  );
  console.log(
    `opencode:    ${ocHost.length}/${RUNS} no-change; median host-to-outcome ${fmt(median(ocHost))}, in-runtime ${fmt(median(ocRuntime))}`,
  );
} finally {
  await r.cleanup();
}
