## Design Summary

The repository is about to hold a lot of Node code: the agent harness tools (about 3,900 lines in PR #54, with the 2,194-line rule engine and about 9,400 lines of tests still to port) and the repo's own scripts. Today that code has no type check, no linter and no formatter.

This change makes TypeScript the source language and adds one small build:

- **Shipped code** (the harness tools copied into other repos) is written as `.mts` under `src/` and built into plain `.mjs` under `skills/<skill>/assets/<tool>/`. The built files are committed. Target repos still receive plain `.mjs` with no dependencies that runs on Node 22.0.0.
- **Repo-only code** (`scripts/`) is written as `.mts` and run directly by Node 26, which executes TypeScript without a build.
- **Checks**: `tsc --noEmit` in strict mode, Biome for lint and format, and a build check that fails when the committed output differs from a fresh build. All run from `pnpm run check`, `scripts/verify.mts` and CI.

The build strips the types (Node's built-in `module.stripTypeScriptTypes`), rewrites relative `.mts` import specifiers to `.mjs`, formats the result with Biome and writes it. No bundling, no down-levelling.

### What the owner decided, and what is my call

Decided by the owner: add better checks, move the files to TypeScript, do it with a build step (asked for by name when starting this change), and use pnpm in place of npm because it is much faster across worktrees.

Everything under "Key Decisions" below is my call, made to keep the fast-forward moving. Each can be changed before apply.

### Evidence gathered

- **Type errors today.** `tsc` 7.0.2 with `checkJs` over the PR #54 harness code: 43 errors non-strict, 872 strict (633 are untyped parameters). So strict typing is a real annotation job, not a switch.
- **Compiler emit loses layout.** `tsc` emit of a sample file dropped every blank line and re-indented to four spaces.
- **Type stripping keeps layout.** `module.stripTypeScriptTypes` on Node 26.13.1 replaced the types with spaces, kept blank lines and comments, and left ragged spacing (`handle               (event        ,`) that a formatter must clean. It printed an `ExperimentalWarning`. It does not rewrite import specifiers.
- **The whole pipeline works.** Strip, rewrite `.mts` to `.mjs`, format with Biome 2.6.9: the sample came out as clean two-space code with its comments and blank lines. Lines that held only types collapse, so line numbers can differ from the source.
- **Where the code lives.** Checked against `main` at `36f0886`, after PR #54 and PR #55 merged: the harness code is under `skills/agent-harness-*/assets/`, identical to the branch the trial type check ran on. PR #55 added no Node code.
- **pnpm works after one fix.** In a copy of `main` at `36f0886`, `pnpm import` and `pnpm install` (12.18.0) left one test file failing: it imports two packages that are dependencies of `semantic-release`, not of this repo. With both added as direct dependencies, all 312 Node tests and the Python tests pass. A warm install takes about 0.3 s.
- **pnpm's global virtual store breaks three tests.** With `enableGlobalVirtualStore`, semantic-release cannot find `@semantic-release/exec`. It stays off.
- **How skills are distributed.** The marketplace entry points at `./skills/<name>` in git and the Pages catalog copies the skill folder at the release tag, so the built `.mjs` must be in git.

## Alternatives Considered

### Alternative A: Type-check the existing `.mjs` with JSDoc, no build

- **Approach**: keep the files as they are, add `tsc --noEmit` with `checkJs`, write types as JSDoc comments.
- **Pros**: no RFC amendment; no generated files; nothing to keep in sync.
- **Cons**: JSDoc is clumsy for generics, casts and type imports; the three duplicated library files stay duplicated.
- **Why not chosen**: the owner asked for TypeScript as the source language, and the volume of code still to be written makes the syntax worth it.

### Alternative B: Ship `.ts` files and let Node run them

- **Approach**: copy `.ts` into target repos; Node strips the types at run time.
- **Pros**: no build and no generated files.
- **Cons**: raises the Node floor in every target repo from 22.0.0 to a version that strips types by default; changes the file names in the vendored layout, the lock and every repo's hook config, all of which the harness RFC froze.
- **Why not chosen**: it changes a frozen contract in every onboarded repo. The build keeps that contract untouched.

### Alternative C: Build with the TypeScript compiler's own emit

- **Approach**: `tsc` writes the `.mjs` files.
- **Pros**: the standard path; rewrites import extensions itself; no experimental API.
- **Cons**: measured output drops blank lines and re-indents, so the shipped code reads worse than its source.
- **Why not chosen**: people and agents read the copied code in target repos. Kept as the fallback if the stripping API changes.

## Agreed Approach

TypeScript source with a type-stripping build (a variant of the build the owner chose): it gives real TypeScript syntax, keeps what target repos receive exactly as the harness RFC describes, and produces output that reads like its source: the comments, blank lines and formatting are kept, and only the types are gone.

## Key Decisions

1. **Source layout.** `src/<tool>/` mirrors the tool's shipped layout. `src/shared/` holds files emitted into more than one tool. `src/build.json` maps each tool to its skill and lists its shared files.
2. **File extensions.** Source is `.mts`, output is `.mjs`. The two specifiers have the same length, so the rewrite keeps column positions. Files named `*.types.mts` hold types only and are not emitted.
3. **Syntax limits.** Erasable syntax only (no enums, namespaces or parameter properties), enforced by `erasableSyntaxOnly` and `verbatimModuleSyntax`.
4. **Build script.** `scripts/build.mts`, run by Node 26. `--check` builds in memory and fails with the list of files that differ, are missing or are stale. Every emitted file starts with a "generated, do not edit" line naming its source.
5. **Output is committed.** CI runs the build check. The existing test that compares `.agents/harness/` with the skill copy stays; the test that compares the duplicated library files is deleted because the build makes them equal.
6. **Tests of shipped code stay `.mjs`.** They run against the built files on Node 26 and on Node 22.0.0, so what is tested is what ships. Tests of repo scripts move to `.mts`.
7. **Lint and format.** Biome, one pinned dependency, configured to the existing style (two spaces, single quotes, semicolons, width 120).
8. **Type check.** One strict `tsconfig.json` for `src/` and `scripts/`; tests are checked non-strict. `@types/node` is pinned to major 22 so shipped code does not lean on newer Node APIs.
9. **Order.** PR #54 is merged, so the change can start. It should land before harness M2 starts, so the rule engine is written in TypeScript from its first line.
10. **RFC amendment.** The harness RFC's "Node only" decision says "plain `.mjs` with no build step". It is amended to "no build step in the target repo; the source is TypeScript, built in this repository". This needs the owner's approval in the amendment itself.
11. **Tool versions.** The conversion changes the bytes of every shipped file, so each tool's version gets a patch bump and this repo's lock is refreshed with the tool's own `update`.
12. **pnpm details.** The owner chose pnpm; mine are the pinned version (12.18.0, the one installed here), `pnpm/action-setup` in CI, keeping the default `node_modules` layout, and leaving `npx` in the one optional Python test.

## Open Questions

- **Does the owner approve the RFC amendment wording?** Asked in task 1.1; apply stops there if not.
- **Stability of `module.stripTypeScriptTypes`.** It is experimental on Node 26.13.1. The build check detects any change in its output. If it is removed or changes behavior, the fallback is the `amaro` package (the same stripper) or Alternative C.
