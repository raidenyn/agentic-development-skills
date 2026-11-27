// Claude Code adapter (design D2 tool kinds, D3 event mapping and result delivery): pure mapping
// against the recorded fixtures, and the spawned claude.mjs entry against inline test handlers.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, runNode, tempRepo } from './helpers.mjs';

const { CLAUDE_EVENTS, toEvent, toOutput } = await import(
  pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'claude-adapter.mjs')).href
);
const { installTool } = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'install.mjs')).href);

const CLAUDE_MJS = join(ASSETS.hookRuntime, 'claude.mjs');
const FIXTURES = join(import.meta.dirname, 'fixtures', 'claude');
const REPO = '/tmp/agent-harness-fixture-repo';
const fixture = (name, root = REPO) =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8').replaceAll('/REPO', root));

const cleanups = [];
after(async () => {
  for (const c of cleanups) await c();
});

test('CLAUDE_EVENTS lists every event with its host timeout in seconds', () => {
  assert.deepEqual(CLAUDE_EVENTS, {
    PreToolUse: 10,
    PostToolUse: 1800,
    PostToolUseFailure: 1800,
    UserPromptSubmit: 10,
    Stop: 1800,
    SubagentStop: 1800,
    PreCompact: 10,
    SessionStart: 10,
  });
});

const SUB = 'acce120c0d6e8559b';
const expected = {
  'PostToolUse-Agent': { type: 'tool.after', kind: 'other', agentId: 'main' },
  'PostToolUse-Bash-agent': { type: 'tool.after', kind: 'shell', agentId: SUB },
  'PostToolUse-Bash': { type: 'tool.after', kind: 'shell', agentId: 'main', command: 'echo hi' },
  'PostToolUse-Edit-tick': {
    type: 'tool.after',
    kind: 'edit',
    agentId: 'main',
    files: ['openspec/changes/x/tasks.md'],
  },
  'PostToolUse-Edit': { type: 'tool.after', kind: 'edit', agentId: 'main', files: ['README.md'] },
  'PostToolUse-Read': { type: 'tool.after', kind: 'read', agentId: 'main' },
  'PostToolUse-Write-agent': { type: 'tool.after', kind: 'edit', agentId: SUB, files: ['notes2.md'] },
  PreCompact: { type: 'compact', agentId: 'main' },
  'PreToolUse-Agent': { type: 'tool.before', kind: 'other', agentId: 'main' },
  'PreToolUse-Bash-agent': { type: 'tool.before', kind: 'shell', agentId: SUB },
  'PreToolUse-Bash': { type: 'tool.before', kind: 'shell', agentId: 'main', command: 'echo HARNESS_DENY' },
  'PreToolUse-Edit': { type: 'tool.before', kind: 'edit', agentId: 'main', files: ['README.md'] },
  'PreToolUse-Read': { type: 'tool.before', kind: 'read', agentId: 'main' },
  'PreToolUse-Write-agent': { type: 'tool.before', kind: 'edit', agentId: SUB, files: ['notes2.md'] },
  'SessionStart-compact': { type: 'session.start', agentId: 'main', afterCompact: true },
  'SessionStart-resume': { type: 'session.start', agentId: 'main', afterCompact: false },
  'SessionStart-startup': { type: 'session.start', agentId: 'main', afterCompact: false },
  'Stop-active': { type: 'turn.end', agentId: 'main', background: 1 },
  Stop: { type: 'turn.end', agentId: 'main', background: 1 },
  'SubagentStop-agent': { type: 'turn.end', agentId: SUB },
  UserPromptSubmit: { type: 'prompt', agentId: 'main' },
};

test('every recorded fixture has an expectation', () => {
  const names = readdirSync(FIXTURES)
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
  assert.deepEqual(names, [...Object.keys(expected), 'SubagentStop-agent-internal'].sort());
});

