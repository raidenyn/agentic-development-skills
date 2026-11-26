# Follow the Agent's Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Claude Code, serve each hook event from the linked worktree the agent is in, pass silently for other checkouts, and keep the verify gate's block limit per session across worktrees.

**Architecture:** `claude.mts` resolves the checkout of `payload.cwd` with two parallel, 2 s-bounded `git rev-parse` calls and, for a different worktree of the same repository, imports that worktree's own `claude.mjs` and returns its `main()` result. The verify gate's ledger moves to `<git common dir>/agent-harness/verify-gate/sessions/<host>-<session>/`, which is today's path in a main checkout.

**Tech Stack:** strict TypeScript in `src/` (erasable syntax only), built to `skills/*/assets/` by `pnpm run build`; tests are `.mjs` under `tests/agent-harness/` with `node:test`, run on Node 26 and 22.0.0.

**Spec:** `openspec/changes/follow-agent-checkout/design.md` (D1–D4), `specs/agent-hook-runtime/spec.md`, `specs/verify-gate-triggers/spec.md`, task [#59](https://github.com/raidenyn/agentic-development-skills/issues/59).

## Global Constraints

- Edit `src/` only; never `skills/*/assets/` or `.agents/harness/` by hand. `pnpm run harness:update` rebuilds both.
- Bump `version` once per PR: `src/hook-runtime/tool.json` 0.1.2 → 0.1.3, `src/verify-gate/tool.json` 0.1.2 → 0.1.3.
- The Claude Code entry exits 0 on every path.
- Handler interface: additive only. `stateDir` keeps `<git dir>/agent-harness/<tool>/sessions/<host>-<session>/<agent>`.
- Existing tests stay unchanged and must pass.
- Tests of shipped tools import the built `.mjs` from `ASSETS`, never `.mts`; run `pnpm run build` before running them.
- Each git call: `timeoutMs: GIT_TIMEOUT_MS` (2000). No `--path-format`; resolve relative output against the call's cwd. Conventional Commits.

## Review Focus

- `cwd` that does not exist (a deleted worktree): spawn `ENOENT` → keep `CLAUDE_PROJECT_DIR`, no notice. Test in Task 2.
- `cwd` in a subfolder of the main checkout, or `CLAUDE_PROJECT_DIR` given through a symlink: `repoRoot` stays the raw `CLAUDE_PROJECT_DIR` string and edit paths stay repo-relative. Test in Task 2.
- `CLAUDE_PROJECT_DIR` is itself a linked worktree and `cwd` is the main checkout: served by the main checkout's copy. Test in Task 2.
- A worktree whose `claude.mjs` throws on import: failure notice, exit 0. Test in Task 2.
- `ack` of a block delivered by the delegate still runs in the outer process: the charge is confirmed in the common-dir `blocks.json`. Test in Task 3.

---

### Task 1: Linked-worktree test helpers

**Files:**
- Modify: `tests/agent-harness/helpers.mjs`
- Test: `tests/agent-harness/helpers.test.mjs`

**Interfaces:**
- Produces: `linkedWorktree(r, { branch = 'wt' } = {}) -> Promise<{ dir: string, git, write, cleanup }>`: realpath'd `dir` under a fresh `mkdtemp`, created with `git worktree add -q -b <branch> <dir>`. `cleanup` tolerates a main repo already removed (`git worktree remove --force` in a try, then `rm -rf`), because the adapter test's `after` runs cleanups in push order.
- Reuses: `installBoth` from `tests/agent-harness/verify-helpers.mjs:164` to install both real tools; callers commit `.agents/` afterwards (`installBoth` ends with an uncommitted `setConfig`) so worktrees inherit the copies.

- [ ] **Step 1:** Test `linkedWorktree creates a worktree that shares the common dir`: the resolved `git rev-parse --git-common-dir` is equal in both; `--absolute-git-dir` differs.
- [ ] **Step 2:** Run `pnpm run build && node --test tests/agent-harness/helpers.test.mjs`. Expected: FAIL, `linkedWorktree` is not exported.
- [ ] **Step 3:** Implement `linkedWorktree`.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit `test: add linked worktree helper for the agent harness tests`.

### Task 2: Resolve and hand off in the Claude Code entry

**Files:**
- Modify: `src/hook-runtime/claude.mts` (replace `findRepoRoot`; `main` uses the result)
- Test: `tests/agent-harness/claude-adapter.test.mjs` (new tests appended; existing ones untouched)

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces (module-internal): `resolveCheckout(payload, { cwd, env, spawn }) -> Promise<{ root: string } | { skip: true }>`.
- Produces: a new optional `main()` option `resolved?: boolean` (default false); when true, `main` uses `CLAUDE_PROJECT_DIR` without resolving.

Rules: design D1 (precedence list, raw `CLAUDE_PROJECT_DIR` when the real top level equals it) and D2 (hand-off, `startClock`). Without `CLAUDE_PROJECT_DIR` the old fallback is kept as it is.

Hand-off in `main`, before `toEvent`: `skip` → return `empty`. `root !== env.CLAUDE_PROJECT_DIR` → if `<root>/.agents/harness/hook-runtime/claude.mjs` is missing return `empty`; else `const mod = await import(pathToFileURL(file).href)` and return `mod.main({ stdin, cwd, env: { ...env, CLAUDE_PROJECT_DIR: root }, spawn, now: startClock, resolved: true })`. A throw or `typeof mod.main !== 'function'` goes to the existing `catch` (failure notice).

- [ ] **Step 1: Write the tests.** Tests marked *(guard)* already pass on today's code and pin existing behaviour; the rest must fail first. Each spawns `CLAUDE_MJS` with `CLAUDE_PROJECT_DIR` = main checkout and `payload.cwd` set. Main has the real hook runtime (`installTool` of `ASSETS.hookRuntime`) plus the echo handler from `repoWithHandler`, committed.
  - `a prompt in a linked worktree is served by the worktree's copy`: the echo handler prints `repoRoot` and `stateDir`; `repoRoot` is the worktree's real path and `stateDir` is under `<main>/.git/worktrees/<name>/agent-harness/`.
  - `a linked worktree without the runtime prints nothing`: worktree branched before `.agents/` was committed → `code 0`, `stdout ''`.
  - `a separate clone prints nothing` (`git clone` of main), `another repository prints nothing` (second `tempRepo` with the runtime installed), `a folder outside any checkout prints nothing` (`mkdtemp`) → each `code 0`, `stdout ''`.
  - *(guard)* `a subfolder of the main checkout keeps CLAUDE_PROJECT_DIR as given`: `root <CLAUDE_PROJECT_DIR string>`.
  - *(guard)* `a symlinked CLAUDE_PROJECT_DIR with cwd at its real path keeps the symlink`: `root <symlink path>`, and a `PostToolUse` Edit of `<symlink>/README.md` (echo handler on `tool.after` printing `files`) still lists `README.md`. A comment notes that a real-path `file_path` is dropped, as today; the test pins only the symlink spelling.
  - `CLAUDE_PROJECT_DIR in a linked worktree and cwd in the main checkout`: served by main's copy (`root <main realpath>`).
  - *(guard)* `a missing cwd folder keeps CLAUDE_PROJECT_DIR` → `root <main>`.
  - *(guard)* `a project dir below the git top level, with cwd elsewhere in the checkout, keeps CLAUDE_PROJECT_DIR`: runtime installed in `<repo>/app`, `CLAUDE_PROJECT_DIR=<repo>/app`, `cwd=<repo>/docs` → served, `root <repo>/app`.
  - `a delegated event resolves once`: with a fake `git` on `PATH` that logs its arguments and then execs the real git, an event in the worktree logs exactly two calls containing `--show-toplevel` (other git calls, such as `--absolute-git-dir` for the state folder, are not counted).
  - `a worktree whose claude.mjs throws on import gives the failure notice`: overwrite the worktree's copy with `throw new Error('boom')` → `code 0`, output contains `hook hook-runtime failed`.
- [ ] **Step 2: Write the end-to-end test** `Stop in a linked worktree with a failing verify command blocks there`: `verifyRepo` + `installBoth`, commit; worktree; in the worktree replace `.agents/harness.json`'s command with `["node","-e","console.log('WT FAIL');process.exit(1)"]` and commit there (main's command keeps passing); `Stop` with `cwd` = worktree and `background_tasks: []` (as `verify-hosts.test.mjs:38` does; a running subagent would make it an uncharged notice) → `decision: 'block'`, `reason` contains `WT FAIL`.
- [ ] **Step 3: Write the bounded-resolution tests**, calling the built `main()` in a child process (`runNode` on a small script) so leftover workers cannot hang the test runner, against a repo whose lock has no handler plus one echo handler:
  - `both git calls start before either resolves, each with timeoutMs 2000`: a fake `spawn` records calls and resolves only after both are recorded. The child script exits 1 on its own after 5 s (`setTimeout(() => process.exit(1), 5000)`), so a sequential implementation fails instead of hanging. Pattern: `tests/agent-harness/cli-runtime.test.mjs:251-262` (`run-main.mjs`).
  - *(guard)* `a timed-out cwd call keeps CLAUDE_PROJECT_DIR`: the fake returns `{ code: null, signal: 'SIGKILL' }` for the cwd call → served in `CLAUDE_PROJECT_DIR`.
  - *(guard)* `a failing CLAUDE_PROJECT_DIR call wins over a failing cwd call`: both exit 128 → served in `CLAUDE_PROJECT_DIR`.
