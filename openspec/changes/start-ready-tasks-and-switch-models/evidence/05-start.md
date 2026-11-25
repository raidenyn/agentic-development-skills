# Criterion 1: one wake starts exactly two threads (2026-11-25)

**Set-up.** Board project 5 of `raidenyn-shadow`, `maxParallel` 2, three Ready test tasks R1 #15, R2 #16 and R3 #17 (plus E #21, which is Ready and still trusted because the owner has not edited it). Nothing was in use.

**Wake.** The conductor thread `mcp:launch:542ee5f8587270275e12dd5e5f957a9d1e40ba34221cc17793da25ca0ac25753` ("conductor raidenyn-shadow/task-run-scratch", `claudeAgent/claude-opus-5-5`) was launched in the T3 project `task-run-scratch` with the message `Run one wake of the project-conductor skill for this repository.` Run 1 lasted 18:02:58–18:05:54Z.

## The conductor's report (run 1, verbatim excerpt)

> ### Started
> - #15 R1: add a greeting function: thread `mcp:launch:56b8278a56e90cd7ef36e50a9cc81f02690bd295af19c176fa682cdcfa5a212e`, branch `feat/15-r1-add-a-greeting-function`
> - #16 R2: add a word counter: thread `mcp:launch:89eac8d2fb0f08342d90327f8b6fc44edf5dec492a0194a688ece355ada9e1c9`, branch `feat/16-r2-add-a-word-counter`
>
> Both are on `claudeAgent/claude-opus-5-5` at effort medium. Each claim ended with all of these in place: assignee set, Status "In progress", Attempt 1, Run phase plan, branch linked, thread launched, Run thread set.
>
> ### Not started
> - #17 R3: add a reverser (only blocker closed as not planned): Ready, not started: no free slot (2 of 2 in use after this wake's claims).
> - #21 E: task to be edited by a second account: Ready, not started: no free slot (2 of 2 in use after this wake's claims).
> - #20 L: task with a linked branch: Ready, but taken by the branch `feat/20-l-preexisting`.
> - #22 O: task with an open blocker: blocked by the open issue #1.
> - #19 C: task with an open start condition: in Backlog with a "Ready to start when" condition, waiting for a person to set Ready.
> - …
> ### Gaps (owner step)
> - none. … The label `blocked` was missing; I created it and read it back.

## The board after the wake

Read with `gh project item-list` and GraphQL between 18:05 and 18:06Z:

| Issue | Status | Run phase | Attempt | Run thread | Assignee | Linked branch |
|---|---|---|---|---|---|---|
| #15 | In progress | plan | 1 | `mcp:launch:56b8278a…a212e` | raidenyn-shadow | `feat/15-r1-add-a-greeting-function` |
| #16 | In progress | plan | 1 | `mcp:launch:89eac8d2…e1c9` | raidenyn-shadow | `feat/16-r2-add-a-word-counter` |
| #17 | Ready | — | — | — | — | — |

The two threads are titled with their launch keys, `raidenyn-shadow/task-run-scratch#15 attempt 1` and `raidenyn-shadow/task-run-scratch#16 attempt 1`. Each worktree is on its linked branch.

**Result: done.** Exactly two threads started. #17 was left Ready even though its only blocker is closed as not planned: the Ready rule held, and #17 was skipped only because no slot was free. E (#21) was in the same position.

Note: #17 was later claimed by hand as a test fixture for criterion 4 (see `08-reports.md`). That is why later wakes count three slots in use.
