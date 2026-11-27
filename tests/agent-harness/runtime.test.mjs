import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, tempRepo } from './helpers.mjs';

const lib = (f) => import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', f)).href);
const { createRuntime, loadHandlers, EVENTS, RESULT_KINDS, failureNotice } = await lib('runtime.mjs');
const { installTool } = await lib('install.mjs');

const repo = await tempRepo();
after(() => repo.cleanup());

const rt = (handlers, opts = {}) => createRuntime({ repoRoot: repo.dir, host: 'claude-code', handlers, ...opts });
const ids = { sessionId: 's1', agentId: 'main' };
const JOIN = '\n\n';

test('exports the six events and their result kinds', () => {
  assert.deepEqual([...EVENTS].sort(), ['compact', 'prompt', 'session.start', 'tool.after', 'tool.before', 'turn.end']);
  assert.deepEqual(RESULT_KINDS, {
    'tool.before': ['deny'],
    'tool.after': ['context'],
    prompt: ['context'],
    'session.start': ['context'],
    compact: [],
    'turn.end': ['block', 'context'],
  });
});

test('failureNotice uses the manual text or the default', () => {
  assert.equal(failureNotice('a', 'prompt', 'boom', null), 'hook a failed on prompt: boom. Do this step by hand.');
  assert.equal(failureNotice('a', 'prompt', 'boom', 'Run x.'), 'hook a failed on prompt: boom. Run x.');
});

test('calls only subscribed handlers in name order', async () => {
  const calls = [];
  const h = (name, events) => ({
    name,
    events,
    handle: () => {
      calls.push(name);
      return null;
    },
  });
  const r = rt([h('c', ['tool.after']), h('a', ['tool.after']), h('b', ['prompt'])]);
  const out = await r.dispatch({ type: 'tool.after', host: 'claude-code' }, ids);
  assert.deepEqual(calls, ['a', 'c']);
  assert.deepEqual(out.notices, []);
  assert.equal(out.context, undefined);
});

test('merges context texts in name order', async () => {
  const h = (name) => ({ name, events: ['tool.after'], handle: async () => ({ context: `from ${name}` }) });
  const out = await rt([h('zz'), h('aa')]).dispatch({ type: 'tool.after' }, ids);
  assert.equal(out.context, 'from aa\n\nfrom zz');
  assert.deepEqual(out.outcomes, { aa: 'result', zz: 'result' });
});

test('deny wins over context at tool.before', async () => {
  const out = await rt([
    { name: 'a', events: ['tool.before'], handle: () => ({ deny: 'no' }) },
    { name: 'b', events: ['tool.before'], handle: () => ({ context: 'hello' }) },
  ]).dispatch({ type: 'tool.before' }, ids);
  assert.equal(out.deny, 'no');
  assert.equal(out.context, undefined);
  assert.equal(out.notices.length, 1);
  assert.match(out.notices[0], /hook b failed on tool\.before/);
});

test('block texts are joined at turn.end, with combined ack and release', async () => {
  const seen = [];
  const h = (name) => ({
    name,
    events: ['turn.end'],
    handle: () => ({
      block: `fix ${name}`,
      ack: () => seen.push(`ack ${name}`),
      release: () => seen.push(`rel ${name}`),
    }),
  });
  const out = await rt([h('b'), h('a')]).dispatch({ type: 'turn.end' }, ids);
  assert.equal(out.block, 'fix a\n\nfix b');
  assert.deepEqual(seen, [], 'the runtime never calls ack itself');
  await out.ack();
  assert.deepEqual(seen, ['ack a', 'ack b']);
  await out.release();
  assert.deepEqual(seen, ['ack a', 'ack b', 'rel a', 'rel b']);
});

test('keeps stale texts and joins them in name order', async () => {
  const out = await rt([
    { name: 'b', events: ['turn.end'], handle: () => ({ context: 'B', stale: 'sb' }) },
    { name: 'a', events: ['turn.end'], handle: () => ({ block: 'A', stale: 'sa' }) },
  ]).dispatch({ type: 'turn.end' }, ids);
  assert.equal(out.stale, `sa${JOIN}sb`);
});

test('only one handler sets stale', async () => {
  const out = await rt([
    { name: 'a', events: ['turn.end'], handle: () => ({ block: 'A', stale: 'sa' }) },
    { name: 'b', events: ['turn.end'], handle: () => ({ context: 'B' }) },
  ]).dispatch({ type: 'turn.end' }, ids);
  assert.equal(out.stale, 'sa');
});

test('a non-string stale is ignored', async () => {
  const out = await rt([{ name: 'a', events: ['turn.end'], handle: () => ({ block: 'A', stale: 5 }) }]).dispatch(
    { type: 'turn.end' },
    ids,
  );
  assert.equal(out.stale, undefined);
  assert.equal(out.block, 'A');
});

test('invalid result kind is dropped and reported', async () => {
  const out = await rt([{ name: 'bad', events: ['turn.end'], handle: () => ({ deny: 'x' }) }]).dispatch(
    { type: 'turn.end' },
    ids,
  );
  assert.equal(out.deny, undefined);
  assert.equal(out.block, undefined);
  assert.equal(out.notices.length, 1);
  assert.match(out.notices[0], /^hook bad failed on turn\.end: /);
  assert.equal(out.outcomes.bad, 'failed');
});

