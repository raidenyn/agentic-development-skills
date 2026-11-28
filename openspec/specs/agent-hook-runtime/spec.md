# agent-hook-runtime Specification

## Purpose

One hook runtime that connects Claude Code and OpenCode to installed handlers. It turns host events into six normalized events, runs each handler in a worker under a supervisor with deadlines so a failing handler never blocks the host, resolves named proofs, and reports which host capabilities are available.

## Requirements

### Requirement: Six normalized events
The hook runtime SHALL turn host events into exactly six event types: `tool.before`, `tool.after`, `prompt`, `turn.end`, `compact` and `session.start`. Each tool event SHALL carry the tool's raw name, a kind (`shell`, `edit`, `read`, `skill` or `other`) and its input. An edit event SHALL carry the edited paths relative to the repo root, dropping paths outside it, and a shell event SHALL carry the command. The Claude Code `Skill` tool and the OpenCode `skill` tool SHALL have kind `skill`.

#### Scenario: Claude Code edit becomes tool.after
- **WHEN** `claude.mjs` receives a `PostToolUse` payload for the `Edit` tool with `tool_input.file_path` inside the repo
- **THEN** handlers receive `{type: "tool.after", tool: {kind: "edit"}, files: ["<relative path>"]}`

#### Scenario: Path outside the repo
- **WHEN** an edit event names a file outside the repo root
- **THEN** that path is not in `files`

#### Scenario: Skill tool kind
- **WHEN** `claude.mjs` receives a `PreToolUse` for the `Skill` tool, or the OpenCode plugin's `execute.before` runs for the `skill` tool
- **THEN** handlers receive a `tool.before` whose `tool.kind` is `skill`

### Requirement: Claude Code entry
On Claude Code, one command, `node "$CLAUDE_PROJECT_DIR/.agents/harness/hook-runtime/claude.mjs"`, SHALL handle every hook event, dispatching on `hook_event_name`: `PreToolUse` to `tool.before`, `PostToolUse` and `PostToolUseFailure` to `tool.after`, `UserPromptSubmit` to `prompt`, `Stop` and `SubagentStop` to `turn.end`, `PreCompact` to `compact`, and `SessionStart` to `session.start`.

#### Scenario: Failed tool call
- **WHEN** a `Bash` call changes a file and then exits non-zero, so Claude Code sends `PostToolUseFailure`
- **THEN** handlers receive `tool.after` for that call

#### Scenario: Compaction source
- **WHEN** `SessionStart` arrives with `source: "compact"`
- **THEN** handlers receive `session.start` with `afterCompact: true`

#### Scenario: Compaction's internal agent is not a turn end
- **WHEN** `claude.mjs` receives a `SubagentStop` with `agent_type: ""`
- **THEN** no handler is called and the output is empty

### Requirement: OpenCode entry
On OpenCode, the host SHALL import the plugin `.agents/harness/hook-runtime/opencode/index.mjs`. It SHALL map the `execute.before` and `execute.after` tool hooks, the `prompt` session hook, the `session.execution.succeeded` event (turn end) and the `session.compaction.started` event to the six types, and the first event seen for a session to `session.start`.

#### Scenario: OpenCode turn end becomes turn.end
- **WHEN** the OpenCode plugin observes a `session.execution.succeeded` event for a session
- **THEN** handlers subscribed to `turn.end` are called once for that session, detached from the event stream

#### Scenario: First event starts a session
- **WHEN** the first event the plugin sees for a root session is a `prompt`
- **THEN** handlers receive `session.start` for that session before the `prompt`

### Requirement: Running subagents
A `turn.end` SHALL carry `background`, the number of the ending agent's subagents still running. On Claude Code it SHALL be read from a `Stop` payload's `background_tasks`, and SHALL be 0 at a `SubagentStop`. On OpenCode it SHALL come from each child's own lifecycle events, in arrival order, with the `subagent` launch result used only for a child whose lifecycle has not been seen yet.

