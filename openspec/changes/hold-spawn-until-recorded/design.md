## Context

The supervisor spawns every handler process in its own group (`detached: true`) and records the pgid in each gate lock it holds (`lock.pgids`). If the holder dies, the next lock acquisition reaps those groups (see `agent-hook-runtime`, Requirement: Reaping a dead holder's groups). Today the pgid is recorded only after `spawn()` returns, when the child is already running. A SIGKILL in that window leaves an orphan group the next run cannot see. This is issue #77, reproduced 4 times in 30 parallel runs, each time with the verify pgid missing from `gate.lock.1`.

## Goals / Non-Goals

**Goals:**
- No command spawned through the supervisor starts before its pgid is written to every gate lock the supervisor holds.
- A group whose pgid could not be recorded never runs its command.
- Handlers see the same results as today: pid and pgid, stdout and stderr, exit code and signal, timeout, and the spawn errors for a missing command, a non-executable file, an invalid command name and an invalid `cwd`, all naming `argv[0]`. The known differences are listed under Risks.

**Non-Goals:**
- `localSpawn` and `localLock` in the verify gate. The local lock does not record pgids, so it has nothing to reap.
- Windows support.
- Changing the reap itself (`staleGroups`, `killGroups`).

## Decisions

**D1. Barrier wrapper on fd 3.** `onSpawn` runs:

```
/bin/sh -c "$SPAWN_BARRIER" agent-harness-spawn <argv...>
```

with `stdio: ['ignore', 'pipe', 'pipe', 'pipe']` and `detached: true`. `SPAWN_BARRIER` is exactly:

```sh
IFS= read -r go <&3 && [ "$go" = go ] || exit 125
exec 3>&- "$@"
```

`exec` replaces the shell, so the pid recorded before the release, and therefore the pgid, is the command's own. The `sh` leads the group from the start, so anything the command forks stays in the recorded group. The command does not inherit fd 3. fd 3 is blocking on the child side, so `read` waits however late `go` arrives. The reviewer verified this on Node 26 with dash. For the alternatives that were considered (a test-only wait, an intent marker with a process scan, starting the child stopped), see `brainstorm.md`.

**D2. Validate and resolve the command in the supervisor before spawning.** `resolveCommand(file, cwd, env)` runs inside `onSpawn`'s existing `try`, and anything it throws is replied as `errText(err)`. Rules:
- A `file` that is not a string, is empty, or contains a NUL byte gets an error that starts with Node's wording, `The argument 'file' …`, for example `The argument 'file' cannot be empty. Received ''`. The tests assert only `/argument 'file'/`. The worker sends `argv.map(String)`, so a non-string name is only defence in depth. A `cwd` of `null` or `undefined` means `process.cwd()`. Any other non-string `cwd` skips resolution, so that `spawnChild` throws inside the same `try` as today.
- A `file` starting with `-` gives `spawn <file> ENOENT`, because dash's `exec` has no `--` and would misread it. This is a known, documented difference.
- A `file` containing `/` is resolved against `cwd`. Otherwise each entry of the merged `env.PATH` is tried in order. Candidates keep `entry` and `file` verbatim after a resolved base, `base = resolve(cwd ?? process.cwd())`, so the filesystem resolves `..` after symlinks, as the shell does (`resolve()` on the whole candidate would remove a path such as `./link/../cmd`); an absolute `file` or `entry` is probed as it is. If `PATH` is unset, the default PATH of the `/bin/sh` that runs the barrier is used, so preflight and the shell search the same places: it is queried once with `spawnSync('/bin/sh', ['-c', 'printf %s "$PATH"'], { env: process.env without PATH })` and falls back to `/usr/bin:/bin` only if the query fails or prints nothing.
- A candidate qualifies when it is a regular file that passes `accessSync(X_OK)`. EACCES is remembered when `statSync` fails with EACCES, when the candidate is not a regular file (for example a directory), or when `accessSync` fails. Every other `statSync` error (ENOENT, ENOTDIR, ELOOP) is skipped.
- If nothing qualifies, the reply is `spawn <file> EACCES` when EACCES was remembered, and `spawn <file> ENOENT` otherwise. Nothing is started.

Resolution only decides the error. The barrier still execs `argv[0]` itself, so `$0` and the PATH search are unchanged, and fd 3 carries only the release.

**D3. Order in `onSpawn`.**
1. `resolveCommand`.
2. `spawn()`.
3. Attach `child.stdio[3].on('error', () => {})` right away, because of a possible EPIPE.
4. Bookkeeping in `groups` and `children`.
5. For each held lock, push the pgid and call `updateGateLock`.
6. Write `go\n` to `child.stdio[3]`.
7. Start the timeout.

If any `updateGateLock` throws, the supervisor does not write `go`. It records `recordError = 'could not record the process group: <msg>'`, sends SIGKILL to the group (it holds only the barrier `sh`, so nothing needs a graceful stop), and replies `{ error: recordError }` from the child's `close` instead of the exit result. The reply therefore comes after the group is gone. The `end` helper refers to `timeout` and `pgid`, so declare them before any path that can call `end`, to avoid a TDZ error. `go` is written only when `pgid` is set.

**D4. Invalid `cwd`.** Every `error` event from this child names `/bin/sh`, because Node sets `err.path` to the spawned file. So the `error` handler always rewrites the message to `spawn ${argv[0]} ${err.code}` when `err.code` is set. An invalid `cwd` therefore names the command, as before.

**D5. Supervisor death before release.** If the supervisor process dies, fd 3 closes, `read` gets EOF, and the barrier `sh` exits 125 without running anything.

## Risks / Trade-offs

- **One extra `sh` exec per spawn**, about a millisecond. The lock writes already happen today.
- **Known differences from a direct spawn.** In each of these cases the result is an exit code instead of an error, or the environment differs slightly:
  - A file that resolves but whose `exec` fails: a script whose `#!` interpreter is missing, or a binary built for the wrong architecture. These give exit 126 or 127, with the shell's message on stderr, instead of an ENOENT or ENOEXEC error. The verify gate reports this as a failed verify that shows that message, not as "could not start". This is rare, and reporting a failed `exec` back would need a status channel, which is not worth the complexity.
  - The shell sets `PWD` to the real `cwd`. bash as `/bin/sh` (macOS) also sets `SHLVL` and `_`.
  - A file system change between resolution and `exec` can turn an error into an exit code.
- **While a process waits at the barrier, `ps` shows `sh`.** This lasts only until the exec, which happens in the same tick as the spawn.

## Migration Plan

This is internal to the shipped `hook-runtime` tool. Bump `src/hook-runtime/tool.json` and run `pnpm run harness:update`. Repos that installed the runtime pick it up on their next update. Rollback is reverting the commit.

## Open Questions

None.
