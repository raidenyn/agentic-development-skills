---
name: milestone-breakdown
description: Use when a milestone of an accepted feature RFC is next to be built and must be split into PR-sized tasks, for example "break down milestone X" or "plan the tasks for the next milestone". Covers the split, checking task dependencies against the RFC's contracts, and preparing each task for its own OpenSpec change or PR. Not for splitting work that has no accepted RFC.
---

# Milestone breakdown

Split one milestone of an accepted feature RFC into tasks, one per future pull request, and check that the tasks fit together and fit the RFC.

Break down one milestone at a time, when it is next. Detailed plans for later milestones go stale, because earlier milestones always teach something. The RFC's contracts keep the milestones consistent in the meantime.

This skill is about how to split the work and check dependencies. Where the tasks are stored (an issue tracker, a project board, a file) is up to the person and their tools.

## Before you start

- The RFC's status must be Accepted. If it is still in review, finish the review first (the `feature-rfc` skill covers it).
- Read the whole RFC, its amendments, and any decision records in the same folder. Read the code the milestone touches as it is now, not as the RFC described it.
- Check the start conditions: every milestone listed under this milestone's "Depends on" in the RFC is done, even one that produces no contract (finishing a backfill, for example), and every condition attached to the acceptance or to a decision that applies here is met ("do not start until the data owner signs off"). If one is not, tell the person before splitting.
- Check what the milestone consumes. Every contract it consumes must already be produced by an earlier milestone, and landed in the code. If one is missing, stop and tell the person.
- If the RFC has no Contracts section, milestone table or "Left to implementation" list, tell the person what is missing before splitting.

## Procedure

### 1. Restate the milestone

In a few lines: the outcome (what works when the milestone is done), the contracts it produces and consumes, and the RFC decisions that constrain it. If the RFC and the current code disagree about the starting point, say so before splitting.

### 2. Split into tasks

Each task becomes one pull request and, where the repo uses them, one OpenSpec change. A good task:

- **Fits one reviewable PR.** If a task needs several PRs, split it. If the count lands far from the size the RFC estimated, tell the person, because the milestone may be mis-scoped.
- **Leaves the main branch working.** Each task can be merged, tested and released without the later ones. Use feature flags, expand-then-contract migrations, or new code paths that stay unused until switched on.
- **Has one outcome** that can be checked: a behavior, a test that passes, a contract that exists.
- **Is cut along a boundary**, such as a contract, a module or a migration step, not along files or layers that only work together.

Order the tasks so that learning comes early:

1. The task that tests the riskiest assumption first, often a thin end-to-end path.
2. Tasks that produce a contract before the tasks that consume it. The producing task lands the contract with contract tests where practical.
3. Everything else, with the tasks that can run in parallel marked as such.

### 3. Describe each task

Use the format in [references/task-list-template.md](references/task-list-template.md). Every task states its outcome, what it produces and consumes, what it depends on, how to check it is done, and a "Design constraints" block.

The Design constraints block is what carries the RFC into the implementation. It links the RFC and the milestone, names the decisions and contracts the task implements or uses (with each contract's stability), lists the conditions from the RFC that apply to implementing or releasing the task, and repeats the stop rule. Generate it from the RFC. Do not retype decisions from memory.

When a task becomes an OpenSpec change, copy the block into the change's proposal. Change nothing in its content, apart from filling in the task link. The links must still work from the new place: write them as paths from the repository root or as full URLs, or rewrite relative links for the destination, and check that each one resolves there.

Leave local choices open. If the RFC lists something under "Left to implementation", the task says the choice is open, and does not make it.

### 4. Check the dependencies

Check these before showing the list, and report the result:

- **Nothing is consumed before it is produced.** For every contract or piece of data a task consumes, an earlier task or an earlier milestone produces it.
- **Dependencies are stated, not implied by the order.** A task that consumes something another task in this list produces depends on that task, directly or through another task. "Depends on: none" is right only when everything the task needs already exists in the code. Once tasks are copied into a tracker, the list order is gone and only the stated dependencies remain.
- **Start conditions are met or carried.** The milestone's own "Depends on" entries and any acceptance conditions are satisfied, or the tasks they block say so.
- **Each contract has one producer.** No two tasks define the same contract.
- **The order is a real order.** No cycles. Tasks marked parallel do not touch the same contract, migration step or files in conflicting ways.
- **Frozen contracts are untouched.** No task changes the shape of a frozen contract.
- **The milestone outcome is covered.** Together, the tasks deliver the whole outcome, and nothing the milestone produces is left without a task.
- **Later milestones still work.** Whatever later milestones consume from this one is produced by some task here, in the shape the RFC states.
- **Nothing is hidden.** A dependency on another team, service or decision that the RFC does not mention is a finding, not a detail.

### 5. Stop when the split contradicts the RFC

If the breakdown shows that an RFC decision or a frozen contract is wrong, or reveals a dependency between milestones that the RFC does not show, stop. Explain what you found and propose an RFC amendment for the person to approve (the `feature-rfc` skill covers amendments). Do not work around it inside the task list.

A provisional contract may change, but only in the way the RFC says it may. Record the change as an RFC amendment that the person approves.

### 6. Review the list with the person

Show the task list with the dependency check result. Point out the tasks that carry the most risk, anything that surprised you, and where the count differs from the RFC's estimate. Adjust until they agree. They decide the final split.

### 7. Hand over

- Deliver the agreed list in the form the person asks for. If they name no place, show it in your reply and offer to save it next to the RFC as `tasks-<milestone>.md`. That file is a snapshot of the plan. Task status lives wherever the team tracks tasks. Creating tracker items is their call and uses their tools.
- Tell the person that the milestone is marked done in the RFC's milestone table when its last task is merged.
- Do not start implementing in the same step unless asked.

## Rules that always hold

- Never invent facts about the code. Read it, and cite file paths for claims about the current state.
- The RFC is the authority for decisions and contracts. The task list never overrides it.
- One milestone at a time. Do not pre-split later milestones, even if it looks easy.
- Refer to tasks, contracts and decisions by short names, not numbers, so a task still makes sense after it is copied or reordered.
- Write in English unless the person explicitly asks for another language.

## Output

A task list for one milestone in the template's format, the result of the dependency check, and any findings that need an RFC amendment.
