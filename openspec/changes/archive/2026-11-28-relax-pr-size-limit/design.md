## Context

`milestone-breakdown` splits a milestone of an accepted RFC into tasks, one pull request each. Its sizing rules are in three places:

- `SKILL.md`: the principle "Review is the limit, not generation", the Settings table (lines, files, task overrun, stacked pull requests), "Size each task", "Ask before stacking", the checks ("Every task fits the size settings…") and the report ("anything outside the size settings").
- `references/task-sizing.md`: the envelope table, the signs of a task that is too big, mechanical changes, the exception cases, and the stacked pull requests section.
- `references/task-list-template.md`: the plan header's "Stacked pull requests" line, the Size column and **Size** line, the "If it does not fit" stop at the overrun setting, the check "Every task fits the size settings", and the notes on Size.

`rfc-breakdown` reports "anything outside the size settings" and expects each breakdown to return the stacking question (`SKILL.md:70`, `references/breakdown-brief.md:26`). Those stacking lines are deleted, and the report line gets a wording change. `task-run` follows the task's "If it does not fit" text and has no numbers of its own, so it needs no change.

## Goals / Non-Goals

**Goals:**
- No line or file limit on a task by default.
- A task is still one behavior with 2 to 5 criteria and one verification path inside its pull request.
- The old limit stays reachable through a repository's own Settings table.

**Non-Goals:**
- Changing `feature-rfc`'s milestone size, `rfc-breakdown`'s milestone size overrun, the tasks per milestone setting, or the tasks in flight setting.
- Changing `task-run` or the conductor.
- Rewriting task lists that already exist.

## Decisions

- **Delete the settings rather than set them to "unlimited".** A row that reads "no limit" still invites agents to count lines. The override path keeps the old rules in one place: a new section of `task-sizing.md`, "When the repository sets a size limit". It applies when a repository adds "Task size, lines of code" or "Task size, files" to its Settings table, and holds sizing against those values, the overrun stop (the repository's "Task overrun", default about 1.5 times), and the size exception. It has no stacking question. `SKILL.md`, the template and `rfc-breakdown` point to it instead of repeating it. The alternative, keeping the rows with a value of "none", was rejected as noise.
- **Rewrite the principle around agent review.** New wording: review is done by agents, with the person accepting the change on its report and criteria evidence. What a task must preserve is one behavior and one clear way to verify it inside the pull request. The old line "a person still has to understand and accept the change" goes.
- **Size is informational.** The template keeps `**Size:** <rough lines and files>` so a reviewer knows what is coming. The S/M/L buckets and "L is split or states why it is an exception" are removed, because no threshold defines them anymore.
- **No stacking question at all** (owner's decision). Remove "Ask before stacking", the size-triggered row in the exception table, the "Stacked pull requests" setting, the plan header line that recorded the answer, and the question and answer line in `rfc-breakdown` and its brief. Under a repository-set limit, a behavior that will not split becomes one task with a size exception. The stacked pull requests section in `task-sizing.md` stays, reworded so that it applies when the person asks for a stack, not when a behavior fails to split below a limit. The dependency checks are reworded from "allowed for this milestone" to "asked for".
- **The "too big" signs lose their first bullet** ("Any limit in the envelope is exceeded") and gain "its changes spread over unrelated areas" (carried over from the deleted files row) and "it exceeds a limit the repository sets".
- **The pull request reports the actual size against the estimate when they differ a lot**, so a large pull request is visible without a stop.
- **Mechanical changes.** The phrase "does not count against the line limit" becomes "is reviewed through the script and a sample of its output". The check that nothing was missed stays.

## Risks / Trade-offs

- [Risk] An agent keeps going and produces a very large pull request that is still nominally "one behavior". → Mitigation: the scope stops in "If it does not fit" remain, the 2 to 5 criteria cap remains, and the report must list every area changed.
- [Risk] A team without agent review gets pull requests it cannot read. → Mitigation: the documented override restores the line and file settings for that repository.
- [Trade-off] Fewer, larger tasks mean longer sessions and longer review runs per pull request. This was accepted by the owner.

## Migration Plan

Text-only change to skill files. Existing task lists keep their S/M/L marks, which become harmless. Rollback is a revert of the pull request.

## Open Questions

None.
