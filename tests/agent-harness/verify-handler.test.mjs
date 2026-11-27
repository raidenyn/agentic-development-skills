// The verify gate handler in process (design D5): edit, ticked task and turn-end triggers, the
// call-scoped before-images, bounded blocks with the charge ledger, failure identity, handover,
// pass record rules and contention.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { existsSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, directSpawn } from './helpers.mjs';
import { edit, editBefore, fire, proofCtx, shellAfter, shellBefore, turnEnd, verifyRepo } from './verify-helpers.mjs';

const vg = (f) => import(pathToFileURL(join(ASSETS.verifyGate, f)).href);
const handlerMod = await vg('handler.mjs');
const { createVerifyHandler, failureKey, normalizeTail, runGate } = handlerMod;
const { acquireGateLock } = await vg('lib/state.mjs');
const { localLock } = await vg('lib/gate.mjs');
const { toEvent } = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'claude-adapter.mjs')).href);
const { toToolEvent } = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'opencode-adapter.mjs')).href);

const h = createVerifyHandler();
const cleanups = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TASKS = 'openspec/changes/x/tasks.md';
const TASKS_TEXT =
  '## 1. Work\n\n- [x] 1.1 Done already\n- [ ] 1.2 Write the thing\n- [ ] 1.3 Test the thing\n- [x] 1.4 Also done\n';
const tick = (text, key) => text.replace(`- [ ] ${key}`, `- [x] ${key}`);

async function repo(opts = {}) {
  const r = await verifyRepo({
    files: { [TASKS]: TASKS_TEXT, 'src/a.js': 'a\n', 'docs/notes.md': '- [ ] note\n' },
    ...opts,
  });
  cleanups.push(r.cleanup);
  return r;
}

// A tool call: before-image, the change, then tool.after.
async function call(r, before, change, afterEvent, opts) {
  await fire(h, r, before, opts);
  await change();
  return fire(h, r, afterEvent, opts);
}
const tickCall = (r, key = '1.2 Write the thing', callId = 'c1', opts = {}) =>
  call(
    r,
    editBefore([TASKS], callId),
    () => r.write(TASKS, tick(readFileSync(join(r.dir, TASKS), 'utf8'), key)),
    edit([TASKS], callId),
    opts,
  );

// ---- edit trigger -------------------------------------------------------------------------------

test('edit runs the command with VERIFY_TRIGGER=edit and VERIFY_FILE', async () => {
  const r = await repo();
  await r.write('src/a.js', 'b\n');
  const { result, traced } = await fire(h, r, edit(['src/a.js']));
  assert.equal(result, null);
  assert.deepEqual(traced, ['ran']);
  const log = r.log();
  assert.equal(log.length, 1);
  assert.equal(log[0].trigger, 'edit');
  assert.equal(log[0].file, 'src/a.js');
});

test('edit failure returns context naming the file', async () => {
  const r = await repo();
  r.fail('lint: bad thing\n');
  await r.write('src/a.js', 'b\n');
  const { result } = await fire(h, r, edit(['src/a.js']));
  assert.match(result.context, /^verify: sh .*verify\.sh failed after the edit of src\/a\.js/);
  assert.match(result.context, /lint: bad thing/);
});

test('an edit pass writes no pass record', async () => {
  const r = await repo();
  await r.write('src/a.js', 'b\n');
  await fire(h, r, edit(['src/a.js']));
  assert.equal(r.passRecord(), null);
});

// ---- editFiles ----------------------------------------------------------------------------------

function counting() {
  const calls = { n: 0 };
  const spawn = (argv, opts) => {
    calls.n++;
    return directSpawn(argv, opts);
  };
  return { spawn, calls };
}
const tsRepo = (config = { editFiles: ['**/*.ts'] }) => repo({ config });

test('editFiles: an edit outside it spawns nothing', async () => {
  const r = await tsRepo();
  await r.write('docs/notes.md', 'x\n');
  const { spawn, calls } = counting();
  const { result, traced } = await fire(h, r, edit(['docs/notes.md']), { spawn });
  assert.equal(result, null);
  assert.deepEqual(traced, ['edit-skipped']);
  assert.equal(calls.n, 0);
  assert.equal(r.log().length, 0);
});

test('editFiles: edits inside it run', async () => {
  const r = await tsRepo();
  await r.write('src/a.ts', 'a\n');
  await r.write('root.ts', 'a\n');
  const { traced } = await fire(h, r, edit(['src/a.ts', 'root.ts']));
  assert.deepEqual(traced, ['ran']);
  assert.deepEqual(
    r.log().map((l) => [l.trigger, l.file]),
    [
      ['edit', 'src/a.ts'],
      ['edit', 'root.ts'],
    ],
  );
});

test('editFiles: a mixed call runs only matching files', async () => {
  const r = await tsRepo();
  await r.write('src/a.ts', 'a\n');
  await fire(h, r, edit(['src/a.ts', 'README.md']));
  assert.equal(r.log().length, 1);
  assert.equal(r.log()[0].file, 'src/a.ts');
});

