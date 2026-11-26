// The verify gate's block ledger lives under the git common directory (design D3 of the
// follow-agent-checkout change), so a session keeps its limits when it moves between worktrees.
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { ASSETS, linkedWorktree, tempRepo } from './helpers.mjs';
import { fire, turnEnd, verifyRepo } from './verify-helpers.mjs';

const { createVerifyHandler } = await import(pathToFileURL(join(ASSETS.verifyGate, 'handler.mjs')).href);
const { commonSessionDir, rootSessionStateDir } = await import(
  pathToFileURL(join(ASSETS.verifyGate, 'lib', 'state.mjs')).href
);

const h = createVerifyHandler();
const cleanups = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

test('the block limit follows the session into a linked worktree', async () => {
  const r = await verifyRepo({ config: { maxBlocks: 2 } });
  cleanups.push(r.cleanup);
  r.fail();
  assert.match((await fire(h, r, turnEnd())).result.block, /attempt 1 of 2/);
  assert.match((await fire(h, r, turnEnd())).result.block, /attempt 2 of 2/);
  const wt = await linkedWorktree(r);
  cleanups.push(wt.cleanup);
  const inWt = { ...r, dir: wt.dir };
  const { result } = await fire(h, inWt, turnEnd());
  assert.equal(result.block, undefined);
  assert.match(result.context, /still failing after 2 blocks/);
  assert.match((await fire(h, inWt, turnEnd(), { sessionId: 's2' })).result.block, /attempt 1 of 2/);
});

test('commonSessionDir equals rootSessionStateDir in a main checkout', async () => {
  const r = await tempRepo();
  cleanups.push(r.cleanup);
  const key = { repoRoot: r.dir, tool: 'verify-gate', host: 'claude-code', sessionId: 's/1' };
  assert.equal(realpathSync(commonSessionDir(key)), realpathSync(rootSessionStateDir(key)));
});

test('commonSessionDir is shared by a linked worktree and its main checkout', async () => {
  const r = await tempRepo();
  cleanups.push(r.cleanup);
  const wt = await linkedWorktree(r);
  cleanups.push(wt.cleanup);
  const key = { tool: 'verify-gate', host: 'claude-code', sessionId: 's1' };
  assert.equal(commonSessionDir({ ...key, repoRoot: wt.dir }), commonSessionDir({ ...key, repoRoot: r.dir }));
  assert.notEqual(
    realpathSync(rootSessionStateDir({ ...key, repoRoot: wt.dir })),
    realpathSync(commonSessionDir({ ...key, repoRoot: wt.dir })),
  );
});
