# Task list template

The list does not depend on any tracker. Each task is self-contained, so it can be copied into an issue, a board card or an OpenSpec change as it stands.

````markdown
# Tasks: <milestone name>

RFC: <link to the RFC file> · Milestone: <name> · Prepared: YYYY-MM-DD

**Milestone outcome:** <what works when the milestone is done, from the RFC>

**Produces:** <contracts> · **Consumes:** <contracts, and the milestone that produced each>

## Order

| # | Task | Depends on | Can run in parallel with | Size |
|---|---|---|---|---|
| 1 | <task name> | none | none | S / M / L |
| 2 | <task name> | <task names> | <task names> | |

The number is only the order. Refer to tasks by name.

Add a Mermaid dependency graph when there are more than five tasks.

## Dependency check

- Nothing is consumed before it is produced: yes / no, with detail
- Each contract has one producer: yes / no
- No cycles, and parallel tasks do not conflict: yes / no
- Frozen contracts untouched: yes / no
- Milestone outcome fully covered: yes / no
- Later milestones still get what they consume: yes / no
- Dependencies the RFC does not mention: none / list

## Findings that need an RFC amendment

None, or: what was found, which decision or contract it affects, and the proposed amendment.

---

## <Task name>

**Outcome:** <one checkable result>

**Why now:** <what this unblocks, or which risk it tests>

**Scope:** <the parts of the system it touches, with file paths. What it deliberately leaves out.>

**Produces:** <contracts or data, or none> · **Consumes:** <contracts or data, or none>

**Depends on:** <task names, or none>

**Done when:**
- <a behavior, test or check that can be verified>
- The main branch still builds, passes its checks and can be released.

**Open choices:** <choices the RFC leaves to implementation that this task must make>

### Design constraints

- **RFC:** <link> · **Milestone:** <name>
- **Task:** <link to this task where it is tracked, added once it has one>
- **Decisions this task implements:** <decision names, each linked to the RFC>
- **Contracts:** <name (frozen or provisional), produced or consumed, each linked>
- **Rule:** Follow the frozen contracts and agreed decisions as written. If one turns out wrong, stop and propose an RFC amendment. Do not diverge in this change's own design.

## <Next task name>

…
````

## Notes on the fields

- **Size** is a rough signal for the reviewer, not an estimate to be held to. A task marked L is a candidate for splitting.
- **Done when** always includes the line about the main branch. It is what makes each task safe to merge on its own.
- **Design constraints** is copied unchanged, apart from filling in the task link, into the proposal of the OpenSpec change (or the PR description) made from the task.
