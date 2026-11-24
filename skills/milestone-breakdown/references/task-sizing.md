# Task sizing

Size a task by what can be reviewed well and what the checks can verify inside one pull request. Agents can produce far more than one reviewable pull request holds, so generation is not the limit. Review is, even when agents help with it: a person still has to understand and accept the change.

The numbers below are the defaults from the Settings table in SKILL.md. They are starting points, not measured thresholds. Use the repo's values when it sets them, and suggest that the team adjust them after seeing how their own pull requests go.

## The envelope

| Signal | Target | Split or rethink when |
|---|---|---|
| Behavior | exactly one | the title needs "and" |
| Changed lines of code | up to the lines setting (about 1,000) | over the setting |
| Changed code and config files | up to the files setting (30) | over the setting, or spread over unrelated areas |
| Acceptance criteria | within the criteria setting (2 to 5), not counting the line about the standard checks | over the setting |
| Entries of the coverage list delivered | a few | so many that the task is the milestone |
| Verification | one clear path inside this pull request | it needs a later task to prove it |
| Dependencies | only on merged work | it needs a sibling's unmerged code and the person has not allowed stacking |

Count code and configuration, tests included. Leave out documents, generated files and process files such as an OpenSpec change's own files, task notes and changelogs.

Lines and files are estimates made before the code exists. Use them to compare tasks and to spot outliers, and record them in the task as a size with the estimate behind it: S is well under half the settings, M is within them, L is at or over one of them. A task with an unclear "done" behaves like a much bigger task, whatever its line count.

## Signs a task is too big

- Any limit in the envelope is exceeded.
- The outcome cannot be stated as one short thing to show.
- Its criteria describe behaviors that could each be delivered and shown on their own.
- It needs more than one kind of test approach.
- A decision it depends on is not made.
- You cannot name, even roughly, where in the code it will work.
- The estimate leaves out the migration or the tests the change implies.

Split it along a behavior, not along a layer.

## Signs a task is too small

- It has no behavior of its own and is not an enabling task.
- It cannot be reviewed or tested apart from a neighbor.
- It adds an interface nothing uses yet.
- It exists only because the split followed files or layers.

Merge it into the task that uses it. Each task costs a review and a fresh session, so many tiny tasks move effort from agents, where it is cheap, to reviewers, where it is not. A task per commit or per file is advice from weaker models and no longer applies.

## Mechanical changes

A change produced by a tool or script the team trusts (a codemod, a generated client, a lockfile, a formatter run) does not count against the line limit. The task produces the script and runs it. Review covers the script and a sample of its output.

The task still lists the scope it covers and has a check that nothing was missed, for example a search that finds no remaining use of the old name. Agents tend to stop partway through a very wide change, so this check matters more than usual.

## Where "one task, one pull request, one session" does not fit

Keep the rule as the default. Break it on purpose in these cases, and say in the task which case applies.

| Case | Use instead |
|---|---|
| A migration of live data | Two or three sequential tasks (expand, then backfill or dual write, then contract), each its own pull request and deploy |
| A large mechanical refactor | One script-driven task as above, or one task per module |
| A spike | A task whose output is findings. Its pull request is optional or closed unmerged |
| One behavior that does not split cleanly below the limit | Ask the person: split further into parts that can each be verified alone, or stacked pull requests (see below). If neither works, one task that states the size exception |
| A change across repositories | A pull request for the contract in the owning repository first, then the consumers, then cleanup |
| UI or flows where passing tests do not prove it works | Allow two or three review rounds, or add an independent check that exercises the UI |
| A first attempt that failed | A new session with a corrected task, not a continuation of the failed one |

### Stacked pull requests are the person's choice

A stack is a short chain of dependent pull requests behind one guard, each reviewable alone. It keeps a behavior together, but the chain has to be reviewed in order and a change low in the stack ripples upward. A team with few reviewers may prefer smaller independent tasks. A team with more review capacity may prefer the stack.

So do not decide this yourself. The first time a milestone has a behavior that will not split cleanly below the size settings, ask the person whether to split it further or to allow stacked pull requests for this milestone. Give the trade-off in a sentence for the case at hand. Apply the answer to the whole milestone and ask again for the next one, unless the stacked pull requests setting already answers it. Write the answer into the task list, so a later session does not ask again.

Before asking, check whether a merged contract between the two parts would decouple them. If it would, that is a plain split and no question is needed.

In a stack, each task names the task it sits on, and the checks treat that as a dependency on unmerged work that was allowed on purpose.

The reason behind the rule is the review boundary, and each alternative keeps it. The one to avoid is a single very large pull request because the agent was able to keep going.

## Running tasks in parallel

Two tasks may run at the same time only when all three hold:

- neither depends on the other;
- no decision they share is still open;
- they do not write to the same files, hotspot, migration sequence or local resource such as a port or a test database.

Overlapping files are the visible conflict. The harder one is two tasks that do not overlap in text but assume different things about a shared interface, which is why a seam between tasks gets a contract first.

The list shows what could run in parallel. How many tasks actually run at once depends on how many pull requests the people can review well. Start from the tasks-in-flight setting.