for (const [name, want] of Object.entries(expected)) {
  test(`toEvent ${name}`, () => {
    const payload = fixture(name);
    const r = toEvent(payload, REPO);
    assert.ok(r, 'mapped');
    assert.equal(r.sessionId, payload.session_id);
    assert.equal(r.agentId, want.agentId);
    assert.equal(r.event.type, want.type);
    assert.equal(r.event.host, 'claude-code');
    if (want.kind) {
      assert.deepEqual(r.event.tool, {
        name: payload.tool_name,
        kind: want.kind,
        input: payload.tool_input,
        callId: payload.tool_use_id,
      });
      if (want.kind === 'edit') assert.deepEqual(r.event.files, want.files);
      else assert.equal(r.event.files, undefined);
      if (want.kind === 'shell') assert.equal(r.event.command, payload.tool_input.command);
    } else {
      assert.equal(r.event.tool, undefined);
    }
    if (want.command) assert.equal(r.event.command, want.command);
    if ('afterCompact' in want) assert.equal(r.event.afterCompact, want.afterCompact);
    if ('background' in want) assert.equal(r.event.background, want.background);
    if (want.type === 'prompt') assert.equal(r.event.prompt, payload.prompt);
  });
}

test('Edit file_path /REPO/README.md becomes README.md', () => {
  assert.deepEqual(toEvent(fixture('PostToolUse-Edit'), REPO).event.files, ['README.md']);
});

test('SessionStart compact sets afterCompact true', () => {
  assert.equal(toEvent(fixture('SessionStart-compact'), REPO).event.afterCompact, true);
});

test('Stop fixture has background 1', () => {
  assert.equal(toEvent(fixture('Stop'), REPO).event.background, 1);
});

test('Stop counts only running subagents and ignores stop_hook_active', () => {
  const p = fixture('Stop-active');
  p.background_tasks = [
    { id: 'a', type: 'subagent', status: 'running' },
    { id: 'b', type: 'subagent', status: 'completed' },
    { id: 'c', type: 'shell', status: 'running' },
    { id: 'd', type: 'subagent', status: 'running' },
  ];
  assert.equal(toEvent(p, REPO).event.background, 2);
  delete p.background_tasks;
  assert.equal(toEvent(p, REPO).event.background, 0);
});

test('SubagentStop does not read background_tasks', () => {
  assert.equal(toEvent(fixture('SubagentStop-agent'), REPO).event.background, 0);
});

test('SubagentStop-agent-internal gives null', () => {
  assert.equal(toEvent(fixture('SubagentStop-agent-internal'), REPO), null);
});

test('PostToolUseFailure maps to tool.after', () => {
  const p = { ...fixture('PostToolUse-Bash'), hook_event_name: 'PostToolUseFailure' };
  const r = toEvent(p, REPO);
  assert.equal(r.event.type, 'tool.after');
  assert.equal(r.event.tool.kind, 'shell');
  assert.equal(r.event.tool.callId, p.tool_use_id);
});

test('edit outside the repo is dropped from files', () => {
  const p = fixture('PostToolUse-Edit');
  p.tool_input.file_path = '/etc/hosts';
  assert.deepEqual(toEvent(p, REPO).event.files, []);
  p.tool_input.file_path = `${REPO}-other/README.md`;
  assert.deepEqual(toEvent(p, REPO).event.files, []);
});

test('tool kinds follow the design table', () => {
  const kind = (tool_name) => toEvent({ ...fixture('PreToolUse-Read'), tool_name }, REPO).event.tool.kind;
  assert.equal(kind('Bash'), 'shell');
  for (const t of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) assert.equal(kind(t), 'edit');
  for (const t of ['Read', 'Glob', 'Grep']) assert.equal(kind(t), 'read');
  for (const t of ['Agent', 'WebFetch', 'mcp__x__y']) assert.equal(kind(t), 'other');
});

test('NotebookEdit uses notebook_path', () => {
  const p = {
    ...fixture('PreToolUse-Read'),
    tool_name: 'NotebookEdit',
    tool_input: { notebook_path: `${REPO}/a/b.ipynb` },
  };
  assert.deepEqual(toEvent(p, REPO).event.files, ['a/b.ipynb']);
});

