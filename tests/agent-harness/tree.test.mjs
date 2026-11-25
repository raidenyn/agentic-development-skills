// contentKey and changedFiles (design D4, D5 "Every run") against real temp repos, with the direct
// child_process spawn standing in for the supervisor's.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, directSpawn, tempRepo } from './helpers.mjs';

const { contentKey, changedFiles } = await import(pathToFileURL(join(ASSETS.verifyGate, 'lib', 'tree.mjs')).href);

async function setup(opts) {
  const repo = await tempRepo(opts);
  const stateDir = join(repo.dir, '.git', 'agent-harness', 'verify-gate');
  const calls = [];
  const spawn = (argv, o) => {
    calls.push(argv);
    return directSpawn(argv, o);
  };
  const key = async (root = repo.dir, dir = stateDir) => {
    const k = await contentKey({ repoRoot: root, stateDir: dir, spawn });
    return { ...k, id: `${k.tree} ${k.stat}` };
  };
  const touchR = (ref, file) => execFileSync('touch', ['-r', join(repo.dir, ref), join(repo.dir, file)]);
  return { ...repo, stateDir, spawn, calls, key, touchR };
}

const withRepo = (name, opts, fn) =>
  test(name, async () => {
    const r = await setup(opts);
    try {
      await fn(r);
    } finally {
      await r.cleanup();
    }
  });

withRepo('two consecutive no-change calls give equal keys', {}, async (r) => {
  const a = await r.key();
  const b = await r.key();
  assert.match(a.tree, /^[0-9a-f]{40,64}$/);
  assert.match(a.stat, /^[0-9a-f]{64}$/);
  assert.equal(a.id, b.id);
  assert.ok(a.statMap instanceof Map);
  assert.ok(a.statMap.has('README.md'));
});

withRepo('an edit within the same second as the last key computation changes the key', {}, async (r) => {
  const a = await r.key();
  await r.write('README.md', '# TEST\n');
  const b = await r.key();
  assert.notEqual(a.tree, b.tree);
  assert.notEqual(a.id, b.id);
});

withRepo(
  'a same-size rewrite followed by touch -r to the old mtime changes the key',
  { files: { 'f.txt': 'aaaa\n' } },
  async (r) => {
    r.git('config', 'core.trustctime', 'false');
    r.git('config', 'core.checkStat', 'minimal');
    await r.write('ref.stamp', '');
    r.touchR('f.txt', 'ref.stamp');
    const a = await r.key();
    await new Promise((res) => setTimeout(res, 20));
    await r.write('f.txt', 'bbbb\n');
    r.touchR('ref.stamp', 'f.txt');
    const b = await r.key();
    assert.notEqual(a.id, b.id);
  },
);

withRepo('under a test clean filter that lowercases, editing A to a changes the key', {}, async (r) => {
  r.git('config', 'filter.lower.clean', 'tr A-Z a-z');
  await r.write('.gitattributes', '*.txt filter=lower\n');
  await r.write('x.txt', 'A\n');
  const a = await r.key();
  await r.write('x.txt', 'a\n');
  const b = await r.key();
  assert.equal(a.tree, b.tree, 'the filter maps both to the same blob');
  assert.notEqual(a.stat, b.stat);
});

withRepo(
  'LF to CRLF under text=auto changes stat but not tree',
  { files: { '.gitattributes': '* text=auto\n', 'e.txt': 'one\ntwo\n' } },
  async (r) => {
    const a = await r.key();
    await r.write('e.txt', 'one\r\ntwo\r\n');
    const b = await r.key();
    assert.equal(a.tree, b.tree);
    assert.notEqual(a.stat, b.stat);
    assert.notEqual(a.statMap.get('e.txt'), b.statMap.get('e.txt'));
    assert.equal(a.statMap.get('README.md'), b.statMap.get('README.md'));
  },
);

withRepo("an assume-unchanged file's edit changes the key", { files: { 'au.txt': 'one\n' } }, async (r) => {
  r.git('update-index', '--assume-unchanged', 'au.txt');
  const a = await r.key();
  await r.write('au.txt', 'two\n');
  const b = await r.key();
  assert.notEqual(a.tree, b.tree);
});

