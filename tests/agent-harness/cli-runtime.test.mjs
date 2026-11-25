// hook-runtime cli.mjs (design D6 install/update/check, D3 capability report), spawned against temp
// repos, plus the capability check at session.start with a stubbed capability table.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { appendFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, fakeOpencodeCtx, runNode, tempRepo } from './helpers.mjs';

const lib = (f) => import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', f)).href);
const { HOST_CAPABILITIES, EVENT_NEEDS, missingCapabilities } = await lib('capabilities.mjs');
const { CLAUDE_EVENTS } = await lib('claude-adapter.mjs');
const { createOpencodePlugin } = await lib('opencode-adapter.mjs');
const { createRuntime } = await lib('runtime.mjs');

const CLI = join(ASSETS.hookRuntime, 'cli.mjs');
const COMMAND = 'node "$CLAUDE_PROJECT_DIR/.agents/harness/hook-runtime/claude.mjs"';
const PLUGIN = './.agents/harness/hook-runtime/opencode';

const cleanups = [];
after(async () => { for (const c of cleanups.reverse()) await c(); });

async function repo(files) {
  const r = await tempRepo({ files });
  cleanups.push(r.cleanup);
  return r;
}

const cli = (r, ...args) => runNode(CLI, [...args, '--repo', r.dir], { cwd: r.dir });
const installed = (r, ...args) => runNode(join(r.dir, '.agents', 'harness', 'hook-runtime', 'cli.mjs'), args, { cwd: r.dir });
const json = (r, rel) => JSON.parse(readFileSync(join(r.dir, rel), 'utf8'));

// Every file outside .git, with its bytes.
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (d === dir && name === '.git') continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(dir, p)] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

test('install in a temp repo writes the folder, lock, harness section and both host configs', async () => {
  const r = await repo();
  const out = await cli(r, 'install');
  assert.equal(out.code, 0, out.stderr + out.stdout);
  const lock = json(r, '.agents/harness/lock.json');
  assert.ok(lock.tools['hook-runtime'].files['cli.mjs']);
  assert.ok(lock.tools['hook-runtime'].files['opencode/index.mjs']);
  assert.deepEqual(json(r, '.agents/harness.json'), { 'hook-runtime': {} });
  const settings = json(r, '.claude/settings.json');
  assert.deepEqual(Object.keys(settings.hooks).sort(), Object.keys(CLAUDE_EVENTS).sort());
  for (const [event, timeout] of Object.entries(CLAUDE_EVENTS)) {
    assert.deepEqual(settings.hooks[event], [{ hooks: [{ type: 'command', command: COMMAND, timeout }] }]);
  }
  assert.deepEqual(json(r, 'opencode.json'), { plugins: [PLUGIN] });
  const before = snapshot(r.dir);
  const again = await cli(r, 'install');
  assert.equal(again.code, 0, again.stderr);
  assert.deepEqual(snapshot(r.dir), before, 'a second install changes nothing');
  const upd = await cli(r, 'update');
  assert.equal(upd.code, 0, upd.stderr);
  assert.deepEqual(snapshot(r.dir), before, 'update of the same version changes nothing');
});