test('unknown or malformed payloads give null', () => {
  assert.equal(toEvent(null, REPO), null);
  assert.equal(toEvent({ hook_event_name: 'Notification', session_id: 's' }, REPO), null);
  assert.equal(toEvent({ hook_event_name: 'Stop' }, REPO), null);
});

test('toOutput deny at PreToolUse', () => {
  assert.deepEqual(toOutput('PreToolUse', { deny: 'no', notices: [] }), {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'no' },
  });
});

test('toOutput failure notice at PreToolUse has no permission decision', () => {
  assert.deepEqual(toOutput('PreToolUse', { notices: ['hook a failed on tool.before: x. Do this step by hand.'] }), {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'hook a failed on tool.before: x. Do this step by hand.',
    },
  });
});

test('toOutput context on the model channels', () => {
  for (const ev of ['PostToolUse', 'PostToolUseFailure', 'UserPromptSubmit', 'SessionStart']) {
    assert.deepEqual(toOutput(ev, { context: 'ctx', notices: ['n1', 'n1', 'n2'] }), {
      hookSpecificOutput: { hookEventName: ev, additionalContext: 'ctx\n\nn1\n\nn2' },
    });
  }
});

test('toOutput block and notice at Stop and SubagentStop', () => {
  for (const ev of ['Stop', 'SubagentStop']) {
    assert.deepEqual(toOutput(ev, { block: 'fix it', notices: [] }), { decision: 'block', reason: 'fix it' });
    assert.deepEqual(toOutput(ev, { notices: ['n'] }), { systemMessage: 'n' });
    assert.deepEqual(toOutput(ev, { context: 'c', notices: [] }), { systemMessage: 'c' });
  }
});

test('toOutput gives null when there is nothing to say, and always at PreCompact', () => {
  assert.equal(toOutput('PostToolUse', { notices: [] }), null);
  assert.equal(toOutput('PreCompact', { notices: ['n'] }), null);
});

// ---- spawned claude.mjs -------------------------------------------------------------------------

async function repoWithHandler(source, { name = 'test-handler' } = {}) {
  const r = await tempRepo();
  cleanups.push(r.cleanup);
  const src = join(r.dir, '.git', `src-${name}`);
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'tool.json'), JSON.stringify({ name, version: '0.1.0', handler: true }));
  writeFileSync(join(src, 'handler.mjs'), source);
  assert.equal(installTool({ sourceDir: src, repoRoot: r.dir }).code, 0);
  return r;
}

const run = (r, payload, env = {}) =>
  runNode(CLAUDE_MJS, [], { cwd: r.dir, input: JSON.stringify(payload), env: { CLAUDE_PROJECT_DIR: r.dir, ...env } });

test('claude.mjs exits 0 with empty stdout on invalid stdin', async () => {
  const r = await tempRepo();
  cleanups.push(r.cleanup);
  const out = await runNode(CLAUDE_MJS, [], { cwd: r.dir, input: 'not json', env: { CLAUDE_PROJECT_DIR: r.dir } });
  assert.equal(out.code, 0);
  assert.equal(out.stdout, '');
});

test('with an inline test handler that denies "echo HARNESS_DENY", PreToolUse prints the deny JSON', async () => {
  const r = await repoWithHandler(
    "export default { name: 'test-handler', events: ['tool.before'],\n" +
      "  handle: (e) => e.command === 'echo HARNESS_DENY' ? { deny: 'denied ' + e.tool.kind } : null };\n",
  );
  const out = await run(r, fixture('PreToolUse-Bash', r.dir));
  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(JSON.parse(out.stdout), {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'denied shell',
    },
  });
  const other = await run(r, fixture('PreToolUse-Read', r.dir));
  assert.equal(other.code, 0);
  assert.equal(other.stdout, '');
});

test('a handler that throws at PreToolUse gives additionalContext and no permission decision', async () => {
  const r = await repoWithHandler(
    "export default { name: 'test-handler', events: ['tool.before'], manual: 'Check by hand.',\n" +
      "  handle: () => { throw new Error('boom'); } };\n",
  );
  const out = await run(r, fixture('PreToolUse-Bash', r.dir));
  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(JSON.parse(out.stdout), {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'hook test-handler failed on tool.before: boom. Check by hand.',
    },
  });
});

