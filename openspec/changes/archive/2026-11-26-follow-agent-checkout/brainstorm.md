## Design Summary

Task: [#59](https://github.com/raidenyn/agentic-development-skills/issues/59), M1 of the agent-harness RFC. On Claude Code the hook command always runs from `$CLAUDE_PROJECT_DIR` and `findRepoRoot` returns `CLAUDE_PROJECT_DIR` without looking at the payload's `cwd`. A session that moved into a linked worktree is still verified in its first checkout. veles's old turn-end hook followed the agent; this change brings that back.

What the code does today (observed):

- `src/hook-runtime/claude.mts` `findRepoRoot`: `CLAUDE_PROJECT_DIR`, else `git rev-parse --show-toplevel` in `payload.cwd` (2 s timeout), else the folder.
- `loadHandlers(repoRoot)` reads `<repoRoot>/.agents/harness/lock.json` and starts each handler from `<repoRoot>/.agents/harness/<tool>/`. Config is read from `<repoRoot>/.agents/harness.json`.
- State: `toolStateDir = <git dir>/agent-harness/<tool>`, where `git dir` is `git rev-parse --absolute-git-dir`, which is `.git/worktrees/<name>` in a linked worktree. The session folder `sessions/<host>-<session>/<agent>` hangs under it.
- The verify gate keeps its block ledger (`blocks.json`) in the root session folder, so a move to another worktree would start a fresh ledger. `failureKey` already replaces the repo root with `<root>`, so the same failure has the same key in both worktrees.

The change, in one line: resolve the checkout from `payload.cwd`, hand the event to that checkout's own copy of the runtime when it is a different worktree of the same repository, pass silently when it is not, and keep the gate's block ledger in the git common directory so the limit follows the session.

## Alternatives Considered

### Alternative A: Delegate to the resolved checkout's own runtime (chosen)
- **Approach**: The session's `claude.mjs` resolves the checkout. When it differs from `CLAUDE_PROJECT_DIR`, it imports `<checkout>/.agents/harness/hook-runtime/claude.mjs` and calls its `main()` with `CLAUDE_PROJECT_DIR` set to the checkout.
- **Pros**: Runtime, lock check, handlers and config all come from the same revision. Works with an older runtime in the worktree, because any version honours `CLAUDE_PROJECT_DIR`. No second resolution: inside the delegate `cwd` resolves to its own root.
- **Cons**: Two runtimes in one process when they differ; one dynamic import (a few ms).
- **Why chosen**: The task says "that worktree's copied tools … run". Mixing the session's runtime with the worktree's handlers would pair code of two revisions.

### Alternative B: Keep the session's runtime, load only the handlers from the checkout
- **Approach**: Pass the resolved root to `loadHandlers` and `createRuntime` in the same entry.
- **Pros**: Smallest diff.
- **Cons**: The supervisor, adapter and lock checker of revision X run handlers of revision Y. A worktree on a newer handler interface would be served by the older runtime.
- **Why not chosen**: Version skew between runtime and handlers, which the per-checkout copy exists to avoid.

### Alternative C: Spawn `node <checkout>/…/claude.mjs` as a child process
- **Approach**: Pipe stdin to a child and copy its stdout.
- **Pros**: Full isolation.
- **Cons**: A second Node start (about 40–80 ms) on every event, and `ack`/`release` would happen in the child, whose lifetime the parent must then manage.
- **Why not chosen**: Slower and more moving parts than an in-process import, for no gain in fail-open behaviour.

For the block limit:

### Ledger option 1: Ledger under the git common directory (chosen)
- `<git common dir>/agent-harness/verify-gate/sessions/<host>-<session>/blocks.json`. In a main checkout this is the path used today.
- `stateDir` and the handler interface stay as they are.

### Ledger option 2: Move every session folder to the git common directory
- Changes what `stateDir` means for linked worktrees, which the provisional handler interface allows only additively. It would also mix the two worktrees' call before-images.

## Agreed Approach

Alternative A with ledger option 1. Calls I made, open to correction at plan review:

- Resolution: two `git rev-parse` calls in parallel (no `--path-format`, relative output resolved against the call's cwd; see design D1), each bounded by the existing 2 s `GIT_TIMEOUT_MS` (so at most 2 s of the 3 s work window of a 10 s event): `--show-toplevel --git-common-dir` in `cwd` and the same in `CLAUDE_PROJECT_DIR`. Paths are compared after `realpath`.
- No git call at all when `cwd` is missing or equals `CLAUDE_PROJECT_DIR`, so today's path and its timing are unchanged.
- git says "not a repository" for `cwd` → outside any checkout → silent. A timeout or spawn error → keep `CLAUDE_PROJECT_DIR`, as today.

## Key Decisions

- Same repository only: equal git common directories. A separate clone, another repository or a submodule is never checked, and the hook prints nothing.
- A resolved checkout without `.agents/harness/hook-runtime/claude.mjs` → exit 0, nothing printed.
- An import or `main` failure of the delegate → the usual hook-runtime failure notice, exit 0.
- The block ledger moves to the common directory; every other piece of state (gate lock, no-change snapshot, verify-pass proof, call before-images, trace) stays per checkout.
- Both tools change: `hook-runtime` and `verify-gate` (shared `state.mts`, handler ledger path). Each gets one version bump.
- OpenCode is untouched.

## Open Questions

- The task text says a different repository "keeps `CLAUDE_PROJECT_DIR`" under In scope, but its acceptance criteria and Outcome say it passes silently. This plan follows the criteria (silent). Flagged in the PR.
- Live run in the PR: needs a Claude Code session that `cd`s into a linked worktree with a failing verify command; done during apply.
