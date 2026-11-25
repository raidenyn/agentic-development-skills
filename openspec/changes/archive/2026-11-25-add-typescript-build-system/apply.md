# Apply Receipt

**Change**: `add-typescript-build-system`
**Iteration**: `1`
**Applied at**: `2026-11-25 15:43`
**Executor**: `executing-plans` (inline in the session on Opus 5.5, owner-approved; one fresh whole-branch review on Fable 5.2 at the end)

---

## Workspace

- **Worktree**: `/home/dev/.t3/worktrees/agentic-development-skills/t3-593866fe-f6644476898c1bc8` (the session's own T3 worktree; no second worktree was made)
- **Branch**: `chore/js-build-system-typescript`

---

## Commits

- **Range**: `c120c94..f3da30b` (planning scaffold `c120c94`, then implementation)
- **Count**: `14`

- `be67b38` docs: amend the harness RFC to build copied code from TypeScript
- `096fe2c` build: switch from npm to pnpm
- `61f6ef9` build: add TypeScript and Biome
- `2686b4b` build: add the type-stripping build for shipped harness code
- `d0169af` refactor: move harness source to src/ and build it
- `f979c0f` refactor: type the shared harness files, the runtime and the Claude adapter
- `32e3d67` refactor: type the hook runtime
- `81b5323` refactor: type the verify gate and finish the strict conversion
- `e9360ca` refactor: move repo scripts to TypeScript
- `5daf995` style: format and lint the Node code
- `5f38191` ci: run the build check, type check and lint
- `8d271d8` docs(openspec): tick the final checks of add-typescript-build-system
- `f3da30b` fix: refuse to build source files other than .mts and .json (from the final review)

---

## Tasks

- **Completed**: `34 of 34` checkboxes in tasks.md flipped to `- [x]`
- **Remaining**: none

## Evidence

- `pnpm run check` (build check, strict and test type checks, Biome with warnings as errors, 346 Node tests): pass.
- `python3 scripts/skills.py validate`, the Python unit tests (65) and `pnpm dlx @anthropic-ai/claude-code@2.1.330 plugin validate .`: pass.
- Fresh clone on Node 22.0.0 with no `node_modules`: `tests/agent-harness` 289 of 289 pass.
- The 21 hand-written `.mjs` files that shipped before equal the built files minus the header, after formatting the originals with Biome (checked at the end of the conversion, before the lint pass).

## Not verified

- The workflow changes in `validate.yml`, `release.yml` and `project-ready.yml` have not run on GitHub; they need a pull request (and, for `release.yml`, a release).

---

## Next step

Run `/opsx:verify` (openspec-verify-change).
