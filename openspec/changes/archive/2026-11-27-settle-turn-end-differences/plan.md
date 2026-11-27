# Settle Turn-End Differences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settle issue #62's three turn-end differences from veles. C1 is documented. C2 shows the newest superseded OpenCode result as a stale notice. C3 reaps a dead hook's process groups and cleans up on signals in the Claude Code entry.

**Architecture:** A handler result gains an optional `stale` text. The runtime keeps it, verify-gate fills it, and the OpenCode adapter sends it when a superseded result is the newest one. The supervisor reads the dead holder's `pid` and `pgids` from the gate lock record and kills those groups before it takes the lock. `claude.mjs` closes every runtime it started when it gets a signal.

**Tech Stack:** Strict TypeScript in `src/` (erasable syntax only), built to `.mjs` by `pnpm run build`. Tests are `node:test` `.mjs` files in `tests/agent-harness/`, which import the built assets.

**Spec:** `openspec/changes/settle-turn-end-differences/design.md` (decisions D1–D6) and `specs/agent-hook-runtime/spec.md` and `specs/verify-gate-triggers/spec.md` in the same folder.

## Global Constraints

- Edit only `src/`, never `skills/*/assets/` or `.agents/harness/`. Run `pnpm run build` before any test run, because tests import the built `.mjs`.
- Tests stay `.mjs`, must run on Node 22.0.0, and must not import `.mts`.
- The handler interface changes only additively: the `stale` field. No frozen contract changes.
- Bump versions once: `hook-runtime` 0.1.3 → 0.1.4 and `verify-gate` 0.2.1 → 0.2.2. Then run `pnpm run harness:update`.
- The stale text is exactly `verify: the check at the end of the previous turn failed and was not counted; the next turn end checks again. <cmd> failed: <body>`.
- Reap numbers: `REAP_MAX_AGE_MS = 24 * 60 * 60 * 1000`; the fallback deadline is now + 2000 ms; the signal cleanup deadline is now + 4500 ms; the outer exit cap is 5000 ms.
- Commits follow Conventional Commits and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never change an existing test just to make it pass. The one exception is the C2 reversal in Task 3, and the PR names it.
- A test marked **guard** passes before the change too: it pins behaviour that must not break. Every other new test must fail before the change.

## Review Focus

1. **A stale lock whose `pgids` field is missing or not an array** (an older lock format, or a partial write). `staleGroups` returns `[]`. Test it in Task 4.
2. **A lock file holding malformed JSON.** `staleGroups` returns `[]` and does not throw. Test it in Task 4.
3. **A recorded pgid that no longer exists** (ESRCH). It is skipped without a signal, and the lock is taken at once. Test it in Task 5.
4. **SIGTERM before the runtime exists** (during stdin read). The listener's `closeAll` with an empty registry still exits 0 with empty stdout. Test it in Task 7.
5. **Two handlers where only one sets `stale`.** Only that text is in `merged.stale`, and no empty join fragments appear. Test it in Task 1.

---

### Task 1: Keep and join `stale` in the runtime

**Files:**
- Modify: `src/shared/lib/handler.types.mts` (`HandlerResult` and `DispatchResult`)
- Modify: `src/hook-runtime/lib/runtime.mts` (`validate()` and `Validated`, the `dispatch` merge)
- Test: `tests/agent-harness/runtime.test.mjs`

**Interfaces:**
- Produces:
  - `HandlerResult` variants `{ context: string; stale?: string }` and `{ block: string; stale?: string; ack?; release? }`.
  - `DispatchResult.stale?: string`, which joins the handlers' `stale` texts with `JOIN` in handler-name order.

- [ ] **Step 1: Write failing tests**

  ```js
  test('keeps stale texts and joins them in name order', async () => {
    // handlers 'a' returns {block:'A', stale:'sa'}, 'b' returns {context:'B', stale:'sb'} at turn.end
    assert.equal(merged.stale, 'sa' + JOIN + 'sb'); // read JOIN the way the existing merge tests do
  });
  test('only one handler sets stale', async () => {
    // 'a' {block:'A', stale:'sa'}, 'b' {context:'B'}
    assert.equal(merged.stale, 'sa');
  });
  test('a non-string stale is ignored', async () => {
    // 'a' {block:'A', stale: 5}
    assert.equal(merged.stale, undefined);
    assert.equal(merged.block, 'A');
  });
  ```

