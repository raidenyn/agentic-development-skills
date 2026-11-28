## Design Summary

`milestone-breakdown` caps every task, and so every pull request, at about 1,000 changed lines and 30 changed code and config files, and stops a task at about 1.5 times its size estimate. The reasoning in `references/task-sizing.md` is that "a person still has to understand and accept the change".

Coding agents routinely produce pull requests above that size, and other agents review them. The owner's position: a big pull request is fine as long as agents can review it. So a line or file count no longer measures whether a change can be reviewed, and the cap only forces splits that add scaffolding, reviews and sessions.

The change removes the line and file limits completely. A task is sized only by:

- one behavior (the title needs no "and");
- 2 to 5 acceptance criteria;
- one clear way to verify it inside its own pull request;
- the scope stops under "If it does not fit".

Lines and files stay as a rough, informational estimate for the reviewer, with no threshold behind them.

## Alternatives Considered

### Alternative A: Higher defaults
- **Approach**: raise the defaults to about 3,000 lines, 80 files and an overrun at 2 times the estimate. Keep everything else.
- **Pros**: smallest edit; a runaway pull request is still caught.
- **Cons**: still a number nobody measured; agents keep splitting by count instead of by behavior.
- **Why not chosen**: the owner chose no limit at all.

### Alternative B: A limit that depends on review
- **Approach**: keep today's numbers when only a person reviews, and allow the higher ones when the repository runs an agent review on every pull request.
- **Pros**: safer for repositories without agent review.
- **Cons**: one more rule for agents to evaluate, plus detecting "agent review" per repository.
- **Why not chosen**: more process than the problem needs. A repository that wants a cap can still set one (see Key Decisions).

### Alternative C: No line or file limit (chosen)
- **Approach**: delete the line, file and overrun settings. Size by behavior, criteria and verification only.
- **Pros**: matches how the work is actually reviewed; removes splits that exist only to meet a count.
- **Cons**: no automatic signal for a pull request that grew far beyond its plan.

## Agreed Approach

Alternative C, chosen by the owner. The behavior rules already catch the main way a pull request goes wrong, an agent that keeps adding scope. That is the stop on behavior the RFC does not describe, and a title that needs "and". So the count adds little once review is done by agents.

## Key Decisions

- **Settings removed:** "Task size, lines of code", "Task size, files" and "Task overrun".
- **Settings kept:** "Task size, acceptance criteria" (2 to 5), tasks per milestone, milestone size overrun, and tasks in flight per reviewer.
- **The "If it does not fit" stop on size is dropped.** The task template no longer stops at "well past the size above". The scope stops stay: a frozen contract that would have to change, behavior the RFC does not describe, and criteria that cannot be proved inside this pull request.
- **Size becomes informational.** The task's **Size** line and the plan table's Size column hold a rough estimate of lines and files, without S/M/L thresholds and without the "L must be split or state an exception" rule. (Agent's call: dropping S/M/L entirely avoids buckets that have no threshold behind them.)
- **A repository may still set its own limit.** The Settings override in `openspec/design/README.md` already works by setting name, so a repository can put the line and file settings (and "Task overrun") back. Then the old sizing, the overrun stop and the size exception apply, kept in one section of `task-sizing.md`. (Agent's call: this keeps the old behavior reachable.)
- **The stacking question is removed everywhere** (owner's decision after review), including under a repository-set limit and in `rfc-breakdown`. The "Stacked pull requests" setting and the recorded answers go with it. Stacking stays allowed when the person asks for it, and the stacking mechanics (naming the task a stack sits on, the dependency check) stay.
- **Out of scope:** `feature-rfc`'s milestone size of 3 to 6 PRs stays. So do `harness-audit` I4 and `task-run`, which only follows the task's own "If it does not fit".

## Open Questions

- None blocking. The owner may want `feature-rfc`'s milestone size (3 to 6 PRs) lowered later, since bigger tasks mean fewer PRs per milestone.
