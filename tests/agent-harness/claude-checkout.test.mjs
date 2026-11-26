// The Claude Code entry follows the agent's checkout (design D1, D2 of the follow-agent-checkout
// change): a `cwd` in a linked worktree of the session's repository is served by that worktree's own
// copy; other checkouts pass silently; the session's own checkout keeps CLAUDE_PROJECT_DIR as given.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { ASSETS, linkedWorktree, runNode, tempRepo } from './helpers.mjs';
import { installBoth, verifyRepo } from './verify-helpers.mjs';

const { installTool } = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'install.mjs')).href);

const CLAUDE_MJS = join(ASSETS.hookRuntime, 'claude.mjs');
const CLAUDE_URL = pathToFileURL(CLAUDE_MJS).href;
const FIXTURES = join(import.meta.dirname, 'fixtures', 'claude');
const fixture = (name, cwd) => {
  const p = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8').replaceAll('/REPO', cwd));
  p.cwd = cwd;
  return p;
};

const cleanups = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});
const scratch = (prefix = 'agent-harness-x-') => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

// Prints repoRoot and stateDir at `prompt`, and the edit's files at `tool.after`.
const ECHO =
  "export default { name: 'test-handler', events: ['prompt', 'tool.after'],\n" +
  "  handle: (e, c) => ({ context: e.type === 'prompt' ? 'root ' + c.repoRoot + '\\nstate ' + c.stateDir : 'files ' + e.files.join(',') }) };\n";

function installEcho(repoRoot) {
  const src = mkdtempSync(join(tmpdir(), 'agent-harness-src-'));
  cleanups.push(() => rmSync(src, { recursive: true, force: true }));
  writeFileSync(join(src, 'tool.json'), JSON.stringify({ name: 'test-handler', version: '0.1.0', handler: true }));
  writeFileSync(join(src, 'handler.mjs'), ECHO);
  assert.equal(installTool({ sourceDir: ASSETS.hookRuntime, repoRoot }).code, 0);
  assert.equal(installTool({ sourceDir: src, repoRoot }).code, 0);
}

// A committed repo with the hook runtime and the echo handler; `before` runs before the commit.
/** @param {{ before?: (r: any) => Promise<void> }} [opts] */
async function mainRepo({ before } = {}) {
  const r = await tempRepo();
  cleanups.push(r.cleanup);
  if (before) await before(r);
  installEcho(r.dir);
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'harness');
  return r;
}
async function worktreeOf(r, opts) {
  const wt = await linkedWorktree(r, opts);
  cleanups.push(wt.cleanup);
  return wt;
}

const prompt = (projectDir, cwd, env = {}) =>
  runNode(CLAUDE_MJS, [], {
    cwd: '/',
    input: JSON.stringify(fixture('UserPromptSubmit', cwd)),
    env: { CLAUDE_PROJECT_DIR: projectDir, ...env },
  });
const context = (out) => JSON.parse(out.stdout).hookSpecificOutput.additionalContext;
const rootOf = (out) => /^root (.*)$/m.exec(context(out))?.[1];
const silent = (out) => {
  assert.equal(out.code, 0, out.stderr);
  assert.equal(out.stdout, '');
};

// ---- served by the worktree's copy --------------------------------------------------------------

test("a prompt in a linked worktree is served by the worktree's copy", async () => {
  const r = await mainRepo();
  const wt = await worktreeOf(r);
  const out = await prompt(r.dir, join(wt.dir));
  assert.equal(out.code, 0, out.stderr);
  assert.equal(rootOf(out), wt.dir);
  const wtGitDir = wt.git('rev-parse', '--absolute-git-dir').trim();
  assert.ok(
    /^state (.*)$/m.exec(context(out))[1].startsWith(join(wtGitDir, 'agent-harness')),
    `state under ${wtGitDir}: ${context(out)}`,
  );
});

test('CLAUDE_PROJECT_DIR in a linked worktree and cwd in the main checkout: served by the main copy', async () => {
  const r = await mainRepo();
  const wt = await worktreeOf(r);
  const out = await prompt(wt.dir, r.dir);
  assert.equal(out.code, 0, out.stderr);
  assert.equal(rootOf(out), realpathSync(r.dir));
});

