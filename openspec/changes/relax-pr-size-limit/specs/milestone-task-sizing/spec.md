## ADDED Requirements

### Requirement: No line or file limit by default
The `milestone-breakdown` skill SHALL NOT limit a task by changed lines or changed files unless the repository's design Settings table sets "Task size, lines of code" or "Task size, files". Its default Settings table MUST NOT contain those rows or a "Task overrun" row.

#### Scenario: Large single-behavior task
- **WHEN** a milestone has one behavior estimated at 4,000 changed lines and 60 files, with 4 acceptance criteria, and the repository sets no size settings
- **THEN** the breakdown writes it as one task, with no size exception and no question about splitting or stacking

### Requirement: A repository-set limit restores the old size rules
When the repository's Settings table sets "Task size, lines of code" or "Task size, files", the skill SHALL size tasks against those values. Each task's "If it does not fit" section MUST also stop at the "Task overrun" value: the repository's own, or about 1.5 times the estimate.

#### Scenario: Repository sets its own limit
- **WHEN** `openspec/design/README.md` has a Settings table with "Task size, lines of code" set to 1,000 and no "Task overrun" row
- **THEN** the breakdown sizes tasks against 1,000 lines, and each task's "If it does not fit" section also stops at about 1.5 times the task's estimate

#### Scenario: Repository sets its own overrun
- **WHEN** the repository sets "Task size, lines of code" and "Task overrun" to 2 times
- **THEN** each task's "If it does not fit" section stops at about 2 times its estimate

### Requirement: Size exception under a repository-set limit
When the repository sets a size limit and a behavior cannot be split below it into parts that can each be verified alone, the skill SHALL write one task that states the size exception. It MUST NOT ask whether to stack pull requests.

#### Scenario: Over a repository-set limit
- **WHEN** the repository sets "Task size, lines of code" to 1,000, and one behavior estimated at 2,000 lines cannot be split into parts that can each be verified alone
- **THEN** the breakdown writes one task that states the size exception, without asking about stacking

### Requirement: Size by behavior and verification
A task SHALL deliver exactly one behavior, SHALL have acceptance criteria within the "Task size, acceptance criteria" setting (default 2 to 5), and SHALL be verifiable inside its own pull request. A task whose criteria describe behaviors that could each be shown on their own MUST be split along a behavior.

#### Scenario: Two behaviors in one task
- **WHEN** a draft task's title needs "and" to describe two outcomes that can each be shown working on their own
- **THEN** the breakdown splits it into two tasks, whatever their estimated size

#### Scenario: Too many criteria
- **WHEN** a draft task has 8 acceptance criteria
- **THEN** the breakdown splits or rethinks it, even when its estimated line count is small

### Requirement: Size is informational
When the repository sets no size settings, each task SHALL record a rough estimate of changed lines and files for the reviewer. The estimate MUST NOT be bucketed into S, M or L, and MUST NOT require a split or a stated exception.

#### Scenario: Task description
- **WHEN** the breakdown writes a task, and the repository sets no size settings
- **THEN** the task's Size line and its row in the plan table read like "about 2,500 lines, 40 files", and the plan's checks have no size line to answer

### Requirement: Scope stops replace the size stop
The task template's "If it does not fit" section SHALL stop the work when:
- a frozen contract or agreed decision would have to change;
- a provisional contract would have to change in a way the RFC does not allow;
- behavior the RFC does not describe is needed;
- the criteria cannot be proved inside the pull request.

It MUST NOT stop on the amount of work alone, unless the repository sets the size settings.

#### Scenario: Work grows but stays in scope
- **WHEN** an implementer of a task finds the change needs twice the estimated lines, no contract, decision or criterion is affected, and the repository sets no size settings
- **THEN** the implementer continues without stopping

### Requirement: Report the actual size
The task template's "The pull request reports" list SHALL include the actual size against the estimate when they differ a lot.

#### Scenario: Size doubled
- **WHEN** a task estimated at 1,500 lines lands at 3,000 lines
- **THEN** its pull request reports both numbers

### Requirement: Stacking only on request
The skills SHALL NOT ask the person whether to stack pull requests, and MUST NOT keep a setting or a recorded answer for it: no "Stacked pull requests" setting in `milestone-breakdown`, no plan header line for it, and no stacking question or answer line in `rfc-breakdown` or its breakdown brief. Stacked pull requests MUST remain allowed when the person asks for them, with the existing rules for naming the task a stacked task sits on.

#### Scenario: No stacking prompt
- **WHEN** a behavior is large but cannot be split into parts that can each be verified alone
- **THEN** the breakdown keeps it as one task and does not ask about stacking

#### Scenario: RFC breakdown asks nothing about stacking
- **WHEN** `rfc-breakdown` collects the questions to ask once, together, before splitting the milestones
- **THEN** the list has no question about stacked pull requests, and the breakdown brief has no "Stacked pull requests" line

#### Scenario: Person asks for a stack
- **WHEN** the person asks to stack two tasks of the milestone
- **THEN** the second task names the first under "Depends on" as stacked, and the dependency check accepts it
