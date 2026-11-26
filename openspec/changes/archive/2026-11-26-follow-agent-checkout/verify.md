# Verification Report

**Change**: `follow-agent-checkout`
**Verified at**: `2026-11-26 13:38`
**Iteration**: `1`
**Verifier**: `openspec-verify-change` in the implementing session (Claude Opus 5.5)

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] All items `"valid": true`

**Result**:

```text
totals: 11 items, 11 passed, 0 failed (2 changes, 9 specs)
```

---

## 2. Task Completion (`tasks.md`)

- [ ] All `- [ ]` have been changed to `- [x]` (15 of 17)

**Incomplete tasks**:

| Task | Reason incomplete | Blocks archive? |
|---|---|---|
| 5.2 Open the PR | Done at finalize, which follows verify | Yes, until finalize |
| 5.3 Link the Pages release | The release workflow runs only after merge to `main` | Yes, until merged |

---

## 3. Delta Spec Sync State

| Capability | Sync status | Notes |
|---|---|---|
| `agent-hook-runtime` | ✗ pending sync | 3 ADDED requirements; synced at archive, in the same PR |
| `verify-gate-triggers` | ✗ pending sync | 1 ADDED requirement; synced at archive, in the same PR |

### Requirement and scenario coverage

| Requirement / scenario | Implementation | Test |
|---|---|---|
| Follows the agent's checkout: moved into a linked worktree | `src/hook-runtime/claude.mts` `resolveCheckout`, hand-off in `main` | `claude-checkout.test.mjs` "Stop in a linked worktree …"; live run (apply.md) |
| Handler context follows the move | same | "a prompt in a linked worktree is served by the worktree's copy" (repoRoot, stateDir); config through the Stop test |
| No cwd | fast path in `resolveCheckout` | existing tests, unchanged |
| Same checkout, other folder | top-level comparison returns `CLAUDE_PROJECT_DIR` verbatim | the four guards (subfolder, symlink, missing folder, project dir below top level) |
| Other checkouts pass silently (×3 scenarios) | `{skip: true}`, missing `claude.mjs` → empty | worktree without runtime, separate clone, another repository, folder outside any checkout |
| Bounded checkout resolution: git hangs | `gitDirs` with `GIT_TIMEOUT_MS`, `Promise.all` | "a git call that hangs in cwd is cut off at about 2 s", "both git calls start before either resolves", timeout and failure guards |
| Block ledger shared across worktrees: limit follows a move | `commonSessionDir` in `src/shared/lib/state.mts`, `ledgerDirOf` in `src/verify-gate/handler.mts` | `ledger-worktree.test.mjs` "the block limit follows the session …"; live run (3 confirmed charges in the common dir) |
| Main checkout path unchanged | same | "commonSessionDir equals rootSessionStateDir in a main checkout" |

---

## 4. Design / Specs Coherence Spot Check

| Sample item | design description | specs counterpart | Gap |
|---|---|---|---|
| D1 precedence | a `CLAUDE_PROJECT_DIR` failure wins; a `cwd` timeout or error keeps it; a non-zero `cwd` exit skips | Bounded checkout resolution; Other checkouts pass silently | none |
| D2 hand-off | import the worktree's `claude.mjs`, `resolved: true`, `startClock` | Follows the agent's checkout | the review dropped `capabilities` from the call; design lists none, so it is consistent |
| D3 ledger | ledger under the common dir, `stateDir` unchanged | Block ledger shared across worktrees | none |

**Drift warnings** (non-blocking):

- Symlinked worktrees keep the agent's spelling (`spelledAs`), a review fix. D1 step 5 says `realpath(top level)`; the code now returns the matching ancestor of `cwd`. The SKILL text describes it.
- A `cwd` inside the checkout's own `.git` folder now passes silently: `--show-toplevel` exits 128 there. Accepted as close to the design's "same repository only" trade-off and reported in the PR.
- Tests are in two new files instead of being appended to `claude-adapter.test.mjs` and `verify-handler.test.mjs`, so the existing test files stay unchanged.

---

## 5. Implementation Signal

- [x] No unstaged files in the worktree
- [ ] All related commits have been pushed (pushed at finalize)

**Commit range**: `b1bd220..2382e6a`

Checks: `pnpm run check` (368 tests), `python3 scripts/skills.py validate`, `claude plugin validate .` and the Python unit tests all pass.

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS — tasks 5.2 and 5.3 belong to finalize and the post-merge release; the three drift notes above are documented and non-blocking.
- [ ] ❌ FAIL

**Next step**:

Finalize: push the branch, open the PR reporting criteria, evidence and deviations, then sync and archive the change in the same PR.