- [ ] **Step 2:** Run `pnpm run build && node --test tests/agent-harness/runtime.test.mjs`. Expected: the first two tests FAIL (`merged.stale` is undefined). "a non-string stale is ignored" is a **guard** and passes.
- [ ] **Step 3: Implement.**
  - In `validate()`, copy `result.stale` to `out.stale` when it is a string, for both `block` and `context` kinds.
  - In `dispatch`, collect the `stale` texts in name order and set `out.stale` when any exist.
  - `stale` is not a result kind. Do not add it to `KINDS`.
- [ ] **Step 4:** Run the same command. Expected: all tests in `runtime.test.mjs` PASS.
- [ ] **Step 5: Commit.** `feat: keep a handler's stale text through dispatch`

### Task 2: verify-gate sets `stale` on a failing turn end

**Files:**
- Modify: `src/verify-gate/handler.mts` (`turnEnd`)
- Test: `tests/agent-harness/verify-handler.test.mjs` (use the existing `fire`, `turnEnd`, `verifyRepo` helpers)

**Interfaces:**
- Consumes: `HandlerResult.stale` from Task 1.
- Produces: every failing turn-end result (block, limit notice, busy-ledger notice) carries `stale`. The background notice, passing, skipped and contended results carry none.

- [ ] **Step 1: Write failing tests**, next to "turn end failure blocks with attempt 1 of 3":

  ```js
  test('a failing turn end carries the stale text', async () => {
    // same setup as 'turn end failure blocks with attempt 1 of 3'
    assert.match(result.stale, /^verify: the check at the end of the previous turn failed and was not counted; the next turn end checks again\. sh .*verify\.sh failed: /);
    assert.match(result.stale, /E101 something broke/);
    assert.doesNotMatch(result.stale, /attempt|Fix the failure/);
  });
  test('the limit notice carries the stale text', async () => { /* 4th turn end on one failure */ assert.ok(result.context && result.stale); });
  test('the busy-ledger notice carries the stale text', async () => { /* same setup as the existing busy-ledger test near verify-handler.test.mjs:783 */ assert.ok(result.context && result.stale); });
  // guards (pass before the change):
  test('a passing turn end carries no stale', async () => { /* passing command */ assert.equal(result?.stale, undefined); });
  test('the background notice carries no stale', async () => { /* turnEnd({ background: 1 }) failing, as in the existing background test */ assert.equal(result.stale, undefined); });
  test('a skipped or contended turn end carries no stale', async () => { /* no-change shortcut; held gate lock */ });
  // C1 guards: pin today's identity rule (spec 'Failure identity')
  test('a changed count in the tail is a new failure', async () => {
    // r.fail prints '3 failed'; three blocked turn ends (touch the tree between them with setTouch so the shortcut does not skip)
    // then r.fail prints '2 failed'
    assert.match(result.block, /attempt 1 of 3/);
  });
  test('a pass does not reset the count', async () => {
    // three blocks on one failure; r.pass and a tree change, one passing turn end; r.fail the same failure, tree change
    assert.match(result.context, /still failing after 3 blocks/);
  });
  ```

- [ ] **Step 2:** Run `pnpm run build && node --test tests/agent-harness/verify-handler.test.mjs`. Expected: the three `stale`-carrying tests FAIL, and the guards PASS.
- [ ] **Step 3: Implement.** In `turnEnd`, after a failed `runGate`, build ``const stale = `verify: the check at the end of the previous turn failed and was not counted; the next turn end checks again. ${cmd} failed: ${body(r)}` `` and add it to every failing return. The contended return carries none.
- [ ] **Step 4:** Run the same command. Expected: all tests PASS.
- [ ] **Step 5: Commit.** `feat: give a failing verify turn end a stale text`

### Task 3: OpenCode delivers the newest superseded result

**Files:**
- Modify: `src/hook-runtime/lib/opencode-adapter.mts` (`turnEnd`, around the supersede check)
- Test: `tests/agent-harness/opencode-adapter.test.mjs` (`scripted`, `plugin`, `turn` helpers)

**Interfaces:**
- Consumes: `DispatchResult.stale` from Task 1.
- Produces: the superseded branch sends `ctx.session.synthetic({ sessionID, text: merged.stale, resume: false })` when three conditions hold: `!disposed`, `slot.queue.length === 0`, and `merged.stale` is non-empty. It always calls `release` afterwards.

