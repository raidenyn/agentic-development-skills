// Delivery, ledger and handler (design D4, D5): the skill, slash-prompt and command moments, the
// deny-once gate, the 9000-byte capped join, the per-context ledger and every fail-open path.
// The pure cases call decide directly; the handler cases call the built handler in process with one
// state folder per agent, as the runtime gives it.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { ASSETS, tempRepo } from './helpers.mjs';

const lib = (file) => import(pathToFileURL(join(ASSETS.hookedRules, 'lib', file)).href);
const { decide, capped, promptSkill, CONTEXT_CAP } = await lib('deliver.mjs');
const { acquireLedgerLock, withLedger } = await lib('ledger.mjs');
const { parseRule } = await lib('rules.mjs');
const { createRuntime } = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'runtime.mjs')).href);
const handlerMod = await import(pathToFileURL(join(ASSETS.hookedRules, 'handler.mjs')).href);
const { createHookedRulesHandler } = handlerMod;
const h = handlerMod.default;

const cleanups = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

// A rule file: `---` frontmatter with a pointer, then a body.
const RULE = (frontmatter, body = 'Rule body.\n') => `---\npointer: "see AGENTS.md"\n${frontmatter}\n---\n${body}`;
const ruleOf = (name, frontmatter, body) => parseRule(name, RULE(frontmatter, body));
const empty = () => ({ version: 1, generation: 0, entries: {}, reported: [] });
const clone = (value) => structuredClone(value);

// The two gate patterns this repository uses, in the rule file's double-backslash form and as the
// pattern source the ledger records.
const COMMIT_FILE = String.raw`\\bgit\\b[^;&|\\n]*?\\scommit\\b`;
const COMMIT = String.raw`\bgit\b[^;&|\n]*?\scommit\b`;
const PR_FILE = String.raw`\\bgh\\s+pr\\s+create\\b`;
const PR = String.raw`\bgh\s+pr\s+create\b`;
const BUILD_FILE = String.raw`\\bpnpm\\s+run\\s+build\\b`;
const BUILD = String.raw`\bpnpm\s+run\s+build\b`;
const PUSH_FILE = String.raw`\\bgit\\s+push\\b`;

async function repo(files = {}) {
  const r = await tempRepo({ files });
  cleanups.push(r.cleanup);
  return r;
}

const stateDirOf = (r, agent = 'main') => join(r.dir, '.state', agent);
const ledgerPath = (r, agent = 'main') => join(stateDirOf(r, agent), 'ledger.json');
const storedLedger = (r, agent = 'main') => JSON.parse(readFileSync(ledgerPath(r, agent), 'utf8'));

/** @typedef {{ agentId?: string, stateDir?: string, deadline?: number, signal?: AbortSignal }} ContextOptions */

/** @param {any} r @param {ContextOptions} [opts] */
function context(r, { agentId = 'main', stateDir, deadline = Date.now() + 20000, signal } = {}) {
  return {
    repoRoot: r.dir,
    host: 'claude-code',
    sessionId: 's1',
    agentId,
    deadline,
    signal: signal ?? new AbortController().signal,
    stateDir: stateDir ?? stateDirOf(r, agentId),
    config: {},
    proof: async () => null,
    trace: () => {},
  };
}

/** @param {any} handler @param {any} r @param {any} event @param {ContextOptions} [opts] */
const call = (handler, r, event, opts) => handler.handle(structuredClone(event), context(r, opts));

const skill = (name, extra = {}) => ({
  type: 'tool.after',
  host: 'claude-code',
  tool: { name: 'Skill', kind: 'skill', input: {} },
  skill: name,
  skillVia: 'call',
  ok: true,
  ...extra,
});
const read = (name) => ({
  type: 'tool.after',
  host: 'opencode',
  tool: { name: 'read', kind: 'read', input: {} },
  skill: name,
  skillVia: 'read',
  ok: true,
});
const shellBefore = (command) => ({
  type: 'tool.before',
  host: 'claude-code',
  tool: { name: 'Bash', kind: 'shell', input: { command } },
  command,
});
const shellAfter = (command, ok = true) => ({
  type: 'tool.after',
  host: 'claude-code',
  tool: { name: 'Bash', kind: 'shell', input: { command } },
  command,
  ok,
});
const prompt = (text) => ({ type: 'prompt', host: 'opencode', prompt: text });
const compact = () => ({ type: 'compact', host: 'claude-code' });
const sessionStart = (afterCompact = false) => ({ type: 'session.start', host: 'claude-code', afterCompact });

