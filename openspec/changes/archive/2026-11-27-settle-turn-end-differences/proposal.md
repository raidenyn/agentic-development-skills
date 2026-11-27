## Why

Comparing the verify gate's turn end with veles's old turn-end hook (issue #62) turned up three differences that no planned task covers. A failure whose output tail changes gets fresh blocks. A superseded OpenCode result disappears silently. And on Claude Code, a killed hook leaves its verify command running, with nothing to clean it up. The owner decided each one on 2026-11-26. This change records those decisions and brings back the two behaviours that matter.

## What Changes

**C1 Failure identity (kept)**
- From: the identity (argv, exit status, normalized tail) is not explained next to veles's rule.
- To: the same rule. The verify-gate skill's "Limits" explains that a changed tail is a new failure, that the count is per session and is not reset by a pass, and that the 10-block backstop bounds it. The PR proposes a follow-up task: several verify commands run in parallel, keyed on the failing command.
- Reason: a changing tail usually means progress, and the follow-up makes the identity simpler.
- Impact: documentation only.

**C2 Superseded OpenCode turn-end result**
- From: a result overtaken by a newer turn is dropped, and its charge is refunded.
- To: if no later turn end is queued for the session, the result's `stale` text is delivered as a notice that does not resume the agent. It is still not counted. Handler results gain an optional `stale` field, which is an additive change to the provisional handler interface. verify-gate sets it on a failing turn end, with a fixed text that carries no attempt count and no instruction.
- Reason: the user should see that the previous turn's check failed.
- Impact: not breaking. A handler that does not set `stale` behaves as before.

**C3 Leftover process groups**
- From: a dead holder's gate lock is taken over without signalling the `pgids` it recorded. The Claude Code entry ignores SIGTERM, SIGHUP and SIGINT.
- To: when the newest lock was left unreleased by a dead `pid` less than 24 h ago, the supervisor's lock acquisition first terminates that lock's recorded groups that are still alive. It skips groups it may not signal (EPERM), bounds itself by the event's deadline, and checks again that the event is still active before taking the lock. The Claude Code entry closes every runtime on SIGTERM, SIGHUP and SIGINT (SIGKILL after about 3.5 s, exit by 5 s) and prints nothing.
- Reason: an orphaned verify command keeps running beside the next check.
- Impact: not breaking.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-hook-runtime`: result merging gains `stale`; the OpenCode turn-end slot delivers the newest superseded result as a notice; the supervisor reaps a dead holder's recorded groups at lock acquisition; the Claude Code entry cleans up on signals.
- `verify-gate-triggers`: a failing turn end carries a `stale` text; a superseded block stays uncounted and is shown; the failure identity states that a changed tail is a new failure.

## Impact

- **Code**: `src/hook-runtime/lib/{opencode-adapter,supervisor,runtime}.mts`, `src/hook-runtime/claude.mts`, `src/shared/lib/{state,handler.types}.mts`, `src/verify-gate/handler.mts`.
- **Tests**: `tests/agent-harness/{opencode-adapter,runtime,supervisor,state,verify-handler,claude-adapter}.test.mjs`, plus a new C3 process test. One existing OpenCode test asserts the reversed C2 behaviour and is updated.
- **Docs**: the "Handler interface", delivery and termination sections of `skills/agent-harness-hook-runtime/SKILL.md`, and the "Limits" of `skills/agent-harness-verify-gate/SKILL.md`.
- **Versions**: `hook-runtime` 0.1.3 → 0.1.4 and `verify-gate` 0.2.1 → 0.2.2, released to the Pages catalog.
- **Contracts**: the handler interface changes additively (`stale`). The frozen contracts are unchanged.
