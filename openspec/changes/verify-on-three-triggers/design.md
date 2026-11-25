## Context

M1 of the accepted RFC [`rfc-split-agent-harness-into-node-skills.md`](../../design/archive/2026-11-agent-harness/rfc-split-agent-harness-into-node-skills.md),
tracked as [issue #13](https://github.com/raidenyn/agentic-development-skills/issues/13). Today this repository
publishes Markdown-only skills (`skills/*/SKILL.md` plus `references/`). `scripts/skills.py build-pages`
already publishes every non-hidden file of a skill byte for byte (`skill_files`), so files under `assets/`
ship without build changes. The repo's own hooks are a `commit-msg` git hook; no agent host config exists
(`.claude/settings.json` and `opencode.json` are absent). Node 26.13 is the dev and CI version (`.nvmrc`);
the copied code must run on Node 22 or newer with no dependencies. Hosts installed on this machine:
OpenCode 2.4.1 and Claude Code 2.1.332.

Behavior to match, not code to copy: veles `docs/verify.md` (turn-end hook limits, remembered passes, fail
open) and `scripts/opencode-hooked-rules/index.js` (OpenCode V2 plugin: `ctx.tool.hook`, `ctx.session.hook`,
`ctx.event.subscribe`, `ctx.session.synthetic`, the `parentID` walk, detached turn-end work, bounded dispose).

Frozen contracts this change lands: **Skill names**, **Vendored tool layout**. Provisional: **Hook handler
interface**, which may only gain additive changes and is confirmed by this change's live runs.

**Host spike, done before this design was settled:** [`spike.md`](spike.md). Live runs on OpenCode 2.4.1
and Claude Code 2.1.332 showed all five capabilities working on both hosts, and found the exact
mechanism for each. They also showed that subagents run in the background on both hosts, so a turn end
can come while a subagent still edits. Copying the real index for the tree id costs about 2.2 s in veles.
The decisions below build on those results; the payload fixtures are in `tests/agent-harness/fixtures/`.

## Goals / Non-Goals

**Goals:**
- One configured command runs on a file edit, a ticked task and turn end, on OpenCode and on Claude Code,
  and its failure reaches the model.
- A tree that already passed a full run returns at once. The no-change turn end is measured against 300 ms.
- `verify-pass` holds for the content of the last full pass, including after an unchanged commit.
- All five host capabilities are proven live with a fixture handler on both hosts.
- `install`, `update` and `check` behave as the RFC states, tested against throwaway git repos.
- A hook never blocks the host because it failed itself.
- This repository is onboarded and runs `check` in CI.

**Non-Goals:**
- Rule delivery, anything that consumes `verify-pass`, instruction-file and commit checks (M2, M3).
- Codex, Antigravity, Pi adapters; native Windows.
- Mapping changed files to tests inside the wrapper; narrowing is the repo command's job.
- Any npm dependency in copied code.

## Decisions

### D1. Skill and file layout

```
skills/agent-harness-hook-runtime/
  SKILL.md                       Onboard, Update, untrusted-checkout warning, capability table
  assets/hook-runtime/
    tool.json                    {"name":"hook-runtime","version":"0.1.0","handler":false}
    cli.mjs                      install | update | check | capabilities
    claude.mjs                   Claude Code entry (one command for every event)
    opencode/index.mjs           OpenCode plugin entry (index.mjs loads from the folder; spike)
    lib/runtime.mjs              dispatch, deadlines, fail-open, handler loading, proofs
    lib/supervisor.mjs           both hosts: workers, spawns, gate lock ownership, cleanup
    lib/worker-entry.mjs         the worker side: import the handler, answer events
    lib/claude-adapter.mjs       host JSON <-> normalized events/results
    lib/opencode-adapter.mjs     V2 hooks/events <-> normalized events/results
    lib/install.mjs              copy, lock, config merge (identical copy in verify-gate)
    lib/state.mjs                state folders, exclusive-create lock
    lib/config.mjs               .agents/harness.json section loading and key validation
skills/agent-harness-verify-gate/
  SKILL.md
  assets/verify-gate/
    tool.json                    {"name":"verify-gate","version":"0.1.0","handler":true}
    cli.mjs                      install | update | check | run (manual run)
    handler.mjs                  the verify handler and the verify-pass proof
    lib/tree.mjs                 content key: tree id + stat digest from a private index
    lib/triggers.mjs             edit / ticked-task detection, glob matching
    lib/run.mjs                  child process, timeout, output capture and tail
    lib/install.mjs, lib/state.mjs, lib/config.mjs   identical copies
tests/agent-harness/             all tests; never published
```

Separate skills cannot share code (RFC, abandoned "one installer"), so `install.mjs`, `state.mjs` and
`config.mjs` exist in both tools. A test asserts the copies are byte-identical, so they cannot drift.

### D2. Hook handler interface, as implemented

```
handler: { name, events, handle(event, context) -> result | null,
           proofs?: { name: check(context) -> null | failure text },
           timeouts?: { <event>: ms },                        // additive: per-event deadline
           manual?: text }                                    // additive: what to do by hand on failure
event:   { type: tool.before | tool.after | prompt | turn.end | compact | session.start,
           host, tool?: { name, kind: shell|edit|read|other, input, callId },
           command?, files?, prompt?, afterCompact?,
           background? }                // turn.end: subagents of this session still running
result:  { deny: text } | { context: text } | { block: text, ack?: () -> void, release?: () -> void }
                                // additive: ack after the host accepted the block, release if it did not
context: { repoRoot, sessionId, agentId, deadline, signal, stateDir, host, config, proof(name),
           trace(outcome) }                                   // additive: signal, trace
```

The RFC fixes only the event names, so the event fields are this change's to define. Additions to the
RFC shape, all optional and so additive, and all reported in the pull request: the handler's `timeouts`
and `manual`; the block result's `ack` and `release`; the context's `signal` and `trace`; and the event's
`background` and `tool.callId`. The supervisor's `spawn` and lock messages (below) are runtime-internal
plumbing used by the bundled handlers, not part of the published handler interface.
`trace(outcome)` lets a handler name what it did (for example `"no-change"`); the runtime records it
(D7).

Tool kinds, from the spike:

| Kind | Claude Code | OpenCode |
|---|---|---|
| `shell` | `Bash` (`tool_input.command`) | `shell`, alias `bash` (`input.command`) |
| `edit` | `Edit`, `Write`, `MultiEdit`, `NotebookEdit` (`tool_input.file_path`, absolute, made repo-relative) | `patch` (`result.metadata.files[].file`), plus `edit` and `write` if a model gets them (`input.filePath`) |
| `read` | `Read`, `Glob`, `Grep` | `read`, `glob`, `grep` |
| `other` | everything else, `Agent` included | everything else, `subagent` and `skill` included |

Paths outside the repo root are dropped from `files`. `tool.callId` matches a call's `tool.before` and
`tool.after`: Claude Code's `tool_use_id`, OpenCode's `id` (both in the fixtures).

A result kind that is invalid for its event (for example `deny` at `turn.end`) is
dropped and reported as a hook failure. When several handlers answer the same event, the runtime merges
them: any `deny` wins, `block` texts are joined, and `context` texts are joined in handler-name order.

### D3. Runtime: fail open, deadlines, capability report

The runtime runs each handler with `Promise.race` against its deadline (the handler's `timeouts[event]`,
the `hook-runtime.deadlines` override, or 5 s). The deadline timer stays referenced (never `unref`), so
a handler whose promise never settles cannot let Node exit before the notice is written. A throw, a
rejection, a timeout or an invalid result skips that handler, and at its deadline the runtime aborts
`context.signal`. A handler must stop writing state once the signal aborts; the verify gate kills its
child and does not write the pass record. The host call proceeds. On events with a model channel, the
model gets `hook <name> failed on <event>: <reason>. <manual instruction>`, where the instruction is the
handler's `manual` text (the verify gate: "run `node .agents/harness/verify-gate/cli.mjs run` by
hand"). The model channels are `tool.after` (Claude `additionalContext`, OpenCode `result.content`),
`prompt` and `session.start` (Claude `additionalContext`, OpenCode `system`), and on OpenCode `turn.end`
(a non-resuming synthetic message). Failure notices are carried **separately from handler results**, so
result-kind validation never drops them. Where an event has no channel of its own, such as an OpenCode
`execute.after` with `status: "error"` (its content cannot be appended), the notice is queued and
appended to `system` at that session's next `context` hook call. On Claude Code `PreToolUse` too: a failure notice goes out as
`hookSpecificOutput.additionalContext` **without** a `permissionDecision`, so the command still runs
and the model still gets the manual instruction. That output shape follows the Claude Code hook docs,
was not part of the spike, and is verified live in Task 12. Claude Code's `Stop` has no model channel
except a block: its `systemMessage` is shown to the user only, and that is how a turn-end notice is
delivered there.

**One absolute deadline per event, with cleanup inside it.**
- *Work budget and cleanup budget are separate.* A handler's work budget is its `timeouts[event]`, else
  `hook-runtime.deadlines[event]`, else 5 s. Cleanup gets a fixed 6 s on top: 5 s for process-group
  escalation and 1 s to write the output. So a handler that spawns with default settings has a full
  5 s of work.
  - On OpenCode, which has no hook timeout of its own (a 40 s hook was awaited in the follow-up spike),
    the event's `hostDeadline` is the work deadline plus 6 s.
  - On Claude Code, `install` writes the host timeout. The work deadline is the earlier of the
    handler's budget and `hostTimeout - 7 s`. `install` writes timeouts that leave at least 3 s of
    work (`PreToolUse` 10 s; `PostToolUse` and `Stop` 1800 s).
  - For a detached OpenCode turn end, the clock starts when the queued entry **starts running**, not
    when the event was received, so a backlog never eats a later entry's budget (D5).
- *Work deadline.* `workDeadline` is the moment above; `cleanupDeadline = hostDeadline - 1 s`.
- *Signals and late results.* Each handler's `context.deadline` is the earlier of its own timeout and
  `workDeadline`. `context.signal` aborts at that moment, and **any result that settles after it is
  discarded**: a `{block}` returned at 4.5 s against a 4 s deadline is treated as a timeout. The cleanup
  the abort starts is awaited separately, until `hostDeadline - 1 s`, and then the output is written.
- *Loading.* Handler import is bounded at 2 s on both hosts. On Claude Code it runs per process; on
  OpenCode it runs once in each handler's worker at `setup` (below). A handler still loading then is
  skipped and reported (tested with a handler module whose top-level `await` never settles, on both
  hosts).
- *Cleanup.* Cleanup has its own deadline, `cleanupDeadline = hostDeadline - 1 s`, separate from the
  work deadline. On abort the supervisor sends SIGTERM to the child's whole process group, then
  SIGKILL to the group after `min(5 s, cleanupDeadline - now - 1 s)`, the one schedule used everywhere.
  That leaves at least 1 s after SIGKILL to confirm the group is empty; cleanup has its own 6 s budget
  after the work deadline. That escalation runs **independently of the leader's exit**: they resolve
  only once the group is empty (`process.kill(-pgid, 0)` throws `ESRCH`), never because the leader
  alone exited. SIGKILL cannot be ignored and reaches every descendant in the group. Tested with a
  leader that exits on SIGTERM while a descendant with closed stdio traps TERM: the lock is not released
  before that descendant is gone.
- Handlers that would start after `workDeadline` are skipped and reported. On Claude Code, `claude.mjs`
  writes its output with a callback and then calls `process.exit(0)` explicitly.

**Slow `tool.after` work is allowed on both hosts.** A ticked task runs the full command from
`tool.after`. Claude Code's `PostToolUse` timeout is 1800 s (`install`). OpenCode awaited a 40 s
`execute.after` hook and delivered its appended content (follow-up spike). So the verify gate declares
`timeouts["tool.after"] = timeoutSeconds * 1000 + 10000`, and a slow task run is a verification
result, not a hook timeout. Hooks longer than 40 s were not run on OpenCode. Task 12 runs a 120 s task
check there; if OpenCode cuts it, that is reported as a host limit under the issue's stop rule, and the
design does not change on its own.

**Supervisor and workers, on both hosts.** The adapter's main thread is a *supervisor*. Each handler
runs in its own `worker_threads` Worker: one per handler per process on Claude Code, and long-lived on
OpenCode, started at `setup`. That is still in process, as the RFC's Shared runtime decision requires.
- *Why both hosts.* A handler that loops synchronously, in its import or in `handle`, freezes only its own
  worker. The supervisor's timers keep running, so it can still give up at the deadline and print the
  manual notice; on Claude Code too, the hook exits well before the host's own timeout.
- *The supervisor owns everything that outlives JavaScript.* A worker never spawns a process and never
  touches the gate lock itself. It asks the supervisor through messages:
  - `spawn {argv, cwd, env, timeoutMs}` → the supervisor starts the process in its own group, streams
    output back and reports the exit;
  - `lock.acquire` and `lock.release` → the supervisor claims the gate lock (D5) for that worker's
    generation.

  Every git subprocess of the content key goes through `spawn` too. The supervisor writes the pgid of
  every group it starts under the gate lock into its own lock file (`{pid, at, pgids: [...]}`, rewritten
  with temp-file plus rename). A contender that takes over a **dead** supervisor's lock first sends
  SIGKILL to each recorded group and confirms it is empty, and only then deletes a stale `index.lock`.
  Supervisor death is therefore covered, not only worker death. When a worker is terminated or
  crashes, the supervisor kills every process group it started for that worker generation (SIGTERM,
  then SIGKILL, until each group is empty) and then releases the locks that worker generation held. No
  window exists in which a process or lock belongs to nobody. A leftover `index.lock` beside the private
  index, found while the gate lock is held, is necessarily stale (only gate-lock holders run git on that
  index), so it is deleted before the next `add`.
- *Message protocol.* Every message carries `{workerGen, requestId}`:
  - `event` → `result`;
  - `proof.request` → `proof.response`. A proof is routed to the worker of the handler that registered
    it and runs under the requesting event's deadline. A worker stays responsive while its handler
    awaits, so a handler can query its own proof without deadlock;
  - `trace` and `spawn` carry the `requestId` of their event, so late messages from a finished or
    terminated event are dropped, not credited to another event;
  - `ack` and `release` for a block are sent to the worker generation that produced it. If that
    generation is gone, nothing more happens: the charge made before delivery (D5) stands.

  The supervisor sends `config` with each event, so a worker always uses the current
  `.agents/harness.json`.
- *One event per worker.* A worker runs one event at a time. The supervisor keeps a small pool per
  handler (up to 4 workers), so a slow turn-end run never shares a worker with a `tool.before`.
  Terminating a worker at its event's deadline therefore affects only that event.
- *Termination.* At the deadline the supervisor calls `worker.terminate()`, cleans up as above, and
  starts a fresh worker for later events.
- *Acknowledgement before exit.* `ack` and `release` are requests to the worker that produced the block,
  which stays alive until it answers. On Claude Code, the entry writes stdout, sends `ack`, and awaits
  `acked`, bounded by `cleanupDeadline`, before it calls `process.exit(0)`. Because the charge was
  already made before delivery, a lost `ack` changes nothing about the cap.
- *Shutdown.* On OpenCode `dispose`, the plugin stops dispatching and returns within 1 s. The supervisor
  keeps going in the background: it kills the process groups of running events, confirms each group is
  empty, and only then releases their gate locks. A new plugin instance in the same process sees the
  lock held by its own live pid and waits, as any contended run does, until the release.
- *Cost.* Starting a worker and the structured-clone copy per event are measured by Task 9's bench on
  the shipped path. They are not estimated here.

Tests, on both hosts: a handler that runs `while (true) {}` in its import, and one that does so in
`handle` before its first `await`. Neither blocks the host call or the next event, and the notice is
printed. A worker terminated in the middle of a private-index `git add` leaves no running git, no held
gate lock, and no `index.lock` that blocks the next run. A worker terminated right after asking for a
spawn leaves no orphan process.

`node .agents/harness/hook-runtime/cli.mjs capabilities` prints the table below for each host adapter,
with the host version it was live-verified on, and lists each installed handler's events that need a
capability the host lacks. The same check runs at `session.start` and adds a context line when something
is missing.

Each cell is the mechanism the spike confirmed live ([`spike.md`](spike.md)). Every capability works on
both hosts.

| Capability | Claude Code 2.1.332 | OpenCode 2.4.1 |
|---|---|---|
| deny before a command | `PreToolUse` output `hookSpecificOutput.permissionDecision: "deny"` with `permissionDecisionReason` | throw an `Error(text)` from `ctx.tool.hook("execute.before")`; the call fails with that message |
| text after a tool call | `PostToolUse` output `hookSpecificOutput.additionalContext` | in `execute.after` with `status: "completed"`, append `{type: "text", text}` to `input.result.content` |
| block at turn end and continue | `Stop` output `{decision: "block", reason}` | on event `session.execution.succeeded`, `ctx.session.synthetic({sessionID, text, resume: true})` |
| re-deliver after compaction | `SessionStart` with `source: "compact"`, output `additionalContext` | on event `session.compaction.ended`, mark the session in state; at the next `ctx.session.hook("context")` call, append `{type: "text", text}` to `input.system` |
| separate state per subagent | `agent_id` (and `agent_type`) in the hook input | `ctx.session.get` returns `parentID` for a child session; the child's `sessionID` is the agent id |

**Event mapping, as observed.**

- *Claude Code*: `PreToolUse` maps to `tool.before`; `PostToolUse` and `PostToolUseFailure` to `tool.after` (so a shell
  call that ticks a task and then fails, such as `sed -i … && npm test`, is still compared); `UserPromptSubmit`
  to `prompt`; `Stop` and `SubagentStop` to `turn.end`; `PreCompact` to `compact`; `SessionStart` to
  `session.start`, with `afterCompact: true` when `source` is `compact`. For `Stop`, `background` is the
  number of `background_tasks` entries with `type: "subagent"` and `status: "running"`. The adapter
  drops a `SubagentStop` whose `agent_type` is `""`: that is compaction's own internal agent, not a
  subagent's turn end. It ignores `stop_hook_active`, because block counting is the handler's job.
- *OpenCode*: tool hooks `execute.before` and `execute.after` map to `tool.before` and `tool.after`;
  session hook `prompt` to `prompt`; events `session.execution.succeeded` to `turn.end` (detached, one
  in flight per session), `session.compaction.started` to `compact`, and the first event seen for a
  session to `session.start`. `session.created` arrives only for child sessions, because the root is
  created before the plugin subscribes. The re-delivery path above produces `session.start` with
  `afterCompact: true`; its `{context}` goes into `system`. A `{context}` at `prompt` is delivered the
  same way, at the next `context` hook call. The compaction mark is stored in the session's state
  folder, so it survives a process restart.
- *OpenCode child lifecycle*: the adapter keeps a state per child session (`running` or `idle`) and
  applies events in arrival order. A child is known either from the `subagent` tool's `execute.after`
  result `metadata: {sessionID: <child>, status: "running"}` (fixture `execute.after-subagent-completed`)
  or from its first own event, resolved through `parentID`. The child's lifecycle events are
  authoritative once seen: `session.execution.started` sets it `running` (also when a block resumes
  it), and `.succeeded`, `.failed` or `.interrupted` set it `idle`. A launch result marks a child
  `running` only if none of its lifecycle events has been seen yet, so a fast child that finishes
  before its launch result is processed stays `idle`. `background` at the root's `turn.end` is the
  number of its children that are `running`.
- *OpenCode superseded results*: the adapter keeps a **start generation** per session, a counter it
  increments on every `session.execution.started` it receives for that session. The fixtures carry
  distinct event ids, not a shared execution id, so a counter is used. When a
  `session.execution.succeeded` arrives, the detached `turn.end` captures the current generation. When
  its result is ready, a generation that has moved on means the result is superseded: it is not
  delivered, and its `ack` is not called. The slot's rerun (D5) then verifies the current tree with a
  recomputed `background`.
- *Charge before delivery, refund only known non-delivery*: a block is charged to the session's count
  **before** it is returned. Under the gate lock, the verify gate reads `blocks.json`. If the charged
  blocks for the failure key, or for the session in total, already reach the limit, it returns the
  notice instead. Otherwise it records a charge `{id, key}` and returns `{block, ack, release}`.
  - `ack` (delivered) only marks the charge confirmed.
  - `release` (known not delivered: superseded, rejected, or the write failed) refunds it.
  - A charge whose worker died before either stays charged. That is conservative: a possibly delivered
    block can never escape the cap, at the cost of at most one block of allowance.

  Two agents of one session that fail at the same moment can therefore never both deliver attempt
  three. On Claude Code, "accepted" means "written", since the host has no other acknowledgement:
  `main()` returns `{text, ack}` and calls `ack` in the stdout write callback, before
  `process.exit(0)`. On OpenCode, `ack` follows `session.synthetic` resolving for a result that was not
  superseded, and `release` follows a supersession. Tests check the persisted `blocks.json` on both
  hosts, including two simultaneous deliveries at count two.
- *Unknown identity*: a session whose parent
  chain cannot be resolved (lookup error, cycle, depth cap) is treated as a **root**, so an unknown
  identity verifies rather than skips. On Claude Code only `Stop` uses `background_tasks`; on
  `SubagentStop` the list can include the stopping agent itself, so it is not read there.
- Context after a failed OpenCode tool call (`status: "error"`) was not tested. The adapter reports it as
  not delivered rather than guessing.

### D4. Working-tree content key (state hash)

`contentKey(root)`: run `git add -A` and then `git write-tree` with `GIT_INDEX_FILE` set to a private index
kept in the gate's state folder (`<git-dir>/agent-harness/verify-gate/index`). On first use, that index
is built with `git read-tree HEAD` (empty when there is no HEAD), never by copying the real index. A
copy would inherit `assume-unchanged` and `skip-worktree` flags, which make `git add -A` skip edits to those
files. The first build costs a full hash once (4.9 s in veles, follow-up spike). After that the index is
kept between calls, so each call re-reads only files whose stat data changed. The real index, wherever
`git rev-parse --git-path index` puts it (not `.git/index` in a linked worktree), is only read, for
membership below. Warm cost, *estimated from the spike, which used git's `--debug` stat rather than the shipped `lstat` pass*: 124–191 ms in veles (3,708 tracked and 5,699 untracked files) for
`add -A` plus `write-tree`, and 151–287 ms with the stat digest below; about 50 ms in this repo. The real
index is never touched. Git takes its own `index.lock` next to the private index, so two concurrent
calls serialize. Git refuses a second caller that finds `index.lock` present, so `contentKey` runs only
inside the gate lock (D5). A corrupt private index is deleted and rebuilt with `read-tree HEAD`.

**Membership is reconciled with the real index on every call.** `git add -A` skips ignored files, so
before it runs, `contentKey` lists the real index's tracked-but-ignored paths
(`git ls-files -ci --exclude-standard -z`, real index). It force-adds those to the private index and
removes from the private index any tracked-but-ignored path the real index no longer has. A file that
was force-tracked, or untracked with `git rm --cached`, then counts the same way as in git.

**Raw bytes are covered by a filesystem stat digest.** The tree id is git's view after clean filters
(`.gitattributes` `text`/`eol`, `core.autocrlf`, filter drivers), so an LF-to-CRLF edit can keep it.
Index stat data is not reliable for this, because git's refresh follows the repo's `core.trustctime` and
`core.checkStat`. The key's `stat` is therefore taken from the **filesystem**, not from the index:
- for every path in the private index after `add -A` (from `git ls-files -z`), `fs.lstat(path,
  {bigint: true})`, keeping path, mode, size, inode, `mtimeNs` and `ctimeNs`;
- sha256 over the sorted list.

In addition, the private-index git commands run with `-c core.trustctime=true -c core.checkStat=default`,
so git's own refresh, and with it the tree id, cannot miss a same-size edit. Any write to a file updates
its ctime, and only the kernel sets ctime, so an edit that keeps the size and restores the mtime
(`touch -r`) changes the key whatever the repo's settings. So does an edit that a clean filter maps to
the same blob (LF to CRLF, or a lowercasing filter). The lstat pass costs a few tens of milliseconds for
veles's 9,400 paths; Task 9's bench measures it. The key survives an
unchanged commit, because `git commit` writes no working-tree file. This is conservative: a `touch`, a
`chmod`, a checkout or a rebase that rewrites the same bytes also changes it, which costs a rerun, never
a wrong pass. The pass key is
`{tree, stat, config: sha256(canonical JSON of the verify-gate section)}`. Tests:
- two consecutive no-change calls give equal keys;
- an edit made in the same second as the previous key computation (the racy-git window) changes the
  key;
- an edit that keeps size and restores mtime changes the key, also with `core.trustctime=false` set in
  the repo;
- under a test clean filter that lowercases, an edit from `A` to `a` changes the key.

Alternatives (HEAD plus status, Node file walk) are rejected in `brainstorm.md`.

### D5. Verify gate: triggers and runs

- **Edit**: `tool.after` whose `tool.kind` is `edit` gives `files`. For each file: if the content key equals
  the pass record, return null. Otherwise run the command with `VERIFY_TRIGGER=edit` and `VERIFY_FILE`.
  A failure returns `{context}` with the output tail. An edit run never writes or deletes the pass
  record.
- **Ticked task**: a tick is what issue #13 defines: an item's checkbox changing from unticked to
  ticked. Adding an item that is already ticked is not a tick; that edit takes the edit path. **One
  detector** handles edits and shell commands alike:
  - *Before.* At every edit-kind or shell `tool.before`, the gate records the per-key counts (`{ticked,
    unticked}`, the key being the trimmed text after the box) of every file matching `taskFiles` into the
    call-scoped before-image `<session state>/<agent>/calls/<callId>.json`, with the time `at`. It is a
    read-only scan and never takes the gate lock, so contention cannot skip it.
  - *After.* At the matching `tool.after` (Claude Code `PostToolUse` or `PostToolUseFailure`; OpenCode
    `execute.after` with any status), it reads the same files from disk. A key whose unticked count fell
    and whose ticked count rose is a tick, `min(fall, rise)` times. Line positions and hunks do not
    matter, so moved items, reorders and duplicate labels are handled. A file absent from the
    before-image is new, and has no transition.
  - *Deduplication by count.* Every detection runs under the gate lock and appends the time of each tick
    to the key's `ticks` list in the worktree snapshot `tasks.json` (`{"version": 1, "files": {path:
    {key: {ticked, unticked, ticks: [at, ...]}}}}`). For a call, the number of ticks of a key already
    recorded **after the call's `at`** is subtracted from what the call detected. If a child ticks one
    `A` and an overlapping shell call ticks a second `A`, the shell call still reports one tick. So a child's tick that lands
    during a long root shell call is reported once, while a re-tick after the user unticked the item
    between sessions is reported again.
  - *Pruning.* Before-images with no `tool.after` (a denied or cancelled call) are deleted when older
    than one hour, at `session.start` and at each `tool.before`.
  - *Limit.* Swapping which of two identically labelled items is ticked leaves the counts unchanged and
    is not detected. This is stated in the skill and tested as a known non-detection.

  A tick starts a full run with `VERIFY_TRIGGER=task` instead of the edit run. A failure returns
  `{context}` telling the model that the task was ticked while verification fails.
- **Turn end** (owner's decision, 2026-11-25): **every turn end runs a full run** with
  `VERIFY_TRIGGER=turn-end`: the root agent's and each subagent's.
  - A subagent's failing turn end returns `{block}`, so the subagent continues and fixes its work. On
    Claude Code the parent gets the result once the subagent finishes, after the fix. On OpenCode the
    parent is handed **each round** of the subagent's work, including the failing one, and again after
    the fix (spike, "Subagent block on OpenCode"). That is a stated host limit: the parent may act once
    on the pre-fix result, and its own turn end verifies the final tree.
  - A root turn end with `background == 0` that fails returns `{block}`.
  - A root turn end with `background > 0` that fails returns a notice: `verify: <command> fails while
    <n> subagent(s) still run; verification runs again at the next turn end.` Its text is the failure
    tail. It does not block, because a subagent may still be changing the tree, and it does not count
    toward the block limit. Both hosts start a new root turn when a subagent finishes (spike finding
    3), and that turn's end verifies again.
  - A block's text starts `verify: <command> failed (attempt n of 3)`.
  - Compaction's internal `SubagentStop` is not a turn end (D3).
- **Bounded block (same failure, per session).** The issue's assumption is "at most three blocks for the
  same failure in a session". The failure key is sha256 of the failing run's exact argv (not normalized)
  plus its exit status (`exit <code>`, `signal <name>` with the real name such as `SIGSEGV`, `timeout`,
  or `spawn error`) plus its output
  tail with only known volatile fields normalized:
  - the repo root path becomes `<root>`, and paths under the OS temp dir become `<tmp>`;
  - ISO-8601 timestamps and `HH:MM:SS` clock times become `<time>`;
  - durations become `<dur>`: a number followed by `ms`, `s`, `m` or `sec` (as in `12.3s` or `(450 ms)`),
    and any number that follows a key containing `duration` or `time`, such as Node TAP's
    `duration_ms: 12.3` and `# duration_ms 845.2`;
  - hex values that cannot be decimal diagnostics become `<hex>`: a `0x` prefix, or a run of 8 or more
    hex characters containing at least one letter `a`–`f`. An 8-digit decimal code stays as it is.

  Other digits are kept, so `E101` and `E202` stay distinct failures. The count is kept **per session**, shared by
  the root agent and every subagent of that session (not per agent, not per tree), because the issue
  says "in a session". Claude Code's root and subagent payloads carry the same `session_id`; OpenCode
  child sessions are counted under their root's id. It lives in `<toolStateDir>/sessions/<host>-<root
  session>/blocks.json` ({failureKey: count}), written under the gate lock. Cosmetic edits that leave the same failure therefore do not reset
  it, and a different failure gets its own count. After the limit for a key, the gate passes with a
  notice. The limit is `min(maxBlocks, 3)`, enforced at runtime as well as by `check`, which rejects
  values outside 1–3.

  **Backstop:** at most 10 turn-end blocks per session in total. Output that changes
  in a way the normalization misses therefore cannot block forever; after that, every turn end passes
  with the notice. This cap only adds a bound on top of the issue's three.
- **A turn end while a run is in flight** (OpenCode, where turn-end work is detached): it is queued, not
  merged. Each session's slot keeps a FIFO of `{event, generation}`, and **every queued turn end runs
  the gate**, in order, as the owner's every-turn-end decision requires. Most of them take the
  no-change shortcut, so the queue drains fast. Delivery is the only thing that is filtered: a result is
  delivered only if its own generation is still current (D3), and otherwise `release` is called.
  - If B and C both end during A's run, both run after A.
  - If C then starts before B's run settles, B's result is not delivered, so it never interrupts C
    mid-turn, and C's own end runs the gate.
  - Each run recomputes `background`, and the root's `background` is checked again just before delivery.
  - Each entry's work budget starts when it starts running (D3), so a backlog cannot skip a later turn
    end.

  Tests:
  - a backlog of three turn ends behind a run that used almost its whole budget: all three run;
  - turn B fixes the tree while A's slow run fails: A's block is released, not delivered, and B passes;
  - B and C both end during A's run: three runs, and only the latest current result is delivered;
  - C starts but has not ended when B's run settles: nothing is delivered.
- **Every run** writes `VERIFY_CHANGED_FILES` to `<state>/changed.txt`. The list is the union of three
  sets:
  - `git diff --cached --name-only <base>` run against the **private** index after `add -A`, which has no
    `assume-unchanged` or `skip-worktree` flags, so such edits are listed;
  - untracked, non-ignored files of the **real** index (`git ls-files -o --exclude-standard`), which
    catches a file untracked with `git rm --cached` that the private index still lists;
  - every path whose stat entry differs from the per-path stat map saved with the last full pass
    (`<state>/pass-stat.json`, written next to `pass.json`), which lists an LF-to-CRLF edit even
    though its blob did not change.

  The run sets `VERIFY_BASE` (`git merge-base HEAD <base>`, else `HEAD`), which is also the `<base>`
  above. The child runs
  in its own process group with the repo root as cwd and `timeoutSeconds`. On timeout the group gets
  SIGTERM, then SIGKILL after 5 s. Output is capped at 1 MiB, and the last 60 lines go to the model.
- **Full-run pass** writes `pass.json`. The content key is computed both before and after the run, and the
  record is written only if both are equal. A full-run failure deletes it. Every record (`pass.json`,
  `tasks.json`, `blocks.json`) is written to a temp file in the same folder and renamed into place, so a
  reader never sees a partial file.
- **Limit: A→B→A during a run.** Equal ids before and after a run cannot show that the content changed
  and changed back while the command ran. The guarantee is "the content at the start equals the content
  at the end". The skill states this.
- **Gate lock: monotonic generation files.** The lock is the highest-numbered file
  `<state>/gate.lock.<n>`, and the highest file is **never deleted**, so numbers are never reused.
  - *Claim*: a contender lists the files, takes the highest `h` (0 if none) and checks whether `h` is
    free: absent, marked `released`, or held by a dead pid. If it is free, the contender writes
    `{pid, at}` to a private temp file and **hard-links** it to `gate.lock.<h+1>`. A link fails with
    `EEXIST` if the name exists, so it is an exclusive create whose file is complete the moment it
    appears; no reader ever sees a half-written owner.
  - *Check after claim*: the claimer lists again. It owns the lock only if `gate.lock.<h+1>` is still
    the highest file. If a higher number exists (it was paused while others moved on), it marks its own
    file `released` and reports contention. Two processes that both saw `h` free cannot both win
    `h+1`. A stale process that wakes up and links an old number below the highest one sees the higher
    file and backs off, so it can never displace a live owner.
  - *Release*: atomically replace your own file's content with `{pid, at, released: true}` (temp file
    plus rename onto your own name). Nothing else is deleted.
  - *Pruning*: an owner deletes files with numbers below its own and older than one hour, never the
    highest. Age never makes a lock free.

  The lock is held around the content key, the run and the record writes, so the private index and the
  records change in one transaction. Tests: two real processes; and a deterministic interleaving
  through a test seam that pauses between listing and linking. In that test A pauses after seeing a
  dead `5`; B claims `6` and releases it; C claims `7`; then A links `6`, which fails with `EEXIST`. A
  variant has A link a pruned low number, see `7`, and back off.
- **Contended triggers are not lost.** A full run (task or turn end) that finds the lock busy waits for it,
  polling every 250 ms, until its `context.deadline`. It then runs, and usually takes the shortcut
  because the other run just checked the same content. Only if the deadline passes does it report
  `verify: verification already running; nothing was checked.` (a notice at turn end, context after a
  tool). A contended **edit** check waits the same way, within its own deadline, so its file-specific
  failure still reaches the model after the tool call; it is never skipped silently.
- **Proof** `verify-pass`: under the gate lock, with a bounded wait of 2 s, it computes the current key
  and compares it with `pass.json`. It returns null on a match, otherwise a failure text naming the
  reason: no pass yet, the content changed since the pass, the config changed, or verification is
  running (the lock was not free within 2 s).

### D6. install / update / check

- `node <skill>/assets/<tool>/cli.mjs install [--repo DIR]`: checks that DIR is a git work tree and
  Node is 22 or newer. It copies the tool folder to `.agents/harness/<tool>/` and writes the tool's lock
  entry `{version, files: {path: sha256}}`. A second install with the same files does nothing (exit 0,
  no diff). It refuses when a copied file differs from the lock, naming the file. There is no override, because the RFC says the installer refuses; the message says: "Restore it with `git checkout -- <file>`, or delete the tool's folder and its lock entry to reinstall."
  It refuses when an existing copy has a different version (use `update`).
- `update`: like install, but replaces a copy whose files all match its lock, so an older version is
  replaced. It refuses on an edited copy. It removes files that the new version no longer has.
- **Validate first, then write.** Both `install` and `update` decide every refusal first: an edited copy, a
  version mismatch, an unparseable or JSONC host config, an invalid `.agents/harness.json`. Only then do
  they write anything, copies and lock last, so a refusal leaves the repo byte-identical. Both commands
  merge the host configs (hook-runtime).
- **Version rule (deferred).** Automated enforcement of the `tool.json` bump against the base branch (with
  a CI base-ref fetch) is deferred to a follow-up task, proposed in the PR, to keep this change inside the
  issue's size budget. In this change `tool.json` is bumped by hand.
- *Parity* (in this change): this repo's vendored copy under `.agents/harness/<tool>/` must equal the
  assets byte for byte ("run update"). The lock's per-file hashes still show an outdated copy in a
  target repo.
- `check` (run from the copied folder): exits 1 when any copied file is missing, extra or differs from
  the lock, or when the tool's config section has unknown keys or a missing required key. It ignores
  other tools' keys. For `verify-gate`, a fresh install leaves `"command": []`, so `check` fails with "set
  verify-gate.command" until Onboard fills it in; for `hook-runtime`, `check` passes right after
  install.
- Host configs (hook-runtime only): it merges `.claude/settings.json` (adds one entry per event with
  command `node "$CLAUDE_PROJECT_DIR/.agents/harness/hook-runtime/claude.mjs"`; `Stop`, `SubagentStop`
  and `PostToolUse` get a timeout of 1800 s, the rest 10 s) and `opencode.json` (adds
  `./.agents/harness/hook-runtime/opencode` to `plugins`). It recognizes its own entries by that command
  or path and never reorders or rewrites foreign entries. It refuses on JSONC (comments), which would be
  lost, and names the line to add by hand. Rollback: delete the folder, the lock entry and those
  entries.
- `verify-gate install` refuses until `hook-runtime` is in the lock, and adds `"verify-gate":
  {"command": []}` when the section is absent. `check` then fails with "set verify-gate.command" until the
  agent fills it in during Onboard.

### D7. Tests and CI

`tests/agent-harness/` holds the unit tests (adapters with recorded host payloads, runtime fail-open,
triggers, tree id, proof, config) and the integration tests in throwaway git repos (the five RFC install
cases, `check`, and wrapper sequences that spawn the real `claude.mjs`). They use only `node:test`. They
also include `bench-no-change.mjs`, which installs both tools, makes one full pass, then measures to the
gate's explicit no-change outcome. The handler calls `context.trace("no-change")` when the shortcut hits,
so a null result for any other reason (a skipped handler, a failure) is not counted as a hit. It runs
through a spawned `claude.mjs` and through the OpenCode plugin's `setup` fed a fake event stream, and
prints the median and p90 of 20 runs of two times. *Host to outcome*: on Claude Code, from the bench's
`spawn` call to the child's exit, which includes Node startup; on OpenCode, from pushing the event into
the fake stream to the trace line. *In runtime*: from the adapter's receipt to the outcome. It also
asserts that the command ran zero times. With `AGENT_HARNESS_TRACE=1`, the runtime writes one line per
event to `<state>/trace.jsonl`: `{event, processStart, receivedAt, handlersLoadedAt, settledAt,
outcomes: {<handler name>: <outcome>}}`, where an outcome is what the handler passed to `trace` (the
verify gate uses `"no-change"`, `"ran"` and `"contended"`), else `"result"` or `"null"` from its
return value, or `"failed"` or `"skipped"`. On OpenCode it also writes `hostCreatedAt`, the event's own
`created` timestamp, so host-to-outcome time is measured live. `processStart` is
`performance.timeOrigin`, so the Claude Code time includes interpreter startup. The live runs use
this. `npm test` adds `tests/agent-harness/*.test.mjs`. A new CI job runs
`node --test "tests/agent-harness/*.test.mjs"` on Node **22.0.0**, the promised floor: an explicit glob,
because a bare directory argument is not expanded there. The existing job runs both tools' `check`.
Test logs and control files live outside the hashed tree (in the temp repo's git dir). A Python test
builds Pages from the real repo and asserts both skills and every file under their `assets/` are in
`opencode/index.json` and on disk.

### D8. This repository's onboarding

- `scripts/verify.mjs` (repo-owned, not copied): `edit` checks the one file by type; `task` and
  `turn-end` run `skills.py validate`, `unittest`, `npm test`, and both tools' `check`. It needs PyYAML
  and `npm ci`, as CI does.
- `.agents/harness.json`: `{"hook-runtime": {}, "verify-gate": {"command": ["node", "scripts/verify.mjs"],
  "base": "origin/main"}}`.
- `.claude/settings.json` and `opencode.json`, both written by `install`.
- `AGENTS.md`: one line naming the verify command and the harness folder.

## Risks / Trade-offs

- [Host APIs move: the spike's OpenCode is 2.4.1 (veles verified 2.3.2) and Claude Code is 2.1.332] →
  Adapter tests replay the recorded fixtures, and `capabilities` prints the verified versions. A host
  update that breaks a fixture's shape fails open (no block, a failure notice), never closed.
- [The private index writes loose objects for untracked files] → Harmless; `git gc` prunes them. The skill
  says so.
- [Untracked, non-ignored build output makes the tree id slow and invalidates passes] → The skill's Onboard
  section says to ignore build output. veles has 5,699 such files (spike), which its onboarding task must
  fix.
- [A root turn end while subagents run only gets a notice, not a block] → Each subagent's own turn end
  is blocked until its work passes, and the next root turn end verifies the finished tree. Both hosts
  start one when a subagent finishes (spike finding 3).
- [Parallel subagents see each other's half-finished edits at their turn ends] → A subagent may be
  blocked by another subagent's work in progress. The block text includes the failing output so it can
  tell, and the limit of three blocks per failure ends the loop.
- [OpenCode context after a failed tool call is untested] → Reported as not delivered. The edit trigger's
  failure text comes after successful edits, which were tested.
- [The no-change shortcut is tight in veles-sized repos] → The spike's estimate (git `--debug` stat, not the
  shipped `lstat` pass, and without worker startup) is 151–287 ms
  in veles, and Node startup adds about 70 ms, so 300 ms may be missed there. It is about 50 ms here.
  The PR reports measured numbers per repo, and ignoring veles's untracked build output is the first
  fix (its onboarding task).
- [OpenCode hooks longer than 40 s were not run] → Task 12 runs a 120 s task check. A cut is reported
  under the stop rule.
- [The stat digest is conservative] → A `touch` or checkout that rewrites identical bytes forces a rerun.
  That costs time, never a wrong pass.
- [A full run at every turn end is slow in a big repo] → The no-change shortcut covers unchanged turns.
  Speed beyond that is the repo command's job, and the skill guides the agent to use related-test
  support.
- [Turn-end run longer than the host's hook timeout] → Claude Code timeout 1800 s, `timeoutSeconds` default
  900. On OpenCode the turn-end work is detached, like veles, so the event stream is never held.
- [The onboarding hooks fire while this change is applied] → The hook config lands only in the
  onboarding task group, after the tools pass their tests.
- [Duplicated library files drift between the two tools] → The byte-identity test.
- [Size: about 3,500 lines and 40 files, 3.5 times the usual] → An accepted size exception (PR budget). If
  it goes past about 1.5 times that, stop and ship the coherent part, as the issue says.

## Migration Plan

Additive. Nothing consumes the new skills until a repo installs them. This repo's onboarding is the last
task group. Rollback deletes `.agents/harness/`, `.agents/harness.json`, the hook entries and the CI step.

## Open Questions

- Resolved by the spike ([`spike.md`](spike.md)): the OpenCode plugin path (the folder's `index.mjs`
  loads, which answers the RFC open question "OpenCode plugin path"), OpenCode 2.4.1 hook names and
  payloads, Claude Code `agent_id`, and compaction re-delivery on both hosts. No capability is missing.
- Decided by the owner (2026-11-25), after Sol's review: every turn end runs the gate, subagents'
  included. A root turn end with running subagents gets a notice instead of a block (D5).
- Still open: the measured no-change turn-end time end to end on both hosts, reported in the PR. The veles
  baseline belongs to the veles onboarding task.
