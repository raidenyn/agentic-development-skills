# Brief for a milestone breakdown subagent

A subagent starts with nothing from this conversation. Give it everything below. Fill in the angle brackets and keep the rules as they are.

````markdown
Break down one milestone of an accepted feature RFC into tasks. Use the `milestone-breakdown` skill, break-down mode.

**RFC:** <path to the RFC file>
**Milestone:** <name, exactly as in the RFC's milestone table>
**Write to:** <tasks folder>/<milestone-slug>/
**Start conditions:** <for each milestone under this milestone's "Depends on": the closing entry that shows it is done. Or "depends on nothing">

**Decided for the whole RFC**
- Stacked pull requests: <allowed / not allowed / not decided>
- Other answers from the person: <list, or none>
- Questions the person deferred: <for each: the question, the reading to write the task on, who deferred it and when. Or none>
- How a task is started in this repo: <the text that ends every task's "Start" section>

**Shared vocabulary. Use it exactly.**
- Area values: <the list>
- Shared names: <for example the spec capability each task adds to, and the task that creates it, or none>
- Task key: `<rfc-slug>/<milestone-slug>/<number>`, numbers from <1, or the next unused number when the milestone already has outlines> in the order you first write the tasks. Do not change, rename or overwrite an outline file or a planning item file that is already in the folder

**How this run differs from a normal one**
1. Run the skill through its checks (step 7), then stop. Do not do step 8 (the review with the person) or step 9 (the hand-over). Another session does both for all milestones together.
2. You cannot ask the person, and you must not guess. Where the skill tells you to ask, do not ask: put the question in your report, with the possible readings and your recommendation. This includes blocking questions and the question about stacked pull requests when it is not decided above.
3. Do not write a task that waits on a blocking question. In the coverage table, write what that entry waits on. The one exception is a question listed above as deferred by the person: write that task on the reading given, name the question under its "Ready to start when", and record the deferral in the plan. Never treat a question as deferred because you have a recommendation for it.
4. Do not start an independent review. Report whether the list reached the skill's independent review setting.
5. If you need an Area value or a shared name that is not on the list, do not invent one. Report it.
6. If the number of tasks passes the skill's milestone size overrun setting, do not merge tasks to get under it. Write the list as one milestone and report the count against the RFC's estimate.
7. Do not change the RFC, and do not write production code.
8. Check the skill's "Before you start" yourself before you write anything. If a milestone under "Depends on" has no closing entry, or a contract this milestone consumes is not in the code, write no files and report only that, with what you found. Being asked to break the milestone down is not evidence that it can start.

**Files to write**
- `00-plan.md`: the first part of the skill's task list template, from the title through "Changes to the plan". If the folder already has a `00-plan.md` that is an outline plan, replace it with the full plan and copy its "Outlines" table into a section "Replaced by" at the end. The session that started you fills in the replacements.
- One file per task, `NN-<task-name>.md`, with `NN` as the order. Each file is one task in the template's format.

**Report back, in this order**
1. The number of tasks written against the RFC's estimate, and the files.
2. Open questions, each with the readings, your recommendation, and the coverage entries that wait on it.
3. Assumptions you recorded, and everything you deferred, each with the reason. Say which milestone would have to pick it up.
4. Hotspot files, and which tasks touch each.
5. Contracts from the RFC that the tasks consume, and for each: found in the code at <path>, or produced by <task key>.
6. Whether the list reached the independent review setting.
7. Area values and shared names you needed that are not on the list.
8. Findings that need a follow-up RFC.
9. The result of the checks: every check that is not a plain "yes".
````