- [ ] **Step 1: Extend `scripted`** so `make(n)` may return `stale`. The handler already returns `out` as it is, so check that `stale` passes through.
- [ ] **Step 2: Write failing tests:**

  ```js
  test('a superseded result with no later turn end is shown as a stale notice', async () => {
    const s = scripted({ slow: { 1: 300 }, make: () => ({ block: 'A', stale: 'stale A' }) });
    // turn A; wait for A started; emit session.execution.started (no end); wait for releases [1]
    assert.deepEqual(p.calls.synthetic, [{ sessionID: ROOT, text: 'stale A', resume: false }]);
    assert.deepEqual(s.releases, [1]);
    assert.deepEqual(s.acks, []);
  });
  test('a superseded result with a queued turn end is dropped even with stale', async () => {
    // make(n) => ({ block: `block ${n}`, stale: `stale ${n}` }); turn A, then turn B while A runs
    assert.deepEqual(p.calls.synthetic, [{ sessionID: ROOT, text: 'block 2', resume: true }]);
    assert.deepEqual(s.releases, [1]);
  });
  test('a superseded result without stale sends nothing', async () => { /* make => {block:'A'}; new turn started, no end */ assert.deepEqual(p.calls.synthetic, []); });
  ```

- [ ] **Step 3: Update the existing test** "C starts but has not ended when B's run settles…". Change it to `make: (n) => ({ block: \`block ${n}\`, stale: \`stale ${n}\` })`, rename it to "…: only B's stale notice is sent and both are released", and expect `p.calls.synthetic` to equal `[{ sessionID: ROOT, text: 'stale 2', resume: false }]`. This is the owner-decided reversal, and the PR names it.
- [ ] **Step 4:** Run `pnpm run build && node --test tests/agent-harness/opencode-adapter.test.mjs`. Expected: the first new test and the updated one FAIL. "queued turn end is dropped" and "without stale sends nothing" are **guards** and PASS.
- [ ] **Step 5: Implement the branch.**
  - `turnEnd` has to see the slot. Pass `slot` from `drain` into `turnEnd(sid, entry, slot)`.
  - Send with `within(..., CALLBACK_MS)`, then call `callBounded(merged.release)`.
- [ ] **Step 6:** Run the same command. Expected: all adapter tests PASS, including "only the latest current result is delivered" and "turn B fixes the tree…" unchanged.
- [ ] **Step 7: Commit.** `feat: show the newest superseded OpenCode turn-end result as a notice`

### Task 4: `staleGroups` in shared state

**Files:**
- Modify: `src/shared/lib/state.mts`
- Test: `tests/agent-harness/state.test.mjs`

**Interfaces:**
- Produces: `export function staleGroups(dir: string, { maxAgeMs }: { maxAgeMs: number }): number[]`.
  - It reads only the newest `gate.lock.<n>`, using the existing `listLocks`, `readLock` and `pidAlive`.
  - It returns the integer `pgids` when the lock has `released !== true`, a dead `pid`, and `Date.now() - at < maxAgeMs`.
  - In every other case it returns `[]`. It never throws.

- [ ] **Step 1: Write failing tests.** For each case, write `gate.lock.1` by hand in a temp dir. Use a dead pid from a child that has already exited, for example `spawnSync('true').pid`.
  - released → `[]`
  - live holder (`process.pid`) → `[]`
  - dead holder with `pgids: [111, 222]` and `at: Date.now()` → `[111, 222]`
  - dead holder with `at: Date.now() - 25 * 3600e3` → `[]`
  - no lock files → `[]`
  - `pgids` missing or `"x"` → `[]` (Review Focus 1)
  - malformed JSON → `[]` (Review Focus 2)
  - with `gate.lock.1` dead and `gate.lock.2` released, only the newest counts → `[]`
- [ ] **Step 2:** Run `pnpm run build && node --test tests/agent-harness/state.test.mjs`. Expected: FAIL (`staleGroups` is not exported).
- [ ] **Step 3: Implement** `staleGroups` as specified.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: report a dead gate-lock holder's recorded groups`

### Task 5: The supervisor reaps at lock acquisition

**Files:**
- Modify: `src/hook-runtime/lib/supervisor.mts` (`killGroups`, `onLockAcquire`, and the message switch at `case 'lock.acquire'`)
- Test: `tests/agent-harness/supervisor.test.mjs` (`proxy`, `writeTool`, `rt`, `groupAlive` helpers)

