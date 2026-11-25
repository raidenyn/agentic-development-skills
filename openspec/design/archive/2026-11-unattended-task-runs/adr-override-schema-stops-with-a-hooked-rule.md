# ADR: Override the schema's owner stops with a hooked rule, not by editing the schema

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-11-25 |
| Decider | Repository owner (raidenyn) |
| Refines | [Schema override](rfc-run-board-tasks-unattended.md#schema-override) |

## Context

The `superspec` OpenSpec schema tells the agent to present the design for approval and to confirm a coding model before apply (`openspec/schemas/superspec/schema.yaml`). The veles review gate also asks for a reviewer preset. In an unattended run these stops must be skipped. The schema and the OpenSpec skills are copied from their source, so an edit is undone by the next update.

Veles already overrides one schema stop this way: `.agents/hooked-rules/repo-superspec-closeout.md` says "do not ask first", and its stop predicate `superspec-finalize-pending` holds the turn open until finalize has run.

## Decision

We will leave the schema and the skills untouched and add one hooked rule per repository, `.agents/hooked-rules/repo-unattended-run.md`.

- **Delivery.** At the OpenSpec skills, at `openspec instructions`, and at the moments of pull request care.
- **Content.** The owner's standing authorization, and for each of that repository's stops what to do instead of asking. The stops differ: `line-mcp`'s schema offers the pull request as an interactive prompt (finalize step 11), and veles's finalize refuses its receipt while the pull request is a draft. The rule also points to the decision policy.
- **Enforcement.** A new stop predicate blocks a turn end while a conductor-started run is mid-phase, unless the turn ends with a question to the owner, a parked task, a phase report or a pull request watch. It is a small addition to the harness's rule handler, which the owner accepted.
- **The mark.** The conductor marks the run, with its thread and attempt, in the worktree's state folder. The predicate reads that mark. A session the owner starts by hand has no mark and keeps every stop.
- **Fallback.** If a model still stops at one artifact, that artifact's rules in the repository's `openspec/config.yaml` get one line pointing to the rule. The policy itself lives in the rule only.

## Options considered

- **Edit the schema or the skills.** Undone by every update from the source.
- **The policy in `openspec/config.yaml`.** OpenSpec adds it to its own instructions and it survives updates, but it cannot hold a turn open, it reaches only OpenSpec moments, and it applies to hand-started sessions too.
- **A setting per repository that makes every session unattended.** It would change the owner's own interactive sessions.

## Consequences

- The schema's text still says "ask". The rule wins by arriving at that moment with an explicit authorization. This works on Claude in veles today, and the owner reports that DeepSeek follows such rules in practice.
- `line-mcp`'s guide forbids creating worktrees. The run uses the worktree T3 made and creates none.
- The predicate depends on the harness RFC's rule handler, so it is built after harness M2 and inside this RFC's M2.
