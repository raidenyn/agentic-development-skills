---
name: milestone-breakdown
description: Use when a milestone of an accepted feature RFC is next to be built and must be split into PR-sized tasks for coding agents, for example "break down milestone X" or "plan the tasks for the next milestone". Also use when a task of that milestone has merged, failed or reported spike findings and the remaining tasks need updating, or when the milestone's last task has merged and it must be checked and closed. Covers slicing, task size, gaps in the RFC, dependencies, the task descriptions and the checks. Not for splitting work that has no accepted RFC.
---

# Milestone breakdown

Split one milestone of an accepted feature RFC into tasks, check that the tasks fit together and fit the RFC, and keep the list true while the milestone is built.

One task is one fresh agent session, one pull request and, where the repo uses them, one OpenSpec change.

The skill has three modes. Pick the one the request calls for:

- **Break down** a milestone that is next (the main procedure below).
- **Reconcile** the remaining tasks after one has merged, a spike has reported, or a task has failed.
- **Close** the milestone after its last task has merged.

The last two are in [references/after-the-split.md](references/after-the-split.md).

## Principles

- **One milestone at a time, when it is next.** Tasks written early describe code that does not exist yet. The RFC's contracts keep the milestones consistent in the meantime. When several people need work at once, the first one or two independent tasks of the following milestone may be prepared early. Nothing more.
- **The RFC is the authority** for decisions, contracts and scope. The code as it is now is the authority for facts about the code. The task list overrides neither.
- **Plan here, build elsewhere.** This skill writes no production code. Implementation starts in a fresh session per task, after the person has approved the list.
- **Never fill a gap silently.** Every detail the RFC leaves out is left to the implementer on purpose, recorded as an assumption, asked as a question, or raised as an amendment.
- **Review is the limit, not generation.** Size tasks by what can be reviewed well, by people with agents helping, and by what the checks can verify inside one pull request.
- **Names, not numbers.** Refer to tasks, contracts, decisions and assumptions by short names with links, so a task still makes sense after it is copied or reordered.
- **Where tasks are stored is the person's call.** An issue tracker, a project board, files in the repo: the skill does not assume one. It produces the tasks as Markdown that can be copied anywhere, and reads them back from wherever the person keeps them.
- **English by default.** Write in another language only when the person explicitly asks.

## Settings

The values below are defaults. If `openspec/design/README.md` (or the README of the design folder the repo uses) has a "Settings" section, a table with the same setting names, its values win. The person can also override any of them in the request.

| Setting | Default |
|---|---|
| Task size, lines of code | up to about 1,000 changed lines |
| Task size, files | up to 30 changed code and config files |
| Task size, acceptance criteria | 2 to 5 |
| Task overrun | stop at about 1.5 times the task's estimate |
| Tasks per milestone | up to about 15 |
| Independent review | from 6 tasks, or when the list marks any tasks as parallel |
| Independent review model | ask the person, once per session |
| Independent review rounds | at most 2 |
| Stacked pull requests | ask the person, once per milestone |
| Tasks in flight | 2 to 3 per reviewer |
| Failed attempts before a task returns to planning | 2 |
| Share of remaining tasks needing edits that triggers a new breakdown | about a quarter |
| Inline spike budget | a handful of tool calls, at most about 20% of the session's context |
| Standalone spike budget | one separate session, 1 to 2 hours of run time, or the cost cap the person sets |
| Document language | English |

