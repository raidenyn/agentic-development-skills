// OpenCode adapter (design D3 event mapping, child lifecycle, superseded results, notice channels;
// D5 turn-end queue): a fake plugin ctx that records calls and replays the recorded fixtures.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, fakeOpencodeCtx, tempRepo, until } from './helpers.mjs';

const lib = (f) => import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', f)).href);
const { createOpencodePlugin, eventDeadlines } = await lib('opencode-adapter.mjs');
const { createRuntime } = await lib('runtime.mjs');
const { installTool } = await lib('install.mjs');
const { sessionStateDir } = await lib('state.mjs');

const FIXTURES = join(import.meta.dirname, 'fixtures', 'opencode');
const fx = (name, root) => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8').replaceAll('/REPO', root));

const ROOT = 'ses_dedff3bd3ffe5JNm4SZRSafWUU'; // execute.* fixtures of the first run
const ROOT2 = 'ses_dedfe7299ffexvwC0QDPgTiOoW'; // parent of CHILD
const CHILD = 'ses_dedfe4625ffe7X3k5Q6cF7eOyd';
const SESSIONS = { [ROOT]: { id: ROOT }, [ROOT2]: { id: ROOT2 }, [CHILD]: { id: CHILD, parentID: ROOT2 } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanups = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

async function repo() {
  const r = await tempRepo();
  cleanups.push(r.cleanup);
  return r;
}

// A plugin over in-process handler objects (the real createRuntime), or over installed handlers.
/** @param {{ dir?: string, handlers?: object[], sessions?: Record<string, unknown>, synthetic?: Function, factory?: Function, capabilities?: object }} [opts] */
async function plugin({ dir, handlers, sessions, synthetic, factory, capabilities } = {}) {
  dir ??= (await repo()).dir;
  const f = fakeOpencodeCtx(dir, { sessions: sessions ?? SESSIONS, synthetic });
  const runtimeFactory =
    factory ?? (handlers ? async ({ repoRoot, host }) => createRuntime({ repoRoot, host, handlers }) : undefined);
  const p = createOpencodePlugin({ runtimeFactory, capabilities });
  assert.equal(p.id, 'agent-harness-hook-runtime');
  const dispose = await p.setup(f.ctx);
  let disposed = false;
  const once = async () => {
    if (!disposed) {
      disposed = true;
      await dispose();
    }
  };
  cleanups.push(once);
  return { ...f, dir, dispose: once };
}

const contextInput = (sessionID) => ({ sessionID, system: [{ type: 'text', text: 'base' }], messages: [] });
const systemTexts = (input) => input.system.slice(1).map((s) => s.text);
const turn = (emit, sid) => {
  emit('session.execution.started', sid);
  emit('session.execution.succeeded', sid);
};

/** @param {string[]} events @param {(e: any, c: any, seen: any[]) => unknown} [fn] */
function recorder(events, fn = () => null) {
  const seen = [];
  return {
    seen,
    handler: {
      name: 'rec',
      events,
      handle: (e, c) => {
        seen.push({ e, agentId: c.agentId, sessionId: c.sessionId });
        return fn(e, c, seen);
      },
    },
  };
}

async function installHandler(dir, source, name = 'test-handler') {
  const src = join(dir, '.git', `src-${name}`);
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'tool.json'), JSON.stringify({ name, version: '0.1.0', handler: true }));
  writeFileSync(join(src, 'handler.mjs'), source);
  assert.equal(installTool({ sourceDir: src, repoRoot: dir }).code, 0);
}

// ---- deadlines ----------------------------------------------------------------------------------

test('eventDeadlines takes the largest declared budget, else 5000, plus 6000 for cleanup', () => {
  const hs = [
    { name: 'a', events: ['turn.end'], timeouts: { 'turn.end': 9000 } },
    { name: 'b', events: ['turn.end', 'tool.before'] },
    { name: 'c', events: ['tool.after'], timeouts: { 'tool.after': 20000 } },
  ];
  assert.deepEqual(eventDeadlines(hs, 'turn.end', 1000), { workDeadline: 10000, hostDeadline: 16000 });
  assert.deepEqual(eventDeadlines(hs, { type: 'tool.before' }, 0), { workDeadline: 5000, hostDeadline: 11000 });
  assert.deepEqual(eventDeadlines(hs, 'tool.before', 0, { 'tool.before': 7000 }), {
    workDeadline: 7000,
    hostDeadline: 13000,
  });
  assert.deepEqual(eventDeadlines([], 'prompt', 0), { workDeadline: 5000, hostDeadline: 11000 });
});

