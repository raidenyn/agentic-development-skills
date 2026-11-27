## Design Summary

Issue #62 compares the verify gate's turn end with veles's old turn-end hook (`openspec/specs/verification-stop-hook/spec.md` at `a86633dc`) and settles three differences. The owner decided each one on 2026-11-26 from the findings below.

| | Finding | Owner's decision |
|---|---|---|
| **C1** Failure identity for the block limit | veles keyed a failure on node, step and outcome kind and blocked it at most 3 times *in a row*. A clean stop reset the count. The gate keys on argv, exit status and the normalized tail (`failureKey`, `src/verify-gate/lib/gate.mts`). Its count is per session and is never reset by a pass. A changed tail is a new failure with its own 3 blocks, bounded only by the 10-block session backstop. A changing tail usually means progress. Noise the normalizer misses can spend the backstop on one problem. | **Keep and document** in the verify-gate "Limits". Propose a follow-up task: let the gate run several commands in parallel, so a failure is pinned to the command that failed and the identity gets simpler. |
| **C2** OpenCode result after a newer turn started | The adapter drops a superseded result and calls `release` (`opencode-adapter.mts`). A failed run records no pass, and the gate lock makes the next turn end wait and check again. So a failure is not lost, only delayed to that turn end. What is lost is a non-block notice from the superseded turn, and the user never sees that the check of the earlier turn failed. veles resumed the session with the stale block. | **Deliver it as a notice**: a message that does not resume the agent, marked as coming from the previous turn. The charge is still refunded. |
| **C3** Leftover process groups after the host kills the hook | A spike on Linux showed that a `detached: true` group survives both SIGKILL and SIGTERM of the parent. The Claude Code entry installs no signal handler. The gate lock already records the holder's `pid` and the `pgids` the supervisor started under it (`src/shared/lib/state.mts`, `supervisor.mts`). But a dead holder's lock is simply taken over and its groups are never signalled. veles recorded groups in `build/verify/running.json` and the next lock holder terminated them. | **Record and reap, plus SIGTERM.** The next run to take the gate lock terminates the recorded groups of a dead holder. The Claude Code entry also kills its groups on SIGTERM, SIGHUP and SIGINT. |

## Alternatives Considered

### C1

#### Alternative A: The command names its own identity
- **Approach**: If the command prints a line such as `verify-failure-id: <id>`, that line is the identity. Otherwise the gate uses today's rule.
- **Pros**: Additive. A repo with a noisy tail can make the limit stick to one problem.
- **Cons**: Every repo's command must learn to print the line before it helps. It adds an output contract.
- **Why not chosen**: The owner prefers to get a clear identity from running several commands in parallel, which is a follow-up task.

#### Alternative B: Reset the count on a pass (veles's "in a row")
- **Approach**: A passing turn end clears the session's charges.
- **Pros**: Closer to veles.
- **Cons**: An agent that alternates between passing and failing gets fresh blocks every time.
- **Why not chosen**: The owner chose to keep today's per-session count.

### C2

#### Alternative A: Keep dropping it and document
- **Approach**: Leave the adapter as it is and add a "Limits" entry.
- **Pros**: No code change, and no stale message lands in the user's new turn.
- **Cons**: The user never sees that the earlier turn's check failed. The non-block notice is lost.
- **Why not chosen**: The owner wants the result visible.

### C3

#### Alternative A: A separate `running.json` for every spawned group (veles style)
- **Approach**: The supervisor writes every group it starts to its own state file, inside or outside a gate lock.
- **Pros**: It also covers the short git calls made outside the lock.
- **Cons**: It adds a second state file that must stay in step with the lock record, which already holds the same data for the long-running command.
- **Why not chosen**: The lock record already covers the processes that matter, which are the verify command and its git calls under the lock.

#### Alternative B: Children die with their parent
- **Approach**: Use `PR_SET_PDEATHSIG` or a watchdog per group.
- **Pros**: There is nothing to reap.
- **Cons**: `PR_SET_PDEATHSIG` is Linux only, and Node has no portable API for it. A watchdog adds a process per group.
- **Why not chosen**: It does not cover macOS.

#### Alternative C: Keep and document
- **Approach**: Add only the survival test and a "Limits" entry.
- **Pros**: No code change.
- **Cons**: An orphaned verify command keeps writing build output while the next run hashes the tree, and it holds resources.
- **Why not chosen**: The owner chose to bring veles's behaviour back.

## Agreed Approach

- **C1**: no code change. Add a "Limits" entry in `skills/agent-harness-verify-gate/SKILL.md` and draft the follow-up task in the pull request.
- **C2**: a handler result can carry an optional `stale` text. This is an additive field of the handler interface. verify-gate sets it on a failing turn end, to a fixed text that carries no attempt count and no instruction. When a turn-end result is superseded and no later turn end is queued for the session, the OpenCode adapter sends `stale` as a `resume: false` synthetic message and then calls `release`. When a later turn end is queued, that run reports anyway, so the superseded result is dropped as today. This avoids stale "failed" notices for a tree a later turn already fixed.
- **C3**:
  1. **Reap**: when the newest gate lock is unreleased, its holder `pid` is dead and it is younger than 24 h, the supervisor's `lock.acquire` first terminates the holder's recorded `pgids`. It skips groups it may not signal (EPERM). The kill is the existing `killGroups`, bounded by the event's deadline. After the kill the supervisor re-checks that the event is still active. It takes the lock only once those groups are gone, and otherwise replies "busy".
  2. **Signals**: the Claude Code entry handles SIGTERM, SIGHUP and SIGINT in `runAsScript`. The handler closes every live runtime through a module-level registry with a 4.5 s cleanup deadline, so SIGKILL goes out at about 3.5 s, and then exits 0.

## Key Decisions

- C1 stays as built. Its reason and the follow-up task go in the PR and the skill's "Limits".
- A superseded OpenCode result becomes a notice only when it is the newest settled result for the session. Delivering every superseded result would repeat stale failures. The notice uses the handler's `stale` text, not the block text, so it never says "Fix the failure".
- C3 reuses the gate lock record (`pid`, `pgids`) instead of a new `running.json`.
- C3 reaps in the supervisor, because it owns `killGroups`. `src/shared/lib/state.mts` gains a read-only `staleGroups` helper, and `acquireGateLock` is unchanged.
- The `stale` result field is the only change to the handler interface, and it is additive. The pool close, the runtime close and the module-level registry are internal plumbing.
- The existing OpenCode test "C starts but has not ended when B's run settles: nothing is delivered" asserts the behaviour the owner reversed. It is updated as part of the requested change, not to make a failure pass, and the PR says so.
- Version bumps: `hook-runtime` (supervisor, Claude entry, OpenCode adapter, shared state) and `verify-gate` (it bundles `lib/state.mts`). Both are released to the Pages catalog.

## Open Questions

- None blocking. The design (`design.md`) settles the pid-reuse bound (24 h plus the EPERM skip), the SIGKILL timing (4.5 s cleanup deadline) and the manual-run limits, which are documented in "Limits".
