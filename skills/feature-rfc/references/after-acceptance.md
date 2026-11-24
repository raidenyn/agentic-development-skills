# After the RFC is accepted

An accepted RFC is decision history. It is not kept in step with the code. Current truth lives in the code, the specs and the decision records. Only four things in the RFC still change: milestone status, the header status, small clarifications, and amendments.

## Offer two follow-ups on acceptance

1. **Break down the first milestone.** It is usually the riskiest, and splitting it early tests whether the plan and contracts hold. Use the `milestone-breakdown` skill if it is available. If it is not, say so, and split the milestone by the same rules: one task per PR, each leaving the main branch working, with dependencies checked against the contracts. Later milestones stay at milestone level until their turn.
2. **Add the implementation rule to the repo**, once per repo. Put it in a rule that loads only when relevant, not in the always-loaded instruction file, because most tasks have nothing to do with RFCs. Use whatever scoped-rule mechanism the agent host offers. For example, in Claude Code that is a file under `.claude/rules/` with a `paths:` list covering the changes folder and the design folder. Suggested text:

   > Changes made from a feature RFC follow its frozen contracts and agreed decisions. If one turns out wrong, stop and propose an RFC amendment. Do not diverge in the change's own design. Link the RFC in every change made from it. When the last task of a milestone is merged and the milestone has been checked against what it had to deliver, mark it done in the RFC's milestone table.

   The always-loaded instruction file gets at most one line: where design records live, and to check them before proposing architectural changes.

   If the host has no scoped rules, skip this. The Design constraints block in each task already carries the rule.

Ask before doing either. Do not edit repo rules on your own initiative.

## Keeping the RFC current

- **Milestone status.** Mark a milestone done when its last task is merged and it has been checked against what it had to deliver (the `milestone-breakdown` skill's close step covers the check), or dropped with one line on why. Task status lives wherever the team tracks tasks, not in the RFC.
- **Implemented.** When every milestone is done or dropped, set the header status to Implemented.
- **Amendments.** If breaking down or implementing a milestone shows that a decision or frozen contract is wrong, stop and propose an amendment: the superseded decision, the new one, the reason, and the person's approval. Log it in the Amendments section and mark the original text as superseded, without deleting it. A change too large to amend gets a new RFC next to this one, and this one's status becomes "Superseded by" with a link.

## Smaller decisions made later

The RFC's decision list is the record of the main decisions. Do not duplicate them elsewhere.

Technical decisions made later, inside the space the RFC left open, are recorded at the level they deserve:

- A choice that matters only to one change stays in that change's own design notes.
- A choice that will outlive the change, where someone will later ask "why is it like this?" (a library, a storage layout, a cross-module convention), gets a short decision record next to the RFC: `adr-<title>.md` in the same feature folder.

A decision record may refine an RFC decision. It may never contradict one, or a frozen contract. If it would, that is an RFC amendment, and it goes back to the person. Check this before writing the record.

### Decision record format

One decision per record, one page:

```markdown
# ADR: <decision phrased as a choice, e.g. "Use PostgreSQL advisory locks for the scheduler">

| Field | Value |
|---|---|
| Status | Proposed / Accepted / Superseded by <link> |
| Date | YYYY-MM-DD |
| Decider | <person> |
| Refines | <link to the RFC decision, if any> |

## Context
The forces and constraints that made a decision necessary.

## Decision
"We will …", in full sentences.

## Options considered
Only when the choice was close: each option and why it lost.

## Consequences
What becomes easier, and what we accept as a cost.
```

Never edit an accepted record to change its decision. Write a new one and mark the old one superseded.
