# Final whole-branch review — fix wave report

Change: `deliver-hooked-rules` (issue #16)
Worktree: `/home/dev/.t3/worktrees/agentic-development-skills/t3-ebb73c1f-4bfeaeef6834c54f`
Branch: `feat/openspec-ff-change-issue-16`
Fix commit: `47d6360 fix: tie the rules ledger lock to its worker and fail open on folder errors`
Receipt commit: `8d607f6 docs: reconcile the deliver-hooked-rules apply receipt` (HEAD)

## Findings

1. **Critical — retired worker leaves the ledger locked.** `withLedger` now acquires a worker's supervisor-owned `context.lock` (`LedgerOptions.lock`) and releases it in `finally`; `handler.mts` passes `ctx.lock`. The local pid-keyed `ledger.lock` remains only as the in-process fallback. The supervisor already tracks these handles per worker generation and releases them in `cleanup()`/`retire()`, so termination cannot leak the lock. Covering test: `a retired worker releases its ledger lock so a replacement worker can write` (`tests/agent-harness/hooked-rules-delivery.test.mjs`), which starts a real worker, blocks it while it holds the lock, calls `terminateWorker`, then proves a replacement worker acquires and writes. A fake-lock unit path is also exercised by the compaction test below. No age-based eviction was added.
2. **Critical — compaction misses its deadline behind the ledger queue.** `bump` appends directly to `compactions.log` after one clock sample and the final abort/deadline check, without the process queue or either lock. Covering test: `a compaction advances the generation while a ledger operation still waits for its lock` (same file), which holds a ledger operation on a blocked runtime lock and asserts the compaction still completes and raises the generation before the holder is released.
3. **Important — silent rules-directory failures.** `RuleIssue` gained `directory?: true`; `loadRules` marks a non-directory path and unreadable folder as folder failures (a missing folder stays error-free). The handler's `loadChecked` rejects on a folder failure, so the runtime emits `failureNotice` with the handler's `manual` on tool, prompt and session-start events; individual invalid files remain in the load result so valid siblings still deliver, and the startup report now ends with the manual. Covering tests: `a rules path that is not a directory rejects so every event fails open with the manual notice`, `an unreadable rules folder fails open with the manual notice at the next session start`, and the existing valid-sibling delivery test.
4. **Important — apply receipt/state mismatch.** Ticked 6.1–6.3 in `openspec/changes/deliver-hooked-rules/tasks.md`; updated `apply.md` to `1b0db00..HEAD`, count `25`, and moved the Task 3 parked items to fixed. `git rev-list --count 1b0db00..HEAD` is 25 after the receipt commit.
5. **Minor — regular file at the rules path.** `loadRules` reports it as a folder failure (covered in the grammar suite: `loadRules treats a regular file at the rules path as a folder failure, not an absent folder`), and the CLI refuses `install`/`update` through `rulesDirError` before any copy, config or lock write; `check` fails naming it, while an absent folder passes. Covering test: `install and check: a regular file at the rules path is refused, while an absent folder is no error` (`hooked-rules-cli.test.mjs`).
6. **Minor — mixed-EOL stale block rewrote the heading's EOL.** When the heading is already directly above the begin marker, `applyBlock` now keeps the bytes through the begin marker line and replaces only the rest. Covering test: `pointers: a stale block under a correctly placed heading keeps the prefix bytes and its line ending`.
7. **Minor — tabs on the `---` delimiters survived.** `split` rejects a tab on the raw opening and closing delimiter lines before their trimmed comparison. Covering cases: `a tab on the opening marker` and `a tab on the closing marker` in `hooked-rules-grammar.test.mjs`.
8. **Minor — weak adapter/grammar tests.** The claude-adapter fixture now links `.claude/skills/link-skill/SKILL.md` to `skills/real-skill/SKILL.md` (different slugs) and places the negative symlink under `skills/y/SKILL.md` pointing outside; assertions updated. The BOM/CRLF test now writes a BOM-bearing file and hashes it through `loadRules`.
9. **Minor — three SKILL.md statements.** Corrected: a fresh rule is undelivered (no entry), a retry clears only that rule's gate so another rule can still deny, and a synchronous match cannot cooperate with cancellation but the supervisor terminates the worker at the deadline.
10. **Minor — ambient `AGENT_HARNESS_TRACE`.** The no-change Stop test passes `AGENT_HARNESS_TRACE: ''` to its untraced child, and the OpenCode trace test deletes the ambient variable before its first pass and restores it in `finally`. Verified with the variable set (see commands).
11. **Minor — erased type declarations shipped orphaned comments.** Moved `LedgerLock`, `LedgerLockHooks`, `LedgerRuntimeLock`, `LedgerOptions`, `LedgerOperation`, `Owner`, `LockState` and `TakeOver` to `src/hooked-rules/lib/ledger.types.mts`; rebuilt `ledger.mjs` no longer carries the orphaned `Test seams` comment.
12. **Minor — task-6 report labels.** The slash event is now labelled `prompt` (not `tool.after`), and `ran` is explained as "the verify command ran, whether it passed or failed" (not proof of failure).

## Commands run

```bash
node -v                      # v26.13.1
pnpm -v                      # 12.18.0
pnpm run build               # build: 0 file(s) written or removed (edit hook had built the same output)
pnpm run typecheck           # tsc -p tsconfig.json && tsc -p tsconfig.tests.json — no output, exit 0
pnpm run harness:update      # hook-runtime 0.2.0 up to date; verify-gate 0.2.4 up to date; hooked-rules 0.1.0 updated
node --test "tests/agent-harness/*.test.mjs"
                             # tests 500, pass 500, fail 0
pnpm run check               # tests 564, pass 564, fail 0 (build:check, typecheck, biome, script tests + agent tests)
python3 scripts/skills.py validate
                             # 10 skill(s), 0 error(s), 0 warning(s)
claude plugin validate .     # Validation passed
python3 -m unittest discover -s scripts -p 'test_*.py'
                             # Ran 65 tests in 16.794s — OK
node .agents/harness/hooked-rules/cli.mjs check          # hooked-rules: ok (exit 0)
node .agents/harness/hooked-rules/cli.mjs pointers --check  # hooked-rules: pointers ok (exit 0)
AGENT_HARNESS_TRACE=1 node --test --test-name-pattern="no-change Stop|no-change turn end writes a trace" tests/agent-harness/verify-hosts.test.mjs
                             # tests 2, pass 2, fail 0 (ambient trace isolation regression)
node scripts/verify.mts      # after the receipt commit: tests 564, pass 564, fail 0;
                             # hook-runtime: ok; verify-gate: ok; hooked-rules: ok; pointers ok
```

## Concerns

- The `apply.md` range is written as `1b0db00..HEAD` so it stays exact when HEAD is the receipt commit; the count was computed for that final state.
- The in-process fallback still uses the host-pid `ledger.lock`, as intended for tests; only worker execution uses the supervisor lock. (This report predates `f2bc786`, which added the 20 ms retry up to 1 s, the no-match skip and the manual notice; that supersedes the next line.)
- ~~Under contention the supervisor lock returns `null` immediately rather than waiting up to 1 s…~~ Superseded by `f2bc786`.
- No tool version bump was needed: `hooked-rules` already carries this pull request's `0.1.0` bump; `harness:update` refreshed its lock hashes.
- This report was written under `.superpowers/sdd/` and is now kept with the change as `evidence/final-fix-report.md`.
