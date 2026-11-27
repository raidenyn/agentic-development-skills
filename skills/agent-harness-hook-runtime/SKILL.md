---
name: agent-harness-hook-runtime
description: "Use when wiring agent hooks for Claude Code and OpenCode into a repo, onboarding, updating or removing the agent harness hook runtime, writing a hook handler for it (tool.before, tool.after, prompt, turn.end, compact, session.start), or checking which hook events and capabilities a host supports. Also use when an agent harness hook failed and printed a notice, or before installing the verify gate."
---

# Agent harness hook runtime

A small Node runtime that is copied into a repo, under `.agents/harness/hook-runtime/`, and wired to the hooks of Claude Code and OpenCode. It turns each host's hook calls into six host-neutral events and runs the installed handlers on them. The handlers never see a host API. The first handler is the verify gate (skill `agent-harness-verify-gate`).

Before starting an agent in a clone you do not trust, read its `.claude/settings.json`, `opencode.json`, `.agents/harness.json` and `.agents/harness/`, and the scripts the `verify-gate.command` in `.agents/harness.json` runs: these hooks run code on every tool call, and that command runs on the first edit and at every turn end.

## When to use

- A repo should get agent hooks: install this runtime first, then the handlers (the verify gate refuses to install without it).
- You are writing a handler and need the event, result and context shapes.
- A hook printed `hook <name> failed on <event>: ...`, or you need to know whether a host can deny, block or re-deliver context.
- A new runtime version should be brought into a repo, or the hooks should be removed.

## What it installs

The tool runs on Node 22.0.0 or newer, has no npm dependencies, and uses plain `.mjs` files.

| Path | What it is |
|---|---|
| `.agents/harness/hook-runtime/` | The copied tool. Never edit it: `check` and every later `install` or `update` refuse an edited copy. |
| `.agents/harness/lock.json` | One entry per tool: `{version, files: {relpath: sha256}}`. Handlers load only when their copy matches it. |
| `.agents/harness.json` | Config, one top-level key per tool. `install` adds `"hook-runtime": {}`. |
| `.claude/settings.json` | One hook entry per Claude Code event, all running `node "$CLAUDE_PROJECT_DIR/.agents/harness/hook-runtime/claude.mjs"`. |
| `opencode.json` | `./.agents/harness/hook-runtime/opencode` added to `plugins`. |
| `<git dir>/agent-harness/<tool>/` | Runtime state per tool and per session. It is outside the work tree and never committed. |

Claude Code hook timeouts written by `install`: `PostToolUse`, `PostToolUseFailure`, `Stop` and `SubagentStop` 1800 s; `PreToolUse`, `UserPromptSubmit`, `PreCompact` and `SessionStart` 10 s.

The runtime's own config key is `hook-runtime.deadlines`: `{"<event>": milliseconds}`. It overrides the 5 s default deadline for events where a handler declares no `timeouts` of its own. Unknown keys and unknown events fail `check`.

## Handler interface

A handler is its own tool folder `.agents/harness/<name>/` with a lock entry, a `tool.json` of `{"name", "version", "handler": true, "tools"?}` and a `handler.mjs` whose default export is the handler object. The verify gate (`skills/agent-harness-verify-gate/assets/verify-gate/`) is the reference: its `cli.mjs` installs it with the shared `lib/install.mjs`. A tool without `"handler": true` is not loaded. A copy that differs from its lock is not loaded, and a `hook <tool> was not loaded` notice says why: on Claude Code at every event that has a channel and reaches handler loading, on OpenCode at `session.start`. A tool call whose kind every installed handler's `tools` list provably excludes returns before handlers load and prints nothing.

```
handler: { name, events, handle(event, context) -> result | null,
           proofs?: { name: check(context) -> null | failure text },
           timeouts?: { <event>: ms },          // addition: per-event deadline
           tools?: [kind],                      // addition, from tool.json
           manual?: text }                      // addition: what to do by hand when the handler fails
event:   { type: tool.before | tool.after | prompt | turn.end | compact | session.start,
           host: "claude-code" | "opencode",
           tool?: { name, kind: shell|edit|read|other, input, callId },   // callId: addition
           command?, files?, prompt?, afterCompact?,
           background? }                        // addition, turn.end: running subagents of this agent
result:  { deny: text } | { context: text }
       | { block: text, ack?: () -> void, release?: () -> void }        // ack, release: additions
context: { repoRoot, host, sessionId, agentId, deadline, signal, stateDir, config,
           proof(name), trace(outcome) }        // signal, trace: additions
```

