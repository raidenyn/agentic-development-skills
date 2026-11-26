## MODIFIED Requirements

### Requirement: Phase report after planning
When planning is complete, the thread SHALL, in this order:
1. commit and push the planning files to its branch;
2. make sure no background command is running;
3. send to the conductor thread, in queue mode with a fresh context, the report line from the start instruction with `head` set to the pushed commit, followed by the wake sentence "Run one wake of the project-conductor skill for this board.";
4. end its turn.

#### Scenario: Report sent
- **WHEN** the planning files are pushed
- **THEN** the conductor receives `phase-done <owner>/<repo>#<n> attempt=1 phase=plan seq=1 head=<pushed sha>` followed by the new wake sentence, and the thread's turn ends with no background command running

## ADDED Requirements

### Requirement: One task, one issue, one pull request
The thread SHALL open exactly one pull request for its task. The body MUST hold `Closes <owner>/<repo>#<n>` for the task's issue.

#### Scenario: Pull request opened
- **WHEN** the implement phase opens its pull request
- **THEN** the pull request body holds `Closes <owner>/<repo>#<n>`, and no second pull request exists for the task

### Requirement: Work that does not fit becomes a follow-up task
When the task's "If it does not fit" rule applies, the thread SHALL create the follow-up task before it opens the pull request. The follow-up is an issue in the same repository:
- **First line:** `<!-- task: <rfc-slug>/<milestone-slug>/<next> -->`, with the current task's prefix. `<next>` is one above the highest number under that prefix in any issue of the repository, open or closed.
- **Body:** the task format, written from the remaining work, with the current task's design constraints.
- **Placement:** the current task's milestone. It is added to the board named on the instruction's `Board:` line, with Status Backlog. Phase and Area are copied only when the board has that field and the current item holds a value in it.
- **Links:**
  - it MUST be blocked by the current task;
  - every issue the current task blocks, the milestone's plan issue included, MUST also be blocked by the follow-up;
  - each link MUST be read back.
- **Key check:** after creating the issue, the thread MUST read the repository's keys again. When another issue holds the same key, it MUST renumber the new issue's first line once, to the next free number. A second collision MUST stop the task, and the thread asks the owner in its own thread.
- **The pull request:** it MUST name the follow-up under "Work discovered", and MUST mark the unmet criteria "moved to #<follow-up>".
- **A failed write** while creating the follow-up MUST stop the task. The thread asks the owner in its own thread and opens no pull request.

#### Scenario: Oversized task
- **WHEN** a task with key `scratch-rfc/m1-scratch/4`, which blocks `#9` and the plan issue `#12`, does not fit, and the highest key under the prefix is 6
- **THEN** a new issue keyed `scratch-rfc/m1-scratch/7` is on the board in Backlog, blocked by the task. `#9` and `#12` are each blocked by it, and the pull request names it

### Requirement: Board edits only for the follow-up
The thread SHALL NOT edit the board, the issue's fields, its labels or its assignees. The only exception is the writes of "Work that does not fit becomes a follow-up task", whose commands are in `skills/task-run/references/follow-up-github.md`.

#### Scenario: Normal run
- **WHEN** a task fits its size
- **THEN** the thread makes no board, label or assignee write
