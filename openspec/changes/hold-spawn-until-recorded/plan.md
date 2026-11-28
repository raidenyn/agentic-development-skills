# Hold Spawn Until Recorded Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A process the supervisor spawns for a worker runs its command only after its pgid is in every gate lock the supervisor holds. This closes the orphan window behind issue #77.

**Architecture:** `Supervisor.onSpawn` first resolves `argv[0]` the way execvp does, so the spawn errors stay the same. It then starts `/bin/sh -c SPAWN_BARRIER agent-harness-spawn ...argv` as a new group leader with a fourth stdio pipe on fd 3. When the pgid has been written to the held locks, the supervisor writes `go\n` to fd 3, and the barrier `exec`s the command. If the write fails, the supervisor SIGKILLs the group and answers with an error. If fd 3 reaches EOF first, the barrier exits 125.

**Tech Stack:** Strict TypeScript in `src/hook-runtime/`, built with `pnpm run build` into `skills/agent-harness-hook-runtime/assets/hook-runtime/`. The `node:test` `.mjs` tests in `tests/agent-harness/` import those built assets.

**Spec:** `openspec/changes/hold-spawn-until-recorded/specs/agent-hook-runtime/spec.md`. Design: `openspec/changes/hold-spawn-until-recorded/design.md` (D1–D5).

## Global Constraints

- Never edit `skills/*/assets/` or `.agents/harness/` by hand. Rebuild with `pnpm run build` or `pnpm run harness:update`.
- Bump `src/hook-runtime/tool.json` `version` once for the PR: `0.2.0` → `0.2.1`.
- Source uses erasable syntax only. Use `any` only at host and JSON boundaries.
- Tests stay `.mjs`, do not import `.mts`, and must run on Node 22.0.0.
- Commits follow Conventional Commits.
- POSIX only (`/bin/sh`).
- Every task's test step runs the whole `node --test tests/agent-harness/`, because handlers such as the verify gate (`verify-handler.test.mjs`) depend on the spawn error shapes.

## Review Focus

1. A command that fails to start must still be reported as ENOENT or EACCES and must name the command, because the verify gate turns that into "could not start …". Task 1 tests this.
2. Arguments with spaces, quotes, `$`, or a leading `-` must arrive unchanged through `"$@"`. Task 1 tests this.
3. A spawn while no gate lock is held must be released at once and must not hang. Task 1 tests this, in the same test as item 2.
4. A command found only through `PATH` in the spawn's `env` must run. Task 1 tests this.
5. Writes to `child.stdio[3]` after the child has exec'd or died must not crash the supervisor with an unhandled EPIPE. The `error` listener is attached before any write (Task 1, step 3). Every test spawns, so an unhandled error would fail the run.

---

### Task 1: Barrier, command resolution and spawn errors

**Files:**
- Modify: `src/hook-runtime/lib/supervisor.mts`: `onSpawn` (around lines 303–352), plus two new exports
- Test: `tests/agent-harness/supervisor.test.mjs`

**Interfaces:**
- Produces: `export const SPAWN_BARRIER: string`. It is exactly `IFS= read -r go <&3 && [ "$go" = go ] || exit 125\nexec 3>&- /usr/bin/env -i -- "$@"\n`.
- Produces: `export function resolveCommand(file: string, cwd: string | undefined, env: Record<string, string | undefined>): { ok: true } | { ok: false; error: string }`. The error is `spawn <file> ENOENT` or `spawn <file> EACCES`. An empty, non-string or NUL-containing name gets Node's `The argument 'file' …` message. A name starting with `-` gives ENOENT. The rules are in design D2.
- Produces: `onSpawn` starts `/bin/sh` with `env: {}` and the invocation `['-c', SPAWN_BARRIER, 'agent-harness-spawn', ...envArgs, ...argv]`, where `envArgs` is the merged spawn env as `KEY=VALUE` strings for every defined value, and writes `go\n` to `child.stdio?.[3]` only after every held lock's `recordGatePgids` has returned, and only when `pgid` is set.

