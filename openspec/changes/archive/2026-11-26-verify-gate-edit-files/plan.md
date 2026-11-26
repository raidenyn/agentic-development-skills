# verify-gate `editFiles` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add an optional `verify-gate.editFiles` glob list. An edit of a file outside the list makes the verify gate spawn no process.

**Architecture:** `gate.mts` learns the key: it lists, normalizes, validates and hashes it. The handler's `afterTool` filters `event.files` after `resolveConfig` and the tick branch, and before any `runGate`, using a new `matchesPathGlob` that matches segment by segment, as the task-file walker does: `.` and empty segments are dropped, and `**` is recursive only as a whole segment. Only the pattern has `\` turned into `/`. Paths come from the adapters already `/`-separated. When the call reported files and none are left, it traces `edit-skipped` and returns `null`. Tick detection, shell calls and turn end are untouched.

**Tech Stack:** strict TypeScript in `src/verify-gate/`, built by `pnpm run build` into `skills/agent-harness-verify-gate/assets/verify-gate/*.mjs`. Tests use `node:test` `.mjs` files in `tests/agent-harness/` that import the built assets.

**Spec:** `openspec/changes/verify-gate-edit-files/specs/verify-gate-triggers/spec.md` (with `brainstorm.md` and `proposal.md` in the same folder).

## Global Constraints

