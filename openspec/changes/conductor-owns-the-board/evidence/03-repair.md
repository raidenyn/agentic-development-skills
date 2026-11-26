# Task 8.3: repair proofs (2026-11-26)

## Setup

The timer was paused before the cases were prepared:

- `project-conductor timer`, `scheduled-task:f2005dbe-4a5f-406d-993a-3255db5e41ce`,
  `enabled: false`.
- The webhook trigger stayed enabled.

The two task threads were launched before their board fields were written, as worktree
threads in the `task-run-scratch` project:

| Thread | Title | Branch | Run thread |
|---|---|---|---|
| `mcp:launch:a3356022d9fd2cf637c9eac5bd3baff3aa821acce33975cfbfb075f642c275e7` | `raidenyn-shadow/task-run-scratch#4 attempt 1` | `feat/4-repair-proof` | not set |
| `mcp:launch:03201d2a48a9e150469741dc008208fb8c32a546aae76b73e88136aa7978b29d` | `raidenyn-shadow/task-run-scratch#5 attempt 1` | `feat/5-repair-proof` | set on #5 |

The board cases before the wake:

| Issue | Assignee | Status | Run phase | Attempt | Run thread |
|---|---|---|---|---|---|
| #1 | `raidenyn-shadow` | Backlog | — | — | — |
| #4 | `raidenyn-shadow` | In progress | plan | 1 | — |
| #5 | `raidenyn-shadow` | In progress | plan | 1 | `mcp:launch:03201d2a…` |

Both threads were idle when the wake started; neither branch was pushed and neither had a
pull request.

## The wake

The conductor thread received the sentence-only manual wake:

```text
Run one wake of the project-conductor skill for this board.
```

Its report:

```text
## Wake: board https://github.com/users/raidenyn-shadow/projects/5

Trigger: manual wake (message from thread `adf02ed1-…`, sentence only)

### Repaired
- `raidenyn-shadow/task-run-scratch#1`: released — the claim had no thread; removed the agent
  from the assignees. `Run phase`, `Attempt`, `Run thread` and Status "In progress" already
  held their targets and no branch existed, so no other write was made.
- `raidenyn-shadow/task-run-scratch#4`: recorded — `Run thread` =
  `mcp:launch:a3356022d9fd2cf637c9eac5bd3baff3aa821acce33975cfbfb075f642c275e7`, the one exact
  match for launch key `…/task-run-scratch#4 attempt 1`.
- `raidenyn-shadow/task-run-scratch#5`: ok — thread
  `mcp:launch:03201d2a48a9e150469741dc008208fb8c32a546aae76b73e88136aa7978b29d` is live (not
  archived), titled with the launch key `…#5 attempt 1`, branch `feat/5-repair-proof`.
  Nothing written.

### Started
- none
```

The rest of the report listed every board item as not started, with the planned reasons
(`#20` taken by `feat/20-l-preexisting`, `#21` untrusted because edited by `raidenyn`, `#22`
blocked by open `#1`, the keyless and malformed fixtures, and so on). It also reported
`Settled` for #5 as `none` (no merged pull request) and `Half-made claims: none`.

## Result

- **#1 released:** the assignee was removed; no other write was needed.
- **#4 recorded:** `Run thread` holds the matching thread id.
- **#5 untouched:** the live thread and its `Run thread` stayed as written.
- **No second thread:** no `start` candidate existed, and no launch happened. The project's
  thread list showed only the previous probe thread; the two repair threads were archived
  after the proof.

Board after cleanup, both slots free (all three issues Backlog, no run fields, no assignee):

```text
#1 Backlog — — — —
#4 Backlog — — — —
#5 Backlog — — — —
```

## Cleanup

- Deleted the local branches `feat/4-repair-proof` and `feat/5-repair-proof` and removed their
  worktrees.
- Archived the #4 and #5 threads, and the second-conductor check thread.
- Re-enabled the timer; the next run was 14:38:57Z.
- The webhook trigger and hook `717162700` stayed active.

## Finding: the manual wake's Triggers section

The timer was disabled for this wake, but the report's Triggers section said:

> not checked — this is a manual wake; both triggers remain enabled and bound to this thread.

A manual wake does not read the triggers, so it cannot assert that they are enabled. This is
a wording defect in the report, not a write. Recorded for the PR; the skill should say only
"not checked" for a manual wake, without a state claim.
