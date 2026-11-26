# Task 8.6: settle and end of the board (in progress)

## Normal merge

T1's PR #31 was merged at 16:16:42Z with `Closes raidenyn-shadow/task-run-scratch#27`.
Issue #27 closed at 16:16:43Z; the conductor's next wake found the merged PR by the branch
from T1's thread and settled the thread. The board item is Done.

## Merge that leaves its issue open

T2's PR #35 was merged at 16:37:06Z with `Closes raidenyn-shadow/task-run-scratch#29`.
Issue #29 closed three seconds later; it was reopened at 16:39 to stage the partial-delivery
case. The T2 thread had already been settled by an earlier wake, so it was unsettled at
16:40 to put it back in Settle's scope. The next wake after the 5-minute grace is expected to
label #29 `blocked`, write the "merged without closing its issue" comment, and settle the
thread again.

Result (pass): the next wake labelled #29 `blocked` and wrote the agent comment:

```text
Run stopped by the conductor.
Step: Settle.
Reason: merged without closing its issue.
```

The T2 thread is settled again; the issue remains open.

## End of the board

T3 #33 was closed at 16:39:57Z and its thread archived; T1 #27 and T2 #29 were closed;
`M1 scratch`, `M1 other` and the second repository's `M2 scratch` were closed. In the timer
wake at 16:52Z the conductor reported:

```text
### Triggers
- End of the board: every milestone is closed and no run is in flight. Both triggers are
  disabled (webhook ... disabled this wake, timer ... already disabled). To resume after
  reopening a milestone, tell this thread: check the triggers.
- Automatic check: not run, the wake found the end of the board.
```

Start did not run and Advance had no reports. The conductor thread was settled; an
already-queued webhook wake (run 32) started after that and unsettled it. The wake was
interrupted and the thread settled again: `settled: true`, `archived: false`. The triggers
and the hook were then deleted in 8.9.

The resume path ("reopen a milestone, check the triggers") was not re-run because the
webhook trigger's signature had been cleared by the automatic check (see 8.9) and the
triggers were deleted in cleanup; the skill's Check the triggers path is the same one that
re-enabled the timer in the earlier run.