test('editFiles: dot segments in a pattern are ignored', async () => {
  const r = await tsRepo({ editFiles: ['./src/**/*.ts'] });
  await r.write('src/a.ts', 'a\n');
  await fire(h, r, edit(['src/a.ts']));
  assert.equal(r.log().length, 1);
});

test('editFiles: a backslash in a file name is not a separator', async () => {
  const r = await tsRepo({ editFiles: ['src/*.ts'] });
  await r.write('src\\a.ts', 'a\n');
  const { spawn, calls } = counting();
  const { traced } = await fire(h, r, edit(['src\\a.ts']), { spawn });
  assert.deepEqual(traced, ['edit-skipped']);
  assert.equal(calls.n, 0);
});

test('editFiles: a tick outside it still runs the task check', async () => {
  const r = await tsRepo();
  await tickCall(r);
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['task'],
  );
});

test('editFiles: a tool.after with no files traces nothing', async () => {
  const r = await tsRepo();
  const { spawn, calls } = counting();
  const { result, traced } = await fire(h, r, edit([]), { spawn });
  assert.equal(result, null);
  assert.deepEqual(traced, []);
  assert.equal(calls.n, 0);
});

test('editFiles: an unset command still fails the gate', async () => {
  const r = await tsRepo();
  await r.setConfig({ command: undefined });
  await assert.rejects(fire(h, r, edit(['docs/notes.md'])), /set verify-gate\.command/);
});

test('editFiles: a shell call is unchanged', async () => {
  const r = await tsRepo();
  await call(r, shellBefore('sh1'), () => r.write(TASKS, tick(TASKS_TEXT, '1.3 Test the thing')), shellAfter('sh1'));
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['task'],
  );
});

test('no editFiles: a Markdown edit runs as before', async () => {
  const r = await repo();
  await r.write('docs/notes.md', 'x\n');
  const { traced } = await fire(h, r, edit(['docs/notes.md']));
  assert.deepEqual(traced, ['ran']);
  assert.equal(r.log().length, 1);
  assert.equal(r.log()[0].file, 'docs/notes.md');
});

test('edit pass with output returns a passed note naming the file', async () => {
  const r = await repo();
  r.setOut('eslint --fix rewrote src/a.js\n');
  await r.write('src/a.js', 'b\n');
  const { result, traced } = await fire(h, r, edit(['src/a.js']));
  assert.match(
    result.context,
    /^verify: sh .*verify\.sh passed after the edit of src\/a\.js:\n\neslint --fix rewrote src\/a\.js\n$/,
  );
  assert.deepEqual(traced, ['ran']);
  assert.equal(r.passRecord(), null);
});

test('silent and whitespace-only edit passes return null', async () => {
  const r = await repo();
  await r.write('src/a.js', 'b\n');
  assert.equal((await fire(h, r, edit(['src/a.js']))).result, null);
  r.setOut('  \n\n');
  await r.write('src/a.js', 'c\n');
  assert.equal((await fire(h, r, edit(['src/a.js'], 'c-edit2'))).result, null);
  assert.equal(r.log().length, 2);
});

test('long pass output keeps the last 60 lines', async () => {
  const r = await repo();
  r.setOut(Array.from({ length: 100 }, (_, i) => `${i + 1}\n`).join(''));
  await r.write('src/a.js', 'b\n');
  const { result } = await fire(h, r, edit(['src/a.js']));
  const kept = Array.from({ length: 60 }, (_, i) => `${41 + i}\n`).join('');
  assert.equal(result.context, `verify: sh ${r.script} passed after the edit of src/a.js:\n\n${kept}`);
});

test('stderr-only pass is shown', async () => {
  const r = await repo();
  writeFileSync(r.script, "#!/bin/sh\necho 'note on stderr' >&2\n");
  await r.write('src/a.js', 'b\n');
  const { result } = await fire(h, r, edit(['src/a.js']));
  assert.equal(result.context, `verify: sh ${r.script} passed after the edit of src/a.js:\n\nnote on stderr\n`);
});

test('two edited files: pass note before the failure, in file order', async () => {
  const r = await repo();
  writeFileSync(
    r.script,
    '#!/bin/sh\nif [ "$VERIFY_FILE" = "docs/notes.md" ]; then echo "E1 bad"; exit 1; fi\necho "ok a"\n',
  );
  await r.write('src/a.js', 'b\n');
  await r.write('docs/notes.md', '- [ ] changed\n');
  const { result } = await fire(h, r, edit(['src/a.js', 'docs/notes.md']));
  assert.equal(
    result.context,
    `verify: sh ${r.script} passed after the edit of src/a.js:\n\nok a\n\n\n` +
      `verify: sh ${r.script} failed after the edit of docs/notes.md: exit code 1.\n\nE1 bad\n`,
  );
});

test('passing tick and turn end with output add nothing', async () => {
  const r = await repo();
  r.setOut('progress: all good\n');
  assert.equal((await tickCall(r)).result, null);
  await r.write('src/a.js', 'b\n');
  assert.equal((await fire(h, r, turnEnd())).result, null);
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['task', 'turn-end'],
  );
});

