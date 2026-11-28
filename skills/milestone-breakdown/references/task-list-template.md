# Task list template

The list does not depend on where tasks are stored. The first part is the plan for the milestone. Each task after it is self-contained, so it can be copied into an issue, a board card, a file or an OpenSpec change as it stands.

````markdown
# Tasks: <milestone name>

RFC: <link to the RFC file> · Milestone: <name> · Prepared: YYYY-MM-DD

**Milestone outcome:** <what works when the milestone is done, from the RFC>

**Produces:** <contracts> · **Consumes:** <contracts, and the milestone that produced each>

## Coverage

What the milestone must deliver, from the RFC, and which tasks deliver it.

| Must deliver | From the RFC | Tasks | Verified by |
|---|---|---|---|
| <short name> | <link to the section, decision or contract> | <task names> | <test, check or command> |
| <short name> (inferred) | <link> | deferred: <reason, and the key of the task or outline that will deliver it, or the accepted follow-up RFC that drops it or moves it to a milestone with no tasks or outlines yet> | |
| <contract name>: <part> | <link to the contract> | <the task that produces this part> | <contract test> |
| <open question the RFC assigns here> | <link> | <task name> | <the check, and who runs it when an agent cannot> |

Tasks that deliver no entry: none, or <enabling task name> enables <entry names>.

## Findings from the code

- **Commands:** build `<…>` · tests `<…>` · lint and types `<…>`
- **Checks that fail here and pass in CI:** none, or <test names, the CI run, the likely cause>
- **How a task is started:** <the repo's process: the branch rule, the command or skill that opens a change, the reviews required. From <path>, or the person's answer>
- **How a release is triggered:** <for example a manual workflow, or every merge to the main branch>
- **Named lists:** <for each "all", "every" or "each" in the RFC: the phrase → the items, with paths>
- **Entry points and modules:** <paths>
- **Areas:** <the components, modules or repositories the milestone touches, named as in the RFC's "What changes" table>
- **Hotspot files:** <paths, and which tasks touch each>
- **Examples to copy:** <kind of thing> → <path>
- **Differs from the RFC:** none, or <what, with paths>

## Assumptions

| Name | Default | Why it is safe | Used by |
|---|---|---|---|
| <short name> | <the default> | <reason, and how to revisit> | <task names> |

## Questions and answers

None, or for each open question: the question, the possible readings, the recommendation, and the tasks that wait for the answer. For each answered one: the question, the answer, who gave it and when, and the tasks it shaped. For one the person deferred: who deferred it and when, and the tasks written on the recommended reading, which carry it under "Ready to start when".

## Contracts between tasks

None, or for each seam found during the breakdown: name, shape, the task that produces it, the tasks that consume it. Names that tasks share (a spec capability, a package, a config section) are listed here too, with the task that creates each.

For a contract that several tasks build:

| Contract | Part | Produced by | Complete shape checked by |
|---|---|---|---|
| <name> | <operation, fields or error case> | <task name> | <task name, normally the closing task> |

## Order

| # | Task | Key | Phase | Area | Depends on | Can run in parallel with | Size |
|---|---|---|---|---|---|---|---|
| 1 | <task name> | <key> | Spike / Refactor / Foundation / Feature / Migration / Hardening | <area> | none | none | ~lines, ~files |
| 2 | <task name> | | | | <task names> | <task names> | |

The number is only the order. Refer to tasks by name.

Add a Mermaid dependency graph when there are more than five tasks.

## Checks

Dependencies

- Start conditions met, or carried by the tasks they block: yes / no, with detail
- Nothing is consumed before it is produced: yes / no
- Every task that consumes something produced in this list depends on its producer, directly or through another task, and every stated dependency is a real one: yes / no
- Every task depends only on merged work, or is stacked because the person asked for it: yes / no
- Each part of a contract has one producer, and one task checks the complete shape of every contract built over several tasks: yes / no
- No cycles: yes / no
- Tasks marked parallel do not depend on each other, share no open decision, and do not write to the same files, hotspot, migration sequence or local resource: yes / no
- Frozen contracts untouched: yes / no
- Later milestones still get what they consume: yes / no
- Dependencies the RFC does not mention: none / list

Coverage

