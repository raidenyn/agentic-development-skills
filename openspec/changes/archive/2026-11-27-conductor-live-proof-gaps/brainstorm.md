## Design Summary

Task #36 (M1, Hardening) runs the conductor on the Bank MCP board (`https://github.com/users/raidenyn/projects/4`, `raidenyn/line-mcp`). The first onboarding, its manual wake, five timer wakes and a second onboarding showed three gaps in `project-conductor`. The owner asked to fix all three in this task's one pull request in this repository:

1. **`coalesceKey`.** The reference's webhook trigger object has the literal `coalesceKey` `project-conductor`. The host rejects a literal key (`Expected <filter>`), so the live onboarding used `{{headers.x-github-hook-id}}`. Every compare since then reports `differs: ["dedupe"]` as an owner step that nobody can close. The fix makes the template the reference value.
2. **Scan size.** The backward scan and the onboarding's owner-steps carry read the conductor thread with `view: "activity"`, which holds every tool call and its output. In a thread with several wakes, the second onboarding skipped the scan because its pages were too large. The fix reads `view: "messages"`, which holds only the messages these scans use, and lets the onboarding carry stop early.
3. **Owner added the hook.** When the agent is not an admin, the hook is an owner step. Once the owner had added it, the conductor had no defined result for "the owner did it", so it made up a register report. The fix defines it: with admin, find the hook by the trigger id in its URL; without admin, record `done by the owner, not checked: not an admin`.

This is a fast-forward run: the owner asked to start at once. The owner approves the approach when they review the pull request.

## Alternatives Considered

### Alternative A: Keep the literal key and ignore `dedupe` in the compare
- **Approach**: drop `coalesceKey` from the compare's view.
- **Pros**: one line.
- **Cons**: the reference would still tell the agent to create a trigger that the host refuses, and a really differing key would go unseen.
- **Why not chosen**: the reference must describe what the host accepts.

### Alternative B: Persist the owner-steps list on the board
- **Approach**: store the list and the last check time in the board readme block, as the #35 follow-up suggested.
- **Pros**: no thread scan at all.
- **Cons**: it changes the frozen Settings block, which this task may not change.
- **Why not chosen**: out of scope. It is proposed as a follow-up.

## Agreed Approach

Change the references and the two specs as above. Make no change to the Settings block, the Run record or the Phase report.

## Key Decisions

- `{{headers.x-github-hook-id}}` coalesces per repository hook. On a board with several repositories, deliveries from two hooks are not merged; both wakes read the same board, so this is harmless.
- The `messages` view includes `user_message` items with `senderThreadId`, so the scan's webhook-run and report rules are unchanged.
- Without admin, the owner's word is recorded and not checked. The automatic check still catches a hook that does not deliver.

## Open Questions

- none