withRepo('linked worktree reads membership from its own index', { files: { '.gitignore': '*.log\n' } }, async (r) => {
  const wt = mkdtempSync(join(tmpdir(), 'agent-harness-wt-'));
  rmSync(wt, { recursive: true });
  try {
    r.git('worktree', 'add', '-q', '-b', 'wt', wt);
    const wtGit = (...a) => execFileSync('git', a, { cwd: wt, encoding: 'utf8' });
    writeFileSync(join(wt, 'secret.log'), 'one\n');
    wtGit('add', '-f', 'secret.log');
    const gitDir = wtGit('rev-parse', '--absolute-git-dir').trim();
    const stateDir = join(gitDir, 'agent-harness', 'verify-gate');
    const a = await r.key(wt, stateDir);
    assert.ok(a.statMap.has('secret.log'));
    writeFileSync(join(wt, 'secret.log'), 'two\n');
    const b = await r.key(wt, stateDir);
    assert.notEqual(a.tree, b.tree);
    // The main worktree's own index never tracked secret.log.
    assert.equal(r.git('ls-files', 'secret.log').trim(), '');
  } finally {
    try {
      r.git('worktree', 'remove', '--force', wt);
    } catch {}
    rmSync(wt, { recursive: true, force: true });
  }
});

withRepo('force-tracked ignored file counts', { files: { '.gitignore': '*.log\n' } }, async (r) => {
  await r.write('debug.log', 'one\n');
  const a0 = await r.key();
  assert.ok(!a0.statMap.has('debug.log'), 'ignored and untracked: not counted');
  r.git('add', '-f', 'debug.log');
  const a = await r.key();
  assert.ok(a.statMap.has('debug.log'));
  assert.notEqual(a0.tree, a.tree);
  await r.write('debug.log', 'two\n');
  const b = await r.key();
  assert.notEqual(a.tree, b.tree);
});

withRepo('git rm --cached of an ignored file drops it', { files: { '.gitignore': '*.log\n' } }, async (r) => {
  await r.write('keep.log', 'one\n');
  r.git('add', '-f', 'keep.log');
  r.git('commit', '-q', '-m', 'track log');
  const a = await r.key();
  assert.ok(a.statMap.has('keep.log'));
  r.git('rm', '-q', '--cached', 'keep.log');
  const b = await r.key();
  assert.ok(!b.statMap.has('keep.log'));
  assert.notEqual(a.tree, b.tree);
});

withRepo('private index is reused', {}, async (r) => {
  await r.key();
  assert.ok(existsSync(join(r.stateDir, 'index')));
  assert.ok(
    r.calls.some((a) => a.includes('read-tree')),
    'first call builds the index',
  );
  r.calls.length = 0;
  await r.key();
  assert.ok(!r.calls.some((a) => a.includes('read-tree')), 'second call reuses it');
  assert.ok(r.calls.every((a) => !a.some((x) => String(x).endsWith(join('.git', 'index')))));
});

withRepo('a leftover index.lock is removed', {}, async (r) => {
  const a = await r.key();
  writeFileSync(join(r.stateDir, 'index.lock'), '');
  const b = await r.key();
  assert.equal(a.id, b.id);
  assert.ok(!existsSync(join(r.stateDir, 'index.lock')));
});

withRepo('a corrupt private index is rebuilt', {}, async (r) => {
  const a = await r.key();
  writeFileSync(join(r.stateDir, 'index'), 'garbage, not an index');
  const b = await r.key();
  assert.equal(a.tree, b.tree);
});

withRepo('same id after committing unchanged content', { files: { 'n.txt': 'one\n' } }, async (r) => {
  await r.write('n.txt', 'two\n');
  const a = await r.key();
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'second');
  const b = await r.key();
  assert.equal(a.id, b.id);
});

withRepo('changes on a tracked edit', {}, async (r) => {
  const a = await r.key();
  await r.write('README.md', '# changed\n');
  assert.notEqual(a.id, (await r.key()).id);
});

withRepo('changes on a new untracked file', {}, async (r) => {
  const a = await r.key();
  await r.write('new.txt', 'x\n');
  const b = await r.key();
  assert.notEqual(a.tree, b.tree);
  assert.ok(b.statMap.has('new.txt'));
});

withRepo('ignores a gitignored file', { files: { '.gitignore': 'build/\n' } }, async (r) => {
  const a = await r.key();
  await r.write('build/out.js', 'x\n');
  const b = await r.key();
  assert.equal(a.id, b.id);
});

withRepo('real index untouched', { files: { 'u.txt': 'one\n' } }, async (r) => {
  await r.write('u.txt', 'two\n');
  await r.write('untracked.txt', 'x\n');
  const before = readFileSync(join(r.dir, '.git', 'index'));
  assert.equal(r.git('diff', '--cached', '--name-only'), '');
  await r.key();
  await r.key();
  assert.equal(r.git('diff', '--cached', '--name-only'), '');
  assert.ok(before.equals(readFileSync(join(r.dir, '.git', 'index'))));
  assert.match(r.git('status', '--porcelain'), /\?\? untracked\.txt/);
});

