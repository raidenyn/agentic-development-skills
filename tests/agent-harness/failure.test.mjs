import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, runNode, tempRepo } from './helpers.mjs';

const runtimeUrl = pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'runtime.mjs')).href;
const { createRuntime } = await import(runtimeUrl);

const repo = await tempRepo();
after(() => repo.cleanup());

const ids = { sessionId: 's1', agentId: 'main' };
const rt = (handlers, opts = {}) => createRuntime({ repoRoot: repo.dir, host: 'claude-code', handlers, ...opts });
const never = () => new Promise(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('throw at tool.after proceeds with notice', async () => {
  const out = await rt([
    {
      name: 't',
      events: ['tool.after'],
      handle: () => {
        throw new Error('boom');
      },
    },
  ]).dispatch({ type: 'tool.after' }, ids);
  assert.equal(out.context, undefined);
  assert.deepEqual(out.notices, ['hook t failed on tool.after: boom. Do this step by hand.']);
  assert.equal(out.outcomes.t, 'failed');
});

test('rejection at prompt', async () => {
  const out = await rt([
    {
      name: 'r',
      events: ['prompt'],
      handle: async () => {
        throw new Error('nope');
      },
    },
  ]).dispatch({ type: 'prompt' }, ids);
  assert.equal(out.context, undefined);
  assert.deepEqual(out.notices, ['hook r failed on prompt: nope. Do this step by hand.']);
});

test('timeout at tool.before gives no deny', async () => {
  const start = Date.now();
  const out = await rt([
    { name: 'slow', events: ['tool.before'], timeouts: { 'tool.before': 50 }, handle: never },
  ]).dispatch({ type: 'tool.before' }, { ...ids, hostDeadline: Date.now() + 1500 });
  assert.equal(out.deny, undefined);
  assert.equal(out.notices.length, 1);
  assert.match(out.notices[0], /^hook slow failed on tool\.before: timed out after 50 ms\./);
  assert.ok(Date.now() - start < 1500, 'returns by the cleanup deadline');
});

test('timeout at tool.after gives the notice in a process with no other live handle', async () => {
  const script = join(repo.dir, '.git', 'never-settles.mjs');
  writeFileSync(
    script,
    `
    const { createRuntime } = await import(${JSON.stringify(runtimeUrl)});
    const rt = createRuntime({ repoRoot: process.cwd(), host: 'claude-code', handlers: [
      { name: 'stuck', events: ['tool.after'], timeouts: { 'tool.after': 100 }, handle: () => new Promise(() => {}) },
    ] });
    const out = await rt.dispatch({ type: 'tool.after' }, { sessionId: 's', agentId: 'main', hostDeadline: Date.now() + 1500 });
    process.stdout.write(JSON.stringify(out.notices));
  `,
  );
  const res = await runNode(script, [], { cwd: repo.dir });
  assert.equal(res.code, 0, res.stderr);
  const notices = JSON.parse(res.stdout);
  assert.match(notices[0], /hook stuck failed on tool\.after: timed out after 100 ms/);
});

test('the signal is aborted at the deadline', async () => {
  let seen;
  const out = await rt([
    {
      name: 'sig',
      events: ['prompt'],
      timeouts: { prompt: 80 },
      handle: (_ev, c) =>
        new Promise((resolve) => {
          c.signal.addEventListener('abort', () => {
            seen = { at: Date.now(), deadline: c.deadline };
            resolve(null);
          });
        }),
    },
  ]).dispatch({ type: 'prompt' }, { ...ids, hostDeadline: Date.now() + 2000 });
  assert.ok(seen, 'abort fired');
  assert.ok(seen.at >= seen.deadline - 5, `aborted at ${seen.at}, deadline ${seen.deadline}`);
  assert.ok(seen.at - seen.deadline < 200);
  assert.match(out.notices[0], /timed out/);
});

test('a {block} returned 500 ms after the deadline is discarded and reported', async () => {
  let released = false;
  const out = await rt([
    {
      name: 'late',
      events: ['turn.end'],
      timeouts: { 'turn.end': 100 },
      handle: async () => {
        await sleep(600);
        return {
          block: 'fix it',
          release: () => {
            released = true;
          },
        };
      },
    },
  ]).dispatch({ type: 'turn.end' }, { ...ids, hostDeadline: Date.now() + 3000 });
  assert.equal(out.block, undefined);
  assert.equal(out.ack, undefined);
  assert.match(out.notices[0], /hook late failed on turn\.end: timed out after 100 ms/);
  assert.equal(released, true, 'a discarded block is released');
});

test('the whole-event budget skips later handlers', async () => {
  const calls = [];
  const out = await rt(
    [
      {
        name: 'a',
        events: ['prompt'],
        handle: async () => {
          calls.push('a');
          await sleep(200);
          return { context: 'late a' };
        },
      },
      {
        name: 'b',
        events: ['prompt'],
        handle: () => {
          calls.push('b');
          return { context: 'b' };
        },
      },
    ],
    { budgetMs: 100 },
  ).dispatch({ type: 'prompt' }, { ...ids, hostDeadline: Date.now() + 3000 });
  assert.deepEqual(calls, ['a']);
  assert.equal(out.context, undefined);
  assert.equal(out.notices.length, 2);
  assert.match(out.notices[0], /hook a failed on prompt: timed out/);
  assert.match(out.notices[1], /hook b failed on prompt: skipped/);
  assert.deepEqual(out.outcomes, { a: 'failed', b: 'skipped' });
});

test('config deadlines override the default', async () => {
  await repo.write('.agents/harness.json', JSON.stringify({ 'hook-runtime': { deadlines: { prompt: 60 } } }));
  try {
    const start = Date.now();
    const out = await rt([
      {
        name: 'cfg',
        events: ['prompt'],
        handle: async () => {
          await sleep(400);
          return { context: 'x' };
        },
      },
    ]).dispatch({ type: 'prompt' }, { ...ids, hostDeadline: Date.now() + 3000 });
    assert.equal(out.context, undefined);
    assert.match(out.notices[0], /timed out after 60 ms/);
    assert.ok(Date.now() - start < 2000);
  } finally {
    await repo.write('.agents/harness.json', '{}');
  }
});

test('the manual text appears in the notice', async () => {
  const out = await rt([
    {
      name: 'm',
      events: ['session.start'],
      manual: 'Run node cli.mjs run by hand.',
      handle: () => {
        throw new Error('bad');
      },
    },
  ]).dispatch({ type: 'session.start' }, ids);
  assert.deepEqual(out.notices, ['hook m failed on session.start: bad. Run node cli.mjs run by hand.']);
});

test('a broken harness.json fails open', async () => {
  await repo.write('.agents/harness.json', '{ not json');
  try {
    let called = false;
    const out = await rt([
      {
        name: 'v',
        events: ['turn.end'],
        handle: () => {
          called = true;
          return { block: 'x' };
        },
      },
    ]).dispatch({ type: 'turn.end' }, ids);
    assert.equal(called, false);
    assert.equal(out.block, undefined);
    assert.match(out.notices[0], /^hook v failed on turn\.end: .*harness\.json/);
  } finally {
    await repo.write('.agents/harness.json', '{}');
  }
});