test('compact accepts no result kind', async () => {
  const out = await rt([{ name: 'c', events: ['compact'], handle: () => ({ context: 'x' }) }]).dispatch(
    { type: 'compact' },
    ids,
  );
  assert.equal(out.context, undefined);
  assert.match(out.notices[0], /hook c failed on compact/);
});

test('handler context carries ids, config, and a state folder per agent', async () => {
  await repo.write('.agents/harness.json', JSON.stringify({ ctxh: { k: 1 } }));
  const seen = [];
  const r = rt([
    {
      name: 'ctxh',
      events: ['prompt'],
      handle: (_ev, c) => {
        seen.push(c);
        return null;
      },
    },
  ]);
  await r.dispatch({ type: 'prompt' }, { sessionId: 's1', agentId: 'main' });
  await r.dispatch({ type: 'prompt' }, { sessionId: 's1', agentId: 'sub-1' });
  assert.equal(seen[0].repoRoot, repo.dir);
  assert.equal(seen[0].host, 'claude-code');
  assert.deepEqual(seen[0].config, { k: 1 });
  assert.equal(seen[0].agentId, 'main');
  assert.equal(seen[1].agentId, 'sub-1');
  assert.notEqual(seen[0].stateDir, seen[1].stateDir);
  assert.match(seen[0].stateDir, /agent-harness[\\/]ctxh[\\/]sessions/);
  assert.ok(seen[0].signal instanceof AbortSignal);
  assert.equal(typeof seen[0].deadline, 'number');
  await repo.write('.agents/harness.json', '{}');
});

test('proof resolves registered, unknown and throwing proofs', async () => {
  const owner = {
    name: 'owner',
    events: [],
    proofs: {
      ok: () => null,
      bad: () => 'not yet',
      boom: () => {
        throw new Error('kaput');
      },
    },
    handle: () => null,
  };
  const results = {};
  const asker = {
    name: 'asker',
    events: ['prompt'],
    handle: async (_ev, c) => {
      for (const n of ['ok', 'bad', 'boom', 'nope']) results[n] = await c.proof(n);
      return null;
    },
  };
  await rt([owner, asker]).dispatch({ type: 'prompt' }, ids);
  assert.equal(results.ok, null);
  assert.equal(results.bad, 'not yet');
  assert.match(results.boom, /boom/);
  assert.match(results.boom, /kaput/);
  assert.match(results.nope, /not registered/);
  assert.match(results.nope, /nope/);
  assert.match(await rt([owner]).proof('nope', ids), /nope.*not registered/);
});

test('loadHandlers skips a handler whose copy differs from the lock', async () => {
  const r = await tempRepo();
  try {
    const src = join(r.dir, '..', `src-tamper-${Date.now()}-${Math.random()}`);
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'tool.json'), JSON.stringify({ name: 'tampered', version: '0.1.0', handler: true }));
    writeFileSync(
      join(src, 'handler.mjs'),
      "export default { name: 'tampered', events: ['prompt'], handle: () => null };\n",
    );
    assert.equal(installTool({ sourceDir: src, repoRoot: r.dir }).code, 0);
    writeFileSync(
      join(r.dir, '.agents/harness/tampered/handler.mjs'),
      'globalThis.imported = true; export default {};\n',
    );
    const { handlers, problems } = await loadHandlers(r.dir);
    assert.deepEqual(handlers, []);
    assert.equal(globalThis.imported, undefined);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /tampered/);
    assert.match(problems[0], /differs from the lock/);
    const out = await createRuntime({ repoRoot: r.dir, host: 'claude-code', handlers, problems }).dispatch(
      { type: 'prompt' },
      ids,
    );
    assert.ok(
      out.notices.some((n) => n.includes('tampered')),
      'load problems are reported as notices',
    );
  } finally {
    await r.cleanup();
  }
});

test('loadHandlers loads an installed handler into a worker', async () => {
  const r = await tempRepo();
  try {
    const src = join(r.dir, '..', `src-good-${Date.now()}-${Math.random()}`);
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'tool.json'), JSON.stringify({ name: 'good', version: '0.1.0', handler: true }));
    writeFileSync(
      join(src, 'handler.mjs'),
      "import { isMainThread } from 'node:worker_threads';\n" +
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the string is shell or source text that holds ${...} on purpose
        "export default { name: 'good', events: ['prompt'], handle: (e, c) => ({ context: `main=${isMainThread} ${c.agentId}` }) };\n",
    );
    assert.equal(installTool({ sourceDir: src, repoRoot: r.dir }).code, 0);
    const { handlers, problems } = await loadHandlers(r.dir);
    assert.deepEqual(problems, []);
    assert.equal(handlers.length, 1);
    try {
      const out = await createRuntime({ repoRoot: r.dir, host: 'claude-code', handlers }).dispatch(
        { type: 'prompt' },
        ids,
      );
      assert.equal(out.context, 'main=false main');
    } finally {
      for (const h of handlers) await h.close();
    }
  } finally {
    await r.cleanup();
  }
});

test('a proof called without a signal is aborted at its deadline', async () => {
  let aborted = false;
  const owner = {
    name: 'hang',
    events: [],
    proofs: {
      slow: (c) =>
        new Promise((resolve) =>
          c.signal.addEventListener('abort', () => {
            aborted = true;
            resolve(null);
          }),
        ),
    },
    handle: () => null,
  };
  const text = await rt([owner]).proof('slow', { ...ids, deadline: Date.now() + 80 });
  assert.match(text, /proof slow timed out/);
  assert.equal(aborted, true);
});
