# Task list template

The list does not depend on where tasks are stored. The first part is the plan for the milestone. Each task after it is self-contained, so it can be copied into an issue, a board card, a file or an OpenSpec change as it stands.

````markdown
# Tasks: <milestone name>

RFC: <link to the RFC file> · Milestone: <name> · Prepared: YYYY-MM-DD

**Milestone outcome:** <what works when the milestone is done, from the RFC>

**Produces:** <contracts> · **Consumes:** <contracts, and the milestone that produced each>

**Stacked pull requests:** <not needed so far / the person chose to split further / the person allowed them for this milestone>

## Coverage

What the milestone must deliver, from the RFC, and which tasks deliver it.

| Must deliver | From the RFC | Tasks | Verified by |
|---|---|---|---|
| <short name> | <link to the section, decision or contract> | <task names> | <test, check or command> |
| <short name> (inferred) | <link> | deferred: <reason and where it goes> | |

Tasks that deliver no entry: none, or <enabling task name> enables <entry names>.

## Findings from the code

- **Commands:** build `<…>` · tests `<…>` · lint and types `<…>`
- **Entry points and modules:** <paths>
- **Hotspot files:** <paths, and which tasks touch each>
- **Examples to copy:** <kind of thing> → <path>
- **Differs from the RFC:** none, or <what, with paths>

## Assumptions

| Name | Default | Why it is safe | Used by |
|---|---|---|---|
| <short name> | <the default> | <reason, and how to revisit> | <task names> |

## Questions and answers

None, or for each open question: the question, the possible readings, the recommendation, and the tasks that wait for the answer. For each answered one: the question, the answer, who gave it and when, and the tasks it shaped.

## Contracts between tasks

None, or for each seam found during the breakdown: name, shape, the task that produces it, the tasks that consume it.

## Order

| # | Task | Kind | Depends on | Can run in parallel with | Size |
|---|---|---|---|---|---|
| 1 | <task name> | behavior / enabling / spike / closing | none | none | S / M / L, ~lines, ~files |
| 2 | <task name> | | <task names> | <task names> | |

The number is only the order. Refer to tasks by name.

Add a Mermaid dependency graph when there are more than five tasks.

## Checks

Dependencies

- Start conditions met, or carried by the tasks they block: yes / no, with detail
- Nothing is consumed before it is produced: yes / no
- Every task that consumes something produced in this list depends on its producer, directly or through another task, and every stated dependency is a real one: yes / no
- Every task depends only on merged work, or is stacked with the person's agreement for this milestone: yes / no
- Each contract has one producer: yes / no
- No cycles: yes / no
- Tasks marked parallel do not depend on each other, share no open decision, and do not write to the same files, hotspot, migration sequence or local resource: yes / no
- Frozen contracts untouched: yes / no
- Later milestones still get what they consume: yes / no
- Dependencies the RFC does not mention: none / list

Coverage

- Every coverage entry has a task or a stated deferral: yes / no
- Every task delivers an entry or enables one: yes / no

Tasks

- No open question blocks a written task, and every assumption used is cited: yes / no
- Every behavior task can be shown working on its own, and every enabling task says what it enables: yes / no
- Every task can be verified alone: yes / no
- Every task fits the size settings or states its exception, and none is too small: yes / no
- Migrations ordered and split where data is live, and unfinished visible work guarded: yes / no / not applicable
- Starts with an end-to-end path and ends with a closing task: yes / no / not applicable
- No line numbers or step-by-step implementation in any task: yes / no

Independent review: done by a separate session (<model the person chose>), with findings settled / not available, self-check only

## Findings that need an RFC amendment

None, or: what was found, which decision or contract it affects, and the proposed amendment.

## Changes to the plan

Empty at first. After each reconcile: date, what changed, why, and the merged task or spike that caused it.

---

## <Task name>

**Kind:** behavior / enabling / spike / closing · **Size:** S / M / L (<rough lines and files>)

**Outcome:** <one behavior, in one sentence. What can be shown working after this merges.>

**Why now:** <what this unblocks, or which risk it tests>

**Delivers:** <coverage entry names, each linked to the RFC. For an enabling task: what it enables.>