// ---- ticked tasks -------------------------------------------------------------------------------

test('tick in a matching tasks.md runs a full run with VERIFY_TRIGGER=task and skips the edit run', async () => {
  const r = await repo();
  const { result } = await tickCall(r);
  assert.equal(result, null);
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['task'],
  );
  assert.equal(r.log()[0].file, '<unset>');
  assert.equal(r.passRecord().trigger, 'task');
});

test('tick failure context starts "verify: a task was ticked"', async () => {
  const r = await repo();
  r.fail();
  const { result } = await tickCall(r);
  assert.match(result.context, /^verify: a task was ticked while verification fails\./);
  assert.match(result.context, /E101 something broke/);
});

test('tick in docs/notes.md runs only the edit run', async () => {
  const r = await repo();
  await call(r, editBefore(['docs/notes.md']), () => r.write('docs/notes.md', '- [x] note\n'), edit(['docs/notes.md']));
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['edit'],
  );
});

test('a sed -i tick after a shell tool.after runs a task run', async () => {
  const r = await repo();
  const { result } = await call(
    r,
    shellBefore('sh1'),
    () => r.write(TASKS, tick(TASKS_TEXT, '1.3 Test the thing')),
    shellAfter('sh1'),
  );
  assert.equal(result, null);
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['task'],
  );
});

test('a shell call that ticks nothing runs nothing', async () => {
  const r = await repo();
  await call(r, shellBefore('sh1'), () => r.write('src/a.js', 'z\n'), shellAfter('sh1'));
  assert.deepEqual(r.log(), []);
});

test('a new tasks file created ticked runs only the edit run', async () => {
  const r = await repo();
  const y = 'openspec/changes/y/tasks.md';
  await call(r, editBefore([y], 'w1'), () => r.write(y, '- [x] 1.1 Done\n'), edit([y], 'w1'));
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['edit'],
  );
});

test('an added done item is not a tick', async () => {
  const r = await repo();
  await call(r, editBefore([TASKS], 'w1'), () => r.write(TASKS, `${TASKS_TEXT}- [x] 9.9 New\n`), edit([TASKS], 'w1'));
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['edit'],
  );
});

test('a shell tool.before and tool.after are matched by tool.callId (Claude tool_use_id, OpenCode id)', async () => {
  const claudeFix = (name) =>
    JSON.parse(readFileSync(new URL(`./fixtures/claude/${name}.json`, import.meta.url), 'utf8'));
  const ocFix = (name) =>
    JSON.parse(readFileSync(new URL(`./fixtures/opencode/${name}.json`, import.meta.url), 'utf8'));
  for (const host of ['claude', 'opencode']) {
    const r = await repo();
    const ev = (type, callId) => {
      if (host === 'claude') {
        const p = claudeFix(type === 'tool.before' ? 'PreToolUse-Bash' : 'PostToolUse-Bash');
        p.tool_use_id = callId;
        p.cwd = r.dir;
        return toEvent(p, r.dir).event;
      }
      const input = ocFix(type === 'tool.before' ? 'execute.before-shell' : 'execute.after-shell-completed');
      input.id = callId;
      return toToolEvent(type, input, r.dir);
    };
    await fire(h, r, ev('tool.before', 'X'));
    await r.write(TASKS, tick(TASKS_TEXT, '1.2 Write the thing'));
    await fire(h, r, ev('tool.before', 'Y')); // begins after the tick: no transition for Y
    await fire(h, r, ev('tool.after', 'Y'));
    assert.deepEqual(r.log(), [], `${host}: Y saw no tick`);
    await fire(h, r, ev('tool.after', 'X'));
    assert.deepEqual(
      r.log().map((l) => l.trigger),
      ['task'],
      `${host}: X's own before-image shows the tick`,
    );
  }
});

test('an edit during another run waits for the lock and its failure reaches the model', async () => {
  const r = await repo();
  r.fail('lint: nope\n');
  const held = acquireGateLock(r.toolDir);
  assert.ok(held);
  setTimeout(() => held.release(), 700);
  await r.write('src/a.js', 'b\n');
  const t0 = Date.now();
  const { result } = await fire(h, r, edit(['src/a.js']));
  assert.ok(Date.now() - t0 >= 600, 'waited for the lock');
  assert.match(result.context, /failed after the edit of src\/a\.js/);
  assert.match(result.context, /lint: nope/);
});

test('a contended run whose deadline passes reports that nothing was checked', async () => {
  const r = await repo();
  const held = acquireGateLock(r.toolDir);
  try {
    const { result, traced } = await fire(h, r, turnEnd(), { budgetMs: 1800 });
    assert.equal(result.context, 'verify: verification already running; nothing was checked.');
    assert.deepEqual(traced, ['contended']);
    assert.deepEqual(r.log(), []);
  } finally {
    held.release();
  }
});

