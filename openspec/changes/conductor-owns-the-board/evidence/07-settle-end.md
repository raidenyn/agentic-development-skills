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

Status at the checkpoint: the issue is open, the thread is unsettled, and the wakes are
queued behind the timer and line-mcp runs. This section is updated with the result.

## End of the board

Not yet exercised. T3 #33 was closed at 16:39:57Z and its thread archived; T1 #27 is closed;
T2 #29 is the remaining open issue with a Run thread. After the partial-delivery settle, the
remaining steps are: close #29, close the `M1 scratch` and `M1 other` milestones, send a
wake, and check that both scheduled tasks are disabled and this thread is settled but not
archived. Reopening the milestone and sending "check the triggers" then re-enables them.