// ---- promptSkill --------------------------------------------------------------------------------

test('promptSkill takes only a leading /<name> word', () => {
  assert.equal(promptSkill('  /x\nmore'), 'x');
  assert.equal(promptSkill('/'), null);
  assert.equal(promptSkill('a /x'), null);
  assert.equal(promptSkill('/openspec-apply-change add-x'), 'openspec-apply-change');
  assert.equal(promptSkill(''), null);
});

// ---- moments ------------------------------------------------------------------------------------

test('a skill call delivers its rule text once and records the trigger', () => {
  const rule = ruleOf('apply.md', 'skills: ["openspec-apply-change"]', 'Apply the change.\n\n');
  const before = empty();
  const snapshot = clone(before);
  const first = decide([rule], before, skill('openspec-apply-change'));
  assert.deepEqual(first.result, { context: 'Apply the change.' });
  assert.deepEqual(first.ledger.entries['apply.md'], {
    sha256: rule.sha256,
    generation: 0,
    state: 'delivered',
    patterns: [],
    triggers: ['skill:openspec-apply-change'],
  });
  assert.deepEqual(before, snapshot, 'decide does not mutate its ledger argument');
  const second = decide([rule], first.ledger, skill('openspec-apply-change'));
  assert.equal(second.result, null);
  assert.deepEqual(second.ledger.entries, first.ledger.entries);
});

test('a slash prompt is a skill moment and a mention is not', () => {
  const rule = ruleOf('apply.md', 'skills: ["openspec-apply-change"]', 'Apply the change.\n');
  const out = decide([rule], empty(), prompt('/openspec-apply-change add-x'));
  assert.deepEqual(out.result, { context: 'Apply the change.' });
  assert.deepEqual(out.ledger.entries['apply.md'].triggers, ['skill:openspec-apply-change']);
  assert.equal(decide([rule], empty(), prompt('please run /openspec-apply-change')).result, null);
});

test('a SKILL.md read matches a namespaced skill by its last part; a Skill call does not', () => {
  const rule = ruleOf('brain.md', 'skills: ["superpowers:brainstorming"]', 'Brainstorm first.\n');
  const readOut = decide([rule], empty(), read('brainstorming'));
  assert.deepEqual(readOut.result, { context: 'Brainstorm first.' });
  assert.deepEqual(readOut.ledger.entries['brain.md'].triggers, ['skill:brainstorming']);
  assert.equal(decide([rule], empty(), skill('brainstorming')).result, null);
});

test('a SKILL.md read matches a skill listed by its exact name', () => {
  const rule = ruleOf('apply.md', 'skills: ["openspec-apply-change"]', 'Apply the change.\n');
  const out = decide([rule], empty(), read('openspec-apply-change'));
  assert.deepEqual(out.result, { context: 'Apply the change.' });
  assert.deepEqual(out.ledger.entries['apply.md'].triggers, ['skill:openspec-apply-change']);
});

test('a successful matching command delivers with a command trigger; a failed one does not', () => {
  const rule = ruleOf('build.md', `commands: ["${BUILD_FILE}"]`, 'Run the build.\n');
  const out = decide([rule], empty(), shellAfter('pnpm run build'));
  assert.deepEqual(out.result, { context: 'Run the build.' });
  assert.deepEqual(out.ledger.entries['build.md'].triggers, [`command:${BUILD}`]);
  const failed = decide([rule], empty(), shellAfter('pnpm run build', false));
  assert.equal(failed.result, null);
  assert.deepEqual(failed.ledger.entries, {});
});

