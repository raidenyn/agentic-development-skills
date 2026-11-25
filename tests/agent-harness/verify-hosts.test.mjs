// The installed verify gate through both hosts: spawned claude.mjs (charges committed by ack across
// processes, simultaneous failures) and the OpenCode plugin with real workers (sessions sharing a
// root, default handler budget), plus the AGENT_HARNESS_TRACE trace lines.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, fakeOpencodeCtx, runNode, until } from './helpers.mjs';
import { installBoth, verifyRepo } from './verify-helpers.mjs';

const { createOpencodePlugin } = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'opencode-adapter.mjs')).href);
const { installTool } = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'install.mjs')).href);
const CLAUDE_MJS = join(ASSETS.hookRuntime, 'claude.mjs');
const STOP = JSON.parse(readFileSync(new URL('./fixtures/claude/Stop.json', import.meta.url), 'utf8'));
const SID = STOP.session_id;
const ROOT = 'ses_root0000000000000000000001';
const CH1 = 'ses_child000000000000000000001';
const CH2 = 'ses_child000000000000000000002';
const SESSIONS = { [ROOT]: { id: ROOT }, [CH1]: { id: CH1, parentID: ROOT }, [CH2]: { id: CH2, parentID: ROOT } };

const cleanups = [];
after(async () => { for (const c of cleanups.reverse()) await c(); });

async function installed() {
  const r = await verifyRepo({ files: { 'src/a.js': 'a\n' } });
  cleanups.push(r.cleanup);
  await installBoth(r);
  return r;
}

function stop(r, { agent, env = {} } = {}) {
  const p = { ...STOP, cwd: r.dir, background_tasks: [] };
  if (agent) Object.assign(p, { hook_event_name: 'SubagentStop', agent_id: agent, agent_type: 'general-purpose' });
  return runNode(CLAUDE_MJS, [], { cwd: r.dir, input: JSON.stringify(p), env: { CLAUDE_PROJECT_DIR: r.dir, ...env } });
}
const out = (res) => (res.stdout ? JSON.parse(res.stdout) : null);

test('through spawned claude.mjs, three identical Stop failures leave three committed blocks; the fourth passes with the notice', async () => {
  const r = await installed();
  r.fail();
  for (let i = 1; i <= 3; i++) {
    const res = await stop(r);
    assert.equal(res.code, 0, res.stderr);
    assert.equal(out(res).decision, 'block', res.stdout);
    assert.match(out(res).reason, new RegExp(`attempt ${i} of 3`));
  }
  const ledger = r.blocks('claude-code', SID);
  assert.equal(ledger.version, 1);
  assert.equal(ledger.charges.length, 3);
  assert.ok(ledger.charges.every((c) => c.confirmed === true), 'ack was awaited before exit');
  assert.equal(new Set(ledger.charges.map((c) => c.key)).size, 1);
  const fourth = await stop(r);
  assert.equal(out(fourth).decision, undefined);
  assert.match(out(fourth).systemMessage, /^verify: still failing after 3 blocks; continuing\./);
  assert.equal(r.log().length, 4);
});

test('two simultaneous failures at count two (two spawned claude.mjs): exactly one block, one notice', async () => {
  const r = await installed();
  r.fail();
  assert.equal(out(await stop(r)).decision, 'block');
  assert.equal(out(await stop(r, { agent: 'sub-1' })).decision, 'block');
  const [a, b] = await Promise.all([stop(r), stop(r, { agent: 'sub-2' })]);
  const results = [out(a), out(b)];
  assert.equal(results.filter((x) => x?.decision === 'block').length, 1, JSON.stringify(results));
  assert.equal(results.filter((x) => /still failing after 3 blocks/.test(x?.systemMessage ?? '')).length, 1, JSON.stringify(results));
  assert.equal(r.blocks('claude-code', SID).charges.length, 3);
});

