// The capability fixture handler (fixtures/capability-handler) driven through both adapters: deny,
// text after a tool with separate counts per agent, block then pass, and re-delivery after compaction.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, fakeOpencodeCtx, runNode, tempRepo, until } from './helpers.mjs';

const { installTool } = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'install.mjs')).href);
const { createOpencodePlugin } = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'opencode-adapter.mjs')).href);
const { sessionStateDir } = await import(pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'state.mjs')).href);

const HANDLER_SRC = join(import.meta.dirname, 'fixtures', 'capability-handler');
const CLAUDE_MJS = join(ASSETS.hookRuntime, 'claude.mjs');
const fixture = (host, name, root) =>
  JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', host, `${name}.json`), 'utf8').replaceAll('/REPO', root));

const cleanups = [];
after(async () => { for (const c of cleanups.reverse()) await c(); });

async function repoWithFixture() {
  const r = await tempRepo();
  cleanups.push(r.cleanup);
  assert.equal(installTool({ sourceDir: HANDLER_SRC, repoRoot: r.dir }).code, 0);
  return r;
}

test('Claude Code: deny, after-text per agent, block then pass, and re-delivery', async () => {
  const r = await repoWithFixture();
  const run = async (name, edit = (p) => p) => {
    const out = await runNode(CLAUDE_MJS, [], {
      cwd: r.dir, input: JSON.stringify(edit(fixture('claude', name, r.dir))), env: { CLAUDE_PROJECT_DIR: r.dir },
    });
    assert.equal(out.code, 0, out.stderr);
    return out.stdout ? JSON.parse(out.stdout) : null;
  };
  const deny = await run('PreToolUse-Bash');
  assert.equal(deny.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(deny.hookSpecificOutput.permissionDecisionReason, /HARNESS_DENY/);
  const ctxOf = (o) => o.hookSpecificOutput.additionalContext;
  assert.equal(ctxOf(await run('PostToolUse-Bash')), 'HARNESS_AFTER main 1');
  assert.equal(ctxOf(await run('PostToolUse-Bash')), 'HARNESS_AFTER main 2');
  assert.equal(ctxOf(await run('PostToolUse-Bash-agent')), 'HARNESS_AFTER acce120c0d6e8559b 1');
  const noBackground = (p) => ({ ...p, background_tasks: [] });
  assert.deepEqual(await run('Stop', noBackground), { decision: 'block', reason: 'HARNESS_BLOCK' });
  assert.equal(await run('Stop', noBackground), null);
  assert.equal(ctxOf(await run('SessionStart-compact')), 'HARNESS_REDELIVER');
  assert.equal(await run('SessionStart-startup'), null);
});

test('OpenCode: deny, after-text per agent, block then pass, and re-delivery', async () => {
  const r = await repoWithFixture();
  const ROOT = 'ses_dedfe7299ffexvwC0QDPgTiOoW';
  const CHILD = 'ses_dedfe4625ffe7X3k5Q6cF7eOyd';
  const f = fakeOpencodeCtx(r.dir, { sessions: { [ROOT]: { id: ROOT }, [CHILD]: { id: CHILD, parentID: ROOT } } });
  const dispose = await createOpencodePlugin().setup(f.ctx);
  cleanups.push(dispose);
  const fx = (name, sessionID) => ({ ...fixture('opencode', name, r.dir), ...(sessionID ? { sessionID } : {}) });

  await assert.rejects(f.hooks['execute.before'](fx('execute.before-shell', ROOT)), /HARNESS_DENY/);
  await f.hooks['execute.before'](fx('execute.before-read', ROOT));
  const lastText = async (input) => {
    await f.hooks['execute.after'](input);
    return input.result.content.at(-1).text;
  };
  assert.equal(await lastText(fx('execute.after-shell-completed', ROOT)), 'HARNESS_AFTER main 1');
  assert.equal(await lastText(fx('execute.after-patch-completed', ROOT)), 'HARNESS_AFTER main 2');
  assert.equal(await lastText(fx('execute.after-shell-completed-child')), `HARNESS_AFTER ${CHILD} 1`);

  f.emit('session.execution.started', ROOT);
  f.emit('session.execution.succeeded', ROOT);
  await until(() => f.calls.synthetic.length === 1, 4000, 'block');
  assert.deepEqual(f.calls.synthetic[0], { sessionID: ROOT, text: 'HARNESS_BLOCK', resume: true });
  f.emit('session.execution.started', ROOT);
  f.emit('session.execution.succeeded', ROOT);
  const blocked = join(sessionStateDir({ repoRoot: r.dir, tool: 'capability-fixture', host: 'opencode', sessionId: ROOT, agentId: 'main' }), 'blocked');
  assert.ok(existsSync(blocked));
  await new Promise((res) => setTimeout(res, 300));
  assert.equal(f.calls.synthetic.length, 1, 'the second turn end passes');

  f.emit('session.compaction.ended', ROOT);
  await new Promise((res) => setTimeout(res, 100));
  const input = { sessionID: ROOT, system: [], messages: [] };
  await f.hooks['session.context'](input);
  assert.deepEqual(input.system, [{ type: 'text', text: 'HARNESS_REDELIVER' }]);
});