test("interleaved agents: a subagent's tick is detected once, and the root's later edit of the same file does not re-detect it", async () => {
  const r = await repo();
  const sub = { agentId: 'agent-1' };
  await fire(h, r, editBefore([TASKS], 'sub1'), sub);
  await fire(h, r, editBefore([TASKS], 'root1')); // root begins before the child's tick lands
  await r.write(TASKS, tick(TASKS_TEXT, '1.2 Write the thing'));
  await fire(h, r, edit([TASKS], 'sub1'), sub);
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['task'],
  );
  await r.write(TASKS, `${readFileSync(join(r.dir, TASKS), 'utf8')}\nA note.\n`);
  await fire(h, r, edit([TASKS], 'root1'));
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['task', 'edit'],
    'the root call reports no second tick',
  );
  await call(
    r,
    editBefore([TASKS], 'root2'),
    () => r.write(TASKS, `${readFileSync(join(r.dir, TASKS), 'utf8')}More.\n`),
    edit([TASKS], 'root2'),
  );
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['task', 'edit', 'edit'],
  );
});

test('a tick moved from one hunk to another is detected', async () => {
  const r = await repo();
  const moved =
    '## 1. Work\n\n- [x] 1.1 Done already\n- [ ] 1.3 Test the thing\n- [x] 1.4 Also done\n\n## 2. Later\n\n- [x] 1.2 Write the thing\n';
  await call(r, editBefore([TASKS], 'm1'), () => r.write(TASKS, moved), edit([TASKS], 'm1'));
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['task'],
  );
});

test("a child's tick followed by an overlapping root shell call that began earlier reports the tick once", async () => {
  const r = await repo();
  await fire(h, r, shellBefore('rootsh')); // long root shell call starts
  await sleep(5);
  await tickCall(r, '1.2 Write the thing', 'child1', { agentId: 'child' });
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['task'],
  );
  const { result, traced } = await fire(h, r, shellAfter('rootsh'));
  assert.equal(result, null);
  assert.deepEqual(traced, [], 'the root shell call detects no tick, so it starts no task run at all');
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['task'],
    'the root shell call does not report it again',
  );
});

test('two real ticks of one label: the overlapping shell call still reports one tick', async () => {
  const r = await repo({ files: { [TASKS]: '- [ ] A\n- [ ] A\n', 'src/a.js': 'a\n' } });
  await fire(h, r, shellBefore('rootsh'));
  await sleep(5);
  await call(r, editBefore([TASKS], 'child1'), () => r.write(TASKS, '- [x] A\n- [ ] A\n'), edit([TASKS], 'child1'), {
    agentId: 'child',
  });
  await r.write(TASKS, '- [x] A\n- [x] A\n');
  r.fail();
  const { result } = await fire(h, r, shellAfter('rootsh'));
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['task', 'task'],
  );
  assert.equal(result.context.split(`"A" in ${TASKS}`).length - 1, 1, result.context);
});

test("an untick between sessions followed by a whole-file Write tick is detected from the call's before-image", async () => {
  const r = await repo();
  await tickCall(r, '1.2 Write the thing', 'c1', { sessionId: 's1' });
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['task'],
  );
  await r.write(TASKS, TASKS_TEXT); // the user unticks between sessions
  await sleep(5);
  await fire(h, r, { type: 'session.start', host: 'claude-code', afterCompact: false }, { sessionId: 's2' });
  await call(
    r,
    editBefore([TASKS], 'w2'),
    () => r.write(TASKS, tick(TASKS_TEXT, '1.2 Write the thing')),
    edit([TASKS], 'w2'),
    { sessionId: 's2' },
  );
  assert.deepEqual(
    r.log().map((l) => l.trigger),
    ['task', 'task'],
  );
});

test('session.start creates the worktree tasks snapshot if absent', async () => {
  const r = await repo();
  await fire(h, r, { type: 'session.start', host: 'claude-code', afterCompact: false });
  const snap = JSON.parse(readFileSync(join(r.toolDir, 'tasks.json'), 'utf8'));
  assert.equal(snap.version, 1);
  assert.deepEqual(snap.files[TASKS]['1.2 Write the thing'], { ticked: 0, unticked: 1, ticks: [] });
});

test('a before-image with no tool.after is deleted after one hour', async () => {
  const r = await repo();
  const { ctx } = await fire(h, r, shellBefore('denied'));
  const old = join(ctx.stateDir, 'calls', 'denied.json');
  assert.ok(existsSync(old));
  const past = new Date(Date.now() - 2 * 3600 * 1000);
  utimesSync(old, past, past);
  await fire(h, r, shellBefore('next'));
  assert.equal(existsSync(old), false);
  assert.ok(existsSync(join(ctx.stateDir, 'calls', 'next.json')));
  await fire(h, r, shellAfter('next'));
  assert.equal(existsSync(join(ctx.stateDir, 'calls', 'next.json')), false, 'a matched before-image is removed');
});

// ---- turn end and bounded blocks ---------------------------------------------------------------

