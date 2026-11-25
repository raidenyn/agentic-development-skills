# Host spike: OpenCode 2.4.1 and Claude Code 2.1.332

Run on 2026-11-25 on this server, in two throwaway git repos. This file is the evidence behind design D3
and D4. The payloads are saved, with paths replaced by `/REPO`, `/HOME` and `/SCRATCH`, in
`tests/agent-harness/fixtures/{opencode,claude}/`. The spike's own plugin, hook and configs are in
`tests/agent-harness/fixtures/spike/`, so anyone can repeat the runs.

Models: OpenCode `openai/gpt-6.2-sol-fast`, run with `opencode run --standalone --auto`. Claude Code
`haiku` (claude-haiku-5-5), run with `claude -p --permission-mode bypassPermissions`.

## Results by capability

| Capability | OpenCode 2.4.1 | Claude Code 2.1.332 |
|---|---|---|
| Plugin path | **Works.** `opencode.json` `"plugins": ["./.agents/harness/hook-runtime/opencode"]` loads `index.mjs` from that folder (V2 `{id, setup(ctx)}` default export) | n/a: `node "$CLAUDE_PROJECT_DIR/.agents/harness/hook-runtime/claude.mjs"` runs for every event from `.claude/settings.json` |
| Deny a command before it runs | **Works.** Throwing an `Error` from `ctx.tool.hook("execute.before")` fails the call, and the model sees the error message (`HARNESS_DENIED by spike plugin`). The command did not run | **Works.** `PreToolUse` output `{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason}}`. The model saw the reason; the command did not run |
| Add text after a tool call | **Works.** In `execute.after` with `status: "completed"`, the text reached the model after `shell`, `read` and `patch`. The spike appended a `{type: "text", text}` item to `input.result.content` **and** text to `result.output` together, so it does not show which of the two the model reads (see Limits) | **Works.** `PostToolUse` `hookSpecificOutput.additionalContext` reached the model after `Bash`, `Read`, `Edit` and `Agent`, and in the subagent after `Bash` and `Write` |
| Block at turn end and continue | **Works.** On the event `session.execution.succeeded`, `ctx.session.synthetic({sessionID, text, resume: true})` started a new turn, and the model answered the text (`BLOCKSEEN`). `opencode run` waited for the resumed turn | **Works.** `Stop` output `{decision: "block", reason}` continued the turn, and the model answered `BLOCKSEEN`. The following `Stop` carries `stop_hook_active: true` |
| Re-deliver after compaction | **Works.** `session.compaction.started` and `.ended` fire (the compaction was started with `ctx.session.compact({sessionID})`). After `.ended`, appending `{type: "text", text}` to `input.system` in `ctx.session.hook("context")` (called before every model request) gave the model a rule it then applied: it answered the codeword `PINEAPPLE-7` | **Works.** `/compact` fires `PreCompact` (`trigger: "manual"`), then `SessionStart` with `source: "compact"`. Its `additionalContext` survived into the resumed session: the model answered `PINEAPPLE-7` |
| Separate state per subagent | **Works.** A subagent is a child session. `ctx.session.get({sessionID})` returns `parentID` for it and none for the root. Its tool calls carry the child `sessionID` and `agent: "general"` | **Works.** Every subagent hook input carries `agent_id` (for example `acce120c0d6e8559b`) and `agent_type`; the root agent's input has neither |

All five capabilities that the Hook handler interface requires work on both hosts. None is missing.

## Findings that change the design

1. **OpenCode tool names**: `shell` (`bash` is an alias), `read`, `patch` (every edit, add or delete
   file in these runs), `skill`, `subagent`. A `patch` result lists its files in
   `result.metadata.files[]` (`{file, status: "added"|"modified"|"deleted"}`, relative paths). Its input
   is a `patchText`, not a path.
2. **Claude Code tool names**: `Bash`, `Read`, `Edit`, `Write`, `Agent` (not `Task`). Edit paths are
   absolute (`tool_input.file_path`).
3. **Subagents run in the background on both hosts.** Claude Code's `Agent` call returned
   `status: "async_launched"`, and the main `Stop` fired while `background_tasks` listed the subagent as
   `running`. When the subagent finished, a `<task-notification>` prompt started a new main turn, which
   ended in another `Stop`. OpenCode's `subagent` call returned at once too. The root's
   `session.execution.succeeded` fired before the child finished, and the root ran a second turn
   when it did. **A turn end can therefore come while a subagent is still editing.**
4. **Compaction runs an internal subagent on Claude Code.** `/compact` fired a `SubagentStop` with an
   `agent_id` and `agent_type: ""`, and its last message is the compaction summary. It is not a real
   subagent turn end.
5. **OpenCode `session.created` is seen only for child sessions.** The root session is created before the
   plugin subscribes. The root's start must be detected as the first event seen for that session.
6. **Claude Code runs project hooks in `-p` mode with no trust prompt**, which is what the
   untrusted-checkout warning is about.

## Tree id timing (D4)

Measured with git 2.x on this server, five runs each:

| Method | this repo (64 files) | veles-android (3,708 tracked, 5,699 untracked) |
|---|---|---|
| Copy `.git/index` each time, `add -A`, `write-tree` | 49–63 ms | 2,129–2,587 ms (17 s on a cold cache) |
| Keep a private index in the state folder, `add -A`, `write-tree` | not measured; cannot be slower than the copy | 124–191 ms after the first build |
| `git status --porcelain` (reference) | | 39–42 ms |
| `node -e ""` startup (reference) | 68 ms | |

A fresh copy of the real index has to re-hash everything git cannot trust from its stat cache. A
private index that is kept and refreshed only re-reads files whose stat data changed. **Decision: keep
the private index in the gate's state folder.** Its first build is slow, and every later one is
incremental.

**For the veles onboarding task:** veles has 5,699 untracked, non-ignored files (for example
`app/build/extracted-include-protos/…`). They count as working-tree content, so they slow the tree id and
invalidate passes when a build rewrites them. That onboarding should add them to `.gitignore`.

## Follow-up spike (after Sol's re-check, same day)

- **A slow `execute.after` is awaited.** An OpenCode 2.4.1 plugin slept 40 s in `execute.after` for `skill`
  and for `patch`. The tool call waited both times (log timestamps 40.0 s apart), the run finished
  normally, and text appended **only to `result.content`** reached the model (`HARNESS_SLOW_AFTER done`).
  So a full run inside `tool.after` is possible, and `content` alone is the channel. Hooks longer than
  40 s were not tried. Plugin: `fixtures/spike/opencode-slow-after.mjs`.
- **Tick payloads, untruncated.** `fixtures/opencode/execute.after-patch-tick.json`: a real `patch` that
  ticks `1.2` in a six-line `tasks.md`; `metadata.files[].patch` is a full unified diff with the
  `-- [ ] 1.2…` / `+- [x] 1.2…` pair. `fixtures/claude/PostToolUse-Edit-tick.json`: the same tick through
  `Edit`; `tool_response` has `originalFile`, `oldString`, `newString` and `structuredPatch` (hunks
  with `-`/`+` lines).
- **Fixture trimming.** Every other fixture has strings cut at 600 characters (and the first spike's log
  at 400), so their `patch` texts are incomplete. Only the two `*-tick` fixtures carry whole diffs.
- **Tree id cost with a stat digest** (design D4), veles. This is an *estimate*: it used git's `ls-files --debug` stat data, while the shipped key uses filesystem `lstat`, and it includes no worker startup or messaging. Task 9's bench measures the shipped path: building the private index from `HEAD` cold
  4,920 ms once; warm `add -A` + `write-tree` + `ls-files -s --debug` digest 151–287 ms.

## Subagent block on OpenCode (after Sol's round 5)

Plugin: `fixtures/spike/opencode-child-block.mjs`. It waits 3 s after a child session's
`execution.succeeded`, as a slow verify would, and then sends the child a resuming block. Event log:
`fixtures/opencode/child-lifecycle.jsonl` (ms from start).

- 13.5 s: the child's first turn ends (`execution.succeeded`). 16.5 s: the block is sent. At the same
  moment the parent is handed the child's **pre-fix** result (`inbox.enqueued` and `execution.started`
  on the root), and runs a turn on it (16.5–19.4 s) while the child, resumed by the block, fixes its work
  (16.6–22.6 s).
- 22.6 s: the child goes idle again. OpenCode hands the parent the child's result a **second** time
  (22.6 s), and the parent's final answer reports the fixed file (`START`, `FIXED`).

This matches the OpenCode `subagent` tool text in the launch result: the parent "will receive a
`<background-result>` message when it goes idle, and again after each later round of work". **So on
OpenCode a blocked subagent does not fix its work before reporting.** The parent sees each round,
including the failing one, and is re-notified after the fix. What the owner's decision needs still
holds: the child's turn end runs the gate and is blocked, and the root's own turn end verifies the final
tree. The design states this as a host limit (D5).

## Limits of this spike (from Sol's review)

- The OpenCode plugin marked compaction at both `started` and `ended` and never cleared the mark. One-shot
  re-delivery after `ended` is the shipped design and must be shown in the shipped live run.
- The resume after a block was immediate. The spike does not show that a resume sent after a slow,
  detached verify still continues the session, or what happens when a new turn ends while the verify
  is in flight. Task 12 tests both with a command that takes 20 s.
- The saved `event-session.execution.started` and `.succeeded` fixtures come from a root session, not the
  child that the `subagent` launch result names. The spike log does show that child's own
  `execution.succeeded` (run 2), but no correlated launch, finish and cancel sequence was saved, and no
  cancelled child was tried. Task 12 captures one.

## Not tested live

- OpenCode `execute.after` with `status: "error"` (only a completed result was changed). The runtime
  delivers context only after completed calls; a failed call's context is reported as not delivered.
- `{context}` at `prompt` on OpenCode. It uses the same `context` hook path as re-delivery, which was
  tested. No M1 handler returns prompt context.
- The 300 ms target end to end. The bench task measures it once the gate exists.
