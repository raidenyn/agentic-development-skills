# ADR: Decide by a fixed policy, and ask the owner in the task's thread

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-11-25 |
| Decider | Repository owner (raidenyn) |
| Refines | [Decision policy](rfc-run-board-tasks-unattended.md#decision-policy) |

## Context

An unattended run is only useful if the agent stops rarely, and only safe if it stops when it should. A task file already settles part of this: "Open choices" are the agent's, and "If it does not fit" lists when to stop. The owner went through the borderline cases one by one on 2026-11-25.

## Decision

We will apply one policy in every phase of a conductor-started run.

| Situation | Action |
|---|---|
| A choice under the task's "Open choices"; internal structure and names; wording the RFC does not fix | Decide |
| A task assumption contradicted by the code, with an obvious fix inside scope | Decide, list in the PR |
| A new dependency that the task names, or that replaces no library doing a similar job, and that is maintained and added at a current supported version | Decide, list in the PR |
| Any other new dependency | Ask |
| An unrelated failing check | Retry twice, then fix or report in the PR |
| Work beyond the task's size | Continue; there is no size stop |
| A contract needs an additive extension | Decide, list in the PR |
| A contract's logic must change, or a change is not backward compatible | Stop; collect the evidence; propose a brainstorm for a follow-up RFC |
| A criterion needs a real device or account | Try the home devices; if that fails, park the task |
| A PR comment by the owner that reads two ways | Ask in the PR thread; continue with the rest |

Every "Decide, list in the PR" goes under one PR heading, "Decided without you", so the owner sees each call at approval.

**How a question reaches the owner.** The task thread asks in its own T3 thread with the options, their consequences and a recommendation, and waits; T3 notifies the owner. The question and the answer are copied to the issue as a comment and into the change's brainstorm file, and the issue carries the `blocked` label while it waits. No timeout counts as consent.

**Slots.** A waiting or parked run gives up its slot, so other unblocked tasks continue. An answered run resumes when a slot is free. Parked tasks are reported to the owner in one message when nothing else can run.

**Partial delivery.** A pull request that does not meet all criteria carries no closing keyword, so its merge does not close the issue.

## Options considered

- **Questions on the GitHub issue.** Everything in one public place, but the owner answers without the thread's context, and the agent must check who answered.
- **Ask for every dependency the task does not name.** Safer, and the most frequent stop; the owner set the three conditions above.
- **Stop when the work passes 1.5 times the task's size**, as the task template says today. The owner prefers a larger pull request to a stop.
- **Ask when an assumption is contradicted.** The code drifts between breakdown and implementation, so this would stop most often; the owner chose Decide.

## Consequences

- Some pull requests will be larger than their task planned.
- The task template's size stop does not apply in a conductor-started run; `milestone-breakdown` says so.
- The policy is drawn from discussion, not from data. It is provisional until ten tasks have run, and a row moves from Ask to Decide only by the owner.