#### Scenario: Running subagents are counted
- **WHEN** a `Stop` payload lists one `background_tasks` entry of type `subagent` with status `running`
- **THEN** handlers receive `turn.end` with `background: 1`

#### Scenario: A fast child
- **WHEN** a child's `session.execution.succeeded` is processed before the launch result that reports it running
- **THEN** the child counts as idle

### Requirement: Handler loading and dispatch
The runtime SHALL load `handler.mjs` from `.agents/harness/<tool>/` for each tool in `.agents/harness/lock.json` whose `tool.json` declares `"handler": true`. When it loads handlers, it SHALL skip, with a reported failure, a handler whose copied files do not match the lock. It SHALL call handlers in process, in name order, only for the events they list, and on `tool.before` and `tool.after` only for the tool kinds they declare.

#### Scenario: Tampered handler is not loaded
- **WHEN** an installed handler file differs from its lock hash
- **THEN** the runtime does not import it and reports that the tool's copy differs from the lock

#### Scenario: Declared kinds filter tool events
- **WHEN** a handler whose `tool.json` declares `"tools": ["shell", "edit"]` subscribes to `tool.after`, and a `tool.after` with kind `read` is dispatched
- **THEN** that handler is not called, and its outcome is absent from the dispatch result

### Requirement: Result kinds and merging
`tool.before` SHALL accept `deny`; `tool.after`, `prompt` and `session.start` SHALL accept `context`; `turn.end` SHALL accept `block` or `context`; `compact` SHALL accept none. An invalid kind SHALL be discarded and reported. When several handlers answer one event, any `deny` SHALL win, and `block` and `context` texts SHALL be joined in handler-name order.

#### Scenario: Two handlers add context
- **WHEN** two handlers both return `{context}` for one `tool.after`
- **THEN** the host receives both texts, in handler-name order

#### Scenario: Invalid kind
- **WHEN** a handler returns `{deny}` at `turn.end`
- **THEN** nothing is denied and a failure notice names the handler