- Every coverage entry has a task or a stated deferral, and every deferral names what picks the entry up: yes / no
- No assumption stands in for part of an RFC contract's shape: yes / no
- Every "all", "every" and "each" from the RFC is a named list, and every item is in a task: yes / no / none in the RFC text
- The task count against the RFC's estimate: <count> against <estimate>, within the overrun setting / over it, and the person chose <keep / split>
- Every task delivers an entry or enables one: yes / no

Tasks

- No open question blocks a written task, apart from questions the person deferred, and every assumption used is cited: yes / no
- Every behavior task can be shown working on its own, and every enabling task says what it enables: yes / no
- Every task can be verified alone: yes / no
- Every task has one behavior and criteria within the setting, and none is too small: yes / no
- <Only when the repository sets a size limit:> Every task fits it or states its exception: yes / no
- Migrations ordered and split where data is live, and unfinished visible work guarded: yes / no / not applicable
- Starts with an end-to-end path and ends with a closing task: yes / no / not applicable
- No line numbers or step-by-step implementation in any task: yes / no

Independent review: done by a separate session (<model the person chose>), <number> rounds, with findings settled / the last round left findings whose fixes are not reviewed: <list>, and the person chose <one more round / to accept the self-check> / not available, self-check only

## Findings that need a follow-up RFC

None, or: what was found, which decision or contract it affects, and the proposed change.

## Changes to the plan

Empty at first. After each reconcile: date, what changed, why, and what caused it: the merged task, the spike, a task's reconcile report or a failed attempt. When the milestone is closed: the closing entry, with the date and what was carried forward.

---

<!-- task: <rfc-slug>/<milestone-slug>/<number> -->

## <Task name>

**Phase:** Spike / Refactor / Foundation / Feature / Migration / Hardening · **Area:** <one component, module or repository> · **Size:** <rough lines and files, for the reviewer>

**Outcome:** <one behavior, in one sentence. What can be shown working after this merges.>

**Why now:** <what this unblocks, or which risk it tests>

**Delivers:** <coverage entry names, each linked to the RFC. For an enabling task: what it enables.>

**In scope:** <what this task changes, named by behavior, spec and component, not by file list>

**Out of scope:**
- <neighboring behavior, and the task that owns it>
- <what must not change>
- No new dependencies without asking.

**Produces:** <contracts or data, or none> · **Consumes:** <contracts or data, or none. Something this task produces and uses itself is listed under Produces only.>

**Contracts between tasks:** <for each one this task produces or consumes: its name and its shape, copied from the plan, because the implementing session does not see the plan. Or none.>

**Depends on:** <task names with their keys, or none. None only when everything the task needs already exists. If this task is stacked on another, say so.>

**Ready to start when:** <conditions that must hold first: a sign-off the RFC asks for, a question the person deferred, the RFC being on the default branch when the task was written before that merge. Or "no conditions">

**Assumptions in force:** <each assumption's name and its default, or none. If the code contradicts one, report it and do not change course on your own.>

**Starting points** (not the full list of files that may change):
- <spec that describes the behavior, such as an OpenSpec spec>: <which requirement applies>
- <contract or schema>: <why>
- <entry point>: <where the change starts>
- <example to copy>: <what to follow in it>

**Acceptance criteria:**
- Given <…>, when <…>, then <…>. Proved by: <test name or command>
- <…>. Proved by: <…>
- The standard checks pass: `<commands>`. The main branch still builds and can be released. <Only when the plan lists checks that fail here and pass in CI: the names of those tests, the passing CI run, and "these fail outside CI for <cause>: do not fix or change them, the CI run of the pull request is the proof".>

**Guard:** <the flag or unused path that hides this until the milestone is complete, or "not needed">

**Open choices:** <choices the RFC leaves to implementation that this task must make. Internal structure and local names are always yours.>

### Start

Do these in order, before any design work, brainstorming or code, and before a change or branch is opened for this task.

1. **Reconcile this task with the code.** Read the whole task. Confirm that every task under "Depends on" is done, and read what it reported: a merged pull request, or for a spike its recorded findings. The one exception is a task this one is stacked on, as "Depends on" says: it need not have merged, its branch is your base, and you read its work there. Confirm that every condition under "Ready to start when" holds. If you cannot tell, ask the person. Then read the code this task touches, as it is on the main branch now. If this task is stacked on another, also read what that task's branch adds on top of the main branch. Find the real place in the code of everything this task refers to: an earlier task's work, each contract between tasks, each starting point. Check every assumption in force against what is there.
2. **Sort what differs.** A fact you can fill in (a path, a name, where a contract landed) goes into the change or pull request description, and you go on. If the scope, an acceptance criterion, a dependency, a contract or an assumption would have to change, or a dependency other than the one this task is stacked on is not done, or a condition under "Ready to start when" does not hold or is not confirmed, stop and report to the person. Do not start.
3. **Start by the repo's process:** <how a task is started here, from the plan: the branch rule, the command or skill that opens a change with this task as its input, the reviews required>