**Interfaces:**
- Consumes: `staleGroups` from Task 4.
- Produces:
  - `killGroups(pgids, { cleanupDeadline?, confirmUntil? })`. With `confirmUntil`, the loop ends at that time, and SIGKILL is always sent before it returns if it has not gone out yet. Without it, the behaviour is unchanged.
  - `export const REAP_MAX_AGE_MS = 86_400_000`.
  - `onLockAcquire` becomes `async` and follows design D3 steps 1–5.

- [ ] **Step 1: Write failing `killGroups` tests.**
  - Spawn `sh -c 'trap "" TERM; sleep 30'` detached, and call `killGroups([pgid], { cleanupDeadline: Date.now() + 10_000, confirmUntil: Date.now() + 300 })`. Assert that it resolves within 1 s and that `groupAlive(pgid)` is false within 500 ms of that, because SIGKILL was sent before it returned. Today the same call waits about 5 s for SIGKILL.
  - Also assert that a call without `confirmUntil` keeps today's timing (an existing test covers this; leave it unchanged).
- [ ] **Step 2: Write failing reap tests.** Each test seeds a lock dir with `gate.lock.1 = { pid: <dead>, at: Date.now(), pgids: [pgid] }`.
  - **The next acquire reaps.** A sleeping detached group is recorded. A proxy handler calls `await ctx.lock.acquire(dir)` and returns `{context: 'ok'}`. Assert that the group is dead and a new released-at-end lock `gate.lock.2` exists.
  - **The event ended during the reap.** The group traps TERM. The handler starts `ctx.lock.acquire(dir).then(() => write(file, 'ok'), (e) => write(file, String(e.message)))` without awaiting it and returns `{context: 'ok'}` at once. The event deadline is 300 ms. Assert that the file holds an error, that no `gate.lock.<n>` with `released !== true` and a live pid remains, and that the group is dead.
  - **A vanished group** (**guard**). `pgids: [<exited pid>]`. The acquire succeeds without delay, in under 200 ms (Review Focus 3).
- [ ] **Step 3:** Run `pnpm run build && node --test tests/agent-harness/supervisor.test.mjs`. Expected: the new tests FAIL.
- [ ] **Step 4: Implement `confirmUntil`** in `killGroups`.
- [ ] **Step 5: Implement the reap** in `onLockAcquire`:
  - Keep only the groups where `process.kill(-pgid, 0)` does not throw. EPERM and ESRCH are both skipped.
  - Take the deadline from the first `this.pending` value with `requestId` and a `ctx`, using `ctx.deadline`. Otherwise use `Date.now() + 2000`.
  - After the await, if `this.dead || !this.isActive(requestId)`, reply `{ error: 'the event has ended' }`.
  - Wrap the whole async body in try/catch and reply `{ error }` on a throw. `onMessage` does not catch the promise, and an unhandled rejection exits the Claude Code entry in the middle of the event.
  - If any group is still alive, reply `{ lockId: null }`.
  - Otherwise acquire as today.
- [ ] **Step 6:** Run the same command. Expected: all supervisor tests PASS.
- [ ] **Step 7: Commit.** `feat: reap a dead hook's process groups before taking the gate lock`

### Task 6: Pool and runtime close with a deadline

**Files:**
- Modify: `src/hook-runtime/lib/supervisor.mts` (`HandlerPool.close`; `WorkerHandler.close` in the interface near line 36; the `close: () => pool.close()` returned by `startWorker` near line 584, which must pass its options through)
- Modify: `src/hook-runtime/lib/runtime.mts` (the `createRuntime` return value)
- Test: `tests/agent-harness/supervisor.test.mjs`

**Interfaces:**
- Produces:
  - `HandlerPool.close({ cleanupDeadline }: { cleanupDeadline?: number } = {}): Promise<void>`, which passes the deadline to each `retire('closed', { cleanupDeadline })`.
  - The runtime gains `close(opts?: { cleanupDeadline?: number }): Promise<void>`, which closes every handler that has a `close` and ignores the rest.

- [ ] **Step 1: Write a failing test.** A runtime whose proxy handler spawns `sh -c 'trap "" TERM; sleep 30'` through the supervisor and awaits it. While that runs, call `runtime.close({ cleanupDeadline: Date.now() + 1500 })`. Assert that the close resolves and that the group is dead within 2 s, because SIGKILL goes out about 1 s before the deadline.
- [ ] **Step 2:** Run `pnpm run build && node --test tests/agent-harness/supervisor.test.mjs`. Expected: FAIL (`runtime.close` is not a function).
- [ ] **Step 3: Implement** both `close` methods.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: close a runtime's workers with a cleanup deadline`

