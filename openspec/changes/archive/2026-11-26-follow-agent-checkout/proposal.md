## Why

On Claude Code the hook runtime always works in `CLAUDE_PROJECT_DIR`, the checkout the session started in. When the agent moves into a linked worktree of the same repository, its edits and turn ends are verified against the first checkout, so a failing worktree passes. veles's old turn-end hook followed the agent; raidenyn/veles-android#197 listed this as lost until fixed here ([#59](https://github.com/raidenyn/agentic-development-skills/issues/59)).

## What Changes

**Which checkout the Claude Code entry serves**
- From: always `CLAUDE_PROJECT_DIR` when it is set.
- To: the git top level of the payload's `cwd` when it is a worktree of the same repository (equal git common directory). The event is handed to that checkout's own copy of the runtime, so its tools, `.agents/harness.json`, verify command and state are used. A `cwd` in another repository, a separate clone or outside any checkout, or a checkout without the copied runtime, passes silently. Without a `cwd`, or when `cwd` is `CLAUDE_PROJECT_DIR`, nothing changes.
- Reason: verify the code the agent is changing.
- Impact: non-breaking; sessions that never leave their checkout behave as today.

**Where the verify gate counts blocks**
- From: `blocks.json` in the session folder under the checkout's own git dir.
- To: the same file under the git common directory, shared by every worktree of the repository. In a main checkout the path is unchanged.
- Reason: a session that moves keeps its per-failure and per-session block limits.
- Impact: non-breaking; the handler interface (`stateDir`) is unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-hook-runtime`: the Claude Code entry resolves the agent's checkout from `cwd`; the handler context's repo root is that checkout.
- `verify-gate-triggers`: the block ledger is keyed by session across worktrees of one repository.

## Impact

- `src/hook-runtime/claude.mts` (checkout resolution and delegation), `src/shared/lib/state.mts` (common-dir session folder), `src/verify-gate/handler.mts` (ledger path).
- `tests/agent-harness/claude-adapter.test.mjs`, `tests/agent-harness/verify-handler.test.mjs`, helpers for linked worktrees.
- `skills/agent-harness-hook-runtime/SKILL.md` (Handler interface, Host behaviour), `skills/agent-harness-verify-gate/SKILL.md` if it names the ledger path.
- New versions of `hook-runtime` and `verify-gate`, released to the Pages catalog by the release workflow on merge.
