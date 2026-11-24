---
name: task-publishing
description: Use when task files produced by a milestone or RFC breakdown must be put into a tracker, for example "create a GitHub Project for these tasks", "publish the tasks as issues" or "put the breakdown on a board". Also use when published tasks changed and the tracker must be updated, when outline tasks must be replaced by the tasks of a milestone that has now been broken down, or when a closed milestone must be closed in the tracker. Covers GitHub Projects with issues, milestones, blocked-by links, sub-issues and the Status, Phase and Area fields. Not for deciding how work is split into tasks.
---

# Task publishing

Put the tasks of a breakdown into a tracker, and keep the tracker in step with the task files afterwards.

This skill does not decide how work is split. It takes the plan and task files that the `milestone-breakdown` and `rfc-breakdown` skills write, and publishes what the person approved.

## Targets

| Target | Reference |
|---|---|
| GitHub Project, with issues in one repository | [references/github-project.md](references/github-project.md) |

Only the targets in this table are supported. For any other tracker, say so and offer the task files as they are. Do not improvise a target.

Everything below holds for every target. The reference has the commands.

## Input

- The RFC file, at its path in the design archive and on the repository's default branch. That path is final, so the links published to the tracker stay valid. If the file is not on the default branch at that path, stop before the first write: every link would be dead. Tell the person what has to be merged first. The same holds for every follow-up RFC that an item in the set links to.
- A tasks folder with one folder per milestone: `00-plan.md` and one file per task, outline or planning item. Files in a `retired/` folder are outlines and planning items that were replaced: they are never published, and their keys stay taken.
- Every task and outline starts with its key: `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->`. The key is how a published item is recognized later. It does not change when the task is renamed or reordered.

If a task has no key, or two tasks share one, stop and say which. The breakdown skills assign keys. Do not make them up here.

## Operations

Pick the one the request calls for.

- **Publish:** put an approved set of tasks into the tracker. The first run creates everything. A later run changes only what differs.
- **Replace outlines:** after a milestone was broken down, retire its outlines and publish the tasks that replace them.
- **Close a milestone:** after `milestone-breakdown` closed it, close its plan item and its tracker milestone.
- **Restore:** rebuild a lost tasks folder from the tracker.

## Rules

- **The person approved the tasks before you publish.** If nobody has, stop and send them back to the breakdown's review.
- **Dry run first.** Before the first write, show what will be created, changed, closed and left alone, and wait for the person to agree. Show every body that would change as a diff. A difference may be a change someone made by hand in the tracker: say so, and let the person choose which version stays. The person can waive the wait, by saying to publish without asking again. Then prepare the dry run all the same. If it shows only creations, write and give the dry run in the report. If it shows anything else (an item to change or close, a key that already exists, a board or milestone this skill did not mark and the person did not name, a change to anything on a board that existed before, a body over the size limit, a conflict), stop and show it.
- **Look before you create.** Search for every key among all items of the destination, open and closed, through every page of results, whether or not the items are on the board. One match: reuse it and repair what it lacks. More than one: stop and report. The same goes for the board, the milestones and the fields.
- **Never adopt silently.** A board or milestone with the right name that this skill did not mark may be someone else's. Show it and ask before using it. A board the person named themselves, by its URL or number, is confirmed by that and needs no second question. One you found by its title is not.
- **Change only what you manage:** the items carrying a key, and the fields and options named in the reference. Keep everything people added: other options, assignees, labels, comments, links to other work.
- **Never delete.** An item that no longer matches a task is reported, and the person decides.
- **Check sizes in the dry run.** A body that exceeds the tracker's limit is reported before anything is written. It is never cut.
- **A run can be repeated.** Every step checks what exists before it writes, so a run that stopped half-way is finished by running it again.
- **English by default.** Write in another language only when the person explicitly asks.

## What is published

**One board per RFC** (or an existing board the person names), with:

- a title and a one-line description;
- a readme: the link to the RFC, the milestones with their outcomes, and how to read Status and Phase;
- a link to the repository.

