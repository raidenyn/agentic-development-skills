// The installed verify gate through both hosts: spawned claude.mjs (charges committed by ack across
// processes, simultaneous failures) and the OpenCode plugin with real workers (sessions sharing a
// root, default handler budget), plus the AGENT_HARNESS_TRACE trace lines.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, fakeOpencodeCtx, runNode, until } from './helpers.mjs';
import { installBoth, toolStateDir, verifyRepo } from './verify-helpers.mjs';

const { createOpencodePlugin } = await import(
  pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'opencode-adapter.mjs')).href
);
const { installTool } = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'install.mjs')).href);
const CLAUDE_MJS = join(ASSETS.hookRuntime, 'claude.mjs');
const STOP = JSON.parse(readFileSync(new URL('./fixtures/claude/Stop.json', import.meta.url), 'utf8'));
const SID = STOP.session_id;
const ROOT = 'ses_root0000000000000000000001';
const CH1 = 'ses_child000000000000000000001';
const CH2 = 'ses_child000000000000000000002';
const SESSIONS = { [ROOT]: { id: ROOT }, [CH1]: { id: CH1, parentID: ROOT }, [CH2]: { id: CH2, parentID: ROOT } };

const cleanups = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

async function installed() {
  const r = await verifyRepo({ files: { 'src/a.js': 'a\n' } });
  cleanups.push(r.cleanup);
  await installBoth(r);
  return r;
}

/** @param {any} r @param {{ agent?: string, env?: Record<string, string> }} [opts] */
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
  assert.ok(
    ledger.charges.every((c) => c.confirmed === true),
    'ack was awaited before exit',
  );
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
  assert.equal(
    results.filter((x) => /still failing after 3 blocks/.test(x?.systemMessage ?? '')).length,
    1,
    JSON.stringify(results),
  );
  assert.equal(r.blocks('claude-code', SID).charges.length, 3);
});

