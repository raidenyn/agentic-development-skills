# Task sizing

A task is one behavior that the checks can verify inside one pull request. Agents can produce and review large changes, so line count is not the limit. What still bounds a task is review: a person has to understand and accept the change.

The only default number is the criteria setting in SKILL.md, 2 to 5. A repository may also set "Task size, lines of code", "Task size, files" and "Task overrun" in its own Settings table, and then [When the repository sets a size limit](#when-the-repository-sets-a-size-limit) applies. Treat the criteria as a starting point, not a measured threshold, and suggest that the team adjust it after seeing how their own pull requests go.

## The envelope

| Signal | Target | Split or rethink when |
|---|---|---|
| Behavior | exactly one | the title needs "and" |
| Acceptance criteria | within the criteria setting (2 to 5), not counting the line about the standard checks | over the setting |
| Entries of the coverage list delivered | a few | so many that the task is the milestone |
| Verification | one clear path inside this pull request | it needs a later task to prove it |
| Dependencies | only on merged work | it needs a sibling's unmerged code and the person has not asked for a stack |

Count code and configuration, tests included. Leave out documents, generated files and process files such as an OpenSpec change's own files, task notes and changelogs.

Record a rough estimate of lines and files in the task, so the reviewer knows what is coming. It is not a limit unless the repository sets one. A task with an unclear "done" behaves like a much bigger task, whatever its line count.

## Signs a task is too big

- Its changes spread over unrelated areas.
- It exceeds a limit the repository sets.
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

A change produced by a tool or script the team trusts (a codemod, a generated client, a lockfile, a formatter run) does not count against any size limit the repository sets. The task produces the script and runs it. Review covers the script and a sample of its output.

The task still lists the scope it covers and has a check that nothing was missed, for example a search that finds no remaining use of the old name. Agents tend to stop partway through a very wide change, so this check matters more than usual.

## Where "one task, one pull request, one session" does not fit

Keep the rule as the default. Break it on purpose in these cases, and say in the task which case applies.

| Case | Use instead |
|---|---|
| A migration of live data | Two or three sequential tasks (expand, then backfill or dual write, then contract), each its own pull request and deploy |
| A large mechanical refactor | One script-driven task as above, or one task per module |
| A spike | A task whose output is findings. Its pull request is optional or closed unmerged |
| A change across repositories | A pull request for the contract in the owning repository first, then the consumers, then cleanup |
| UI or flows where passing tests do not prove it works | Allow two or three review rounds, or add an independent check that exercises the UI |
| A first attempt that failed | A new session with a corrected task, not a continuation of the failed one |

### Stacked pull requests only on request

A stack is a short chain of dependent pull requests behind one guard, each reviewable alone. It keeps a behavior together, but the chain has to be reviewed in order and a change low in the stack ripples upward. A team with few reviewers may prefer smaller independent tasks. A team with more review capacity may prefer the stack.

Use a stack only when the person asks for it. This skill never asks whether to stack.

Before stacking, check whether a merged contract between the parts would decouple them. If it would, split instead.

In a stack, each task names the task it sits on, and the checks treat that as a dependency on unmerged work that was allowed on purpose.

The reason behind the rule is the review boundary, and each alternative keeps it. The one to avoid is a single pull request that carries several behaviors because the agent was able to keep going.

## When the repository sets a size limit

This applies only when the repository's Settings table sets "Task size, lines of code" or "Task size, files". Then:

- size tasks against those values;
- a task also stops at the "Task overrun" value: the repository's own, or about 1.5 times its estimate when it sets none;
- a behavior that cannot be split into parts that can each be verified alone while staying within the limit: first check whether a merged contract would decouple the parts. If it would, that is a plain split. Otherwise write one task that states the size exception. Do not ask about stacking.

## Running tasks in parallel

Two tasks may run at the same time only when all three hold:

- neither depends on the other;
- no decision they share is still open;
- they do not write to the same files, hotspot, migration sequence or local resource such as a port or a test database.

Overlapping files are the visible conflict. The harder one is two tasks that do not overlap in text but assume different things about a shared interface, which is why a seam between tasks gets a contract first.

The list shows what could run in parallel. How many tasks actually run at once depends on how many pull requests the people can review well. Start from the tasks-in-flight setting.