### Requirement: Handler context
Every `handle` call SHALL receive the repo root, the host name, the session id, the agent context id (`main` for the root agent, a subagent's own id otherwise), a deadline and an abort signal that fires at it, a state folder unique to (tool, host, session, agent context) under `<git-dir>/agent-harness/`, the tool's config section, `proof(name)`, and `trace(outcome)`.

#### Scenario: Subagent state is separate
- **WHEN** the root agent and a subagent of the same session trigger the same handler
- **THEN** the two calls receive different agent context ids and different state folders

### Requirement: Result delivery on Claude Code
On Claude Code, the runtime SHALL write the host's hook JSON: a `PreToolUse` deny decision, `additionalContext` for context, and `{decision: "block", reason}` for a block. A turn-end notice or turn-end context SHALL be a `systemMessage`, which reaches the user only, and a `PreCompact` notice SHALL be dropped. It SHALL flush the output and exit 0 on every path. It SHALL call a block result's `ack` after the output is written, and its `release` on any path that does not write it.

#### Scenario: Deny before a command on Claude Code
- **WHEN** a handler returns `{deny: "no"}` for a `PreToolUse` of `Bash`
- **THEN** `claude.mjs` prints a `PreToolUse` output whose permission decision is deny with reason `no`, and exits 0

### Requirement: Result delivery on OpenCode
On OpenCode, the runtime SHALL deny by throwing an `Error` with the text from `execute.before`. It SHALL add context after a completed tool by appending a text item to the result's `content`, and deliver `prompt` and `session.start` context by appending a text item to `system` at the next `context` session hook. It SHALL turn a block into a synthetic message that resumes the session, and SHALL call the block's `ack` after that message is accepted and its `release` if it is rejected.

#### Scenario: Deny before a command on OpenCode
- **WHEN** a handler returns `{deny: "no"}` for `execute.before` of `shell`
- **THEN** the plugin throws an `Error` whose message is `no`, and the command does not run

#### Scenario: Block at turn end on OpenCode
- **WHEN** a handler returns `{block: "fix it"}` for `turn.end` on OpenCode
- **THEN** the plugin sends a synthetic message with text `fix it` that resumes the session

### Requirement: OpenCode notices
On OpenCode, turn-end context and notices SHALL be sent as a synthetic message that does not resume the session. A notice of an event with no channel of its own (`tool.before`, `compact`, a failed tool call) SHALL be appended to `system` at that session's next `context` hook call.

#### Scenario: Turn-end notice on OpenCode
- **WHEN** a handler returns `{context: "note"}` for `turn.end` on OpenCode
- **THEN** the plugin sends a synthetic message with text `note` that does not resume the session

#### Scenario: Notice before a command on OpenCode
- **WHEN** a handler throws during `execute.before`
- **THEN** the command runs, and the notice is appended to `system` at that session's next `context` hook call

### Requirement: OpenCode turn-end slot
On OpenCode, turn-end work SHALL run detached, one slot per session. Turn ends that arrive while the slot is busy SHALL be queued in order, and each SHALL run. A result whose start generation was overtaken by a newer `session.execution.started` SHALL NOT be delivered as a block, and its `release` SHALL be called.

#### Scenario: A later turn fixes the tree
- **WHEN** turn A's slow run fails and turn B starts and fixes the tree before A's result is ready
- **THEN** A's block is not delivered, its `release` is called, and B's run verifies the fixed tree

#### Scenario: Two turn ends during one run
- **WHEN** turn ends B and C arrive while A's run is in flight
- **THEN** both run after A, in order, and only a result whose generation is current is delivered as a block

### Requirement: Stale text of a result
A `block` or `context` result MAY carry a string `stale`, the text to show if the result is superseded. The runtime SHALL keep it and SHALL join the `stale` texts of all handlers into the merged result's `stale`, in handler-name order. Claude Code SHALL ignore it.

#### Scenario: Stale texts are kept and joined
- **WHEN** two handlers return `{block, stale}` and `{context, stale}` for one `turn.end`
- **THEN** the merged result's `stale` holds both `stale` texts, in handler-name order

### Requirement: Superseded results shown as a notice
When an OpenCode turn-end result is superseded, its merged `stale` is not empty, the plugin is not disposed, and no later turn end is queued for the session, the plugin SHALL send the `stale` text as a synthetic message with `resume: false` before calling `release`. In every other superseded case it SHALL send nothing.

#### Scenario: A superseded result with no later turn end is shown
- **WHEN** turn A's slow run fails with a `stale` text, and a new turn has started but not ended when the result is ready
- **THEN** one synthetic message with `resume: false` and exactly the `stale` text is sent, and A's `release` is called

#### Scenario: A superseded result with a queued turn end is dropped
- **WHEN** turn A's slow run fails with a `stale` text while turn end B is queued behind it
- **THEN** nothing is sent for A, A's `release` is called, and only B's result is delivered

#### Scenario: No stale text
- **WHEN** a superseded result carries no `stale`
- **THEN** nothing is sent and its `release` is called

### Requirement: Re-delivery after compaction
After a compaction, the runtime SHALL dispatch `session.start` with `afterCompact: true` before the model's next request and deliver its context. On OpenCode it SHALL record the compaction in the session's state folder on `session.compaction.ended`, and SHALL dispatch and deliver once, at the next `context` hook call for that session.

#### Scenario: OpenCode re-delivery
- **WHEN** `session.compaction.ended` arrives for a session and a handler returns `{context: "rule"}` for `session.start` with `afterCompact`
- **THEN** the next `context` hook call for that session has `rule` appended to `system`, and later calls do not repeat it

### Requirement: Fail open
When a handler throws, rejects, returns an invalid value or passes its deadline, the host call SHALL proceed as if that handler had returned null. On an event with a model channel, the model SHALL be told which hook failed, on which event, and what to do by hand, using the handler's `manual` text when it has one. On Claude Code, any runtime failure SHALL still exit 0.

#### Scenario: Notice after a failed OpenCode tool
- **WHEN** a handler throws during `execute.after` of a call whose status is `error`
- **THEN** the notice is appended to `system` at that session's next `context` hook call

#### Scenario: Handler throws on tool.after
- **WHEN** a handler throws during `tool.after`
- **THEN** the tool result reaches the model unchanged plus a line `hook <name> failed on tool.after: <reason>` and the manual instruction

#### Scenario: Failure before a command on Claude Code
- **WHEN** a handler throws during `PreToolUse`
- **THEN** `claude.mjs` prints `additionalContext` with the failure notice and no permission decision, and the command runs

#### Scenario: Broken runtime config on Claude Code
- **WHEN** `.agents/harness.json` is not valid JSON and a `Stop` event arrives
- **THEN** `claude.mjs` exits 0 without blocking

### Requirement: Handlers in workers under a supervisor
On both hosts, each handler SHALL run in its own worker thread under the adapter's main thread (the supervisor). The supervisor SHALL terminate a worker whose handler passes its deadline, and start a fresh one for later events. A worker SHALL NOT spawn processes or take the gate lock itself. The supervisor SHALL do both on its behalf, and SHALL kill those processes and release those locks when the worker ends.

#### Scenario: Synchronous loop
- **WHEN** a handler runs `while (true) {}` before its first `await` during `tool.before`, on either host
- **THEN** the command runs after the handler's deadline, the failure notice is given where the event has a channel, and the next event is handled by a fresh worker

#### Scenario: Termination during a git write
- **WHEN** a worker is terminated while its private-index `git add` runs
- **THEN** no git process keeps running, the gate lock is released, and the next run is not blocked by `index.lock`

#### Scenario: A killed hook process leaves its groups running
- **WHEN** the Claude Code hook process is killed with SIGKILL while its verify command runs
- **THEN** the verify command's process group is still alive afterwards

### Requirement: Reaping a dead holder's groups
Before the supervisor takes a gate lock for a worker, it SHALL check the newest lock in that directory. If that lock is not released, its holder `pid` is dead, and it was taken less than 24 hours ago, the supervisor SHALL first terminate the recorded `pgids` of that lock that it is allowed to signal. Groups that answer EPERM SHALL be skipped.

#### Scenario: The next run reaps an orphan
- **WHEN** a Claude Code hook process was killed with SIGKILL while its verify command ran, and a later turn end runs in the same repository
- **THEN** the orphaned group is gone before the later run's verify command starts

#### Scenario: A released or live lock is not reaped
- **WHEN** the newest lock is released, or its holder `pid` is alive
- **THEN** no group is signalled

#### Scenario: An old lock is not reaped
- **WHEN** the newest lock's holder is dead and the lock was taken more than 24 hours ago
- **THEN** no group is signalled and the lock is taken as before

### Requirement: Bounded reap
The reap SHALL send SIGTERM and then SIGKILL, bounded by the requesting event's deadline, and SHALL always send SIGKILL before it gives up. If the event ended during the reap, the supervisor SHALL reply with an error and SHALL NOT take the lock. If a reaped group is still alive, it SHALL reply that the lock is busy. Otherwise it SHALL take the lock as before.

#### Scenario: A reap that outlives its event
- **WHEN** an event ends while the supervisor is still terminating a dead holder's group that ignores SIGTERM
- **THEN** the acquisition answers with an error, no unreleased lock is left, and the group ends up dead

### Requirement: No group runs before it is recorded
When the supervisor spawns a process for a worker, it SHALL write the new process group's pgid into the `pgids` of every gate lock it holds before the requested command starts. Until then the group SHALL NOT run the requested command.

#### Scenario: A SIGKILL right after the command starts
- **WHEN** a Claude Code hook process is killed with SIGKILL as soon as its verify command has started and written its own pid
- **THEN** the newest gate lock already lists that command's pgid, and the next turn end in the same repository reaps it before its own verify command runs

#### Scenario: The command waits for the release
- **WHEN** a spawned process has started but the supervisor has not yet released it
- **THEN** the requested command has not run

### Requirement: An unrecorded group never runs
If a gate lock cannot be written during a spawn, the supervisor SHALL NOT run the requested command, SHALL kill the group, and SHALL answer the spawn with an error once the group is gone. If the supervisor process dies before it releases a spawned process, that process SHALL exit without running the requested command.

#### Scenario: The lock cannot be written
- **WHEN** writing the pgid into a held gate lock fails during a spawn
- **THEN** the requested command never runs, and the spawn answers with an error after the group is gone

#### Scenario: The supervisor dies before the release
- **WHEN** the supervisor's side of the release channel closes before the release
- **THEN** the spawned process exits without running the requested command

### Requirement: Spawn results are unchanged
A spawn through the supervisor SHALL return the same results as a direct spawn of the command in its own group: its pid as `pgid`, its output, its exit code or signal, and `timedOut` when its timeout fires. A missing command, a non-executable file, and a missing `cwd` SHALL each be answered with an error that names the command. An empty command name SHALL get the same invalid-argument error a direct spawn gives; a name beginning with `-` SHALL get `spawn <name> ENOENT`.

#### Scenario: Results of a command
- **WHEN** a worker spawns a command that prints its own pid, writes to stdout and stderr, and exits 3
- **THEN** the result has code 3, the output, and a `pgid` equal to the printed pid

#### Scenario: A timeout
- **WHEN** a worker spawns `sleep 30` with `timeoutMs` 100
- **THEN** the result reports `timedOut` and signal SIGTERM

#### Scenario: A missing command
- **WHEN** a worker spawns a command that is not on PATH
- **THEN** the spawn answers with an error naming the command and ENOENT

#### Scenario: A command that is not executable
- **WHEN** a worker spawns a path to a file without execute permission
- **THEN** the spawn answers with an error naming the command and EACCES

#### Scenario: An invalid working directory
- **WHEN** a worker spawns a command with a `cwd` that does not exist
- **THEN** the spawn answers with an error that names the command, not the shell

### Requirement: Claude Code entry cleans up on signals
When `claude.mjs` runs as a script and receives SIGTERM, SIGHUP or SIGINT, it SHALL close every runtime it started in this process with a cleanup deadline of 4.5 seconds, including that of a delegated checkout whose copy supports it, so that the groups are killed and the locks are released. Calling `main()` in-process SHALL NOT install signal listeners.

#### Scenario: SIGTERM during a verify run
- **WHEN** the hook process receives SIGTERM while its verify command runs
- **THEN** within 6 seconds the command's group is gone and its gate lock is released

#### Scenario: A command that traps SIGTERM
- **WHEN** the verify command ignores SIGTERM and the hook process receives SIGTERM
- **THEN** the group is killed with SIGKILL

### Requirement: Exit after a signal
After a signal, the Claude Code entry SHALL exit 0 within 5 seconds and SHALL write nothing to stdout. If `main()` has already returned a result that is not yet delivered, the entry SHALL call that result's `release`, bounded by 1 second, before it closes the runtimes, and SHALL NOT call `ack`. A charge made by a handler that is terminated before it returns SHALL stay, as the charge rules already say. A second signal SHALL make it exit at once.

#### Scenario: Quiet exit
- **WHEN** the hook process receives SIGTERM while its verify command runs
- **THEN** it exits 0 within 5 seconds with empty stdout

#### Scenario: An undelivered block is released first
- **WHEN** a signal arrives after `main()` returned a block and before it was written
- **THEN** that block's `release` is called before the runtimes are closed, and `ack` is never called

### Requirement: Worker messages
Every message between the supervisor and a worker SHALL carry the worker generation and the request id of its event. Messages from an ended event or a replaced worker SHALL be dropped. A proof request SHALL be answered by the worker of the handler that registered the proof, under the requesting event's deadline.

#### Scenario: Late trace
- **WHEN** a terminated event's worker posts a `trace` after a new event started
- **THEN** the trace is not credited to the new event

### Requirement: Event deadline
Each handler SHALL get a work budget: its `timeouts[event]`, else `hook-runtime.deadlines[event]`, else 5 seconds. Cleanup of its child processes and writing the output SHALL get a separate budget after it, within the host's limit. A result that settles after the work budget SHALL be discarded.

#### Scenario: Handler exceeds its deadline before a command
- **WHEN** a handler does not settle before its deadline at `tool.before`
- **THEN** the command runs (no deny)

#### Scenario: Timeout on a text event
- **WHEN** a handler never settles at `tool.after` in a spawned `claude.mjs` with no other live handle
- **THEN** the process prints the failure notice and exits 0

#### Scenario: Late block
- **WHEN** a handler returns `{block}` half a second after its deadline
- **THEN** the turn end is not blocked and a failure notice is given

#### Scenario: Stuck import
- **WHEN** a handler module's top-level `await` never settles
- **THEN** that handler is skipped after 2 seconds, and the others run

### Requirement: Bounded loading and queued budgets
Handler loading SHALL be bounded at 2 seconds on both hosts. A queued OpenCode turn end's budget SHALL start when it starts running, not when it arrived.

#### Scenario: Backlog
- **WHEN** three turn ends are queued behind a run that used almost all its budget
- **THEN** all three run with their full budgets

### Requirement: Named proofs
A handler SHALL be able to register named proofs, each a `check(context)` returning null when the proof holds or a failure text otherwise. The runtime SHALL resolve a proof by name for any handler. An unknown or throwing proof SHALL resolve to a failure text.

#### Scenario: Unknown proof
- **WHEN** a handler calls `context.proof("nope")`
- **THEN** it receives a failure text naming `nope` as not registered

### Requirement: Capability report
`node .agents/harness/hook-runtime/cli.mjs capabilities` SHALL print, per host adapter, the five capabilities, each marked supported or missing with the host version it was verified on. It SHALL list every installed handler event that needs a missing capability, and that SHALL also be added to the model context at `session.start`.

#### Scenario: Report lists both hosts
- **WHEN** `capabilities` runs in an onboarded repo
- **THEN** it prints a table for `claude-code` and `opencode` with all five capabilities and a verified host version for each

### Requirement: Claude Code follows the agent's checkout
When the payload's `cwd` is in a different worktree of the same repository as `CLAUDE_PROJECT_DIR` (equal git common directory and a different git top level, compared as real paths), the Claude Code entry SHALL hand the event to that worktree's own `.agents/harness/hook-runtime/claude.mjs`, so its handlers, `.agents/harness.json`, state and `context.repoRoot` are used. Without a `cwd`, with `cwd` equal to `CLAUDE_PROJECT_DIR`, or without `CLAUDE_PROJECT_DIR`, the entry SHALL behave as before.

#### Scenario: Session moved into a linked worktree
- **WHEN** a session started in the main checkout sends `Stop` with `cwd` in a linked worktree at another revision whose verify command fails
- **THEN** that worktree's verify command runs and the turn end is blocked

#### Scenario: Handler context follows the move
- **WHEN** an event arrives with `cwd` in a linked worktree that has the runtime
- **THEN** handlers receive that worktree's top level as `repoRoot`, its config section, and a state folder under that worktree's git dir

#### Scenario: No cwd
- **WHEN** the payload has no `cwd`, or `cwd` equals `CLAUDE_PROJECT_DIR`
- **THEN** no git call is made for resolution and `CLAUDE_PROJECT_DIR` is used, as before

#### Scenario: Same checkout, other folder
- **WHEN** `cwd` is another folder of the checkout that contains `CLAUDE_PROJECT_DIR`, including when `CLAUDE_PROJECT_DIR` is below the git top level
- **THEN** `CLAUDE_PROJECT_DIR` is used as given

### Requirement: Other checkouts pass silently
The Claude Code entry SHALL print nothing and exit 0 when `cwd` is in another repository or a separate clone (different git common directory), outside any git checkout, or in a same-repository worktree without `.agents/harness/hook-runtime/claude.mjs`.

#### Scenario: Worktree without the runtime
- **WHEN** `cwd` is a linked worktree of the same repository without `.agents/harness/hook-runtime/`
- **THEN** the entry prints nothing and exits 0

#### Scenario: Another repository or a separate clone
- **WHEN** `cwd` is in another git repository, or in a separate clone of the same repository
- **THEN** the entry prints nothing and exits 0

#### Scenario: Folder outside any checkout
- **WHEN** `cwd` is a folder that is not inside a git checkout
- **THEN** the entry prints nothing and exits 0

### Requirement: Bounded checkout resolution
The two git calls that resolve the checkout SHALL run in parallel, each bounded at 2 seconds. When either call times out or cannot start, or git in `CLAUDE_PROJECT_DIR` fails, the entry SHALL use `CLAUDE_PROJECT_DIR` as before.

#### Scenario: git hangs
- **WHEN** the git call in `cwd` does not finish within 2 seconds
- **THEN** the event is handled in `CLAUDE_PROJECT_DIR`, and resolution took at most about 2 seconds

### Requirement: Declared tool kinds
A handler tool's `tool.json` MAY declare `"tools"`, a non-empty list of tool kinds (`shell`, `edit`, `read`, `skill`, `other`). The runtime SHALL attach it to the loaded handler as `tools`. A missing `tools` key, or a value that is not a non-empty list of known kinds, SHALL mean every kind. A handler whose declared kinds include `skill` SHALL also be called for a tool event that carries a `skill` field, whatever its kind. `tools` SHALL NOT affect events other than `tool.before` and `tool.after`.

#### Scenario: No declaration means every kind
- **WHEN** a handler's `tool.json` has no `tools` key, and a `tool.before` with kind `other` is dispatched
- **THEN** the handler is called as before

#### Scenario: Invalid declaration fails open
- **WHEN** a handler's `tool.json` declares `"tools": "edit"` or `"tools": ["write"]`
- **THEN** the handler is called for every tool kind

#### Scenario: Other events are not filtered
- **WHEN** a handler declares `"tools": ["shell"]` and subscribes to `prompt`
- **THEN** it is called on every `prompt`

#### Scenario: A skill declaration receives a skill read
- **WHEN** a handler declares `"tools": ["shell", "skill"]` and a `tool.after` of kind `read` with `skill: "x"` is dispatched
- **THEN** the handler is called

#### Scenario: A skill declaration skips a plain read
- **WHEN** the same handler and a `tool.after` of kind `read` without `skill` are dispatched
- **THEN** the handler is not called

### Requirement: Claude Code skips tool calls no handler needs
On a `PreToolUse`, `PostToolUse` or `PostToolUseFailure`, once the checkout is resolved and before any handler is loaded, `claude.mjs` SHALL read the lock and each locked tool's `tool.json`. When every tool with `"handler": true` has valid `tools` that exclude the call's kind, and, for a call that carries `skill`, also exclude `skill`, it SHALL load no handler, print nothing and exit 0. On any read or parse error it SHALL load handlers as before.

#### Scenario: Read with only the verify gate installed
- **WHEN** only the hook runtime and the verify gate (`"tools": ["shell", "edit"]`) are installed and `claude.mjs` receives a `PostToolUse` for `Read`
- **THEN** no handler is loaded and the output is empty

#### Scenario: Edit still reaches the gate
- **WHEN** the same repo receives a `PostToolUse` for `Edit`
- **THEN** the handlers are loaded and the verify gate runs on the edit

#### Scenario: A handler without a declaration
- **WHEN** another installed handler tool's `tool.json` has no `tools` key and a `PreToolUse` for `Read` arrives
- **THEN** the handlers are loaded and dispatched as before

#### Scenario: Unreadable metadata fails open
- **WHEN** a locked tool's `tool.json` is missing or is not valid JSON and a `PostToolUse` for `Read` arrives
- **THEN** the handlers are loaded and the existing `was not loaded` notice is reported

#### Scenario: Plain read with the rules handler installed
- **WHEN** the verify gate and hooked-rules (`"tools": ["shell", "skill"]`) are installed and a `PostToolUse` for `Read` of `src/a.mts` arrives
- **THEN** no handler is loaded and the output is empty

#### Scenario: Skill file read with the rules handler installed
- **WHEN** the same repo receives a `PostToolUse` for `Read` of `skills/agent-harness-verify-gate/SKILL.md`
- **THEN** the handlers are loaded and hooked-rules receives the event with `skill: "agent-harness-verify-gate"`

### Requirement: Trace of a skipped tool call
With `AGENT_HARNESS_TRACE=1`, a tool call that `claude.mjs` skips SHALL append a trace record with `skipped: "no-subscriber"`, empty `outcomes` and no `handlersLoadedAt`.

#### Scenario: Skip is traced
- **WHEN** a `PostToolUse` for `Read` is skipped with `AGENT_HARNESS_TRACE=1`
- **THEN** the last line of `trace.jsonl` has `skipped: "no-subscriber"` and `outcomes: {}`

### Requirement: Skill fields on tool events
A tool event of kind `skill` SHALL carry `skill`, the invoked skill's name, and `skillVia: "call"`. On Claude Code the name SHALL be `tool_input.skill`. On OpenCode it SHALL be the tool arguments' `id`, else their `name`, and never the call id. A call without a string name SHALL carry no `skill`.

#### Scenario: Claude Code Skill call
- **WHEN** `claude.mjs` receives a `PostToolUse` for `Skill` with `tool_input.skill: "openspec-apply-change"`
- **THEN** handlers receive `skill: "openspec-apply-change"` and `skillVia: "call"`

#### Scenario: OpenCode skill call
- **WHEN** the OpenCode plugin's `execute.after` runs for tool `skill` with input `{id: "openspec-apply-change"}`
- **THEN** handlers receive `skill: "openspec-apply-change"` and `skillVia: "call"`

### Requirement: Skill file reads
A call of the `Read` tool (Claude Code) or the `read` tool (OpenCode) SHALL carry `skill: "<name>"` and `skillVia: "read"` when its path, resolved against the payload's `cwd` (else the repo root) with backslashes read as slashes, has a real path ending in `/skills/<name>/SKILL.md`. Only a path whose text ends in `SKILL.md` SHALL be resolved. A path that cannot be resolved (including a missing file) or resolves elsewhere, and any other `read`-kind tool, SHALL carry no `skill`.

#### Scenario: Read of a skill file through a symlink
- **WHEN** a read names `.claude/skills/x/SKILL.md`, which is a symlink to `skills/x/SKILL.md`
- **THEN** the event carries `skill: "x"` and `skillVia: "read"`

#### Scenario: Lookalike path
- **WHEN** a read names `docs/skills/x/SKILL.md.bak`, or a `SKILL.md` symlink whose target is `notes/x.md`
- **THEN** the event carries no `skill`

#### Scenario: Grep of a skill file
- **WHEN** OpenCode's `grep` tool runs with `path: "skills/x/SKILL.md"`
- **THEN** the event carries no `skill`

### Requirement: Tool call outcome
Every `tool.after` SHALL carry `ok`. On Claude Code `ok` SHALL be `true` for `PostToolUse` and `false` for `PostToolUseFailure`. On OpenCode `ok` SHALL be `true` exactly when the call's `status` is `completed` and, for a shell call, its `result.metadata.exit` is `0`.

#### Scenario: Failed Bash call on Claude Code
- **WHEN** `claude.mjs` receives a `PostToolUseFailure` for `Bash`
- **THEN** handlers receive `tool.after` with `ok: false`

#### Scenario: Non-zero exit on OpenCode
- **WHEN** `execute.after` runs for `shell` with status `completed` and `result.metadata.exit: 1`
- **THEN** handlers receive `tool.after` with `ok: false`
