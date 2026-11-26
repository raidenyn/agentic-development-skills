## Context

The Claude Code hook command is `node "$CLAUDE_PROJECT_DIR/.agents/harness/hook-runtime/claude.mjs"`, and `findRepoRoot` in `src/hook-runtime/claude.mts` returns `CLAUDE_PROJECT_DIR` whenever it is set. `payload.cwd` is used only when that variable is missing. Everything downstream (`loadHandlers`, `readHarnessConfig`, `toolStateDir`, `writeTrace`) takes that single `repoRoot`.

State lives under `git rev-parse --absolute-git-dir`, which is `<main>/.git/worktrees/<name>` in a linked worktree. The verify gate keeps the block ledger `blocks.json` in the root session folder `<git dir>/agent-harness/verify-gate/sessions/<host>-<session>/`, and finds it as `dirname(context.stateDir)`. It finds its tool folder (gate lock, content key, last pass, ticks) as `stateDir/../../..`.

Constraints from the task: frozen Vendored tool layout and Skill names unchanged, Hook handler interface additive only, the Claude Code entry always exits 0, OpenCode out of scope, edit `src/` only, one version bump per tool.

## Goals / Non-Goals

**Goals:**
- A session whose `cwd` is a linked worktree of the session's repository is served by that worktree's copy of the runtime, tools, config and state.
- A `cwd` in another repository, a separate clone, outside any checkout, or in a checkout without the runtime gets no output and exit 0.
- The verify gate's per-failure and per-session block limits survive a move between worktrees.
- No `cwd`, `cwd` equal to `CLAUDE_PROJECT_DIR`, or no `CLAUDE_PROJECT_DIR`: exactly today's behaviour and timing.

**Non-Goals:**
- Following a harness installed below the git top level (`CLAUDE_PROJECT_DIR=<repo>/app`) into a linked worktree; such a session is served in place within its checkout, and a worktree `cwd` resolves to the worktree's top level, which has no runtime, so it passes silently.
- OpenCode, whose session directory does not move.
- Following the agent into other repositories or submodules.
- Sharing any other state (gate lock, content key, verify-pass proof, before-images, trace) across worktrees.

## Decisions

### D1. Resolve the checkout from `cwd`, compare git common directories

`resolveCheckout(payload, {env, spawn})` in `claude.mts`:

1. No `CLAUDE_PROJECT_DIR` → today's fallback (`--show-toplevel` of `cwd`, else the folder). No `cwd`, or `cwd === CLAUDE_PROJECT_DIR` → `{root: CLAUDE_PROJECT_DIR}` with no git call.
2. Otherwise, in parallel, each with `timeoutMs: GIT_TIMEOUT_MS` (2 s):
   - in `cwd`: `git rev-parse --show-toplevel --git-common-dir`
   - in `CLAUDE_PROJECT_DIR`: `git rev-parse --show-toplevel --git-common-dir`
   `--path-format=absolute` is not used: git older than 2.31 echoes an unknown option and exits 0, which would shift the output lines. The common dir prints relative (`.git`) in a main checkout, so each output line is `resolve(<that call's cwd>, line)` before `realpathSync`. A call is accepted only when it prints exactly the expected number of lines.
3. Precedence, first match wins: the `CLAUDE_PROJECT_DIR` call throws, is killed by the timeout (`signal` set), exits non-zero or prints the wrong number of lines → `{root: CLAUDE_PROJECT_DIR}`. The `cwd` call throws, times out, or exits 0 with the wrong number of lines, or any `realpathSync` throws → `{root: CLAUDE_PROJECT_DIR}` (never the failure notice) (we could not decide; a missing `cwd` folder lands here as a spawn `ENOENT`).
4. The `cwd` call exits non-zero → `{skip: true}` (outside any checkout).
5. Different real common dir → `{skip: true}`. Same common dir and the real top level of `cwd` equals the real top level of `CLAUDE_PROJECT_DIR` → `{root: env.CLAUDE_PROJECT_DIR}` verbatim. This covers a `cwd` in a subfolder, a symlinked project dir, and a project dir that is itself a subfolder of its checkout (the harness installed below the git top level), which all keep exactly today's `repoRoot` (edit paths are made repo-relative against it). Otherwise → `{root: realpath(top level)}`.

The verify gate's `gitCommonDir` in `state.mts` follows the same rule (no `--path-format`, resolve against `repoRoot`).

