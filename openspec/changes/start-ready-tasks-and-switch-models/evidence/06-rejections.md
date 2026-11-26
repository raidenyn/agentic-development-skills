# Criterion 2: four prepared issues are reported and not started (2026-11-25)

The lines come from the first wake's report (`05-start.md`) and are repeated in every later wake.

| Case | Issue | Set-up | Conductor's line | Started? |
|---|---|---|---|---|
| No task key | K #18 | keyless body | "#7, #8, #9, #10, #11, #12, #18: not tasks (no task key, or a malformed one), not handled." | no |
| Open "Ready to start when" condition | C #19 | Backlog, body `**Ready to start when:** owner signs off` | "#19 C: … in Backlog with a "Ready to start when" condition, waiting for a person to set Ready." | no |
| Linked branch already present | L #20 | `feat/20-l-preexisting` linked before the wake | "#20 L: … Ready, but taken by the branch `feat/20-l-preexisting`." | no |
| Body edited by a second account | E #21 | Ready, body edited by `raidenyn` (write access) | "#21 E: … Ready, but untrusted: the body was edited by `raidenyn`, which is neither the agent nor the repository owner." (wake 8) | no |

Also reported, and not started:
- O #22, blocked by the open #1: "blocked by the open issue #1".
- The plan item #2: "a plan item, not handled yet".
- The draft item: "not a task (a draft item)".

## Second-author case (2026-11-26)

- `raidenyn` accepted the invite: `gh api repos/raidenyn-shadow/task-run-scratch/collaborators/raidenyn/permission` returns `write`.
- `raidenyn` edited #21's body (it now ends with an added line). The issue's `userContentEdits` has `totalCount` 2, with editors `raidenyn` (2026-11-26T01:06:05Z) and `raidenyn-shadow` (2026-11-25T17:14:49Z).
- Wake 8 of the conductor thread (run 8, 01:07:31–01:10:02Z, trigger "manual wake") reported:

  > #21 E: task to be edited by a second account: Ready, but untrusted: the body was edited by `raidenyn`, which is neither the agent nor the repository owner. If it had passed, it would still have waited for a free slot (3 of 2 in use: #15, #16, #17).

- The board after the wake: #21 is Status Ready, with no assignee, no linked branch and no Run thread.

**Result: done.** All four cases of criterion 2 are reported and not started.

Wake 8 read its inbox through the `messages` view of `t3_thread_read` rather than the `activity` view the reference names. The messages view returned the same messages, with their `senderThreadId`, and the answers matched those of wake 7.