test('a delegated event resolves once: two resolution calls in total', async () => {
  const r = await mainRepo();
  const wt = await worktreeOf(r);
  await wt.write('deep/x.txt', 'x\n');
  const bin = scratch('agent-harness-bin-');
  const log = join(bin, 'git.log');
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  writeFileSync(join(bin, 'git'), `#!/bin/sh\necho "$*" >> '${log}'\nexec '${realGit}' "$@"\n`);
  chmodSync(join(bin, 'git'), 0o755);
  const out = await prompt(r.dir, join(wt.dir, 'deep'), { PATH: `${bin}:${process.env.PATH}` });
  assert.equal(out.code, 0, out.stderr);
  assert.equal(rootOf(out), wt.dir);
  const calls = readFileSync(log, 'utf8')
    .split('\n')
    .filter((l) => l.includes('--show-toplevel'));
  assert.equal(calls.length, 2, calls.join('\n'));
});

// ---- silent cases -------------------------------------------------------------------------------

test('a linked worktree without the runtime prints nothing', async () => {
  let wt;
  const r = await mainRepo({
    before: async (repo) => {
      wt = await worktreeOf(repo, { branch: 'bare' });
    },
  });
  silent(await prompt(r.dir, wt.dir));
});

test('a separate clone prints nothing', async () => {
  const r = await mainRepo();
  const clone = join(scratch(), 'clone');
  execFileSync('git', ['clone', '-q', r.dir, clone], { stdio: 'ignore' });
  silent(await prompt(r.dir, clone));
});

test('another repository prints nothing', async () => {
  const r = await mainRepo();
  const other = await mainRepo();
  silent(await prompt(r.dir, other.dir));
});

test('a folder outside any checkout prints nothing', async () => {
  const r = await mainRepo();
  silent(await prompt(r.dir, scratch()));
});

test('a worktree whose claude.mjs throws on import gives the failure notice', async () => {
  const r = await mainRepo();
  const wt = await worktreeOf(r);
  writeFileSync(join(wt.dir, '.agents', 'harness', 'hook-runtime', 'claude.mjs'), "throw new Error('boom');\n");
  const out = await prompt(r.dir, wt.dir);
  assert.equal(out.code, 0, out.stderr);
  assert.match(context(out), /^hook hook-runtime failed on prompt: boom\./);
});

// ---- guards: the session's own checkout keeps CLAUDE_PROJECT_DIR as given -----------------------

test('(guard) a subfolder of the main checkout keeps CLAUDE_PROJECT_DIR as given', async () => {
  const r = await mainRepo();
  mkdirSync(join(r.dir, 'sub'), { recursive: true });
  const out = await prompt(r.dir, join(r.dir, 'sub'));
  assert.equal(out.code, 0, out.stderr);
  assert.equal(rootOf(out), r.dir);
});

test('(guard) a symlinked CLAUDE_PROJECT_DIR with cwd at its real path keeps the symlink', async () => {
  const r = await mainRepo();
  const link = join(scratch(), 'link');
  symlinkSync(r.dir, link);
  const real = realpathSync(r.dir);
  const out = await prompt(link, real);
  assert.equal(out.code, 0, out.stderr);
  assert.equal(rootOf(out), link);
  // Edit paths are made relative to the symlink spelling. A real-path file_path is dropped, as
  // before this change; this pins only the symlink spelling.
  const p = fixture('PostToolUse-Edit', real);
  p.tool_input.file_path = join(link, 'README.md');
  const edit = await runNode(CLAUDE_MJS, [], { cwd: '/', input: JSON.stringify(p), env: { CLAUDE_PROJECT_DIR: link } });
  assert.equal(edit.code, 0, edit.stderr);
  assert.equal(context(edit), 'files README.md');
});

test('(guard) a missing cwd folder keeps CLAUDE_PROJECT_DIR', async () => {
  const r = await mainRepo();
  const out = await prompt(r.dir, join(r.dir, 'gone', 'away'));
  assert.equal(out.code, 0, out.stderr);
  assert.equal(rootOf(out), r.dir);
});

test('(guard) a project dir below the git top level, with cwd elsewhere in the checkout, keeps CLAUDE_PROJECT_DIR', async () => {
  const r = await tempRepo();
  cleanups.push(r.cleanup);
  const app = join(r.dir, 'app');
  mkdirSync(app, { recursive: true });
  mkdirSync(join(r.dir, 'docs'), { recursive: true });
  installEcho(app);
  const out = await prompt(app, join(r.dir, 'docs'));
  assert.equal(out.code, 0, out.stderr);
  assert.equal(rootOf(out), app);
});

// ---- the verify gate in the worktree ------------------------------------------------------------