// ---- tool hooks ---------------------------------------------------------------------------------

test('execute.before denies by throwing an Error with the text', async () => {
  const { handler } = recorder(['tool.before'], (e) =>
    e.command?.includes('HARNESS_DENY') ? { deny: `no ${e.tool.kind}` } : null,
  );
  const p = await plugin({ handlers: [handler] });
  await assert.rejects(
    p.hooks['execute.before'](fx('execute.before-shell', p.dir)),
    (err) => err instanceof Error && err.message === 'no shell',
  );
  await p.hooks['execute.before'](fx('execute.before-read', p.dir));
});

test('execute.after appends context to result.content only', async () => {
  const { handler, seen } = recorder(['tool.after'], (e) => ({ context: `after ${e.tool.kind} ${e.command}` }));
  const p = await plugin({ handlers: [handler] });
  const input = fx('execute.after-shell-completed', p.dir);
  const original = structuredClone(input);
  await p.hooks['execute.after'](input);
  assert.deepEqual(input.result.content, [...original.result.content, { type: 'text', text: 'after shell echo hi' }]);
  assert.deepEqual(input.result.output, original.result.output);
  assert.deepEqual(input.result.metadata, original.result.metadata);
  assert.deepEqual(seen[0].e.tool, { name: 'shell', kind: 'shell', input: original.input, callId: original.id });
});

test('execute.after on an error status delivers nothing and reports it', async () => {
  const { handler } = recorder(['tool.after'], () => ({ context: 'secret context' }));
  const p = await plugin({ handlers: [handler] });
  const input = fx('execute.after-read-error-child', p.dir);
  const original = structuredClone(input);
  await p.hooks['execute.after'](input);
  assert.deepEqual(input, original);
  const ctxIn = contextInput(CHILD);
  await p.hooks['session.context'](ctxIn);
  const texts = systemTexts(ctxIn);
  assert.equal(texts.length, 1);
  assert.match(texts[0], /not delivered/);
  assert.doesNotMatch(texts[0], /secret context/);
});

test('a handler that throws on execute.after with status error: the notice goes to system at the next context call', async () => {
  const handler = {
    name: 'thrower',
    events: ['tool.after'],
    manual: 'Check by hand.',
    handle: () => {
      throw new Error('boom');
    },
  };
  const p = await plugin({ handlers: [handler] });
  await p.hooks['execute.after'](fx('execute.after-read-error-child', p.dir));
  const other = contextInput(ROOT);
  await p.hooks['session.context'](other);
  assert.deepEqual(systemTexts(other), [], 'another session gets nothing');
  const ctxIn = contextInput(CHILD);
  await p.hooks['session.context'](ctxIn);
  assert.deepEqual(systemTexts(ctxIn), ['hook thrower failed on tool.after: boom. Check by hand.']);
  const again = contextInput(CHILD);
  await p.hooks['session.context'](again);
  assert.deepEqual(systemTexts(again), [], 'delivered once');
});

