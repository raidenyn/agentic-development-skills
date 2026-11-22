import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SEMANTIC_RELEASE = path.join(ROOT, "node_modules", ".bin", "semantic-release");
const CONFIG_FILE = path.join(ROOT, ".releaserc.json");

/** Run a command without rejecting, so tests can assert on the exit code. */
function exec(command, args, options) {
  return new Promise((resolve) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr });
    });
  });
}

function gitEnv(home, extra = {}) {
  return {
    PATH: process.env.PATH,
    HOME: home,
    LANG: process.env.LANG ?? "C.UTF-8",
    GIT_AUTHOR_NAME: "Release Test",
    GIT_AUTHOR_EMAIL: "release-test@example.com",
    GIT_COMMITTER_NAME: "Release Test",
    GIT_COMMITTER_EMAIL: "release-test@example.com",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    ...extra,
  };
}

async function git(cwd, args, env) {
  const { code, stdout, stderr } = await exec("git", args, { cwd, env });
  assert.equal(code, 0, `git ${args.join(" ")} failed: ${stderr}`);
  return stdout.trim();
}

async function remoteRefs(bare, env) {
  const output = await git(bare, ["for-each-ref", "--format=%(refname) %(objectname)"], env);
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ref, objectname] = line.split(" ");
      return { ref, objectname };
    });
}

function describeRun(result) {
  return `semantic-release exited ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
}

/**
 * Create a bare remote and a clone with a `feat: a` commit on top of a tagged
 * `v0.0.0` seed. The semantic-release config is the committed one with the
 * GitHub plugin removed, `repositoryUrl` pointing at the bare remote and the
 * exec commands pointing at scripts this test can make fail.
 */
async function createRepositories(t, { failVerify = false, failPrepare = false } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "release-lifecycle-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const home = path.join(directory, "home");
  await mkdir(home);
  const env = gitEnv(home, {
    ...(failVerify ? { FAIL_VERIFY: "1" } : {}),
    ...(failPrepare ? { FAIL_PREPARE: "1" } : {}),
  });

  const bare = path.join(directory, "remote.git");
  const clone = path.join(directory, "clone");
  await git(directory, ["init", "--bare", "-b", "main", bare], env);
  await git(directory, ["init", "-b", "main", clone], env);
  await git(clone, ["remote", "add", "origin", bare], env);

  const verifyScript = path.join(directory, "verify.sh");
  const prepareScript = path.join(directory, "prepare.sh");
  await writeFile(
    verifyScript,
    '#!/bin/sh\nif [ "$FAIL_VERIFY" = "1" ]; then echo "verify failed on purpose" >&2; exit 1; fi\nexit 0\n',
    { mode: 0o755 },
  );
  await writeFile(
    prepareScript,
    '#!/bin/sh\nif [ "$FAIL_PREPARE" = "1" ]; then echo "prepare failed on purpose" >&2; exit 1; fi\nexit 0\n',
    { mode: 0o755 },
  );

  const config = JSON.parse(await readFile(CONFIG_FILE, "utf8"));
  const plugins = config.plugins.filter(
    (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) !== "@semantic-release/github",
  );
  assert.equal(plugins.length, config.plugins.length - 1, "the committed config should list @semantic-release/github");
  const execPlugin = plugins.find((plugin) => plugin[0] === "@semantic-release/exec");
  assert.ok(execPlugin, "the committed config should list @semantic-release/exec");
  execPlugin[1] = {
    ...execPlugin[1],
    verifyReleaseCmd: `sh "${verifyScript}"`,
    prepareCmd: `sh "${prepareScript}"`,
  };
  await writeFile(
    path.join(clone, ".releaserc.json"),
    JSON.stringify({ ...config, plugins, repositoryUrl: `file://${bare}` }, null, 2),
  );

  await writeFile(path.join(clone, "README.md"), "seed\n");
  await git(clone, ["add", "README.md"], env);
  await git(clone, ["commit", "-m", "chore: seed"], env);
  await git(clone, ["tag", "v0.0.0"], env);
  await git(clone, ["push", "origin", "main"], env);
  await git(clone, ["push", "origin", "v0.0.0"], env);
  await git(clone, ["commit", "--allow-empty", "-m", "feat: a"], env);

  return { bare, clone, env };
}

function runSemanticRelease(clone, env) {
  return exec(SEMANTIC_RELEASE, ["--no-ci"], { cwd: clone, env });
}

test("a feat commit publishes only the v0.1.0 tag and its release notes", async (t) => {
  const { bare, clone, env } = await createRepositories(t);
  const before = await remoteRefs(bare, env);
  const headsBefore = before.filter(({ ref }) => ref.startsWith("refs/heads/"));

  const result = await runSemanticRelease(clone, env);
  assert.equal(result.code, 0, describeRun(result));

  const after = await remoteRefs(bare, env);
  assert.deepEqual(
    after.filter(({ ref }) => ref.startsWith("refs/heads/")),
    headsBefore,
    "the remote branch must not change",
  );

  const addedRefs = after.filter(({ ref }) => !before.some((previous) => previous.ref === ref));
  const addedNames = addedRefs.map(({ ref }) => ref).sort();
  t.diagnostic(`new remote refs: ${addedNames.join(", ")}`);

  assert.deepEqual(
    addedNames.filter((ref) => ref.startsWith("refs/tags/")),
    ["refs/tags/v0.1.0"],
    "only the v0.1.0 tag should be added",
  );
  assert.equal(
    addedNames.filter((ref) => ref.startsWith("refs/notes/semantic-release")).length,
    1,
    "exactly one semantic-release notes ref should be added",
  );
  assert.equal(addedNames.length, 2, "only the release tag and its notes ref should be added");

  const localHead = await git(clone, ["rev-parse", "HEAD"], env);
  const taggedCommit = await git(bare, ["rev-parse", "v0.1.0"], env);
  assert.equal(taggedCommit, localHead, "the v0.1.0 tag should point at the feat commit");
});

test("a second run with no new commits exits 0 without adding refs", async (t) => {
  const { bare, clone, env } = await createRepositories(t);
  const first = await runSemanticRelease(clone, env);
  assert.equal(first.code, 0, describeRun(first));
  const refsAfterFirst = await remoteRefs(bare, env);

  const second = await runSemanticRelease(clone, env);
  assert.equal(second.code, 0, describeRun(second));
  assert.deepEqual(await remoteRefs(bare, env), refsAfterFirst, "a run without commits must not add refs");
});

test("a failing verifyReleaseCmd aborts the release before tagging", async (t) => {
  const { bare, clone, env } = await createRepositories(t, { failVerify: true });
  const before = await remoteRefs(bare, env);

  const result = await runSemanticRelease(clone, env);
  assert.notEqual(result.code, 0, describeRun(result));
  assert.deepEqual(await remoteRefs(bare, env), before, "a failing verifyReleaseCmd must not push refs");
});

test("a failing prepareCmd aborts the release before tagging", async (t) => {
  const { bare, clone, env } = await createRepositories(t, { failPrepare: true });
  const before = await remoteRefs(bare, env);

  const result = await runSemanticRelease(clone, env);
  assert.notEqual(result.code, 0, describeRun(result));
  assert.deepEqual(await remoteRefs(bare, env), before, "a failing prepareCmd must not push refs");
});
