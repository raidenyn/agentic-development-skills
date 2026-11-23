import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { generateNotes } from "@semantic-release/release-notes-generator";

const CONFIG_URL = new URL("../.releaserc.json", import.meta.url);
const PACKAGE_URL = new URL("../package.json", import.meta.url);
const NVMRC_URL = new URL("../.nvmrc", import.meta.url);
const REPOSITORY_URL = "https://github.com/raidenyn/agentic-development-skills.git";

const config = JSON.parse(await readFile(CONFIG_URL, "utf8"));

/** The config for one plugin from the explicit `plugins` array (never `{}` by accident). */
function pluginConfig(name) {
  const entry = config.plugins.find((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === name);
  assert.ok(entry, `${name} is configured in .releaserc.json`);
  return Array.isArray(entry) ? (entry[1] ?? {}) : {};
}

function context(messages) {
  return {
    cwd: process.cwd(),
    env: {},
    logger: { log() {}, error() {} },
    options: { repositoryUrl: REPOSITORY_URL },
    lastRelease: { gitTag: "v0.0.0", version: "0.0.0" },
    nextRelease: { gitTag: "v0.1.0", version: "0.1.0" },
    commits: messages.map((message, index) => ({ hash: `hash-${index}`, message })),
  };
}

const analyzerCases = [
  [["docs!: drop old path"], "major"],
  [["fix: a\n\nBREAKING CHANGE: b"], "major"],
  [["feat: a", "fix: b"], "minor"],
  [["chore: a"], "patch"],
  [["Update README"], "patch"],
  [[""], null],
];

test("commit-analyzer maps commits to the documented release types", async () => {
  const analyzer = pluginConfig("@semantic-release/commit-analyzer");

  for (const [messages, expected] of analyzerCases) {
    assert.equal(
      await analyzeCommits(analyzer, context(messages)),
      expected,
      `${JSON.stringify(messages)} should release ${expected}`,
    );
  }
});

test("release notes group the documented commit types in order and link issues", async () => {
  const notes = await generateNotes(
    pluginConfig("@semantic-release/release-notes-generator"),
    context(["feat!: z", "feat: a (#12)", "fix: b", "perf: p", "docs: d", "chore: c"]),
  );

  const headings = [
    "### ⚠ BREAKING CHANGES",
    "### Features",
    "### Bug Fixes",
    "### Performance",
    "### Documentation",
    "### Other",
  ];
  const positions = headings.map((heading) => notes.indexOf(heading));
  for (const [index, position] of positions.entries()) {
    assert.notEqual(position, -1, `notes should contain ${headings[index]}\n\n${notes}`);
  }
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
    `notes should order the sections as ${headings.join(", ")}\n\n${notes}`,
  );
  assert.ok(
    notes.includes("[#12](https://github.com/raidenyn/agentic-development-skills/issues/12)"),
    `notes should link issue #12\n\n${notes}`,
  );
});

test("release notes ignore a commit with no conventional type", async () => {
  const notes = await generateNotes(pluginConfig("@semantic-release/release-notes-generator"), context(["Update README"]));

  assert.ok(!notes.includes("* Update README"), `notes should not list "Update README"\n\n${notes}`);
});

test("package.json has no lifecycle scripts and .nvmrc pins Node 26.13.1", async () => {
  const packageJson = JSON.parse(await readFile(PACKAGE_URL, "utf8"));
  const nvmrc = (await readFile(NVMRC_URL, "utf8")).trim();

  for (const script of ["prepare", "preinstall", "install", "postinstall"]) {
    assert.ok(!(script in packageJson.scripts), `package.json must not define a ${script} script`);
  }
  assert.equal(nvmrc, "26.13.1");
});
