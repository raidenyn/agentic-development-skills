## Context

The verify gate replaced veles's turn-end hook (`openspec/specs/verification-stop-hook/spec.md` at `a86633dc`). Issue #62 lists three ways the new turn end differs. The owner decided each one on 2026-11-26 from the findings in `brainstorm.md`:

- **C1, failure identity**: kept as built and documented.
- **C2, superseded OpenCode result**: now delivered as a notice.
- **C3, leftover process groups**: veles's behaviour is brought back. Recorded groups are reaped at the next run, and the Claude Code entry handles SIGTERM.

### Current state

- **Failure identity.** `failureKey` (`src/verify-gate/lib/gate.mts`) hashes the argv, exit kind, code, signal and normalized tail. The ledger `blocks.json` counts charges per key and per session, and a pass never clears it. The limits are `maxBlocks` (at most 3) per key and `SESSION_BLOCKS = 10` per session.
- **OpenCode turn ends** (`src/hook-runtime/lib/opencode-adapter.mts`, `turnEnd`).
  - Turn ends are queued per session in a slot and run one at a time.
  - Each queued entry records the session's generation, which goes up on every `session.execution.started`.
  - A result whose generation is stale is superseded. Today it is not delivered, and `release` refunds its charge.
  - The verify-gate block text is `verify: <cmd> failed (attempt n of m). Fix the failure before ending the turn: …` (`src/verify-gate/handler.mts`).
- **The supervisor** (`src/hook-runtime/lib/supervisor.mts`).
  - It spawns every handler process with `detached: true`, so each process is its own group.
  - While it holds a gate lock for a worker, it appends every new pgid to the lock file (`updateGateLock`). This covers the verify command.
  - When a worker generation ends, it kills that generation's groups with `killGroups`: SIGTERM, SIGKILL after up to 5 s, then up to 5 s more polling to confirm. Only after that does it release the generation's locks.
  - `onLockAcquire` checks `isActive(requestId)` once and then calls the synchronous `acquireGateLock`.
  - A pending entry's `ctx` carries the event `deadline`. `cleanupDeadline` exists only inside `handle()`.
  - `HandlerPool.close()` retires every worker without a deadline.
- **Gate locks.** `acquireGateLock` (`src/shared/lib/state.mts`) treats a lock as free when it is released or when its holder `pid` is dead. It takes over a dead holder's lock without looking at its `pgids`. The newest lock file is never pruned.
- **The Claude Code entry** (`src/hook-runtime/claude.mts`).
  - It runs as a short-lived process per hook event and installs no signal handlers.
  - The handler pools are local to `main()`.
  - For another worktree of the same repository, `main()` imports that copy's `claude.mjs` and calls its `main()`.
  - A spike on Linux showed that a detached group survives both SIGKILL and SIGTERM of its parent.
  - Claude Code kills a hook at its timeout (1,800 s for `Stop`), on interrupt, and on exit.

### Constraints from the task

- The handler interface may change only additively. The vendored tool layout and the skill names are frozen.
- Edit only `src/`. Bump each changed tool's version once, run `pnpm run harness:update`, and release through the Pages catalog.
- Every behaviour that is brought back needs a test that fails before the change.
- C3 needs a test that shows whether a group outlives a killed Claude Code hook process.

## Goals / Non-Goals

**Goals:**

- **C1.** Add a "Limits" entry to the verify-gate skill that explains the failure identity and why it differs from veles. The PR proposes the follow-up task "Run several verify commands in parallel and key failures on the failing command".
- **C2.** A superseded OpenCode turn-end result that is the newest settled result for its session reaches the user as a notice.
  - The notice does not resume the agent and does not ask it to act.
  - The notice says the result is from the previous turn and was not counted.
  - The charge is still refunded.
- **C3.**
  - A hook run that finds the newest lock held by a dead process terminates that holder's recorded groups before it runs anything.
  - The Claude Code hook process kills its groups and releases its locks on SIGTERM, SIGHUP or SIGINT.

**Non-Goals:**

- Changing `failureKey`, the ledger or the limits.
- Reaping groups spawned outside a gate lock, such as the content key's short git calls. They are not recorded and they end within their own timeouts.
- Reaping in, or recording pgids for, `verify-gate run` from the CLI (`localLock`). This is listed in "Limits" and is a possible follow-up.
- OpenCode signal handling. The plugin runs inside the host process, which owns signals. The reap at the next run covers a killed OpenCode server.
- Any change to a frozen contract, or any change to the handler interface that is not additive.

## Decisions

### D1. C1 is documentation only

The verify-gate "Limits" gains one entry. It says three things:

- A changed output tail is a new failure.
- The count is per session and is not reset by a pass.
- The 10-block backstop bounds the worst case. A command whose tail carries noise that the normalizer misses can spend the backstop on one problem.

