# After the split

The task list is written before any of the milestone's code exists. Each merged task changes the code and teaches something, so the remaining tasks need looking after. This file covers the two modes that follow the breakdown: reconcile and close.

State lives in what is written down, not in a conversation. The task list wherever the person keeps it, the answers and assumptions in it, the pull requests and the git history are what a later session reads. Do not rely on anything that was only said in chat.

Both modes start by getting the current task list. If you cannot reach the place where it is kept, ask the person for it. Hand updates back in the same form, for the person or their tools to apply.

## Reconcile after a merge

Do this after each task merges, or when the person asks for it.

1. Read the merged pull request: its description, especially the part that reports what differed from the task, and the change itself.
2. Read the task list as it stands now, and the RFC's amendments since the list was written.
3. Find the remaining tasks that rely on what changed: a contract, a file or area, an assumption, a dependency.
4. Update only those tasks. If one of them has already been started, tell the person what changed and let them decide whether to stop it. Do not edit a started task silently. Typical edits: a starting point moved, a dependency was added or removed, an assumption was replaced by a fact, a criterion needs rewording, a proposed follow-up becomes a new task.
5. Re-run the checks from the breakdown that the edits could affect. Coverage and dependencies always.
6. Write a "Changes to the plan" note: the date, what changed, why, and which merged task caused it. It is kept with the list.
7. Show the person what changed. They approve changes that add, remove or reorder tasks.

Work that a pull request discovered but did not need in order to finish becomes a proposed new task. It traces to an entry on the coverage list, or it is an amendment proposal. It is never silently added.

If a merged task changed something the RFC decided, that is a finding for the person, not an edit to the list.

## When to break down the rest again

Stop patching tasks and split the remaining work again when any of these happens:

- A contract or data shape that several remaining tasks use has changed.
- An assumption proved false.
- An RFC amendment was accepted.
- A spike answered differently than planned.
- A pull request was rejected because the plan's picture of the code was wrong.
- Two tasks in a row ran over their size, had to be split, or collided on files.
- The share of remaining tasks that need edits passes the setting for a new breakdown.

Breaking down again means running the main procedure on what is left: redo the code reading for the affected areas, keep the coverage list, mark what is already delivered, and re-slice the rest. Keep the names of tasks that do not change.

## When a task fails

- Re-run a failed task from a new session, with the task corrected for what the failure showed. Do not continue the failed session.
- After the number of failed attempts in the settings, the task returns to the breakdown. It is split, or it gets a design step or a spike first.
- A task that stopped under its own "If it does not fit" rule is not a failure. Use what it handed back: the part that merged, the criteria it marked not done, and its proposed split become the input for new tasks.

## Close the milestone

Do this when the last task has merged.

1. Go through the coverage list against the code as it is now. For each entry: delivered and verified (say by what), or not.
2. Check that every contract the milestone produces exists in the shape the RFC states, because later milestones consume it.
3. Check that temporary flags, scaffolding and compatibility code introduced by the milestone are removed, or name where their removal is planned.
4. List anything carried forward, with the reason and where it goes: a later milestone, a follow-up task, or an amendment proposal.
5. Tell the person the result. When they agree, set the milestone to done in the RFC's milestone table yourself, or hand them the edit if you cannot change the file. If this was the last milestone, also update the RFC's status as the `feature-rfc` skill describes. Add a closing entry to the "Changes to the plan" notes.
6. Say what the next milestone is and whether its start conditions are now met. Do not break it down in the same step unless asked.

If an entry on the coverage list is not delivered and nothing carries it forward, the milestone is not done.
