## Why

The repository is gaining thousands of lines of Node code (the agent harness tools and their tests) with no type check, no linter and no formatter. A trial strict type check of the harness code now on `main` reports 872 errors, and three library files are kept identical across tools by a test. Harness milestone M2 ports a 2,194-line rule engine next, so the tooling should be in place before that code is written. The outcome: TypeScript source, checked on every edit and in CI, while target repos keep receiving plain dependency-free `.mjs`.

## What Changes

**Source language of shipped harness code**
- From: hand-written `.mjs` under `skills/<skill>/assets/<tool>/`.
- To: `.mts` under `src/<tool>/`, built into the same `.mjs` paths; the built files are committed.
- Reason: real type syntax and one source for shared files.
- Impact: non-breaking for target repos. File names, layout and the Node 22.0.0 floor are unchanged; file bytes change once, so each tool gets a patch version.

**Shared library files**
- From: `config`, `state` and `install` copied by hand into each tool and compared by a test.
- To: one copy under `src/shared/`, emitted into each tool by the build.
- Reason: remove hand-kept duplication.
- Impact: non-breaking.

**Repo-only scripts**
- From: `scripts/*.mjs`.
- To: `scripts/*.mts`, run directly by Node 26.
- Reason: same language and checks everywhere.
- Impact: paths change in `package.json`, two workflows and `.agents/harness.json`.

**Package manager**
- From: npm with `package-lock.json`.
- To: pnpm with `pnpm-lock.yaml`, pinned by `packageManager` in `package.json`.
- Reason: the owner works in many worktrees of this repo, and pnpm installs into each from a shared store.
- Impact: contributors and CI need pnpm. Two packages the release tests import become direct dev dependencies.

**Additions**
- `scripts/build.mts` with a `--check` mode, and `src/build.json`.
- Strict `tsc --noEmit`, Biome lint and format, wired into `pnpm run check`, `scripts/verify.mts` and `validate.yml`.
- An amendment to the harness RFC's "Node only" decision: no build step in the target repo; the source is TypeScript, built here.

**Removals**
- `tests/agent-harness/shared-lib.test.mjs`, replaced by the build.

## Capabilities

### New Capabilities
- `harness-source-build`: how TypeScript source under `src/` becomes the committed `.mjs` files that skills ship, and how drift between them is detected.
- `code-quality-checks`: the type check, lint and format checks that run locally, on agent hooks and in CI.
- `node-package-management`: pnpm as the package manager, its lockfile, and how CI installs.

### Modified Capabilities

- `board-onboarding`: the scenario "Validators accept the skill" names `pnpm test` in place of `npm test`.
- `harness-tool-install`: "Dependency-free Node tools" adds that copied code is generated from TypeScript source and never edited by hand; "This repository is onboarded" changes the verify command to `node scripts/verify.mts`.

## Impact

- **Code**: every file under `skills/agent-harness-*/assets/` becomes generated; new `src/`, `scripts/build.mts`, `tsconfig.json`, `biome.json`; `scripts/*.mjs` renamed.
- **Dependencies**: pnpm replaces npm. Five new dev dependencies, pinned exactly: `typescript`, `@types/node`, `@biomejs/biome`, and the two semantic-release plugins that were reachable only through npm's hoisting. No dependency is added to shipped code.
- **CI**: `validate.yml` gains lint, type check and build check steps. The Node 22.0.0 job is unchanged and still needs no `pnpm install --frozen-lockfile`.
- **Docs**: `AGENTS.md`, `README.md`, the harness RFC.
- **Other repos**: none until they next run a tool's `update`.
- **Ordering**: PR #54 (the harness M1 code) and PR #55 are merged and this branch is on top of them. The change should land before harness M2 starts.
- **Live hooks**: the verify gate now runs in this repository on every edit and at turn end, so each step of the conversion must leave the tree passing.
