# TypeScript Build System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tick the matching line in `tasks.md` when a task here is done; the task numbers in brackets say which.

**Goal:** Harness tools and repo scripts are written in strict TypeScript, checked by type check, lint and a build check, while skills keep shipping plain `.mjs`.

**Architecture:** Shipped code lives as `.mts` under `src/` and is built by `scripts/build.mts` (strip types, rewrite `.mts` specifiers to `.mjs`, format with Biome, add a header) into committed files under `skills/<skill>/assets/<tool>/`. Repo-only scripts are `.mts` run directly by Node 26. Tests of shipped code stay `.mjs` and run against the built files.

**Tech Stack:** pnpm 12.18.0, Node 26.13.1 (`.nvmrc`), `node:module` `stripTypeScriptTypes`, TypeScript 7 (`tsc --noEmit`), Biome 2, `node --test`.

**Spec:** `openspec/changes/add-typescript-build-system/design.md`, `specs/harness-source-build/spec.md`, `specs/code-quality-checks/spec.md`, `specs/harness-tool-install/spec.md`, `specs/node-package-management/spec.md`. Read all five before starting.

**Base:** `main` at `36f0886` (PR #54 and PR #55 merged). The harness code there is the code this plan was checked against.

## Global Constraints

- Emitted files import only Node built-ins and emitted files of the same tool, and run on Node 22.0.0.
- Output paths, file names and the vendored layout do not change: `skills/<skill>/assets/<tool>/<rel>.mjs`.
- Source uses erasable syntax only: no `enum`, no value `namespace`, no constructor parameter properties.
- No behavior change in any tool. No harness test is edited except to satisfy lint.
- Never edit `skills/*/assets/**` or `.agents/harness/**` by hand. The build writes the first; a tool's `update` writes the second.
- pnpm is the only package manager: no `npm` or `npx` in scripts, workflows or docs for contributors. Keep pnpm's default `node_modules` layout; do not enable the global virtual store (design D0).
- Dev dependencies are pinned to exact versions (no `^` or `~`). `@types/node` stays on major 22.
- Header line, exact: `// Generated from src/<path> by scripts/build.mts. Do not edit.`
- Style: two spaces, single quotes, semicolons, line width 120.
- The verify gate is live in this repository: every edit runs the verify script for that file, and every turn end runs the full checks and blocks while they fail. End every step with the tree passing. Whenever a step changes bytes under `skills/*/assets/`, finish it with `pnpm run harness:update`.
- A tool's `update` accepts new bytes under an unchanged version, so one patch bump per tool covers the whole pull request.
- Commits follow Conventional Commits (`python3 scripts/skills.py install-hooks` once per clone).

## Review Focus

Each line names the task that owns its test.

1. **A source file with a syntax error.** The build should exit non-zero and name the source file, not print a bare stack trace. Task 3.
2. **Specifier forms beyond a plain import.** `export * from './x.mts'`, a side-effect `import './x.mts'`, a multi-line import list and `await import('./x.mts')` must all be rewritten. Task 3.
3. **A dynamic import that is not a string literal.** ``import(`./${name}.mts`)`` cannot be rewritten; the build should fail and say so, not ship a broken path. Task 3.
4. **Biome is not installed** (`pnpm install --frozen-lockfile` was not run). The build should say to run `pnpm install --frozen-lockfile`. Task 3.
5. **CRLF line endings in a source file.** The emitted file should use LF, so output does not depend on the checkout's settings. Task 3.

---

### Task 1: Preconditions [tasks 1.1, 1.2]

**Files:**
- Modify: `openspec/design/archive/2026-11-agent-harness/rfc-split-agent-harness-into-node-skills.md`

- [x] **Step 1: Check the base.** PR #54 is merged and the branch is fast-forwarded to `36f0886`.
- [ ] **Step 2: Refresh.** `git fetch origin && git rebase origin/main`, in case `main` moved again. Then `ls skills/agent-harness-hook-runtime/assets/hook-runtime/lib/runtime.mjs tests/agent-harness scripts/verify.mjs` must succeed. If `main` gained new files under `skills/agent-harness-*/assets/`, `scripts/*.mjs` or `tests/agent-harness/`, add them to the moves in Tasks 4 and 5.
- [ ] **Step 3: Record a baseline.** Run `npm ci && npm test` (the switch to pnpm comes in Task 1A) and `python3 -m unittest discover -s scripts -p 'test_*.py'`. Both must pass before any edit. Note the test count printed by `pnpm test`. `tests/agent-harness/` holds 22 `*.test.mjs` files today; 20 remain after this plan (`shared-lib` is deleted, `repo-verify` moves to `scripts/`).
- [ ] **Step 4: Amend the RFC.** Invoke the `feature-rfc:feature-rfc` skill in amend mode. Change the "Node only" bullet to: "**Node only.** All copied code is plain `.mjs`, with no build step in the target repo. Its source is TypeScript in this repository, and the built files are committed here." Leave the Goals line "The copied code has no npm dependencies and runs on Node 22 or newer" as it is; it still holds. Add a review-log entry dated today that links this change.
- [ ] **Step 5: Get the owner's approval** of the amended wording in this thread. No approval: stop.
- [ ] **Step 6: Commit.** `git commit -m "docs: amend the harness RFC to allow a build in this repository"`

### Task 1A: Switch to pnpm [tasks 1.3 to 1.6]

**Files:**
- Modify: `package.json`, `scripts/verify.mjs`, `tests/agent-harness/repo-verify.test.mjs`, `.github/workflows/validate.yml`, `.github/workflows/release.yml`, `AGENTS.md`, `README.md`
- Create: `pnpm-lock.yaml`
- Delete: `package-lock.json`

**Interfaces:**
- Produces: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm exec <bin>`, `pnpm run <script>` for every later task.

- [ ] **Step 1: Check pnpm.** `pnpm --version` prints `12.18.0`. Another version: use that exact version in Step 2 and say so in the commit body.
- [ ] **Step 2: Convert the lockfile.** Add `"packageManager": "pnpm@12.18.0"` to `package.json`. Run `pnpm import` (reads `package-lock.json`, writes `pnpm-lock.yaml` with the same resolved versions). `git rm package-lock.json`. `rm -rf node_modules && pnpm install --frozen-lockfile`.
- [ ] **Step 3: Watch the expected failure.** `node --test scripts/test-release-rules.mjs` fails with `ERR_MODULE_NOT_FOUND` for `@semantic-release/commit-analyzer`.
- [ ] **Step 4: Add the two direct dependencies.** `pnpm add -D -E @semantic-release/commit-analyzer@14.0.0-beta.5 @semantic-release/release-notes-generator@15.0.0-beta.4`. First confirm both versions against `pnpm-lock.yaml` (`grep -n "commit-analyzer@\|release-notes-generator@" pnpm-lock.yaml`); if the lock resolves other versions, use those. `git diff pnpm-lock.yaml` must show no other package changing version.
- [ ] **Step 5: Point the verify script at pnpm.** In `scripts/verify.mjs`, `['npm', 'test']` becomes `['pnpm', 'test']`; make the same change in the expectation at `tests/agent-harness/repo-verify.test.mjs:29`. Leave the `npm test` strings in `cli-verify.test.mjs` and `verify-handler.test.mjs`: they are sample commands, not this repo's.
- [ ] **Step 6: Verify locally.** `pnpm test`: 312 tests pass. `python3 -m unittest discover -s scripts -p 'test_*.py'` passes. `node scripts/verify.mjs` exits 0.
- [ ] **Step 7: Workflows.** In the `validate` job of `validate.yml` and the `release` job of `release.yml`, add before `actions/setup-node`:

```yaml
      - uses: pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6.1.1
```

  (no `version` input: the action reads `packageManager`). Confirm the commit with `gh api repos/pnpm/action-setup/commits/v6.1.1 -q .sha` before committing. Then replace `npm ci` with `pnpm install --frozen-lockfile`, `npm test` with `pnpm test`, `npx semantic-release` with `pnpm exec semantic-release`, and both `npx -y @anthropic-ai/claude-code@2.1.330` with `pnpm dlx @anthropic-ai/claude-code@2.1.330`. Do not touch the `harness-node22` job or the `pages` job. Check `.releaserc.json` for `npm` or `npx` in its commands and change any the same way.
- [ ] **Step 8: Docs.** `AGENTS.md` workflow item 3: `pnpm test` and `pnpm install --frozen-lockfile`. `README.md`: the layout line for `package.json`, a line on installing pnpm (`npm install -g pnpm@12.18.0` or the installer from pnpm.io), and the release dry-run command with `pnpm exec`. Leave the `npx skills add` lines.
- [ ] **Step 9: Commit and check CI.** `git commit -m "build: switch from npm to pnpm"`, push, and confirm the `Validate skills` workflow is green before starting Task 2, because the workflow change cannot be tested locally. The `release` job runs only on manual dispatch; say in the PR description that it is untested until the next release.

### Task 2: Tooling [tasks 2.1 to 2.4]

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `biome.json`, `tsconfig.json`, `tsconfig.tests.json`

**Interfaces:**
- Produces: package scripts `build`, `build:check`, `typecheck`, `lint`, `format`, `check`, `harness:update`, `test`; the Biome binary at `node_modules/.bin/biome`.

- [ ] **Step 1: Install.** `pnpm add -D -E typescript @biomejs/biome @types/node@22`. Check `package.json` shows three exact versions and `@types/node` starts with `22.`.
- [ ] **Step 2: Write `biome.json`.** Formatter: `indentStyle: space`, `indentWidth: 2`, `lineWidth: 120`; JavaScript formatter `quoteStyle: single`, `semicolons: always`. Linter: recommended rules. Files: ignore `skills/*/assets/**`, `.agents/harness/**`, `openspec/**`, `tests/**/fixtures/**`, `pnpm-lock.yaml`, `node_modules/**`. Use the include/ignore keys of the installed Biome version (`pnpm exec biome init` prints the current schema).
- [ ] **Step 3: Write `tsconfig.json`.** `compilerOptions`: `noEmit`, `strict`, `module: nodenext`, `moduleResolution: nodenext`, `target: es2023`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `types: ["node"]`, `skipLibCheck`, `rootDirs: ["src/hook-runtime", "src/verify-gate", "src/shared"]` (design D2), `allowJs` with `checkJs: false`. `include`: `src/**/*.mts`, `scripts/**/*.mts`, `scripts/**/*.d.ts`.
- [ ] **Step 4: Write `tsconfig.tests.json`.** `extends: ./tsconfig.json`; `allowJs`, `checkJs`, `strict: false`; `include`: `tests/**/*.mjs`.
- [ ] **Step 5: Set the package scripts** exactly as the table in design D6. `harness:update` is `pnpm run build && node skills/agent-harness-hook-runtime/assets/hook-runtime/cli.mjs update && node skills/agent-harness-verify-gate/assets/verify-gate/cli.mjs update` (without `--repo`, `update` uses the checkout around the current directory). Until Task 5 renames the scripts, `test` keeps the current `.mjs` paths under `scripts/`.
- [ ] **Step 6: Verify.** `pnpm exec tsc --version` and `pnpm exec biome --version` print versions. `pnpm test` still passes with the baseline count.
- [ ] **Step 7: Commit.** `git commit -m "build: add TypeScript and Biome"`

### Task 3: Build script [tasks 3.1 to 3.3]

**Files:**
- Create: `scripts/build.mts`, `scripts/test-build.mts`, `src/build.json`
- Modify: `package.json` (add `scripts/test-build.mts` to `test`)

**Interfaces:**
- Produces, all exported from `scripts/build.mts`:

```ts
export interface ToolEntry { skill: string; shared: string[] }
export interface Manifest { tools: Record<string, ToolEntry> }
export type ProblemKind = 'differs' | 'missing' | 'stale';
export interface Problem { path: string; kind: ProblemKind } // path is relative to root, POSIX separators
export class BuildError extends Error {}

/** Rewrites relative specifiers ending in .mts to .mjs. Throws BuildError on a relative dynamic import that is not a string literal. */
export function rewriteSpecifiers(js: string, sourcePath: string): string;
/** Strip, rewrite, format, add the header. sourcePath is relative to root, for the header and for errors. */
export function emitModule(source: string, sourcePath: string, biomeBin: string, biomeConfigDir: string): string;
/** Every output file of the build: path relative to root -> bytes. Throws BuildError. */
export function planBuild(root: string, opts?: { biomeBin?: string; biomeConfigDir?: string }): Map<string, Buffer>;
export function checkBuild(root: string, opts?: { biomeBin?: string; biomeConfigDir?: string }): Problem[];
/** Writes changed files, deletes stale ones, returns the paths it touched. */
export function writeBuild(root: string, opts?: { biomeBin?: string; biomeConfigDir?: string }): string[];
export function main(argv: string[], root?: string): number; // 0 ok, 1 problems or BuildError
```

`biomeBin` defaults to `<repo>/node_modules/.bin/biome` and `biomeConfigDir` to the repo root, both resolved from `import.meta.url`, so a fixture root in a temp folder is formatted with the repo's config.

- [ ] **Step 1: Write the failing tests** in `scripts/test-build.mts`. A helper `fixture(files: Record<string, string>): string` writes the files into a temp folder and returns it. One test per line; each builds a fixture with a `src/build.json` mapping tool `t1` to skill `s1` (and `t2` to `s2` where two tools are needed):

| Test name | Arrange | Assert |
|---|---|---|
| emits a module to the skill assets | `src/t1/lib/a.mts` | `planBuild` has key `skills/s1/assets/t1/lib/a.mjs` |
| copies a data file byte for byte | `src/t1/tool.json` = `{"name": "t1"}` | output bytes equal input bytes |
| fails on a tool missing from the manifest | folder `src/t9/` | throws `BuildError` whose message contains `src/t9` |
| emits a shared file into every tool that lists it | `src/shared/lib/c.mts`, both tools list `lib/c.mts` | both outputs exist and are equal |
| fails on a shared and own file collision | `src/t1/lib/c.mts` and shared `lib/c.mts` | throws; message contains `skills/s1/assets/t1/lib/c.mjs` |
| rewrites import specifiers | `import { b } from './b.mts';` | output contains `from './b.mjs'` |
| rewrites every specifier form | `export * from './b.mts'`, `import './b.mts'`, a three-line import list, `await import('./b.mts')` | no `.mts` left in the output |
| leaves a non-specifier string alone | `const s = 'run scripts/build.mts';` | output contains that literal |
| fails on a template-literal dynamic import | ``import(`./${n}.mts`)`` | throws; message contains the source path |
| fails on an npm-package specifier | `import ts from 'typescript';` | throws; message contains the source path and `typescript` |
| fails on a cross-tool import | `src/t2/a.mts` imports `./lib/only-t1.mts`, which exists only under `src/t1/lib/` | throws; message contains `skills/s2/assets/t2/a.mjs` |
| rootDirs matches the manifest | read the repo's `tsconfig.json` and `src/build.json` | `rootDirs` equals `src/<tool>` for every tool, plus `src/shared` |
| fails on an unresolved specifier | `import { x } from './x.types.mts'` (value import) | throws; message contains the importing output path and `./x.types.mjs` |
| does not emit a type-only file | `src/t1/lib/h.types.mts` | no key ending `h.types.mjs` |
| starts each module with the header | `src/t1/lib/a.mts` | first line equals `// Generated from src/t1/lib/a.mts by scripts/build.mts. Do not edit.` |
| keeps comments and blank lines | a function with a comment and a blank line between two statements | both are present, in order, in the output |
| removes type syntax | an interface, a typed parameter, `as`, `satisfies`, `import type` | output parses with `node --check` and contains none of `interface`, `: string`, `satisfies` |
| names the file on a syntax error | `src/t1/lib/a.mts` = `export const = ;` | throws; message contains `src/t1/lib/a.mts` |
| emits LF for a CRLF source | source with `\r\n` | output contains no `\r` |
| says to run pnpm install when Biome is missing | `biomeBin` = a path that does not exist | throws; message contains `pnpm install` |
| check passes on a fresh build | `writeBuild` then `checkBuild` | `[]` |
| check reports differs, missing and stale | edit one output, delete one, add `skills/s1/assets/t1/old.mjs` | three problems with those kinds and paths |
| write deletes stale files | add `skills/s1/assets/t1/old.mjs`, `writeBuild` | file is gone |
| a second build changes nothing | `writeBuild` twice | second call returns `[]` |
| main --check exits 1 and prints the kinds | stale fixture | return value 1; stdout has a line `stale skills/s1/assets/t1/old.mjs` |

- [ ] **Step 2: Run them.** `node --test scripts/test-build.mts`. Expected: fails, `scripts/build.mts` not found.
- [ ] **Step 3: Implement `scripts/build.mts`** to the interface above. Decisions the tests do not fix:
  - Strip with `stripTypeScriptTypes(source, { mode: 'strip' })` from `node:module`. Normalize `\r\n` to `\n` first.
  - Suppress only that API's warning: wrap the call so `process.emitWarning` drops a warning whose name is `ExperimentalWarning` and whose message mentions `stripTypeScriptTypes`, and restore it afterwards.
  - Rewrite with a regular expression over specifier positions only: after `from`, after a bare `import` keyword followed by a quote, and inside `import(` with a quoted literal; relative specifiers only (start with `./` or `../`).
  - Format by running `biomeBin` with `format --config-path=<biomeConfigDir> --stdin-file-path=<source path with .mjs in place of .mts>`, source on stdin. Do not pass the output path: output folders are ignored in `biome.json`. A spawn error with code `ENOENT`: `BuildError` "Biome is not installed: run pnpm install".
  - Walk `src/<tool>/` and skip dotfiles. Sort every list, so the build is deterministic.
  - Only files under `skills/<skill>/assets/<tool>/` for tools in the manifest can be `stale`.
  - `main` prints one line per problem, `<kind> <path>`, and one summary line; with no flag it prints each written path.
  - End the file with `if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));`
- [ ] **Step 4: Run the tests.** `node --test scripts/test-build.mts`. Expected: all pass.
- [ ] **Step 5: Add `src/build.json`** with the content shown in design D2, and add `scripts/test-build.mts` to the `test` script.
- [ ] **Step 6: Verify.** `pnpm exec tsc -p tsconfig.json` reports no error in `scripts/build.mts` and `scripts/test-build.mts`; `pnpm exec biome check scripts/build.mts scripts/test-build.mts` is clean. `pnpm run build` fails for now with "src/hook-runtime not found" or builds nothing; either is fine until Task 4.
- [ ] **Step 7: Commit.** `git commit -m "build: add the type-stripping build for shipped harness code"`

### Task 4: Convert the shipped harness code [tasks 4.1 to 4.7]

**Files:**
- Move: `skills/agent-harness-hook-runtime/assets/hook-runtime/**` to `src/hook-runtime/**` (`.mjs` becomes `.mts`)
- Move: `skills/agent-harness-verify-gate/assets/verify-gate/**` to `src/verify-gate/**`
- Move: `lib/config`, `lib/state`, `lib/install` to `src/shared/lib/` (one copy; delete the other)
- Create: `src/shared/lib/handler.types.mts`, `src/shared/lib/lock.types.mts`, `src/shared/lib/config.types.mts`
- Delete: `tests/agent-harness/shared-lib.test.mjs`
- Modify: `tsconfig.json` only if a tool folder name differs from the `rootDirs` set in Task 2
- Regenerated: `skills/agent-harness-*/assets/**`, `.agents/harness/**`

**Interfaces:**
- Consumes: `pnpm run build`, `pnpm run build:check` from Task 3.
- Produces, in `src/shared/lib/handler.types.mts`, copied from the RFC's Hook handler interface:

```ts
export type HarnessEvent = 'tool.before' | 'tool.after' | 'prompt' | 'turn.end' | 'compact' | 'session.start';
export type HandlerResult = { deny: string } | { context: string } | { block: string };
export interface HandlerContext { repoRoot: string; sessionId: string; agentContextId: string; deadline: number; stateDir: string }
export type ProofCheck = (context: HandlerContext) => string | null | Promise<string | null>;
export interface Handler {
  name: string;
  events: readonly HarnessEvent[];
  handle(event: HarnessEventPayload, context: HandlerContext): HandlerResult | null | Promise<HandlerResult | null>;
  proofs?: Record<string, ProofCheck>;
}
```

`HarnessEventPayload` and the exact field names of `HandlerContext` are taken from what `runtime.mjs` passes today; where the code and the block above differ, the code wins and the type follows it.

- [ ] **Step 1: Move the files** with `git mv`, changing nothing except import specifiers (`.mjs` to `.mts`). Before deleting the second copy of each shared file, confirm `cmp` reports the two copies identical. Delete `tests/agent-harness/shared-lib.test.mjs`. Raise the patch version in `src/hook-runtime/tool.json` and `src/verify-gate/tool.json` (0.1.1 to 0.1.2). Run `pnpm run harness:update`, then both tools' `check` and `node --test "tests/agent-harness/*.test.mjs"`: plain JavaScript is valid input for the stripper, so everything passes now, before any type exists. Do the move, the build and the update inside one turn, because the turn-end hook runs `vendored.test.mjs`. Commit: `refactor: move harness source to src/ and build it`. The type check stays red until Step 4.
- [ ] **Step 2: Add the three type files.** `lock.types.mts`: `LockFile { version: 1; tools: Record<string, { version: string; files: Record<string, string> }> }`. `config.types.mts`: the shape `readHarnessConfig` returns today.
- [ ] **Step 3: Annotate `src/shared/` and `src/hook-runtime/`.** Run `pnpm exec tsc -p tsconfig.json` and work through the errors file by file. Most annotations leave the built bytes unchanged; when one does change them, `pnpm run harness:update` before the turn ends. Rules: type function parameters and exported return values; replace `= {}` option defaults with a named options interface; raw host payloads are `unknown` and narrowed with the existing `isObject` checks, never cast wholesale; catch variables narrow with `instanceof Error`. Do not change control flow.
- [ ] **Step 4: Annotate `src/verify-gate/`** the same way. Expected at the end: `pnpm exec tsc -p tsconfig.json` prints nothing for `src/`.
- [ ] **Step 5: Build.** `pnpm run harness:update`, then `pnpm run build:check` exits 0.
- [ ] **Step 6: Review the built diff.** `git diff --stat -- skills/` then read `git diff -- skills/`. Allowed differences: the header line, formatting, and removal of the duplicate-file distinction. Any changed expression, string or control flow is a conversion mistake: fix the source and rebuild.
- [ ] **Step 7: Confirm the install.** `node .agents/harness/hook-runtime/cli.mjs check` and `node .agents/harness/verify-gate/cli.mjs check` exit 0, and `.agents/harness/lock.json` shows version 0.1.2 for both tools.
- [ ] **Step 8: Test on both Node versions.** `node --test "tests/agent-harness/*.test.mjs"` on the `.nvmrc` Node: all pass; 21 test files run (22 minus `shared-lib`). Then with Node 22.0.0 (`pnpm dlx node@22.0.0 --test "tests/agent-harness/*.test.mjs"`): all pass.
- [ ] **Step 9: Commit.** `git commit -m "refactor: type the harness tools and build them from src/"`

### Task 5: Convert the repo scripts [tasks 5.1 to 5.3]

**Files:**
- Move: `scripts/project-ready.mjs`, `scripts/verify.mjs`, `scripts/test-project-ready.mjs`, `scripts/test-release-rules.mjs`, `scripts/test-release-lifecycle.mjs` to `.mts`
- Move: `tests/agent-harness/repo-verify.test.mjs` to `scripts/test-verify.mts`. It imports the verify script, and `tests/agent-harness/` runs on Node 22.0.0, which cannot load `.mts`
- Create: `scripts/untyped-modules.d.ts` with `declare module '@semantic-release/commit-analyzer';` and `declare module '@semantic-release/release-notes-generator';` (neither ships types)
- Modify: `package.json`, `.github/workflows/project-ready.yml`, `.agents/harness.json`, `AGENTS.md`, `README.md`

**Interfaces:**
- Produces, from `scripts/verify.mts` (names kept from today's file):

```ts
export const FULL_CHECKS: string[][];
export function editChecks(relPath: string): string[][];
```

- [ ] **Step 1: Move and fix references.** `git mv` the six files; in `scripts/test-verify.mts` fix the relative paths and import `runNode` from `../tests/agent-harness/helpers.mjs`; update the other imports; update every reference listed under Files. `.agents/harness.json` `command` becomes `["node", "scripts/verify.mts"]`. Rename the verify script and change that command in one shell command, since the edit hook calls the script by the configured path.
- [ ] **Step 2: Write the failing tests** for the new verify behavior, in `scripts/test-verify.mts`:

| Test name | Assert |
|---|---|
| full checks include pnpm run check | `FULL_CHECKS` contains `['pnpm', 'run', 'check']` and no longer contains `['pnpm', 'test']` |
| edit of a source file lints it and builds | `editChecks('src/verify-gate/lib/run.mts')` deep-equals `[[BIOME, 'check', 'src/verify-gate/lib/run.mts'], ['node', 'scripts/build.mts']]`, where `BIOME` is `'node_modules/.bin/biome'` |
| edit of a repo script lints it | `editChecks('scripts/build.mts')` deep-equals `[[BIOME, 'check', 'scripts/build.mts']]` |
| edit of a harness test lints it | `editChecks('tests/agent-harness/run.test.mjs')` deep-equals `[[BIOME, 'check', 'tests/agent-harness/run.test.mjs']]` |
| edit of a generated file runs the build check | `editChecks('skills/agent-harness-verify-gate/assets/verify-gate/cli.mjs')` contains `['node', 'scripts/build.mts', '--check']` and no `biome` entry |
| edit of an installed copy is not linted | `editChecks('.agents/harness/verify-gate/cli.mjs')` has no `biome` entry |

- [ ] **Step 3: Run them** and watch them fail.
- [ ] **Step 4: Implement** in `scripts/verify.mts`. The existing `node --check` entry for `.mjs` files is replaced by the Biome entry; the `skills/` validator entry stays.
- [ ] **Step 5: Annotate** the six files until `pnpm exec tsc -p tsconfig.json` is clean.
- [ ] **Step 6: Verify.** `pnpm test` passes. `grep -rn "\.mts" tests/agent-harness` prints nothing. `grep -rn "scripts/[a-z-]*\.mjs" . --exclude-dir=node_modules --exclude-dir=openspec --exclude-dir=.git --exclude=pnpm-lock.yaml` prints nothing.
- [ ] **Step 7: Commit.** `git commit -m "refactor: move repo scripts to TypeScript"`

### Task 6: Lint and format the rest [tasks 6.1, 6.2]

**Files:**
- Modify: files under `src/`, `scripts/`, `tests/` as Biome and `tsc` report; `biome.json` only to disable a rule

- [ ] **Step 1: Format.** `pnpm run format`. Then `pnpm run build` and confirm `git diff --stat -- skills/` shows changes only where source formatting changed.
- [ ] **Step 2: Lint.** `pnpm run lint`. Fix findings by hand. A rule that fights the existing style across many files is disabled in `biome.json` with a one-line comment giving the reason; do not rewrite working code to please a style rule.
- [ ] **Step 3: Type-check the tests.** `pnpm exec tsc -p tsconfig.tests.json`; fix what it reports with JSDoc hints or small corrections, never by changing an assertion.
- [ ] **Step 4: If any shipped byte changed** since Task 4, run `pnpm run harness:update` (no second version bump inside this PR).
- [ ] **Step 5: Verify.** `pnpm run check` exits 0.
- [ ] **Step 6: Commit.** `git commit -m "style: format and lint the Node code"`

### Task 7: CI and documentation [tasks 7.1 to 7.5]

**Files:**
- Modify: `.github/workflows/validate.yml`, `AGENTS.md`, `README.md`, `skills/agent-harness-hook-runtime/SKILL.md`, `skills/agent-harness-verify-gate/SKILL.md`

- [ ] **Step 1: `validate.yml`.** In the `validate` job, after "Install Node dependencies", add three steps: `pnpm run build:check`, `pnpm run typecheck`, `pnpm run lint`. Leave `harness-node22` as it is.
- [ ] **Step 2: `AGENTS.md`.** Add a short "Node code" section: the three classes of code from design D1; never edit `skills/*/assets/` or `.agents/harness/` by hand; the sequence edit `src/`, `pnpm run build`, bump `src/<tool>/tool.json`, run the tool's `update`. Add `pnpm run check` to the Workflow list in place of `pnpm test`. Keep the file within its current length budget.
- [ ] **Step 3: `README.md`.** Update the layout block (around lines 101 to 112: add `src/`, `scripts/build.mts`, `biome.json`, `tsconfig.json`; rename the listed `scripts/test-release-*.mjs` to `.mts`) and the development commands.
- [ ] **Step 4: Skills.** Search both `SKILL.md` files for "no build", "hand-written" and `.mjs` source statements; correct any that are now wrong. If either file changes, run `python3 scripts/skills.py validate`.
- [ ] **Step 5: Specs.** `openspec validate add-typescript-build-system --strict` passes, so the `harness-tool-install` delta still matches the headers in `openspec/specs/harness-tool-install/spec.md`.
- [ ] **Step 6: Commit.** `git commit -m "ci: run the build check, type check and lint"`

### Task 8: Final checks [tasks 8.1 to 8.4]

- [ ] **Step 1:** `pnpm run check` exits 0.
- [ ] **Step 2:** `python3 scripts/skills.py validate`, `python3 -m unittest discover -s scripts -p 'test_*.py'` and `pnpm dlx @anthropic-ai/claude-code@2.1.330 plugin validate .` all exit 0.
- [ ] **Step 3:** The grep from Task 5 Step 6 prints nothing.
- [ ] **Step 3a:** `grep -rn "npm ci\|npm test\|npm run\|npx \|package-lock" .github scripts/*.mts AGENTS.md` prints nothing, and in `README.md` the only `npx` lines left are the `npx skills add` instructions for users.
- [ ] **Step 4:** Fresh clone, Node 22.0.0 only: `git clone . "$TMP/fresh" && cd "$TMP/fresh" && pnpm dlx node@22.0.0 --test "tests/agent-harness/*.test.mjs"`. Expected: all pass, with no `node_modules` folder present.
- [ ] **Step 5:** Edit one character in a generated file, run `pnpm run build:check`, see it fail naming that file with `differs`, then `git checkout` the file.
