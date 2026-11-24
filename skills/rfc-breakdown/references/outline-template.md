# Outline template

An outline is a placeholder for work in a milestone that cannot be broken down yet. It says what the RFC requires and what must land first. It is written from the RFC alone.

## The plan of an outlined milestone

`00-plan.md` in the milestone's folder:

````markdown
# Outline: <milestone name>

RFC: <link to the RFC file> · Milestone: <name> · Prepared: YYYY-MM-DD

**Milestone outcome:** <what works when the milestone is done, from the RFC>

**Produces:** <contracts> · **Consumes:** <contracts, and the milestone that produces each>

**Not broken down yet because:** <the start condition that is not met: the milestone it depends on, the contract that is not in the code, the sign-off that is pending>

## Outlines

| Key | Outline | Stands for (from the RFC) | Blocked by |
|---|---|---|---|
| <key> | <title> | <links to the outcome, contract or "What changes" rows> | <keys> |

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

**Blocked by:** <keys with names, each with what it provides. "None" is not possible for an outline: at the least, the work its milestone waits on blocks it.>

**Refine first.** This is not a task. When its milestone is next, break the milestone down with `milestone-breakdown`. The tasks that come out of it replace this outline.

### Design constraints

- **RFC:** <link> · **Milestone:** <name>
- **Decisions that apply:** <decision names, each linked to the RFC>
- **Contracts:** <name (frozen or provisional), produced or consumed, each linked>
````

## Notes

- Write links as paths from the repository root or as full URLs, so they still resolve when the outline is copied into a tracker.
- An outline has no size, no starting points and no acceptance criteria. Those need the code, and the code is not there yet. If the RFC itself states a checkable criterion for the deliverable, link it under "Stands for".
- One outline per deliverable. If two RFC entries describe the same thing, they share one outline.
- When all of an outline's blockers are done, a board may show it as ready. For an outline that means "ready to be broken down".
