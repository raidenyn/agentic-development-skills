# Conductor Live Proof Gaps Implementation Plan

**Goal:** close the three gaps that the #36 live run found in `project-conductor`.

**Architecture:** documentation-only changes to the skill and its references, plus delta specs for `conductor-triggers` and `board-onboarding`.

**Spec:** `brainstorm.md`, `proposal.md`, `design.md`, `specs/*/spec.md`.

## Global Constraints

- No change to the Settings block, the Run record or the Phase report.
- `SKILL.md` stays under about 500 lines.
- Commits follow Conventional Commits.

## Tasks

Follow `tasks.md` in order, 1 to 4. Each edit is a text replacement in the named file. Check 4.2 against the live board with read-only calls only: `list_scheduled_tasks` and `t3_thread_read`.