Why common dir: it is the one identity that worktrees of a repository share and a separate clone does not. Both calls run in parallel so the 10 s events spend at most 2 s; the 3 s work window then still has a second left, and the existing 2 s handler-load budget runs after it. The two-call approach was chosen over `git worktree list`, which is slower and lists paths that may be stale.

### D2. Hand off to the resolved checkout's own runtime

When `root` is not `env.CLAUDE_PROJECT_DIR`:
- `<root>/.agents/harness/hook-runtime/claude.mjs` does not exist → empty result (no output, exit 0).
- Otherwise `import()` it and call its exported `main({stdin, cwd, env: {...env, CLAUDE_PROJECT_DIR: root}, spawn, now: startClock, resolved: true})`, returning its result unchanged (`text`, `ack`, `release`, `cleanupDeadline`). `resolved: true` makes the delegate skip resolution and use `CLAUDE_PROJECT_DIR`, so resolution costs at most 2 s per event, not 2 s per hop. A delegate older than this change ignores the option and never resolves anyway. `startClock` returns the outer `start` on its first call and `now()` after (this relies on `main` calling `now()` first for its own `start`; a comment at that line keeps it so), so the delegate's deadlines are measured from when the event arrived, not after resolution. Any runtime version works, since all of them honour `CLAUDE_PROJECT_DIR`.
- A throwing import, or a module without `main`, → the usual `hook hook-runtime failed on <event>` notice, as for any runtime failure.

Alternatives (load only the handlers from the checkout; spawn a child `node`) are in `brainstorm.md`: the first mixes two revisions, the second adds a Node start per event.

The delegate's module is loaded into the session's process, so the `isScript` guard in it is false and it installs no process handlers; the outer entry's `uncaughtException` handler still applies.

### D3. The block ledger lives under the git common directory

Add `commonSessionDir({repoRoot, tool, host, sessionId})` to `src/shared/lib/state.mts`: `<git common dir>/agent-harness/<tool>/sessions/<host>-<session>`, same cleaning as `rootSessionStateDir`. In a main checkout the common dir equals the git dir, so the path is exactly today's root session folder: no migration.

`src/verify-gate/handler.mts` uses it for the ledger (`chargeBlock`, `confirmCharge`, `refundCharge`) instead of `dirname(ctx.stateDir)`. Because `failureKey` already normalizes the repo root to `<root>`, the same failure in two worktrees has the same key, so the limit carries over.

`stateDir` keeps its meaning (per checkout), so the handler interface does not change. Putting all session folders under the common dir was rejected: it would change `stateDir` for linked worktrees and share call before-images between checkouts.

### D4. Documentation

`skills/agent-harness-hook-runtime/SKILL.md`: `repoRoot` is the checkout the agent is in (Claude Code: the worktree of `cwd` when it belongs to the same repository), and a Host behaviour bullet describes the move and the silent cases. `skills/agent-harness-verify-gate/SKILL.md`: the block counter is kept per session under the git common directory.

## Risks / Trade-offs

- [The task's In scope line says another repository "keeps `CLAUDE_PROJECT_DIR`", its criteria say silent] → follow the criteria; state it in the PR.
- [A `cd` into a submodule or an unrelated folder now skips verification for that event] → intended ("same repository only"); documented under Host behaviour.
- [git output format across versions] → no `--path-format`; relative lines are resolved against the call's cwd, and an unexpected line count keeps `CLAUDE_PROJECT_DIR`.
- [Mixed versions: a worktree at a revision with `verify-gate` 0.1.2 keeps its ledger under its own git dir] → the limit resets there until that revision has 0.1.3. No code fix is possible; stated in the PR.
- [A tool call that straddles a move (`cd` into the worktree): `tool.before` lands in main, `tool.after` in the worktree] → that call's tick detection is lost; `session.start` never fires in the worktree, which the gate tolerates. Documented under Host behaviour.
- [The verify command still sees the original `CLAUDE_PROJECT_DIR` in its environment, since spawns merge `process.env`] → documented in the SKILL text; the command runs with `cwd` set to the worktree.
- [Scope past the task's size: two tools, shared `state.mts`, two SKILL files, about 13 tests] → the `verify-gate` change is required by the block-limit criterion, because the state folder becomes the worktree's. Reported in the PR as a deviation.
- [Two runtime versions in one process] → they share no module state; each starts its own supervisor and workers.
- [A worktree at a revision with a broken runtime copy] → fails open with a notice, like a broken copy in the main checkout.

## Migration Plan

None needed: main-checkout paths are unchanged, and a linked-worktree session's ledger simply starts in the common dir after the update. Rollback is reverting both tool versions.
