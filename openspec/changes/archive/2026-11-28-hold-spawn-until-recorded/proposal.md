## Why

A Claude Code hook process killed with SIGKILL can leave an orphaned process group that no later run reaps. The supervisor writes a child's pgid into the gate lock only after `spawn()` returns, and by then the child is already running. Issue #77's flaky test is this bug: in 4 of 30 parallel runs, the dead holder's lock was missing the verify group's pgid. Fixing it removes the orphans and the flake together.

## What Changes

**Spawn through the supervisor**
- From: `onSpawn` starts the command directly and then records its pgid in every held gate lock. A failed lock write is silently ignored.
- To: `onSpawn` starts the command behind a `/bin/sh` barrier on fd 3. The command runs only after its pgid is written to every held lock. If the write fails, the group is killed and the spawn replies with an error. If the supervisor dies first, the barrier exits without running the command. The supervisor resolves the command before spawning, so missing and non-executable commands, and an invalid `cwd`, give the same errors as before.
- Reason: close the window in which an unrecorded group can be orphaned.
- Impact: Non-breaking for handlers. The results they get from spawn keep the same shape.

**Shipped tool**
- `hook-runtime` gets a version bump, and the built assets are regenerated with `pnpm run harness:update`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities
- `agent-hook-runtime`: adds three requirements: a process spawned for a worker does not run until its process group is recorded in every gate lock the supervisor holds; an unrecorded group never runs; and spawn results and errors (ENOENT, EACCES, invalid `cwd`, timeout) are unchanged.

## Impact

- `src/hook-runtime/lib/supervisor.mts` (`Supervisor.onSpawn`).
- `tests/agent-harness/supervisor.test.mjs`: new barrier tests. `tests/agent-harness/claude-signals.test.mjs` should stop flaking without changes.
- `src/hook-runtime/tool.json` version, the generated `skills/*/assets/hook-runtime/` files and `.agents/harness/`, via `pnpm run harness:update`.
- POSIX only (`/bin/sh`), as the process groups already are.