Task size counts code and configuration, tests included. Documents, generated files and process files (an OpenSpec change's own files, task notes, changelogs) are not counted.

## Before you start

- The RFC's status must be Accepted. If it is still in review, finish the review first (the `feature-rfc` skill covers it).
- Read the whole RFC, its amendments, and any decision records in the same folder.
- Check the start conditions: every milestone listed under this milestone's "Depends on" is done, even one that produces no contract, and every condition attached to the acceptance or to a decision that applies here is met. If one is not, tell the person before splitting.
- Check what the milestone consumes. Every contract it consumes from another milestone must already be produced by that milestone and landed in the code. A contract this milestone produces and also uses itself does not count here. If one is missing, stop and tell the person.
- Tasks prepared early for the following milestone may be written before the two checks above pass. Prepare only tasks that need nothing unmerged, write every condition that is not yet met into the task's "Ready to start when", and check the tasks again when their milestone becomes next. An early task may be started only when its own conditions are met.
- If the RFC has no Contracts section, milestone table or "Left to implementation" list, tell the person what is missing before splitting.

## Procedure

### 1. List what the milestone must deliver

Before proposing any task, write the coverage list from the RFC text:

- the milestone's outcome;
- each behavior it must deliver;
- each contract it produces or consumes;
- each RFC decision and condition that applies;
- each requirement on quality that applies, such as performance, security or compatibility.

Give every entry a short name and a link to the place in the RFC it comes from. Mark anything you inferred as inferred. This list is what the coverage check in step 7 runs against.

### 2. Read the code

Read the parts of the repository the milestone touches, as they are now, not as the RFC described them. Record as findings, each with a file path:

- the modules and entry points involved;
- the exact commands for build, tests, lint and type checks, and where the tests live;
- the conventions in use that the tasks must follow;
- **hotspot files** that many changes must touch: routers, registries, dependency wiring, index exports, shared config, numbered migrations;
- **one existing example to copy** for each kind of thing the milestone adds (an endpoint, a worker, a migration, a screen). If there is none, the first task that adds one becomes the example and goes early;
- anything that contradicts the RFC.

Confirm that the main branch builds and passes its checks, and that the commands run. If you cannot run them here, say so and ask the person to confirm. If the checks that exist could not prove a task done, say so. The first task may have to add the missing check.

Keep the findings short. They are facts the tasks need, not a summary of the codebase.

### 3. Handle gaps and decisions

For every missing detail that matters to the split, choose one of four actions. The full rules are in [references/gaps-and-decisions.md](references/gaps-and-decisions.md).

| The gap | Action |
|---|---|
| Local, reversible, best decided with the code open | Leave it to the implementing agent, as an open choice in the task |
| A safe, reversible default that no behavior visible in the RFC depends on | Record a named assumption. Tasks that rely on it cite it |
| The answer changes the task list, a contract, the data model, security or visible behavior | Ask a blocking question as soon as you find it, with the readings and your recommendation. Do not write the tasks that depend on it until it is answered |
| The RFC is wrong or cannot work given the code, or the choice would change scope | Stop that part of the milestone and propose an RFC amendment |

Then check for a design gap. If two or more tasks must agree on something the RFC does not define precisely, write it down as a milestone-level contract with one producing task before writing either task. If the task list depends on a question only an experiment can answer, the first task is a spike and the tasks that depend on it are written after it reports.

Collect the questions and ask them together where you can. Keep working on the tasks that do not depend on the answers. Tasks written after an answer go through the checks in step 7 like the others.

A gap in an RFC decision or a frozen contract is never settled here. It is an amendment (see "When the split contradicts the RFC").

### 4. Decide whether to split at all

If the whole milestone has one outcome and fits the task size settings, it is one task. Write that one task description, run the checks that apply, and skip the rest of the slicing.

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

**Size each task** against the settings. The signs of a task that is too big or too small, how to count mechanical changes, and the cases where "one task, one pull request, one session" does not fit are in [references/task-sizing.md](references/task-sizing.md). A task that is too small is as much a defect as one that is too big: each task costs a review.

**Ask before stacking.** When a behavior does not split cleanly below the size settings, there are two ways out: split it further into smaller tasks that can each still be verified alone, which usually costs extra scaffolding or narrower checks, or allow a short chain of stacked pull requests. Which is better depends mostly on how many reviewers the team has. Unless the stacked pull requests setting already answers it, ask the person which they want for this milestone, the first time the case comes up, and apply the answer to the rest of the milestone. Do not choose for them. Write the answer into the list, so a later session does not ask again. If no further split leaves every part verifiable alone and the person does not want a stack, keep one task and state the size exception.

If the split lands above the tasks-per-milestone setting, or far from the size the RFC estimated, tell the person. The milestone is probably two milestones, and that is an RFC change.

### 6. Describe each task

Use the format in [references/task-list-template.md](references/task-list-template.md). A task must be enough for a fresh session that has only the task and the repository.

Write what must be true when the task is done and where to look. Do not write how.

- **Under-specified** means the agent must guess the scope boundary, a shared contract, what "done" means, or which existing pattern to follow.
- **Over-specified** means the task dictates function bodies, local names, step-by-step edits or line numbers. These go wrong as soon as the code differs from what you pictured.

Points the template depends on:

- **Out of scope** is its own field in every task: neighboring behavior that belongs to another task (named), things that must not change, no new dependencies without asking.
- **Acceptance criteria** are observable from outside, and each names the test or command that proves it. They describe behavior that is not true before the task. If the RFC already gives a checkable criterion, link it.
- **Starting points** are references that stay true: the specs that describe the behavior (the OpenSpec specs, where the repo has them), the contracts, the entry points, and the example to copy. Links into the code go stale quickly, so keep them to entry points and the example, and do not list the files to change. Say they are starting points, not the list of files allowed to change. No line numbers.
- **Design constraints** carries the RFC into the implementation. It links the RFC and the milestone, names the decisions and contracts the task implements or uses (with each contract's stability), lists the conditions that apply, and repeats the stop rule. Generate it from the RFC. Do not retype decisions from memory.
- **If it does not fit** tells the implementing agent when to stop and what to hand back.
- **The pull request reports** what was learned, which is the input for reconciling the remaining tasks.

Leave local choices open. If the RFC lists something under "Left to implementation", the task says the choice is open and does not make it.

When a task becomes an OpenSpec change, copy the Design constraints block into the change's proposal. In a repo without OpenSpec it goes into the pull request description. Change nothing in its content, apart from filling in the task link.

### 7. Check the list

Run every check before showing the list, and report the result. The template has the same list as a form.

**Dependencies**

- **Nothing is consumed before it is produced.** For every contract or piece of data a task consumes, an earlier task or an earlier milestone produces it.
- **Dependencies are stated, not implied by the order.** A task that consumes something another task in this list produces depends on that task, directly or through another task. A dependency exists only where there is a real one. "Depends on: none" is right only when everything the task needs already exists in the code.
- **A task depends only on merged work.** If it needs a sibling's unmerged code, it comes after that sibling, or the two are stacked because the person allowed it for this milestone (see [references/task-sizing.md](references/task-sizing.md)).
- **Each contract has one producer.** This includes the milestone-level contracts from step 3.
- **The order is a real order.** No cycles.
- **Parallel tasks are safe.** Tasks marked parallel meet the three conditions in [references/task-sizing.md](references/task-sizing.md). If two tasks must touch the same hotspot, add a dependency or move the shared edit into one task.
- **Frozen contracts are untouched.**
- **Later milestones still work.** Whatever they consume from this one is produced by some task here, in the shape the RFC states.
- **Nothing is hidden.** A dependency on another team, service or decision that the RFC does not mention is a finding.
- **Start conditions are met or carried** by the tasks they block.

**Coverage, both ways**

- Every entry on the coverage list is delivered by at least one task, or is deferred with a reason. Deferring something the RFC places in this milestone changes the RFC's plan: it needs the person's agreement, and an RFC amendment when the entry moves to another milestone or is dropped.
- Every task delivers at least one entry, or is an enabling task for one. A task that traces to nothing is scope the RFC did not ask for. Remove it, or turn it into an amendment proposal.

**Tasks**

- No blocking question is open for a task that was written, and every assumption used is cited.
- Every behavior task passes the "what can be shown working" test, and every enabling task says what it enables.
- Every task can be verified alone: its criteria pass without later tasks.
- Every task fits the size settings or says why it is an exception, and none is too small.
- Migrations are ordered, and split where data is live. Unfinished visible work is guarded.
- The milestone starts with an end-to-end path and ends with the closing task, where they apply.
- No task contains line numbers or step-by-step implementation.

**Independent review.** When the list reaches the independent review setting and your tool can run a separate read-only session, have a reviewer that has not seen this conversation check the list against the RFC and the checks above. Before starting it, unless the independent review model setting names one, ask the person which model the reviewer should use, and name the options your tool offers. Use their answer for the rest of the session without asking again. Tell the reviewer to report only what affects correctness, coverage or parallel safety. Fix and re-check, up to the review rounds setting. If no such review is possible, say that the checks are a self-check only.

### 8. Review the list with the person

Show the list and lead with what is expensive to get wrong:

- the coverage table;
- open questions and the list of assumptions;
- contracts between tasks, and the risky tasks (migrations, security, rollout);
- what you claim can run in parallel;
- anything outside the size settings, any stacked pull requests, and where the count differs from the RFC's estimate.

Adjust until they agree, and run the affected checks again after each change. They decide the final split, including merging or splitting tasks. How many tasks run at once is also their call. The tasks-in-flight setting is a starting point, because unreviewed pull requests pile up faster than agents run out of work.

Nothing is created in a tracker before the person approves.

### 9. Hand over

- Deliver the agreed list in the place and form the person asks for. If they name none, show it in your reply and ask where they keep tasks. Do not pick a place for them. Creating items in a tracker is their call and uses their tools.
- Whatever the place, the coverage list, the assumptions and answers, and the tasks must stay readable later, because reconciling and closing start from them.
- Tell the person to come back after each merge so the remaining tasks can be reconciled, and after the last one so the milestone can be closed. Both are in [references/after-the-split.md](references/after-the-split.md).
- Do not start implementing in the same step unless asked.

## When the split contradicts the RFC

This holds at every step and in every mode. If the work shows that an RFC decision or a frozen contract is wrong, or reveals a dependency between milestones that the RFC does not show, stop. Explain what you found and propose an RFC amendment for the person to approve (the `feature-rfc` skill covers amendments). Do not work around it inside the task list.

A provisional contract may change, but only in the way the RFC says it may. Record the change as an RFC amendment that the person approves.

## Rules that always hold

- Never invent facts about the code. Read it, and cite file paths for claims about the current state.
- Every task can be merged and verified on its own.
- Never tell an implementing agent to drop a criterion, weaken a test or add a placeholder to get past a problem.

## Output

- **Break down:** a task list for one milestone in the template's format, with the coverage table, the assumptions and open questions, the result of the checks, and any findings that need an RFC amendment.
- **Reconcile:** the updated remaining tasks and a short note of what changed in the plan and why, or a new breakdown of the remaining work when a trigger fires.
- **Close:** the coverage list checked against the code, what is carried forward, and the milestone marked done in the RFC.
