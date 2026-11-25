## Context

- **Shipped code.** `main` holds two harness tools, `hook-runtime` and `verify-gate`, as hand-written `.mjs` under `skills/agent-harness-<name>/assets/<tool>/`. A tool's `install` and `update` commands copy that folder into `.agents/harness/<tool>/` of a target repo and record a sha256 per file in `.agents/harness/lock.json`. This repo is itself a target: it holds an installed copy, and `tests/agent-harness/vendored.test.mjs` fails when that copy differs from the skill's.
- **Frozen by the harness RFC.** The vendored layout, the `.mjs` entry names in each repo's hook config, no npm dependencies in copied code, and Node 22 or newer. CI runs the harness tests on Node 22.0.0 with no `pnpm install --frozen-lockfile`.
- **Live hooks.** The verify gate is installed here (`.claude/settings.json`, `opencode.json`). An agent's edit runs `node scripts/verify.mjs` for that file, and every turn end runs the full checks and blocks the agent while they fail. `update` accepts changed bytes under an unchanged version, so the installed copy can be refreshed as often as needed.
- **Existing specs.** `openspec/specs/harness-tool-install` requires copied code to be plain `.mjs` and names `node scripts/verify.mjs` as this repo's verify command.
- **Repo-only code.** `scripts/project-ready.mjs`, `scripts/verify.mjs` and three `scripts/test-*.mjs` files run only here, on the Node version in `.nvmrc` (26.13.1).
- **Distribution.** The marketplace entry and the Pages catalog both take the skill folder from git, so whatever ships must be committed.
- **Measured.** See "Evidence gathered" in `brainstorm.md`.

## Goals / Non-Goals

**Goals:**
- Shipped harness code and repo scripts are written in strict TypeScript.
- A target repo receives the same paths, plain `.mjs`, no dependencies, Node 22.0.0.
- A built file reads like its source: same comments, same blank lines between statements, same formatting. Line numbers can differ, because lines that held only types are removed.
- One command (`pnpm run check`) runs build check, type check, lint and tests; the verify gate and CI run the same checks.
- Shared library files have one source.

**Non-Goals:**
- Converting `tests/agent-harness/*.test.mjs` to TypeScript.
- Bundling, minifying or down-levelling.
- Converting the Python scripts.
- Changing any tool's behavior.
- A watch mode.

## Decisions

### D0. pnpm is the package manager

Decided by the owner: worktrees are created constantly here, and pnpm installs into a new worktree from a shared store of hard links.

- `package.json` gets `"packageManager": "pnpm@12.18.0"`. `pnpm-lock.yaml` replaces `package-lock.json`, created with `pnpm import` so every resolved version stays the same.
- **Two packages become direct dependencies.** `scripts/test-release-rules.mjs` imports `@semantic-release/commit-analyzer` and `@semantic-release/release-notes-generator`, which are dependencies of `semantic-release`, not of this repo. npm exposes them by hoisting; pnpm does not. They are added as exact dev dependencies at the versions the lock already resolves (14.0.0-beta.5 and 15.0.0-beta.4).
- **CI** installs pnpm with `pnpm/action-setup`, pinned by commit like every other action, reading the version from `packageManager`. Node 26 no longer bundles Corepack, so Corepack is not an option. The Node 22.0.0 job installs nothing and is unchanged.
- **Commands.** `npm ci` becomes `pnpm install --frozen-lockfile`, `npm run x` becomes `pnpm run x`, `npx <installed bin>` becomes `pnpm exec`, `npx -y <package>` becomes `pnpm dlx`. The README's `npx skills add` lines are instructions for users of the skills and stay.
- **`scripts/test_skills.py` keeps `npx`** for its one optional Claude Code validation test. It skips when `npx` is absent, and `npx` ships with Node.
- **pnpm's global virtual store is not enabled.** It links `node_modules` straight into the shared store, which would make a worktree install faster still. Measured in a copy of this repo: three of the release lifecycle tests fail with it, because semantic-release then cannot find `@semantic-release/exec` from its own location. The default layout passes.

Measured in a copy of `main` at `36f0886` with pnpm 12.18.0: after the two packages were added, all 312 Node tests and the Python tests pass; a warm install takes about 0.3 s.

### D1. Three classes of code, one rule each

| Class | Where | Extension | How it runs |
|---|---|---|---|
| Shipped | `src/<tool>/`, `src/shared/` | `.mts` | built to `.mjs`, committed |
| Repo-only | `scripts/` | `.mts` | `node scripts/<name>.mts` on Node 26 |
| Tests of shipped code | `tests/agent-harness/` | `.mjs` | `node --test`, against the built files |
| Tests of repo-only code | `scripts/test-*.mts` | `.mts` | `node --test` on Node 26 |

Tests of shipped code stay JavaScript because they must run on Node 22.0.0, which cannot run TypeScript, and because testing the built files tests what ships. Alternative: build the tests too. Rejected: a second output tree for no gain in what is verified.