for (const mode of ['install', 'update']) {
  test(`${mode}: foreign hook entries kept`, async () => {
    const foreign = { matcher: 'Bash', hooks: [{ type: 'command', command: 'other-tool' }] };
    const r = await repo({
      '.claude/settings.json': JSON.stringify({ enabledPlugins: { x: true }, hooks: { PreToolUse: [foreign] } }),
      'opencode.json': JSON.stringify({ $schema: 's', plugins: ['other'] }),
    });
    const out = await cli(r, mode);
    assert.equal(out.code, 0, out.stderr + out.stdout);
    const s = json(r, '.claude/settings.json');
    assert.deepEqual(s.enabledPlugins, { x: true });
    assert.deepEqual(s.hooks.PreToolUse[0], foreign);
    assert.equal(s.hooks.PreToolUse.length, 2);
    assert.equal(s.hooks.PreToolUse[1].hooks[0].command, COMMAND);
    assert.deepEqual(json(r, 'opencode.json'), { $schema: 's', plugins: ['other', PLUGIN] });
  });

  test(`${mode}: an edited copy refused`, async () => {
    const r = await repo();
    assert.equal((await cli(r, 'install')).code, 0);
    appendFileSync(join(r.dir, '.agents/harness/hook-runtime/claude.mjs'), '// edited\n');
    const before = snapshot(r.dir);
    const out = await cli(r, mode);
    assert.notEqual(out.code, 0);
    assert.match(out.stdout + out.stderr, /claude\.mjs/);
    assert.match(out.stdout + out.stderr, /git checkout --/);
    assert.deepEqual(snapshot(r.dir), before);
  });

  test(`${mode}: an unknown own key rejected`, async () => {
    const r = await repo({ '.agents/harness.json': JSON.stringify({ 'hook-runtime': { colour: 1 } }) });
    const before = snapshot(r.dir);
    const out = await cli(r, mode);
    assert.notEqual(out.code, 0);
    assert.match(out.stdout + out.stderr, /colour/);
    assert.deepEqual(snapshot(r.dir), before);
  });

  test(`${mode}: a foreign top-level key ignored`, async () => {
    const r = await repo({ '.agents/harness.json': JSON.stringify({ 'other-tool': { x: 1 }, 'hook-runtime': { deadlines: { 'tool.after': 9000 } } }) });
    const out = await cli(r, mode);
    assert.equal(out.code, 0, out.stderr + out.stdout);
    assert.doesNotMatch(out.stdout + out.stderr, /other-tool/);
    assert.deepEqual(json(r, '.agents/harness.json'), { 'other-tool': { x: 1 }, 'hook-runtime': { deadlines: { 'tool.after': 9000 } } });
    const check = await installed(r, 'check');
    assert.equal(check.code, 0, check.stderr + check.stdout);
    assert.doesNotMatch(check.stdout + check.stderr, /other-tool/);
  });

  test(`${mode}: a JSONC settings file is refused and nothing changes`, async () => {
    const r = await repo({ '.claude/settings.json': '{\n  // mine\n  "hooks": {}\n}\n' });
    const before = snapshot(r.dir);
    const out = await cli(r, mode);
    assert.notEqual(out.code, 0);
    assert.match(out.stdout + out.stderr, /claude\.mjs/, 'names the entry to add by hand');
    assert.deepEqual(snapshot(r.dir), before);
  });
}

test('install refuses outside a git work tree', async () => {
  const r = await repo();
  const out = await runNode(CLI, ['install', '--repo', join(r.dir, '.git')], { cwd: r.dir });
  assert.notEqual(out.code, 0);
  assert.match(out.stdout + out.stderr, /git work tree/);
});

test('check passes, then fails after editing claude.mjs', async () => {
  const r = await repo();
  assert.equal((await cli(r, 'install')).code, 0);
  const ok = await installed(r, 'check');
  assert.equal(ok.code, 0, ok.stderr + ok.stdout);
  appendFileSync(join(r.dir, '.agents/harness/hook-runtime/claude.mjs'), '// edited\n');
  const bad = await installed(r, 'check');
  assert.equal(bad.code, 1);
  assert.match(bad.stdout + bad.stderr, /claude\.mjs differs from the lock/);
});

test('check fails on an unknown own key and names it', async () => {
  const r = await repo();
  assert.equal((await cli(r, 'install')).code, 0);
  await r.write('.agents/harness.json', JSON.stringify({ 'hook-runtime': { colour: 1 } }));
  const bad = await installed(r, 'check');
  assert.equal(bad.code, 1);
  assert.match(bad.stdout + bad.stderr, /colour/);
});

test('capabilities prints both hosts and five rows each', async () => {
  const r = await repo();
  assert.equal((await cli(r, 'install')).code, 0);
  const out = await installed(r, 'capabilities');
  assert.equal(out.code, 0, out.stderr);
  const lines = out.stdout.split('\n');
  for (const [host, version] of [['claude-code', '2.1.332'], ['opencode', '2.4.1']]) {
    const at = lines.findIndex((l) => l.startsWith(host));
    assert.ok(at >= 0, `${host} header`);
    assert.match(lines[at], new RegExp(`verified on ${version.replaceAll('.', '\\.')}`));
    const rows = lines.slice(at + 1, at + 6);
    assert.deepEqual(rows.map((l) => l.trim().split(/\s+/)[0]),
      ['deny', 'contextAfterTool', 'blockTurnEnd', 'redeliverAfterCompact', 'perSubagentState']);
    for (const row of rows) assert.match(row, /supported$/);
  }
  assert.match(out.stdout, /need a missing capability: none/);
});

