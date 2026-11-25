# ADR: Keep run state on the board, in built-in links and three fields

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-11-25 |
| Decider | Repository owner (raidenyn) |
| Refines | [Run record](rfc-run-board-tasks-unattended.md#run-record) |

## Context

The conductor keeps nothing between wakes, so the state of each task's run must be durable somewhere else. It is needed to avoid starting a task twice, to recover a thread that died, and to refuse a phase report that does not belong to the current run. The owner asked that pickup assign the task and set Status to "In progress", and that the state use GitHub's own fields where they exist.

## Decision

We will hold the run state on GitHub.

| Fact | Where | Kind |
|---|---|---|
| Claim | Assignees: the agent account | built in |
| Started, in review, done | Status: "In progress" on pickup | built in |
| Branch | the issue's linked branch (`gh issue develop`) | built in |
| Pull request | the linked pull requests, through the closing keyword | built in |
| Waiting for the owner, parked or failed | the `blocked` label, with the reason and the phase to resume in a comment by the agent account | built in |
| Phase of the run | field "Run phase", single select: plan, implement, closeout, care | new |
| Attempt | field "Attempt", number | new |
| Thread | field "Run thread", text: the T3 thread id | new |
| Launch key | the thread's title, `<owner>/<repo>#<n> attempt <n>` | new |

Before starting a task the conductor checks: no assignee, no linked branch, no trusted linked pull request, and an empty "Run thread". Onboarding creates the three fields. The existing "Phase" field keeps its meaning, the kind of task.

The launch key covers the gap between two writes: a thread that was started but never recorded is found by its title. T3's search matches by word prefix and skips archived threads, so the conductor compares titles exactly.

A task whose thread died is restarted once from this record. A second failure labels it `blocked` and reports it.

## Options considered

- **One comment on the issue, edited in place.** It holds everything in one place with a version marker, but it is not visible as columns on the board and adds a comment to every issue. The owner preferred fields.
- **A ledger file on the server.** Private and fast, but invisible from GitHub and lost with the server.
- **A fourth field for the run's state** (running, waiting, parked, failed). Not taken: the `blocked` label and its comment carry it.

## Consequences

- The run state shows on the board without opening a thread.
- Fields hold no history, apart from Status changes in the issue timeline.
- GitHub Projects has no "set only if still empty". One conductor per board and its queued wakes are the protection against two writers, and the repair step covers a wake that died between two writes.
- Verified on a scratch board: the three fields can be created, written, read and cleared with the agent's token; a 2,000-character text value is rejected, and a thread id is about 80 characters.
