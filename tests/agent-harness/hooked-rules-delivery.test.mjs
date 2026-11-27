// Delivery, ledger and handler (design D4, D5): the skill, slash-prompt and command moments, the
// deny-once gate, the 9000-byte capped join, the per-context ledger and every fail-open path.
// The pure cases call decide directly; the handler cases call the built handler in process with one
// state folder per agent, as the runtime gives it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ASSETS, tempRepo, until } from './helpers.mjs';

const lib = (file) => import(pathToFileURL(join(ASSETS.hookedRules, 'lib', file)).href);
const { decide, capped, promptSkill, CONTEXT_CAP } = await lib('deliver.mjs');
const { acquireLedgerLock, withLedger, readLedger, bump, COMPACTIONS_FILE } = await lib('ledger.mjs');
const { loadRules, parseRule, RULES_DIR } = await lib('rules.mjs');
const { createRuntime } = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'runtime.mjs')).href);
const { startWorker, terminateWorker } = await import(
  pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'supervisor.mjs')).href
);
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
const lockPath = (r, agent = 'main') => join(stateDirOf(r, agent), 'ledger.lock');
const storedLedger = (r, agent = 'main') => JSON.parse(readFileSync(ledgerPath(r, agent), 'utf8'));

// A lock file held by a live dispatch under another token, as the runtime leaves it while a
// concurrent event runs.
function holdLock(r, agent = 'main') {
  const path = lockPath(r, agent);
  writeFileSync(path, JSON.stringify({ token: 'held', pid: process.pid, at: Date.now() }));
  return path;
}

// Seed a lock file with a complete owner record, as acquisition publishes it.
function lockFile(token, pid = process.pid, at = Date.now()) {
  return JSON.stringify({ token, pid, at });
}

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
  assert.ok(storedLedger(r, 'main').generation >= 1, 'the root compaction bumped the generation');
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
  const held = holdLock(r);
  try {
    assert.equal(await call(h, r, shellBefore('git commit -m "x"')), null, 'the gate fails open');
    assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' });
    assert.equal(readFileSync(ledgerPath(r), 'utf8'), seeded, 'nothing is written');
  } finally {
    rmSync(held, { recursive: true, force: true });
  }
});

test('a contender paused after the dead-owner check does not displace a takeover lock', async () => {
  const r = await repo();
  const dir = stateDirOf(r);
  mkdirSync(dir, { recursive: true });
  const path = lockPath(r);
  writeFileSync(path, lockFile('dead', 999999999));
  let checked;
  const atCheck = new Promise((resolve) => (checked = resolve));
  let resume;
  const paused = new Promise((resolve) => (resume = resolve));
  const first = acquireLedgerLock(dir, {
    beforeTakeOver: async () => {
      checked();
      await paused;
    },
  });
  await atCheck; // the first contender saw the dead owner and stopped at the old check point
  const second = await acquireLedgerLock(dir); // another dispatch takes the dead lock over
  assert.ok(second);
  resume(); // the first contender resumes and re-checks at the rename point
  const resumed = await first;
  assert.equal(resumed, null, 'the paused contender backs off instead of renaming the new lock');
  assert.equal(second.owned(), true, 'exactly one dispatch holds the lock');
  second.release();
  assert.equal(existsSync(path), false);
});

test('a delayed contender discards a displaced fresh lock instead of restoring it', async () => {
  const r = await repo();
  const dir = stateDirOf(r);
  mkdirSync(dir, { recursive: true });
  const path = lockPath(r);
  writeFileSync(path, lockFile('dead', 999999999));
  let checked;
  const atCheck = new Promise((resolve) => (checked = resolve));
  let resume;
  const paused = new Promise((resolve) => (resume = resolve));
  const delayed = acquireLedgerLock(dir, {
    // Pause between the final dead-owner re-check and the rename, the window the review found.
    beforeRename: async () => {
      checked();
      await paused;
    },
  });
  await atCheck;
  const winner = await acquireLedgerLock(dir); // takes the dead lock over and publishes a fresh one
  assert.ok(winner);
  resume(); // the delayed contender now renames the winner's lock
  assert.equal(await delayed, null, 'the delayed contender does not claim the fresh lock');
  assert.equal(existsSync(path), false, 'the displaced fresh lock is discarded, never restored');
  assert.deepEqual(
    readdirSync(dir).filter((name) => name.startsWith('ledger.lock.')),
    [],
    'the removed artifact is unlinked, not left behind',
  );
  assert.equal(winner.owned(), false, 'the winner no longer owns the canonical path');
  winner.release(); // releasing without a matching token does nothing
  assert.equal(existsSync(path), false, 'a release cannot resurrect a spent lock');
  // No spent lock waits on the path, so a later dispatch acquires at once instead of timing out.
  const next = await acquireLedgerLock(dir);
  assert.ok(next);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).token, next.token);
  next.release();
  assert.equal(existsSync(path), false);
});