test('an Edit outside editFiles prints nothing and traces edit-skipped', async () => {
  const r = await installed();
  await r.setConfig({ editFiles: ['**/*.ts'] });
  await r.write('README.md', 'hello world\n');
  const raw = readFileSync(new URL('./fixtures/claude/PostToolUse-Edit.json', import.meta.url), 'utf8');
  const input = raw.replaceAll('/REPO', r.dir);
  const res = await runNode(CLAUDE_MJS, [], {
    cwd: r.dir,
    input,
    env: { CLAUDE_PROJECT_DIR: r.dir, AGENT_HARNESS_TRACE: '1' },
  });
  assert.equal(res.code, 0, res.stderr);
  assert.equal(res.stdout, '');
  assert.equal(r.log().length, 0);
  const lines = readFileSync(join(r.gitDir, 'agent-harness', 'hook-runtime', 'trace.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.equal(lines.at(-1).outcomes['verify-gate'], 'edit-skipped');
});

test('a no-change Stop prints nothing and its trace line says no-change', async () => {
  const r = await installed();
  // The first Stop must stay untraced whatever the parent environment holds; only the second writes.
  assert.equal(out(await stop(r, { env: { AGENT_HARNESS_TRACE: '' } })), null);
  assert.equal(r.log().length, 1);
  const res = await stop(r, { env: { AGENT_HARNESS_TRACE: '1' } });
  assert.equal(res.stdout, '');
  assert.equal(r.log().length, 1);
  const lines = readFileSync(join(r.gitDir, 'agent-harness', 'hook-runtime', 'trace.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  const t = lines[0];
  assert.equal(t.event, 'turn.end');
  assert.deepEqual(t.outcomes, { 'verify-gate': 'no-change' });
  for (const k of ['processStart', 'receivedAt', 'handlersLoadedAt', 'settledAt'])
    assert.equal(typeof t[k], 'number', k);
  assert.ok(t.processStart <= t.receivedAt && t.receivedAt <= t.handlersLoadedAt && t.handlersLoadedAt <= t.settledAt);
});

/** @param {any} r @param {{ synthetic?: Function }} [opts] */
async function opencode(r, { synthetic } = {}) {
  const f = fakeOpencodeCtx(r.dir, { sessions: SESSIONS, synthetic });
  const dispose = await createOpencodePlugin().setup(f.ctx);
  let done = false;
  const close = async () => {
    if (!done) {
      done = true;
      await dispose();
    }
  };
  cleanups.push(close);
  return { ...f, close };
}
const turn = (emit, sid) => {
  emit('session.execution.started', sid);
  emit('session.execution.succeeded', sid);
};

test('two simultaneous failures at count two (two OpenCode sessions sharing a root): exactly one block, one notice', async () => {
  const r = await installed();
  r.fail();
  const p = await opencode(r);
  turn(p.emit, CH1);
  await until(() => p.calls.synthetic.length === 1, 15000, 'first block');
  turn(p.emit, CH2);
  await until(() => p.calls.synthetic.length === 2, 15000, 'second block');
  assert.deepEqual(
    p.calls.synthetic.map((s) => s.resume),
    [true, true],
  );
  await until(() => r.blocks('opencode', ROOT)?.charges.filter((c) => c.confirmed).length === 2, 5000, 'two acks');
  turn(p.emit, CH1);
  turn(p.emit, CH2);
  await until(() => p.calls.synthetic.length === 4, 20000, 'two more results');
  const last = p.calls.synthetic.slice(2);
  assert.equal(last.filter((s) => s.resume === true && /attempt 3 of 3/.test(s.text)).length, 1, JSON.stringify(last));
  assert.equal(
    last.filter((s) => s.resume === false && /still failing after 3 blocks/.test(s.text)).length,
    1,
    JSON.stringify(last),
  );
  await until(() => r.blocks('opencode', ROOT)?.charges.length === 3, 5000, 'three charges');
  await p.close();
});

test('OpenCode: a no-change turn end writes a trace line with hostCreatedAt', async () => {
  const saved = process.env.AGENT_HARNESS_TRACE;
  // The first pass must stay untraced even when the parent environment already turns tracing on.
  delete process.env.AGENT_HARNESS_TRACE;
  try {
    const r = await installed();
    const p = await opencode(r);
    turn(p.emit, ROOT);
    await until(() => r.passRecord() !== null, 15000, 'a first full pass');
    await new Promise((res) => setTimeout(res, 200));
    process.env.AGENT_HARNESS_TRACE = '1';
    const file = join(r.gitDir, 'agent-harness', 'hook-runtime', 'trace.jsonl');
    p.emit('session.execution.started', ROOT);
    p.emit('session.execution.succeeded', ROOT, {});
    await until(() => existsSync(file) && readFileSync(file, 'utf8').includes('turn.end'), 10000, 'trace line');
    const t = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
      .find((l) => l.event === 'turn.end');
    assert.deepEqual(t.outcomes, { 'verify-gate': 'no-change' });
    assert.equal(typeof t.hostCreatedAt, 'number');
    assert.ok(t.receivedAt <= t.settledAt);
    assert.equal(r.log().length, 1);
    await p.close();
  } finally {
    if (saved === undefined) delete process.env.AGENT_HARNESS_TRACE;
    else process.env.AGENT_HARNESS_TRACE = saved;
  }
});

test('an OpenCode handler that spawns with default settings gets 5 s of work', async () => {
  const r = await installed();
  const src = join(r.gitDir, 'src-spawner');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'tool.json'), JSON.stringify({ name: 'spawner', version: '0.1.0', handler: true }));
  writeFileSync(
    join(src, 'handler.mjs'),
    "export default { name: 'spawner', events: ['turn.end'],\n" +
      '  async handle(e, c) { const room = c.deadline - Date.now(); const t0 = Date.now();\n' +
      "    const res = await c.spawn([process.execPath, '-e', 'setTimeout(() => {}, 4000)'], { cwd: c.repoRoot });\n" +
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the string is shell or source text that holds ${...} on purpose
      '    return { context: `spawner room ${room} took ${Date.now() - t0} code ${res.code}` }; } };\n',
  );
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

const fxClaude = (name, root) =>
  readFileSync(new URL(`./fixtures/claude/${name}.json`, import.meta.url), 'utf8').replaceAll('/REPO', root);
const fxOpencode = (name, root) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/opencode/${name}.json`, import.meta.url), 'utf8').replaceAll('/REPO', root),
  );

test("Claude Code: a passing edit run's output reaches additionalContext", async () => {
  const r = await installed();
  r.setOut('note from lint\n');
  const run = (input) => runNode(CLAUDE_MJS, [], { cwd: r.dir, input, env: { CLAUDE_PROJECT_DIR: r.dir } });
  await run(fxClaude('PreToolUse-Edit', r.dir));
  writeFileSync(join(r.dir, 'README.md'), 'hello world\n');
  const res = await run(fxClaude('PostToolUse-Edit', r.dir));
  assert.equal(res.code, 0, res.stderr);
  assert.equal(
    JSON.parse(res.stdout).hookSpecificOutput.additionalContext,
    `verify: sh ${r.script} passed after the edit of README.md:\n\nnote from lint\n`,
  );
});

test("OpenCode: a passing edit run's output is appended to result.content", async () => {
  const r = await installed();
  const p = await opencode(r);
  r.setOut('note from lint\n');
  const before = { ...fxOpencode('execute.before-patch', r.dir), sessionID: ROOT };
  const input = { ...fxOpencode('execute.after-patch-completed', r.dir), sessionID: ROOT };
  await p.hooks['execute.before'](before);
  writeFileSync(join(r.dir, 'README.md'), 'hello world\n');
  await p.hooks['execute.after'](input);
  assert.equal(
    input.result.content.find((c) => String(c.text ?? '').startsWith('verify: '))?.text,
    `verify: sh ${r.script} passed after the edit of README.md:\n\nnote from lint\n`,
  );
});

// ---- launcher skip: no installed handler wants the call's kind ---------------------------------

const traceLines = (r) =>
  readFileSync(join(r.gitDir, 'agent-harness', 'hook-runtime', 'trace.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

const claudeRun = (r, input, env = {}) =>
  runNode(CLAUDE_MJS, [], { cwd: r.dir, input, env: { CLAUDE_PROJECT_DIR: r.dir, ...env } });

test('a Read with only the verify gate loads no handler and traces the skip', async () => {
  const r = await installed();
  const post = fxClaude('PostToolUse-Read', r.dir);
  const cases = [
    [post, 'tool.after'],
    [fxClaude('PreToolUse-Read', r.dir), 'tool.before'],
    [JSON.stringify({ ...JSON.parse(post), hook_event_name: 'PostToolUseFailure' }), 'tool.after'],
  ];
  const traceFile = join(r.gitDir, 'agent-harness', 'hook-runtime', 'trace.jsonl');
  for (const [input, event] of cases) {
    const before = existsSync(traceFile) ? traceLines(r).length : 0;
    const res = await claudeRun(r, input, { AGENT_HARNESS_TRACE: '1' });
    assert.equal(res.code, 0, res.stderr);
    assert.equal(res.stdout, '');
    const lines = traceLines(r);
    assert.equal(lines.length, before + 1, 'one new trace record per invocation');
    const t = lines.at(-1);
    assert.equal(t.event, event);
    assert.equal(t.skipped, 'no-subscriber');
    assert.deepEqual(t.outcomes, {});
    assert.equal('handlersLoadedAt' in t, false);
  }
});

test('an Edit still loads the gate', async () => {
  const r = await installed();
  await r.write('README.md', 'hello world\n');
  const res = await claudeRun(r, fxClaude('PostToolUse-Edit', r.dir), { AGENT_HARNESS_TRACE: '1' });
  assert.equal(res.code, 0, res.stderr);
  const t = traceLines(r).at(-1);
  assert.equal(typeof t.handlersLoadedAt, 'number');
  assert.ok(t.outcomes['verify-gate'], JSON.stringify(t.outcomes));
});

test('a handler without tools still loads on Read', async () => {
  const r = await installed();
  const src = join(r.gitDir, 'src-notools');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'tool.json'), JSON.stringify({ name: 'notools', version: '0.1.0', handler: true }));
  writeFileSync(
    join(src, 'handler.mjs'),
    "export default { name: 'notools', events: ['tool.after'], handle() { return null; } };\n",
  );
  const install = installTool({ sourceDir: src, repoRoot: r.dir });
  assert.equal(install.code, 0, install.messages.join('\n'));
  const res = await claudeRun(r, fxClaude('PostToolUse-Read', r.dir), { AGENT_HARNESS_TRACE: '1' });
  assert.equal(res.code, 0, res.stderr);
  assert.equal(typeof traceLines(r).at(-1).handlersLoadedAt, 'number');
});

test('a Bash call that ticks a task still runs the task trigger', async () => {
  const r = await installed();
  await r.setConfig({ taskFiles: ['tasks.md'] });
  await r.write('tasks.md', '- [ ] 1.1 x\n');
  r.git('add', 'tasks.md');
  r.git('commit', '-q', '-m', 'tasks');
  const id = 'toolu_tick_bash';
  const pre = { ...JSON.parse(fxClaude('PreToolUse-Bash', r.dir)), tool_use_id: id };
  const post = { ...JSON.parse(fxClaude('PostToolUse-Bash', r.dir)), tool_use_id: id };
  let res = await claudeRun(r, JSON.stringify(pre), { AGENT_HARNESS_TRACE: '1' });
  assert.equal(res.code, 0, res.stderr);
  await r.write('tasks.md', '- [x] 1.1 x\n');
  res = await claudeRun(r, JSON.stringify(post), { AGENT_HARNESS_TRACE: '1' });
  assert.equal(res.code, 0, res.stderr);
  const t = traceLines(r).at(-1);
  assert.equal(t.outcomes['verify-gate'], 'ran');
  assert.equal(r.log().at(-1).trigger, 'task');
});

test('an Edit that ticks a task still runs the task trigger', async () => {
  const r = await installed();
  const post = JSON.parse(fxClaude('PostToolUse-Edit-tick', r.dir));
  const tasks = 'openspec/changes/x/tasks.md';
  await r.write(tasks, post.tool_response.originalFile);
  r.git('add', tasks);
  r.git('commit', '-q', '-m', 'tasks');
  const pre = { ...post, hook_event_name: 'PreToolUse' };
  delete pre.tool_response;
  let res = await claudeRun(r, JSON.stringify(pre), { AGENT_HARNESS_TRACE: '1' });
  assert.equal(res.code, 0, res.stderr);
  const { originalFile, oldString, newString } = post.tool_response;
  await r.write(tasks, originalFile.replace(oldString, newString));
  res = await claudeRun(r, JSON.stringify(post), { AGENT_HARNESS_TRACE: '1' });
  assert.equal(res.code, 0, res.stderr);
  const t = traceLines(r).at(-1);
  assert.equal(t.outcomes['verify-gate'], 'ran');
  assert.equal(r.log().at(-1).trigger, 'task');
});

test('a PreToolUse-Bash writes a before-image', async () => {
  const r = await installed();
  const pre = JSON.parse(fxClaude('PreToolUse-Bash', r.dir));
  const res = await claudeRun(r, JSON.stringify(pre));
  assert.equal(res.code, 0, res.stderr);
  const calls = join(toolStateDir(r.dir, 'verify-gate'), 'sessions', `claude-code-${pre.session_id}`, 'main', 'calls');
  assert.deepEqual(readdirSync(calls), [`${pre.tool_use_id}.json`]);
});

test('an unreadable tool.json falls back to the full load', async () => {
  const r = await installed();
  writeFileSync(join(r.dir, '.agents', 'harness', 'verify-gate', 'tool.json'), '{');
  const res = await claudeRun(r, fxClaude('PostToolUse-Read', r.dir));
  assert.equal(res.code, 0, res.stderr);
  const text = JSON.parse(res.stdout).hookSpecificOutput.additionalContext;
  assert.match(text, /hook verify-gate was not loaded/);
});

// ---- skill fields: a rules-style declaration and skill-file reads (design D1) -----------------

async function rulesStyleStub(r) {
  const src = join(r.gitDir, 'src-skill-stub');
  mkdirSync(src, { recursive: true });
  writeFileSync(
    join(src, 'tool.json'),
    JSON.stringify({ name: 'skill-stub', version: '0.1.0', handler: true, tools: ['shell', 'skill'] }),
  );
  writeFileSync(
    join(src, 'handler.mjs'),
    "export default { name: 'skill-stub', events: ['tool.after'],\n" +
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the string is source text that holds ${...} on purpose
      '  handle: (e) => ({ context: `stub ${e.skill}|${e.skillVia}|${e.tool.kind}|${e.ok}` }) };\n',
  );
  const install = installTool({ sourceDir: src, repoRoot: r.dir });
  assert.equal(install.code, 0, install.messages.join('\n'));
}

const readPayload = (r, path) => ({
  ...JSON.parse(fxClaude('PostToolUse-Read', r.dir)),
  tool_input: { file_path: join(r.dir, path) },
});

test('a plain Read and a missing SKILL.md with a rules-style handler installed are traced as skipped', async () => {
  const r = await installed();
  await rulesStyleStub(r);
  await r.write('src/a.mts', 'a\n');
  for (const path of ['src/a.mts', 'skills/x/SKILL.md']) {
    const res = await claudeRun(r, JSON.stringify(readPayload(r, path)), { AGENT_HARNESS_TRACE: '1' });
    assert.equal(res.code, 0, res.stderr);
    assert.equal(res.stdout, '', path);
    const t = traceLines(r).at(-1);
    assert.equal(t.event, 'tool.after');
    assert.equal(t.skipped, 'no-subscriber', path);
    assert.deepEqual(t.outcomes, {});
  }
});

test('a Read of a skill file loads the handlers and the rules-style stub sees the skill', async () => {
  const r = await installed();
  await rulesStyleStub(r);
  await r.write('skills/agent-harness-verify-gate/SKILL.md', '# gate\n');
  const res = await claudeRun(r, JSON.stringify(readPayload(r, 'skills/agent-harness-verify-gate/SKILL.md')), {
    AGENT_HARNESS_TRACE: '1',
  });
  assert.equal(res.code, 0, res.stderr);
  assert.equal(
    JSON.parse(res.stdout).hookSpecificOutput.additionalContext,
    'stub agent-harness-verify-gate|read|read|true',
  );
  const t = traceLines(r).at(-1);
  assert.equal(typeof t.handlersLoadedAt, 'number');
  assert.equal(t.outcomes['skill-stub'], 'result');
});