test('patch files come from metadata, edit and write files from input.path or input.filePath', async () => {
  const { handler, seen } = recorder(['tool.after', 'tool.before']);
  const p = await plugin({ handlers: [handler] });
  await p.hooks['execute.after'](fx('execute.after-patch-completed', p.dir));
  assert.equal(seen[0].e.tool.kind, 'edit');
  assert.deepEqual(seen[0].e.files, ['README.md']);
  await p.hooks['execute.after'](fx('execute.after-patch-tick', p.dir));
  assert.deepEqual(seen[1].e.files, ['openspec/changes/x/tasks.md']);
  await p.hooks['execute.before'](fx('execute.before-patch', p.dir));
  assert.deepEqual(seen[2].e.files, []);
  const base = {
    codemode: false,
    sessionID: ROOT,
    agent: 'build',
    messageID: 'm',
    status: 'completed',
    result: { content: [] },
  };
  await p.hooks['execute.after']({ ...base, tool: 'edit', id: 'c1', input: { filePath: join(p.dir, 'src', 'a.js') } });
  await p.hooks['execute.after']({ ...base, tool: 'write', id: 'c2', input: { filePath: '/elsewhere/b.js' } });
  assert.deepEqual(seen[3].e.files, ['src/a.js']);
  assert.equal(seen[3].e.tool.callId, 'c1');
  assert.deepEqual(seen[4].e.files, [], 'a path outside the repo is dropped');
  await p.hooks['execute.after'](fx('execute.after-read-completed', p.dir));
  assert.equal(seen[5].e.tool.kind, 'read');
  assert.equal(seen[5].e.files, undefined);
  await p.hooks['execute.after'](fx('execute.after-subagent-completed', p.dir));
  assert.equal(seen[6].e.tool.kind, 'other');
  // OpenCode 2.4.1's native `write` and `edit` name the file `path`, relative to the session directory.
  await p.hooks['execute.after']({ ...base, tool: 'write', id: 'c3', input: { path: 'src/c.ts', content: 'x' } });
  await p.hooks['execute.after']({
    ...base,
    tool: 'edit',
    id: 'c4',
    input: { path: join(p.dir, 'src', 'd.ts'), oldString: 'a', newString: 'b' },
  });
  await p.hooks['execute.before']({ ...base, tool: 'edit', id: 'c5', input: { path: '../outside.ts' } });
  assert.deepEqual(seen[7].e.files, ['src/c.ts']);
  assert.deepEqual(seen[8].e.files, ['src/d.ts']);
  assert.deepEqual(seen[9].e.files, [], 'a path outside the repo is dropped');
});

test('a child session gets the child id as agentId', async () => {
  const { handler, seen } = recorder(['tool.before']);
  const p = await plugin({ handlers: [handler] });
  await p.hooks['execute.before'](fx('execute.before-shell-child', p.dir));
  await p.hooks['execute.before'](fx('execute.before-shell', p.dir));
  assert.deepEqual(
    seen.map((s) => [s.sessionId, s.agentId]),
    [
      [ROOT2, CHILD],
      [ROOT, 'main'],
    ],
  );
});

test('a failed session lookup makes the session root', async () => {
  const { handler, seen } = recorder(['tool.before']);
  const p = await plugin({ handlers: [handler], sessions: {} });
  await p.hooks['execute.before'](fx('execute.before-shell-child', p.dir));
  assert.deepEqual([seen[0].sessionId, seen[0].agentId], [CHILD, 'main']);
});

test('a parent cycle makes the session root', async () => {
  const { handler, seen } = recorder(['tool.before']);
  const sessions = { [CHILD]: { id: CHILD, parentID: ROOT2 }, [ROOT2]: { id: ROOT2, parentID: CHILD } };
  const p = await plugin({ handlers: [handler], sessions });
  await p.hooks['execute.before'](fx('execute.before-shell-child', p.dir));
  assert.deepEqual([seen[0].sessionId, seen[0].agentId], [CHILD, 'main']);
});

test('session.start is dispatched for the first event of a session, before the prompt', async () => {
  const { handler, seen } = recorder(['session.start', 'prompt'], (e) =>
    e.type === 'session.start' ? { context: 'start rule' } : { context: 'prompt rule' },
  );
  const p = await plugin({ handlers: [handler] });
  await p.hooks['session.prompt'](fx('session.prompt', p.dir));
  assert.deepEqual(
    seen.map((s) => [s.e.type, s.e.afterCompact]),
    [
      ['session.start', false],
      ['prompt', undefined],
    ],
  );
  assert.equal(seen[1].e.prompt, fx('session.prompt', p.dir).prompt.text);
  const ctxIn = contextInput(ROOT);
  await p.hooks['session.context'](ctxIn);
  assert.deepEqual(systemTexts(ctxIn), ['start rule', 'prompt rule']);
  await p.hooks['session.prompt'](fx('session.prompt', p.dir));
  assert.equal(seen.filter((s) => s.e.type === 'session.start').length, 1, 'only for the first event');
});