**One tracker milestone per RFC milestone,** with the outcome and the RFC link.

**One plan item per milestone,** holding `00-plan.md`. The milestone's tasks and outlines are its children, so its progress shows how much of the milestone is closed. That is progress, not proof: a milestone is done only when `milestone-breakdown`'s close step says so. The plan item is blocked by all of its children. When it becomes Ready, the milestone is due to be closed. It is closed only by "Close a milestone" below, and that is what the next milestone's planning item waits for.

**One item per task and per outline.** The item is the whole task file, so that an implementing agent needs only the item and the repository. The fields are regrouped under fixed headings and are not reworded:

| Part of the item | From the task file |
|---|---|
| Title | The task's name. If it does not already state a goal in under about 70 characters, rephrase it and show the new title in the dry run. |
| First line | The key, as a hidden comment |
| Summary line | Link to the RFC, the milestone, Phase, Area, Size |
| Goal | Outcome, Why now, Delivers |
| Context | In scope, Out of scope, Produces and Consumes, Contracts between tasks, Assumptions in force, Starting points, Guard, Open choices |
| Prerequisites | Every blocking task as a link, with what it provides. Then "Ready to start when". |
| Start | Unchanged. It is the first thing the implementing session does, so it comes before the acceptance criteria. |
| Acceptance criteria | The criteria, as a checklist |
| Design constraints, If it does not fit, The pull request reports | Unchanged. The task's own link is filled in once the item exists. |

For an outline: the title, the key, the summary line, Goal, "Stands for", Prerequisites from "Blocked by", the "Refine first" paragraph and Design constraints.

For a planning item (Phase "Planning", one per milestone that is not broken down yet): the title, the key, the summary line, Goal, Prerequisites from "Blocked by" and "Ready to start when", then Steps, "This breakdown must settle", "This breakdown must assign", "Done when" as a checklist, and Design constraints.

Links in a task must work from the tracker. A link that is relative to the tasks folder is rewritten as a path from the repository root or as a full URL. Every link to the RFC is a full URL to the file on the default branch, with its section anchor. A blocker is written as a link to the published item.

**Tracker fields per item:**

| Field | Value |
|---|---|
| Milestone | The task's milestone |
| Blocked by | Every task under "Depends on" or "Blocked by", by key, including those in other milestones. A blocker written as `plan: <rfc-slug>/<milestone-slug>` is that milestone's plan item |
| Parent | The milestone's plan item |
| Phase | The task's Phase: Spike, Refactor, Foundation, Feature, Migration, Hardening, Outline or Planning |
| Area | The task's Area |
| Status | See below |

## Status

On publish, set one of two values:

- **Ready:** both hold. Every item that blocks it is closed as completed. And "Ready to start when" names no condition, or the person confirmed every condition it names.
- **Backlog:** everything else.

An outline is blocked by its milestone's planning item, so it starts in Backlog and stays there until it is replaced. The planning item starts in Backlog too and follows the same rule as a task: it is Ready when the plan items that block it are closed and every condition under its "Ready to start when" is confirmed. Then the milestones before it are done and this one is due to be broken down.

**After the first publish, this skill does not move Status on its own.** Starting, reviewing and finishing work are the team's moves or their automation's. Ask the person once whether the board has automation that moves a task from Backlog to Ready when its blockers close.

- If it has, leave the move from Backlog to Ready to it, and set Status yourself only on new items. Such automation sees only that a blocker closed. It can move an item to Ready while a condition under its "Ready to start when" is still open, or after a blocker was closed as "not planned". So on every Publish, Replace outlines and Close a milestone run, check each item in Ready against both halves of the rule above, set the ones that fail back to Backlog, and report them. Restore writes nothing to the board: it only reports them. When the person confirms a condition that held an item back, set the item by the rule: Ready if every blocker is closed as completed, Backlog if not. Nothing else will move it then. Tell the person that the board cannot hold these items back by itself between runs. A task's own "Start" section still stops the session that opens it.
- If it has not, offer a refresh on each later publish: every item in Backlog or Ready is set again by the rule above. Items in any other Status are not touched.