// ---- once per context ---------------------------------------------------------------------------

test('a rule delivers again for a new trigger and never for a kept one', () => {
  const rule = ruleOf('both.md', ['skills: ["s"]', `commands: ["${BUILD_FILE}"]`].join('\n'), 'Both.\n');
  const first = decide([rule], empty(), skill('s'));
  assert.deepEqual(first.result, { context: 'Both.' });
  const second = decide([rule], first.ledger, shellAfter('pnpm run build'));
  assert.deepEqual(second.result, { context: 'Both.' });
  assert.deepEqual(second.ledger.entries['both.md'].triggers, [`command:${BUILD}`, 'skill:s'].sort());
  const third = decide([rule], second.ledger, skill('s'));
  assert.equal(third.result, null);
  assert.deepEqual(third.ledger.entries, second.ledger.entries);
  const deliveries = [first, second, third].filter((out) => out.result?.context).length;
  assert.equal(deliveries, 2, 'skill, command and the same skill give exactly two deliveries');
});

// ---- re-delivery --------------------------------------------------------------------------------

test('a new generation or an edited rule delivers again', () => {
  const first = ruleOf('a.md', 'skills: ["s"]', 'First text.\n');
  const delivered = decide([first], empty(), skill('s')).ledger;
  const bumped = { ...delivered, generation: 1 };
  assert.deepEqual(decide([first], bumped, skill('s')).result, { context: 'First text.' });
  const edited = ruleOf('a.md', 'skills: ["s"]', 'Second text.\n');
  assert.deepEqual(decide([edited], delivered, skill('s')).result, { context: 'Second text.' });
});

test('a ledger entry of a removed rule is ignored', () => {
  const gone = ruleOf('gone.md', 'skills: ["gone"]', 'Gone.\n');
  const kept = ruleOf('kept.md', 'skills: ["s"]', 'Kept.\n');
  const ledger = decide([gone], empty(), skill('gone')).ledger;
  const out = decide([kept], ledger, skill('s'));
  assert.deepEqual(out.result, { context: 'Kept.' });
  assert.ok(out.ledger.entries['gone.md'], 'the removed rule entry is left alone');
});

test('re-adding a rule: the same sha256 stays delivered, a new one delivers again', () => {
  const first = ruleOf('a.md', 'skills: ["s"]', 'First.\n');
  const ledger = decide([first], empty(), skill('s')).ledger;
  const again = ruleOf('a.md', 'skills: ["s"]', 'First.\n');
  assert.equal(again.sha256, first.sha256);
  assert.equal(decide([again], ledger, skill('s')).result, null);
  const changed = ruleOf('a.md', 'skills: ["s"]', 'Changed.\n');
  assert.deepEqual(decide([changed], ledger, skill('s')).result, { context: 'Changed.' });
});

// ---- gates --------------------------------------------------------------------------------------

test('a gated commit is denied once and the retry passes as delivered', () => {
  const rule = ruleOf('commit.md', `gates: ["${COMMIT_FILE}"]`, 'Commit types.\n');
  const first = decide([rule], empty(), shellBefore('git commit -m "x"'));
  assert.deepEqual(first.result, { deny: 'Commit types.' });
  assert.deepEqual(first.ledger.entries['commit.md'], {
    sha256: rule.sha256,
    generation: 0,
    state: 'pending',
    patterns: [COMMIT],
    triggers: [],
  });
  const second = decide([rule], first.ledger, shellBefore('git commit -m "y"'));
  assert.equal(second.result, null);
  assert.deepEqual(second.ledger.entries['commit.md'], {
    sha256: rule.sha256,
    generation: 0,
    state: 'delivered',
    patterns: [COMMIT],
    triggers: [],
  });
});

