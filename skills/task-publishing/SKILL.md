---
name: task-publishing
description: Use when task files produced by a milestone or RFC breakdown must be put into a tracker, for example "create a GitHub Project for these tasks", "publish the tasks as issues" or "put the breakdown on a board". Also use when published tasks changed and the tracker must be updated, or when outline tasks must be replaced by the tasks of a milestone that has now been broken down. Covers GitHub Projects with issues, milestones, blocked-by links, sub-issues and the Status, Phase and Area fields. Not for deciding how work is split into tasks.
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

- The RFC file, at its path in the design archive. That path is final, so the links published to the tracker stay valid.
- A tasks folder with one folder per milestone: `00-plan.md` and one file per task or outline.
- Every task and outline starts with its key: `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->`. The key is how a published item is recognized later. It does not change when the task is renamed or reordered.

If a task has no key, or two tasks share one, stop and say which. The breakdown skills assign keys. Do not make them up here.

## Operations

Pick the one the request calls for.

- **Publish:** put an approved set of tasks into the tracker. The first run creates everything. A later run changes only what differs.
- **Replace outlines:** after a milestone was broken down, retire its outlines and publish the tasks that replace them.
- **Restore:** rebuild a lost tasks folder from the tracker.

## Rules

- **The person approved the tasks before you publish.** If nobody has, stop and send them back to the breakdown's review.
- **Dry run first.** Before the first write, show what will be created, changed, closed and left alone, and wait for the person to agree. Show every body that would change as a diff. A difference may be a change someone made by hand in the tracker: say so, and let the person choose which version stays.
- **Look before you create.** Search for every key among all items of the destination, open and closed, through every page of results, whether or not the items are on the board. One match: reuse it and repair what it lacks. More than one: stop and report. The same goes for the board, the milestones and the fields.
- **Never adopt silently.** A board or milestone with the right name that this skill did not mark may be someone else's. Show it and ask before using it.
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

**One plan item per milestone,** holding `00-plan.md`. The milestone's tasks and outlines are its children, so its progress shows how much of the milestone is closed. That is progress, not proof: a milestone is done only when `milestone-breakdown`'s close step says so. The plan item is blocked by all of its children. When it becomes Ready, the milestone is due to be closed.

**One item per task and per outline.** The item is the whole task file, so that an implementing agent needs only the item and the repository. The fields are regrouped under fixed headings and are not reworded:

| Part of the item | From the task file |
|---|---|
| Title | The task's name. If it does not already state a goal in under about 70 characters, rephrase it and show the new title in the dry run. |
| First line | The key, as a hidden comment |
| Summary line | Link to the RFC, the milestone, Phase, Area, Size |
| Goal | Outcome, Why now, Delivers |
| Context | In scope, Out of scope, Produces and Consumes, Contracts between tasks, Assumptions in force, Starting points, Guard, Open choices |
| Prerequisites | Every blocking task as a link, with what it provides. Then "Ready to start when". |
| Acceptance criteria | The criteria, as a checklist |
| Design constraints, If it does not fit, The pull request reports | Unchanged. The task's own link is filled in once the item exists. |

For an outline: the title, the key, the summary line, Goal, "Stands for", Prerequisites from "Blocked by", the "Refine first" paragraph and Design constraints.

Links in a task must work from the tracker. A link that is relative to the tasks folder is rewritten as a path from the repository root or as a full URL. A blocker is written as a link to the published item.

**Tracker fields per item:**

| Field | Value |
|---|---|
| Milestone | The task's milestone |
| Blocked by | Every task under "Depends on" or "Blocked by", by key, including those in other milestones |
| Parent | The milestone's plan item |
| Phase | The task's Phase: Spike, Refactor, Foundation, Feature, Migration, Hardening or Outline |
| Area | The task's Area |
| Status | See below |

## Status

On publish, set one of two values:

- **Ready:** no open item blocks it, and "Ready to start when" names no condition, or the person confirmed that every condition named there is met.
- **Backlog:** everything else.

An outline is always blocked by something when it is published, so it starts in Backlog. When its blockers are done it becomes Ready, and together with Phase "Outline" that means "ready to be broken down", not "ready to implement".

**After the first publish, this skill does not move Status on its own.** Starting, reviewing and finishing work are the team's moves or their automation's. Ask the person once whether the board has automation that moves a task from Backlog to Ready when its blockers close.

- If it has, leave Status to it. On a later publish, set Status only on new items.
- If it has not, offer a refresh on each later publish: every item in Backlog or Ready is set again by the rule above. Items in any other Status are not touched.

## Publish

1. Run the checks the reference lists under "Before the first write".
2. Read the tasks folder. Order the tasks so that every blocker comes before what it blocks. A cycle, or a blocker key that has no file and no published item, is a defect in the breakdown: stop and report it.
3. Check that the approved set holds together: every blocker of a task in the set is in the set or is already published. If not, show what is missing and stop.
4. Find what exists: the board, the fields, the milestones and every key.
5. Show the dry run and wait.
6. Write, in the order the reference gives. After each kind of thing, read it back.
7. Report: the board's link, what was created, changed and left alone, and anything in conflict.

## Replace outlines

The plan of the newly broken-down milestone has a replacement table: for each outline key, the keys of the tasks that replace it, and for every item that was blocked by the outline, the key of the task that blocks it from now on. If the table is missing or leaves out an item that the outline blocks, stop: that is the breakdown's to settle (`rfc-breakdown`, Continue).

The order matters. At no point may an item look unblocked while its real blocker is not yet linked.

1. Publish the replacing tasks, as in Publish.
2. Add the new blocker links from the table. Read them back.
3. Remove the old blocker links to and from the outline.
4. Detach the outline from the plan item, so it no longer counts in the milestone's progress.
5. Close the outline as "not planned", with a comment that links the tasks that replace it.
6. Replace the plan item's body with the new `00-plan.md`.

If the run stops, start it again. It continues at the first step that is not yet true.

## Restore

Use this when the tasks folder is gone and the tasks were published.

1. Find the plan items and every item with a key of this RFC, open and closed.
2. Write each plan item's body to `<milestone-slug>/00-plan.md`.
3. Write each task item back into the task file's format: undo the grouping, and keep the key as the first line. Name the file from the order in the plan and the item's title.
4. Report what was restored and what was not. Tasks that were never published are not in the tracker. Text that someone changed in the tracker comes back as it is now: say that the restored files show the tracker's current text.

## Output

- **Publish and Replace outlines:** the dry run, then the board's link and a list of what was created, changed, closed and left alone, with every conflict.
- **Restore:** the tasks folder, and what could not be restored.
