---
name: rfc-breakdown
description: Use when an accepted feature RFC must be turned into a backlog for all of its milestones at once, for example "break down the RFC into tasks", "create the tasks for this RFC" or "plan the whole RFC". Also use when a later milestone of an RFC that was broken down this way becomes next and its outline tasks must be replaced by real ones. Covers which milestones can be split now, running the milestone breakdowns in parallel, outline tasks for the milestones that cannot be split yet, and the consistency check across milestones. Not for splitting a single milestone and not for writing the RFC.
---

# RFC breakdown

Turn an accepted feature RFC into a backlog that covers every milestone: full tasks for the milestones that can be built now, outline tasks for the rest, and blockers between them that hold across milestones.

This skill decides what is broken down and when, and checks the result as a whole. It does not slice. Slicing one milestone is the `milestone-breakdown` skill, used here as it is. Putting the tasks in a tracker is the `task-publishing` skill. If either is not installed, say so before starting.

The skill has two modes:

- **Break down** an RFC for the first time (the main procedure below).
- **Continue** when a later milestone becomes next. See [Continue](#continue).

## Principles

- **Two depths.** A milestone is broken down into real tasks only when it can start now. Tasks written earlier would describe code that does not exist yet. Every other milestone gets outlines: placeholders that say what the RFC requires and what must land first.
- **A milestone is broken down only when the ones it depends on are closed.** Each later milestone gets one planning item that says so on the board. It is blocked by the closing of those milestones, and its outlines are blocked by it.
- **An outline claims nothing the RFC does not say.** No size, no slicing, no invented acceptance criteria.
- **One vocabulary for the whole RFC.** Area names, milestone names and task keys are fixed before any breakdown starts, so parallel breakdowns do not name the same thing twice.
- **A subagent never asks the person and never guesses.** It returns its questions. You ask them together.
- **Fix the tasks, never the plan.** A finding that would change a milestone's scope, order or contracts, or the RFC text, goes to the person as a proposed follow-up RFC (the `feature-rfc` skill covers it).
- **Nothing is published before the person approves.**
- **English by default.** Write in another language only when the person explicitly asks.

## What is produced

A tasks folder with one folder per milestone:

```
<tasks folder>/
  <milestone-slug>/
    00-plan.md            the milestone's plan
    01-<task-name>.md     one file per task or outline
    02-<task-name>.md
```

- **The plan** of a broken-down milestone is the first part of `milestone-breakdown`'s task list template, from the title through "Changes to the plan". Each task file is one task from the same template.
- **The plan and the files of an outlined milestone** follow [references/outline-template.md](references/outline-template.md): one file per outline, and one planning item.
- **Every task and outline has a key:** `<rfc-slug>/<milestone-slug>/<number>`. The number is the next unused one in its milestone when the file is first written. It is never reused and never changes. The `NN` in the file name is the order and may change. Blockers and trackers refer to the key.

**Where the folder goes.** Default: `openspec/design/<feature-name>/tasks/`, the feature's folder outside the archive. Do not put it next to the RFC file: task files keep changing, and nothing in the archive does. The person can name another place. The files are not committed unless the person asks for that. To keep them out of commits, add the folder's path to the clone's local exclude file and tell the person you did:

```bash
echo "<path of the tasks folder from the repository root>/" >> "$(git rev-parse --git-path info/exclude)"
```

That file is local to the clone and is never committed, so nothing in the repository changes. Skip this when the person wants the files committed.

## Break down

### 1. Check the RFC

- Its status is Accepted. If it is still in review, do not stop at saying so. List what is still open (decisions not agreed, blocking open questions, pending spikes, changes the person has not seen) and ask whether they accept the RFC now. A request to break it down is not an acceptance. On an explicit yes, the acceptance is recorded and the RFC is archived as `feature-rfc` step 8 describes, before anything else here.
- It is on the default branch, at its archived path. Every published task links to it there, so until then nothing can be published. The same goes for every accepted follow-up RFC its header links. If one of them is only on a branch, say so now, so that the person can merge it while the breakdown runs. The breakdown itself can go on.
- Read the whole RFC, every follow-up RFC its header links as "Partly superseded by", and the decision records (`adr-*.md`) in its folder. The RFC is frozen at acceptance, so a later change is only in a follow-up RFC. Where the two disagree, the follow-up wins. If the status is "Superseded by", the RFC is no longer the design: tell the person and use the one it links.
- It has a milestone table, a Contracts section, a "What changes" table and a "Left to implementation" list. If one is missing, tell the person and stop.

### 2. Settle the choices for the whole run

Ask once, together, and only what the request, the repo's settings (see `milestone-breakdown`, "Settings") or this conversation have not already answered:

- where the tasks folder goes;
- whether to publish, and where (for example a GitHub Project), or keep the files only;
- which model independent reviewers use;
- how a task is started in this repo (the branch rule, the command or skill that opens a change, the reviews required), when the repo's agent instructions and contribution docs do not say;
- whether stacked pull requests are allowed for every milestone of this RFC. If the person does not want to decide that for the whole RFC, leave it open: each breakdown returns the question when a real case comes up.

### 3. Sort the milestones

Give every milestone one state, with the reason.

| State | Test | What it gets |
|---|---|---|
| Done or dropped | Done: its plan in the tasks folder has a closing entry, and, when it is published, its plan item in the tracker is closed as completed too. Dropped: a follow-up RFC says so | Nothing. The contracts of a done milestone count as produced. |
| Ready | It passes every start condition in `milestone-breakdown`, "Before you start": each milestone it depends on is done, each contract it consumes is in the code, and each condition attached to the acceptance or to a decision is met | A full breakdown |
| Later | Anything else. Name the condition that is not met | Outlines and one planning item |

Check the code for the consumed contracts. A closing entry alone is not enough. The RFC itself does not say which milestones are done: it is frozen at acceptance.

Stop and ask the person, with what you found, when the RFC and the repository disagree or work has already begun:

- a milestone marked done whose contract is not in the code;
- a milestone whose plan and tracker disagree about done: a closing entry with an open plan item, or a closed plan item or tracker milestone with no closing entry;
- a milestone that has tasks, merged work or a tracker entry that an earlier run of this skill does not explain. In Continue, the plan, the planning item and the outlines that the first run wrote are expected;
- a milestone that depends on a dropped one;
- no milestone is ready and none is done.

Show the sorting to the person before any breakdown starts. It is cheap to correct here and expensive later.

### 4. Fix the shared vocabulary

Write down, once, and give the same text to every breakdown:

- **Area values:** the Component column of the RFC's "What changes" table. A breakdown that needs an Area that is not on the list reports it and does not invent one. A milestone with no row in that table has no Area: ask the person for one, and say that the RFC lists no change for the milestone.
- **Shared names:** every name that tasks of more than one breakdown would otherwise each pick, such as the spec capabilities in a repo with OpenSpec, taken from the RFC and the repo. If the RFC does not give one, ask the person.
- **How a task is started:** the repo's process, or the answer from step 2. Every task's "Start" section ends with it, in the same words.
- **Slugs:** one for the RFC and one per milestone, lowercase with hyphens.
- **The tasks folder** and the file naming above.
- **The answers from step 2.**

### 5. Break down the ready milestones

Run `milestone-breakdown` once per ready milestone. When your tool can run subagents, give each milestone its own subagent and run them in parallel. Otherwise do the milestones yourself, one after another. The brief for a subagent is in [references/breakdown-brief.md](references/breakdown-brief.md). The same rules hold when you do the work yourself:

- Run the break-down mode through its checks (step 7). Stop before the review with the person (step 8).
- Write `00-plan.md` and one file per task, each with its key, Area and Phase.
- Leave unwritten every task that waits on a blocking question, as `milestone-breakdown` requires. In the coverage table, such an entry says what it waits on. The one exception is a question the person has deferred, with the reading to use (step 8).
- Return a short report: the number of tasks against the RFC's estimate, the open questions, the assumptions, the hotspot files, whether the list reached the independent review setting, and any finding that needs a follow-up RFC.

**Independent review of one milestone.** A subagent usually cannot start a reviewer. When a milestone's report says its list reached the independent review setting, start that review yourself, as `milestone-breakdown` step 7 describes. If no separate session is possible, the plan says "self-check only". If the last allowed round still reports findings, the fixes for them are unreviewed: ask the person whether to run one more round or accept your own check, and write the answer into the plan.

### 6. Write outlines for the later milestones

Do this yourself, from the RFC alone. Do not read the code for it.

1. List what the RFC names for the milestone: each behavior in its outcome, each contract it produces, and each NEW, CHANGED or REMOVED row of "What changes" that is assigned to it.
2. Merge the entries that describe one deliverable. An event that is a behavior, a contract and a table row is one outline, and the outline links all three.
3. A REMOVED row that names no milestone is a question for the person. An UNCHANGED row is never work.
4. Keep every "all", "every" and "each" of the RFC as it is, and note in the outline that the breakdown expands it into a named list. Expanding needs the code.
5. Write one file per outline and the milestone's short plan, in the format of [references/outline-template.md](references/outline-template.md). Phase is "Outline".
6. Write the milestone's planning item, in the same reference. Phase is "Planning". It is the item that says "break this milestone down", and it has a key like any other. It is blocked by the plan of every milestone its own milestone depends on that is not done yet, written as `plan: <rfc-slug>/<milestone-slug>`. A milestone that was already done in step 3 blocks nothing: the planning item names it as done, with the evidence. A plan is closed only when its milestone is closed with `milestone-breakdown`, so the planning item becomes ready when those milestones are done, and not when their last task merges.
7. Set what blocks each outline: the planning item of its own milestone, and for every contract it consumes, the task or outline that produces the contract. Use keys. The planning item carries the order between milestones, so an outline needs no other blocker for it.

The planning item is closed when its milestone has been broken down and the person approved the tasks: with the publication where the tasks are published, with the approval where the person keeps the files only. Closing it unblocks nothing in another milestone: the next milestone's planning item waits for this milestone's plan to be closed.

### 7. Check across milestones

Each milestone's own checks ran in step 5. This check covers what none of them could see. When your tool can run a separate read-only session, give the check to one that has seen none of the breakdowns, with the RFC and the tasks folder. Otherwise do it yourself and report it as a self-check.

- **Contracts.** Every part of an RFC contract that a task or outline consumes has exactly one producer: a task, an outline, or a done milestone whose contract is in the code. A consumer is blocked by its producer's key. When a milestone builds a contract over several tasks, an item of another milestone that consumes the contract is blocked by the task that checks its complete shape. It needs no blocker when a done milestone produced the contract, or when the same task produces the contract and uses it.
- **Blockers.** Every key named as a blocker exists. No cycles across the whole set.
- **Parallel milestones.** Two milestones that can be built at the same time do not both change the same hotspot file, migration sequence or shared configuration.
- **Duplicates.** No two milestones add the same scaffolding, check or refactor. No two outlines stand for the same deliverable.
- **Assumptions.** No two milestones assume different defaults for the same thing. No assumption stands in for part of a contract the RFC gives to that milestone.
- **Deferrals.** Everything a milestone defers names the key of the task or outline that will deliver it, and that item's text really covers it. The one other case is an accepted follow-up RFC that drops the entry. In a whole-RFC backlog every later milestone has outlines, so a moved entry always has a key to name. A deferral nobody picks up is a finding.
- **Planning items.** Every later milestone has exactly one. It is blocked by the plan of each milestone its own depends on that is not done, and every outline of its milestone is blocked by it. No planning item is blocked by another planning item or by a single task.
- **Coverage of the RFC.** Every NEW, CHANGED or REMOVED row of "What changes" is delivered by a task or an outline, is already in the code through a done milestone, or waits on a named question. Every open question the RFC assigns to a milestone is a coverage entry of that milestone's plan, or is named in its planning item.
- **Vocabulary.** Keys are unique. Area and Phase values and the shared names come from the agreed lists. Every task's "Start" section ends with the same way of starting a task.

### 8. Settle the findings

| Finding | What to do |
|---|---|
| A missing blocker that follows from an order the RFC states, a duplicate, a name clash, a wrong Area, a deferral that names nothing | Edit the task file and the tables of that milestone's plan. Run that milestone's checks and step 7 again. |
| A conflict inside one milestone's split | Send it back to that milestone's breakdown. |
| A question a breakdown returned | Ask the person, all questions together, each with the possible readings and your recommendation. Give the answer to that milestone's breakdown, which records it in the plan, writes the tasks that waited, and runs its checks again. Then run step 7 again. |
| A question the person does not want to answer now | Only the person can defer it. Give the deferral to that milestone's breakdown, with the reading to use. It writes the task on that reading, names the question under "Ready to start when" and records the deferral in the plan. Then run its checks and step 7 again. |
| Tasks that wait on a spike | They stay unwritten. The spike task is written. The coverage entries say they wait on it. |
| A dependency between milestones that the RFC does not state, including an order you would have to impose on two parallel milestones to keep them off the same hotspot. Anything else that changes a milestone's scope, order or contracts, or the RFC text | Stop that part and propose a follow-up RFC to the person. Do not write or change the affected tasks until it is approved. |

### 9. Review with the person

One review for the whole RFC. Lead with what is expensive to get wrong:

- the sorting of the milestones, and why each later one waits;
- what is still unwritten, and what it waits on;
- the assumptions and the answers given;
- the blockers that cross milestones;
- the risky tasks (migrations, security, rollout) and what is claimed to be parallel;
- anything outside the size settings, and each milestone's count against the RFC's estimate. Where a count passes the milestone size overrun setting, the person chooses: keep it as one milestone, or split it through a follow-up RFC.

Adjust until they agree, and run the affected checks again after each change. The person decides the final set.

If the person wants to publish only part of it, the part must hold together: a task is published only together with every task and outline that blocks it. Show which items have to be added or held back.

### 10. Hand over

- When the person chose a tracker, pass the approved set to `task-publishing`. Otherwise the files are the result.
- Tell the person what comes next. Every task starts with its own reconcile against the merged code, which is its "Start" section. When a pull request reports effects on later tasks, the remaining tasks of that milestone are reconciled with `milestone-breakdown`. When the last task of a milestone has merged, the milestone is closed with `milestone-breakdown`. Only that makes the next milestone's planning item ready, and then this skill is used again in Continue mode.
- Do not start implementing in the same step unless asked.

## Continue

Use this when a milestone that has outlines becomes next: every milestone it depends on is closed, and the person confirmed every condition under the planning item's "Ready to start when". If a milestone is not closed or a condition is not confirmed, stop and say so. A merged last task is not a closed milestone.

1. **Get the current state.** Read the RFC with its follow-up RFCs, and the tasks folder. If the folder is gone and the tasks were published, restore it from the tracker with `task-publishing`. If there is neither, ask the person.
2. **Sort the milestones again** (step 3).
3. **Break down each milestone that is now ready and still has outlines** (steps 4 and 5). A ready milestone that already has tasks was broken down before and is left alone. The vocabulary from the first run stays. New tasks get new keys, starting at the next number that no outline, planning item or earlier task of the milestone has used: give that number to the breakdown. The outline files and the planning item file stay as they are, with their keys, until they are retired.
4. **Write the replacement table** in the milestone's plan: for each outline key, the keys of the tasks that replace it, and for every item that was blocked by the outline, the key of the new task that blocks it from now on. An outline usually becomes several tasks, and a consumer usually needs only one of them. Then apply the table: in the file of every item that was blocked by an outline, and in the tables of that item's plan, write the new key in place of the outline's. Do the same wherever another plan names the outline as the item that picks up a deferred or carried-forward entry: write the key of the task that now delivers it. After this step nothing that stays names an outline that is going away.
5. **Check across milestones, settle and review** (steps 7 to 9). The set that is checked is the one that will exist afterwards: the new tasks count, and the outlines and the planning item that are being replaced do not, although their files are still in the folder. They are read only to check that the replacement table leaves none of them out. In the review, show the change against what is published, not the whole backlog again.
6. **Hand over.** When the tasks are published, `task-publishing` replaces the outlines and closes the milestone's planning item. When the person keeps the files only, the approved replacement table is the record, and the planning item is done with the person's approval.
7. **Retire the files.** After that, move the outline files and the planning item file into `retired/` in the milestone's folder. Their keys stay taken. Only the files directly in the milestone's folder are the current tasks.

Continue covers this one case. Stop and ask the person, with what you found, when the situation is anything else:

- a follow-up RFC changed a milestone that already has tasks or outlines;
- a milestone was dropped after its tasks or outlines were written;
- a reconcile in one milestone changed a contract or a task that another milestone's items are blocked by;
- a task merged with acceptance criteria marked "not done", and something in another milestone is blocked by it;
- an earlier run stopped half-way and it is unclear what was written.

## Rules that always hold

- Never invent facts about the code or the RFC. Cite file paths and RFC sections.
- An outline is never implemented. It is refined into tasks first.
- A milestone is never broken down while a milestone it depends on is still open.
- A task or outline that is already started is never edited silently. Tell the person.

## Output

- **Break down:** the tasks folder with a planning item for every later milestone, the sorting of the milestones with reasons, the result of the cross-milestone check, the open questions and assumptions, and any findings that need a follow-up RFC.
- **Continue:** the new plan and task files for the milestones that became ready, the replacement table for their outlines, and the result of the cross-milestone check.