- Edit only `src/`, tests and docs, never `skills/*/assets/` or `.agents/harness/` by hand. Tests import the built assets. Use `pnpm run harness:update` (build plus refresh of this repo's installed copy and lock) before every test run, never `pnpm run build` alone. This repo's own verify gate runs `pnpm run check` on ticks and at turn end, and `vendored.test.mjs` fails while `.agents/harness/` is stale.
- Bump `src/verify-gate/tool.json` to `0.2.0` at the start of Task 1, so every `harness:update` in this change installs the new version. Every commit includes the regenerated `skills/agent-harness-verify-gate/assets` and `.agents/harness`, so `build:check` passes at each commit.
- Size: #60 says S (about 120 lines, 6 files). This plan edits about 10 files, mostly tests. The PR reports the overrun under "Anything that differs from this task".
- Source uses erasable syntax only. Put no comment directly above a type declaration.
- Tests stay `.mjs`, must not import `.mts`, and must run on Node 22.0.0.
- Key name `editFiles`, trace outcome `edit-skipped`, `check` error `"verify-gate.editFiles" must be a non-empty list of glob strings`.
- "No process" means the verify gate spawns nothing: neither the command nor git. The hook process and the runtime's own `git rev-parse` for its state dir still run. Do not promise "costs nothing" in docs.
- Do not change or delete existing tests to make them pass. The only allowed edit is the `CONFIG_KEYS` list assertion, which gains `editFiles`.
- Commits follow Conventional Commits. Every commit also adds `openspec/changes/verify-gate-edit-files/`, including its ticked `tasks.md`. Before the merge, sync the delta spec and archive the change in the same PR.
- Tick a `tasks.md` group's boxes only after its plan task's "see them pass" step. This repo's own gate starts a full `pnpm run check` on every tick, and an earlier tick reports "a task was ticked while verification fails".

## Review Focus

1. **Glob syntax drift from `taskFiles`.** Three cases: `./src/**/*.ts` must match `src/a.ts`; `src/**.ts` must match `src/a.ts` but not `src/nested/a.ts`, since `**` inside a segment is just `*`; and `src/**` must match `src/x/y.ts`. Task 2 pins all three in `triggers.test.mjs`.
2. **The empty-files path.** An OpenCode `patch` at `tool.before`, or a call whose paths are all outside the repo, has `files: []`. It must still return `null` with no trace, not `edit-skipped`. Task 2 pins this.
3. **The unset command.** `resolveConfig` must throw before the filter, so a repo with `editFiles` and no command still sees the gate failure. Task 2 pins this.
4. **Zero spawns, not just zero verify lines.** The content key spawns git before the command. The handler test counts calls to the injected `spawn`, and the host test checks the trace outcome.
5. **Upgrade and config-change sequence.** Without `editFiles` the hash must stay the same. Adding `editFiles` must invalidate the pass for the next run that reaches the gate. Task 1 pins the hash, and Task 2 pins the sequence.

---

### Task 1: Config key in `gate.mts`

**Files:**
- Modify: `src/verify-gate/lib/gate.mts` (`GateConfig` 16-22, `CONFIG_KEYS` 47, `normalizeConfig` 83-95, `configErrors` 104-133, `configHash` 136-139)
- Test: `tests/agent-harness/cli-verify.test.mjs` (the bad-values table near line 72), `tests/agent-harness/verify-handler.test.mjs` (the `CONFIG_KEYS` assertion at line 643, and a hash test next to it)

**Interfaces:**
- Produces: `GateConfig.editFiles: string[] | null` (`null` when the key is absent or invalid). `CONFIG_KEYS` = `['command', 'base', 'taskFiles', 'editFiles', 'timeoutSeconds', 'maxBlocks']`. `configHash(section)` is unchanged for sections without `editFiles`.

- [ ] **Step 0: Bump the version**

Set `"version": "0.2.0"` in `src/verify-gate/tool.json`, so every `harness:update` in this change installs the new version.

- [ ] **Step 1: Write the failing tests**

- `cli-verify.test.mjs`: add bad-values rows `[{ command: ['x'], editFiles: '**/*.ts' }, /verify-gate\.editFiles/]`, `[{ command: ['x'], editFiles: [] }, /verify-gate\.editFiles/]` and `[{ command: ['x'], editFiles: [''] }, /verify-gate\.editFiles/]`. Add a test `check accepts editFiles` with `setSection(r, { command: ['node', '-e', '0'], editFiles: ['**/*.ts', 'src/**'] })`, expecting exit 0.
- `verify-handler.test.mjs`: change the line-643 assertion to the new `CONFIG_KEYS`. Add a test `configHash without editFiles matches 0.1.2`. Import `configHash` from `lib/gate.mjs`. For `s = { command: ['x'] }`, assert `configHash(s) === '4af7534d293897869cc73e3c84170b91d8bd2d6adc2d27f4d3a80b755b2d530e'`. That literal is what the 0.1.2 build returns for this section. Then assert `configHash({ ...s, editFiles: ['**/*.ts'] }) !== configHash(s)` and `configHash({ ...s, editFiles: ['a'] }) !== configHash({ ...s, editFiles: ['b'] })`.
- [ ] **Step 2: Run them and see them fail**

Run: `pnpm run harness:update && node --test tests/agent-harness/cli-verify.test.mjs tests/agent-harness/verify-handler.test.mjs`
Expected: FAIL. A valid `editFiles` is rejected as an unknown key, the `CONFIG_KEYS` assertion fails, and the hash inequality fails.

- [ ] **Step 3: Implement**

- `GateConfig` gains `editFiles: string[] | null;`, and `CONFIG_KEYS` gains `'editFiles'` after `'taskFiles'`.
- `normalizeConfig` returns `editFiles: strings(s.editFiles) ? [...s.editFiles] : null`.
- `configErrors` pushes the error above when the key is present and `!strings(section.editFiles)`.
- `configHash` builds the existing five-element array and pushes `c.editFiles` only when it is non-null.

- [ ] **Step 4: Run them and see them pass**

Run: the command from step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add openspec/changes/verify-gate-edit-files src/verify-gate/tool.json src/verify-gate/lib/gate.mts tests/agent-harness/cli-verify.test.mjs tests/agent-harness/verify-handler.test.mjs skills/agent-harness-verify-gate/assets .agents/harness
git commit -m "feat: accept verify-gate.editFiles in the config"
```

### Task 2: Edit filter

**Files:**
- Modify: `src/verify-gate/lib/triggers.mts` (new export next to `matchesGlob`), `src/verify-gate/handler.mts` (`afterTool`, lines 273-307)
- Test: `tests/agent-harness/triggers.test.mjs`, `tests/agent-harness/verify-handler.test.mjs` (the "edit trigger" section after line 58), `tests/agent-harness/verify-hosts.test.mjs`, `tests/agent-harness/verify-proof.test.mjs` (next to "verify-pass fails after a config change")

**Interfaces:**
- Consumes: `resolveConfig(ctx.config).editFiles: string[] | null` from Task 1.
- Produces: `matchesPathGlob(pattern: unknown, relPath: unknown): boolean` in `triggers.mts`, and the trace outcome `edit-skipped`.

- [ ] **Step 1: Write the failing tests**

In `triggers.test.mjs`, import `matchesPathGlob` next to `matchesGlob`. Add `matchesPathGlob: segment by segment, like the task-file walker`, asserting these pairs:

| Pattern | Path (as a JS string literal) | Result |
|---|---|---|
| `**/*.ts` | `root.ts` | true |
| `**/*.ts` | `src/a/b.ts` | true |
| `**/*.ts` | `README.md` | false |
| `./src/**/*.ts` | `src/a.ts` | true |
| `src/*.ts` | `'src\\a.ts'` (a root file name) | false |
| `src\\*.ts` | `src/a.ts` | true |
| `*.ts` | `'src/a\\b.ts'` | false |
| `src/*.ts` | `'src/a\\b.ts'` | true |
| `src/*.ts` | `'src/a\n.ts'` | true |
| `src/a?.ts` | `'src/a\n.ts'` | true |
| `src/**.ts` | `src/a.ts` | true |
| `src/**.ts` | `src/nested/a.ts` | false |
| `src/**` | `src/a.ts` | true |
| `src/**` | `src/x/y.ts` | true |
| `src/**` | `docs/a.md` | false |
| `src/a?.ts` | `src/ab.ts` | true |
| `src/a?.ts` | `src/a/b.ts` | false |

Add `matchesPathGlob: repeated globstars stay fast`. The pattern is `'**/x/'.repeat(12) + '**/target.ts'`, and the path is `'x/'.repeat(50) + 'other.ts'`. Assert the result is `false` and that it returns in under 1000 ms (naive backtracking takes far longer) (`performance.now()` around the call).

In `verify-handler.test.mjs`, add `directSpawn` to the `helpers.mjs` import, and a local helper `counting()` that returns `{ spawn, calls }`, where `spawn` wraps `directSpawn` and increments `calls.n`. Pass it as `fire(..., { spawn })`. Unless a test says otherwise, use `repo({ config: { editFiles: ['**/*.ts'] } })`.

| Test | Event | Expectation |
|---|---|---|
| `editFiles: an edit outside it spawns nothing` | write `docs/notes.md`, then `edit(['docs/notes.md'])` | `result === null`, `traced` `['edit-skipped']`, `calls.n === 0`, `r.log().length === 0` |
| `editFiles: edits inside it run` | write `src/a.ts` and `root.ts`, then `edit(['src/a.ts', 'root.ts'])` | `traced` `['ran']`; `r.log().map(l => [l.trigger, l.file])` is `[['edit', 'src/a.ts'], ['edit', 'root.ts']]` |
| `editFiles: a mixed call runs only matching files` | `edit(['src/a.ts', 'README.md'])` | one log line, `file === 'src/a.ts'` |
| `editFiles: dot segments in a pattern are ignored` | config `editFiles: ['./src/**/*.ts']`, then `edit(['src/a.ts'])` | one log line |
| `editFiles: a backslash in a file name is not a separator` | config `editFiles: ['src/*.ts']`, then write the root file `src\\a.ts` and fire `edit(['src\\a.ts'])`, the path the Claude adapter gives for it on POSIX | `traced` `['edit-skipped']`, `calls.n === 0` |
| `editFiles: a tick outside it still runs the task check` | `tickCall(r)` | `r.log().map(l => l.trigger)` is `['task']` |
| `editFiles: a tool.after with no files traces nothing` | `edit([])` (valid command, no before-image, so no tick) | `result === null`, `traced` `[]`, `calls.n === 0` |
| `editFiles: an unset command still fails the gate` | `await r.setConfig({ command: undefined })`, then `edit(['docs/notes.md'])` | `assert.rejects(fire(...), /set verify-gate\.command/)`, as in the existing turn-end test at line 465 |
| `editFiles: a shell call is unchanged` | `shellBefore('sh1')`, tick `openspec/changes/x/tasks.md` by writing it, then `shellAfter('sh1')` | `r.log().map(l => l.trigger)` is `['task']` |
| `no editFiles: a Markdown edit runs as before` | `repo()` with no key, then `edit(['docs/notes.md'])` | `traced` `['ran']`, one log line with `file === 'docs/notes.md'` |

In `verify-proof.test.mjs`, add `adding editFiles alone invalidates the pass for the next run that reaches the gate`. Use `repo()` and a local handler `hk = createVerifyHandler({ contentKey: async () => ({ tree: 'T', stat: 'S', statMap: new Map() }) })`. The content key stays constant, so only the config hash can force a run:
  1. `fire(hk, r, turnEnd())`.
  2. `await r.setConfig({ editFiles: ['**/*.ts'] })`, then expect `await hk.proofs['verify-pass'](proofCtx(r))` to be `'verify-pass: the verify-gate config changed since the last pass'`.
  3. Write `docs/x.md` and fire `edit(['docs/x.md'])`. Expect `traced` `['edit-skipped']`, with `r.log()` length unchanged.
  4. Fire `turnEnd()`. Expect `traced` `['ran']`, with one more log line, and then `await hk.proofs['verify-pass'](proofCtx(r))` to be `null`.
  5. Fire `turnEnd()` again. Expect `traced` `['no-change']`, with no new line.

  Use `hk` for every `fire` in this test, not the file's `h`.

  Import `createVerifyHandler` and `edit` if the file does not yet.

In `verify-hosts.test.mjs`, add `an Edit outside editFiles prints nothing and traces edit-skipped`:
1. `installed()`, then `await r.setConfig({ editFiles: ['**/*.ts'] })`, then write `README.md`.
2. Run `CLAUDE_MJS` with `fixtures/claude/PostToolUse-Edit.json`, every `/REPO` replaced by `r.dir`. Its edited file is `README.md`. Use `env: { CLAUDE_PROJECT_DIR: r.dir, AGENT_HARNESS_TRACE: '1' }`.
3. Expect `res.code === 0`, `stdout === ''` and `r.log().length === 0`. The last `trace.jsonl` line has `outcomes['verify-gate'] === 'edit-skipped'`.

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm run harness:update && node --test tests/agent-harness/triggers.test.mjs tests/agent-harness/verify-handler.test.mjs tests/agent-harness/verify-hosts.test.mjs tests/agent-harness/verify-proof.test.mjs`
Expected: FAIL for the `matchesPathGlob` import (it is undefined) and for "outside it spawns nothing", "mixed call", "a backslash in a file name is not a separator", the host test and the proof sequence test. The others pin current behaviour and pass already.

- [ ] **Step 3: Implement `matchesPathGlob(pattern: unknown, relPath: unknown): boolean`**

Split the pattern with `String(pattern).replace(/\\/g, '/').split('/')`, and the path with `String(relPath).split('/')` (no backslash replacement). Drop empty and `.` segments from both. Then match the segment lists recursively. A pattern segment equal to `**` matches zero or more path segments. Any other pattern segment matches exactly one path segment through a local segment regex: `*` (and a `**` inside a segment) becomes `[^/]*`, `?` becomes `[^/]`, and everything else is escaped. Do not use `.`, because it does not match a line break, which is legal in a POSIX file name. Do not call `matchesGlob` here, because it rewrites `\` in the path. The match succeeds only when both lists are used up. Memoize the recursion by `(patternIndex, pathIndex)`, or fill the equivalent table bottom-up, so the cost stays at most patterns × path segments. Naive backtracking over several `**` is exponential and could run into the hook deadline. Leave `matchesGlob`, `listTaskFiles` and tick detection unchanged.

- [ ] **Step 4: Implement the filter in `afterTool`**

After `if (kind !== 'edit') return null;`:
- set `const all = event.files ?? []`;
- set `const globs = cfg.editFiles` and `const files = globs ? all.filter((f) => globs.some((g) => matchesPathGlob(g, f))) : all`;
- if `all.length && !files.length`, call `trace('edit-skipped')` and `return null`;
- loop over `files`, and keep the existing `if (!all.length) return null` before the trace.

- [ ] **Step 5: Run them and see them pass**

Run: the command from step 2. Expected: PASS, with every existing test unchanged.

- [ ] **Step 6: Commit**

```bash
git add openspec/changes/verify-gate-edit-files src/verify-gate/lib/triggers.mts src/verify-gate/handler.mts tests/agent-harness/triggers.test.mjs tests/agent-harness/verify-handler.test.mjs tests/agent-harness/verify-hosts.test.mjs tests/agent-harness/verify-proof.test.mjs skills/agent-harness-verify-gate/assets .agents/harness
git commit -m "feat: skip the edit run for files outside verify-gate.editFiles"
```

### Task 3: Docs and checks

**Files:**
- Modify: `skills/agent-harness-verify-gate/SKILL.md` (the "Edit" bullet at 44, "Making it fast" at 73-92, the "Config keys" table at 98-104 and the line at 110, and the "Verify live" trace line at 135)
- Regenerated by the tool: `skills/agent-harness-verify-gate/assets/verify-gate/**`, `.agents/harness/verify-gate/**`, `.agents/harness/lock.json`

- [ ] **Step 1: SKILL.md**

- **"Edit" bullet:** add "When `editFiles` is set, only edited files matching it run; an edit of any other file starts no verify process."
- **"Config keys" table:** add a row after `taskFiles`: `` | `editFiles` | unset (every edit runs) | globs of the files the `edit` run checks, same syntax as `taskFiles`; ticks in other files are still caught | ``.
- **Line 42 ("Every trigger first compares...") and line 75 ("Every other trigger runs the command"):** say "every trigger that reaches the gate". An edit outside `editFiles` returns before the content-key check.
- **Line 110:** change it to "Any change to the section counts as a change, so the next trigger that reaches the gate runs the command."
- **"Making it fast":** add a first step and renumber the rest: **Limit edits to what the command checks.** Set `editFiles` to the globs the edit command covers, for example `["**/*.ts"]`. An edit of another file then starts no verify process (the hook itself still starts).
- **The two "on the first edit" warnings** (`skills/agent-harness-verify-gate/SKILL.md` lines 10 and 157; the copies in `skills/agent-harness-hook-runtime/SKILL.md` stay as they are): say "on the first edit in scope". Keep the warning about untrusted hooks as strong as it is.
- **Onboard:** step 3 ("Set the config") names `editFiles` as an optional speed-up. In "Verify live", "make one edit that breaks the command" becomes "make one edit, of a file in `editFiles` when it is set, that breaks the command".
- **"Verify live" trace line:** list `no-change`, `ran`, `contended` or `edit-skipped`.

- [ ] **Step 2: Rebuild**

Run `pnpm run harness:update`. The version is already `0.2.0`, from Task 1 Step 0.
Expected: exit 0 and no changes beyond `SKILL.md` (the skill folder is not hashed into the tool), and `lock.json` already has `verify-gate` at `0.2.0`.

- [ ] **Step 3: Full checks**

Run: `pnpm run check && python3 scripts/skills.py validate && claude plugin validate . && python3 -m unittest discover -s scripts -p 'test_*.py'`
Expected: every command exits 0.

- [ ] **Step 4: Commit**

```bash
git add openspec/changes/verify-gate-edit-files skills/agent-harness-verify-gate .agents/harness
git commit -m "docs: describe verify-gate.editFiles"
```

## After the merge (not part of this plan's checkboxes)

The Pages release is the manual `release.yml` run on `main`, started by the owner or with their go-ahead. Keep the issue #60 criterion "released in the Pages catalog" open. Close it only when the GitHub release link is posted, together with a check that the published `agent-harness-verify-gate` skill on Pages contains `assets/verify-gate/tool.json` with `"version": "0.2.0"`. The catalog shows the repo release version, not the tool version. The PR reports it as "not done: waits for the release after the merge".

## Discovered work (propose as a new task, not part of this change)

`listTaskFiles` in `handler.mts` does not enumerate the files beneath a directory for a trailing `**` such as `openspec/**`. At the last index it stats each directory, not the files under it. A `<existing-file>/**` still returns that file, through the zero-segment branch. So `taskFiles: ["openspec/**"]` watches nothing, while `editFiles: ["src/**"]` matches every file under `src/` by the spec. Propose a follow-up that makes the walker list files for a trailing `**`.