test('a dispatch paused before its lock is linked never exposes an ownerless lock', async () => {
  const r = await repo();
  const dir = stateDirOf(r);
  mkdirSync(dir, { recursive: true });
  const path = lockPath(r);
  let reached;
  const atLink = new Promise((resolve) => (reached = resolve));
  let resume;
  const paused = new Promise((resolve) => (resume = resolve));
  const first = acquireLedgerLock(dir, {
    beforeLink: async () => {
      reached();
      await paused;
    },
  });
  await atLink;
  assert.equal(existsSync(path), false, 'the lock path does not exist before its owner record is linked');
  const second = await acquireLedgerLock(dir); // acquires while the first has published nothing
  assert.ok(second);
  resume();
  assert.equal(await first, null, 'the first cannot publish over the live lock and fails open');
  assert.equal(second.owned(), true);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).token, second.token);
  second.release();
});

test('a stray FIFO on the lock path is taken over without being read', async (t) => {
  const r = await repo();
  const dir = stateDirOf(r);
  mkdirSync(dir, { recursive: true });
  try {
    execFileSync('mkfifo', [lockPath(r)], { stdio: 'ignore' });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      t.skip('mkfifo is unavailable');
      return;
    }
    throw error;
  }
  // A writerless FIFO blocks a synchronous owner-record read forever. The child is killed by the
  // timeout, so a regression fails this test instead of hanging the runner.
  const url = pathToFileURL(join(ASSETS.hookedRules, 'lib', 'ledger.mjs')).href;
  const script = `
    import { existsSync } from 'node:fs';
    const { acquireLedgerLock } = await import(${JSON.stringify(url)});
    const dir = ${JSON.stringify(dir)};
    const lock = await acquireLedgerLock(dir);
    if (lock === null) process.exit(2);
    lock.release();
    if (existsSync(dir + '/ledger.lock')) process.exit(3);
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(existsSync(lockPath(r)), false, 'the stray artifact is unlinked, not left behind');
});

test('a dead holder is taken over at once and a live one is never taken over by age', async () => {
  const r = await repo();
  const dir = stateDirOf(r);
  mkdirSync(dir, { recursive: true });
  const path = lockPath(r);
  // A slow live holder keeps its lock however old the owner record is: an hour-old timestamp would
  // be long past any age-based takeover, so reintroducing one fails this test.
  writeFileSync(path, lockFile('slow', process.pid, Date.now() - 3600_000));
  assert.equal(await acquireLedgerLock(dir), null, 'a live holder is waited for, not taken over');
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).token, 'slow');
  unlinkSync(path);
  // A crashed holder leaves a dead pid, which is the only takeover path.
  writeFileSync(path, lockFile('dead', 999999999));
  const lock = await acquireLedgerLock(dir);
  assert.ok(lock);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).token, lock.token);
  lock.release();
});

test('a dispatch whose lock is taken over before its write records nothing', async () => {
  const r = await repo();
  const dir = stateDirOf(r);
  mkdirSync(dir, { recursive: true });
  const path = lockPath(r);
  const value = await withLedger(dir, (ledger) => {
    // Another dispatch takes the lock over between this dispatch's read and its write.
    renameSync(path, `${path}.taken`);
    writeFileSync(path, lockFile('other'));
    return { ledger: { ...ledger, reported: ['late'] }, value: 'decided' };
  });
  assert.equal(value, null, 'the write is refused and the call fails open');
  assert.equal(existsSync(ledgerPath(r)), false);
  rmSync(`${path}.taken`, { force: true });
  rmSync(path, { force: true });
});

test('a compaction logged between a holder read and its write stays void', async () => {
  const r = await repo({ '.agents/hooked-rules/apply.md': RULE('skills: ["s"]', 'Apply.\n') });
  assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' });
  const dir = stateDirOf(r);
  const value = await withLedger(dir, (ledger) => {
    // The compaction lands after this dispatch read the ledger.
    appendFileSync(join(dir, COMPACTIONS_FILE), `${Date.now()}\n`);
    return { ledger: { ...ledger, reported: ['late'] }, value: 'decided' };
  });
  assert.equal(value, 'decided');
  const reread = readLedger(dir);
  assert.ok(reread.generation > reread.entries['apply.md'].generation, 'the delivered entry is void');
  assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' }, 'the rule delivers again');
});

test('a delayed older compaction cannot revive an entry a newer one voided', async () => {
  const r = await repo({ '.agents/hooked-rules/apply.md': RULE('skills: ["s"]', 'Apply.\n') });
  const dir = stateDirOf(r);
  assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' });
  // A newer compaction completes, then a delayed older one lands: the generation is a line count, so
  // no timestamp can lower the cutoff.
  writeFileSync(join(dir, COMPACTIONS_FILE), '2000000000000\n');
  appendFileSync(join(dir, COMPACTIONS_FILE), '1000000000000\n');
  assert.equal(readLedger(dir).generation, 2, 'both lines count');
  assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' }, 'the entry stays void');
});

test('a compaction logged by bump voids the delivered entry', async () => {
  const r = await repo({ '.agents/hooked-rules/apply.md': RULE('skills: ["s"]', 'Apply.\n') });
  assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' });
  const dir = stateDirOf(r);
  await bump(dir);
  assert.equal(readLedger(dir).generation, 1, 'one logged compaction');
  assert.ok(readLedger(dir).generation > storedLedger(r).entries['apply.md'].generation);
  assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' }, 'the rule delivers again');
});

test('a compaction advances the generation while a ledger operation still waits for its lock', async () => {
  const r = await repo();
  const dir = stateDirOf(r);
  mkdirSync(dir, { recursive: true });
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  // The ledger operation is waiting on its runtime lock, so its in-process queue turn is still open.
  const pending = withLedger(dir, (ledger) => ({ ledger, value: 'decided' }), {
    lock: { acquire: () => blocked },
  });
  try {
    let done = false;
    const bumped = bump(dir, { deadline: Date.now() + 5000 }).then(() => {
      done = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(done, true, 'bump does not wait behind the ledger queue');
    assert.equal(readLedger(dir).generation, 1, 'the compaction advanced the generation');
    await bumped;
  } finally {
    release(null);
    await pending;
  }
});

// A minimal worker tool that runs the shipped ledger through the supervisor-owned context lock: one
// event blocks inside the ledger operation, the next records a value.
const LOCKER_URL = pathToFileURL(join(ASSETS.hookedRules, 'lib', 'ledger.mjs')).href;
const LOCKER = `
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withLedger } from ${JSON.stringify(LOCKER_URL)};
export default {
  name: 'locker',
  events: ['turn.end'],
  async handle(event, ctx) {
    if (event.hold) {
      await withLedger(ctx.stateDir, () => {
        writeFileSync(join(ctx.stateDir, 'held'), 'held');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);
        return null;
      }, { lock: ctx.lock });
      return null;
    }
    const value = await withLedger(ctx.stateDir, (ledger) => ({
      ledger: { ...ledger, reported: ['replacement'] },
      value: 'wrote',
    }), { lock: ctx.lock });
    return { context: String(value) };
  },
};
`;

test('a retired worker releases its ledger lock so a replacement worker can write', async () => {
  const r = await repo();
  const stateDir = stateDirOf(r);
  mkdirSync(stateDir, { recursive: true });
  const toolDir = join(r.dir, '.agents', 'harness', 'locker');
  mkdirSync(toolDir, { recursive: true });
  writeFileSync(join(toolDir, 'handler.mjs'), LOCKER);

  const first = await startWorker(toolDir, { tool: 'locker' });
  const [gen] = first.workerGens();
  const held = first.handle({ type: 'turn.end', hold: true }, context(r, { stateDir })).catch(() => {});
  try {
    await until(() => existsSync(join(stateDir, 'held')), 10000, 'the first worker holds the ledger lock');
    // Retiring the generation terminates the blocked worker and releases the lock it held. The host
    // pid of the worker is the test process's, so a pid-keyed local lock would stay live forever.
    await terminateWorker(gen);
    const second = await startWorker(toolDir, { tool: 'locker' });
    try {
      const out = await second.handle({ type: 'turn.end' }, context(r, { stateDir, deadline: Date.now() + 10000 }));
      assert.deepEqual(out, { context: 'wrote' });
      assert.deepEqual(readLedger(stateDir).reported, ['replacement']);
    } finally {
      await second.close();
    }
  } finally {
    await first.close();
    await held;
  }
});

test('a denial recorded after a compaction is confirmed by its retry in the same generation', async () => {
  const r = await repo({ '.agents/hooked-rules/commit.md': RULE(`gates: ["${COMMIT_FILE}"]`, 'Commit types.\n') });
  // Pin the clock: the compaction, the denial and the retry all land in the same millisecond, so an
  // equal-timestamp regression would turn the retry into a second denial.
  const real = Date.now;
  const frozen = real.call(Date);
  Date.now = () => frozen;
  try {
    await call(h, r, compact());
    assert.deepEqual(await call(h, r, shellBefore('git commit -m "x"')), { deny: 'Commit types.' });
    assert.equal(storedLedger(r).entries['commit.md'].generation, 1, 'recorded at the post-compaction generation');
    assert.equal(await call(h, r, shellBefore('git commit -m "y"')), null, 'the retry in the same generation passes');
    assert.equal(storedLedger(r).entries['commit.md'].state, 'delivered');
  } finally {
    Date.now = real;
  }
});

test('release removes only a lock it still owns', async () => {
  const r = await repo();
  const lock = await acquireLedgerLock(stateDirOf(r));
  assert.ok(lock);
  // Another dispatch takes the lock over: the file is renamed away and a new owner claims the path.
  renameSync(lock.path, `${lock.path}.taken`);
  writeFileSync(lock.path, lockFile('other'));
  lock.release();
  assert.ok(existsSync(lock.path), 'the new owner keeps its lock');
  rmSync(`${lock.path}.taken`, { force: true });
  rmSync(lock.path, { force: true });
});

test('a broken ledger.json is left alone by an aborted startup', async () => {
  const r = await repo();
  mkdirSync(stateDirOf(r), { recursive: true });
  writeFileSync(ledgerPath(r), '{ not json');
  const controller = new AbortController();
  controller.abort();
  assert.equal(await call(h, r, sessionStart(), { signal: controller.signal }), null);
  assert.equal(readFileSync(ledgerPath(r), 'utf8'), '{ not json');
});

test('a broken ledger.json is repaired by an event that records nothing', async () => {
  const r = await repo({ '.agents/hooked-rules/commit.md': RULE(`gates: ["${COMMIT_FILE}"]`, 'Commit types.\n') });
  mkdirSync(stateDirOf(r), { recursive: true });
  writeFileSync(ledgerPath(r), '{ not json');
  assert.equal(await call(h, r, shellAfter('echo hi')), null);
  const stored = storedLedger(r);
  assert.equal(stored.version, 1);
  assert.equal(stored.generation, 0);
  assert.deepEqual(stored.entries, {});
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
  const held = holdLock(r);
  try {
    assert.equal(await call(h, r, sessionStart()), null, 'no report without the lock');
  } finally {
    rmSync(held, { recursive: true, force: true });
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

test('a compaction logs only a timestamp sampled before its final deadline check', async () => {
  for (const event of [compact(), sessionStart(true)]) {
    const r = await repo({ '.agents/hooked-rules/apply.md': RULE('skills: ["s"]', 'Apply.\n') });
    assert.deepEqual(await call(h, r, skill('s')), { context: 'Apply.' });
    const before = readFileSync(ledgerPath(r), 'utf8');
    const real = Date.now;
    const start = real.call(Date);
    // First check, the value sampled for the payload and final check, then a re-read the old code
    // made after the check. The deadline sits between the sampled value and that late re-read.
    const stamps = [start, start + 10, start + 99];
    let reads = 0;
    Date.now = () => stamps[Math.min(reads++, stamps.length - 1)];
    try {
      assert.equal(await call(h, r, event, { deadline: start + 50 }), null);
    } finally {
      Date.now = real;
    }
    const lines = readFileSync(join(stateDirOf(r), COMPACTIONS_FILE), 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '');
    assert.deepEqual(lines, [String(start + 10)], `${event.type} logged the sampled time, never a later one`);
    assert.equal(readFileSync(ledgerPath(r), 'utf8'), before, `${event.type} wrote no ledger`);
  }
});

test('an expired startup stops at its final guard instead of repairing a corrupt ledger', async () => {
  const r = await repo(); // no rule files, so there is no fresh issue to report
  const real = Date.now;
  const reset = () => {
    mkdirSync(stateDirOf(r), { recursive: true });
    writeFileSync(ledgerPath(r), '{ not json');
  };

  // Count the clock reads of a repairing startup. The last one is the final guard before the write.
  reset();
  let reads = 0;
  Date.now = () => {
    reads += 1;
    return real.call(Date);
  };
  try {
    assert.equal(await call(h, r, sessionStart(), { deadline: real.call(Date) + 60000 }), null);
  } finally {
    Date.now = real;
  }
  assert.equal(storedLedger(r).version, 1, 'the far-deadline startup repaired the corrupt ledger');

  // Now every read but the final guard is early, so the deadline passes inside the write section.
  reset();
  let calls = 0;
  const start = real.call(Date);
  Date.now = () => {
    calls += 1;
    return calls < reads - 1 ? start : start + 100;
  };
  try {
    assert.equal(await call(h, r, sessionStart(), { deadline: start + 50 }), null);
  } finally {
    Date.now = real;
  }
  assert.equal(calls, reads - 1, 'the call reached the final guard, the only read past the deadline');
  assert.equal(readFileSync(ledgerPath(r), 'utf8'), '{ not json', 'the expiry stopped the repair');
});

test('an unreadable rules folder fails open with the manual notice at the next session start', async (t) => {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('root reads a 0o000 folder');
    return;
  }
  const r = await repo({ '.agents/hooked-rules/a.md': RULE('skills: ["s"]', 'A.\n') });
  const dir = join(r.dir, '.agents', 'hooked-rules');
  chmodSync(dir, 0o000);
  try {
    await assert.rejects(call(h, r, sessionStart()), /\.agents\/hooked-rules cannot be read/);
    const out = await createRuntime({ repoRoot: r.dir, host: 'claude-code', handlers: [h] }).dispatch(sessionStart(), {
      sessionId: 's1',
      agentId: 'main',
    });
    assert.equal(out.outcomes['hooked-rules'], 'failed');
    assert.match(out.notices[0], /\.agents\/hooked-rules cannot be read/);
    assert.ok(out.notices[0].includes(h.manual), 'the notice names the hand-read manual');
  } finally {
    chmodSync(dir, 0o755);
  }
});

test('a rules path that is not a directory rejects so every event fails open with the manual notice', async () => {
  const r = await repo();
  mkdirSync(join(r.dir, '.agents'), { recursive: true });
  writeFileSync(join(r.dir, RULES_DIR), 'not a directory\n');
  for (const event of [skill('s'), shellBefore('git commit -m "x"'), prompt('/s'), sessionStart()]) {
    await assert.rejects(call(h, r, event), /\.agents\/hooked-rules is not a directory/, event.type);
  }
  const out = await createRuntime({ repoRoot: r.dir, host: 'claude-code', handlers: [h] }).dispatch(skill('s'), {
    sessionId: 's1',
    agentId: 'main',
  });
  assert.equal(out.deny, undefined, 'the host call is not denied');
  assert.equal(out.outcomes['hooked-rules'], 'failed');
  assert.match(out.notices[0], /\.agents\/hooked-rules is not a directory/);
  assert.ok(out.notices[0].includes(h.manual), 'the fail-open notice names the hand-read manual');
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

// This repository onboards its own rules (design D9, "This repository delivers hooked rules").
test("this repository's rules load and its harness command matches build and update", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { rules, errors } = loadRules(repoRoot);
  assert.deepEqual(errors, []);
  const tools = rules.find((rule) => rule.name === 'repo-harness-tools.md');
  assert.ok(tools, 'repo-harness-tools.md loads');
  const [pattern] = tools.commands;
  assert.equal(pattern.regex.test('pnpm run build'), true);
  assert.equal(pattern.regex.test('pnpm harness:update'), true);
  assert.equal(pattern.regex.test('pnpm run build:check'), false);
});
