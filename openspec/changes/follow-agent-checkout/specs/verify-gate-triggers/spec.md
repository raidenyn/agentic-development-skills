## ADDED Requirements

### Requirement: Block ledger shared across worktrees
The session's `blocks.json` ledger SHALL be kept in `<git common dir>/agent-harness/verify-gate/sessions/<host>-<session>/`, so every worktree of one repository charges the same ledger for a session. All other gate state SHALL stay under the checkout's own git dir.

#### Scenario: Limit follows a move between worktrees
- **WHEN** a session was blocked twice by one failure in one worktree, then hits the same failure in another linked worktree of the same repository, with `maxBlocks` 2
- **THEN** the turn end in the second worktree passes with the limit notice instead of a block

#### Scenario: Main checkout path unchanged
- **WHEN** the gate runs in a main checkout
- **THEN** the ledger is at the same path as before, `<git dir>/agent-harness/verify-gate/sessions/<host>-<session>/blocks.json`
