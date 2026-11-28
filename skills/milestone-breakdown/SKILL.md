---
name: milestone-breakdown
description: Use when a milestone of an accepted feature RFC is next to be built and must be split into PR-sized tasks for coding agents, for example "break down milestone X" or "plan the tasks for the next milestone". Also use when a task of that milestone is about to start and must be reconciled with the merged code, when a task has merged, failed or reported spike findings and the remaining tasks need updating, or when the milestone's last task has merged and it must be checked and closed. Covers slicing, task size, gaps in the RFC, dependencies, the task descriptions and the checks. Not for splitting work that has no accepted RFC.
---

# Milestone breakdown

Split one milestone of an accepted feature RFC into tasks, check that the tasks fit together and fit the RFC, and keep the list true while the milestone is built.

One task is one fresh agent session, one pull request and, where the repo uses them, one OpenSpec change.

The skill has three modes. Pick the one the request calls for:

- **Break down** a milestone that is next (the main procedure below).
- **Reconcile** a task with the code as it is now. Every task is reconciled before any work on it starts. The remaining tasks are reconciled when a merge, a spike or a failed task affects them.
- **Close** the milestone after its last task has merged.

The last two are in [references/after-the-split.md](references/after-the-split.md).

## Principles

- **One milestone at a time, when it is next.** Tasks written early describe code that does not exist yet. The RFC's contracts keep the milestones consistent in the meantime. No task of a milestone is written while a milestone it depends on is still open.
- **The RFC is the authority** for decisions, contracts and scope. The code as it is now is the authority for facts about the code. The task list overrides neither.
- **Plan here, build elsewhere.** This skill writes no production code. Implementation starts in a fresh session per task, after the person has approved the list.
- **Never fill a gap silently.** Every detail the RFC leaves out is left to the implementer on purpose, recorded as an assumption, asked as a question, or raised as a proposal for a follow-up RFC.
- **One behavior, one way to verify it.** Size tasks by behavior and by what the checks can verify inside one pull request, not by line count. Agents review the change, and the person accepts it on its report and evidence.
- **Names, not numbers.** Refer to tasks, contracts, decisions and assumptions by short names with links, so a task still makes sense after it is copied or reordered. Each task also has a key that never changes, so a tracker can recognize it after a rename.
- **Where tasks are stored is the person's call.** An issue tracker, a project board, files in the repo: the skill does not assume one. It produces the tasks as Markdown that can be copied anywhere, and reads them back from wherever the person keeps them.
- **English by default.** Write in another language only when the person explicitly asks.

## Settings

The values below are defaults. If `openspec/design/README.md` (or the README of the design folder the repo uses) has a "Settings" section, a table with the same setting names, its values win. The person can also override any of them in the request.

| Setting | Default |
|---|---|
| Task size, acceptance criteria | 2 to 5 |
| Tasks per milestone | up to about 15 |
| Milestone size overrun | about 2 times the RFC's estimate for the milestone |
| Independent review | from 6 tasks, or when the list marks any tasks as parallel |
| Independent review model | ask the person, once per session |
| Independent review rounds | at most 2 |
| How a task is started | the repo's own process, read in step 2. Ask the person only when the repo does not say |
| Tasks in flight | 2 to 3 per reviewer |
| Failed attempts before a task returns to planning | 2 |
| Share of remaining tasks needing edits that triggers a new breakdown | about a quarter |
| Inline spike budget | a handful of tool calls, at most about 20% of the session's context |
| Standalone spike budget | one separate session, 1 to 2 hours of run time, or the cost cap the person sets |
| Document language | English |

