# Verification Report

**Change**: `start-ready-tasks-and-switch-models`
**Verified at**: `2026-11-25 18:48` (UTC)
**Iteration**: `1`
**Verifier**: Claude (Opus 5.5) via `openspec-verify-change`, after a final whole-branch review on Fable and its fix wave (ce685c0)

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] All items `"valid": true`

**Result**:

```text
9 items, 9 valid. The non-strict `openspec validate start-ready-tasks-and-switch-models` passes.
`--strict` reports only warnings that requirement text is longer than 500 characters, in conductor-wake: "Settings and board preflight", "Models are resolved, never substituted", "Taken items are left alone", "Claim order", "Which reports are judged" and "Act on a matching plan report". There are no errors.
```

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [ ] All `- [ ]` have been changed to `- [x]`: 22 of 23 (updated 2026-11-26: 1.6 and 4.2 were proved by wake 8, see `evidence/06-rejections.md`)

| Task | Reason incomplete | Blocks archive? |
|---|---|---|
| 5.2 | The PR report is written in finalize, when the PR is opened. | No; finalize does it |

---

## 3. Delta Spec Sync State

| Capability | Sync status | Notes |
|---|---|---|
| conductor-wake | ✗ pending sync | New capability (25 requirements). It is created in `openspec/specs/` at archive |
| task-run-thread | ✗ pending sync | New capability (5 requirements). It is created at archive |

---

## 4. Design / Specs Coherence Spot Check

| Sample item | design description | specs counterpart | Gap |
|---|---|---|---|
| Ready = exactly three conditions (Decision 2) | task in the project, no open blocker, Status Ready; guards separate | "Ready rule", "Trusted issues only", "Taken items are left alone" | none |
| Claim order (Decision 3) | assignee first … Run thread last | "Claim order" | design lists `gh issue develop` before the launch, which matches path A in `evidence/01` |
| Answer order (Decision 4) | finish-switch, stop (foreign/attempt), handled, act, not-idle, stop, report-only | "Answer order" | none |
| Models (Decision 5) | provider-qualified cells, exact match | "Models are resolved, never substituted" | none |
| Host proofs (Decision 8) | five proofs with fallbacks | `evidence/01-host-proofs.md` | none; every proof took its primary path |

Implementation mapping (spot check, by grep and by the final review's replay of the jq scripts):
- `skills/project-conductor/SKILL.md`: "Run one wake", with `### 1. Repair` (empty), Advance and Start, "Before the steps", and the wake report.
- `skills/project-conductor/references/run-github.md`: preflight, models, board, Ready filter, claim (`gh issue develop`, `clientRequestId`), instructions, reports (`senderThreadId`, recorded, superseded), switch (`not-idle`, `freshContext`) and stop.
- `skills/task-run/SKILL.md`: start and apply flows, trusted comments, and `git push -u origin HEAD`.

**Drift warnings** (non-blocking):
- The plan's Task 1 interface guessed `sourceThreadId` as the sender field. The real field is `senderThreadId`. The skills use the right one, and `plan.md` is left as a historical record.
- The spec's "linked branch" wording was replaced by "claimed branch" in ce685c0, to match the live finding in `evidence/08`.
- `seq` is derived from the phase, so it adds no check beyond `phase`. This is a known weakening of the provisional Phase report contract, recorded for M3.

---

## 5. Implementation Signal

- [x] No unstaged files in the worktree
- [ ] All related commits have been pushed (finalize pushes the branch)

**Commit range**: `f54ec87..989002b`

Standard checks at ce685c0: `skills.py validate` (9 skills, 0 errors), `claude plugin validate .`, 65 unit tests OK, `pnpm run check` 346/346.

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS: criteria 1, 3, 4 and 5 are proved live and by the checks. Criterion 2 is proved except for the second-author case, which waits for the owner. Three of the four report answers came from a fixture thread recorded as Run thread, as the evidence states.
- [ ] ❌ FAIL

**Next step**: finalize: push the branch, then open the PR with the report. Its acceptance-criteria table marks the second-author case "not done" unless the owner has edited #21 by then.
