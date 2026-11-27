## Why

On Claude Code every tool call starts two hook processes, and each one loads every installed handler before it dispatches. The verify gate, the only handler, acts on shell and edit calls only, but a `Read`, `Glob`, `Grep` or MCP call pays the same 0.2 to 0.3 s per process. In veles the warm sequence went from 3.33 s to 8.15 s (raidenyn/veles-android#197). The owner parked this as an optional M1 hardening fix, issue #61.

## What Changes

**Tool kinds a handler needs**
- From: a handler subscribes to events only, and gets every tool call on `tool.before` and `tool.after`.
- To: a handler tool may declare `"tools": [<kind>, ...]` in its `tool.json`. Dispatch then calls it on `tool.before`/`tool.after` only for those kinds. Without the key, or with an invalid key, it gets every kind, as today.
- Reason: the launcher can read `tool.json` without loading handlers.
- Impact: non-breaking. It is an additive optional key, and the Hook handler interface gains an optional `tools` field.

**Claude Code launcher skips unneeded tool calls**
- From: `claude.mjs` loads all handlers for every tool event.
- To: before it loads handlers, `claude.mjs` reads the lock and each locked tool's `tool.json`. When no handler tool can want the call's tool kind, it returns with empty output and records `skipped: "no-subscriber"` in the trace. If any of those files cannot be read, it loads handlers as before.
- Reason: this removes the per-call handler load without changing any repository's hook config.
- Impact: non-breaking. `.claude/settings.json` is unchanged, `update` needs no migration, and `check` is unchanged.

**The verify gate declares its kinds**
- The verify gate's `tool.json` declares `"tools": ["shell", "edit"]`. Edits, shell calls and ticks reach it as before.

**Versions:** hook-runtime 0.1.4, verify-gate 0.2.3.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-hook-runtime`: handler loading and dispatch honours a handler's declared tool kinds. The Claude Code entry returns without loading handlers for a tool call that no handler tool needs.
- `verify-gate-triggers`: the verify gate declares the tool kinds it needs (`shell`, `edit`).

## Impact

- Code: `src/hook-runtime/claude.mts`, `src/hook-runtime/lib/runtime.mts`, `src/shared/lib/handler.types.mts`, `src/shared/lib/lock.types.mts`, `src/verify-gate/tool.json`, the version bumps in both `tool.json` files, and the rebuilt assets plus `.agents/harness/` through `pnpm run harness:update`.
- Docs: `skills/agent-harness-hook-runtime/SKILL.md`. It covers the handler `tool.json` shape, the interface block and when the `was not loaded` notice appears, which is no longer on a skipped call. The trace comment in `runtime.mts` also changes.
- Tests: `tests/agent-harness/`, which adds launcher skip and dispatch-filter tests. Existing tests stay unchanged.
- Contracts: Hook handler interface, additive only. Vendored tool layout and Skill names are unchanged.
