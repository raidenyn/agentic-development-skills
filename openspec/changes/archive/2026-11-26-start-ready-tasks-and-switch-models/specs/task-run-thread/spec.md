## ADDED Requirements

### Requirement: Skill exists
The repository SHALL contain the skill `task-run` at `skills/task-run/`, created with `python3 scripts/skills.py new task-run "<description>"`, with a marketplace entry and a row in the README's Skills table. Its description MUST start with "Use when" and name the start and apply instructions as its triggers.

#### Scenario: Validators accept the skill
- **WHEN** `python3 scripts/skills.py validate`, `claude plugin validate .`, the Python unit tests and `pnpm run check` run
- **THEN** all pass with `task-run` present

### Requirement: Reconcile before planning
On the start instruction, the thread SHALL follow steps 1 and 2 of the task's Start section before any planning, and stop for the owner where those steps say to. It MUST work on the branch named in the start instruction and open no other branch. That branch takes the place of Start step 3's fresh branch.

#### Scenario: Task differs from the code
- **WHEN** the reconcile finds that a contract the task relies on is missing from the default branch
- **THEN** the thread stops and tells the owner in the thread, and sends no phase report

### Requirement: Plan with today's stops
The thread SHALL plan by the repository's own process, with every owner stop that process has today. In this repository and the scratch repository that process is the OpenSpec change opened with `openspec-ff-change`.

#### Scenario: Review gate asks the owner
- **WHEN** the repository's process stops for an owner choice during planning
- **THEN** the thread asks in its own thread and waits, and sends no report until the planning files are complete

### Requirement: Phase report after planning
When planning is complete, the thread SHALL:
1. commit and push the planning files to its branch;
2. make sure no background command is running;
3. send to the conductor thread, in queue mode with a fresh context, the report line from the start instruction with `head` set to the pushed commit, followed by the wake sentence;
4. end its turn.

#### Scenario: Report sent
- **WHEN** the planning files are pushed
- **THEN** the conductor receives `phase-done <owner>/<repo>#<n> attempt=1 phase=plan seq=1 head=<pushed sha>` and the thread's turn ends with no background command running

### Requirement: Implement from the saved files
On the apply instruction, the thread SHALL read the named change folder and implement it by the repository's own process, through to its pull request, in the same worktree and branch. It MUST NOT rely on anything said in the planning turns that is not in the files.

#### Scenario: Coding turn after the switch
- **WHEN** the apply instruction arrives after the switch
- **THEN** the turn runs on the implement model in the same worktree, and reads the change folder it was pointed to