test('HOST_CAPABILITIES and EVENT_NEEDS are the verified table', () => {
  const all = { deny: true, contextAfterTool: true, blockTurnEnd: true, redeliverAfterCompact: true, perSubagentState: true };
  assert.deepEqual(HOST_CAPABILITIES, {
    'claude-code': { ...all, verified: '2.1.332' },
    opencode: { ...all, verified: '2.4.1' },
  });
  assert.deepEqual(EVENT_NEEDS, {
    'tool.before': 'deny', 'tool.after': 'contextAfterTool', 'turn.end': 'blockTurnEnd', 'session.start': 'redeliverAfterCompact',
  });
  assert.deepEqual(missingCapabilities('opencode', [{ name: 'h', events: ['turn.end', 'tool.before'] }]), []);
});

test('the capabilities check at session.start lists a capability that a handler needs and the host lacks', async () => {
  const stub = {
    ...HOST_CAPABILITIES,
    opencode: { ...HOST_CAPABILITIES.opencode, blockTurnEnd: false },
    'claude-code': { ...HOST_CAPABILITIES['claude-code'], contextAfterTool: false },
  };
  const handler = { name: 'needy', events: ['turn.end', 'tool.after', 'session.start'], handle: () => null };
  const lines = missingCapabilities('opencode', [handler], stub);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /needy needs blockTurnEnd for turn\.end, which opencode lacks/);

  const r = await repo();
  const f = fakeOpencodeCtx(r.dir, { sessions: { s1: { id: 's1' } } });
  const plugin = createOpencodePlugin({
    runtimeFactory: async ({ repoRoot, host }) => createRuntime({ repoRoot, host, handlers: [handler] }),
    capabilities: stub,
  });
  cleanups.push(await plugin.setup(f.ctx));
  const input = { sessionID: 's1', system: [], messages: [] };
  await f.hooks['session.context'](input);
  assert.equal(input.system.length, 1);
  assert.match(input.system[0].text, /needy needs blockTurnEnd for turn\.end, which opencode lacks/);

  // Claude Code: SessionStart gets the same line, from installed handlers.
  const r2 = await repo();
  const { installTool } = await lib('install.mjs');
  const src = join(r2.dir, '.git', 'src-needy');
  await r2.write('.git/src-needy/tool.json', JSON.stringify({ name: 'needy', version: '0.1.0', handler: true }));
  await r2.write('.git/src-needy/handler.mjs', "export default { name: 'needy', events: ['tool.after'], handle: () => null };\n");
  assert.equal(installTool({ sourceDir: src, repoRoot: r2.dir }).code, 0);
  const payload = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'claude', 'SessionStart-startup.json'), 'utf8').replaceAll('/REPO', r2.dir));
  // main() leaves the handler's worker running, so it runs in a child process that exits itself.
  await r2.write('.git/run-main.mjs', [
    `import { main } from ${JSON.stringify(pathToFileURL(join(ASSETS.hookRuntime, 'claude.mjs')).href)};`,
    `const stub = ${JSON.stringify(stub)};`,
    'const chunks = []; for await (const c of process.stdin) chunks.push(c);',
    `const res = await main({ stdin: Buffer.concat(chunks).toString(), env: { CLAUDE_PROJECT_DIR: ${JSON.stringify(r2.dir)} }, capabilities: stub });`,
    'process.stdout.write(res.text, () => process.exit(0));',
  ].join('\n'));
  const res = await runNode(join(r2.dir, '.git', 'run-main.mjs'), [], { cwd: r2.dir, input: JSON.stringify(payload) });
  assert.equal(res.code, 0, res.stderr);
  assert.match(JSON.parse(res.stdout).hookSpecificOutput.additionalContext, /needy needs contextAfterTool for tool\.after, which claude-code lacks/);
});