test('turn end failure blocks with attempt 1 of 3', async () => {
  const r = await repo();
  r.fail();
  const { result, traced } = await fire(h, r, turnEnd());
  assert.match(result.block, /^verify: sh .*verify\.sh failed \(attempt 1 of 3\)/);
  assert.match(result.block, /E101 something broke/);
  assert.equal(typeof result.ack, 'function');
  assert.equal(typeof result.release, 'function');
  assert.deepEqual(traced, ['ran']);
  assert.equal(r.log()[0].trigger, 'turn-end');
  assert.equal(r.blocks().charges.length, 1);
  await result.ack();
  assert.equal(r.blocks().charges[0].confirmed, true);
});

test('release refunds the charge', async () => {
  const r = await repo();
  r.fail();
  const { result } = await fire(h, r, turnEnd());
  await result.release();
  assert.deepEqual(r.blocks().charges, []);
});

test('a failing turn end carries the stale text', async () => {
  const r = await repo();
  r.fail();
  const { result } = await fire(h, r, turnEnd());
  assert.match(
    result.stale,
    /^verify: the check at the end of the previous turn failed and was not counted; the next turn end checks again\. sh .*verify\.sh failed: /,
  );
  assert.match(result.stale, /E101 something broke/);
  assert.doesNotMatch(result.stale, /attempt|Fix the failure/);
});

test('the limit notice carries the stale text', async () => {
  const r = await repo();
  r.fail();
  r.setTouch('src/generated.txt');
  for (let i = 1; i <= 3; i++)
    assert.match((await fire(h, r, turnEnd())).result.block, new RegExp(`attempt ${i} of 3`));
  const { result } = await fire(h, r, turnEnd());
  assert.ok(result.context && result.stale);
  assert.match(result.context, /still failing after 3 blocks/);
  assert.match(result.stale, /next turn end checks again\. sh .*verify\.sh failed: /);
  assert.match(result.stale, /E101 something broke/);
  assert.doesNotMatch(result.stale, /attempt|still failing|Fix the failure/);
});

test('the busy-ledger notice carries the stale text', async () => {
  const r = await repo();
  r.fail();
  const busyLedger = {
    acquire: async (dir) => (dir.endsWith('ledger') ? null : localLock.acquire(dir)),
  };
  const { result } = await fire(h, r, turnEnd(), { lock: busyLedger });
  assert.ok(result.context && result.stale);
  assert.match(result.context, /block counter was busy/);
  assert.match(result.stale, /next turn end checks again\. sh .*verify\.sh failed: /);
});

test('(guard) a passing turn end carries no stale', async () => {
  const r = await repo();
  const { result, traced } = await fire(h, r, turnEnd());
  assert.deepEqual(traced, ['ran']);
  assert.ok(r.passRecord());
  assert.equal(result?.stale, undefined);
});

test('(guard) the background notice carries no stale', async () => {
  const r = await repo();
  r.fail();
  const { result } = await fire(h, r, turnEnd(1));
  assert.match(result.context, /^verify: sh .*verify\.sh fails while 1 subagent\(s\) still run/);
  assert.equal(result.stale, undefined);
});

test('(guard) a skipped or contended turn end carries no stale', async () => {
  const r = await repo();
  await fire(h, r, turnEnd());
  const skipped = await fire(h, r, turnEnd());
  assert.equal(skipped.result, null);
  assert.deepEqual(skipped.traced, ['no-change']);
  assert.equal(skipped.result?.stale, undefined);
  const held = acquireGateLock(r.toolDir);
  try {
    const contended = await fire(h, r, turnEnd(), { budgetMs: 600 });
    assert.deepEqual(contended.traced, ['contended']);
    assert.match(contended.result.context, /verification already running/);
    assert.equal(contended.result.stale, undefined);
  } finally {
    held.release();
  }
});

test('(guard) a changed count in the tail is a new failure', async () => {
  const r = await repo();
  r.fail('3 failed\n');
  r.setTouch('src/generated.txt');
  for (let i = 1; i <= 3; i++)
    assert.match((await fire(h, r, turnEnd())).result.block, new RegExp(`attempt ${i} of 3`));
  r.fail('2 failed\n');
  assert.match((await fire(h, r, turnEnd())).result.block, /attempt 1 of 3/);
});

test('(guard) a pass does not reset the count', async () => {
  const r = await repo();
  r.fail();
  for (let i = 1; i <= 3; i++)
    assert.match((await fire(h, r, turnEnd())).result.block, new RegExp(`attempt ${i} of 3`));
  r.pass();
  await r.write('src/a.js', 'after the blocks\n');
  assert.equal((await fire(h, r, turnEnd())).result, null);
  r.fail();
  await r.write('src/a.js', 'after the pass\n');
  assert.match((await fire(h, r, turnEnd())).result.context, /still failing after 3 blocks/);
});

test('a root turn end with background 1 runs and returns the background notice, not a block, and does not count', async () => {
  const r = await repo();
  r.fail();
  const { result } = await fire(h, r, turnEnd(1));
  assert.equal(result.block, undefined);
  assert.match(
    result.context,
    /^verify: sh .*verify\.sh fails while 1 subagent\(s\) still run; verification runs again at the next turn end\./,
  );
  assert.match(result.context, /E101/);
  assert.equal(r.log().length, 1);
  assert.deepEqual(r.blocks()?.charges ?? [], []);
});

