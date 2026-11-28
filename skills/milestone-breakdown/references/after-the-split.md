# After the split

The task list is written before any of the milestone's code exists. Each merged task changes the code and teaches something, so the remaining tasks need looking after. This file covers the two modes that follow the breakdown: reconcile and close.

Reconcile means reading the code a task touches, as it is now, and checking the task against it. It happens in two places: for one task, every time, before any work on it starts, and for the remaining tasks, when something that happened affects them.

State lives in what is written down, not in a conversation. The task list wherever the person keeps it, the answers and assumptions in it, the pull requests and the git history are what a later session reads. Do not rely on anything that was only said in chat.

Both modes start by getting the current task list. If you cannot reach the place where it is kept, ask the person for it. Hand updates back in the same form, for the person or their tools to apply.

## Reconcile a task before it starts

This one is not optional and has no trigger. No design work, brainstorming, OpenSpec change or code for a task begins before it. The session that implements the task does it, following the "Start" section of the task, so it works without this skill and without the plan.

1. Confirm that every task under "Depends on" is done, and read what it reported: a merged pull request, or a spike's recorded findings. The one exception is a task this one is stacked on by the person's choice: it need not have merged, and its branch is the base. Confirm every condition under "Ready to start when".
2. Read the code the task touches, as it is on the main branch now. For a stacked task, also read what the branch it is stacked on adds on top of the main branch.
3. Find the real place of everything the task refers to: an earlier task's work, a contract between tasks, a starting point. Check the assumptions in force.
4. Sort what differs:

| What differs | What to do |
|---|---|
| A path, a name, where a contract landed, an assumption that is now a fact and agrees with the task | Fill it in, in the change or pull request description. Go on. |
| The scope, an acceptance criterion, a dependency, a contract, or an assumption the code contradicts | Stop and report to the person. The task goes through "Reconcile the remaining tasks" below before anyone starts it. |
| A dependency that is not done, other than the task this one is stacked on, or a condition under "Ready to start when" that does not hold or cannot be confirmed | Stop and report. The task is not ready. |

The implementing session never rewrites its own scope or criteria. That would let the task drift with nobody deciding it.

## Reconcile the remaining tasks

Do this when a merged pull request reports effects on later tasks or anything that differs from its task, when a spike reports, when a task fails, when a task's own reconcile handed something back, or when the person asks. A merge that reports no difference needs none: each later task is reconciled when it starts. A spike may report without a merged pull request. Then its findings stand in for the pull request in step 1: record them under "Findings from the code", and write the tasks that waited for the spike, with the checks from the breakdown.

1. Read what triggered this. For a merge: the pull request's description, especially the part that reports what differed from the task, and the change itself. For a task's own reconcile that handed something back, or a failed attempt: its report, and the code it points at. For a spike: its findings.
2. Read the task list as it stands now, and any follow-up RFC accepted since the list was written.
3. Find the remaining tasks that rely on what changed: a contract, a file or area, an assumption, a dependency.
4. Update only those tasks. If one of them has already been started, tell the person what changed and let them decide whether to stop it. Do not edit a started task silently. Typical edits: a starting point moved, a dependency was added or removed, an assumption was replaced by a fact, a criterion needs rewording, a proposed follow-up becomes a new task.
5. Re-run the checks from the breakdown that the edits could affect. Coverage and dependencies always.
6. Write a "Changes to the plan" note: the date, what changed, why, and what caused it: the merged task, the spike, the reconcile report or the failed attempt. It is kept with the list.
7. Show the person what changed. They approve changes that add, remove or reorder tasks.
8. When the tasks are published in a tracker, the approved changes go there too (the `task-publishing` skill does this for a GitHub Project). A new task gets a new key. A changed task keeps its key.

If a change touches something outside this milestone, such as a contract that another milestone consumes or a task that another milestone's tasks are blocked by, say so to the person before anything is published. This skill looks at one milestone and cannot settle the effect on the others.

Work that a pull request discovered but did not need in order to finish becomes a proposed new task. It traces to an entry on the coverage list, or it is a proposal for a follow-up RFC. It is never silently added.

If a merged task changed something the RFC decided, that is a finding for the person, not an edit to the list.

## When to break down the rest again

Stop patching tasks and split the remaining work again when any of these happens:

- A contract or data shape that several remaining tasks use has changed.
- An assumption that several remaining tasks rely on proved false.
- An follow-up RFC that affects the remaining tasks was accepted.
- A spike answered differently than planned.
- A pull request was rejected because the plan's picture of the code was wrong.
- Two tasks in a row ran far past their size estimate, had to be split, or collided on files.
- The share of remaining tasks that need edits passes the setting for a new breakdown.

Breaking down again means running the main procedure on what is left: redo the code reading for the affected areas, keep the coverage list, mark what is already delivered (after a follow-up RFC, first update the list's entries from both RFCs and check that earlier evidence still proves the changed ones), and re-slice the rest. Keep the names of tasks that do not change.

## When a task fails

- Re-run a failed task from a new session, with the task corrected for what the failure showed. Do not continue the failed session.
- After the number of failed attempts in the settings, the task returns to the breakdown. It is split, or it gets a design step or a spike first.
- A task that stopped under its own "If it does not fit" rule is not a failure. Use what it handed back: the part that merged, the criteria it marked not done, and its proposed split become the input for new tasks.

## Close the milestone

Do this when the last task has merged.

1. Go through the coverage list against the code as it is now. For each entry: delivered and verified (say by what), or not. An open question the RFC gave to this milestone is an entry like the others: "not checked" is not delivered, also when the check needs a person or a real environment.
2. Check that every contract the milestone produces exists in the shape the RFC states, because later milestones consume it.
3. Check that temporary flags, scaffolding and compatibility code introduced by the milestone are removed, or name where their removal is planned.
4. List anything carried forward, with the reason and where it goes: the key of the task or outline that receives it, or the accepted follow-up RFC that drops it. A milestone's name alone is not a place. Something the RFC requires of this milestone can be carried forward only by a follow-up RFC the person has approved. When that RFC moves it to a milestone that already has tasks or outlines, the entry names the receiving key. When that milestone has none yet, the follow-up RFC is the record, because its breakdown starts from it. A follow-up task is enough only for work the RFC did not require here.
5. Tell the person the result. When they agree, add a closing entry to the "Changes to the plan" notes: the date, that the milestone is done, and what was carried forward and where. This entry is the record that the milestone is done. The RFC is frozen and is not edited. When the tasks are published in a tracker, the milestone is closed there too, with the person's agreement (the `task-publishing` skill, "Close a milestone", does this for a GitHub Project). That is what unblocks the breakdown of the next milestone: nothing else does. If this was the last milestone, say that the RFC is fully built.
6. Say what the next milestone is and whether its start conditions are now met. Do not break it down in the same step unless asked. If the RFC was broken down as a whole, the next milestone has a planning item and outlines: the `rfc-breakdown` skill's Continue mode does the breakdown and replaces them.

If an entry on the coverage list is not delivered, the milestone is not done until the entry is delivered or an accepted follow-up RFC moves or removes it.
