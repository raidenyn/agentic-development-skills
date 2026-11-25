# ADR: Run the loop from one conductor thread per board

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-11-25 |
| Decider | Repository owner (raidenyn) |
| Refines | [Conductor](rfc-run-board-tasks-unattended.md#conductor) |

## Context

Something must notice that a task became Ready, start it, and switch its thread from the planning model to the coding model. T3 Code rejects a model change made from inside the thread's own turn, so the switch needs an actor outside the task thread ([spike findings](spike-findings.md), first switch test). The boards are owned by a user account, and GitHub sends project-item webhooks only for organizations, so the board itself cannot be the trigger.

## Decision

We will run one T3 thread per board, the conductor. Three things wake it: a repository webhook on issue closed and pull request merged, a phase report from a task thread, and a timer (default every 30 minutes, also when nothing is in progress). The conductor creates its own webhook and timer triggers on its first run, because only the thread itself can bind a scheduled task to it.

Each wake is sent in queue mode and starts with a fresh session. The conductor keeps no state of its own and reads everything again from GitHub and from T3. Every wake does three steps in this order:

1. **Repair.** For each assigned issue on the board, find its thread by the launch key. An issue assigned with no thread, or a thread with no recorded id, is a half-made claim: adopt the one matching thread or release the claim. More than one match stops that task and is reported.
2. **Advance.** Handle pending phase reports and answered questions.
3. **Start.** Fill free slots from the Ready tasks, up to the parallel limit.

The conductor settles a task thread when its pull request has merged. When the board's last milestone closes it disables its own triggers and settles itself. It never archives itself, because that fails its own run. T3 removes old worktrees by its own setting, so the conductor does not.

The repository webhook needs admin rights, which the agent account does not have. Onboarding tries to create it and, when that fails, prints the exact steps for the owner.

## Options considered

- **A fresh run per webhook, with no conductor.** Each task thread then needs a relay thread to switch it, and nobody holds the overview or the parallel limit.
- **A GitHub Action that works out what is Ready and calls T3 per task.** The switch still needs something on the T3 side, so it adds a part without removing one.
- **A server reconciler with a durable ledger**, proposed by a reviewer model. Claims and phase changes become transactions that can be replayed. It still needs a thread to call T3, so it adds a daemon and a store without removing the conductor. The owner kept the conductor.

## Consequences

- Wakes into one thread run one after another, which removes most races between two wakes. A wake that dies half-way is repaired by the next one.
- A webhook delivery missed while the server is down is not retried by GitHub, so the timer is the safety net.
- Which task is Ready is a model's reading of the board. What is exact is written to GitHub: the claim and the run record.
- A thread waiting on a question shows as running from outside. The conductor must read each thread's pending requests to tell waiting from working.