test("a subagent's failing turn end is blocked", async () => {
  const r = await repo();
  r.fail();
  const { result } = await fire(h, r, turnEnd(0), { agentId: 'agent-7' });
  assert.match(result.block, /attempt 1 of 3/);
});

test('the fourth turn end with the same failure passes with the notice, even with an unrelated edit before each', async () => {
  const r = await repo();
  r.fail();
  for (let i = 1; i <= 3; i++) {
    await r.write('src/a.js', `edit ${i}\n`);
    const { result } = await fire(h, r, turnEnd());
    assert.match(result.block, new RegExp(`attempt ${i} of 3`));
  }
  await r.write('src/a.js', 'edit 4\n');
  const { result } = await fire(h, r, turnEnd());
  assert.equal(result.block, undefined);
  assert.match(result.context, /^verify: still failing after 3 blocks; continuing\./);
  assert.match(result.context, /cli\.mjs run/);
  assert.equal(r.log().length, 4, 'the command still runs each time');
});

test('a different failure gets its own three blocks; E101 then E202 are two failures', async () => {
  const r = await repo();
  r.fail('E101 broke\n');
  for (let i = 1; i <= 3; i++)
    assert.match((await fire(h, r, turnEnd())).result.block, new RegExp(`attempt ${i} of 3`));
  r.fail('E202 broke\n');
  assert.match((await fire(h, r, turnEnd())).result.block, /attempt 1 of 3/);
});

test('a changing temp path in the output is one failure', async () => {
  const r = await repo();
  for (let i = 1; i <= 4; i++) {
    r.fail(`cannot open ${join(tmpdir(), `run-${i}-x`, 'out.json')}: missing\n`);
    const { result } = await fire(h, r, turnEnd());
    if (i < 4) assert.match(result.block, new RegExp(`attempt ${i} of 3`));
    else assert.match(result.context, /still failing after 3 blocks/);
  }
});

test('after 10 blocks in total the gate only notifies', async () => {
  const r = await repo();
  for (let i = 0; i < 10; i++) {
    r.fail(`failure ${'abcdefghij'[i]}\n`);
    assert.match((await fire(h, r, turnEnd())).result.block, /attempt 1 of 3/);
  }
  r.fail('failure k\n');
  const { result } = await fire(h, r, turnEnd());
  assert.equal(result.block, undefined);
  assert.match(result.context, /^verify: still failing after 10 blocks; continuing\./);
});

test('maxBlocks 9 in config still blocks at most 3 times; maxBlocks 1 blocks once', async () => {
  const r = await repo({ config: { maxBlocks: 9 } });
  r.fail();
  for (let i = 1; i <= 3; i++)
    assert.match((await fire(h, r, turnEnd())).result.block, new RegExp(`attempt ${i} of 3`));
  assert.match((await fire(h, r, turnEnd())).result.context, /still failing after 3 blocks/);
  const r1 = await repo({ config: { maxBlocks: 1 } });
  r1.fail();
  assert.match((await fire(h, r1, turnEnd())).result.block, /attempt 1 of 1/);
  assert.match((await fire(h, r1, turnEnd())).result.context, /still failing after 1 blocks/);
});

test("a subagent's two blocks and the root's one block on the same failure exhaust the session's limit", async () => {
  const r = await repo();
  r.fail();
  assert.match((await fire(h, r, turnEnd(), { agentId: 'sub' })).result.block, /attempt 1 of 3/);
  assert.match((await fire(h, r, turnEnd(), { agentId: 'sub' })).result.block, /attempt 2 of 3/);
  assert.match((await fire(h, r, turnEnd())).result.block, /attempt 3 of 3/);
  assert.match((await fire(h, r, turnEnd(), { agentId: 'sub' })).result.context, /still failing/);
  assert.match((await fire(h, r, turnEnd())).result.context, /still failing/);
  // another session has its own count
  assert.match((await fire(h, r, turnEnd(), { sessionId: 's2' })).result.block, /attempt 1 of 3/);
});

test('a missing command binary blocks with a text naming it', async () => {
  const r = await repo({ config: { command: ['no-such-verify-bin-xyz', '--all'] } });
  const { result } = await fire(h, r, turnEnd());
  assert.match(result.block, /^verify: no-such-verify-bin-xyz --all failed \(attempt 1 of 3\)/);
  assert.match(result.block, /could not start no-such-verify-bin-xyz/);
});

test('an unset command gives a failure naming the config key', async () => {
  const r = await repo({ config: { command: [] } });
  await assert.rejects(fire(h, r, turnEnd()), /set verify-gate\.command/);
});

// ---- failure identity ---------------------------------------------------------------------------