### Design constraints

- **RFC:** <link> · **Milestone:** <name>
- **Task:** <link to this task where it is tracked, added once it has one>
- **Decisions this task implements:** <decision names, each linked to the RFC>
- **Contracts:** <name (frozen or provisional), produced or consumed, each linked>
- **Conditions:** <conditions from the RFC's decision outcome or decisions that apply to implementing or releasing this task, or none>
- **Rule:** Follow the frozen contracts and agreed decisions as written. If one turns out wrong, stop and propose a follow-up RFC. Do not diverge in this change's own design.

### If it does not fit

Stop when a frozen contract or agreed decision would have to change, when a provisional contract would have to change in a way the RFC does not allow, when behavior the RFC does not describe is needed, or when the criteria cannot be proved inside this pull request.

<Only when the repository sets a size setting:> Also stop when the work goes well past the size above (<the repository's Task overrun, about 1.5 times by default>).

Then do one of two things. If a coherent part passes the checks, ship that part, mark the unmet criteria "not done" with the reason, and propose how to split the rest. If nothing coherent passes, leave the branch clean and report what you tried and found.

Never drop a criterion silently, change or delete existing tests to make them pass, add scope, or put in a placeholder to get past a gap.

### The pull request reports

- Each acceptance criterion with its evidence.
- The contracts and areas of the code actually changed.
- Anything that differs from this task, and assumptions that proved wrong.
- The actual size against the estimate, when they differ a lot.
- Effects on later tasks.
- Work discovered on the way that was not needed to finish, as a proposed new task.

## <Next task name>

…
````

## Notes on the fields

- **Coverage** is filled before any task is written and checked after. An entry is named, not numbered.
- **The key** is the comment line above the task's heading. It is given once and never changes. A tracker uses it to recognize the task after its name or order has changed, so copy it along with the task.
- **Phase** tells the reviewer what to expect. A Spike produces findings. A Refactor prepares the code with no behavior change. A Foundation task creates something stable that others consume: a contract, scaffolding or a missing check. A Feature shows a behavior working. A Migration moves callers or data from the old form to the new. A Hardening task is the closing task: it proves the whole flow and removes temporary code. Refactor, Foundation and Migration tasks are usually enabling tasks and say what they enable.
- **Area** is one value per task, taken from the areas listed in the plan, so that a board can group by it. It names the component whose behavior the task delivers, not every layer the task touches.
- **Links** anywhere in a task are paths from the repository root or full URLs, so they still resolve when the task is copied into an issue.
- **Size** is a rough signal for the reviewer. It is not a limit unless the repository sets a size setting. See [task-sizing.md](task-sizing.md).
- **Out of scope** is never empty. It is the main defense against a task growing.
- **Starting points** point at things that stay true: specs, contracts and entry points first, then one example to copy. Links deep into the code are fragile. A full file list goes stale after the first refactor, and line numbers go stale sooner.
- **Acceptance criteria** always include the line about the standard checks and the main branch. It is what makes each task safe to merge on its own. Where the repo's practice allows, the tests for the other criteria fail before the task and pass after.
- **Design constraints** is copied into the proposal of the OpenSpec change made from the task, or into the pull request description in a repo without OpenSpec. Its content does not change, apart from filling in the task link. Write its links as paths from the repository root or as full URLs, so they still resolve from the new place. If you use relative links, rewrite them for the destination and check them there.
- **Start** is the reconcile of one task, done by the session that implements it. Steps 1 and 2 are the same text in every task. Step 3 is filled from "How a task is started" in the plan, and names the repo's process, not only a tool the next session may not have. Conditions that must hold before the task may start stay under "Ready to start when".
- **If it does not fit** and **The pull request reports** are the same text in every task. Keep them in each task anyway, because the implementing session sees only its own task.
- A one-task milestone uses the same task format. Of the plan sections it always needs Coverage, Findings from the code, and Checks. The others are kept when they have content.