test('a pending gate with other patterns denies again with the union', () => {
  const rule = ruleOf('both.md', `gates: ["${COMMIT_FILE}", "${PR_FILE}"]`, 'Commit or PR.\n');
  const first = decide([rule], empty(), shellBefore('git commit -m "x"'));
  assert.deepEqual(first.result, { deny: 'Commit or PR.' });
  const other = decide([rule], first.ledger, shellBefore('gh pr create --fill'));
  assert.deepEqual(other.result, { deny: 'Commit or PR.' });
  assert.deepEqual(other.ledger.entries['both.md'].patterns, [COMMIT, PR].sort());
  assert.equal(other.ledger.entries['both.md'].state, 'pending');
});

test('a rule delivered at its skill does not deny its gate', () => {
  const rule = ruleOf('both.md', ['skills: ["s"]', `gates: ["${COMMIT_FILE}"]`].join('\n'), 'Both.\n');
  const delivered = decide([rule], empty(), skill('s'));
  assert.deepEqual(delivered.result, { context: 'Both.' });
  assert.equal(decide([rule], delivered.ledger, shellBefore('git commit -m "x"')).result, null);
});

test('a tool.before that is not a shell call checks no gate', () => {
  const rule = ruleOf('commit.md', `gates: ["${COMMIT_FILE}"]`, 'Commit types.\n');
  const event = { ...shellBefore('git commit -m "x"'), tool: { name: 'Edit', kind: 'edit', input: {} } };
  const out = decide([rule], empty(), event);
  assert.equal(out.result, null);
  assert.deepEqual(out.ledger.entries, {});
});

test('a gate denial, its confirmation, then a moment keep one entry with both records', () => {
  const rule = ruleOf(
    'commit.md',
    [`commands: ["${COMMIT_FILE}"]`, `gates: ["${COMMIT_FILE}"]`].join('\n'),
    'Commit types.\n',
  );
  const denied = decide([rule], empty(), shellBefore('git commit -m "x"'));
  assert.deepEqual(denied.result, { deny: 'Commit types.' });
  const passed = decide([rule], denied.ledger, shellBefore('git commit -m "x"'));
  assert.equal(passed.result, null);
  const delivered = decide([rule], passed.ledger, shellAfter('git commit -m "x"'));
  assert.deepEqual(delivered.result, { context: 'Commit types.' });
  assert.deepEqual(delivered.ledger.entries['commit.md'], {
    sha256: rule.sha256,
    generation: 0,
    state: 'delivered',
    patterns: [COMMIT],
    triggers: [`command:${COMMIT}`],
  });
});

// ---- joined and capped texts --------------------------------------------------------------------

test('capped keeps each rule whole, in name order', () => {
  const b = ruleOf('b.md', 'skills: ["s"]', 'B\n');
  const a = ruleOf('a.md', 'skills: ["s"]', 'A\n');
  const { included, text } = capped([
    [b, 'B'],
    [a, 'A'],
  ]);
  assert.deepEqual(
    included.map((r) => r.name),
    ['a.md', 'b.md'],
  );
  assert.equal(text, 'A\n\nB');
});

test('three matched rules of 4000 bytes deliver two in name order and record two', () => {
  const body = (char) => char.repeat(4000);
  const rules = ['c', 'a', 'b'].map((char) => ruleOf(`${char}.md`, 'skills: ["s"]', body(char)));
  const out = decide(rules, empty(), skill('s'));
  assert.equal(CONTEXT_CAP, 9000);
  assert.equal(out.result.context, `${body('a')}\n\n${body('b')}`);
  assert.deepEqual(Object.keys(out.ledger.entries).sort(), ['a.md', 'b.md']);
});

test('the deny text uses the same 9000-byte cap', () => {
  const body = (char) => char.repeat(4000);
  const rules = ['c', 'a', 'b'].map((char) => ruleOf(`${char}.md`, `gates: ["${COMMIT_FILE}"]`, body(char)));
  const out = decide(rules, empty(), shellBefore('git commit -m "x"'));
  assert.equal(out.result.deny, `${body('a')}\n\n${body('b')}`);
  assert.deepEqual(Object.keys(out.ledger.entries).sort(), ['a.md', 'b.md']);
});

// ---- the handler --------------------------------------------------------------------------------