test('a no-change Stop prints nothing and its trace line says no-change', async () => {
  const r = await installed();
  assert.equal(out(await stop(r)), null);
  assert.equal(r.log().length, 1);
  const res = await stop(r, { env: { AGENT_HARNESS_TRACE: '1' } });
  assert.equal(res.stdout, '');
  assert.equal(r.log().length, 1);
  const lines = readFileSync(join(r.gitDir, 'agent-harness', 'hook-runtime', 'trace.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  const t = lines[0];
  assert.equal(t.event, 'turn.end');
  assert.deepEqual(t.outcomes, { 'verify-gate': 'no-change' });
  for (const k of ['processStart', 'receivedAt', 'handlersLoadedAt', 'settledAt']) assert.equal(typeof t[k], 'number', k);
  assert.ok(t.processStart <= t.receivedAt && t.receivedAt <= t.handlersLoadedAt && t.handlersLoadedAt <= t.settledAt);
});

async function opencode(r, { synthetic } = {}) {
  const f = fakeOpencodeCtx(r.dir, { sessions: SESSIONS, synthetic });
  const dispose = await createOpencodePlugin().setup(f.ctx);
  let done = false;
  const close = async () => { if (!done) { done = true; await dispose(); } };
  cleanups.push(close);
  return { ...f, close };
}
const turn = (emit, sid) => { emit('session.execution.started', sid); emit('session.execution.succeeded', sid); };

test('two simultaneous failures at count two (two OpenCode sessions sharing a root): exactly one block, one notice', async () => {
  const r = await installed();
  r.fail();
  const p = await opencode(r);
  turn(p.emit, CH1);
  await until(() => p.calls.synthetic.length === 1, 15000, 'first block');
  turn(p.emit, CH2);
  await until(() => p.calls.synthetic.length === 2, 15000, 'second block');
  assert.deepEqual(p.calls.synthetic.map((s) => s.resume), [true, true]);
  await until(() => r.blocks('opencode', ROOT)?.charges.filter((c) => c.confirmed).length === 2, 5000, 'two acks');
  turn(p.emit, CH1);
  turn(p.emit, CH2);
  await until(() => p.calls.synthetic.length === 4, 20000, 'two more results');
  const last = p.calls.synthetic.slice(2);
  assert.equal(last.filter((s) => s.resume === true && /attempt 3 of 3/.test(s.text)).length, 1, JSON.stringify(last));
  assert.equal(last.filter((s) => s.resume === false && /still failing after 3 blocks/.test(s.text)).length, 1, JSON.stringify(last));
  await until(() => r.blocks('opencode', ROOT)?.charges.length === 3, 5000, 'three charges');
  await p.close();
});

test('OpenCode: a no-change turn end writes a trace line with hostCreatedAt', async () => {
  const r = await installed();
  const p = await opencode(r);
  turn(p.emit, ROOT);
  await until(() => r.passRecord() !== null, 15000, 'a first full pass');
  await new Promise((res) => setTimeout(res, 200));
  process.env.AGENT_HARNESS_TRACE = '1';
  try {
    const file = join(r.gitDir, 'agent-harness', 'hook-runtime', 'trace.jsonl');
    p.emit('session.execution.started', ROOT);
    p.emit('session.execution.succeeded', ROOT, {});
    await until(() => existsSync(file) && readFileSync(file, 'utf8').includes('turn.end'), 10000, 'trace line');
    const t = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).find((l) => l.event === 'turn.end');
    assert.deepEqual(t.outcomes, { 'verify-gate': 'no-change' });
    assert.equal(typeof t.hostCreatedAt, 'number');
    assert.ok(t.receivedAt <= t.settledAt);
  } finally {
    delete process.env.AGENT_HARNESS_TRACE;
  }
  assert.equal(r.log().length, 1);
  await p.close();
});

test('an OpenCode handler that spawns with default settings gets 5 s of work', async () => {
  const r = await installed();
  const src = join(r.gitDir, 'src-spawner');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'tool.json'), JSON.stringify({ name: 'spawner', version: '0.1.0', handler: true }));
  writeFileSync(join(src, 'handler.mjs'), "export default { name: 'spawner', events: ['turn.end'],\n"
    + '  async handle(e, c) { const room = c.deadline - Date.now(); const t0 = Date.now();\n'
    + "    const res = await c.spawn([process.execPath, '-e', 'setTimeout(() => {}, 4000)'], { cwd: c.repoRoot });\n"
    + "    return { context: `spawner room ${room} took ${Date.now() - t0} code ${res.code}` }; } };\n");
  assert.equal(installTool({ sourceDir: src, repoRoot: r.dir }).code, 0);
  const p = await opencode(r);
  turn(p.emit, ROOT);
  await until(() => p.calls.synthetic.some((s) => /spawner room/.test(s.text)), 15000, 'spawner result');
  const text = p.calls.synthetic.find((s) => /spawner room/.test(s.text)).text;
  const [, room, took, code] = /spawner room (\d+) took (\d+) code (\d+)/.exec(text);
  assert.ok(Number(room) >= 4500 && Number(room) <= 5000, text);
  assert.ok(Number(took) >= 3900, text);
  assert.equal(code, '0');
  assert.doesNotMatch(text, /timed out/);
  await p.close();
});