test('failureKey: exact argv, exit status with signal name, normalized tail', () => {
  const root = '/work/repo';
  const base = { argv: ['npm', 'test'], exitKind: 'exit', code: 1, signal: null, tail: 'E101 at /work/repo/a.js\n' };
  const k = (o) => failureKey({ ...base, ...o }, root);
  assert.equal(k({}), k({ tail: 'E101 at /work/repo/a.js\n' }));
  assert.notEqual(k({}), k({ tail: 'E202 at /work/repo/a.js\n' }));
  assert.notEqual(k({}), k({ argv: ['npm', 'test', '--'] }));
  assert.notEqual(
    k({ exitKind: 'signal', code: null, signal: 'SIGSEGV' }),
    k({ exitKind: 'signal', code: null, signal: 'SIGABRT' }),
  );
  assert.notEqual(k({}), k({ code: 2 }));
  assert.equal(k({ tail: '# duration_ms 845.2\nok\n' }), k({ tail: '# duration_ms 12.3\nok\n' }));
});

test('normalizeTail replaces only volatile fields', () => {
  const root = '/work/repo';
  const n = (s) => normalizeTail(s, root);
  assert.equal(n('/work/repo/src/a.js:3:7'), '<root>/src/a.js:3:7');
  assert.equal(n('  duration_ms: 12.3'), '  <dur>');
  assert.equal(n('# duration_ms 845.2'), '# <dur>');
  assert.equal(n(`see ${join(tmpdir(), 'abc123', 'f.txt')} now`), 'see <tmp> now');
  assert.equal(n('at 2026-11-25T10:11:12.345Z and 10:11:12'), 'at <time> and <time>');
  assert.equal(n('took 12.3s (450 ms) 3 sec 2m'), 'took <dur> (<dur>) <dur> <dur>');
  assert.equal(n('ptr 0x7ffde4 sha deadbeef1234'), 'ptr <hex> sha <hex>');
  assert.equal(n('code 12345678 and E101'), 'code 12345678 and E101');
});

// ---- handover and pass record -------------------------------------------------------------------

test('handover for each trigger: VERIFY_TRIGGER, VERIFY_FILE only for edit, VERIFY_BASE the merge-base, changed list', async () => {
  const r = await repo();
  const mainSha = r.git('rev-parse', 'HEAD').trim();
  r.git('checkout', '-q', '-b', 'feat');
  await r.write('src/b.js', 'b\n');
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'feat');
  await r.write('src/a.js', 'modified\n');
  await fire(h, r, edit(['src/a.js']));
  await r.write('src/a.js', 'modified again\n');
  await tickCall(r);
  await r.write('src/a.js', 'modified thrice\n');
  await fire(h, r, turnEnd());
  const log = r.log();
  assert.deepEqual(
    log.map((l) => l.trigger),
    ['edit', 'task', 'turn-end'],
  );
  assert.deepEqual(
    log.map((l) => l.file),
    ['src/a.js', '<unset>', '<unset>'],
  );
  for (const l of log) {
    assert.equal(l.base, mainSha);
    assert.equal(l.changedPath, join(r.toolDir, 'changed.txt'));
    assert.ok(l.changed.includes('src/a.js'), `changed list ${l.changed}`);
    assert.ok(l.changed.includes('src/b.js'), 'committed since the base');
  }
});

test('git rm --cached of an unchanged file puts it in the changed list', async () => {
  const r = await repo();
  r.git('rm', '-q', '--cached', 'docs/notes.md');
  await r.write('src/a.js', 'x\n');
  await fire(h, r, edit(['src/a.js']));
  assert.ok(r.log()[0].changed.includes('docs/notes.md'));
});

test('unchanged tree after a full pass: the command is not run, for each of the three triggers', async () => {
  const r = await repo();
  await fire(h, r, turnEnd());
  assert.equal(r.log().length, 1);
  assert.ok(r.passRecord());
  const t = await fire(h, r, turnEnd());
  assert.equal(t.result, null);
  assert.deepEqual(t.traced, ['no-change']);
  const e = await fire(h, r, edit(['src/a.js'])); // an edit that wrote nothing
  assert.equal(e.result, null);
  assert.deepEqual(e.traced, ['no-change']);
  // task: the before-image predates the tick, and a full pass covers the ticked content first
  await fire(h, r, editBefore([TASKS], 'late'));
  await r.write(TASKS, tick(TASKS_TEXT, '1.2 Write the thing'));
  await fire(h, r, turnEnd());
  assert.equal(r.log().length, 2);
  const k = await fire(h, r, edit([TASKS], 'late'));
  assert.equal(k.result, null);
  assert.deepEqual(k.traced, ['no-change']);
  assert.equal(r.log().length, 2, 'no new log line');
});

test('edit pass then turn-end failure on the same content: the turn-end run blocks and verify-pass fails', async () => {
  const r = await repo();
  await r.write('src/a.js', 'b\n');
  await fire(h, r, edit(['src/a.js']));
  r.fail();
  const { result } = await fire(h, r, turnEnd());
  assert.match(result.block, /attempt 1 of 3/);
  assert.match(await h.proofs['verify-pass'](proofCtx(r)), /^verify-pass: no full pass yet/);
});

test('a tree changed during the run writes no pass record', async () => {
  const r = await repo();
  r.setTouch('src/generated.txt');
  const { result } = await fire(h, r, turnEnd());
  assert.equal(result, null);
  assert.equal(r.passRecord(), null);
});