- [ ] **Step 4:** `pnpm run build && node --test tests/agent-harness/claude-adapter.test.mjs`. Expected: the non-guard new tests FAIL; guards and existing tests PASS.
- [ ] **Step 5:** Implement `resolveCheckout`, the `resolved` option and the hand-off in `src/hook-runtime/claude.mts`. Treat an empty `CLAUDE_PROJECT_DIR` as unset (the existing test passes `''`). Update the comment above it to describe D1, and add a comment at `const start = now()` that it must stay the first `now()` call (`startClock`).
- [ ] **Step 6:** `pnpm run build && node --test tests/agent-harness/`. Expected: all PASS.
- [ ] **Step 7:** Commit `feat: follow the agent's linked worktree on Claude Code`.

### Task 3: Block ledger in the git common directory

**Files:**
- Modify: `src/shared/lib/state.mts`, `src/verify-gate/handler.mts:58-60,315-347`, comment at `src/verify-gate/lib/gate.mts:326`
- Test: `tests/agent-harness/verify-handler.test.mjs`, `tests/agent-harness/state.test.mjs`, `tests/agent-harness/claude-adapter.test.mjs` (extend the Task 2 end-to-end test)

**Interfaces:**
- Produces: `gitCommonDir(repoRoot: string): string` (`git rev-parse --git-common-dir`, `resolve(repoRoot, out)`, `realpathSync`) and `commonSessionDir({ repoRoot, tool, host, sessionId }: SessionKey): string` in `state.mts` (creates the folder; same `clean()` as `rootSessionStateDir`).
- The handler's ledger dir becomes `commonSessionDir({ repoRoot: ctx.repoRoot, tool: 'verify-gate', host: ctx.host, sessionId: ctx.sessionId })`; `sessionDirOf` is removed. `toolDirOf` and `callFile` are unchanged.

