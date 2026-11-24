# Outline template

An outline is a placeholder for work in a milestone that cannot be broken down yet. It says what the RFC requires and what must land first. It is written from the RFC alone. Each such milestone also has one planning item: the item that says when the milestone is broken down, and by which steps.

## The plan of an outlined milestone

`00-plan.md` in the milestone's folder:

````markdown
# Outline: <milestone name>

RFC: <link to the RFC file> · Milestone: <name> · Prepared: YYYY-MM-DD

**Milestone outcome:** <what works when the milestone is done, from the RFC>

**Produces:** <contracts> · **Consumes:** <contracts, and the milestone that produces each>

**Not broken down yet because:** <the start condition that is not met: the milestone it depends on, the contract that is not in the code, the sign-off that is pending>

**Planning item:** <key and title> · blocked by <`plan: <rfc-slug>/<milestone-slug>` of each milestone this one depends on that is not done>

## Outlines

| Key | Outline | Stands for (from the RFC) | Blocked by |
|---|---|---|---|
| <key> | <title> | <links to the outcome, contract or "What changes" rows> | <keys, the planning item first> |

## Replaced by

Empty until the milestone is broken down. Then, for each outline: the keys of the tasks that replace it, and for every item that was blocked by the outline, the key of the task that blocks it from now on.
````

When the milestone is broken down, this file is replaced by the full plan from `milestone-breakdown`. The "Replaced by" table moves into the full plan.

## One outline

One file per outline, `NN-<name>.md`:

````markdown
<!-- task: <rfc-slug>/<milestone-slug>/<number> -->

## <Title: the deliverable, phrased as a goal>

**Phase:** Outline · **Area:** <one value from the agreed list>

**Goal:** <what must be true when this is done, in the RFC's words>

**Stands for:**
- <link to the part of the milestone outcome>
- <link to the contract, with its stability: frozen or provisional>
- <link to the "What changes" row>

**Blocked by:** <the planning item of this milestone, then the key and name of the producer of each contract this outline consumes, each with what it provides>

**Refine first.** This is not a task, and it is never started. The planning item of its milestone, <key and title>, says when and how the milestone is broken down (`rfc-breakdown`, Continue mode). The tasks that come out of it replace this outline.

### Design constraints

- **RFC:** <link> · **Milestone:** <name>
- **Decisions that apply:** <decision names, each linked to the RFC>
- **Contracts:** <name (frozen or provisional), produced or consumed, each linked>
````

## The planning item

One file per outlined milestone, `NN-break-down-<milestone-slug>.md`, numbered after the outlines:

````markdown
<!-- task: <rfc-slug>/<milestone-slug>/<number> -->

## Break down <milestone name> into tasks

**Phase:** Planning · **Area:** <one value from the agreed list>

**Goal:** The outlines of <milestone name> are replaced by reviewed and approved tasks, so that the milestone can be built. Where the tasks are kept in a tracker, they are published there. This item delivers no part of the RFC and writes no production code.

**Blocked by:** <for each milestone this one depends on that is not done: `plan: <rfc-slug>/<milestone-slug>`, with its name. The plan is closed when that milestone is closed, not when its last task merges. A milestone that was done before this item was written is named here as done, with the evidence, and blocks nothing.>

**Ready to start when:** <conditions from the RFC that this milestone waits on, such as a sign-off, or "no conditions">

**Steps:**
1. If the tasks folder is not on disk, restore it with `task-publishing`.
2. Confirm that every milestone this one depends on is closed: its plan has a closing entry, and, where that milestone is published in a tracker, its plan item is closed as completed. If one is not, stop. This item is not ready, and closing that milestone is a separate step (`milestone-breakdown`, close mode). Then ask the person to confirm every condition under "Ready to start when". A Ready status on a board is not that confirmation.
3. Run `rfc-breakdown` in Continue mode for this milestone: read the code, slice, write the plan with the table that says which task replaces each outline.
4. Run the independent review where the settings ask for it, settle the findings, and review the list with the person.
5. After the person approves: where the tasks are published, replace the outlines with `task-publishing`, which closes this item. Where the person keeps the files only, this item is done with their approval. Then the outline files and this file move to `retired/`.

**This breakdown must settle:** <each "all" or "every" the outlines kept, each choice the RFC leaves "to the breakdown", or none>

**This breakdown must assign:** <each open question the RFC gives to this milestone: the plan says which task checks it, who runs the check and what is recorded. The answer itself is due when the milestone is closed. Or none>

**Done when:**
- The plan covers everything the RFC places in this milestone, and its checks are reported.
- Every outline has replacing tasks, and every item an outline blocked is blocked by a named task.
- The person approved the list. Where the tasks are published, the new tasks are published and the outlines retired.

### Design constraints

- **RFC:** <link> · **Milestone:** <name>
- **Rule:** Fix the tasks, never the plan. A finding that would change a milestone's scope, order or contracts is proposed to the person as a follow-up RFC.
````

Closing this item unblocks only the outlines of its own milestone, and those are retired in the same step. It does not unblock the planning item of the next milestone. That one waits for this milestone's plan to be closed.

## Notes

- Write links as paths from the repository root or as full URLs, so they still resolve when the outline is copied into a tracker.
- An outline has no size, no starting points and no acceptance criteria. Those need the code, and the code is not there yet. If the RFC itself states a checkable criterion for the deliverable, link it under "Stands for".
- One outline per deliverable. If two RFC entries describe the same thing, they share one outline.
- An outline is blocked by its milestone's planning item, so a board does not show it as ready before the breakdown. The planning item is what becomes ready.
- An outline keeps the RFC's "all", "every" and "each" as written. The planning item lists them under "This breakdown must settle".
- Open questions the RFC gives to the milestone go under "This breakdown must assign". The breakdown does not answer them. It makes them coverage entries with a task and a check.