Nothing under `tests/agent-harness/` may import a `.mts` file, because that folder runs on Node 22.0.0. `tests/agent-harness/repo-verify.test.mjs` imports `scripts/verify.mjs` today, so it moves to `scripts/test-verify.mts`.

### D2. Source layout and manifest

```
src/
  build.json
  shared/lib/config.mts  state.mts  install.mts  *.types.mts
  hook-runtime/   claude.mts  cli.mts  lib/*.mts  opencode/index.mts  tool.json
  verify-gate/    cli.mts  handler.mts  lib/*.mts  tool.json
```

`src/build.json`:

```json
{
  "tools": {
    "hook-runtime": { "skill": "agent-harness-hook-runtime", "shared": ["lib/config.mts", "lib/state.mts", "lib/install.mts"] },
    "verify-gate":  { "skill": "agent-harness-verify-gate",  "shared": ["lib/config.mts", "lib/state.mts", "lib/install.mts"] }
  }
}
```

- A file `src/<tool>/<rel>.mts` is emitted to `skills/<skill>/assets/<tool>/<rel>.mjs`.
- A shared entry `<rel>.mts` is read from `src/shared/<rel>.mts` and emitted to the same relative path in each tool that lists it. A tool file and a shared file with the same output path is a build error.
- A `.json` file under `src/<tool>/` (today only `tool.json`) is copied byte for byte. Any other file that is not `.mts` is a build error naming it: a `.ts`, a hand-written `.mjs` or a declaration file would otherwise ship unchecked (found in the final review).
- A file named `*.types.mts` is never emitted. `verbatimModuleSyntax` forces it to be imported with `import type`, which the stripper removes.

A tool file imports a shared file with the specifier it has after emission: `src/hook-runtime/lib/runtime.mts` writes `./config.mts`, although the file is `src/shared/lib/config.mts`. `tsconfig.json` makes that resolve with `rootDirs: ["src/hook-runtime", "src/verify-gate", "src/shared"]`, which overlays the folders for relative imports (checked with `tsc` 7.0.2). The overlay would also let one tool import the other's files; the build's specifier check rejects that, because the file is not emitted into the importing tool. A new tool adds its folder to `rootDirs`, and a build test fails when `rootDirs` and `src/build.json` disagree.

### D3. The build pipeline

For each `.mts` file, in `scripts/build.mts`:

1. Strip the types with `module.stripTypeScriptTypes(source, { mode: 'strip' })`.
2. Rewrite relative specifiers ending in `.mts` to `.mjs` in `import`, `export … from` and dynamic `import()` with a string literal.
3. Format with Biome (`biome format --stdin-file-path=<source path with .mjs>`), using the repo's `biome.json`. The path given to Biome is on the source side, because output paths are excluded in `biome.json`.
4. Prepend `// Generated from src/<path> by scripts/build.mts. Do not edit.` and a newline.

Then the script checks every specifier in every emitted file and fails otherwise: a relative one must name a file emitted into the same tool, and any other must start with `node:`.

Modes:
- `node scripts/build.mts` writes the output and deletes files under each `skills/<skill>/assets/<tool>/` that the build no longer produces.
- `node scripts/build.mts --check` writes nothing and exits 1 listing each file as `differs`, `missing` or `stale`.

