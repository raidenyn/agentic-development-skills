# Feature RFC review checklist

Run this critically before the person sees the draft, and again before closing the decision. For each failed line, fix the draft or record the gap under open questions. Do not tick a line you did not actually check.

## Worth writing

- [ ] A trigger for an RFC holds, and the person agreed with the direction outline before the full draft was written.
- [ ] The main body is within the word cap. Detail that does not change a system-level decision is cut or moved to the appendix.

## Problem and context

- [ ] The problem is stated without the solution and traces back to users, money or reliability.
- [ ] "How it works today" covers the touched parts, with file paths, and nothing in it is guessed.
- [ ] Prior art was checked, and the reason each candidate falls short is written down.
- [ ] Goals are checkable with yes or no. Non-goals are real temptations.

## Evidence

- [ ] Every important number is labelled measured, derived, estimated or assumed, with source and time window.
- [ ] Nothing is invented. Each unverified claim is an open question.
- [ ] Risky assumptions were spiked, or are listed as open questions with a way to check them.

## Design

- [ ] Every change is marked NEW, CHANGED or REMOVED against today, in the table and the diagrams.
- [ ] Every NEW or CHANGED item names the milestone that delivers it.
- [ ] At least two real options plus doing nothing are compared on the same criteria, with the deciding trade-off in prose. If there is honestly only one credible option, the draft says so and why, and compares it with doing nothing.
- [ ] Drawbacks and hard-to-reverse steps are explicit.
- [ ] Security, failure behavior, observability, migration and rollback, and cost each have a line or a reasoned "not applicable".
- [ ] No pasted schemas or code beyond contract shapes. No implementation steps.
- [ ] Owners of code or services this depends on know about the change, or asking them is an open question.

## Contracts and milestones

- [ ] Everything shared by two or more milestones is a named contract with shape, producer, consumers, compatibility rule and stability.
- [ ] "Left to implementation" names what the RFC deliberately does not decide.
- [ ] Each milestone ships on its own and leaves the main branch working.
- [ ] Each milestone's outcome can be shown working. None is a layer on its own ("the schema", "the API").
- [ ] The first milestone is the thinnest end-to-end path and tests the riskiest assumption. Riskier milestones come before safer ones, and parallel milestones are marked.
- [ ] Shared contracts and the data model land inside the first milestone that uses them.
- [ ] No milestone consumes a contract before an earlier one produces it. Each contract has exactly one producer.
- [ ] The milestone table holds no individual tasks.

## Decisions

- [ ] Every decision and open question is marked "needs your call" or "routine".
- [ ] Each "needs your call" point has a recommendation with its reason, the strongest alternative, and the cost of changing later.
- [ ] Each "routine" point names its source.
- [ ] No hard-to-reverse step, frozen contract or assumption is marked routine.
- [ ] Every contract appears in the decision list.
- [ ] The decision list comes after the design, and the summary states how many points need the decider's call.

## Readability

- [ ] A reader outside the work can explain the problem back from the summary and context alone.
- [ ] Terms are defined on first use, and each concept has one name.
- [ ] Sections lead with their point. Reasoning is prose, not bullet fragments.
- [ ] Diagrams are Mermaid, each with a title, a legend and labelled lines, within the size setting. They render, or the person was told they were not rendered.

## After review

- [ ] Every settled point is folded into the body or the abandoned ideas, with the person's reason next to the decision.
- [ ] Before Accepted: every decision is agreed, and no blocking open question or pending spike remains.
- [ ] The review log has an entry for each round.
- [ ] Header status, decider and dates are current. On a decision, the outcome section is filled in.