test('PostToolUse context reaches additionalContext with repo-relative files', async () => {
  const r = await repoWithHandler(
    "export default { name: 'test-handler', events: ['tool.after'],\n" +
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the string is shell or source text that holds ${...} on purpose
      "  handle: (e, c) => ({ context: `${e.type} ${e.tool.kind} ${e.files.join(',')} ${c.agentId}` }) };\n",
  );
  const out = await run(r, fixture('PostToolUse-Write-agent', r.dir));
  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(JSON.parse(out.stdout), {
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `tool.after edit notes2.md ${SUB}` },
  });
});

test('an inline test handler whose ack writes a file: after the spawned claude.mjs exits, the file exists', async () => {
  const r = await repoWithHandler(
    "import { writeFileSync } from 'node:fs';\nimport { join } from 'node:path';\n" +
      "export default { name: 'test-handler', events: ['turn.end'],\n" +
      "  handle: (e, c) => ({ block: 'fix it',\n" +
      "    ack: async () => { await new Promise((r) => setTimeout(r, 300)); writeFileSync(join(c.repoRoot, 'acked.txt'), 'yes'); },\n" +
      "    release: () => writeFileSync(join(c.repoRoot, 'released.txt'), 'yes') }) };\n",
  );
  const p = fixture('Stop', r.dir);
  p.background_tasks = [];
  const out = await run(r, p);
  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(JSON.parse(out.stdout), { decision: 'block', reason: 'fix it' });
  assert.equal(existsSync(join(r.dir, 'acked.txt')), true, 'ack was awaited before exit');
  assert.equal(existsSync(join(r.dir, 'released.txt')), false);
});

test('SubagentStop of the compaction agent calls no handler and prints nothing', async () => {
  const r = await repoWithHandler(
    "import { writeFileSync } from 'node:fs';\nimport { join } from 'node:path';\n" +
      "export default { name: 'test-handler', events: ['turn.end'],\n" +
      "  handle: (e, c) => { writeFileSync(join(c.repoRoot, 'called.txt'), 'yes'); return { block: 'x' }; } };\n",
  );
  const out = await run(r, fixture('SubagentStop-agent-internal', r.dir));
  assert.equal(out.code, 0, out.stderr);
  assert.equal(out.stdout, '');
  assert.equal(existsSync(join(r.dir, 'called.txt')), false);
});

test('claude.mjs exits 0 without block when harness.json is invalid', async () => {
  const r = await repoWithHandler(
    "export default { name: 'test-handler', events: ['turn.end'], handle: () => ({ block: 'fix it' }) };\n",
  );
  await r.write('.agents/harness.json', '{ not json');
  const out = await run(r, fixture('Stop', r.dir));
  assert.equal(out.code, 0, out.stderr);
  const json = JSON.parse(out.stdout);
  assert.equal(json.decision, undefined);
  assert.match(json.systemMessage, /hook test-handler failed on turn\.end: .*harness\.json/);
});

test('repeated load problems are de-duplicated within one event', async () => {
  const r = await repoWithHandler(
    "export default { name: 'test-handler', events: ['tool.after'], handle: () => null };\n",
  );
  writeFileSync(join(r.dir, '.agents/harness/test-handler/handler.mjs'), 'export default {};\n');
  const out = await run(r, fixture('PostToolUse-Bash', r.dir));
  assert.equal(out.code, 0, out.stderr);
  const text = JSON.parse(out.stdout).hookSpecificOutput.additionalContext;
  assert.match(text, /hook test-handler was not loaded: its copy differs from the lock/);
  assert.equal(text.split('was not loaded').length, 2);
});

