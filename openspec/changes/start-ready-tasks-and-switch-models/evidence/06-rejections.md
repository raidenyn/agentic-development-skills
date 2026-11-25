# Criterion 2: four prepared issues are reported and not started (2026-11-25)

The lines come from the first wake's report (`05-start.md`) and are repeated in every later wake.

| Case | Issue | Set-up | Conductor's line | Started? |
|---|---|---|---|---|
| No task key | K #18 | keyless body | "#7, #8, #9, #10, #11, #12, #18: not tasks (no task key, or a malformed one), not handled." | no |
| Open "Ready to start when" condition | C #19 | Backlog, body `**Ready to start when:** owner signs off` | "#19 C: … in Backlog with a "Ready to start when" condition, waiting for a person to set Ready." | no |
| Linked branch already present | L #20 | `feat/20-l-preexisting` linked before the wake | "#20 L: … Ready, but taken by the branch `feat/20-l-preexisting`." | no |
| Body edited by a second account | E #21 | needs `raidenyn` to edit the body | see below | — |

Also reported, and not started:
- O #22, blocked by the open #1: "blocked by the open issue #1".
- The plan item #2: "a plan item, not handled yet".
- The draft item: "not a task (a draft item)".

**Second-author case: not done at the time of writing.** `raidenyn` was invited with write access to `raidenyn-shadow/task-run-scratch` (invitation 346325499), but `gh api …/collaborators/raidenyn/permission` still returns `read`, so the owner cannot edit #21 yet. Until the edit is made, #21 is trusted and Ready, and is held back only by the slot limit.

The rule itself was checked on synthetic data in Task 3 (`run-github.md` trust filter): an editor who is neither the agent nor the owner gives `untrusted`.