test('a full failure deletes the pass record', async () => {
  const r = await repo();
  await fire(h, r, turnEnd());
  assert.ok(r.passRecord());
  r.fail();
  await r.write('src/a.js', 'c\n');
  await fire(h, r, turnEnd());
  assert.equal(r.passRecord(), null);
});

test('a timed-out handler (signal aborted) writes no pass record', async () => {
  const r = await repo();
  r.setSleep(3);
  const ac = new AbortController();
  setTimeout(() => ac.abort(new Error('deadline')), 300);
  const t0 = Date.now();
  await fire(h, r, turnEnd(), { signal: ac.signal });
  assert.ok(Date.now() - t0 < 2500, 'returned after the abort');
  assert.equal(r.passRecord(), null);
  const lock = acquireGateLock(r.toolDir);
  assert.ok(lock, 'the gate lock was released');
  lock.release();
});

test('runGate: a run whose deadline passes while waiting reports contended', async () => {
  const r = await repo();
  const held = acquireGateLock(r.toolDir);
  try {
    const t0 = Date.now();
    const out = await runGate({
      repoRoot: r.dir,
      trigger: 'turn-end',
      config: JSON.parse(readFileSync(join(r.dir, '.agents/harness.json'), 'utf8'))['verify-gate'],
      stateDir: r.toolDir,
      deadline: Date.now() + 600,
    });
    assert.equal(out.status, 'contended');
    assert.equal(out.text, 'verify: verification already running; nothing was checked.');
    assert.ok(Date.now() - t0 >= 500);
  } finally {
    held.release();
  }
});

test('a concurrent proof read during a run returns "verification is running" or a valid result, never a crash', async () => {
  const r = await repo();
  r.setSleep(3);
  const run = fire(h, r, turnEnd());
  await sleep(400);
  const v = await h.proofs['verify-pass'](proofCtx(r));
  assert.ok(
    v === null || /^verify-pass: (verification is running|no full pass yet|the content changed)/.test(v),
    String(v),
  );
  await run;
  assert.equal(await h.proofs['verify-pass'](proofCtx(r)), null);
});

test('the handler declares its interface', () => {
  assert.equal(h.name, 'verify-gate');
  assert.deepEqual(h.events, ['session.start', 'tool.before', 'tool.after', 'turn.end']);
  assert.deepEqual(h.timeouts, { 'tool.after': 910000, 'turn.end': 910000 });
  assert.equal(h.manual, 'Run node .agents/harness/verify-gate/cli.mjs run by hand.');
  assert.equal(typeof h.proofs['verify-pass'], 'function');
  assert.equal(handlerMod.default.name, 'verify-gate');
  assert.deepEqual(handlerMod.CONFIG_KEYS, [
    'command',
    'base',
    'taskFiles',
    'editFiles',
    'timeoutSeconds',
    'maxBlocks',
  ]);
  assert.deepEqual(handlerMod.REQUIRED_KEYS, ['command']);
  assert.deepEqual(createVerifyHandler({ timeoutSeconds: 5 }).timeouts, { 'tool.after': 15000, 'turn.end': 15000 });
});

test('configHash without editFiles matches 0.1.2', async () => {
  const { configHash } = await vg('lib/gate.mjs');
  const s = { command: ['x'] };
  assert.equal(configHash(s), '4af7534d293897869cc73e3c84170b91d8bd2d6adc2d27f4d3a80b755b2d530e');
  assert.notEqual(configHash({ ...s, editFiles: ['**/*.ts'] }), configHash(s));
  assert.notEqual(configHash({ ...s, editFiles: ['a'] }), configHash({ ...s, editFiles: ['b'] }));
});

test('the edit, run and key functions are injectable', async () => {
  const r = await repo();
  const calls = [];
  const fake = createVerifyHandler({
    runCommand: async (o) => {
      calls.push(o.env.VERIFY_TRIGGER);
      return { code: 0, exitKind: 'exit', signal: null, timedOut: false, spawnError: null, tail: '' };
    },
  });
  await r.write('src/a.js', 'q\n');
  await fire(fake, r, edit(['src/a.js']));
  assert.deepEqual(calls, ['edit']);
  assert.deepEqual(r.log(), []);
  assert.ok(readdirSync(r.toolDir).includes('changed.txt'));
});

test('a busy block ledger says so instead of claiming the limit was reached', async () => {
  const r = await repo();
  r.fail();
  const busyLedger = {
    acquire: async (dir) => (dir.endsWith('ledger') ? null : localLock.acquire(dir)),
  };
  const { result } = await fire(h, r, turnEnd(), { lock: busyLedger });
  assert.match(result.context, /block counter was busy/);
  assert.doesNotMatch(result.context, /still failing after/);
});

test('the gate declares exactly the kinds it acts on', () => {
  const meta = JSON.parse(readFileSync(join(ASSETS.verifyGate, 'tool.json'), 'utf8'));
  assert.deepEqual(meta.tools, ['shell', 'edit']);
});