### Task 7: Signal cleanup in the Claude Code entry

**Files:**
- Modify: `src/hook-runtime/claude.mts`
- Create: `tests/agent-harness/claude-signals.test.mjs`
- Test fixture: no new folder. Use `verifyRepo`, `installBoth` and `setConfig` from the helpers, and write the scripts into the git dir the way `VERIFY_SH` is. `verify.sh` runs `echo $$ > "$PGID_FILE"; sleep 30`, and `sh` leads its own group, so `$$` is the pgid. `verify-trap.sh` does the same after `trap "" TERM`.

**Interfaces:**
- Consumes: `runtime.close` from Task 6.
- Produces, all module-level in `claude.mts`:
  - `const runtimes = new Set<{ close(opts?): Promise<void> }>()`, which `main()` adds to after `createRuntime` and never removes from.
  - `let delegate: { closeAll?: (opts?) => Promise<void> } | null`, which is set where `main()` imports another checkout's entry.
  - `let signalled = false`.
  - `export async function closeAll(opts?: { cleanupDeadline?: number }): Promise<void>`, which closes every runtime and calls `delegate?.closeAll?.(opts)`, all settled.
  - `let pending: { release: (() => Promise<void>) | null } | null`, which `runAsScript` sets after `main()` returns and clears once the result is written.
  - `export async function onSignal({ pending, closeAll, exit }: { pending: { release: (() => Promise<void>) | null } | null; closeAll: (o: { cleanupDeadline: number }) => Promise<void>; exit: (code: number) => void }): Promise<void>`. It awaits `pending?.release?.()` bounded by 1000 ms, then `closeAll({ cleanupDeadline: Date.now() + 4500 })`, then `exit(0)`.
  - Listeners installed only inside `runAsScript`.

- [ ] **Step 1a: Write failing unit tests for `onSignal`.** Import the built `claude.mjs`; importing does not install listeners, because `isScript` is false.
  - With a `pending.release` and a `closeAll` that both push to `order`, assert `order` is `['release', 'close']` and `exit` was called with 0.
  - With `pending: null`, `closeAll` and `exit(0)` are called.
  - With a `release` that never resolves, `closeAll` still runs within about 1.1 s.
  - **listenerCount guard:** `process.listenerCount('SIGTERM')` is equal before and after a `main()` call (tasks 5.4).
- [ ] **Step 1b: Write failing process tests.** Each test runs the built `claude.mjs` with `spawn(process.execPath, [entry], { detached: true, env: { ...process.env, CLAUDE_PROJECT_DIR: repo, PGID_FILE } })` in a temp repo with hook-runtime and verify-gate installed and the fixture as the verify command. It writes a `Stop` payload to stdin, and an `after` hook kills every recorded group.
  - **SIGKILL leaves the group** (the C3 criterion). Wait for `PGID_FILE`, then `kill(entry.pid, 'SIGKILL')`, and assert `groupAlive(pgid)`. This test passes before and after the change and records the finding.
  - **The next run reaps.** Continue the previous test. Switch the verify command to `sh -c 'kill -0 -$OLD 2>/dev/null && echo alive > $MARK || echo gone > $MARK'` and run a second `Stop`. Assert that `$MARK` holds `gone`. This fails before the change.
  - **SIGTERM cleans up.** Wait for `PGID_FILE`, then send `SIGTERM`. Within 6 s, assert: the exit code is 0, stdout is `''`, `groupAlive(pgid)` is false, the newest `gate.lock.<n>` has `released: true`, and the session's `blocks.json` holds no charges (spec "Quiet exit").
  - **SIGTERM with a trapping command.** Use `verify-trap.sh`. The group is dead and the process exits within 5 s.
  - **SIGTERM before the payload** (Review Focus 4). Linux only: skip it when `process.platform !== 'linux'`. Spawn the entry without writing stdin, and poll `/proc/<pid>/status` until bit 15 (SIGTERM) of `SigCgt` is set, so the listeners are installed. Then send SIGTERM and assert exit 0 with empty stdout.
