# Feature RFC template

Copy the structure below. Keep the section order: it gives the reader the full context before asking for approval. Keep every heading. When a section has nothing to say, write one line saying why. Never leave a bare "TBD" or "N/A".

Three reading depths should each stand alone:

- **Two minutes:** Summary and What changes.
- **Ten minutes:** add How it works today, Proposal, Contracts, Milestones, and Drawbacks and risks.
- **Full read:** everything, ending with Decisions to approve.

---

````markdown
# RFC: <title phrased as the decision, e.g. "Move job scheduling from cron hosts to a managed queue">

| Field | Value |
|---|---|
| Status | Draft / In review / Accepted / Rejected / Withdrawn / Superseded by <link> |
| Author | <person accountable for the text> |
| Decider | <one person> |
| Review by | YYYY-MM-DD |
| Created / Updated | YYYY-MM-DD / YYYY-MM-DD |
| Links | <issue, related RFCs and decision records. "Supersedes <link>" for each record this RFC replaces> |

Reading order: Summary and What changes (2 min) · add How it works today, Proposal, Contracts, Milestones, Drawbacks and risks (10 min) · Decisions to approve last. Link each name to its heading.

## Summary

One paragraph: what is proposed, why now, the expected result. End with how many points need the decider's call. Do not list the decisions here.

## Problem and context

The problem stated without the solution: what is wrong, who or what is affected, the measurable impact. Objective facts only, each with a source. Why now.

## How it works today

Only the parts this feature touches: the components involved, the key flows, the data they own and the contracts between them, with file paths. Include a context diagram.

Prior art: what already nearly solves this (code, libraries, earlier designs) and why each is not enough.

## Goals and non-goals

- **Goals:** each one checkable later with yes or no. Give a metric, its baseline and target where numbers exist, and a counter-metric that must not get worse.
- **Non-goals:** things that could reasonably be goals but are deliberately excluded, not negated goals.

## What changes

| Component | Today | Proposed | Change | Decision / milestone |
|---|---|---|---|---|
| <name> | <behavior> | <behavior> | NEW / CHANGED / REMOVED | <links> |

Every NEW or CHANGED row names the milestone that delivers it. Add an UNCHANGED row where a reader might wonder whether something is affected.

Before and after diagrams: the same diagram twice, with new and changed elements highlighted and a legend. For a changed contract or data model, show a short before and after snippet of only the part that changes.

## Proposal

The system-level design, overview first. Only the detail needed to judge the decisions: boundaries, key flows, data model highlights. For a change to an API, CLI or workflow, show how it looks to its users, with a concrete example, an error case and the migration path.

Argue each decision where it arises, under a short name. Mark each one:

> **Needs your call: <decision name>.** Recommendation and its reason. Strongest alternative. Cost of changing later.

Routine decisions get one line with their source (file path, spec or agreed decision).

## Contracts

One short-named heading per contract shared by two or more milestones.

### <Contract name, e.g. "OrderCreated event">

- **What it is:** interface / event / data model / error model / naming / configuration.
- **Shape:** a short snippet of the operations, fields, types, invariants and error cases.
- **Produced by:** <milestone>. **Consumed by:** <milestones>.
- **Compatibility:** how it may evolve while work lands piece by piece (additive only, versioned, expand then contract).
- **Stability:** frozen, or provisional until <named spike or milestone>, because <reason>.
- **Needs your call:** what the person should check, the strongest alternative shape, and the cost of changing it later.

### Left to implementation

Choices this RFC deliberately does not make.

## Alternatives

Whole-approach options only. Alternatives to a single decision stay in its callout. At least two real options plus doing nothing, compared on criteria chosen before scoring. If there is honestly only one, say so and why, and compare it with doing nothing.

| Criterion | Proposed | <Option B> | Do nothing |
|---|---|---|---|

Then prose: the deciding trade-off, and why the runner-up lost, described at its strongest.

### Abandoned ideas

Ideas rejected while drafting or in review, one line each on why. Keep them, so nobody proposes them again.

## Drawbacks and risks

What gets worse with this proposal. Every hard-to-reverse step, flagged explicitly. Each risk has a short name, what would trigger it, and the mitigation.

## Cross-cutting concerns

A line or two each, or "not applicable because …": security and privacy · failure behavior · observability · migration and rollback (including whether rollback still works after data has changed) · cost, both to build and to run, including new manual work and who does it.

## Milestones

| Milestone | Outcome (what works when done) | Produces | Consumes | Depends on | Size |
|---|---|---|---|---|---|
| <name> | | <contracts> | <contracts> | <milestones> | ~N PRs |

Rules: each milestone ships on its own and leaves the main branch working. The outcome is something that can be shown working and names the capabilities or specs it touches. Cut milestones by behavior, not by layer. The first is the thinnest end-to-end path through the parts the feature touches, shaped to test the riskiest assumption. After it, riskier milestones come before safer ones. Shared contracts and the data model land early, inside the first milestone that uses them, not as a milestone of their own. No milestone consumes a contract before an earlier one produces it, and each contract has exactly one producer. A milestone that produces a contract and uses it itself lists it under Produces only. Say which milestones can run in parallel. Add a Mermaid dependency graph when there are more than three. Do not list individual tasks, and do not track progress here: the RFC is frozen once it is accepted.

## Decisions to approve

Every decision, "needs your call" first. Each contract is one decision here, linked to its heading. A frozen contract is always "needs your call".

| Decision | In one sentence | Needs your call? | Status | Reason (once agreed) | Argued in |
|---|---|---|---|---|---|
| <name> | | yes / routine (source) | proposed / waiting on spike / agreed | <the person's reason and any "yes, if" condition> | <section link> |

## Open questions

| Question (short name) | Needs your call? | Blocks the decision? | Owner | Needed by | How it is checked |
|---|---|---|---|---|---|

Everything that could not be verified goes here instead of being guessed. A question that does not block the decision is an assumption the accepted RFC rests on. "Needed by" names the milestone that must check it, and "How it is checked" says by what: a test, a measurement, or a named person with what they need for it, such as a live account. The milestone does not close while it is unchecked.

## Decision outcome

Filled in when review ends: outcome, date, decider, conditions ("yes, if …"), and links to the decision records, changes or issues that result.

## Review log

One entry per review round: date, what was asked, what changed (by name), what was decided and why.

## Appendix

Spike findings (questions, what was and was not tested, results, link to code), raw data, detailed calculations.
````