The names marked as additions are optional and extend the RFC's handler shape without changing it.

- **`events`** lists the types the handler wants. `handle` is called once per event, handlers one at a time in name order.
- **`tools`** lists the tool kinds (`shell`, `edit`, `read`, `other`) the handler needs on `tool.before` and `tool.after`. Only a non-empty list of known kinds filters: a missing key, an empty array, a non-array value or an unknown kind means every kind is eligible. When it filters, a tool call of another kind is not dispatched to the handler. On Claude Code, handler loading is skipped only when every installed handler's `tool.json` proves it excludes the call's kind; a lock or `tool.json` read or parse error loads handlers as before.
- **`tool`** is set on `tool.before` and `tool.after`. `command` is set for shell calls. `files` lists repo-relative paths for edit calls; paths outside the repo are dropped. On OpenCode a `patch` call lists its files only at `tool.after`, so its `tool.before` has `files: []`. `callId` is the same on a call's `tool.before` and `tool.after`.
- **`afterCompact: true`** on `session.start` means the context was compacted. Re-deliver whatever the model must not forget.
- **`background`** is set at `turn.end`: the number of this agent's subagents still running. It is always 0 at a Claude Code subagent's turn end. A subagent's own turn end is a `turn.end` too, with `agentId` set to the subagent.
- **`repoRoot`** is the checkout the agent is in. On Claude Code, when the event's `cwd` is in another worktree of the session's repository (same git common directory), that is the worktree's top level, and the event runs from the worktree's own copy of the runtime, so its tools and `.agents/harness.json` apply. A worktree reached through a symlink keeps that spelling. Otherwise it is `$CLAUDE_PROJECT_DIR`, as given, or the git top level of `cwd` when `CLAUDE_PROJECT_DIR` is unset.
- **`sessionId`** is the root session. **`agentId`** is `"main"` for the root agent and the subagent's id otherwise. An identity that cannot be resolved is treated as a root.
- **`stateDir`** is `<git dir>/agent-harness/<tool>/sessions/<host>-<session>/<agent>`.
- **`config`** is the handler's own section of `.agents/harness.json`, read fresh for every event.
- **`deadline`** is the epoch ms after which the result is discarded. **`signal`** aborts at that moment; stop writing state when it does.
- **`proof(name)`** runs another handler's named check, such as `verify-pass`, and returns null or a failure text.
- **`trace(outcome)`** names what the handler did, for example `"no-change"`. With `AGENT_HARNESS_TRACE=1`, each event appends a line to `<git dir>/agent-harness/hook-runtime/trace.jsonl` with the timings and every handler's outcome.

Result kinds per event. Any other kind is dropped and reported as a hook failure.

| Event | Accepted result |
|---|---|
| `tool.before` | `deny` |
| `tool.after`, `prompt`, `session.start` | `context` |
| `turn.end` | `block`, `context` |
| `compact` | none |

When several handlers answer, any `deny` wins, and `block` and `context` texts are joined in handler-name order.

On a block, the runtime calls `ack` once the host accepted it and `release` when it is known not to have been delivered. Charge any limit before returning the block, confirm it in `ack` and refund it in `release`.

**Deadlines.** A handler's deadline is `timeouts[event]`, else `hook-runtime.deadlines[event]`, else 5000 ms. Each event also has a work deadline that the handler deadline cannot pass:
- On Claude Code, the work deadline is the host timeout minus 7 s. That leaves about 3 s for the 10 s events and 1793 s for the 1800 s ones.
- On OpenCode, the clock of a turn end starts when its queued entry starts running.

A handler that would start after the work deadline is skipped and reported. Loading a handler is bounded at 2 s.