**In scope:** <what this task changes, named by behavior, spec and component, not by file list>

**Out of scope:**
- <neighboring behavior, and the task that owns it>
- <what must not change>
- No new dependencies without asking.

**Produces:** <contracts or data, or none> · **Consumes:** <contracts or data, or none>

**Depends on:** <task names, or none. None only when everything the task needs already exists. If this task is stacked on another, say so.>

**Ready to start when:** <conditions from the RFC that must hold first, such as a sign-off, or "no conditions">

**Assumptions in force:** <each assumption's name and its default, or none. If the code contradicts one, report it and do not change course on your own.>

**Starting points** (not the full list of files that may change):
- <spec that describes the behavior, such as an OpenSpec spec>: <which requirement applies>
- <contract or schema>: <why>
- <entry point>: <where the change starts>
- <example to copy>: <what to follow in it>

**Acceptance criteria:**
- Given <…>, when <…>, then <…>. Proved by: <test name or command>
- <…>. Proved by: <…>
- The standard checks pass: `<commands>`. The main branch still builds and can be released.

**Guard:** <the flag or unused path that hides this until the milestone is complete, or "not needed">

**Open choices:** <choices the RFC leaves to implementation that this task must make. Internal structure and local names are always yours.>

### Design constraints

- **RFC:** <link> · **Milestone:** <name>
- **Task:** <link to this task where it is tracked, added once it has one>
- **Decisions this task implements:** <decision names, each linked to the RFC>
- **Contracts:** <name (frozen or provisional), produced or consumed, each linked>
- **Conditions:** <conditions from the RFC's decision outcome or decisions that apply to implementing or releasing this task, or none>
- **Rule:** Follow the frozen contracts and agreed decisions as written. If one turns out wrong, stop and propose an RFC amendment. Do not diverge in this change's own design.

### If it does not fit

Stop when a frozen contract or agreed decision would have to change, when a provisional contract would have to change in a way the RFC does not allow, when behavior the RFC does not describe is needed, when the criteria cannot be proved inside this pull request, or when the work goes well past the size above (<the task overrun setting, about 1.5 times by default>).

Then do one of two things. If a coherent part passes the checks, ship that part, mark the unmet criteria "not done" with the reason, and propose how to split the rest. If nothing coherent passes, leave the branch clean and report what you tried and found.

Never drop a criterion silently, change or delete existing tests to make them pass, add scope, or put in a placeholder to get past a gap.

### The pull request reports

- Each acceptance criterion with its evidence.
- The contracts and areas of the code actually changed.
- Anything that differs from this task, and assumptions that proved wrong.
- Effects on later tasks.
- Work discovered on the way that was not needed to finish, as a proposed new task.

## <Next task name>

…
````

## Notes on the fields

- **Coverage** is filled before any task is written and checked after. An entry is named, not numbered.
- **Kind** tells the reviewer what to expect. A behavior task shows something working. An enabling task creates something stable that others consume. A spike produces findings. A closing task proves the whole flow and removes temporary code.
- **Size** is a rough signal for the reviewer, not an estimate to be held to. S is well under half the task size settings, M is within them, L is at or over one of them. A task marked L is split or states why it is an exception. See [task-sizing.md](task-sizing.md).
- **Out of scope** is never empty. It is the main defense against a task growing.
- **Starting points** point at things that stay true: specs, contracts and entry points first, then one example to copy. Links deep into the code are fragile. A full file list goes stale after the first refactor, and line numbers go stale sooner.
- **Acceptance criteria** always include the line about the standard checks and the main branch. It is what makes each task safe to merge on its own. Where the repo's practice allows, the tests for the other criteria fail before the task and pass after.
- **Design constraints** is copied into the proposal of the OpenSpec change made from the task, or into the pull request description in a repo without OpenSpec. Its content does not change, apart from filling in the task link. Write its links as paths from the repository root or as full URLs, so they still resolve from the new place. If you use relative links, rewrite them for the destination and check them there.
- **If it does not fit** and **The pull request reports** are the same text in every task. Keep them in each task anyway, because the implementing session sees only its own task.
- A one-task milestone uses the same task format. Of the plan sections it always needs Coverage, Findings from the code, and Checks. The others are kept when they have content.