test('a throwing handler never throws out of a hook', async () => {
  const handler = {
    name: 'thrower',
    events: ['tool.before', 'tool.after', 'prompt', 'session.start', 'turn.end', 'compact'],
    handle: () => {
      throw new Error('boom');
    },
  };
  const p = await plugin({ handlers: [handler] });
  await p.hooks['execute.before'](fx('execute.before-shell', p.dir));
  const after = fx('execute.after-shell-completed', p.dir);
  await p.hooks['execute.after'](after);
  assert.match(after.result.content.at(-1).text, /hook thrower failed on tool\.after: boom/);
  await p.hooks['session.prompt'](fx('session.prompt', p.dir));
  await p.hooks['session.context'](contextInput(ROOT));
  turn(p.emit, ROOT);
  p.emit('session.compaction.started', ROOT);
  await until(() => p.calls.synthetic.length === 1, 4000, 'turn-end notice');
  assert.equal(p.calls.synthetic[0].resume, false);
  assert.match(p.calls.synthetic[0].text, /hook thrower failed on turn\.end: boom/);
});

test('a broken runtime never throws out of a hook', async () => {
  const factory = async () => ({
    handlers: [],
    problems: [],
    dispatch: async () => {
      throw new Error('broken');
    },
  });
  const p = await plugin({ factory });
  await p.hooks['execute.before'](fx('execute.before-shell', p.dir));
  await p.hooks['execute.after'](fx('execute.after-shell-completed', p.dir));
  await p.hooks['session.prompt'](fx('session.prompt', p.dir));
  await p.hooks['session.context'](contextInput(ROOT));
});

// ---- compaction ---------------------------------------------------------------------------------

const redeliver = () =>
  recorder(['session.start', 'compact'], (e) =>
    e.type === 'session.start' && e.afterCompact ? { context: 'rule' } : null,
  );

test('compaction.started dispatches compact', async () => {
  const { handler, seen } = redeliver();
  const p = await plugin({ handlers: [handler] });
  p.emit('session.compaction.started', ROOT2);
  await until(() => seen.some((s) => s.e.type === 'compact'), 2000, 'compact');
});

test('compaction.ended then context pushes onto system once', async () => {
  const { handler, seen } = redeliver();
  const p = await plugin({ handlers: [handler] });
  await p.hooks['session.context'](contextInput(ROOT2));
  p.emit('session.compaction.ended', ROOT2);
  const mark = join(
    sessionStateDir({ repoRoot: p.dir, tool: 'hook-runtime', host: 'opencode', sessionId: ROOT2, agentId: 'main' }),
    'compacted',
  );
  await until(() => existsSync(mark), 2000, 'compaction mark');
  const first = contextInput(ROOT2);
  await p.hooks['session.context'](first);
  assert.deepEqual(systemTexts(first), ['rule']);
  assert.equal(existsSync(mark), false, 'the mark is cleared');
  const second = contextInput(ROOT2);
  await p.hooks['session.context'](second);
  assert.deepEqual(systemTexts(second), []);
  assert.deepEqual(
    seen.filter((s) => s.e.type === 'session.start').map((s) => s.e.afterCompact),
    [false, true],
  );
});

test('the compaction mark survives a new plugin instance', async () => {
  const r = await repo();
  const one = await plugin({ dir: r.dir, handlers: [redeliver().handler] });
  one.emit('session.compaction.ended', CHILD);
  const mark = join(
    sessionStateDir({ repoRoot: r.dir, tool: 'hook-runtime', host: 'opencode', sessionId: ROOT2, agentId: CHILD }),
    'compacted',
  );
  await until(() => existsSync(mark), 2000, 'compaction mark');
  await one.dispose();
  const two = await plugin({ dir: r.dir, handlers: [redeliver().handler] });
  const ctxIn = contextInput(CHILD);
  await two.hooks['session.context'](ctxIn);
  assert.deepEqual(systemTexts(ctxIn), ['rule']);
});