test('the handler declares its events and manual text', () => {
  assert.equal(h.name, 'hooked-rules');
  assert.deepEqual([...h.events], ['tool.before', 'tool.after', 'prompt', 'compact', 'session.start']);
  assert.equal(
    h.manual,
    'Read the hooked rules listed in AGENTS.md (.agents/hooked-rules/) by hand at the moments they name.',
  );
});

test('the root agent and a subagent keep separate ledgers', async () => {
  const r = await repo({ '.agents/hooked-rules/apply.md': RULE('skills: ["s"]', 'Apply.\n') });
  assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' });
  assert.deepEqual(await call(h, r, skill('s'), { agentId: 'child' }), { context: 'Apply.' });
  assert.equal(await call(h, r, skill('s')), null);
  assert.equal(await call(h, r, skill('s'), { agentId: 'child' }), null);
  assert.equal(storedLedger(r, 'main').entries['apply.md'].state, 'delivered');
  assert.equal(storedLedger(r, 'child').entries['apply.md'].state, 'delivered');
});

test('a subagent compaction leaves the root delivered, and a root compaction re-arms', async () => {
  const r = await repo({ '.agents/hooked-rules/apply.md': RULE('skills: ["s"]', 'Apply.\n') });
  await call(h, r, skill('s'));
  await call(h, r, compact(), { agentId: 'child' });
  assert.equal(await call(h, r, skill('s')), null);
  assert.equal(storedLedger(r, 'main').generation, 0);
  await call(h, r, compact());
  assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' });
  assert.equal(storedLedger(r, 'main').generation, 1);
});

test('session.start with afterCompact re-arms, a plain one does not', async () => {
  const r = await repo({ '.agents/hooked-rules/apply.md': RULE('skills: ["s"]', 'Apply.\n') });
  assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' });
  assert.equal(await call(h, r, sessionStart()), null);
  assert.equal(await call(h, r, skill('s')), null);
  await call(h, r, sessionStart(true));
  assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' });
});

test('session.start reports an invalid rule file once, in the main context only', async () => {
  const r = await repo({
    '.agents/hooked-rules/bad.md': RULE(['skills: ["s"]', 'when: "x"'].join('\n'), 'Bad.\n'),
    '.agents/hooked-rules/apply.md': RULE('skills: ["s"]', 'Apply.\n'),
  });
  const first = await call(h, r, sessionStart());
  assert.ok(first?.context, 'the session start reports the invalid file');
  assert.match(first.context, /\.agents\/hooked-rules\/bad\.md/);
  assert.match(first.context, /when/);
  assert.equal(storedLedger(r).reported.length, 1);
  assert.match(storedLedger(r).reported[0], /\.agents\/hooked-rules\/bad\.md/);
  assert.equal(await call(h, r, sessionStart()), null, 'already reported in this context');
  assert.equal(await call(h, r, sessionStart(), { agentId: 'child' }), null, 'a child session is not told');
  // The valid rule still delivers.
  assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' });
});

test('a SKILL.md read delivers in the handler, a Skill call does not', async () => {
  const r = await repo({
    '.agents/hooked-rules/brain.md': RULE('skills: ["superpowers:brainstorming"]', 'Brainstorm first.\n'),
  });
  assert.equal(await call(h, r, skill('brainstorming')), null);
  assert.deepEqual(await call(h, r, read('brainstorming')), { context: 'Brainstorm first.' });
  assert.deepEqual(storedLedger(r).entries['brain.md'].triggers, ['skill:brainstorming']);
});

test('an edited rule delivers again in the handler', async () => {
  const r = await repo({ '.agents/hooked-rules/apply.md': RULE('skills: ["s"]', 'Apply.\n') });
  assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' });
  await r.write('.agents/hooked-rules/apply.md', RULE('skills: ["s"]', 'Edited.\n'));
  assert.deepEqual(await call(h, r, skill('s')), { context: 'Edited.' });
});