Why stripping over compiler emit: measured `tsc` output drops blank lines and re-indents; stripping keeps the layout. Why format afterwards: stripping leaves runs of spaces where the types were. Why a header: three copies of each file exist (source, skill assets, this repo's installed copy), and the header tells a reader which one to edit.

The build script suppresses only the `ExperimentalWarning` for `stripTypeScriptTypes`, so other warnings stay visible.

### D4. TypeScript configuration

One `tsconfig.json` at the root:

- `noEmit`, `strict`, `module` and `moduleResolution` `nodenext`, `target` `es2023`.
- `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`.
- `types: ["node"]`, with `@types/node` pinned to major 22 (22.20.7 declares `stripTypeScriptTypes`).
- `allowJs` without `checkJs`, so a `.mts` test can import `tests/agent-harness/helpers.mjs`.
- `scripts/untyped-modules.d.ts` declares the two semantic-release plugins the release tests import, which ship no types.
- `rootDirs` as described in D2.
- `include`: `src/**/*.mts`, `scripts/**/*.mts`, `scripts/**/*.d.ts`.

A second `tsconfig.tests.json` extends it with `allowJs`, `checkJs`, `strict: false` and includes `tests/**/*.mjs`. Generated files under `skills/*/assets/` are in neither.

`pnpm run typecheck` runs both.

### D5. Biome

`biome.json` sets two-space indent, single quotes, semicolons and line width 120, matching the existing files. Lint uses the recommended rules. `skills/*/assets/**` and `.agents/harness/**` are excluded from lint and from `biome format --write`, because the build is the only writer of the first and a tool's `update` the only writer of the second. `pnpm-lock.yaml`, `openspec/**` and `tests/**/fixtures/**` (recorded host payloads, kept byte for byte) are excluded too.

Alternative: ESLint with typescript-eslint plus Prettier. Rejected: four or more dependencies and two configs for the same result at this size.

### D6. Package scripts

| Script | Runs |
|---|---|
| `build` | `node scripts/build.mts` |
| `build:check` | `node scripts/build.mts --check` |
| `typecheck` | `tsc -p tsconfig.json && tsc -p tsconfig.tests.json` |
| `lint` | `biome check src scripts tests` |
| `format` | `biome check --write src scripts tests` |
| `test` | `node --test` over `scripts/test-*.mts` and `tests/agent-harness/*.test.mjs` |
| `check` | `build:check`, `typecheck`, `lint`, `test`, in that order |
| `harness:update` | `build`, then each tool's `update` for this repository |

`test` does not build. A stale build is reported by `build:check`, which names the cause; a silent rebuild inside `test` would hide it.

### D7. Verify gate and CI

- `scripts/verify.mts` full checks: the existing Python checks, then `pnpm run check`, then the two tools' `check` commands.
- Edit trigger: for a `.mts` or `.mjs` file, `node_modules/.bin/biome check <file>` (the binary directly, because a package-manager wrapper adds start-up time to every edit); for a file under `src/`, also `node scripts/build.mts` so the skill assets follow the edit; for a generated file under `skills/*/assets/`, `node scripts/build.mts --check`, which fails and names it.
- `validate.yml`: after `pnpm install --frozen-lockfile`, run `pnpm run build:check`, `pnpm run typecheck`, `pnpm run lint`, then the existing test steps. The Node 22.0.0 job is unchanged.

### D8. Changing shipped code after this change

Edit `src/`, bump the version in `src/<tool>/tool.json` once per pull request, and run `pnpm run harness:update`, which builds and then refreshes `.agents/harness/` and the lock. `AGENTS.md` states this. Without it `vendored.test.mjs` fails at turn end with "run update", as it does today for a hand edit of the assets.

### D9. Converting the existing code

- Move files with `git mv` so history follows them, and build in the same commit. Plain JavaScript is valid input for the stripper, so the moved files build and every test passes before a single type is written; only the type check is red until the annotations are done.
- Type the three contracts first: the hook handler interface (`handler`, `event`, `result`, `context`, `proofs`) in `src/shared/lib/handler.types.mts`, where both tools can import it, the lock file, and the harness config. The rest of the annotations follow from them.
- No behavior change. The proof is that the existing harness tests pass unchanged against the built output, on Node 26 and Node 22.0.0.
- `any` is allowed only at host boundaries (raw Claude Code and OpenCode payloads) and must be narrowed before use.

### D10. RFC amendment

The harness RFC's "Node only" bullet and its "Goals" line are amended with the `feature-rfc` skill: copied code is plain `.mjs` with no build step in the target repo; its source is TypeScript in this repository and the built files are committed. The amendment is recorded in the RFC's review log with the owner's approval.

## Risks / Trade-offs

- **[The stripping API is experimental]** → Node is pinned by `.nvmrc`; `build:check` in CI catches any change in output; fallback is the `amaro` package or `tsc` emit.
- **[A Biome or Node upgrade changes shipped bytes]** → upgrades are deliberate: exact pins, and an upgrade that changes output is its own PR with tool version bumps.
- **[An agent edits a generated file]** → the header says not to; `build:check` fails and names the file.
- **[Three copies of each file]** → one writer per copy: a person or agent for `src/`, the build for skill assets, `update` for `.agents/harness/`.
- **[Strict conversion hides a behavior change]** → the unchanged harness tests on both Node versions, plus a review of the built diff, which should show only header, formatting and removed-duplicate changes.
- **[Another worktree still has an npm `node_modules`]** → after this merges, each open worktree runs `pnpm install --frozen-lockfile` once; pnpm replaces the npm layout in place.
- **[A future package imports a dependency's dependency]** → it fails at once with "Cannot find module" under pnpm; the fix is to add it as a direct dependency.
- **[Conflicts with other in-flight work]** → land before harness M2 starts.
- **[The live verify gate blocks the agent mid-conversion]** → every step ends with the tree passing the checks that exist at that point: the files are moved, built and reinstalled in one step, and `pnpm run check` joins the verify script only after the type check is clean.
- **[The regex rewrite of specifiers touches a string that is not an import]** → the rewrite runs only on specifier positions of import and export statements and dynamic imports; a build test covers a string literal containing `.mts`.

## Migration Plan

One PR. Rollback is a revert: the built `.mjs` files are complete, working code, so reverting the tooling leaves the shipped files usable as hand-written source again.

## Open Questions

- Owner approval of the RFC amendment wording (task 1.1).