- [ ] **Step 1: Write the failing tests:**
  - `verify-handler`: `the block limit follows the session into a linked worktree`: `repo({ config: { maxBlocks: 2 } })`, `r.fail()`, two `fire(h, r, turnEnd())` → `attempt 1 of 2`, `attempt 2 of 2`; `const wt = await linkedWorktree(r)`; `fire(h, { ...r, dir: wt.dir }, turnEnd())` → `result.block === undefined`, `result.context` matches `/still failing after 2 blocks/`; `fire(h, { ...r, dir: wt.dir }, turnEnd(), { sessionId: 's2' })` → `attempt 1 of 2`. (The verify script lives in main's git dir and is referenced by absolute path, so the worktree runs the same failing command.)
  - `state`: `commonSessionDir equals rootSessionStateDir in a main checkout`; `commonSessionDir is shared by a linked worktree and its main checkout`.
  - Extend the Task 2 end-to-end test: the common-dir `blocks.json` has one charge with `confirmed: true` after the spawned entry exits.
- [ ] **Step 2:** `pnpm run build && node --test tests/agent-harness/verify-handler.test.mjs tests/agent-harness/state.test.mjs tests/agent-harness/claude-adapter.test.mjs`. Expected: the new ones FAIL.
- [ ] **Step 3:** Implement `gitCommonDir` and `commonSessionDir`; switch the three ledger calls in `handler.mts`; update the ledger comments at `handler.mts:58` and `gate.mts:326`.
- [ ] **Step 4:** Re-run all of `tests/agent-harness/`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: count verify blocks per session across worktrees`.

### Task 4: Docs, versions, build and checks

**Files:**
- Modify: `skills/agent-harness-hook-runtime/SKILL.md` (Handler interface `repoRoot` bullet; Host behaviour list at line ~130), `skills/agent-harness-verify-gate/SKILL.md` (where block limits are described), `src/hook-runtime/tool.json`, `src/verify-gate/tool.json`; generated: `skills/*/assets/`, `.agents/harness/`.

- [ ] **Step 1:** Hook runtime SKILL: "**`repoRoot`** is the checkout the agent is in. On Claude Code that is the git top level of the event's `cwd` when it is a worktree of the session's repository; the event then runs from that worktree's own copy. A `cwd` in another repository, a separate clone, outside any checkout, or in a worktree without the runtime gets no output." Host behaviour bullet: a tool call that moves the agent has its `tool.before` in the old checkout and its `tool.after` in the new one; `session.start` does not repeat after a move; commands still see the session's original `CLAUDE_PROJECT_DIR` in their environment. Verify gate SKILL: the block counter is kept per session in `<git common dir>/agent-harness/verify-gate/`, shared by the repository's worktrees.
- [ ] **Step 2:** Bump both versions to 0.1.3; run `pnpm run harness:update`. Expected: `.agents/harness/lock.json` lists 0.1.3 for both.
- [ ] **Step 3:** Run `pnpm run check`, `python3 scripts/skills.py validate`, `claude plugin validate .`, `python3 -m unittest discover -s scripts -p 'test_*.py'`. Expected: all pass.
- [ ] **Step 4:** Commit `docs: describe which checkout the hook runtime serves` (with the version bump and generated files).

### Task 5: Live proof and PR

- [ ] **Step 1:** Live run against the new code. This repo's main checkout still runs 0.1.2 until merge, so use a throwaway repo: install the built 0.1.3 tools (`cli.mjs install` of both) and the Claude hook entries there, commit, add a linked worktree inside the project folder (`.claude/worktrees/wt`, git-ignored) whose `.agents/harness.json` command fails, so Claude Code keeps the `cd` (or pass `--add-dir` for a sibling worktree). Run `claude -p` started in the throwaway main checkout with a prompt that `cd`s into the worktree and ends the turn; capture the block text. Run with `AGENT_HARNESS_TRACE=1` and attach `<main>/.git/worktrees/wt/agent-harness/hook-runtime/trace.jsonl` and the common-dir `blocks.json` with the block text. Try `cd /tmp` too; if Claude Code resets a cwd outside the project, say so and rely on the tests for that case.
- [ ] **Step 2:** Open the PR (Conventional Commit title) reporting: each acceptance criterion with evidence; the areas changed (`hook-runtime` 0.1.3, `verify-gate` 0.1.3, shared `state.mts`); deviations (the `verify-gate` change and the size, both required by the block-limit criterion; "keeps `CLAUDE_PROJECT_DIR`" vs "silent"; mixed versions reset the limit in a worktree at 0.1.2); effects on waiting onboarding tasks; any follow-up task (at least: the timing flake at `tests/agent-harness/opencode-adapter.test.mjs:533`, 380 ms of a 400 ms budget).
- [ ] **Step 3:** After merge, link the Pages release that carries 0.1.3 in the PR and on #59; tick the remaining tasks.