test('a gate denial is recorded before it returns, and the retry marks it delivered', async () => {
  const r = await repo({ '.agents/hooked-rules/commit.md': RULE(`gates: ["${COMMIT_FILE}"]`, 'Commit types.\n') });
  assert.deepEqual(await call(h, r, shellBefore('git commit -m "x"')), { deny: 'Commit types.' });
  assert.equal(storedLedger(r).entries['commit.md'].state, 'pending');
  assert.equal(await call(h, r, shellBefore('git commit -m "y"')), null);
  assert.equal(storedLedger(r).entries['commit.md'].state, 'delivered');
});

test('a broken ledger.json denies once and is rewritten as valid JSON', async () => {
  const r = await repo({ '.agents/hooked-rules/commit.md': RULE(`gates: ["${COMMIT_FILE}"]`, 'Commit types.\n') });
  mkdirSync(stateDirOf(r), { recursive: true });
  writeFileSync(ledgerPath(r), '{ not json');
  assert.deepEqual(await call(h, r, shellBefore('git commit -m "x"')), { deny: 'Commit types.' });
  const stored = storedLedger(r);
  assert.equal(stored.version, 1);
  assert.equal(stored.entries['commit.md'].state, 'pending');
});

test('two concurrent handle calls for one skill give exactly one context', async () => {
  const r = await repo({ '.agents/hooked-rules/apply.md': RULE('skills: ["s"]', 'Apply.\n') });
  const results = await Promise.all([call(h, r, skill('s')), call(h, r, skill('s'))]);
  assert.equal(results.filter((result) => result?.context).length, 1);
});

test('an exception from matching rejects so dispatch fails open with the manual notice', async () => {
  const rule = ruleOf('boom.md', `gates: ["${COMMIT_FILE}"]`, 'Commit types.\n');
  rule.gates[0].regex.test = () => {
    throw new Error('boom');
  };
  const throwing = createHookedRulesHandler({ loadRules: () => ({ rules: [rule], errors: [] }) });
  const r = await repo();
  await assert.rejects(call(throwing, r, shellBefore('git commit -m "x"')), /boom/);
  assert.equal(existsSync(ledgerPath(r)), false, 'nothing is recorded');

  const out = await createRuntime({ repoRoot: r.dir, host: 'claude-code', handlers: [throwing] }).dispatch(
    structuredClone(shellBefore('git commit -m "x"')),
    { sessionId: 's1', agentId: 'main' },
  );
  assert.equal(out.deny, undefined, 'the host call is not denied');
  assert.equal(out.outcomes['hooked-rules'], 'failed');
  assert.equal(out.notices.length, 1);
  assert.match(out.notices[0], /^hook hooked-rules failed on tool\.before: boom\./);
  assert.ok(out.notices[0].includes(throwing.manual), 'the notice names the hand-read manual');
});

test('a ledger that cannot be read rejects instead of passing silently', async () => {
  const r = await repo({ '.agents/hooked-rules/commit.md': RULE(`gates: ["${COMMIT_FILE}"]`, 'Commit types.\n') });
  mkdirSync(ledgerPath(r), { recursive: true });
  await assert.rejects(call(h, r, shellBefore('git commit -m "x"')), /EISDIR|directory/i);
});

test('an edit-kind tool.before never denies', async () => {
  const r = await repo({ '.agents/hooked-rules/commit.md': RULE(`gates: ["${COMMIT_FILE}"]`, 'Commit types.\n') });
  const event = { ...shellBefore('git commit -m "x"'), tool: { name: 'Edit', kind: 'edit', input: {} } };
  assert.equal(await call(h, r, event), null);
  assert.equal(existsSync(ledgerPath(r)), false);
});

