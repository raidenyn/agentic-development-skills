## 1. Preconditions and package manager

- [x] 1.1 Confirm PR #54 (the harness M1 code) is merged into `main` and this branch is on top of it (done: branch fast-forwarded to `36f0886`, which also holds PR #55)
- [x] 1.2 Amend the harness RFC with the `feature-rfc` skill: the "Node only" decision and the Goals line become "no build step in the target repo; the source is TypeScript in this repository and the built `.mjs` files are committed". Record it in the review log. Ask the owner to approve the wording and stop if they do not
- [x] 1.3 Switch to pnpm: set `"packageManager": "pnpm@12.18.0"` in `package.json`, run `pnpm import` so `pnpm-lock.yaml` keeps the versions `package-lock.json` resolved, delete `package-lock.json`, and add `@semantic-release/commit-analyzer` 14.0.0-beta.5 and `@semantic-release/release-notes-generator` 15.0.0-beta.4 as exact dev dependencies (the release tests import them, and pnpm does not expose a dependency's dependencies)
- [x] 1.4 In the same step, change `['npm', 'test']` to `['pnpm', 'test']` in `scripts/verify.mjs` and in `tests/agent-harness/repo-verify.test.mjs`, so the live verify gate runs the new package manager
- [x] 1.5 Workflows: add `pnpm/action-setup` (pinned by commit, version read from `packageManager`) before `actions/setup-node` in the `validate` job and the `release` job; replace `npm ci` with `pnpm install --frozen-lockfile`, `npm test` with `pnpm test`, `npx semantic-release` with `pnpm exec semantic-release`, and `npx -y @anthropic-ai/claude-code@…` with `pnpm dlx @anthropic-ai/claude-code@…`. The Node 22.0.0 job gets no pnpm and no install
- [x] 1.6 Docs: `AGENTS.md` and `README.md` name `pnpm install --frozen-lockfile` and `pnpm test`; the README says how to get pnpm

## 2. Tooling

- [ ] 2.1 Add exact-pinned dev dependencies `typescript`, `@types/node` (major 22) and `@biomejs/biome`; regenerate `pnpm-lock.yaml`
- [ ] 2.2 Add `biome.json` (two spaces, single quotes, semicolons, width 120, recommended lint rules; excludes `skills/*/assets/**`, `.agents/harness/**`, `openspec/**`, `tests/**/fixtures/**`, `pnpm-lock.yaml`)
- [ ] 2.3 Add `tsconfig.json` (strict, `noEmit`, `nodenext`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `rootDirs` over the tool folders and `src/shared`, `allowJs` without `checkJs`; includes `src/**/*.mts`, `scripts/**/*.mts`) and `tsconfig.tests.json` (extends it; `allowJs`, `checkJs`, non-strict; includes `tests/**/*.mjs`)
- [ ] 2.4 Add package scripts `build`, `build:check`, `typecheck`, `lint`, `format`, `check`, `harness:update` and update `test` (design D6)

## 3. Build script

- [ ] 3.1 Write `scripts/test-build.mts` first: fixtures in a temp folder covering the scenarios of `specs/harness-source-build/spec.md` (mapping, data-file copy, unknown tool, shared files, collision, specifier rewrite, non-specifier string, unresolved specifier, npm-package specifier, cross-tool import, type-only file, header, layout, `--check` with `differs`, `missing` and `stale`, deterministic second run). Watch it fail
- [ ] 3.2 Write `scripts/build.mts`: read `src/build.json`, strip types, rewrite specifiers, format with Biome, prepend the header, verify specifiers, write or check (design D3). Make 3.1 pass
- [ ] 3.3 Add `src/build.json` with the two tools and their three shared files

## 4. Convert the shipped harness code

- [ ] 4.1 `git mv` every `.mjs` under `skills/agent-harness-hook-runtime/assets/hook-runtime/` and `skills/agent-harness-verify-gate/assets/verify-gate/` to `.mts` under `src/<tool>/`, move `tool.json` with them, and move `lib/config`, `lib/state`, `lib/install` once into `src/shared/lib/`, deleting the second copy. Update import specifiers to `.mts`, then, in the same step, bump both tools' patch version and run `pnpm run harness:update`, so the live verify gate passes; confirm every harness test passes before any type is added
- [ ] 4.2 Add the contract types: `src/shared/lib/handler.types.mts` (handler, event, result, context, proofs, as in the RFC's Hook handler interface), and types for the lock file and the harness config in `src/shared/lib/`
- [ ] 4.3 Annotate `src/shared/` and `src/hook-runtime/` until `tsc -p tsconfig.json` reports no error for them. No behavior change; `any` only for raw host payloads, narrowed before use
- [ ] 4.4 Annotate `src/verify-gate/` the same way
- [ ] 4.5 Run the build. Review the diff of `skills/*/assets/`: only the header, formatting and type-free equivalents may differ. Delete `tests/agent-harness/shared-lib.test.mjs`
- [ ] 4.6 Run `pnpm run harness:update` after the last source change, so `.agents/harness/` and `lock.json` match the final build
- [ ] 4.7 Run the harness tests on the Node from `.nvmrc` and on Node 22.0.0; both must pass with no test edited except for lint findings

## 5. Convert the repo scripts

- [ ] 5.1 `git mv` `scripts/project-ready.mjs`, `scripts/verify.mjs` and the three `scripts/test-*.mjs` files to `.mts`, and move `tests/agent-harness/repo-verify.test.mjs` to `scripts/test-verify.mts` (it imports the verify script, and its old folder runs on Node 22.0.0); annotate them to strict, and add `scripts/untyped-modules.d.ts` for the two semantic-release plugins that ship no types
- [ ] 5.2 Update every reference in the same step as the rename, because hooks call the verify script by path: `package.json`, `.github/workflows/project-ready.yml`, `.agents/harness.json`, `AGENTS.md`, `README.md`
- [ ] 5.3 Extend `scripts/verify.mts` (TDD, in `scripts/test-verify.mts`): full checks include `pnpm run check`; edit trigger runs Biome on a non-generated `.mts` or `.mjs` file, the build for a file under `src/`, and `build --check` for a generated file

## 6. Lint and format the rest

- [ ] 6.1 Run `pnpm run format` over `src/`, `scripts/` and `tests/`; fix the remaining lint findings by hand, or disable a rule in `biome.json` with a one-line reason when it fights the code's style
- [ ] 6.2 Fix what `tsc -p tsconfig.tests.json` reports in `tests/`

## 7. CI and documentation

- [ ] 7.1 `validate.yml`: add build check, type check and lint steps after `pnpm install --frozen-lockfile`; leave the Node 22.0.0 job without `pnpm install --frozen-lockfile`
- [ ] 7.2 `AGENTS.md`: the three classes of code, "never edit `skills/*/assets/` or `.agents/harness/` by hand", the edit, build, version bump and `update` sequence, and `pnpm run check` in the workflow list
- [ ] 7.3 `README.md`: update the layout block and the development commands
- [ ] 7.4 Both harness skills' `SKILL.md`: check for statements that the assets are hand-written or that the repo has no build, and correct them
- [ ] 7.5 Run `openspec validate add-typescript-build-system --strict` so the deltas for `harness-tool-install` and `board-onboarding` still match the main specs' requirement headers

## 8. Final checks

- [ ] 8.1 `pnpm run check`, `python3 scripts/skills.py validate`, `claude plugin validate .` and the Python unit tests all pass
- [ ] 8.2 `grep -rn "npm ci\|npm test\|npm run\|npx \|package-lock"` over `.github/`, `scripts/*.mts`, `AGENTS.md` and the README's development sections finds nothing (the README's `npx skills add` lines for users stay)
- [ ] 8.3 `grep` for `scripts/[a-z-]*\.mjs` outside `openspec/` and `pnpm-lock.yaml` finds nothing
- [ ] 8.4 A fresh clone with only Node 22.0.0 runs `node --test "tests/agent-harness/*.test.mjs"` green
