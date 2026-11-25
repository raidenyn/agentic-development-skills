# Verification Report

**Change**: `add-typescript-build-system`
**Verified at**: `2026-11-25 15:55`
**Iteration**: `1`
**Verifier**: Claude (Opus 5.5), `openspec-verify-change`, after a fresh whole-branch review on Fable 5.2

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] All items `"valid": true`

**Result**:

```text
6 items, 0 invalid
```

During this run `specs/harness-source-build/spec.md` was corrected (see section 4); the strict validation above is from after that edit.

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] All `- [ ]` have been changed to `- [x]` (34 of 34)

| Task | Reason incomplete | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync status | Notes |
|---|---|---|
| `harness-source-build` | ✗ pending sync | New capability; synced at archive |
| `code-quality-checks` | ✗ pending sync | New capability; synced at archive |
| `node-package-management` | ✗ pending sync | New capability; synced at archive |
| `harness-tool-install` | ✗ pending sync | MODIFIED; both requirement headers match the main spec exactly |
| `board-onboarding` | ✗ pending sync | MODIFIED; the header matches the main spec exactly |

### Requirement and scenario coverage

| Capability | Requirements | Scenarios covered | Evidence |
|---|---|---|---|
| `harness-source-build` | 8 | 23 of 23 | `scripts/test-build.mts` (29 tests); the Node 22.0.0 run; an enum probe failed the type check |
| `code-quality-checks` | 6 | 14 of 15 | `scripts/test-verify.mts`; probes for a type error, an untyped parameter and a badly formatted file; ignored-path probe. Not verified: "A pull request with stale build output" (CI has not run) |
| `node-package-management` | 4 | 7 of 8 | fresh frozen install; frozen install fails after a dependency change with no lock update; `package-lock.json` absent; release rule tests pass under pnpm; workflow YAML read. Not verified: the jobs running on GitHub |
| `harness-tool-install` | 2 (MODIFIED) | 4 of 4 | Node 22.0.0 run of 289 tests; no `.mts`/`.ts` under any `assets/`; CI steps present; `.agents/harness.json` command |
| `board-onboarding` | 1 (MODIFIED) | 1 of 1 | validators, Python tests and `pnpm test` pass |

---

## 4. Design / Specs Coherence Spot Check

| Sample item | design description | specs counterpart | Gap |
|---|---|---|---|
| D2 copy rule | `.json` copied, other non-`.mts` files rejected | harness-source-build "Only modules and data are built" | Fixed in this run: both said "any other file is copied" until the final review's fix made the build stricter |
| D3 pipeline | strip, rewrite, format, header, specifier check | "Emitted files are plain JavaScript…", "…keep the source's readability" | None |
| D4 TypeScript | strict, erasable syntax, `rootDirs` | "Strict type check", "Source uses only erasable…" | None |
| D6 scripts | `test` runs over `scripts/test-*.mts` | "One command runs every Node check" | `package.json` lists the test files by name, not by glob |
| D7 verify and CI | edit, build and full checks | "The verify gate runs the checks", "CI runs the checks" | None |
| D9 conversion | `any` only at host boundaries; catches narrowed | (design only) | `any` is also used for parsed JSON, and catches are narrowed by cast, not `instanceof`; both are recorded rulings, documented in AGENTS.md |

**Drift warnings** (non-blocking):

- D6: the `test` script lists test files by name; a new `scripts/test-*.mts` must be added by hand.
- D9: `any` reaches parsed JSON as well as host payloads, and Biome's `noExplicitAny` is off.
- D3: the specifier rewrite and check also read comments and strings, so a comment such as `// import x from 'lodash'` fails the build with a misleading message.

---

## 5. Implementation Signal

- [x] No unstaged files in the worktree (apart from this report, `apply.md` and the spec and design edits, committed together after this report)
- [ ] All related commits have been pushed (nothing pushed; no pull request yet)

**Commit range**: `c120c94..f3da30b`

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS — can proceed, noting: the three CI scenarios can only be verified by a run on GitHub, the branch is not pushed, and three design drift warnings are recorded above
- [ ] ❌ FAIL

**Next step**:

Finalize: push `chore/js-build-system-typescript` and open a pull request, with the owner's go-ahead. Confirm the `Validate skills` run is green, then archive.
