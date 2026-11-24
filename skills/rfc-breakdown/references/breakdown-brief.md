# Brief for a milestone breakdown subagent

A subagent starts with nothing from this conversation. Give it everything below. Fill in the angle brackets and keep the rules as they are.

````markdown
Break down one milestone of an accepted feature RFC into tasks. Use the `milestone-breakdown` skill, break-down mode.

**RFC:** <path to the RFC file>
**Milestone:** <name, exactly as in the RFC's milestone table>
**Write to:** <tasks folder>/<milestone-slug>/

**Decided for the whole RFC**
- Stacked pull requests: <allowed / not allowed / not decided>
- Other answers from the person: <list, or none>

**Shared vocabulary. Use it exactly.**
- Area values: <the list>
- Task key: `<rfc-slug>/<milestone-slug>/<number>`, numbers from 1 in the order you first write the tasks

**How this run differs from a normal one**
1. Run the skill through its checks (step 7), then stop. Do not do step 8 (the review with the person) or step 9 (the hand-over). Another session does both for all milestones together.
2. You cannot ask the person, and you must not guess. Where the skill tells you to ask, do not ask: put the question in your report, with the possible readings and your recommendation. This includes blocking questions and the question about stacked pull requests when it is not decided above.
3. Do not write a task that waits on a blocking question. In the coverage table, write what that entry waits on.
4. Do not start an independent review. Report whether the list reached the skill's independent review setting.
5. If you need an Area value that is not on the list, do not invent one. Report it.
6. Do not change the RFC, and do not write production code.

**Files to write**
- `00-plan.md`: the first part of the skill's task list template, from the title through "Changes to the plan".
- One file per task, `NN-<task-name>.md`, with `NN` as the order. Each file is one task in the template's format.

**Report back, in this order**
1. The number of tasks written, and the files.
2. Open questions, each with the readings, your recommendation, and the coverage entries that wait on it.
3. Assumptions you recorded.
4. Hotspot files, and which tasks touch each.
5. Contracts from the RFC that the tasks consume, and for each: found in the code at <path>, or produced by <task key>.
6. Whether the list reached the independent review setting.
7. Area values you needed that are not on the list.
8. Findings that need an RFC amendment.
9. The result of the checks: every check that is not a plain "yes".
````
