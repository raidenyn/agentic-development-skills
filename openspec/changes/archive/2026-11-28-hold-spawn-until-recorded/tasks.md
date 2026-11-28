## 1. Barrier, command resolution and spawn errors

- [x] 1.1 Add the deterministic hold test for the exported `SPAWN_BARRIER`. Spawn it async with a `'pipe'` fd 3. After 200 ms, no mark exists. After `go\n`, the mark appears and the exit is 0. Add the EOF test: `stdio[3]` is `openSync('/dev/null', 'r')`, the exit is 125, and no mark exists.
- [x] 1.2 Add supervisor tests for the errors through `c.spawn`: a missing command gives ENOENT, a non-executable path gives EACCES, a `cwd` that does not exist gives an error naming `argv[0]` (not `/bin/sh`), a command found through the spawn `env.PATH` runs, an empty name or a NUL byte in it rejects with Node's `The argument 'file'` error without crashing the hook process, and `[42]` rejects with `spawn 42 ENOENT`.
- [x] 1.3 Add guard tests. These may pass before the fix. The pgid is in a fresh gate dir's `gate.lock.1` when the command runs. Arguments with spaces, quotes, `$HOME` and `-n` arrive unchanged when no lock is held. `r.pgid` equals the pid the command printed.
- [x] 1.4 Implement `SPAWN_BARRIER`, `resolveCommand`, the `onSpawn` order and the `cwd` error rewrite in `src/hook-runtime/lib/supervisor.mts` (design D1–D4).
- [x] 1.5 Run `pnpm run build && node --test tests/agent-harness/` and confirm all tests pass.

## 2. A lock that cannot be written

- [x] 2.1 Add the test "a lock that cannot be written stops the spawn" (chmod `0o500` on the gate dir). The spawn rejects with `could not record the process group`, no mark exists, and no process with the mark path is left. Skip it when running as root.
- [x] 2.2 Replace the `catch {}` around the gate-lock record (`recordGatePgids`): no `go`, SIGKILL to the group, and the error reply from `close` (design D3).
- [x] 2.3 Run `pnpm run build && node --test tests/agent-harness/` and confirm all tests pass.

## 3. Ship and verify

- [x] 3.1 Bump `version` in `src/hook-runtime/tool.json` (0.2.0 → 0.2.1) and run `pnpm run harness:update`.
- [x] 3.2 Run the issue #77 reproduction (30 parallel runs of `node --test tests/agent-harness/claude-signals.test.mjs`, 3 rounds of 10) and confirm it shows no failure.
- [x] 3.3 Run `python3 scripts/skills.py validate`, `claude plugin validate .`, `python3 -m unittest discover -s scripts -p 'test_*.py'`, `pnpm run check` and `openspec validate hold-spawn-until-recorded`, and confirm they all pass.