test('compaction then prompt re-delivers context', async () => {
  const { handler } = redeliver();
  const p = await plugin({ handlers: [handler] });
  await p.hooks['session.prompt']({ ...fx('session.prompt', p.dir), sessionID: ROOT2 });
  p.emit('session.compaction.ended', ROOT2);
  await sleep(50);
  await p.hooks['session.prompt']({ ...fx('session.prompt', p.dir), sessionID: ROOT2 });
  const ctxIn = contextInput(ROOT2);
  await p.hooks['session.context'](ctxIn);
  assert.deepEqual(systemTexts(ctxIn), ['rule']);
});

// ---- child lifecycle ----------------------------------------------------------------------------

function backgrounds(seen, agentId = 'main') {
  return seen.filter((s) => s.e.type === 'turn.end' && s.agentId === agentId).map((s) => s.e.background);
}

test('a subagent launch result makes the child running and its execution.succeeded makes it idle', async () => {
  const { handler, seen } = recorder(['turn.end']);
  const p = await plugin({ handlers: [handler] });
  await p.hooks['execute.after'](fx('execute.after-subagent-completed', p.dir));
  turn(p.emit, ROOT2);
  await until(() => backgrounds(seen).length === 1, 2000, 'first root turn end');
  turn(p.emit, CHILD);
  await until(() => backgrounds(seen, CHILD).length === 1, 2000, 'child turn end');
  turn(p.emit, ROOT2);
  await until(() => backgrounds(seen).length === 2, 2000, 'second root turn end');
  assert.deepEqual(backgrounds(seen), [1, 0]);
  assert.deepEqual(backgrounds(seen, CHILD), [0]);
  assert.equal(seen.find((s) => s.agentId === CHILD).sessionId, ROOT2);
});

test('a fast child whose succeeded arrives before its launch result counts idle', async () => {
  const { handler, seen } = recorder(['turn.end']);
  const p = await plugin({ handlers: [handler] });
  turn(p.emit, CHILD);
  await until(() => backgrounds(seen, CHILD).length === 1, 2000, 'child turn end');
  await p.hooks['execute.after'](fx('execute.after-subagent-completed', p.dir));
  turn(p.emit, ROOT2);
  await until(() => backgrounds(seen).length === 1, 2000, 'root turn end');
  assert.deepEqual(backgrounds(seen), [0]);
});

