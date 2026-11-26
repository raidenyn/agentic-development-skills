import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASSETS, linkedWorktree, runNode, tempRepo } from './helpers.mjs';

test('tempRepo creates a committed repo', async () => {
  const repo = await tempRepo();
  try {
    assert.match(repo.git('rev-parse', 'HEAD').trim(), /^[0-9a-f]{40}$/);
  } finally {
    await repo.cleanup();
  }
});

test('ASSETS point at the tool folders and runNode runs a script', async () => {
  assert.ok(existsSync(`${ASSETS.hookRuntime}/tool.json`));
  assert.ok(existsSync(`${ASSETS.verifyGate}/tool.json`));
  const r = await runNode('-e', ['console.log(1)'], { input: '' });
  assert.equal(r.code, 0);
});

test('linkedWorktree creates a worktree that shares the common dir', async () => {
  const repo = await tempRepo();
  const wt = await linkedWorktree(repo);
  try {
    const common = (dir) =>
      realpathSync(
        resolve(dir, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: dir, encoding: 'utf8' }).trim()),
      );
    const gitDir = (dir) =>
      execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: dir, encoding: 'utf8' }).trim();
    assert.equal(common(wt.dir), common(repo.dir));
    assert.notEqual(gitDir(wt.dir), gitDir(repo.dir));
    assert.equal(wt.dir, realpathSync(wt.dir));
  } finally {
    await repo.cleanup();
    await wt.cleanup();
  }
});
