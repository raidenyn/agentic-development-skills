## Why

`milestone-breakdown` caps each task's pull request at about 1,000 changed lines and 30 files, and stops a task at 1.5 times its estimate. The reason given is that a person must read the whole change. Coding agents routinely produce larger pull requests, and other agents review them. So the cap forces splits that exist only to meet a count, and each split costs scaffolding, a review and a session. Size tasks by behavior and verifiability instead.

## What Changes

**Task size settings**
- From: "Task size, lines of code" (about 1,000), "Task size, files" (30) and "Task overrun" (1.5 times the estimate) in the Settings table.
- To: removed. "Task size, acceptance criteria" (2 to 5) stays. A repository's own Settings table may still set the line and file settings (and "Task overrun"). Then sizing against them, the overrun stop and the size exception apply.
- Reason: line and file counts no longer measure whether agents can review a change.
- Impact: non-breaking for task lists already written. New breakdowns produce fewer, larger tasks.

**Sizing principle and envelope (`references/task-sizing.md`)**
- From: "Review is the limit". A person must understand the change, and a single very large pull request is the one to avoid.
- To: a task is one behavior with one verification path inside its pull request, reviewed by agents and accepted by the person on the report. The thing to avoid is a pull request carrying more than one behavior.

**Task template**
- From: the "If it does not fit" section stops "when the work goes well past the size above". Size is S/M/L, and L must be split or state an exception.
- To: the size stop is removed and the scope stops stay. Size is a rough, informational estimate of lines and files.

**Stacked pull requests**
- From: the skill asks "split further or stack?" whenever a behavior does not fit below the size settings.
- To: the question is removed everywhere, also under a repository-set limit and in `rfc-breakdown`. So are the "Stacked pull requests" setting, the plan header line and the breakdown brief line that recorded the answer. Stacking stays available when the person asks for it.

## Capabilities

### New Capabilities
- `milestone-task-sizing`: how `milestone-breakdown` sizes tasks and what makes a task too big or too small.

### Modified Capabilities

None. No existing spec covers task sizing. `task-run-thread` only follows the task's own "If it does not fit" rule, and its requirements do not change. Its scenario names "Oversized task" and "a task fits its size" are now just labels for "the rule applies" and "it does not".

## Impact

- `skills/milestone-breakdown/SKILL.md`: the Principles and Settings tables, the "Size each task" and "Ask before stacking" paragraphs, the checks and the report.
- `skills/milestone-breakdown/references/task-sizing.md`, `references/task-list-template.md`.
- `skills/rfc-breakdown/SKILL.md` and `references/breakdown-brief.md`: the stacking question and the "size settings" report line.
- `README.md` Skills table row for `milestone-breakdown`, if its wording relies on the limit.
- No code, tools or generated assets change.