The size estimate, and any size limit the repository sets, counts code and configuration, tests included. Documents, generated files and process files (an OpenSpec change's own files, task notes, changelogs) are not counted.

There is no line or file limit by default. A repository that wants one adds "Task size, lines of code" or "Task size, files" to its Settings table, and optionally "Task overrun" (default about 1.5 times the task's estimate). Then the rules in [references/task-sizing.md](references/task-sizing.md#when-the-repository-sets-a-size-limit) apply.

## Before you start

- The RFC's status must be Accepted. If it is still in review, do not stop at saying so. List what is still open (decisions not agreed, blocking open questions, pending spikes, changes the person has not seen) and ask whether they accept the RFC now. A request to break it down is not an acceptance. On an explicit yes, the acceptance is recorded and the RFC is archived as `feature-rfc` step 8 describes, before any task is written. An accepted RFC sits in the design archive and is never edited, by this skill or by a task.
- The accepted RFC is on the default branch, at its archived path, because tasks link to it there. If it is only on a branch, tell the person: tasks can be written, but nothing is published and no task starts until it is merged. Every task written before the merge carries it under "Ready to start when": "the RFC is on the default branch at <path>". The same holds for an accepted follow-up RFC that a task relies on.
- Read the whole RFC, every follow-up RFC its header links as "Partly superseded by", and the decision records (`adr-*.md`) in its folder. The RFC is frozen at acceptance, so a later change is only in a follow-up RFC. Where the two disagree, the follow-up wins. If the status is "Superseded by", the RFC is no longer the design: tell the person and use the one it links.
- Check the start conditions: every milestone listed under this milestone's "Depends on" is done, even one that produces no contract, and every condition attached to the acceptance or to a decision that applies here is met. A milestone is done when its plan has a closing entry, and, when it is published in a tracker, its plan item is closed as completed there too. A closed tracker milestone or a merged last task alone is not enough. If one is not done, stop and tell the person: this milestone is not broken down yet. If a condition is not met, tell the person before splitting.
- Check what the milestone consumes. Every contract it consumes from another milestone must already be produced by that milestone and landed in the code. A contract this milestone produces and also uses itself does not count here. If one is missing, stop and tell the person.
- If the RFC has no Contracts section, milestone table or "Left to implementation" list, tell the person what is missing before splitting.

## Procedure

### 1. List what the milestone must deliver

Before proposing any task, write the coverage list from the RFC text:

- the milestone's outcome;
- each behavior it must deliver;
- each contract it produces or consumes;
- each RFC decision and condition that applies;
- each open question or unchecked assumption the RFC assigns to this milestone, with how it is checked and by whom;
- each requirement on quality that applies, such as performance, security or compatibility.

Give every entry a short name and a link to the place in the RFC it comes from. Mark anything you inferred as inferred. This list is what the coverage check in step 7 runs against.

Two rules keep an entry from hiding work:

- **A contract this milestone produces is listed by its parts:** one entry per operation, group of fields or error case that could land in a different task. "The contract" as a single entry lets a partial delivery pass as delivered.
- **Mark every "all", "every" and "each"** in the RFC text behind an entry ("all tools", "every write"). Step 2 turns each into a named list.

### 2. Read the code

Read the parts of the repository the milestone touches, as they are now, not as the RFC described them. Record as findings, each with a file path:

- the modules and entry points involved;
- the exact commands for build, tests, lint and type checks, and where the tests live;
- the conventions in use that the tasks must follow;
- the **areas** the milestone touches: the components, modules or repositories, named as the RFC's "What changes" table names them. Each task is assigned one;
- **hotspot files** that many changes must touch: routers, registries, dependency wiring, index exports, shared config, numbered migrations;
- **one existing example to copy** for each kind of thing the milestone adds (an endpoint, a worker, a migration, a screen). If there is none, the first task that adds one becomes the example and goes early;
- **a named list for every "all", "every" and "each"** marked in step 1, taken from the code, each item with its path. The coverage list then holds the items, not the phrase. If the RFC's wording may not have meant an item, ask;
- **how a task is started here:** the repo's process for a change, from its agent instructions and contribution docs: the branch rule, the command or skill that opens a change (for example an OpenSpec change), the reviews it requires. It goes into every task's "Start" section. If the repo does not say, ask the person once;
- **how a release or deploy is triggered,** and whether a merge to the main branch ships anything. Every guard depends on it, and so does any RFC decision that relies on nothing shipping in between;
- anything that contradicts the RFC.

Confirm that the main branch builds and passes its checks, and that the commands run. If you cannot run them here, say so and ask the person to confirm. If the checks that exist could not prove a task done, say so. The first task may have to add the missing check.

If a check fails here and passes in the repo's CI on the same commit, that is a finding about this environment, not a reason to stop. Record the failing tests by name, the passing CI run and the likely cause, tell the person, and repeat the finding in every task whose standard checks include that command, so an implementing agent neither chases those failures nor "fixes" the tests. Stop when CI fails too, or when a failure is in the code the milestone touches.

Keep the findings short. They are facts the tasks need, not a summary of the codebase.

### 3. Handle gaps and decisions

For every missing detail that matters to the split, choose one of four actions. The full rules are in [references/gaps-and-decisions.md](references/gaps-and-decisions.md).

| The gap | Action |
|---|---|
| Local, reversible, best decided with the code open | Leave it to the implementing agent, as an open choice in the task |
| A safe, reversible default that no behavior visible in the RFC depends on | Record a named assumption. Tasks that rely on it cite it |
| The answer changes the task list, a contract, the data model, security or visible behavior | Ask a blocking question as soon as you find it, with the readings and your recommendation. Do not write the tasks that depend on it until it is answered |
| The RFC is wrong or cannot work given the code, or the choice would change scope | Stop that part of the milestone and propose a follow-up RFC |

Then check for a design gap. If two or more tasks must agree on something the RFC does not define precisely, write it down as a milestone-level contract before writing either task, with one producing task, or one per part when several tasks build it. The same goes for a name that two tasks would each have to pick, such as a spec capability, a package or a config section: fix it in the plan. If the task list depends on a question only an experiment can answer, the first task is a spike and the tasks that depend on it are written after it reports.

Collect the questions and ask them together where you can. Keep working on the tasks that do not depend on the answers. Tasks written after an answer go through the checks in step 7 like the others.

**A question the person defers.** Only the person can leave a blocking question open. When they do, the task that waits on it may be written on the recommended reading. It names the question under "Ready to start when", the plan keeps the readings, and the task is not started until the answer is in. A different answer sends the task back through the checks. Never choose this yourself to avoid asking.

A gap in an RFC decision or a frozen contract is never settled here. It needs a follow-up RFC (see "When the split contradicts the RFC").

### 4. Decide whether to split at all

If the whole milestone has one outcome and fits the acceptance criteria setting, and any size limit the repository sets, it is one task. Write that one task description, run the checks that apply, and skip the rest of the slicing.

### 5. Slice and order

**Slice vertically.** Each task cuts through every layer it needs (data, logic, interface, tests) to deliver one behavior. Test every task with one question: *what can be shown working or checked right after this pull request merges?* If the answer is "nothing until later tasks land", reshape it. Do not split by layer ("the schema", "the API", "the UI").

**Enabling tasks are the exception, and they say so.** A task with no behavior of its own is fine when it creates something stable that other tasks consume: a contract, an agreed migration step, scaffolding every slice needs, a preparatory refactor, a missing check. Mark it as enabling and name what it enables. Where possible, a new interface arrives together with its first use.

**Order by learning and by dependency:**

1. A spike, if step 3 called for one.
2. Preparatory refactoring that makes the change simple, as its own task with no behavior change. Small cleanup met along the way stays in the task that meets it.
3. The thinnest end-to-end path through everything the milestone touches, with real build, test and deploy wiring. For a new system this may take a few tasks. It is never one large foundation pull request.
4. Tasks that produce a contract before the tasks that consume it. The producing task lands the contract in code, with contract tests where practical.
5. The remaining slices, with what can run in parallel marked.
6. A closing task that proves what no single task could (the whole flow, compatibility, a rollout rehearsal) and removes temporary flags and scaffolding. Each task still wires in its own behavior. The closing task never finishes feature work the slices left undone.

**Wide changes go expand, migrate, contract.** A rename, a changed shared signature or a change to live data becomes: one task that adds the new form next to the old; one or more tasks that move callers or data over, each leaving the checks passing, each listing exactly what it covers and each with a check that nothing old remains in its area; one task that removes the old form, blocked by all the others. The moving tasks may run in parallel when they cover separate areas.

**Every task leaves the main branch working.** It can be merged, tested and released without the later ones. Work that users would see before the milestone is complete ships behind the guard the RFC or the repo already uses, and the task names the guard.

**Size each task** by behavior and criteria. The signs of a task that is too big or too small, how to count mechanical changes, and the cases where "one task, one pull request, one session" does not fit are in [references/task-sizing.md](references/task-sizing.md). A task that is too small is as much a defect as one that is too big: each task costs a review.

**Stack only on request.** Do not ask whether to stack pull requests. Stack them only when the person asks for it. A behavior that cannot be split into parts that can each be verified alone stays one task. When the repository sets a size limit, that task states the size exception (see [references/task-sizing.md](references/task-sizing.md#when-the-repository-sets-a-size-limit)).

If the split lands above the tasks-per-milestone setting or the milestone size overrun setting, stop and give the person two options. First look for a point inside the list where something shippable works and the main branch could be released, because that is where a milestone would split.

- **Keep it as one milestone.** The plan records the count against the estimate, and the person's reason.
- **Split it.** That changes the RFC's milestones, so it is a proposal for a follow-up RFC.

Do not pick for them, and do not merge tasks to get under the number.

### 6. Describe each task

Use the format in [references/task-list-template.md](references/task-list-template.md). A task must be enough for a fresh session that has only the task and the repository.

Write what must be true when the task is done and where to look. Do not write how.

- **Under-specified** means the agent must guess the scope boundary, a shared contract, what "done" means, or which existing pattern to follow.
- **Over-specified** means the task dictates function bodies, local names, step-by-step edits or line numbers. These go wrong as soon as the code differs from what you pictured.

Points the template depends on:

- **Key** is `<rfc-slug>/<milestone-slug>/<number>`, with the next unused number in the milestone when the task is first written. It is never reused and does not change when the task is renamed, reordered or copied to a tracker.
- **Phase** says what kind of work the task is: Spike, Refactor, Foundation, Feature, Migration or Hardening. A Feature is a vertical slice of behavior. Refactor (preparation with no behavior change), Foundation (a contract, scaffolding or a missing check that others consume) and Migration (moving callers or data) are usually enabling tasks. Hardening is the closing task. Phase is a label for the board. Which checks apply depends on what the task delivers: a task with behavior of its own must pass the "what can be shown working" test whatever its Phase.
- **Area** is the one component, module or repository the task mainly changes, from the areas found in step 2. A vertical slice touches several layers and still has one Area: the component whose behavior it delivers.

- **Out of scope** is its own field in every task: neighboring behavior that belongs to another task (named), things that must not change, no new dependencies without asking.
- **Acceptance criteria** are observable from outside, and each names the test or command that proves it. They describe behavior that is not true before the task. If the RFC already gives a checkable criterion, link it. A criterion that only a person or a real environment can prove (a live account, production data) names who runs the check and what they record. It stays a criterion: the task does not close on "not checked".
- **Start** is the first thing the implementing session does, and it is the reconcile of this one task: read the code the task touches, as merged, before any design work or brainstorming. Its first two steps are the same text in every task. The third is how a task is started in this repo, from step 2.
- **Starting points** are references that stay true: the specs that describe the behavior (the OpenSpec specs, where the repo has them), the contracts, the entry points, and the example to copy. Links into the code go stale quickly, so keep them to entry points and the example, and do not list the files to change. Say they are starting points, not the list of files allowed to change. No line numbers.
- **Design constraints** carries the RFC into the implementation. It links the RFC and the milestone, names the decisions and contracts the task implements or uses (with each contract's stability), lists the conditions that apply, and repeats the stop rule. Generate it from the RFC. Do not retype decisions from memory.
- **If it does not fit** tells the implementing agent when to stop and what to hand back.
- **The pull request reports** what was learned, which is the input for reconciling the remaining tasks.

Leave local choices open. If the RFC lists something under "Left to implementation", the task says the choice is open and does not make it.

When a task becomes an OpenSpec change, copy the Design constraints block into the change's proposal. In a repo without OpenSpec it goes into the pull request description. Change nothing in its content, apart from filling in the task link.

### 7. Check the list

Run every check before showing the list, and report the result. The template has the same list as a form.

**Dependencies**

- **Nothing is consumed before it is produced.** For every contract or piece of data a task consumes, an earlier task or an earlier milestone produces it. A task that produces a contract and uses it in the same change lists it under Produces only, so an interface can arrive together with its first use.
- **Dependencies are stated, not implied by the order.** A task that consumes something another task in this list produces depends on that task, directly or through another task. A dependency exists only where there is a real one. "Depends on: none" is right only when everything the task needs already exists in the code.
- **A task depends only on merged work.** If it needs a sibling's unmerged code, it comes after that sibling, or the two are stacked because the person asked for it (see [references/task-sizing.md](references/task-sizing.md)).
- **Each part of a contract has one producer.** This includes the milestone-level contracts from step 3. A contract may be built over several tasks, each adding a named part. Then the plan lists the parts with their tasks, a consumer depends on the task that produces the part it uses, and one task, normally the closing one, checks the complete shape against the RFC. What a later milestone consumes is complete only with that task.
- **The order is a real order.** No cycles.
- **Parallel tasks are safe.** Tasks marked parallel meet the three conditions in [references/task-sizing.md](references/task-sizing.md). If two tasks must touch the same hotspot, add a dependency or move the shared edit into one task.
- **Frozen contracts are untouched.**
- **Later milestones still work.** Whatever they consume from this one is produced by some task here, in the shape the RFC states.
- **Nothing is hidden.** A dependency on another team, service or decision that the RFC does not mention is a finding.
- **Start conditions are met or carried** by the tasks they block.

**Coverage, both ways**

- Every entry on the coverage list is delivered by at least one task, or is deferred with a reason. Deferring something the RFC places in this milestone changes the RFC's plan: it needs the person's agreement, and a follow-up RFC when the entry moves to another milestone or is dropped. A deferral names what picks the entry up: the key of the task or outline that will deliver it, or the accepted follow-up RFC that drops it. "Later" is not a place. When an accepted follow-up RFC moves the entry to a milestone that has no tasks or outlines yet, that RFC is the record, because the milestone's breakdown starts from it. When the milestone has them, the entry names the receiving key.
- An assumption never stands in for part of an RFC contract's shape. The milestone the RFC names produces the whole shape, even when the data behind a field arrives later.
- Every "all", "every" and "each" from the RFC is a named list in the coverage table, and every item on it is in a task.
- Every task delivers at least one entry, or is an enabling task for one. A task that traces to nothing is scope the RFC did not ask for. Remove it, or turn it into a proposal for a follow-up RFC.

**Tasks**

- No blocking question is open for a task that was written, and every assumption used is cited. The one exception is a question the person deferred, which the task carries under "Ready to start when".
- Every behavior task passes the "what can be shown working" test, and every enabling task says what it enables.
- Every task can be verified alone: its criteria pass without later tasks.
- Every task has one behavior and criteria within the setting, and none is too small. When the repository sets a size limit, every task fits it or states its exception.
- Migrations are ordered, and split where data is live. Unfinished visible work is guarded.
- The milestone starts with an end-to-end path and ends with the closing task, where they apply.
- No task contains line numbers or step-by-step implementation.

**Independent review.** When the list reaches the independent review setting and your tool can run a separate read-only session, have a reviewer that has not seen this conversation check the list against the RFC and the checks above. Before starting it, unless the independent review model setting names one, ask the person which model the reviewer should use, and name the options your tool offers. Use their answer for the rest of the session without asking again. Tell the reviewer to report only what affects correctness, coverage or parallel safety. Fix and re-check, up to the review rounds setting. If the last allowed round still reported findings, the fixes for them have had no review: say so in the Checks, list those findings, and ask the person whether to run one more round or accept your own check of the fixes. If no such review is possible, say that the checks are a self-check only.

### 8. Review the list with the person

Show the list and lead with what is expensive to get wrong:

- the coverage table;
- open questions and the list of assumptions;
- contracts between tasks, and the risky tasks (migrations, security, rollout);
- what you claim can run in parallel;
- anything outside the settings, any stacked pull requests, and where the count differs from the RFC's estimate.

Adjust until they agree, and run the affected checks again after each change. They decide the final split, including merging or splitting tasks. How many tasks run at once is also their call. The tasks-in-flight setting is a starting point, because unreviewed pull requests pile up faster than agents run out of work.

Nothing is created in a tracker before the person approves.

### 9. Hand over

- Deliver the agreed list in the place and form the person asks for. If they name none, show it in your reply and ask where they keep tasks. Do not pick a place for them. Creating items in a tracker is their call and uses their tools. When the `task-publishing` skill is available, it is the way to put the tasks on a GitHub Project: write the plan to `00-plan.md` and each task to its own file in one folder for the milestone, and hand that folder over.
- Whatever the place, the coverage list, the assumptions and answers, and the tasks must stay readable later, because reconciling and closing start from them.
- Tell the person what keeps the list true. Every task starts with its own reconcile, which is its "Start" section. They come back when a pull request reports effects on later tasks, a spike reports or a task fails, and after the last merge so the milestone can be closed. All of it is in [references/after-the-split.md](references/after-the-split.md).
- Do not start implementing in the same step unless asked.

## When the breakdown is part of a whole RFC

The `rfc-breakdown` skill runs this skill once per milestone, often in a session that cannot reach the person. When the request says so:

- run through the checks in step 7 and stop. Steps 8 and 9 are done once for all milestones by the session that started you;
- where this skill says to ask the person, do not ask and do not guess. Return the question with the possible readings and your recommendation, and leave unwritten the tasks that wait on it. The one exception is a question the request lists as deferred by the person, with the reading to use: that task is written as "A question the person defers" in step 3 says;
- use the Area values, the shared names, the key format and the way a task is started that you were given, and report any Area or shared name you needed that was not on the list;
- report the number of tasks against the RFC's estimate. When it passes the milestone size overrun setting, write the list as one milestone and return the two options as a question;
- report whether the list reached the independent review setting, and do not start the review yourself.

## When the split contradicts the RFC

This holds at every step and in every mode. If the work shows that an RFC decision or a frozen contract is wrong, or reveals a dependency between milestones that the RFC does not show, stop. Explain what you found and propose a follow-up RFC for the person to approve (the `feature-rfc` skill covers it). Do not work around it inside the task list.

A provisional contract may change, but only in the way the RFC says it may. Record the change as a follow-up RFC that the person approves.

## Rules that always hold

- Never invent facts about the code. Read it, and cite file paths for claims about the current state.
- Every task can be merged and verified on its own.
- Never tell an implementing agent to drop a criterion, weaken a test or add a placeholder to get past a problem.

## Output

- **Break down:** a task list for one milestone in the template's format, with the coverage table, the assumptions and open questions, the result of the checks, and any findings that need a follow-up RFC.
- **Reconcile:** for one task before it starts, the facts filled in, or what goes back to the person. For the remaining tasks, the updated tasks and a short note of what changed in the plan and why, or a new breakdown of the remaining work when a trigger fires.
- **Close:** the coverage list checked against the code, what is carried forward, and the closing entry in the plan that marks the milestone done.