test('an aborted call or a passed deadline records nothing', async () => {
  const rule = 'skills: ["s"]';
  const aborted = await repo({ '.agents/hooked-rules/apply.md': RULE(rule, 'Apply.\n') });
  mkdirSync(stateDirOf(aborted), { recursive: true });
  writeFileSync(ledgerPath(aborted), JSON.stringify(empty()));
  const controller = new AbortController();
  controller.abort();
  assert.equal(await call(h, aborted, skill('s'), { signal: controller.signal }), null);
  assert.equal(readFileSync(ledgerPath(aborted), 'utf8'), JSON.stringify(empty()));

  const late = await repo({ '.agents/hooked-rules/apply.md': RULE(rule, 'Apply.\n') });
  mkdirSync(stateDirOf(late), { recursive: true });
  writeFileSync(ledgerPath(late), JSON.stringify(empty()));
  assert.equal(await call(h, late, skill('s'), { deadline: Date.now() - 1 }), null);
  assert.equal(readFileSync(ledgerPath(late), 'utf8'), JSON.stringify(empty()));
});

test('a held lock passes the gate and returns the moment without recording', async () => {
  const r = await repo({
    '.agents/hooked-rules/apply.md': RULE('skills: ["s"]', 'Apply.\n'),
    '.agents/hooked-rules/commit.md': RULE(`gates: ["${COMMIT_FILE}"]`, 'Commit types.\n'),
  });
  mkdirSync(stateDirOf(r), { recursive: true });
  const seeded = JSON.stringify(empty());
  writeFileSync(ledgerPath(r), seeded);
  const slot = join(stateDirOf(r), 'ledger.lock.1');
  writeFileSync(slot, JSON.stringify({ pid: process.pid, at: Date.now() }));
  try {
    assert.equal(await call(h, r, shellBefore('git commit -m "x"')), null, 'the gate fails open');
    assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' });
    assert.equal(readFileSync(ledgerPath(r), 'utf8'), seeded, 'nothing is written');
  } finally {
    rmSync(slot, { force: true });
  }
});

test('two takeover attempts on one stale lock admit exactly one dispatch', async () => {
  const r = await repo();
  const dir = stateDirOf(r);
  mkdirSync(dir, { recursive: true });
  const stale = join(dir, 'ledger.lock.1');
  const body = JSON.stringify({ pid: process.pid, at: Date.now(), released: false });
  writeFileSync(stale, body);
  // Both contenders wait on slot 1, so both observe it going stale at the same moment and race for
  // the successor slot. Only the link can decide between them.
  const nearlyStale = new Date(Date.now() - 9750);
  utimesSync(stale, nearlyStale, nearlyStale);
  const [first, second] = await Promise.all([acquireLedgerLock(dir), acquireLedgerLock(dir)]);
  assert.ok(first, 'one contender takes the stale lock over');
  assert.equal(second, null, 'the other contender does not join it');
  assert.equal(readFileSync(stale, 'utf8'), body, 'the stale slot is never moved or rewritten');
  assert.ok(existsSync(first.path), 'the winner holds its own slot');
  first.release();
  assert.equal(existsSync(first.path), false, 'release removes only that slot');
  const next = await acquireLedgerLock(dir);
  assert.ok(next, 'the next dispatch acquires after the release');
  next.release();
});

test('a stale write cannot roll the generation back below a lock-free bump', async () => {
  const r = await repo();
  mkdirSync(stateDirOf(r), { recursive: true });
  writeFileSync(ledgerPath(r), JSON.stringify(empty()));
  const value = await withLedger(stateDirOf(r), (ledger) => {
    // A compaction that won no lock publishes the bump while this dispatch holds a stale copy.
    writeFileSync(ledgerPath(r), JSON.stringify({ ...ledger, generation: ledger.generation + 1 }));
    const entry = { sha256: 'x', generation: 0, state: 'pending', patterns: [], triggers: [] };
    return { ledger: { ...ledger, entries: { ...ledger.entries, late: entry } }, value: 'decided' };
  });
  assert.equal(value, 'decided');
  assert.equal(storedLedger(r).generation, 1, 'the compaction survives the stale write');
  assert.equal(storedLedger(r).entries.late.state, 'pending');
});