The PR proposes the parallel-commands follow-up task and opens no issue unless the owner asks.

**Alternatives.** The owner rejected two others:

- A command-printed identity line, rejected in favour of the follow-up.
- Resetting the count on a pass, rejected because the owner kept the per-session count.

### D2. C2 delivers the newest superseded result as a stale notice

**Additive handler result field.** A turn-end result may carry `stale?: string`, the text to show if the result is superseded. It has these properties:

- It is optional.
- It is ignored by Claude Code, which never supersedes.
- The runtime keeps it. `validate()` in `runtime.mts` copies a string `stale` from `block` and `context` results. `dispatch` joins those into `DispatchResult.stale` with `JOIN`, in handler-name order, the way it joins `context`. The types in `src/shared/lib/handler.types.mts` gain the field.
- A handler that does not set it behaves as today: its superseded result is dropped.

This is the only change to the handler interface, which is provisional. It is additive. The Handler interface section of the hook-runtime skill marks it as an addition, the same way it marks `ack` and `release`, and it updates the line on how results are joined. The PR names it as the one interface change.

**What verify-gate sets.** `turnEnd` in `src/verify-gate/handler.mts` sets `stale` on every failing turn-end result: a block, a limit notice or a busy-ledger notice. The text is fixed:

`verify: the check at the end of the previous turn failed and was not counted; the next turn end checks again. <cmd> failed: <body>`

It carries no attempt count and no instruction to act. A passing result sets nothing.

**What the adapter does** in `turnEnd` of the OpenCode adapter when the entry's generation is stale:

- It drops the result, as today, when any of these is true:
  - the plugin is disposed;
  - another turn end is queued in the session's slot, so that run reports anyway;
  - `merged.stale` is empty.
- Otherwise it calls `ctx.session.synthetic({ sessionID, text: merged.stale, resume: false })`.
- In every case it then calls `release`. A superseded block never counts.

**Why only the newest.** When turn B is already queued behind a superseded run A, B's result is the current one and is delivered. Showing A as well would report a failure that B may have fixed. The case worth showing is the one with no later turn end yet. There the user has started a new turn, and nothing else says the previous turn's check failed until that turn ends.

**Tests** (`tests/agent-harness/opencode-adapter.test.mjs`, `tests/agent-harness/verify-handler.test.mjs`):

- **Changed.** The existing test "C starts but has not ended when B's run settles: nothing is delivered and B's release is called" asserts the behaviour the owner reversed. Its scripted handler gains `stale`, and the test then expects exactly one `resume: false` synthetic with B's `stale` text, plus releases `[1, 2]`. The PR names this as an owner-decided reversal.
- **Unchanged.** "Only the latest current result is delivered" and "turn B fixes the tree while A's slow run fails" keep their assertions, because a later turn end is queued in both.
- **New, adapter.** One slow failing run and a new `session.execution.started` with no end. The test expects one `resume: false` synthetic with the exact `stale` text, and `release` called. It fails before the change.
- **New, adapter.** The same, with a handler that sets no `stale`. Nothing is delivered.
- **New, adapter: queued.** A slow run A sets `stale`, and turn B is queued behind it. Only B's block is delivered, and A is released. This proves the "later turn end queued" rule, which the two unchanged tests cannot prove because their handlers set no `stale`.
- **New, runtime** (`runtime.test.mjs`). `{ block, stale }` from a handler comes out as `merged.stale`, and two handlers' `stale` texts are joined in name order. Both fail before the change.
- **New, verify handler.** A failing turn end returns `stale` with the exact text. A pass returns none.

**Alternatives.**

- Prefixing the block text in the adapter. Rejected because it keeps "Fix the failure…" and an attempt count that is refunded.
- Delivering every superseded result. Rejected because it repeats stale failures.

### D3. C3 reaps a dead holder's recorded groups at lock acquisition

**The new helper.** `src/shared/lib/state.mts` gains `staleGroups(dir, { maxAgeMs }): number[]`.

- It reads the newest `gate.lock.<n>` and returns its `pgids` when all of these hold:
  - the lock is not `released`;
  - its `pid` is dead;
  - its `at` is less than `maxAgeMs` ago.
- Otherwise it returns `[]`.
- It is read-only and synchronous. `acquireGateLock` keeps its signature and its behaviour.

**What `onLockAcquire` does.** The supervisor's `onLockAcquire` becomes asynchronous:

1. Call `staleGroups(dir, { maxAgeMs: REAP_MAX_AGE_MS })`, with 24 h as the plan's default. Keep only the groups this process can signal: `process.kill(-pgid, 0)` succeeds. An EPERM group is not ours and is skipped, unlike in `groupAlive`.
2. If any remain, `await killGroups(live, { cleanupDeadline })`.
   - `cleanupDeadline` is the `ctx.deadline` of the first pending entry for this `requestId` that has a `ctx`. `ack` and `release` requests share the `requestId` but are stored with `ctx: null`, and they take the ledger lock through `withLedger`.
   - When no entry has a `ctx`, the deadline is a fixed bound of now + 2 s.
   - The reap passes a new opt-in option, `killGroups(live, { cleanupDeadline, confirmUntil: cleanupDeadline })`. Only the reap uses it, and existing callers (`retire`, `cleanup`) keep today's schedule and confirmation window. On OpenCode a shorter confirmation there would turn slow-dying groups into survivors whose lock is never released.
   - With `confirmUntil`, the loop ends at that time, but SIGKILL is always sent before it returns if it has not gone out yet. A late reap therefore never leaves a SIGTERM-ignoring group alive. This bounds the reap by the event, which matters for `session.start` and proofs, whose budgets are short.
3. After the await, check `this.dead || !this.isActive(requestId)` again. If the event has ended, reply with an error and do not acquire. This is the only way a reap that outlives its event cannot leave a lock held for good.
4. If any reaped group is still alive, reply `{ lockId: null }`. `waitLock` treats this as a held lock and keeps polling until its own deadline, so a run never starts beside an orphan.
5. Otherwise call `acquireGateLock(dir)` as today.

**Why at acquisition, in the supervisor.**

- The supervisor owns `killGroups` and the pgid bookkeeping.
- The next lock holder is the process about to touch the tree.
- veles's rule was the same: the next process to get the lock terminates a dead run's groups before planning anything.

**Why the age bound and the EPERM skip.** A dead holder's recorded pgid can be reused, and macOS wraps pids at 99,999.

- A reused pgid owned by another user would always look alive to `groupAlive`, which would make the repo report "busy" for good. The EPERM skip prevents that.
- A same-user reuse long after the death could hit an unrelated job. The age bound limits how long a dead lock's pgids are trusted.
- 24 h covers an orphan that outlives the host's 1,800 s timeout by hours. The remaining risk goes in "Limits".

**Racing acquirers.** Two acquirers that race may both signal the same groups, which is harmless. `acquireGateLock` still lets only one of them take the lock.

**Alternatives.**

- A separate `running.json`, which would duplicate the lock record.
- `PR_SET_PDEATHSIG`, which works on Linux only.
- An age bound of 1,800 s. It would miss orphans found by a run hours later.

### D4. C3 handles SIGTERM, SIGHUP and SIGINT in the Claude Code entry

**Internal plumbing**, none of which is part of the handler interface:

- `HandlerPool.close({ cleanupDeadline } = {})` passes the deadline to each worker's `retire`.
- `createRuntime` returns a `close(opts)` that closes its pools.
- `claude.mts` keeps a module-level set of live runtimes. `main()` adds its runtime, and the module exports `closeAll(opts)`.

**Listeners.**

- **Where they live.** The listeners are installed only in `runAsScript`, never in `main()`. Tests that call `main()` in-process gain no listeners.
- **Registry lifetime.** A runtime stays registered until the process exits, not only until its event ends. The `ack` and `release` closures that `runAsScript` calls after writing stdout still use its workers and the ledger lock.
- **Delegated copy.** `main()` stores the imported module of a delegated worktree copy in a module-level variable, so the listener can reach its `closeAll`.
- **First signal.** The listener calls `closeAll({ cleanupDeadline: now + 4500 })`, and the delegated copy's `closeAll` too when it exports one. SIGKILL goes out at about 3.5 s, because `killGroups` sends it 1 s before `cleanupDeadline`. The pool close keeps today's confirmation window, so an outer cap exits the process at 5 s whatever happens. A group still dying then is reaped by the next run (D3). The listener then exits 0 and prints nothing.
- **No output after a signal.** The listener sets a module-level `signalled` flag. When it is set, `runAsScript` skips the stdout write and `ack`, so a failure notice from the rejected dispatch is never printed.
- **Undelivered result.** `runAsScript` stores the result `main()` returned in a module-level `pending` until it is written. If `pending` is set, the listener awaits `pending.release()`, bounded by 1 s, *before* `closeAll`, because `release` goes through `blockCallback`, which does nothing once `retire` has marked the worker dead. A charge made by a handler that is terminated before it returns stays charged, as the existing "Charge before delivery" rule says. The listener's logic is an exported `onSignal({ pending, closeAll, exit })`, so it can be unit-tested without installing listeners.
- **Second signal.** It exits at once.
- **Older copies.** An older copy without `closeAll` is covered by the reap at the next run. The skill documents this.

**Why.** SIGTERM is the normal way a host stops a hook on interrupt or exit. Cleaning up then means an orphan does not run until the next check. If the host follows with SIGKILL before the close ends, D3 covers the rest.

