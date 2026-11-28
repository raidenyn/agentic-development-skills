# Retrospective — hold-spawn-until-recorded

## Wins

- The barrier is deterministic: a 200 ms hold, a `go` release, and an EOF exit 125 test pin the contract without relying on the race.
- The issue #77 reproduction (30 parallel runs, three rounds) went from 4/30 failures to 0/30.
- Task reviews caught the lexical `..` lookup bug and the unset-PATH mismatch before merge; the whole-branch review caught the environment-injection hole in the first launcher.
- The strict lock write (`recordGatePgids`) keeps `pid`/`at` when a lock file is unreadable, so the reaper can still work.

## Misses

- The first launcher design put the whole environment in `argv`; a world-readable `/proc/<pid>/cmdline` exposed it. It took four corrective rounds to settle on an empty shell plus a stdin restore.
- Bash-specific behavior (readonly `SHELLOPTS`, `EXECIGNORE`, `_`/`SHLVL` recomputation) could not be exercised locally on every round; the tests are guards, not proof, on dash.
- The NUL-in-`PATH` ordering is still a known deviation: lookup reports ENOENT before environment validation.

## Plan deviations

- The launcher no longer starts with the caller's environment. It starts `/bin/sh -p` empty, restores the environment from stdin after `go`, and `exec`s the command directly. `env -i` was tried and rejected (argv secrets, `=` names, loader variables).
- An absent `PATH` is supplied from `getconf PATH`, so the command sees a `PATH` where a direct spawn would see none.
- Environment names that a shell cannot export, and bash readonly/special names, are not passed. These are in design Risks.

## Skill/workflow compliance

- Subagent-driven development with TDD, a task review after each task, a whole-branch review, and scoped re-reviews after every fix wave. Commits follow Conventional Commits; `openspec validate` and `pnpm run check` pass.

## Surprises

- dash's `exec` has no `--` and no `-a`; `/bin/sh` on Linux is dash, on macOS bash.
- `env` treats any `NAME=VALUE` after `--` as an assignment, so `=` command names need the shell's own search.
- `LD_TRACE_LOADED_OBJECTS` on an intermediate `env` prints the wrapper's dependencies instead of running the target.

## Promote candidates

- Consider a shared, tested process-launcher helper for tools that need an env-clean barrier; this logic is subtle enough to reuse.
- Add a macOS CI job so the bash-as-`sh` path runs in anger.
- Make the environment-leak guard observe the supervisor's spawn arguments, not a hand-built launcher invocation.
