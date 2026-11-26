## 1. Stale text through the runtime (C2, design D2)

- [x] 1.1 Add the optional `stale?: string` field to the handler result and `DispatchResult` types in `src/shared/lib/handler.types.mts`
- [x] 1.2 Write the failing runtime test: `{block, stale}` and `{context, stale}` from two handlers come out joined in name order as `merged.stale` (`tests/agent-harness/runtime.test.mjs`)
- [x] 1.3 Keep a string `stale` in `validate()` and join it in `dispatch` in `src/hook-runtime/lib/runtime.mts`; the test passes

## 2. verify-gate sets the stale text (C2, design D2)

- [x] 2.1 Write the tests: a failing turn end (block, limit notice, busy ledger) carries the exact `stale` text; the background notice, a pass, a skip and a contention carry none; also add guard tests that pin C1: a changed count in the tail is a new failure, and a pass does not reset the count (`tests/agent-harness/verify-handler.test.mjs`)
- [x] 2.2 Set `stale` in `turnEnd` of `src/verify-gate/handler.mts`; the tests pass

## 3. OpenCode delivers the newest superseded result (C2, design D2)

- [x] 3.1 Write the failing adapter tests in `tests/agent-harness/opencode-adapter.test.mjs`: a superseded result with `stale` and no queued turn end is sent once with `resume: false`, then released; a superseded result with a queued turn end is dropped; a superseded result without `stale` is dropped
- [x] 3.2 Update the existing test "C starts but has not ended when B's run settles" to the owner-decided behaviour: its handler sets `stale`, and B's notice is expected
- [x] 3.3 Implement the delivery rule in `turnEnd` of `src/hook-runtime/lib/opencode-adapter.mts`; all adapter tests pass

## 4. Reap a dead holder's groups (C3, design D3)

- [x] 4.1 Write the failing `staleGroups` unit tests: released lock, live holder, dead holder with pgids, dead holder older than 24 h, no locks (`tests/agent-harness/state.test.mjs`)
- [x] 4.2 Add `staleGroups(dir, {maxAgeMs})` to `src/shared/lib/state.mts`; the tests pass
- [x] 4.3 Write the failing `killGroups` test for `confirmUntil`: the loop ends at that time and SIGKILL is always sent before it returns (`tests/agent-harness/supervisor.test.mjs`)
- [x] 4.4 Add the opt-in `confirmUntil` option to `killGroups` in `src/hook-runtime/lib/supervisor.mts`, leaving existing callers unchanged
- [x] 4.5 Write the failing supervisor test for a reap that outlives its event: a non-awaited acquire with `.catch()`, the error reply, no unreleased lock, and the group dead
- [x] 4.6 Make `onLockAcquire` asynchronous with the reap: filter out EPERM groups, use the deadline from the first pending entry that has a `ctx` (otherwise now + 2 s), check activity again after the reap, reply busy for a survivor; the tests pass

## 5. Claude Code signal cleanup (C3, design D4)

- [x] 5.1 Add `close({cleanupDeadline})` to `HandlerPool`, `WorkerHandler.close` and the `startWorker` return value, and a `close(opts)` to the runtime returned by `createRuntime`
- [x] 5.2 Add the module-level runtime registry and the stored delegate module to `src/hook-runtime/claude.mts`, and export `closeAll(opts)`
- [x] 5.3 Add an exported `onSignal({ pending, closeAll, exit })` and install SIGTERM, SIGHUP and SIGINT listeners only in `runAsScript`: set `signalled`, release a pending undelivered result (bounded by 1 s) before `closeAll` with a 4.5 s cleanup deadline, cap the exit at 5 s, skip stdout and `ack`, and exit at once on a second signal
- [x] 5.4 Test that `main()` in-process installs no listeners: `process.listenerCount('SIGTERM')` is the same before and after a `main()` call

## 6. C3 process tests (design D5)

- [x] 6.1 Add a fixture repository whose verify command writes its pgid and sleeps, with a variant that traps SIGTERM
- [x] 6.2 Survival and reap test: SIGKILL the entry and see that the group is still alive; then a second `Stop` run sees that the old group was gone before its own command started (the reap part fails before the change)
- [x] 6.3 SIGTERM test: the group is gone, the lock is released, the exit is 0 with empty stdout within 6 s, and a trapping command is SIGKILLed

## 7. Documentation (C1, C2, C3, design D1 and D6)

- [x] 7.1 In `skills/agent-harness-hook-runtime/SKILL.md`: document `stale` as an addition to the Handler interface and update the line on how results are joined; replace the "superseded result is not delivered" line; add the reap and the signal handling, with the older-copy caveat
- [x] 7.2 In `skills/agent-harness-verify-gate/SKILL.md`, add the stale notice to the "Turn end" bullets of the Triggers section, and add "Limits" entries: the C1 failure identity (a changed tail is a new failure, the count is per session, the 10-block backstop), manual runs in both directions, and pid reuse within 24 h

## 8. Versions, build and checks

- [x] 8.1 Bump `src/hook-runtime/tool.json` to 0.1.4 and `src/verify-gate/tool.json` to 0.2.2, then run `pnpm run harness:update`
- [x] 8.2 Run `pnpm run check`, `python3 scripts/skills.py validate`, `claude plugin validate .`, `python3 -m unittest discover -s scripts -p 'test_*.py'` and `openspec validate settle-turn-end-differences --strict`; all pass
- [ ] 8.3 Sync the delta specs into `openspec/specs/` and archive the change in this PR (`openspec archive settle-turn-end-differences`), then re-run `openspec validate --strict`
- [x] 8.4 Draft the PR report: each acceptance criterion with its evidence, the C1/C2/C3 findings and decisions, the changed contracts and versions, the reversed test, CI testing Ubuntu only, and the proposed follow-up tasks (parallel verify commands; reaping for manual CLI runs)
- [ ] 8.5 After the merge, confirm that the Pages catalog lists `hook-runtime` 0.1.4 and `verify-gate` 0.2.2 (issue #62 acceptance criterion)