test('the repo root falls back to payload.cwd through git when CLAUDE_PROJECT_DIR is unset', async () => {
  const r = await repoWithHandler(
    "export default { name: 'test-handler', events: ['prompt'], handle: (e, c) => ({ context: 'root ' + c.repoRoot }) };\n",
  );
  mkdirSync(join(r.dir, 'sub'), { recursive: true });
  const p = fixture('UserPromptSubmit', join(r.dir, 'sub'));
  const out = await runNode(CLAUDE_MJS, [], { cwd: '/', input: JSON.stringify(p), env: { CLAUDE_PROJECT_DIR: '' } });
  assert.equal(out.code, 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).hookSpecificOutput.additionalContext, `root ${realpathSync(r.dir)}`);
});

test('a handler that never settles at tool.after: the spawned claude.mjs prints the notice and exits 0', async () => {
  const r = await repoWithHandler(
    "export default { name: 'test-handler', events: ['tool.after'], timeouts: { 'tool.after': 300 },\n" +
      '  handle: () => new Promise(() => {}) };\n',
  );
  const out = await run(r, fixture('PostToolUse-Bash', r.dir));
  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(JSON.parse(out.stdout), {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: 'hook test-handler failed on tool.after: timed out after 300 ms. Do this step by hand.',
    },
  });
});

// ---- skill fields and tool outcome (design D1) --------------------------------------------------

async function repoWithSkillFiles() {
  const r = await tempRepo();
  cleanups.push(r.cleanup);
  await r.write('skills/x/SKILL.md', '# x\n');
  await r.write('notes/x.md', 'notes\n');
  await r.write('docs/skills/x/SKILL.md.bak', 'a backup, not a skill\n');
  mkdirSync(join(r.dir, '.claude', 'skills', 'x'), { recursive: true });
  symlinkSync('../../../skills/x/SKILL.md', join(r.dir, '.claude', 'skills', 'x', 'SKILL.md'));
  mkdirSync(join(r.dir, 'docs', 'y'), { recursive: true });
  symlinkSync('../../notes/x.md', join(r.dir, 'docs', 'y', 'SKILL.md'));
  return r;
}

test('a Skill call is kind skill with skillVia call, and carries no ok', () => {
  const p = { ...fixture('PreToolUse-Read'), tool_name: 'Skill', tool_input: { skill: 'openspec-apply-change' } };
  const r = toEvent(p, REPO);
  assert.equal(r.event.tool.kind, 'skill');
  assert.equal(r.event.skill, 'openspec-apply-change');
  assert.equal(r.event.skillVia, 'call');
  assert.equal(Object.hasOwn(r.event, 'ok'), false);
});

test('a Read of a SKILL.md carries the skill, through a symlink too; lookalikes and other read tools do not', async () => {
  const r = await repoWithSkillFiles();
  const read = (tool_name, path) =>
    toEvent({ ...fixture('PostToolUse-Read', r.dir), tool_name, tool_input: { file_path: join(r.dir, path) } }, r.dir)
      .event;
  const direct = read('Read', 'skills/x/SKILL.md');
  assert.equal(direct.tool.kind, 'read');
  assert.equal(direct.skill, 'x');
  assert.equal(direct.skillVia, 'read');
  assert.equal(read('Read', '.claude/skills/x/SKILL.md').skill, 'x');
  for (const [tool, path] of [
    ['Grep', 'skills/x/SKILL.md'],
    ['Read', 'docs/skills/x/SKILL.md.bak'],
    ['Read', 'docs/y/SKILL.md'],
    ['Read', 'skills/missing/SKILL.md'],
  ])
    assert.equal(read(tool, path).skill, undefined, `${tool} ${path}`);
});

test('tool.after carries ok: true for PostToolUse and false for PostToolUseFailure', () => {
  assert.equal(toEvent(fixture('PostToolUse-Bash'), REPO).event.ok, true);
  const failed = { ...fixture('PostToolUse-Bash'), hook_event_name: 'PostToolUseFailure' };
  assert.equal(toEvent(failed, REPO).event.ok, false);
  assert.equal(Object.hasOwn(toEvent(fixture('PreToolUse-Bash'), REPO).event, 'ok'), false);
});