### D5. Tests for C3

The tests live in `tests/agent-harness/`, are written in `.mjs`, and run on Node 22.0.0. Every spawned process gets its own group and is killed in `after` hooks.

1. **Survival and reap** (the task's C3 criterion).
   - **Fixture.** A repository whose verify command writes its pgid to a file and then sleeps.
   - **Survival.** Start `claude.mjs` on a `Stop` event, wait for the pgid file, SIGKILL the entry, and assert that `kill -0 -<pgid>` still succeeds. This records the finding and passes both before and after the change, because SIGKILL cannot be handled.
   - **Reap.** A second `Stop` run in the same repository uses a verify command that first records whether `-<old pgid>` is alive and then exits 0. The test asserts the old group was already gone when that command started. This fails before the change.
2. **SIGTERM.** The same fixture, with a command that traps SIGTERM. Send SIGTERM to the entry. Assert the group is gone and the lock file is `released` within 6 s. This fails before the change.
3. **Reap outlives its event.** A supervisor-level test:
   - **Setup.** A stale lock with a group that ignores SIGTERM, and a test handler that starts `ctx.lock.acquire(dir)` without awaiting it and returns at once. The handler attaches `.catch()` to the acquire and writes the error to a file the test reads, because an unhandled rejection would crash the worker and hide the reply. The event ends normally and the worker stays alive.
   - **Asserts.** The pending acquire replies with an error, no unreleased lock file is left, and the SIGTERM-ignoring group ends up dead, because SIGKILL is always sent under `confirmUntil`.
4. **`staleGroups` unit tests.** Cover a released lock, a live holder, a dead holder with pgids, a dead holder older than `maxAgeMs`, and no locks.

CI runs on Ubuntu only, so the macOS reasoning (pid wrap) is untested. The PR says so.

### D6. Specs, versions and documentation

**Spec deltas** for the specs phase:

- `openspec/specs/agent-hook-runtime/spec.md`:
  - **MODIFIED** the superseded-result requirement and its scenario "A later turn fixes the tree": a stale notice is delivered when no later turn end is queued.
  - **ADDED** to the supervisor requirement: the reap at lock acquisition and the signal handling in the Claude Code entry.
  - **ADDED** the optional `stale` result field.
- `openspec/specs/verify-gate-triggers/spec.md`:
  - **MODIFIED** the scenario "A superseded block does not count": it stays uncounted and is now shown as a stale notice.
  - **ADDED** the `stale` text of a failing turn end.

**Versions.** `hook-runtime` goes from 0.1.3 to 0.1.4: supervisor, runtime, Claude entry, OpenCode adapter and shared state. `verify-gate` goes from 0.2.1 to 0.2.2: handler and the bundled `lib/state.mts`. Then run `pnpm run harness:update`.

**Skill docs.**

- **hook-runtime skill:**
  - the Handler interface section gains `stale`;
  - the "superseded result is not delivered" line becomes the new rule;
  - the termination paragraph gains the reap and the signal handling, with the older-copy caveat.
- **verify-gate "Limits"** gains these entries:
  - C1, the failure identity;
  - manual runs, in both directions: a killed `run` from the CLI is not reaped, and a `run` that takes over a dead hook's lock does not reap it;
  - pid reuse within the 24 h bound.

## Risks / Trade-offs

- **[Risk] Pid reuse.** A dead holder's pgid may belong to an unrelated same-user group by the time it is reaped.
  - **Mitigation:** reap only from the newest unreleased lock of a dead holder that is younger than 24 h, and skip EPERM groups.
  - **Remaining:** a same-user pid reuse inside 24 h. It is documented.
- **[Risk] An unkillable group, for example one stuck in the kernel.**
  - **Mitigation:** the lock is not taken, and the run reports contention at its deadline.
- **[Risk] A reap that outlives its event.**
  - **Mitigation:** the reap is bounded by `ctx.deadline`, and activity is checked again before acquiring (D3 step 3, test D5.3).
- **[Risk] The host sends SIGKILL soon after SIGTERM.**
  - **Mitigation:** D3 reaps at the next run.
- **[Trade-off] A stale notice lands in the user's new turn (C2).**
  - **Mitigation:** the text says the result is from the previous turn, was not counted, and will be checked again, and it gives no instruction.
- **[Risk] Changing an existing test.**
  - **Mitigation:** only the test that asserts the reversed C2 behaviour changes, and the PR names it.

## Migration Plan

- The change ships through the normal release to the Pages catalog, and repos update through the skills' Update procedure.
- `stale` is optional, so other handlers and older copies are unaffected.
- No on-disk state changes format.
- Rollback: install the previous tool versions.

## Open Questions

- None blocking. The plan fixes `REAP_MAX_AGE_MS` (24 h by default).
