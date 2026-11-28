## Context

The supervisor spawns every handler process in its own group (`detached: true`) and records the pgid in each gate lock it holds (`lock.pgids`). If the holder dies, the next lock acquisition reaps those groups (see `agent-hook-runtime`, Requirement: Reaping a dead holder's groups). Today the pgid is recorded only after `spawn()` returns, when the child is already running. A SIGKILL in that window leaves an orphan group the next run cannot see. This is issue #77, reproduced 4 times in 30 parallel runs, each time with the verify pgid missing from `gate.lock.1`.

## Goals / Non-Goals

**Goals:**
- No command spawned through the supervisor starts before its pgid is written to every gate lock the supervisor holds.
- A group whose pgid could not be recorded never runs its command.
- Handlers see the same results as today: pid and pgid, stdout and stderr, exit code and signal, timeout, and the spawn errors for a missing command, a non-executable file, an invalid command name and an invalid `cwd`, all naming `argv[0]`. The command receives the caller's environment except names a shell treats as readonly or special (`UID`, `EUID`, `PPID`, `GROUPS`, `BASHOPTS`, `SHELLOPTS`, `BASH_VERSINFO`, `BASH_VERSION`, `EXECIGNORE`), names that are not valid identifiers (including `BASH_FUNC_*`), and an absent `PATH`, which is supplied from `getconf PATH`. The known differences are listed under Risks.

**Non-Goals:**
- `localSpawn` and `localLock` in the verify gate. The local lock does not record pgids, so it has nothing to reap.
- Windows support.
- Changing the reap itself (`staleGroups`, `killGroups`).

## Decisions

**D1. Barrier wrapper on fd 3.** `onSpawn` runs:

```
/bin/sh -p -c "$SPAWN_BARRIER" agent-harness-spawn <argv...>
```

with `env: {}`, `stdio: ['pipe', 'pipe', 'pipe', 'pipe']` and `detached: true`. `SPAWN_BARRIER` is exactly:

```sh
IFS= read -r _agent_harness_go <&3 || exit 125
case $_agent_harness_go in go) ;; *) exit 125 ;; esac
eval "$(/bin/cat)"
exec 3>&- "$@"
```

The shell starts privileged (`-p`) with an empty environment, so nothing the caller passes can run before the release, and no environment value is on the command line, where `/proc/<pid>/cmdline` is world-readable. After `go` the shell reads one quoted `export NAME='value'` line per caller variable from stdin and `eval`s them, which restores the whole environment — `PWD`, `go` and `_` included. `exec` then replaces the shell with the command itself, so loader variables apply to the command only, and a name containing `=` runs through the shell's normal search. The private `_agent_harness_go` is not exported unless the caller had that name, in which case the restore script sets the caller's value back after the check. Names that are not shell identifiers (including `BASH_FUNC_*`) and `SHELLOPTS`/`BASHOPTS` cannot be exported by `sh` and are left out; when the caller has no `PATH`, the script exports the C library's `getconf PATH`, so the shell's search and the preflight agree.

`exec` replaces the shell, so the pid recorded before the release, and therefore the pgid, is the command's own. The `sh` leads the group from the start, so anything the command forks stays in the recorded group. The command does not inherit fd 3. fd 3 is blocking on the child side, so `read` waits however late `go` arrives. For the alternatives that were considered (a test-only wait, an intent marker with a process scan, starting the child stopped), see `brainstorm.md`.

**D2. Validate and resolve the command in the supervisor before spawning.** `resolveCommand(file, cwd, env)` runs inside `onSpawn`'s existing `try`, and anything it throws is replied as `errText(err)`. Rules:
- A `file` that is not a string, is empty, or contains a NUL byte gets an error that starts with Node's wording, `The argument 'file' …`, for example `The argument 'file' cannot be empty. Received ''`. The tests assert only `/argument 'file'/`. The worker sends `argv.map(String)`, so a non-string name is only defence in depth. A `cwd` of `null` or `undefined` means `process.cwd()`. Any other non-string `cwd` skips resolution, so that `spawnChild` throws inside the same `try` as today.
- A `file` starting with `-` gives `spawn <file> ENOENT`. This is kept as a known, documented difference: a direct spawn would treat it as a file name.
- A `file` containing `/` is resolved against the raw `cwd` (`cwd ?? process.cwd()`, with no lexical `resolve`). Otherwise each entry of the merged `env.PATH` is tried in order. Candidates are `${base}/${entry}/${file}` for a relative entry, `${entry}/${file}` for an absolute one, `${base}/${file}` for a `file` containing `/`, and `file` itself when it is absolute. The base is left raw because `chdir` follows the symlinks in the path before it applies `..`, while `resolve()` would collapse `..` lexically and miss a cwd such as `link/..`. If `PATH` is unset, the resolver searches the C library's `_CS_PATH`, which is what a direct spawn searches when `PATH` is absent: it is queried once with `spawnSync('/usr/bin/getconf', ['PATH'], { env: process.env, timeout: 2000 })`, trimmed because `getconf` ends its answer with a newline, with `/bin:/usr/bin` as the fallback when the trimmed answer is empty or the query fails. The same value is exported to the command on stdin, so lookup and execution agree.
- A candidate qualifies when it is a regular file that passes `accessSync(X_OK)`. EACCES is remembered when `statSync` fails with EACCES, when the candidate is not a regular file (for example a directory), or when `accessSync` fails. Every other `statSync` error (ENOENT, ENOTDIR, ELOOP) is skipped.
- If nothing qualifies, the reply is `spawn <file> EACCES` when EACCES was remembered, and `spawn <file> ENOENT` otherwise. Nothing is started.

Resolution only decides the error. The barrier execs `argv[0]` itself with the restored environment; when the caller has no `PATH` it exports `getconf PATH`, so the search matches the preflight. fd 3 carries only the release.

**D3. Order in `onSpawn`.**
1. `resolveCommand`.
2. `spawn()`.
3. Attach `child.stdio?.[3]?.on('error', () => {})` right away, because of a possible EPIPE, and guard every stream access: under descriptor pressure a spawn can return a child without stdio and a pending EMFILE error.
4. Bookkeeping in `groups` and `children`.
5. For each held lock, push the pgid and call `recordGatePgids`.
6. Write `go\n` to `child.stdio[3]`.
7. Start the timeout.

`recordGatePgids` replaces `updateGateLock` for the held locks here. It re-reads the lock and refuses to write unless the body is an object with `pid === process.pid`, a numeric `at` and `released !== true`. `updateGateLock` would replace a record it cannot read with `{ pgids }`, losing `pid` and `at` so that `staleGroups` could no longer reap the holder's groups; the helper stays local because `state.mts` is shared with `hooked-rules` and `verify-gate`.

If any `recordGatePgids` throws, the supervisor does not write `go`. It records `recordError = 'could not record the process group: <msg>'`, sends SIGKILL to the group (it holds only the barrier `sh`, so nothing needs a graceful stop), closes the release side with `gate?.end()` so that a denied kill still gives the barrier EOF and it exits 125, and replies `{ error: recordError }` from the child's `close` or `error` instead of the exit result. The reply therefore comes after the group is gone. The `end` helper refers to `timeout` and `pgid`, so declare them before any path that can call `end`, to avoid a TDZ error. `go` is written only when `pgid` is set.

**D4. Invalid `cwd`.** Every `error` event from this child names `/bin/sh`, because Node sets `err.path` to the spawned file. So the `error` handler always rewrites the message to `spawn ${argv[0]} ${err.code}` when `err.code` is set. An invalid `cwd` therefore names the command, as before.

**D5. Supervisor death before release.** If the supervisor process dies, fd 3 closes, `read` gets EOF, and the barrier `sh` exits 125 without running anything.

## Risks / Trade-offs

- **One extra `sh` and one `/bin/cat` exec per spawn**, about a millisecond. The lock writes already happen today.
- **What is not passed to the command.** Environment entries whose names are not shell identifiers — including every exported `BASH_FUNC_*` function — cannot be exported by the barrier shell and are absent. These names are left out too: `UID`, `EUID`, `PPID`, `GROUPS`, `BASHOPTS`, `SHELLOPTS`, `BASH_VERSINFO`, `BASH_VERSION` (bash treats them as readonly, and a failed assignment in POSIX mode ends the shell) and `EXECIGNORE` (it changes bash's PATH search). The command recomputes its own values for them. An absent `PATH` is supplied as the C library's `getconf PATH`, so the search matches the preflight. A name beginning with `-` is refused with `spawn <name> ENOENT`. A NUL byte in an environment value is rejected with Node's `The argument 'env' must be a string without null bytes`, as a direct spawn does.
- **Known differences from a direct spawn.** An `exec` failure — a script whose `#!` interpreter is missing, or a binary built for the wrong architecture — gives exit 126 or 127, with the shell's message on stderr, instead of an ENOENT or ENOEXEC error. The verify gate reports this as a failed verify that shows that message, not as "could not start". This is rare, and reporting a failed `exec` back would need a status channel, which is not worth the complexity. A file system change between resolution and `exec` can turn an error into an exit code.
- **While a process waits at the barrier, `ps` shows `sh`.** This lasts only until the `exec`, which happens in the same tick as the spawn.

## Migration Plan

This is internal to the shipped `hook-runtime` tool. Bump `src/hook-runtime/tool.json` and run `pnpm run harness:update`. Repos that installed the runtime pick it up on their next update. Rollback is reverting the commit.

## Open Questions

None.