test('a child resumed by a block counts running again (recorded child lifecycle)', async () => {
  const { handler, seen } = recorder(['turn.end', 'prompt']);
  const lines = readFileSync(join(FIXTURES, 'child-lifecycle.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const sessions = {};
  for (const { v } of lines) if (v.id) sessions[v.id] = v.parent ? { id: v.id, parentID: v.parent } : { id: v.id };
  const p = await plugin({ handlers: [handler], sessions });
  const root = lines.find((l) => l.v.parent === null).v.id;
  for (const { kind, v } of lines) {
    if (kind === 'prompt') await p.hooks['session.prompt']({ sessionID: v.sessionID, prompt: { text: v.text } });
    else if (kind === 'session.created') p.emit(kind, v.id, { parentID: v.parent });
    else if (kind.startsWith('session.')) p.emit(kind, v.id);
    await sleep(15);
  }
  await until(() => seen.filter((s) => s.e.type === 'turn.end').length === 5, 3000, 'five turn ends');
  assert.ok(seen.filter((s) => s.e.type === 'turn.end').every((s) => s.sessionId === root));
  assert.deepEqual(backgrounds(seen), [1, 1, 0]);
  assert.equal(backgrounds(seen, lines.find((l) => l.v.parent).v.id).length, 2);
});

// ---- turn ends ----------------------------------------------------------------------------------

test('turn end sends a synthetic resume for a block, and ack follows the synthetic', async () => {
  const order = [];
  const handler = {
    name: 'b',
    events: ['turn.end'],
    handle: () => ({ block: 'fix it', ack: () => order.push('ack'), release: () => order.push('release') }),
  };
  const p = await plugin({
    handlers: [handler],
    synthetic: async () => {
      await sleep(50);
      order.push('synthetic');
    },
  });
  turn(p.emit, ROOT);
  await until(() => order.includes('ack'), 2000, 'ack');
  assert.deepEqual(p.calls.synthetic, [{ sessionID: ROOT, text: 'fix it', resume: true }]);
  assert.deepEqual(order, ['synthetic', 'ack']);
});

test('a turn-end notice is a synthetic message that does not resume', async () => {
  const handler = { name: 'n', events: ['turn.end'], handle: () => ({ context: 'fyi' }) };
  const p = await plugin({ handlers: [handler] });
  turn(p.emit, ROOT);
  await until(() => p.calls.synthetic.length === 1, 2000, 'notice');
  assert.deepEqual(p.calls.synthetic, [{ sessionID: ROOT, text: 'fyi', resume: false }]);
});

test('a rejected synthetic calls release, not ack', async () => {
  const order = [];
  const handler = {
    name: 'b',
    events: ['turn.end'],
    handle: () => ({ block: 'fix it', ack: () => order.push('ack'), release: () => order.push('release') }),
  };
  const p = await plugin({
    handlers: [handler],
    synthetic: async () => {
      throw new Error('rejected');
    },
  });
  turn(p.emit, ROOT);
  await until(() => order.length === 1, 2000, 'release');
  assert.deepEqual(order, ['release']);
});

// Turn-end handler whose n-th call (1-based) sleeps slow[n] ms and answers make(n).
// `make` may return `stale` too: the handler returns `out` unchanged, so the adapter sees it.
/** @param {{ slow?: Record<number, number>, make?: (n: number) => any, budget?: number }} [opts] */
function scripted({ slow = {}, make = () => null, budget } = {}) {
  const calls = [];
  const acks = [];
  const releases = [];
  const handler = {
    name: 'gate',
    events: ['turn.end'],
    timeouts: budget ? { 'turn.end': budget } : undefined,
    async handle(e, c) {
      const n = calls.length + 1;
      const rec = { n, start: Date.now(), room: c.deadline - Date.now(), background: e.background };
      calls.push(rec);
      await sleep(slow[n] ?? 0);
      rec.end = Date.now();
      rec.aborted = c.signal.aborted;
      const out = make(n);
      if (out?.block) Object.assign(out, { ack: () => acks.push(n), release: () => releases.push(n) });
      return out;
    },
  };
  return { handler, calls, acks, releases };
}

test("turn ends B and C during A's run both run after A, in order", async () => {
  const s = scripted({ slow: { 1: 300 } });
  const p = await plugin({ handlers: [s.handler] });
  turn(p.emit, ROOT);
  await until(() => s.calls.length === 1, 2000, 'A started');
  turn(p.emit, ROOT);
  turn(p.emit, ROOT);
  await until(() => s.calls.length === 3 && s.calls[2].end, 3000, 'three runs');
  assert.deepEqual(
    s.calls.map((c) => c.n),
    [1, 2, 3],
  );
  for (let i = 1; i < 3; i++)
    assert.ok(s.calls[i].start >= s.calls[i - 1].end, `run ${i + 1} started after run ${i} ended`);
});

test('only the latest current result is delivered', async () => {
  const s = scripted({ slow: { 1: 300 }, make: (n) => ({ block: `block ${n}` }) });
  const p = await plugin({ handlers: [s.handler] });
  turn(p.emit, ROOT);
  await until(() => s.calls.length === 1, 2000, 'A started');
  turn(p.emit, ROOT);
  turn(p.emit, ROOT);
  await until(() => s.acks.length === 1, 3000, 'ack of C');
  assert.deepEqual(p.calls.synthetic, [{ sessionID: ROOT, text: 'block 3', resume: true }]);
  assert.deepEqual(s.releases, [1, 2]);
  assert.deepEqual(s.acks, [3]);
});

test("turn B fixes the tree while A's slow run fails: A's block is released, not delivered, and B passes", async () => {
  const s = scripted({ slow: { 1: 300 }, make: (n) => (n === 1 ? { block: 'A failed' } : null) });
  const p = await plugin({ handlers: [s.handler] });
  turn(p.emit, ROOT);
  await until(() => s.calls.length === 1, 2000, 'A started');
  turn(p.emit, ROOT);
  await until(() => s.calls.length === 2 && s.calls[1].end, 3000, 'B ran');
  await sleep(50);
  assert.deepEqual(p.calls.synthetic, []);
  assert.deepEqual(s.releases, [1]);
  assert.deepEqual(s.acks, []);
});

test("C starts but has not ended when B's run settles: only B's stale notice is sent and both are released", async () => {
  const s = scripted({ slow: { 1: 300 }, make: (n) => ({ block: `block ${n}`, stale: `stale ${n}` }) });
  const p = await plugin({ handlers: [s.handler] });
  turn(p.emit, ROOT);
  await until(() => s.calls.length === 1, 2000, 'A started');
  turn(p.emit, ROOT);
  p.emit('session.execution.started', ROOT); // C starts, no end yet
  await until(() => s.releases.length === 2, 3000, 'two releases');
  await sleep(50);
  assert.deepEqual(s.releases, [1, 2]);
  assert.deepEqual(p.calls.synthetic, [{ sessionID: ROOT, text: 'stale 2', resume: false }]);
  assert.equal(s.calls.length, 2);
});

test('a superseded result with no later turn end is shown as a stale notice', async () => {
  const s = scripted({ slow: { 1: 300 }, make: () => ({ block: 'A', stale: 'stale A' }) });
  const p = await plugin({ handlers: [s.handler] });
  turn(p.emit, ROOT);
  await until(() => s.calls.length === 1, 2000, 'A started');
  p.emit('session.execution.started', ROOT); // a newer turn starts, no end yet
  await until(() => s.releases.length === 1, 3000, 'release of A');
  assert.deepEqual(p.calls.synthetic, [{ sessionID: ROOT, text: 'stale A', resume: false }]);
  assert.deepEqual(s.releases, [1]);
  assert.deepEqual(s.acks, []);
});

test('a superseded result with a queued turn end is dropped even with stale', async () => {
  const s = scripted({ slow: { 1: 300 }, make: (n) => ({ block: `block ${n}`, stale: `stale ${n}` }) });
  const p = await plugin({ handlers: [s.handler] });
  turn(p.emit, ROOT);
  await until(() => s.calls.length === 1, 2000, 'A started');
  turn(p.emit, ROOT); // B is queued while A runs
  await until(() => s.acks.length === 1, 3000, 'ack of B');
  assert.deepEqual(p.calls.synthetic, [{ sessionID: ROOT, text: 'block 2', resume: true }]);
  assert.deepEqual(s.releases, [1]);
});

test('a superseded result without stale sends nothing', async () => {
  const s = scripted({ slow: { 1: 300 }, make: () => ({ block: 'A' }) });
  const p = await plugin({ handlers: [s.handler] });
  turn(p.emit, ROOT);
  await until(() => s.calls.length === 1, 2000, 'A started');
  p.emit('session.execution.started', ROOT); // a newer turn starts, no end yet
  await until(() => s.releases.length === 1, 3000, 'release of A');
  await sleep(50);
  assert.deepEqual(p.calls.synthetic, []);
  assert.deepEqual(s.releases, [1]);
});

test('a backlog of three turn ends behind a run that used almost all its budget: all three run', async () => {
  const s = scripted({ budget: 400, slow: { 1: 350, 2: 350, 3: 350, 4: 350 }, make: (n) => ({ context: `run ${n}` }) });
  const p = await plugin({ handlers: [s.handler] });
  turn(p.emit, ROOT);
  await until(() => s.calls.length === 1, 2000, 'first run started');
  turn(p.emit, ROOT);
  turn(p.emit, ROOT);
  turn(p.emit, ROOT);
  await until(() => p.calls.synthetic.length === 1, 4000, 'last result');
  assert.equal(s.calls.length, 4);
  for (const c of s.calls) {
    // A fresh budget is 400 ms; the leftover after a 350 ms run would be about 50 ms. 300 tells them apart under load.
    assert.ok(c.room >= 300, `run ${c.n} had its full budget (${c.room} ms)`);
    assert.equal(c.aborted, false, `run ${c.n} finished within its budget`);
  }
  assert.deepEqual(p.calls.synthetic, [{ sessionID: ROOT, text: 'run 4', resume: false }]);
});

// ---- real workers -------------------------------------------------------------------------------

test('a worker handler that runs while(true){} during execute.before: the command still runs', async () => {
  const r = await repo();
  await installHandler(
    r.dir,
    "export default { name: 'spin', events: ['tool.before'], timeouts: { 'tool.before': 300 },\n" +
      '  handle() { while (true) {} } };\n',
  );
  const p = await plugin({ dir: r.dir });
  const t0 = Date.now();
  await p.hooks['execute.before'](fx('execute.before-shell', r.dir));
  assert.ok(Date.now() - t0 < 3000, 'returned soon after the deadline');
  const ctxIn = contextInput(ROOT);
  await p.hooks['session.context'](ctxIn);
  const texts = systemTexts(ctxIn);
  assert.equal(texts.length, 1);
  assert.match(texts[0], /^hook spin failed on tool\.before: timed out after \d+ ms\. Do this step by hand\.$/);
});

test('two events for one handler run in separate workers, and a tool.before timeout does not end the turn-end run', async () => {
  const r = await repo();
  await installHandler(
    r.dir,
    "export default { name: 'two', events: ['tool.before', 'turn.end'], timeouts: { 'tool.before': 200 },\n" +
      "  async handle(e) { if (e.type === 'tool.before') { while (true) {} }\n" +
      "    await new Promise((res) => setTimeout(res, 1000)); return { block: 'still here' }; } };\n",
  );
  const p = await plugin({ dir: r.dir });
  await p.hooks['session.context'](contextInput(ROOT)); // session.start first
  turn(p.emit, ROOT);
  await sleep(150);
  await p.hooks['execute.before'](fx('execute.before-shell', r.dir));
  await until(() => p.calls.synthetic.length === 1, 5000, 'turn-end block');
  assert.deepEqual(p.calls.synthetic, [{ sessionID: ROOT, text: 'still here', resume: true }]);
});

function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

test("dispose during an active run returns within 1 s, and the gate lock is released only after the run's process group is gone", async () => {
  const r = await repo();
  const gate = join(r.dir, '.git', 'test-gate');
  await installHandler(
    r.dir,
    "export default { name: 'gated', events: ['turn.end'], timeouts: { 'turn.end': 30000 },\n" +
      `  async handle(e, c) { const lock = await c.lock.acquire(${JSON.stringify(gate)});\n` +
      "    await c.spawn(['sh', '-c', 'sleep 30; true']); await lock?.release(); return null; } };\n",
  );
  const p = await plugin({ dir: r.dir });
  turn(p.emit, ROOT);
  const lockBody = () => {
    if (!existsSync(gate)) return null;
    const files = readdirSync(gate)
      .filter((f) => /^gate\.lock\.\d+$/.test(f))
      .sort();
    return files.length ? JSON.parse(readFileSync(join(gate, files.at(-1)), 'utf8')) : null;
  };
  await until(() => lockBody()?.pgids?.length >= 1, 5000, 'the run holds the lock with a group');
  const [pgid] = lockBody().pgids;
  assert.equal(groupAlive(pgid), true);
  const t0 = Date.now();
  await p.dispose();
  assert.ok(Date.now() - t0 < 1100, `dispose took ${Date.now() - t0} ms`);
  const end = Date.now() + 8000;
  for (;;) {
    const body = lockBody();
    if (body.released === true) {
      assert.equal(groupAlive(pgid), false, 'the group is gone before the lock is released');
      break;
    }
    assert.ok(Date.now() < end, 'the lock was released');
    await sleep(2);
  }
});

test('dispose resolves within the bound', async () => {
  const factory = async () => ({
    problems: [],
    dispatch: async () => ({ notices: [] }),
    handlers: [{ name: 'stuck', events: [], close: () => new Promise(() => {}) }],
  });
  const p = await plugin({ factory });
  const t0 = Date.now();
  await p.dispose();
  const took = Date.now() - t0;
  assert.ok(took >= 900 && took < 1300, `dispose took ${took} ms`);
});

test('after dispose the hooks pass through and turn ends are not run', async () => {
  const { handler, seen } = recorder(['tool.before', 'turn.end'], () => ({ deny: 'no' }));
  const p = await plugin({ handlers: [handler] });
  await p.dispose();
  await p.hooks['execute.before'](fx('execute.before-shell', p.dir));
  turn(p.emit, ROOT);
  await sleep(50);
  assert.equal(seen.length, 0);
});
