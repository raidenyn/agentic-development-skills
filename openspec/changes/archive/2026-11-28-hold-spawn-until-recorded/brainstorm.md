## Design Summary

Issue #77 reports that `tests/agent-harness/claude-signals.test.mjs` "the next run reaps the dead entry's recorded group before it runs" fails intermittently with `'alive' !== 'gone'`.

**Reproduced and narrowed.** 30 parallel runs of the file (3 rounds of 10) gave 4 failures. On every failure, a dump of the session's gate lock files showed the same thing. The dead holder's `gate.lock.1` was not released, its `pid` was dead and its `at` was recent. Its `pgids` listed the earlier git groups of that run but **not** the verify command's group, which was the group the test checked. So `staleGroups` returned the other pgids, the verify group was never signalled, and the next run's command saw it alive.

**Cause.** `Supervisor.onSpawn` (`src/hook-runtime/lib/supervisor.mts`) calls `spawn()`, and only after it returns pushes the pgid into every held lock and writes it with `updateGateLock` (read, temp write, rename). `spawn()` returns after the child has exec'd, so the child is already running while the pgid is unrecorded. If the hook process is SIGKILLed in that window, an orphan group is left that no later run can reap. In the test, the child `sh` writes `verify.pgid` immediately, the test sees it and sends SIGKILL, sometimes before the rename. Parallel load makes the window wider. This is a real supervisor bug, not test timing. The `catch {}` around `updateGateLock` also hides a failed write, which has the same effect.

**Design.** The supervisor holds each spawned child behind a barrier until the child's pgid is recorded in every held gate lock:

1. `onSpawn` spawns `/bin/sh -c <barrier script> <name> <argv...>` with `detached: true` and stdio `['ignore', 'pipe', 'pipe', 'pipe']`. The child is the leader of its new group, as before.
2. The barrier script blocks on `read` from fd 3. On EOF or anything other than `go`, it exits without running the command.
3. After `spawn()` returns, the supervisor pushes the pgid into the held locks and writes each one. Only then does it write `go\n` to fd 3.
4. If a lock write throws, the supervisor does not release the barrier. It kills the group and replies with an error.
5. Before spawning, the supervisor resolves `argv[0]` the way execvp does (PATH from the spawn env, X_OK). A missing or non-executable command is answered with the usual `spawn <argv0> ENOENT` or `EACCES` error, and nothing is started. An invalid `cwd` error is rewritten so that it names `argv[0]`, not `/bin/sh`. Handlers therefore see the same errors as before.
6. When the barrier is released, the script closes fd 3 and runs `exec "$@"`, so pid and pgid stay the same. fd 3 carries only the release.

## Alternatives Considered

### Alternative A: Make the test wait or retry
- **Approach**: Have the test wait until the lock records the pgid before it sends SIGKILL, or accept either outcome.
- **Pros**: Small, and touches only the test.
- **Cons**: The orphan stays possible for real Claude Code hook processes killed with SIGKILL.
- **Why not chosen**: The issue says to fix the supervisor if the reap can really be skipped, and it can.

### Alternative B: Record an intent before spawning, then find the group later
- **Approach**: Write `spawning: true` (or a nonce passed in the child's env) into the lock before `spawn()`. The reaper looks for processes carrying the nonce.
- **Pros**: No wrapper process.
- **Cons**: Finding processes by environment needs `/proc` and does not work on macOS. Scanning the process table is slow and fragile.
- **Why not chosen**: Not portable, and more complex than a barrier.

### Alternative C: Start the child stopped, or in a pre-made group
- **Approach**: Spawn the child stopped (SIGSTOP) and continue it after recording, or put children into a holder group whose pgid is recorded first.
- **Pros**: No barrier pipe.
- **Cons**: Node's `child_process` cannot start a child stopped or set the pgid of an existing group.
- **Why not chosen**: Not possible with the Node API.

## Agreed Approach

The fd-3 barrier wrapper described in the Design Summary. The user approved it. It closes the window completely: a group whose pgid is not yet recorded runs only the barrier `sh`, which exits on its own when the supervisor dies (EOF on fd 3), so nothing can become an orphan. It also keeps the pid, the pgid, the stdio and the spawn error shape that handlers see today.

## Key Decisions

- Fix it in the supervisor. The test stays as it is and becomes a regression test that should no longer flake.
- Barrier over fd 3 with `exec`, so the recorded pgid is the command's real group leader. (Claude's call.)
- A failed lock write kills the group and replies with an error instead of running an unrecorded group. (Claude's call.)
- Command resolution happens in the supervisor, before spawning, so ENOENT and EACCES stay errors. This replaced a fd-3 back-channel after review: `command -v` accepted non-executable files. (Claude's call.)
- Out of scope: `localSpawn` and `localLock` in the verify gate (`cli.mjs run` and in-process tests). The local lock does not record pgids at all, so it never reaps.
- Out of scope: Windows. The supervisor already relies on POSIX process groups.

## Open Questions

None. The review confirmed that fd 3 is a blocking, bidirectional socketpair on Node 26 with dash.