- [ ] **Step 1: Write the tests** in `supervisor.test.mjs`. Import `SPAWN_BARRIER` alongside `killGroups, startWorker`. Add `openSync`, `closeSync`, `chmodSync` to the `node:fs` import, and import `setTimeout as sleep` from `node:timers/promises`. Generated handler sources import what they use themselves (for example `import { chmodSync } from 'node:fs'`). Every test uses a fresh `scratch()` dir.
  - **Red** `test('the barrier holds the command until go')`. Run `spawn('/bin/sh', ['-c', SPAWN_BARRIER, 'agent-harness-spawn', 'sh', '-c', 'touch "$0"', mark], { stdio: ['ignore', 'pipe', 'pipe', 'pipe'] })`. Inside `try`/`finally`, after `await sleep(200)` assert `!existsSync(mark)`, then write `child.stdio[3].write('go\n')` and assert exit code 0 and `existsSync(mark)`. The `finally` calls `child.stdio[3].end()`, so that a failed assertion cannot leave the `sh` blocked.
  - **Red** `test('the barrier exits 125 and runs nothing on EOF')`. Run `spawnSync('/bin/sh', [...same args], { stdio: ['ignore', 'pipe', 'pipe', fd], timeout: 5000 })` with `fd = openSync('/dev/null', 'r')`, and run `closeSync(fd)` in `finally`. Assert `status === 125` and `!existsSync(mark)`. Note that `spawnSync` with a `'pipe'` fd 3 would hang.
  - **Guard** `test('spawn errors through the supervisor name the command')`. It passes before the fix, and it is what catches a barrier without `resolveCommand` or without the cwd rewrite. One handler makes seven `c.spawn` calls inside `try/catch` and returns their messages, or the stdout for the `hello` case:
    - `['agent-harness-no-such-cmd']` should match `/spawn agent-harness-no-such-cmd ENOENT/`.
    - `[nx]`, where `nx` is an absolute path to a mode `0o644` file, should match `/EACCES/` and include `nx`.
    - `['true']` with `cwd: join(dir, 'missing')` should match `/spawn true ENOENT/`.
    - `['hello']` with `env: { PATH: \`${bin}:${process.env.PATH}\` }`, where `bin/hello` is `#!/bin/sh\necho hi`, mode `0o755`, should give stdout `hi\n`.
    - `['']` and `['a\0b']` should each reject with `/argument 'file'/` (`cannot be empty` and `must be a string without null bytes`), and the hook process must not crash. `[42]` should reject with `/spawn 42 ENOENT/`, because the worker sends `argv.map(String)`.
  - **Guard** (may pass before the fix) `test('the pgid is in the held lock when the command runs')`. The handler runs `await c.lock.acquire(ev.gate)`, then `c.spawn(['sh', '-c', 'echo $$ > "$0/pid"; cat "$0/gate/gate.lock.1" > "$0/seen.json"', ev.dir])`. The event is `{ type: 'prompt', gate: join(dir, 'gate'), dir }`. Assert `JSON.parse(seen).pgids.includes(Number(pid))`.
  - **Guard** `test('arguments arrive unchanged with no lock held')`. Spawn `['printf', '%s|', 'a b', "q'\"", '$HOME', '-n']`. Assert stdout is exactly `a b|q'"|$HOME|-n|`.
  - **Guard**: extend `'spawn runs through the supervisor and returns exit status and output'`. Make the first command `sh -c 'echo $$ >&2; echo out; echo err >&2; exit 3'`. Assert that the first stderr line equals `String(r.pgid)` and that the rest of stderr is `err\n`. The existing `timedOut` and `SIGTERM` assertions stay; they cover the timeout scenario.

- [ ] **Step 2: Run the tests and confirm the red ones fail**
  Run `pnpm run build && node --test tests/agent-harness/supervisor.test.mjs`.
  Expected: the two barrier tests FAIL, because `SPAWN_BARRIER` is undefined. The guard tests pass, because a direct spawn already behaves that way. They pin the behavior that Step 3 must keep.

- [ ] **Step 3: Implement in `supervisor.mts`**
  - Add `SPAWN_BARRIER` and `resolveCommand` (design D2). Build the candidates from the raw `cwd` (`cwd == null ? process.cwd() : cwd`), with no `resolve()` on the base: `${base}/${entry}/${file}` for a relative PATH entry, `${entry}/${file}` for an absolute entry, `${base}/${file}` for a `file` containing `/`, and `file` itself when it is absolute, so the filesystem follows symlinks before `..` as `chdir` does. If `PATH` is unset, use the C library's `_CS_PATH`, because the command execs through `/usr/bin/env`: query `spawnSync('/usr/bin/getconf', ['PATH'], { encoding: 'utf8', env: process.env, timeout: 2000 })` once, cache it, and fall back to `/bin:/usr/bin` only if the query fails or prints nothing. Treat `cwd == null` as `process.cwd()`. If `cwd` is any other non-string value, skip resolution so that `spawnChild` throws as it does today. Use `statSync(p).isFile()` and `accessSync(p, constants.X_OK)`, and split PATH with `delimiter` from `node:path`.
  - Add a local `recordGatePgids(handle, pgids)` (design D3) instead of `updateGateLock`, and remove `updateGateLock` from the `state.mts` import.
  - In `onSpawn`:
    - Move `let timeout`, `let timedOut` and the `pgid` binding above `end`.
    - Inside the existing `try` (whose `catch` replies `errText(err)`), call `resolveCommand(argv[0], cwd, { ...process.env, ...env })`. On failure, `return reply({ error })`.
    - Spawn `'/bin/sh', ['-c', SPAWN_BARRIER, 'agent-harness-spawn', ...envArgs, ...argv]` with `env: {}` and `stdio: ['ignore', 'pipe', 'pipe', 'pipe']`, so the barrier shell starts empty and `env -i --` applies the caller's environment only at the release.
    - Register `child.stdio?.[3]?.on('error', () => {})` and the child's `error`/`close` listeners before any write, and guard `child.stdout`, `child.stderr` and every `gate` access with `?.`, because a spawn under descriptor pressure can return a child without stdio.
    - In `child.on('error')`, reply with `recordError` when it is set; otherwise, when `err.code` is set, reply with `spawn ${argv[0]} ${err.code}`. Every error from this child names `/bin/sh` (design D4).
    - After the lock loop, run `gate?.write('go\n')` when there is no `recordError`, then start the timeout; on a `recordError`, close the release side with `gate?.end()` so the barrier exits 125 even if the SIGKILL is denied.