test('a broken ledger.json is repaired by an event that records nothing', async () => {
  const r = await repo({ '.agents/hooked-rules/commit.md': RULE(`gates: ["${COMMIT_FILE}"]`, 'Commit types.\n') });
  mkdirSync(stateDirOf(r), { recursive: true });
  writeFileSync(ledgerPath(r), '{ not json');
  assert.equal(await call(h, r, shellAfter('echo hi')), null);
  assert.deepEqual(storedLedger(r), empty());
});

test('a broken ledger.json is left alone by a call that was aborted', async () => {
  const r = await repo({ '.agents/hooked-rules/apply.md': RULE('skills: ["s"]', 'Apply.\n') });
  mkdirSync(stateDirOf(r), { recursive: true });
  writeFileSync(ledgerPath(r), '{ not json');
  const controller = new AbortController();
  controller.abort();
  assert.equal(await call(h, r, skill('s'), { signal: controller.signal }), null);
  assert.equal(readFileSync(ledgerPath(r), 'utf8'), '{ not json');
});

test('a startup report waits for the lock instead of being shown twice', async () => {
  const r = await repo({
    '.agents/hooked-rules/bad.md': RULE(['skills: ["s"]', 'when: "x"'].join('\n'), 'Bad.\n'),
  });
  mkdirSync(stateDirOf(r), { recursive: true });
  const slot = join(stateDirOf(r), 'ledger.lock.1');
  writeFileSync(slot, JSON.stringify({ pid: process.pid, at: Date.now() }));
  try {
    assert.equal(await call(h, r, sessionStart()), null, 'no report without the lock');
  } finally {
    rmSync(slot, { force: true });
  }
  const first = await call(h, r, sessionStart());
  assert.ok(first?.context?.includes('.agents/hooked-rules/bad.md'));
  assert.equal(await call(h, r, sessionStart()), null, 'the deferred report is shown once');
});

test('a compaction that was aborted or is past its deadline does not bump the generation', async () => {
  const controller = new AbortController();
  controller.abort();
  /** @type {[any, ContextOptions][]} */
  const cases = [
    [compact(), { signal: controller.signal }],
    [compact(), { deadline: Date.now() - 1 }],
    [sessionStart(true), { signal: controller.signal }],
    [sessionStart(true), { deadline: Date.now() - 1 }],
  ];
  for (const [event, opts] of cases) {
    const r = await repo({ '.agents/hooked-rules/apply.md': RULE('skills: ["s"]', 'Apply.\n') });
    assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' });
    assert.equal(await call(h, r, event, opts), null);
    assert.equal(storedLedger(r).generation, 0, `${event.type} did not bump`);
    assert.equal(storedLedger(r).entries['apply.md'].state, 'delivered');
    assert.equal(await call(h, r, skill('s')), null, 'the rule stays delivered');
  }
});

test('an unreadable rules folder is reported at the next session start', async (t) => {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('root reads a 0o000 folder');
    return;
  }
  const r = await repo({ '.agents/hooked-rules/a.md': RULE('skills: ["s"]', 'A.\n') });
  const dir = join(r.dir, '.agents', 'hooked-rules');
  chmodSync(dir, 0o000);
  try {
    const out = await call(h, r, sessionStart());
    assert.ok(out?.context, 'the unreadable folder is reported, not discarded');
    assert.match(out.context, /\.agents\/hooked-rules: cannot be read/);
  } finally {
    chmodSync(dir, 0o755);
  }
});

test('a rule with requires is a load error and its gate does not deny', async () => {
  const r = await repo({
    '.agents/hooked-rules/push.md': RULE(
      [`gates: ["${PUSH_FILE}"]`, 'requires: ["verify-pass"]'].join('\n'),
      'Push rules.\n',
    ),
  });
  assert.equal(await call(h, r, shellBefore('git push origin main')), null);
  assert.equal(existsSync(ledgerPath(r)), false);
});

test('a missing rules folder means no rules and no error', async () => {
  const r = await repo();
  assert.equal(await call(h, r, sessionStart()), null);
  assert.equal(await call(h, r, shellBefore('git commit -m "x"')), null);
  assert.equal(await call(h, r, skill('s')), null);
  assert.equal(existsSync(ledgerPath(r)), false);
});