## Publish

1. Run the checks the reference lists under "Before the first write".
2. Read the tasks folder. Order the tasks so that every blocker comes before what it blocks. A cycle, or a blocker key that has no file and no published item, is a defect in the breakdown: stop and report it.
3. Check that the approved set holds together: every blocker of a task in the set is in the set or is already published. If not, show what is missing and stop.
4. Find what exists: the board, the fields, the milestones and every key.
5. Show the dry run and wait, unless the person waived the wait and the dry run shows only creations (see Rules).
6. Write, in the order the reference gives. After each kind of thing, read it back.
7. Report: the board's link, what was created, changed and left alone, and anything in conflict.

## Replace outlines

The plan of the newly broken-down milestone has a replacement table: for each outline key, the keys of the tasks that replace it, and for every item that was blocked by the outline, the key of the task that blocks it from now on. If the table is missing or leaves out an item that the outline blocks, stop: that is the breakdown's to settle (`rfc-breakdown`, Continue).

The order matters. At no point may an item look unblocked while its real blocker is not yet linked.

1. Publish the replacing tasks, as in Publish.
2. Add the new blocker links from the table, and update the body of every published item and plan item whose file changed when the replacement table was applied, closed ones included. A file whose item was never published changes on disk only: the changed files are those of an item whose blocker was replaced, and of a plan that named an outline as the place a deferred entry goes. Read the links back.
3. Remove the blocker links from the outline to everything it blocked, the plan item included. Leave the outline's own blockers in place: it must not look ready while it is open.
4. Detach the outline from the plan item, so it no longer counts in the milestone's progress.
5. Close the outline as "not planned", with a comment that links the tasks that replace it.
6. Replace the plan item's body with the new `00-plan.md`.
7. Close the milestone's planning item as completed, with a comment that links the plan item. Do this last: the breakdown is done only when the tasks are published.

If the run stops, start it again. It continues at the first step that is not yet true.

## Close a milestone

Use this after `milestone-breakdown`'s close step: the milestone's plan has a closing entry, and the person agreed to close it. Without the closing entry, stop. A milestone whose tasks are all closed is not closed by that.

1. Check that every child of the plan item is closed as completed. A child that is open, or closed for another reason, is reported, and nothing is closed.
2. Replace the plan item's body with `00-plan.md`, which now holds the closing entry.
3. Close the plan item as completed.
4. Close the tracker milestone.
5. Look at each planning item the plan item was blocking. One is ready only by the Status rule: all of its blockers closed as completed, and its conditions confirmed. Report which became ready and which still wait, and refresh their Status if the board has no automation for it.

This is the only step that makes the next milestone's planning item ready.

## Restore

Use this when the tasks folder is gone and the tasks were published.

1. Find the plan items and every item with a key of this RFC, open and closed.
2. Write each plan item's body to `<milestone-slug>/00-plan.md`.
3. Write each open task, outline and planning item, and each task closed as completed, back into the task file's format: undo the grouping, and keep the key as the first line. Name the file from the order in the plan and the item's title.
4. Write each outline that was closed as "not planned" and each planning item that was closed as completed to `<milestone-slug>/retired/`. They are history, and their keys stay taken. Any other closed item, such as a task closed as "not planned" or a planning item closed as a duplicate, is not written anywhere: report it with its key, which stays taken, and let the person say what it is.
5. Report what was restored and what was not. Tasks that were never published are not in the tracker. Text that someone changed in the tracker comes back as it is now: say that the restored files show the tracker's current text.

## Output

- **Publish and Replace outlines:** the dry run, then the board's link and a list of what was created, changed, closed and left alone, with every conflict.
- **Close a milestone:** what was closed, and the planning items that became ready.
- **Restore:** the tasks folder, and what could not be restored.