- [ ] **Step 4: Run all the harness tests**
  Run `pnpm run build && node --test tests/agent-harness/`.
  Expected: PASS, all tests.

- [ ] **Step 5: Commit**
  Run `git add src/hook-runtime tests/agent-harness/supervisor.test.mjs skills/agent-harness-hook-runtime/assets && git commit -m "fix: hold supervisor spawns until their group is recorded"`.

### Task 2: A lock that cannot be written stops the spawn

**Files:**
- Modify: `src/hook-runtime/lib/supervisor.mts`: the lock loop and `close` handler in `onSpawn`
- Test: `tests/agent-harness/supervisor.test.mjs`

**Interfaces:**
- Consumes: the Task 1 order in `onSpawn`.
- Produces: the spawn reply `{ error: 'could not record the process group: <message>', pgid }`, sent from the child's `close`. The worker rejects with that message.

- [ ] **Step 1: Write the failing test**
  Add `test('a lock that cannot be written stops the spawn', { skip: process.getuid?.() === 0 })`.
  - The handler acquires `ev.gate`, then runs `chmodSync(ev.gate, 0o500)`.
  - It calls `c.spawn(['sh', '-c', 'touch "$0"', mark])` in a `try/catch` and keeps the message.
  - In `finally`, it runs `chmodSync(ev.gate, 0o700)` before returning.
  - Assert that the message matches `/could not record the process group/` and that `!existsSync(mark)`.
  - Assert `spawnSync('pgrep', ['-f', mark]).status === 1`, checked right after the dispatch returns with no polling. The reply comes only after the group is gone.

- [ ] **Step 2: Run it and confirm it fails**
  Run `pnpm run build && node --test --test-name-pattern 'cannot be written' tests/agent-harness/supervisor.test.mjs`.
  Expected: FAIL, because the spawn resolves and the mark exists.

- [ ] **Step 3: Implement**
  - Replace the `catch {}` around the gate-lock record (`recordGatePgids`). On the first throw, set `recordError = \`could not record the process group: ${errText(err)}\``, stop the loop, skip `go` and the timeout, and run `signalGroup(pgid, 'SIGKILL')`.
  - In `close`, when `recordError` is set, call `end({ error: recordError, pgid })` instead of the exit result.
  - The pgid stays in `this.groups` until `end` sees that it is dead, as it does today.

- [ ] **Step 4: Run all the harness tests**
  Run `pnpm run build && node --test tests/agent-harness/`.
  Expected: PASS, all tests.

- [ ] **Step 5: Commit**
  Run `git commit -am "fix: kill a spawned group whose pgid cannot be recorded"`.

### Task 3: Ship and verify

**Files:**
- Modify: `src/hook-runtime/tool.json`
- Generated: `skills/agent-harness-hook-runtime/assets/hook-runtime/**`, `.agents/harness/**`
- Modify: `openspec/changes/hold-spawn-until-recorded/tasks.md` (tick the boxes)

- [ ] **Step 1: Bump the version and refresh the harness**
  Set `"version": "0.2.1"` in `src/hook-runtime/tool.json`, then run `pnpm run harness:update`.
  Expected: exit 0. `git status` shows the refreshed assets and the `.agents/harness/` lock.

- [ ] **Step 2: Reproduce issue #77**
  Run `SCRATCH=$(mktemp -d); for r in 1 2 3; do for i in $(seq 10); do node --test tests/agent-harness/claude-signals.test.mjs > "$SCRATCH/r$r-$i.log" 2>&1 & done; wait; done; grep -L '^ℹ fail 0' "$SCRATCH"/r*.log`.
  Expected: no file is listed. Before the fix, 4 of 30 runs failed.

- [ ] **Step 3: Run the full checks**
  Run `python3 scripts/skills.py validate && claude plugin validate . && python3 -m unittest discover -s scripts -p 'test_*.py' && pnpm run check && openspec validate hold-spawn-until-recorded`.
  Expected: every command exits 0.

- [ ] **Step 4: Commit**
  Run `git add -A && git commit -m "fix: bump hook-runtime for the spawn barrier"`.
