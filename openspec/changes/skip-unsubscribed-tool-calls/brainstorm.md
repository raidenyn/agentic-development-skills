## Design Summary

Issue #61 (M1, Hardening, size S). On Claude Code every tool call starts two `node` hook processes
(`PreToolUse` and `PostToolUse`). Each one loads every installed handler into a worker before it
dispatches. In veles (raidenyn/veles-android#197) that is 0.2 to 0.3 s per process, and the warm
sequence went from 3.33 s to 8.15 s. The only installed handler, the verify gate, acts on `shell` and
`edit` tool calls only. A `Read`, `Glob`, `Grep` or MCP call pays the full load and gets nothing.

A handler tool can now declare in its `tool.json` which tool kinds it needs on `tool.before` and
`tool.after`, as `"tools": ["shell", "edit"]`. The key is optional, and without it a handler gets every
kind, as it does today. The Claude Code launcher reads the lock and each locked tool's `tool.json`. These
are plain file reads that load no handler. When no installed handler tool can want the call's kind, the
launcher returns at once: no worker, no output, and a trace record that marks the skip. The runtime's
dispatch applies the same filter, so a handler that declares `tools` never sees other kinds on either
host. The verify gate declares `["shell", "edit"]`.

This was a fast-forward planning run, so the approach below is the planner's call. The issue's
"the task picks one and says why" leaves it open. The owner approves it when they review the plan.

## Alternatives Considered

### Alternative A: `matcher` on the Claude Code hook entries
- **Approach**: `install`/`update` write a `matcher` such as `Bash|Edit|Write|MultiEdit|NotebookEdit` on
  `PreToolUse` and `PostToolUse`. The matcher comes from the tool kinds of the installed handlers.
- **Pros**: an unneeded call starts no process at all. That saves most of the cost, including Node's
  startup.
- **Cons**: it changes `.claude/settings.json` in every repository. The RFC's build decision says
  "every repository's hook config stays as they are". Each handler tool's own `install`/`update`, such
  as the verify gate's, would also have to rewrite hook-runtime's entries, because the matcher depends
  on the set of handlers installed. `check` would need to accept the old and new entries, and
  hand-edited settings would drift. The matcher maps kinds back to Claude tool names, so a handler that
  wants `other` must match every tool (`*`). The approach also does nothing for OpenCode.
- **Why not chosen**: it couples tools through a host config that one tool owns, and it goes against the
  agreed decision to keep the hook config unchanged. The extra saving is Node's startup, about 40 to
  60 ms per process, which is small next to the handler load.

### Alternative B: the launcher returns before loading handlers (chosen)
- **Approach**: as in the Design Summary. The subscription is read from `tool.json`, the launcher skips
  early, and dispatch applies the same filter.
- **Pros**: no host config change, so nothing to migrate and nothing new for `check` to accept. The
  change stays inside hook-runtime and an additive key. Old handlers are unaffected. It works for any
  tool kind, including `other`.
- **Cons**: a `node` process still starts for each call. A `hook <tool> was not loaded` notice is not
  repeated on a call that is skipped. It still appears on every other event.
- **Why chosen**: the issue allows this option, and it is the one that keeps the frozen contracts and
  the agreed decisions untouched.

### Alternative C: cache the subscriptions from the last load
- **Approach**: after a full load, write the handlers' kinds to the state folder, keyed by the lock's
  hash. Later calls read that cache.
- **Pros**: the declaration stays in handler code only.
- **Cons**: it needs cache invalidation and locking, and the first call still loads everything. A
  stale cache is a silent way to miss an edit.
- **Why not chosen**: it has more moving parts than B for the same saving, and it can fail silently.

## Agreed Approach

Alternative B. The declaration lives in `tool.json` because that file is the only one the launcher can
read without starting a worker. The runtime already reads it in `loadHandlers`. `loadHandlers` attaches
the validated key to the started handler as an optional `Handler.tools`. For worker-loaded handlers only
`tool.json` supplies it; a `tools` export in `handler.mjs` is ignored. This is an additive change to the
provisional Hook handler interface. Dispatch then filters by it on both hosts, so the launcher's skip
and the dispatch result never disagree.

## Key Decisions

- **Key name and meaning:** `tools` in `tool.json`, a list of `shell | edit | read | other`. It applies
  only to `tool.before` and `tool.after`. If it is missing or invalid, the handler gets every kind. That
  fails open, so a malformed key never drops an edit.
- **Launcher fail-open:** if the lock or any `tool.json` cannot be read or parsed, the launcher loads as
  before, and the existing path reports the problem.
- **Where the skip runs:** in `claude.mts` `main`, after the checkout is resolved and after the
  delegation to another worktree, right before `loadHandlers`. The skip therefore reads the copy that
  would have run.
- **Trace:** with `AGENT_HARNESS_TRACE=1`, a skipped call writes `{event, processStart, receivedAt,
  settledAt, skipped: "no-subscriber", outcomes: {}}` and no `handlersLoadedAt`. This is the "trace"
  proof that the criterion asks for.
- **Migration:** none needed. `update` ships the new launcher and the new verify-gate `tool.json`. With
  an old launcher and a new gate, the old launcher ignores the key. With a new launcher and an old gate
  that has no key, every call still loads. `check` is unchanged.
- **Versions:** hook-runtime 0.1.3 → 0.1.4, verify-gate 0.2.2 → 0.2.3.

## Open Questions

- The veles measurement needs a throwaway veles clone with the harness installed from this branch's
  assets. The local `~/repos/veles-android` is the source. If that cannot be done, the replay runs on a
  fixture repo that has the same sequence, and the PR says so.