- [ ] **Step 2:** Run `pnpm run build && node --test tests/agent-harness/claude-signals.test.mjs`. Expected: everything FAILS except the SIGKILL-survival test and the listenerCount guard.
- [ ] **Step 3: Implement the registry and `closeAll`** in `claude.mts`.
- [ ] **Step 4: Implement the listeners** in `runAsScript`. On the first SIGTERM, SIGHUP or SIGINT:
  - set `signalled = true`;
  - start a `setTimeout(() => process.exit(0), 5000)`;
  - `await closeAll({ cleanupDeadline: Date.now() + 4500 })`;
  - call `process.exit(0)`.

  The listener calls `onSignal({ pending, closeAll, exit: process.exit })` under the 5 s cap, and a second signal calls `process.exit(0)` at once. Where `runAsScript` writes the result, skip the stdout write and `ack` when `signalled` is set; the listener already released `pending`.
- [ ] **Step 5:** Run the same command, then `node --test tests/agent-harness/claude-adapter.test.mjs tests/agent-harness/claude-checkout.test.mjs`. Expected: all PASS. The in-process tests still exit cleanly, because `main()` installs no listeners.
- [ ] **Step 6: Commit.** `feat: clean up process groups when the Claude Code hook is signalled`

### Task 8: Documentation, versions and the full check

**Files:**
- Modify: `skills/agent-harness-hook-runtime/SKILL.md`: the Handler interface section (add `stale`, marked as an addition the way `ack` and `release` are), the join line (around line 79), the superseded line (around line 134) and the termination paragraph (around line 97).
- Modify: `skills/agent-harness-verify-gate/SKILL.md`: the "Limits" section.
- Modify: `src/hook-runtime/tool.json` (0.1.4) and `src/verify-gate/tool.json` (0.2.2).

- [ ] **Step 1: Update the hook-runtime skill.**
  - The superseded line becomes: "On OpenCode, a superseded turn-end result is not delivered as a block. Its `release` is called. If no later turn end is queued and the result has `stale`, that text is sent as a message that does not resume the agent."
  - The termination paragraph gains two points:
    - the reap: dead holder, unreleased newest lock, under 24 h, EPERM skipped, bounded by the event;
    - the signal cleanup: SIGTERM, SIGHUP and SIGINT, 4.5 s cleanup, exit by 5 s. An older delegated copy without `closeAll` is cleaned up by the next run.
- [ ] **Step 2: Update the verify-gate skill.** In the Triggers section's "Turn end" bullets, add the stale notice: a superseded OpenCode result is shown with the fixed `stale` text and is not counted. Then add the "Limits" entries.
  - **Failure identity.** A changed tail is a new failure. The count is per session and is not reset by a pass, and the 10-block backstop bounds it. This differs from veles's "node and step, 3 in a row", and a follow-up proposes parallel commands keyed on the failing command.
  - **Manual runs.** A killed `verify-gate run` is not reaped, and a manual run that takes over a dead hook's lock does not reap it.
  - **Pid reuse.** A dead hook's recorded group could, within 24 h, belong to an unrelated process of the same user.
- [ ] **Step 3:** Bump both `tool.json` versions, then run `pnpm run harness:update`. Expected: the assets and `.agents/harness/` are rebuilt, and the lock is updated.
- [ ] **Step 4: Run the full check.**

  ```bash
  pnpm run check && python3 scripts/skills.py validate && claude plugin validate . && python3 -m unittest discover -s scripts -p 'test_*.py' && openspec validate settle-turn-end-differences --strict
  ```

  Expected: every command exits 0.
- [ ] **Step 5: Commit.** `docs: document turn-end limits and release hook-runtime 0.1.4, verify-gate 0.2.2`
- [ ] **Step 5a: Sync and archive.** Run `openspec archive settle-turn-end-differences` (it syncs the delta specs into `openspec/specs/`), then `openspec validate --strict` and `pnpm run check`. Commit `docs: archive settle-turn-end-differences`.
- [ ] **Step 6: Draft the PR body** from tasks.md 8.3:
  - each of #62's acceptance criteria with its evidence (test names);
  - the C1, C2 and C3 findings and the owner's decisions;
  - the contracts touched (`stale`, additive) and the new versions;
  - the reversed test;
  - that CI is Ubuntu only;
  - the proposed follow-ups: parallel verify commands, and reaping for manual CLI runs.
- [ ] **Step 7: After the merge**, confirm that the Pages catalog lists `hook-runtime` 0.1.4 and `verify-gate` 0.2.2, and record this on #62.