withRepo('works in a repo with no commits', { commit: false, files: { 'a.txt': 'x\n' } }, async (r) => {
  const a = await r.key();
  assert.ok(a.statMap.has('a.txt'));
  await r.write('a.txt', 'y\n');
  const b = await r.key();
  assert.notEqual(a.tree, b.tree);
});

// changedFiles

withRepo(
  'lists a modified tracked file and an untracked file against merge-base',
  { files: { 'a.txt': '1\n', 'b.txt': '1\n' } },
  async (r) => {
    const init = r.git('rev-parse', 'HEAD').trim();
    r.git('update-ref', 'refs/remotes/origin/main', init);
    await r.write('b.txt', '2\n');
    r.git('commit', '-q', '-am', 'b');
    await r.write('a.txt', '2\n');
    await r.write('c.txt', 'new\n');
    const k = await r.key();
    const res = await changedFiles({
      repoRoot: r.dir,
      baseRef: 'origin/main',
      stateDir: r.stateDir,
      statMap: k.statMap,
      lastStatMap: k.statMap,
      spawn: r.spawn,
    });
    assert.equal(res.base, init);
    assert.deepEqual(res.files, ['a.txt', 'b.txt', 'c.txt']);
  },
);

withRepo('falls back to HEAD without origin/main', { files: { 'a.txt': '1\n' } }, async (r) => {
  await r.write('a.txt', '2\n');
  const k = await r.key();
  const res = await changedFiles({
    repoRoot: r.dir,
    baseRef: 'origin/main',
    stateDir: r.stateDir,
    statMap: k.statMap,
    lastStatMap: null,
    spawn: r.spawn,
  });
  assert.equal(res.base, r.git('rev-parse', 'HEAD').trim());
  assert.deepEqual(res.files, ['a.txt']);
});

withRepo(
  'no HEAD gives base "" and all files',
  { commit: false, files: { 'a.txt': '1\n', 'd/b.txt': '1\n' } },
  async (r) => {
    const k = await r.key();
    const res = await changedFiles({
      repoRoot: r.dir,
      baseRef: 'origin/main',
      stateDir: r.stateDir,
      statMap: k.statMap,
      lastStatMap: null,
      spawn: r.spawn,
    });
    assert.equal(res.base, '');
    assert.deepEqual(res.files, ['a.txt', 'd/b.txt']);
  },
);

withRepo(
  'an LF-to-CRLF edit is listed via the stat map',
  { files: { '.gitattributes': '* text=auto\n', 'e.txt': 'one\n' } },
  async (r) => {
    const pass = await r.key();
    await r.write('e.txt', 'one\r\n');
    const k = await r.key();
    assert.equal(pass.tree, k.tree);
    const lastStatMap = { ...Object.fromEntries(pass.statMap) };
    const res = await changedFiles({
      repoRoot: r.dir,
      baseRef: 'origin/main',
      stateDir: r.stateDir,
      statMap: k.statMap,
      lastStatMap,
      spawn: r.spawn,
    });
    assert.deepEqual(res.files, ['e.txt']);
  },
);

withRepo('an assume-unchanged edit is listed via the private index', { files: { 'au.txt': 'one\n' } }, async (r) => {
  r.git('update-index', '--assume-unchanged', 'au.txt');
  await r.write('au.txt', 'two\n');
  assert.equal(r.git('diff', '--name-only'), '', 'git itself does not see it');
  const k = await r.key();
  const res = await changedFiles({
    repoRoot: r.dir,
    baseRef: 'origin/main',
    stateDir: r.stateDir,
    statMap: k.statMap,
    lastStatMap: null,
    spawn: r.spawn,
  });
  assert.deepEqual(res.files, ['au.txt']);
});

withRepo(
  'a file untracked with git rm --cached is listed via the real index',
  { files: { 'r.txt': 'one\n' } },
  async (r) => {
    r.git('rm', '-q', '--cached', 'r.txt');
    const k = await r.key();
    const res = await changedFiles({
      repoRoot: r.dir,
      baseRef: 'origin/main',
      stateDir: r.stateDir,
      statMap: k.statMap,
      lastStatMap: k.statMap,
      spawn: r.spawn,
    });
    assert.deepEqual(res.files, ['r.txt']);
  },
);