**Fail open.** A throw, a rejection, a timeout or an invalid result skips that handler, and the host call proceeds. Where the event has a model channel, the model gets `hook <name> failed on <event>: <reason>.`, followed by the handler's `manual` text or `Do this step by hand.`.
- On Claude Code, a `PreToolUse` failure goes out as `additionalContext` with no permission decision, so the command still runs.
- On Claude Code, a `Stop` or `SubagentStop` notice is a `systemMessage`, which only the user sees. `PreCompact` notices are dropped.
- On OpenCode, a notice with no channel of its own, such as one at `tool.before` or after a failed tool call, is added to the system prompt at the session's next `context` hook.
- The Claude Code entry always exits 0.

**Workers.** Each handler runs in its own worker thread, with a pool of up to four per handler. A handler that loops synchronously, in its import or in `handle`, freezes only its own worker. At the deadline the worker is terminated and a fresh one serves later events.

Termination kills only the process groups that the supervisor started for that worker. The bundled handlers start their processes through the supervisor's `spawn` message, which is runtime-internal plumbing and not part of the published interface. A process that a handler starts itself with `child_process` is not tracked and is not killed at the deadline, so such a handler must stop its own children when `signal` aborts.

## Capabilities

`node .agents/harness/hook-runtime/cli.mjs capabilities` prints this table, the host version each row was verified on, and every installed handler event that needs a capability the host lacks. The same check runs at `session.start` and adds a context line when something is missing.

| Capability | Claude Code 2.1.332 | OpenCode 2.4.1 |
|---|---|---|
| deny before a command | `PreToolUse` `hookSpecificOutput.permissionDecision: "deny"` with `permissionDecisionReason` | throw `Error(text)` from the `execute.before` tool hook |
| text after a tool call | `PostToolUse` `hookSpecificOutput.additionalContext` | in `execute.after` with `status: "completed"`, append `{type: "text", text}` to `input.result.content` |
| block at turn end and continue | `Stop` or `SubagentStop` output `{decision: "block", reason}` | on `session.execution.succeeded`, `ctx.session.synthetic({sessionID, text, resume: true})` |
| re-deliver after compaction | `SessionStart` with `source: "compact"`, `additionalContext` | on `session.compaction.ended`, mark the session; at the next `context` hook, append the text to `input.system` |
| separate state per subagent | `agent_id` in the hook input | `ctx.session.get` returns `parentID` for a child session |

Event mapping:

| Event | Claude Code | OpenCode |
|---|---|---|
| `tool.before` | `PreToolUse` | `execute.before` |
| `tool.after` | `PostToolUse`, `PostToolUseFailure` | `execute.after` (any status) |
| `prompt` | `UserPromptSubmit` | session hook `prompt` |
| `turn.end` | `Stop`, `SubagentStop` (except compaction's own `agent_type: ""` agent) | `session.execution.succeeded`, detached and queued per session |
| `compact` | `PreCompact` | `session.compaction.started` |
| `session.start` | `SessionStart` | the first event seen for a session, and the next `context` hook after a compaction |

Tool kinds:

| Kind | Claude Code | OpenCode |
|---|---|---|
| `shell` | `Bash` | `shell`, `bash` |
| `edit` | `Edit`, `Write`, `MultiEdit`, `NotebookEdit` | `patch`, `edit`, `write` |
| `read` | `Read`, `Glob`, `Grep` | `read`, `glob`, `grep` |
| `other` | everything else, `Agent` included | everything else, `subagent` and `skill` included |

Host behaviour to know when you write a handler:
- **Subagents run in the background on both hosts.** A root turn end can come while a subagent still edits, which is what `background` is for. Both hosts start a new root turn when the subagent finishes.
- **On OpenCode, the parent is handed every round of a blocked subagent's work.** That includes the failing round before the fix, and the round after it.
- **On OpenCode, a superseded turn-end result is not delivered.** If a later turn has already started when the result is ready, `release` is called instead.
- **One-shot `opencode run --standalone` gets no turn-end checks or blocks.** The process exits when the session goes idle, which kills the detached turn-end check, and the turn ends unverified. Use the long-lived server (`opencode serve` or the TUI), or run `node .agents/harness/verify-gate/cli.mjs run` afterwards.
- **On OpenCode, context after a failed tool call is not delivered.** The model gets a notice that it was not delivered.
- **On Claude Code, the runtime follows the agent into a linked worktree of the same repository.** It reads the git top level and common directory of the event's `cwd`, with two git calls that run in parallel, each bounded at 2 s. A `cwd` in another repository, a separate clone or submodule, outside any checkout, or in a worktree without `.agents/harness/hook-runtime/`, gets no output at all. When git cannot answer, `$CLAUDE_PROJECT_DIR` is used. A tool call that moves the agent has its `tool.before` in the old checkout and its `tool.after` in the new one, and `session.start` does not repeat after a move. Commands still see the session's original `CLAUDE_PROJECT_DIR` in their environment. OpenCode's session directory does not move.

## Onboard

1. **Install.** From the installed skill folder, run `node <skill>/assets/hook-runtime/cli.mjs install --repo <repo>`. Without `--repo`, it uses the git checkout around the current directory.
   - It checks Node 22 and that the target is a git work tree. It copies the tool, merges both host configs and writes the lock last.
   - It refuses before writing anything if `.claude/settings.json` or `opencode.json` is not plain JSON, for example with comments. In that case it prints the entries to add by hand.
   - Running it twice changes nothing.
2. **Config.** `"hook-runtime": {}` needs nothing. Add `deadlines` only if a handler without its own `timeouts` needs more than 5 s.
3. **CI.** Add `node .agents/harness/hook-runtime/cli.mjs check` to CI. It exits 1 when a copied file is missing, extra or differs from the lock, or when the section has errors.
4. **Commit** `.agents/`, `.claude/settings.json` and `opencode.json`.
5. **Install handlers.** For example, run the `agent-harness-verify-gate` Onboard.
6. **Verify live.** Start a new session on each host the repo uses, then:
   - make one edit and let one turn end;
   - run `node .agents/harness/hook-runtime/cli.mjs capabilities`;
   - confirm that the handlers' effects show up and that no `hook ... failed` or `was not loaded` notice appears.
   - For timings, set `AGENT_HARNESS_TRACE=1` and read `trace.jsonl`.

## Update

1. **Update.** From the newer skill folder, run `node <skill>/assets/hook-runtime/cli.mjs update --repo <repo>`.
   - It replaces a copy whose files all match its lock, removes files the new version no longer has, rewrites the lock entry and merges the host configs again.
   - It refuses on an edited, missing or extra file, naming it. Restore the file with `git checkout -- .agents/harness/<tool>/<file>`, or delete the tool folder and its lock entry and install again. There is no override flag.
   - `install` refuses when a different version is installed, so use `update` for that.
2. **Review** the diff of `.agents/` and the host configs.
3. **Check.** Run `node .agents/harness/hook-runtime/cli.mjs check`.
4. **Restart host sessions.** OpenCode loads the plugin and the handler workers once per process, so restart it. Claude Code loads the runtime for each hook call.

In the skill's own source repo, `assets/hook-runtime/` is generated from TypeScript under `src/hook-runtime/`; edit the source, never the assets. When you change it, bump `version` in `src/hook-runtime/tool.json` by hand and rebuild. Nothing enforces the bump yet. The lock's per-file hashes still show an outdated copy in a target repo.

## Remove

1. Remove the handlers first, for example the verify gate. They do nothing without the runtime.
2. Delete `.agents/harness/hook-runtime/`, the `hook-runtime` entry in `.agents/harness/lock.json` and the `hook-runtime` key in `.agents/harness.json`.
3. Delete the hook entries in `.claude/settings.json` whose command is `node "$CLAUDE_PROJECT_DIR/.agents/harness/hook-runtime/claude.mjs"`, and `./.agents/harness/hook-runtime/opencode` from `plugins` in `opencode.json`.
4. Delete the `check` step from CI.
5. Optionally, delete `<git dir>/agent-harness/`.

Before starting an agent in a clone you do not trust, read its `.claude/settings.json`, `opencode.json`, `.agents/harness.json` and `.agents/harness/`, and the scripts the `verify-gate.command` in `.agents/harness.json` runs: these hooks run code on every tool call, and that command runs on the first edit and at every turn end.