test('Stop in a linked worktree with a failing verify command blocks there', async () => {
  const r = await verifyRepo({ files: { 'src/a.js': 'a\n' } });
  cleanups.push(r.cleanup);
  await installBoth(r);
  r.pass();
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'harness');
  const wt = await worktreeOf(r);
  const cfg = JSON.parse(readFileSync(join(wt.dir, '.agents', 'harness.json'), 'utf8'));
  cfg['verify-gate'].command = ['node', '-e', "console.log('WT FAIL'); process.exit(1)"];
  await wt.write('.agents/harness.json', `${JSON.stringify(cfg, null, 2)}\n`);
  wt.git('commit', '-q', '-am', 'failing verify');
  const p = { ...fixture('Stop', wt.dir), background_tasks: [] };
  const out = await runNode(CLAUDE_MJS, [], { cwd: '/', input: JSON.stringify(p), env: { CLAUDE_PROJECT_DIR: r.dir } });
  assert.equal(out.code, 0, out.stderr);
  const res = JSON.parse(out.stdout);
  assert.equal(res.decision, 'block', out.stdout);
  assert.match(res.reason, /WT FAIL/);
});

// ---- bounded resolution, through main() in a child process --------------------------------------

// Runs the built main() with a scripted spawn in a child that exits itself (main() leaves workers
// running) and fails on its own after 5 s instead of hanging. `mode` picks the fake spawn.
async function runMain(r, cwd, mode) {
  const script = join(scratch('agent-harness-main-'), 'run-main.mjs');
  writeFileSync(
    script,
    [
      `import { main, defaultSpawn } from ${JSON.stringify(CLAUDE_URL)};`,
      'setTimeout(() => { console.error("self-timeout"); process.exit(1); }, 5000).unref();',
      `const mode = ${JSON.stringify(mode)};`,
      `const payloadCwd = ${JSON.stringify(cwd)};`,
      'const calls = []; const waiting = [];',
      'const spawn = (argv, opts) => {',
      '  calls.push({ argv, cwd: opts?.cwd, timeoutMs: opts?.timeoutMs });',
      "  if (mode === 'timeout' && opts?.cwd === payloadCwd) return Promise.resolve({ code: null, signal: 'SIGKILL', stdout: '', stderr: '' });",
      "  if (mode === 'fail') return Promise.resolve({ code: 128, signal: null, stdout: '', stderr: 'fatal' });",
      "  if (mode !== 'parallel') return defaultSpawn(argv, opts);",
      '  return new Promise((res) => { waiting.push(() => defaultSpawn(argv, opts).then(res)); if (waiting.length === 2) for (const go of waiting) go(); });',
      '};',
      'const chunks = []; for await (const c of process.stdin) chunks.push(c);',
      `const res = await main({ stdin: Buffer.concat(chunks).toString(), env: { CLAUDE_PROJECT_DIR: ${JSON.stringify(r.dir)} }, spawn });`,
      'process.stdout.write(JSON.stringify({ text: res.text, calls }), () => process.exit(0));',
    ].join('\n'),
  );
  const out = await runNode(script, [], { cwd: '/', input: JSON.stringify(fixture('UserPromptSubmit', cwd)) });
  assert.equal(out.code, 0, out.stderr);
  const { text, calls } = JSON.parse(out.stdout);
  return { calls, root: /^root (.*)$/m.exec(JSON.parse(text).hookSpecificOutput.additionalContext)?.[1] };
}

test('both git calls start before either resolves, each with timeoutMs 2000', async () => {
  const r = await mainRepo();
  const wt = await worktreeOf(r);
  const { calls, root } = await runMain(r, wt.dir, 'parallel');
  assert.equal(root, wt.dir);
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map((c) => c.timeoutMs),
    [2000, 2000],
  );
  assert.deepEqual(calls.map((c) => c.cwd).sort(), [r.dir, wt.dir].sort());
});

test('(guard) a timed-out cwd call keeps CLAUDE_PROJECT_DIR', async () => {
  const r = await mainRepo();
  const wt = await worktreeOf(r);
  assert.equal((await runMain(r, wt.dir, 'timeout')).root, r.dir);
});

test('(guard) a failing CLAUDE_PROJECT_DIR call wins over a failing cwd call', async () => {
  const r = await mainRepo();
  const wt = await worktreeOf(r);
  assert.equal((await runMain(r, wt.dir, 'fail')).root, r.dir);
});
