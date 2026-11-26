## 1. Test fixtures

- [x] 1.1 Add a `linkedWorktree(r, { branch = 'wt' })` helper to `tests/agent-harness/helpers.mjs` (`git worktree add`, cleanup with `git worktree remove --force`), tolerant of the main repo being removed first; reuse `installBoth` from `verify-helpers.mjs` and commit `.agents/` so a worktree inherits the copies

## 2. Checkout resolution in the Claude Code entry (D1, D2)

- [x] 2.1 Write failing tests in `tests/agent-harness/claude-checkout.test.mjs` (a new file, so `claude-adapter.test.mjs` stays unchanged): a `prompt` handler echoing `repoRoot` sees the linked worktree's real path when `cwd` is inside it; the handler's `stateDir` is under the worktree's git dir; a worktree without `.agents/harness/hook-runtime/`, a separate clone, another repository and a non-git folder each give empty stdout and exit 0; a worktree whose `claude.mjs` throws on import gives the failure notice; guards (pass before and after): a subfolder or symlinked project dir keeps the raw `CLAUDE_PROJECT_DIR`, a missing `cwd` folder keeps it, a project dir below the git top level stays served
- [x] 2.2 Write the failing end-to-end test: main checkout's verify command passes, the worktree (another revision) has a failing one; `Stop` with `cwd` in the worktree and `background_tasks: []` blocks with the worktree's failure text
- [x] 2.3 Implement `resolveCheckout` in `src/hook-runtime/claude.mts`: fast path without git when `cwd` is missing or equals `CLAUDE_PROJECT_DIR`; two parallel `git rev-parse` calls (no `--path-format`, relative output resolved against the call's cwd) bounded by `GIT_TIMEOUT_MS`; precedence per design D1 (a `CLAUDE_PROJECT_DIR` failure wins, a `cwd` spawn error or timeout keeps `CLAUDE_PROJECT_DIR`, a non-zero `cwd` exit or a different real common dir skips; a wrong line count or a `realpath` throw keeps `CLAUDE_PROJECT_DIR`, never the failure notice); return `CLAUDE_PROJECT_DIR` verbatim when the real top levels of `cwd` and `CLAUDE_PROJECT_DIR` are equal (also covers a project dir below the git top level); keep the existing fallback when `CLAUDE_PROJECT_DIR` is unset
- [x] 2.4 Implement the hand-off in `main`: skip when the resolved checkout has no `claude.mjs`, otherwise `import()` it and return its `main({stdin, cwd, env: {...env, CLAUDE_PROJECT_DIR: root}, spawn, now: startClock, resolved: true})` (first clock call returns the outer start; `resolved` skips a second resolution); an import failure or missing `main` gives the hook-runtime failure notice
- [x] 2.5 Tests written with 2.1, before 2.3: in a child process with an injected `spawn` and a 5 s self-timeout, both git calls start before either resolves and each gets `timeoutMs` 2000; guards: a timed-out `cwd` call keeps `CLAUDE_PROJECT_DIR`, a failing `CLAUDE_PROJECT_DIR` call wins over a failing `cwd` call. Also: `CLAUDE_PROJECT_DIR` in a worktree with `cwd` in main is served by main; a delegated event makes exactly two resolution calls (`--show-toplevel`)
- [x] 2.6 Run the existing Claude adapter and runtime tests unchanged and confirm they pass

## 3. Block ledger in the git common directory (D3)

- [x] 3.1 Write a failing test in `tests/agent-harness/ledger-worktree.test.mjs` (new file, with the state tests of 3.3): `maxBlocks` 2, two blocks for one failure in the main checkout, then the same failure in a linked worktree with the same session id gives the limit notice; a different session still blocks
- [x] 3.2 Add `commonSessionDir` to `src/shared/lib/state.mts` (`git rev-parse --git-common-dir` resolved against `repoRoot`, same id cleaning as `rootSessionStateDir`) and use it for `chargeBlock`, `confirmCharge` and `refundCharge` in `src/verify-gate/handler.mts`
- [x] 3.3 Add a test that in a main checkout the ledger path equals today's `rootSessionStateDir` path, and extend the end-to-end test from 2.2 to find one confirmed charge in the common-dir `blocks.json`; update the ledger comments in `handler.mts` and `gate.mts`

## 4. Docs, versions and build

- [x] 4.1 Update `skills/agent-harness-hook-runtime/SKILL.md`: `repoRoot` is the agent's checkout (Handler interface), and a Host behaviour bullet for the move and the silent cases
- [x] 4.2 Update `skills/agent-harness-verify-gate/SKILL.md`: the block counter is per session under the git common directory
- [x] 4.3 Bump `version` in `src/hook-runtime/tool.json` and `src/verify-gate/tool.json` once each, then run `pnpm run harness:update`
- [x] 4.4 Run `pnpm run check`, `python3 scripts/skills.py validate`, `claude plugin validate .` and `python3 -m unittest discover -s scripts -p 'test_*.py'`

## 5. Live proof and PR

- [ ] 5.1 Live run in a throwaway repo with the built 0.1.3 tools installed (this repo's main checkout runs 0.1.2 until merge): a Claude Code session started in its main checkout `cd`s into a linked worktree placed inside the project folder (or added with `--add-dir`) with a failing verify command and ends a turn, with `AGENT_HARNESS_TRACE=1`; record the block text, the worktree's `trace.jsonl` and the common-dir `blocks.json` in the PR
- [ ] 5.2 Open the PR with each acceptance criterion and its evidence, the changed contracts and areas, the new tool versions, the deviations (the `verify-gate` change and size, needed for the block-limit criterion; "keeps `CLAUDE_PROJECT_DIR`" vs "silent"; a worktree at `verify-gate` 0.1.2 still resets the limit), effects on waiting onboarding tasks, and any follow-up task found on the way
- [ ] 5.3 After merge, link the Pages catalog release that carries the new versions
