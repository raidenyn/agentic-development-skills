# Verify on Three Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `agent-harness-hook-runtime` and `agent-harness-verify-gate` skills and onboard this repo, so one configured verify command runs on a file edit, a ticked task and turn end, on OpenCode and Claude Code.

**Architecture:** Each skill carries a dependency-free Node tool under `assets/<tool>/`. `install` copies the tool into `.agents/harness/<tool>/` with a sha256 lock. The hook runtime adapts each host (Claude Code: one command per event; OpenCode: an imported plugin) to six normalized events and calls the installed handlers in process, failing open. The verify gate is one such handler. It wraps the repo's single command and keys passes on the git tree id of the working-tree content.

**Tech Stack:** Node 22+ ESM `.mjs`, `node:test`, git CLI. Python 3 (`scripts/skills.py`, unittest) for the Pages catalog test.

**Spec:** `openspec/changes/verify-on-three-triggers/` — `spike.md` (live host evidence), `design.md` (D1–D8), `brainstorm.md` (implementer's calls), `specs/agent-hook-runtime/spec.md`, `specs/verify-gate-triggers/spec.md`, `specs/harness-tool-install/spec.md`. Upstream: issue #13 and the RFC `openspec/design/archive/2026-11-agent-harness/rfc-split-agent-harness-into-node-skills.md`.

## Global Constraints

- Copied code: plain `.mjs` plus `.json` data, no npm dependencies, runs on Node 22 or newer (no API newer than Node 22.0; `fs.glob` is not allowed).
- Skill names (frozen): `agent-harness-hook-runtime`, `agent-harness-verify-gate`. Tool folder names: `hook-runtime`, `verify-gate`.
- Layout (frozen): `.agents/harness/<tool>/` copied files never edited; `.agents/harness/lock.json` per tool `{version, files: {relpath: sha256}}`; `.agents/harness.json` one top-level key per tool.
- Events: `tool.before | tool.after | prompt | turn.end | compact | session.start`. Results: `{deny}` | `{context}` | `{block}`. Interface additions must be additive. The only additions are the handler's optional `timeouts` and `manual`, the block result's `ack` and `release`, the context's `signal` and `trace`, and the event's `background` and `tool.callId` (the supervisor's `spawn` and lock messages are runtime-internal, not part of the published interface). `compact` takes no result kind.
- A hook never blocks the host on its own failure; the Claude Code entry always exits 0.
- Tests live in `tests/agent-harness/` only; nothing test-only goes under `skills/`.
- Skill frontmatter: `name` equals folder name; `description` starts with "Use when", ≤1024 chars, no `<` or `>`. SKILL.md under ~500 lines.
- Commits and PR title: Conventional Commits; run `python3 scripts/skills.py install-hooks` once.
- Every turn end runs a full run, subagents' included (owner, 2026-11-25). A root turn end with `background > 0` reports a failure as a notice, not a block. Blocks: at most `min(maxBlocks, 3)` per session and failure key, shared by the root and its subagents (exact argv, exit status with signal name, tail with volatile fields normalized), reserved before delivery, plus a backstop of 10 per session. Turn ends are queued, never merged. `timeoutSeconds` default 900. Default handler deadline 5000 ms. Output tail: 60 lines; output cap 1 MiB.
- Env handover: `VERIFY_TRIGGER` (`edit|task|turn-end`), `VERIFY_FILE`, `VERIFY_BASE`, `VERIFY_CHANGED_FILES` (path of a newline list).
- Default `taskFiles`: `["openspec/changes/*/tasks.md"]`. Default `base`: `"origin/main"`.
- Never add `version` to `.claude-plugin/marketplace.json`. No new dependencies without asking.

## Review Focus

1. **Verify command missing or not executable (ENOENT/EACCES)** → treated as a failed run whose text names the command, never a crash and never a pass. Test in Task 9.
2. **Repo with no commits or no `origin/main`** → `VERIFY_BASE` falls back to HEAD, or to an empty string with every tracked and untracked file listed when HEAD does not exist; the tree id still works. Test in Task 8.
3. **Edited path outside the repo root, or deleted by the edit** → an outside path is ignored by the gate; a deleted file still triggers an edit run with `VERIFY_FILE` set. Test in Task 6 (adapter) and Task 9.
4. **`tasks.md` with CRLF line endings or `* [ ]` bullets** → ticking is still detected. Test in Task 8.
5. **Two Claude Code hook processes at once** (parallel `PostToolUse`) → the second sees the gate lock and returns a "verification already running" context, not a failure or a pass. Test in Task 9 with two real processes.

---

### Task 1: Host spike and payload fixtures (done)

Done before the design was settled; see `spike.md`. All five capabilities work on OpenCode 2.4.1 and
Claude Code 2.1.332.

**Files (exist):**
- `tests/agent-harness/fixtures/claude/<HookEvent>[-<Tool>][-<source>][-agent[-internal]][-active].json`: `PreToolUse-Bash`, `PreToolUse-Edit`, `PostToolUse-Bash`, `PostToolUse-Edit`, `PostToolUse-Read`, `PostToolUse-Agent`, `PreToolUse-Bash-agent`, `PostToolUse-Bash-agent`, `PreToolUse-Write-agent`, `PostToolUse-Write-agent`, `UserPromptSubmit`, `Stop` (with a running `background_tasks` entry), `Stop-active`, `SubagentStop-agent`, `SubagentStop-agent-internal` (compaction, `agent_type: ""`), `PreCompact`, `SessionStart-startup`, `SessionStart-resume`, `SessionStart-compact`.
- `tests/agent-harness/fixtures/opencode/`: `execute.before-{shell,read,patch}`, `execute.before-shell-child`, `execute.after-{shell,read,patch,subagent}-completed`, `execute.after-shell-completed-child`, `execute.after-read-error-child`, `execute.after-patch-tick`, `session.prompt`, and `child-lifecycle.jsonl` (from the follow-up spike). Task 10 deleted the other spike payloads, which no test read.
- `tests/agent-harness/fixtures/spike/`: the spike's plugin, hook and configs, for repeating the runs.

Paths in fixtures are `/REPO` (the repo root), `/HOME` and `/SCRATCH`. Tests substitute `/REPO` with their temp repo.

- [x] **Step 1:** OpenCode spike (plugin path, deny, after, block, compaction re-delivery, child sessions).
- [x] **Step 2:** Claude Code spike (deny, after, block, compaction, `agent_id`).
- [x] **Step 3:** Findings folded into `design.md`, `brainstorm.md`, the specs and `tasks.md`.
- [ ] **Step 4: Commit** — `git add tests/agent-harness/fixtures openspec/changes/verify-on-three-triggers && git commit -m "test: record OpenCode and Claude Code hook payloads from the host spike"`

### Task 2: Scaffold the skills and the test entry

**Files:**
- Create: `skills/agent-harness-hook-runtime/SKILL.md` (stub from `new`), `skills/agent-harness-hook-runtime/assets/hook-runtime/tool.json`, `skills/agent-harness-verify-gate/SKILL.md`, `skills/agent-harness-verify-gate/assets/verify-gate/tool.json`, `tests/agent-harness/helpers.mjs`
- Modify: `.claude-plugin/marketplace.json` (via `new`), `package.json` (`test` script), `README.md` (two rows)

**Interfaces:**
- Produces: `tool.json` = `{"name": "hook-runtime", "version": "0.1.0", "handler": false}` / `{"name": "verify-gate", "version": "0.1.0", "handler": true}`.
- Produces in `helpers.mjs`: `tempRepo({commit = true, files = {}} = {}) -> Promise<{dir, git(...args) -> string, write(rel, text), cleanup()}>` (git init, user config, optional initial commit); `ASSETS = {hookRuntime: <abs path>, verifyGate: <abs path>}`; `runNode(script, args, {cwd, input, env}) -> Promise<{code, stdout, stderr}>`.
- `npm test` = `node --test scripts/test-release-rules.mjs scripts/test-release-lifecycle.mjs tests/agent-harness/*.test.mjs`.

- [ ] **Step 1:** `python3 scripts/skills.py new agent-harness-hook-runtime "Use when ..."` and the same for `agent-harness-verify-gate`, with descriptions naming the triggers: wiring agent hooks for Claude Code or OpenCode into a repo, writing a hook handler, and checking host capabilities; and running a repo's verify command on edit, ticked task and turn end, onboarding or updating the verify gate.
- [ ] **Step 2:** Add both `tool.json` files, `helpers.mjs`, and a smoke test `tests/agent-harness/helpers.test.mjs` (`tempRepo creates a committed repo`: `git rev-parse HEAD` succeeds). Update `package.json`.
- [ ] **Step 3:** Run `npm test` and `python3 scripts/skills.py validate`. Expected: both pass.
- [ ] **Step 4: Commit** — `feat: scaffold agent-harness-hook-runtime and agent-harness-verify-gate skills`

### Task 3: Config and state libraries

**Files:**
- Create: `skills/agent-harness-hook-runtime/assets/hook-runtime/lib/config.mjs`, `.../lib/state.mjs`
- Test: `tests/agent-harness/config.test.mjs`, `tests/agent-harness/state.test.mjs`

**Interfaces:**
- Produces `config.mjs`: `readHarnessConfig(repoRoot) -> object` (`{}` if the file is absent; throws `ConfigError` on invalid JSON or a non-object); `loadSection(repoRoot, tool, {keys: string[], required: string[], defaults: object}) -> {section: object, errors: string[]}`; `class ConfigError extends Error`.
- Produces `state.mjs`: `gitDir(repoRoot) -> string` (`git rev-parse --absolute-git-dir`); `toolStateDir(repoRoot, tool) -> string`; `sessionStateDir({repoRoot, tool, host, sessionId, agentId}) -> string` (creates it; sanitizes ids to `[A-Za-z0-9._-]`); `acquireGateLock(dir, {beforeLink} = {}) -> (() => void) | null` (monotonic generation files `gate.lock.<n>`, design D5. Free means the highest file `h` is absent, `released` or held by a dead pid. A claim writes `{pid, at}` to a temp file and hard-links it to `gate.lock.<h+1>`, which fails with `EEXIST` if taken; the claimer owns the lock only if its file is still the highest when it lists again, else it marks its file `released` and returns null. Release rewrites its own file as `{..., released: true}`; files below the owner's number and older than 1 h are pruned; the highest file is never deleted. `beforeLink` is a test seam called between listing and linking); `writeJsonAtomic(path, value)` (temp file in the same folder, then rename).

- [ ] **Step 1: Write failing tests**
  - `loadSection rejects an unknown own key`: section `{"command": ["true"], "colour": 1}` with keys `["command"]` → `errors` contains a string including `colour`.
  - `loadSection ignores other tools' keys`: `{"other-tool": {"x": 1}, "verify-gate": {"command": ["true"]}}` → `errors` is `[]`.
  - `loadSection reports a missing required key`, and `missing file gives defaults`.
  - `readHarnessConfig throws ConfigError on invalid JSON`.
  - `sessionStateDir differs per agent`: `agentId "main"` vs `"a1"` → different existing dirs under `gitDir/agent-harness/<tool>/sessions/`.
  - `the lock is exclusive`: a second call returns null; after release it succeeds as `gate.lock.<h+1>`.
  - `a dead owner's lock is taken over`: `gate.lock.3` holds `{pid: <dead pid>}` → acquired as `gate.lock.4`; `gate.lock.3` stays until it is pruned.
  - `a live owner's lock is never taken over`, however old: `{pid: process.pid, at: 0}` → null.
  - `two contenders against a dead owner`: `beforeLink` holds both after listing → exactly one acquires `4`, and the other gets `EEXIST` and returns null.
  - `a paused stale contender cannot displace a live owner`: A lists (dead `5`) and pauses in `beforeLink`; B claims `6` and releases; C claims `7`; A resumes and links `6` → `EEXIST`, A returns null, C still owns. Variant: `6` was pruned, A links `6`, lists, sees `7`, marks `6` released and returns null.
  - `a reader never sees a half-written owner` (the link appears with its full content).
  - `the highest file is never deleted` after any sequence of claim, release and prune.
  - `writeJsonAtomic leaves no partial file` (a reader in a loop never sees invalid JSON while 200 writes happen).
  - `state lives outside the work tree`: after creating state, `git status --porcelain` is empty.
- [ ] **Step 2:** Run `node --test tests/agent-harness/config.test.mjs tests/agent-harness/state.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement. A claim writes `{pid, at}` to a temp file in the same folder, then `fs.linkSync(temp, "gate.lock.<h+1>")` (fails with `EEXIST` if taken), then unlinks the temp file; a lock file is never opened for writing in place. A process is dead when `process.kill(pid, 0)` throws `ESRCH`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(agent-harness-hook-runtime): add config and state libraries`

### Task 4: Install, update, check and host-config merge

**Files:**
- Create: `skills/agent-harness-hook-runtime/assets/hook-runtime/lib/install.mjs`; copy `lib/config.mjs`, `lib/state.mjs`, `lib/install.mjs` to `skills/agent-harness-verify-gate/assets/verify-gate/lib/`
- Test: `tests/agent-harness/install.test.mjs`, `tests/agent-harness/host-config.test.mjs`, `tests/agent-harness/shared-lib.test.mjs`

**Interfaces:**
- Consumes: `tempRepo`, `readHarnessConfig`.
- Produces `install.mjs`:
  - `sha256File(path) -> string`; `listToolFiles(toolDir) -> string[]` (sorted POSIX relative paths, skipping dotfiles).
  - `readLock(repoRoot) -> {version: 1, tools: {[tool]: {version, files}}}`; `writeLock(repoRoot, lock)` (stable key order, trailing newline).
  - `installTool({sourceDir, repoRoot, mode: "install"|"update"}) -> {code: 0|1, messages: string[], changed: boolean}`.
  - `checkTool({toolDir, repoRoot}) -> string[]` (problems; empty means ok). Covers missing, extra and differing files and a missing lock entry.
  - `ensureSection(repoRoot, tool, stub) -> boolean` (adds the section only if absent).
  - `mergeClaudeSettings(repoRoot, command, events: {[event]: timeoutSeconds}) -> {code, messages}`; `mergeOpencodeConfig(repoRoot, pluginPath) -> {code, messages}`.
  - `requireNode22() -> string | null`.

- [ ] **Step 1: Write failing tests** (each in a `tempRepo`, with a fake tool folder `{tool.json, a.mjs, lib/b.mjs}`)
  - `fresh install copies files and writes the lock`: files are byte-equal; `lock.tools.fake.version === "0.1.0"`; sha256 entries are present.
  - `repeated install changes nothing`: second `code 0`, `changed false`, `git status --porcelain` unchanged between runs.
  - `install refuses another installed version`: lock says `0.0.9` → `code 1`, message mentions `update`.
  - `update replaces an older version`: v0.1.0 has `old.mjs`, v0.2.0 renames it to `new.mjs` → after update, `old.mjs` is gone, `new.mjs` exists, lock `0.2.0`.
  - `update refuses an edited copy`: after editing a copied file → `code 1`, message names the relative path, no file changed, and the message says how to restore it; there is no override flag.
  - `check reports a differing byte, a missing file and an extra file`, each named.
  - `mergeClaudeSettings keeps foreign entries`: existing `{"enabledPlugins": {"x": true}, "hooks": {"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "other"}]}]}}` → the foreign object is deep-equal at the same index; the runtime entry is added once per event; a second merge leaves the file byte-identical.
  - `mergeClaudeSettings refuses JSONC`: a file containing `// comment` → `code 1`, the message contains the entry to add by hand, the file is unchanged.
  - `mergeOpencodeConfig creates the file and adds the plugin once`, and preserves `$schema` and other `plugins` entries in order.
  - `shared lib files are byte-identical` across the two `assets/*/lib/{config,state,install}.mjs`.
  - `a host-config refusal leaves everything unchanged`: `.claude/settings.json` is JSONC → `installHookRuntime` exits 1, and the repo tree (`git status --porcelain` plus file hashes) is byte-identical to before: no copy, no lock entry, no `opencode.json`.
  - (The spawned public-CLI tests belong to the tasks that create each CLI: hook-runtime in Task 7, verify-gate in Task 9.)
  - `installHookRuntime({sourceDir, repoRoot})` is **one transaction**: it preflights the copies, the lock, `.agents/harness.json`, `.claude/settings.json` and `opencode.json` before writing anything, then writes host configs and copies, with the lock last. `installTool` alone is used by verify-gate.
- [ ] **Step 2:** Run the three test files. Expected: FAIL.
- [ ] **Step 3:** Implement. Copy with `fs.copyFileSync`, writing each file to a temp name and renaming it. Write the lock last. Before writing anything, validate the whole plan, host configs and `.agents/harness.json` included, so a refusal changes nothing. `update` merges host configs like `install`. In JSON writes, keep 2-space indent and a trailing newline. The runtime's own entries are recognized by an exact command or path match.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(agent-harness-hook-runtime): add install, update, check and host config merge`

### Task 5: Runtime core: dispatch, deadlines, fail-open, proofs

**Files:**
- Create: `skills/agent-harness-hook-runtime/assets/hook-runtime/lib/runtime.mjs`, `.../lib/supervisor.mjs`, `.../lib/worker-entry.mjs`
- Test: `tests/agent-harness/runtime.test.mjs`, `tests/agent-harness/failure.test.mjs`, `tests/agent-harness/supervisor.test.mjs`

**Interfaces:**
- Consumes: `readLock`, `checkTool`, `readHarnessConfig`, `loadSection`, `sessionStateDir`.
- Produces:
  - `EVENTS` (the six strings); `RESULT_KINDS = {"tool.before": ["deny"], "tool.after": ["context"], "prompt": ["context"], "session.start": ["context"], "compact": [], "turn.end": ["block", "context"]}`.
  - `loadHandlers(repoRoot, {loadBudgetMs = 2000}) -> Promise<{handlers: Handler[], problems: string[]}>`: for each locked handler tool, `startWorker(toolDir)` from `supervisor.mjs`, which returns a proxy `Handler` once the worker reports `loaded`, or a problem after `loadBudgetMs`.
  - **Supervisor** (`supervisor.mjs`, design D3), used by both adapters:
    - `startWorker(toolDir, {workerGen}) -> Promise<ProxyHandler>`: a `worker_threads` Worker running `worker-entry.mjs`, which imports the handler.
    - The supervisor services the worker's requests: `spawn {requestId, argv, cwd, env, timeoutMs}` (it spawns, streams output, reports exit and pgid), `lock.acquire` / `lock.release` (the D5 gate lock), `trace` and `proof.request`.
    - At a deadline, `terminateWorker(gen)` kills that generation's process groups (SIGTERM, then SIGKILL, until empty), releases its locks, and starts a fresh worker.
    - Messages carry `{workerGen, requestId}`; late or foreign ones are dropped.
  - `worker-entry.mjs`: receives `event` with `{config, context data}`, builds `context` (with `spawn`, `proof`, `trace` as message calls), calls `handle`, and posts `result`. For a block, the `ack`/`release` closures stay in the worker and are invoked by supervisor messages `{type: "ack"|"release", requestId}`.
  - `createRuntime({repoRoot, host, handlers, problems = [], now = Date.now, budgetMs}) -> Runtime`. `budgetMs` is the whole-event budget (design D3); handlers that would start after it are skipped and reported.
  - `Runtime.dispatch(event, {sessionId, agentId}) -> Promise<{deny?: string, block?: string, context?: string}>`. Failure notices are appended to `context` where the event allows context, else dropped; at `turn.end` a notice is `context` (shown as a notice, not a block).
  - `Runtime.proof(name, ctx) -> Promise<string | null>`.
  - Handler context object: `{repoRoot, host, sessionId, agentId, deadline, signal, stateDir, config, proof, trace}`. `deadline` is the earlier of the handler's own timeout and the event's `workDeadline` (design D3: the work budget is the handler's timeout, else `hook-runtime.deadlines[event]`, else 5000 ms; cleanup has a separate 6000 ms after it; on Claude Code the work deadline is also capped at `hostTimeout - 7000`; a detached OpenCode turn end starts its clock when it starts running); `signal` is an `AbortSignal` aborted at `deadline`; `trace(outcome: string)` records the handler's outcome for `trace.jsonl`.
  - `Runtime.dispatch(event, {sessionId, agentId, hostDeadline})`: results are accepted only until each handler's `deadline`; the cleanup the abort starts is awaited separately until `hostDeadline - 1000`. A block result's optional `ack` is passed back to the adapter, never called by the runtime itself.
  - `loadHandlers(..., {loadBudgetMs = 2000})`: a handler still loading after the budget is skipped and reported (Claude Code; OpenCode loads at `setup`).
  - `failureNotice(name, event, reason, manual) -> string` = `hook ${name} failed on ${event}: ${reason}.` plus ` ${manual}` when `manual` is set, else ` Do this step by hand.`.

- [ ] **Step 1: Write failing tests** (handlers are passed in directly; `loadHandlers` is tested separately with a `tempRepo` install)
  - `calls only subscribed handlers in name order`, and `merges context texts in name order`.
  - `deny wins over context at tool.before`; `block texts are joined at turn.end`.
  - `invalid result kind is dropped and reported`: `{deny}` at `turn.end` → no deny, `context` includes `failed on turn.end`.
  - failure.test: `throw at tool.after proceeds with notice`; `rejection at prompt`; `timeout at tool.before gives no deny` (handler awaits forever, `timeouts: {"tool.before": 50}`); `timeout at tool.after gives the notice` (a handler that never settles, with no other live handle, in a spawned process: the process prints the notice and exits 0); `the signal is aborted at the deadline`; `a {block} returned 500 ms after the deadline is discarded and reported`; `the whole-event budget skips later handlers`; `config deadlines override the default`; `the manual text appears in the notice`.
  - `proof resolves registered, unknown ("not registered" + name) and throwing proofs`.
  - `loadHandlers skips a handler whose copy differs from the lock` and reports the tool name.
  - supervisor.test (real workers): `a handler that loops synchronously in its import is skipped after 2 s`; `a handler that loops synchronously in handle before its first await: the event returns at the deadline with the notice, and the next event gets a fresh worker`; `a worker terminated during a spawned git add leaves no git process, no held gate lock, and no blocking index.lock`; `a worker terminated right after requesting a spawn leaves no orphan`; `a late trace from a terminated event is dropped`; `a proof of the same handler is answered while that handler awaits it`; `ack and release reach the worker that produced the block`; `config changes between events reach the worker`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. A deadline is enforced with `Promise.race` against a **referenced** timer (never `unref`), cleared when the handler settles. Each handler gets `context.deadline = min(now() + timeout, workDeadline)`. A result that settles after `context.deadline` is discarded and reported as a timeout. The cleanup that the abort starts is awaited separately, up to `hostDeadline - 1000`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(agent-harness-hook-runtime): dispatch handlers with deadlines and fail-open`

### Task 6: Claude Code adapter and entry

**Files:**
- Create: `skills/agent-harness-hook-runtime/assets/hook-runtime/lib/claude-adapter.mjs`, `.../claude.mjs`
- Test: `tests/agent-harness/claude-adapter.test.mjs`

**Interfaces:**
- Consumes: Task 1 fixtures, `loadHandlers`, `createRuntime`.
- Produces:
  - `CLAUDE_EVENTS = {PreToolUse: 10, PostToolUse: 1800, PostToolUseFailure: 1800, UserPromptSubmit: 10, Stop: 1800, SubagentStop: 1800, PreCompact: 10, SessionStart: 10}` (event → timeout seconds for `mergeClaudeSettings`; `PostToolUseFailure` maps to `tool.after` like `PostToolUse`).
  - `toEvent(payload, repoRoot) -> {event, sessionId, agentId} | null`. `agentId` is `payload.agent_id ?? "main"`. It returns null for a `SubagentStop` with `agent_type === ""`.lines` (pairs of `-` and `+` runs) with `before = tool_response.originalFile`. For `Stop`, `event.background` is the count of `background_tasks` with `type === "subagent" && status === "running"`; `stop_hook_active` is ignored. The tool kind is `Bash` → shell; `Edit|Write|MultiEdit|NotebookEdit` → edit; `Read|Glob|Grep` → read; anything else → other. `files` are repo-relative and drop paths outside the root.
  - `toOutput(hookEventName, merged) -> object | null` (shapes confirmed live, see `spike.md`) — `PreToolUse` deny → `{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason}}`; context → `{hookSpecificOutput: {hookEventName, additionalContext}}`; `Stop`/`SubagentStop` block → `{decision: "block", reason}`, a notice → `{systemMessage}`. Use the exact shapes recorded in Task 1.
  - `claude.mjs`: `main({stdin, cwd, env}) -> Promise<{text: string, ack: (() => Promise<void>) | null}>`. When it runs as a script, it writes `text` with `process.stdout.write(text, cb)`. In the callback it `await`s `ack()` (which resolves only on the worker's durable `acked`), bounded by `cleanupDeadline`, and then calls `process.exit(0)`, on every path. A failure notice at `PreToolUse` is `{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext}}` with no `permissionDecision`.
  - A `Stop` notice is `{systemMessage}`, which the user sees but the model does not (design D3).

- [ ] **Step 1: Write failing tests**
  - One `toEvent` test per fixture: the expected `type`, `tool.kind`, `files`, `agentId` (`"main"`, and the subagent fixture's id `acce120c0d6e8559b`).
  - `PostToolUseFailure maps to tool.after`; `an inline test handler whose ack writes a file: after the spawned claude.mjs exits, the file exists` (ack awaited before exit); `Stop fixture has background 1`; `SubagentStop-agent-internal gives null`; `Edit file_path /REPO/README.md becomes README.md`.
  - `SessionStart compact sets afterCompact true`.
  - `edit outside the repo is dropped from files`.
  - `toOutput` for deny, context, block and notice matches the shapes above.
  - Spawned: `claude.mjs exits 0 with empty stdout on invalid stdin`; `exits 0 without block when harness.json is invalid`; `with an inline test handler (written into a temp repo's `.agents/harness/test-handler/` with a lock entry) that denies "echo HARNESS_DENY", PreToolUse prints the deny JSON`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. The repo root comes from `CLAUDE_PROJECT_DIR`, else `payload.cwd`, then `git rev-parse --show-toplevel`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(agent-harness-hook-runtime): add the Claude Code adapter`

### Task 7: OpenCode adapter, CLI, capabilities, fixture handler

**Files:**
- Create: `skills/agent-harness-hook-runtime/assets/hook-runtime/lib/opencode-adapter.mjs`, `.../opencode/index.mjs`, `.../cli.mjs`, `.../lib/capabilities.mjs`, `tests/agent-harness/fixtures/capability-handler/{tool.json,handler.mjs}`
- Test: `tests/agent-harness/opencode-adapter.test.mjs`, `tests/agent-harness/cli-runtime.test.mjs`, `tests/agent-harness/capability-handler.test.mjs`

**Interfaces:**
- Consumes: Task 1 fixtures, `createRuntime`, `loadHandlers`, the install functions, `CLAUDE_EVENTS`.
- Produces:
  - `createOpencodePlugin({runtimeFactory, setTimer, clearTimer}) -> {id: "agent-harness-hook-runtime", setup(ctx) -> Promise<() => Promise<void>>}`. The default export is `createOpencodePlugin()`.
  - Behavior (mechanisms confirmed live, see `spike.md`):
    - A deny is `throw new Error(text)` from the `execute.before` hook. Context after a tool is pushing `{type: "text", text}` onto `input.result.content`, only when `input.status === "completed"`.
    - Tool kinds per design D2: `patch` files come from `result.metadata.files[].file`, and `edit`/`write` from `input.filePath`.
    - The agent id comes from the `parentID` walk via `ctx.session.get` (depth cap 16). A lookup error, cycle or depth cap means the session is treated as root.
    - `session.start` is dispatched for the first event seen for a session id (a `session.created` arrives only for children).
    - Child lifecycle (design D3): a per-child state `running | idle`, applied in event arrival order. The child's own `session.execution.started` sets `running`, and `.succeeded`/`.failed`/`.interrupted` set `idle`. A `subagent` launch result (`result.metadata: {sessionID, status: "running"}`) sets `running` only if no lifecycle event of that child has been seen. `background` is the count of the root's `running` children.
    - Superseded results: a **start generation** per session, a counter incremented on each `session.execution.started` received for it (fixtures have distinct event ids, not a shared execution id). The detached `turn.end` captures the generation when `session.execution.succeeded` arrives. If the generation has moved on when its result is ready, the result is dropped: it is not delivered and its `ack` is not called. The rerun recomputes `background`. For a result that is kept, `ack` is called after `ctx.session.synthetic` resolves.
    - Deadlines are computed by one function, `eventDeadlines(handlers, event, startedAt)`: work = the largest `timeouts[event]` or `hook-runtime.deadlines[event]`, else 5000; `hostDeadline = startedAt + work + 6000`. `startedAt` is receipt for hooks, and **dequeue** for a queued turn end. Declarations are read at `setup`.
    - `session.execution.succeeded` → a detached `turn.end`, one in flight per session. Another one for that session while a run is in flight is appended to the slot's FIFO `{event, generation}`; every queued entry runs in order, and a result is delivered only if its generation is still current, else its `release` is called. A block → `ctx.session.synthetic({sessionID, text, resume: true})`; a notice → `resume: false`.
    - `session.compaction.started` → `compact`. `session.compaction.ended` writes `compacted` into the session's state folder. The next `ctx.session.hook("context")` call for that session dispatches `session.start` with `afterCompact: true`, pushes its context onto `input.system`, and clears the mark.
    - Prompt context is queued and pushed onto `system` the same way.
    - Dispose is bounded at 1000 ms.
    - Handlers are loaded once at `setup` through Task 5's `loadHandlers` (workers under the supervisor).
  - `HOST_CAPABILITIES = {"claude-code": {deny: true, contextAfterTool: true, blockTurnEnd: true, redeliverAfterCompact: true, perSubagentState: true, verified: "2.1.332"}, "opencode": {all five true, verified: "2.4.1"}}` (per `spike.md`); `EVENT_NEEDS = {"tool.before": "deny", "tool.after": "contextAfterTool", "turn.end": "blockTurnEnd", "session.start": "redeliverAfterCompact"}`; `missingCapabilities(host, handlers) -> string[]`.
  - `cli.mjs` commands: `install [--repo DIR]`, `update [--repo DIR]`, `check`, `capabilities`. Install also calls `mergeClaudeSettings(repo, 'node "$CLAUDE_PROJECT_DIR/.agents/harness/hook-runtime/claude.mjs"', CLAUDE_EVENTS)` and `mergeOpencodeConfig(repo, "./.agents/harness/hook-runtime/opencode")`, and `ensureSection(repo, "hook-runtime", {})`. `update` does the same merges. Allowed own keys: `["deadlines"]`.
  - Fixture handler `capability-fixture`: denies a shell command containing `HARNESS_DENY`; adds `HARNESS_AFTER <agentId> <count>` after every tool (the count lives in its per-agent state file); blocks the first `turn.end` per agent with `HARNESS_BLOCK`, then returns null; at `session.start` with `afterCompact` it returns `HARNESS_REDELIVER`.

- [ ] **Step 1: Write failing tests**
  - opencode-adapter, with a fake `ctx` that records calls and replays the 1.1 fixtures: `execute.before denies by throwing an Error with the text`; `execute.after on an error status delivers nothing and reports it`; `patch files come from metadata`; `a subagent launch result makes the child running and its execution.succeeded makes it idle`; `a failed session lookup makes the session root`; `compaction.ended then context pushes onto system once`; `the compaction mark survives a new plugin instance`; `execute.after appends context to result.content only`; `turn end sends a synthetic resume for a block`; `turn ends B and C during A's run both run after A, in order`; `a backlog of three turn ends behind a run that used almost all its budget: all three run`; `dispose during an active run returns within 1 s, and the gate lock is released only after the run's process group is gone`; `two events for one handler run in separate workers, and a tool.before timeout does not end the turn-end run`; `turn B fixes the tree while A's slow run fails: A's block is released, not delivered, and B passes`; `only the latest current result is delivered`; `a fast child whose succeeded arrives before its launch result counts idle`; `C starts but has not ended when B's run settles: nothing is delivered and B's release is called`; `a worker handler that runs while(true){} during execute.before: the command still runs` (through the plugin); `a child resumed by a block counts running again`; `a child session gets the child id as agentId`; `compaction then prompt re-delivers context`; `a throwing handler never throws out of a hook`; `dispose resolves within the bound`.
  - cli-runtime (spawned `cli.mjs`, `install` and `update`): `foreign hook entries kept`; `an edited copy refused`; `an unknown own key rejected`; `a foreign top-level key ignored`; `a JSONC settings file is refused and nothing changes`; `install in a temp repo writes the folder, lock, harness section and both host configs`; `check passes, then fails after editing claude.mjs`; `capabilities prints both hosts and five rows each`; `the capabilities check at session.start lists a capability that a handler needs and the host lacks` (with a stubbed `HOST_CAPABILITIES`).
  - capability-handler: drive the fixture through both adapters → deny, after-text with separate counts for `main` and a subagent, block then pass, and re-delivery.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement, following the veles plugin's patterns listed in design Context (budgeted session lookup, detached turn end, bounded dispose). No code is copied.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(agent-harness-hook-runtime): add the OpenCode adapter, CLI and capability report`

### Task 8: Verify gate libraries: tree id, runner, triggers

**Files:**
- Create: `skills/agent-harness-verify-gate/assets/verify-gate/lib/tree.mjs`, `.../lib/run.mjs`, `.../lib/triggers.mjs`
- Test: `tests/agent-harness/tree.test.mjs`, `tests/agent-harness/run.test.mjs`, `tests/agent-harness/triggers.test.mjs`

**Interfaces:**
- Produces:
  - `contentKey({repoRoot, stateDir, spawn}) -> Promise<{tree: string, stat: string, statMap: Map<string, string>}>`, to be called only while holding the gate lock; every git command goes through `spawn` (the supervisor's, D3). A leftover `<stateDir>/index.lock` is deleted first, because under the gate lock it is necessarily stale. It sets `GIT_INDEX_FILE=<stateDir>/index`, built with `git read-tree HEAD` when absent (empty without HEAD). On every call it reconciles tracked-but-ignored membership with the real index at `git rev-parse --git-path index` (design D4), then runs `git -c core.trustctime=true -c core.checkStat=default add -A`, `git write-tree` and `git ls-files -z`. The `stat` digest is sha256 over the sorted `fs.lstat(path, {bigint: true})` data of every listed path: path, mode, size, ino, `mtimeNs`, `ctimeNs`. It also returns `statMap: Map<path, string>` (per-path stat hashes) for `pass-stat.json`. If git reports the index as corrupt, it deletes the index and rebuilds once.
  - `changedFiles({repoRoot, baseRef, stateDir, statMap, lastStatMap, spawn}) -> Promise<{base: string, files: string[]}>`: `base` is `merge-base HEAD baseRef`, else `HEAD`, else `""`. `files` is the union of `git diff --cached --name-only <base>` against the **private** index (or every private-index path when there is no HEAD), the real index's untracked non-ignored files (`git ls-files -o --exclude-standard`), and the paths whose `statMap` entry differs from `lastStatMap` (`pass-stat.json`: `{"version": 1, "stats": {path: hash}}`). Untracked non-ignored files are in the private index after `add -A`, so they are covered.
  - `runCommand({spawn, argv, cwd, env, timeoutMs, signal, deadline, cleanupDeadline, maxBytes = 1048576, tailLines = 60}) -> Promise<{code: number | null, exitKind: "exit"|"signal"|"timeout"|"aborted"|"spawn-error", signal: string | null, timedOut: boolean, spawnError: string | null, tail: string}>` (`signal` is the real name, such as `SIGSEGV`). It uses `detached: true`. On timeout or abort it sends SIGTERM to `-pid`, then SIGKILL to `-pid` after `min(5000, cleanupDeadline - now - 1000)` ms, leaving at least 1 s after SIGKILL to confirm the group is empty (`cleanupDeadline = hostDeadline - 1000`, at least 5 s after `deadline`). In a worker, the process is started by the supervisor through `spawn`, so termination never orphans it. The escalation timer is not cancelled when the leader exits. It resolves only when `process.kill(-pid, 0)` throws `ESRCH` (the group is empty), polling every 50 ms. 
  - `matchesGlob(pattern, relPath) -> boolean` (`*` within a segment, `**` across segments).
  - `parseItem(line) -> {key: string, ticked: boolean} | null` (a checkbox item; the key is the trimmed text after the box; handles CRLF and `-`/`*`/`+` bullets).
  - `itemCounts(text) -> Map<string, {ticked: number, unticked: number}>` (key: trimmed text after the box; CRLF and `-`/`*`/`+` bullets).
  - `detectTicks(before: Map, after: Map) -> string[]`: keys whose unticked count fell and ticked count rose, `min(fall, rise)` times; one detector for edits and shell calls. `suppressSeen(ticks, snapshot, callAt) -> string[]` removes, per key, as many ticks as the snapshot recorded after `callAt`.

- [ ] **Step 1: Write failing tests**
  - tree: `two consecutive no-change calls give equal keys`; `an edit within the same second as the last key computation changes the key`; `a same-size rewrite followed by touch -r to the old mtime changes the key` (ctime moved); `under a test clean filter that lowercases (filter.lower.clean = tr A-Z a-z), editing A to a changes the key`; `LF to CRLF under text=auto changes stat but not tree`; `an assume-unchanged file's edit changes the key` (flag set in the real index); `linked worktree reads membership from its own index` (a `git worktree add` temp worktree); `force-tracked ignored file counts` (an ignored file added with `git add -f` to the real index, then edited → the id changes); `git rm --cached of an ignored file drops it`; `private index is reused` (second call does not copy `.git/index` again); `a corrupt private index is rebuilt`; `same id after committing unchanged content`; `changes on a tracked edit`; `changes on a new untracked file`; `ignores a gitignored file`; `real index untouched` (`git diff --cached --name-only` is empty before and after, with an unstaged change present); `works in a repo with no commits`.
  - changedFiles: `lists a modified tracked file and an untracked file against merge-base`; `falls back to HEAD without origin/main`; `no HEAD gives base "" and all files`.
  - run: `abort kills the group and resolves after exit` (the signal aborts mid-run; afterwards no child pid remains); `passes env through and returns code 0`; `nonzero code and tail of the last 60 lines`; `timeout kills the process group` (the command spawns `sleep 30` in a child; afterwards that pid is gone); `ENOENT gives spawnError naming the command`; `output over maxBytes is truncated, not fatal`.
  - triggers: `matchesGlob("openspec/changes/*/tasks.md", "openspec/changes/x/tasks.md")` is true, and false for `openspec/changes/x/y/tasks.md`; `detectTicks` finds `["1.2 Write the thing"]` for the before/after texts of both tick fixtures (with `1.1` and `1.4` ticked and unchanged); a moved and ticked item gives one tick; an added `- [x] 9.9 New` gives `[]`; a new file gives `[]`; reorder and duplicate labels give `[]`; CRLF and bullets work; a swap of two identically labelled items gives `[]` (the stated limit); `suppressSeen` removes one tick recorded after the call began, keeps a second real tick of the same label, and keeps a re-tick whose earlier tick was recorded before the call.
  - changedFiles: `an LF-to-CRLF edit is listed via the stat map`; `an assume-unchanged edit is listed via the private index`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(agent-harness-verify-gate): add tree id, command runner and trigger detection`

### Task 9: Verify handler, proof, CLI and benchmark

**Files:**
- Create: `skills/agent-harness-verify-gate/assets/verify-gate/handler.mjs`, `.../cli.mjs`, `tests/agent-harness/bench-no-change.mjs`
- Test: `tests/agent-harness/verify-handler.test.mjs`, `tests/agent-harness/verify-proof.test.mjs`, `tests/agent-harness/cli-verify.test.mjs`

**Interfaces:**
- Consumes: Task 8 functions, `acquireGateLock`, `toolStateDir`, `sessionStateDir`, the install functions, `createRuntime` (in tests).
- Produces:
  - `createVerifyHandler({runCommand, contentKey, changedFiles} = defaults) -> Handler` with `name: "verify-gate"`, `events: ["session.start", "tool.before", "tool.after", "turn.end"]` (`session.start` creates the worktree tasks snapshot if absent; a shell or edit-kind `tool.before` writes the call-scoped before-image `<session state>/<agent>/calls/<callId>.json` without taking the lock; every `turn.end` runs; a root `turn.end` with `background > 0` turns a failure into a notice; a full run that finds the lock busy polls it every 250 ms until its deadline), `timeouts` from `timeoutSeconds * 1000 + 10000` for `tool.after` and `turn.end`, `manual: "Run node .agents/harness/verify-gate/cli.mjs run by hand."`, and `proofs: {"verify-pass": check}`. The default export is `createVerifyHandler()`.
  - Config keys: `["command", "base", "taskFiles", "timeoutSeconds", "maxBlocks"]`, required `["command"]` (a non-empty string array).
  - Files (all written with `writeJsonAtomic`): `<toolStateDir>/pass.json` = `{"version": 1, "tree", "stat", "config", "trigger"}`; `<toolStateDir>/gate.lock.<n>`; `<toolStateDir>/changed.txt`; `<toolStateDir>/tasks.json` = `{"version": 1, "files": {path: {key: {ticked, unticked}}}}`; `<toolStateDir>/sessions/<host>-<root session>/blocks.json` = the reservation ledger below; `<session state>/<agent>/calls/<callId>.json` = `{"version": 1, "at", "files": {path: {key: {ticked, unticked}}}}`.
  - `failureKey({argv, exitKind, code, signal, tail}, repoRoot) -> string` = sha256 of the exact argv joined with `\0`, then `exitKind`, `code` and `signal`, then the tail after `normalizeTail(tail, repoRoot)`. `normalizeTail` replaces: the repo root → `<root>`; `/\b\w*(duration|time)\w*[:=]?\s*\d+(\.\d+)?/i` (Node TAP `duration_ms: 12.3`, `# duration_ms 845.2`) → `<dur>`; paths under `os.tmpdir()` → `<tmp>`; ISO-8601 timestamps and `HH:MM:SS` → `<time>`; `/\b\d+(\.\d+)?\s?(ms|s|sec|m)\b/` → `<dur>`; `/\b0x[0-9a-f]+\b/i` and `/\b(?=[0-9a-f]*[a-f])[0-9a-f]{8,}\b/i` → `<hex>` (a hex run must contain a letter, so an 8-digit decimal code is kept). Other digits are kept.
  - Charges (design D5): under the gate lock, `blocks.json` (`{"version": 1, "charges": [{id, key, confirmed}]}`) is read; if charges for the key reach `min(maxBlocks, 3)`, or all charges reach 10, the gate returns the notice; else it appends a charge and returns `{block, ack, release}`. `ack` sets `confirmed`; `release` removes the charge; a charge without either stays.
  - Limits: `min(config.maxBlocks ?? 3, 3)` per failure key **per session** (root agent and subagents together; OpenCode children counted under their root's id), and a backstop of 10 blocks in total per session. Counts live in `<toolStateDir>/sessions/<host>-<root session>/blocks.json`, read and written under the gate lock.
  - The shortcut calls `context.trace("no-change")`; a run calls `context.trace("ran")`.
  - Texts: a block starts `verify: ${argv.join(" ")} failed (attempt ${n} of ${max})`; the notice after the max starts `verify: still failing after ${max} blocks; continuing.`; the background notice starts `verify: ${argv.join(" ")} fails while ${n} subagent(s) still run; verification runs again at the next turn end.`; a tick failure starts `verify: a task was ticked while verification fails.`; contention is `verify: verification already running; nothing was checked.`; proof failures are `verify-pass: no full pass yet` / `verify-pass: the content changed since the last pass` / `verify-pass: the verify-gate config changed since the last pass` / `verify-pass: verification is running`.
  - `runGate({repoRoot, trigger, file, config, stateDir, signal, deadline}) -> Promise<{status: "skipped"|"passed"|"failed"|"contended", text}>`, used by the handler and `cli.mjs run`.
  - `cli.mjs` commands: `install`, `update`, `check`, `run` (a plain full run). Install refuses without `hook-runtime` in the lock and calls `ensureSection(repo, "verify-gate", {"command": []})`.

- [ ] **Step 1: Write failing tests** (temp repos; a command script `verify.sh` that logs its env to a file and exits per a control file)
  - `edit runs the command with VERIFY_TRIGGER=edit and VERIFY_FILE`; `edit failure returns context naming the file`; `an edit pass writes no pass record`.
  - `tick in a matching tasks.md runs a full run with VERIFY_TRIGGER=task and skips the edit run`; `tick failure context starts "verify: a task was ticked"`; `tick in docs/notes.md runs only the edit run`; `a sed -i tick after a shell tool.after runs a task run`; `a new tasks file created ticked runs only the edit run`; `a shell tool.before and tool.after are matched by tool.callId` (Claude `tool_use_id`, OpenCode `id`); `an edit during another run waits for the lock and its failure reaches the model`; `interleaved agents: a subagent's tick is detected once, and the root's later edit of the same file does not re-detect it`.
  - `turn end failure blocks with attempt 1 of 3`; `a root turn end with background 1 runs and returns the background notice, not a block, and does not count`; `a subagent's failing turn end is blocked`; `the fourth turn end with the same failure passes with the notice, even with an unrelated edit before each` (the command still runs each time); `a different failure gets its own three blocks`; `E101 then E202 are two failures`; `a changing temp path in the output is one failure`; `after 10 blocks in total the gate only notifies`; `maxBlocks 9 in config still blocks at most 3 times` (runtime cap); `a subagent's two blocks and the root's one block on the same failure exhaust the session's limit`; `through spawned claude.mjs, three identical Stop failures leave three committed blocks in blocks.json even after every reservation's until has passed` (ack awaited before exit); `a tick moved from one hunk to another is detected`; `a child's tick followed by an overlapping root shell call that began earlier reports the tick once`; `a before-image with no tool.after is deleted after one hour`; `git rm --cached of an unchanged file puts it in the changed list`; `an OpenCode handler that spawns with default settings gets 5 s of work`; `two simultaneous failures at count two: exactly one block, one notice` (two spawned claude.mjs processes, and two OpenCode sessions sharing a root, checking the persisted blocks.json); `an untick between sessions followed by a whole-file Write tick is detected from the call's before-image`; `through spawned claude.mjs, the fourth identical Stop failure in a session passes with the notice` (proves `ack` persistence across processes); `maxBlocks 5 is rejected by check`.
  - `edit pass then turn-end failure on the same content`: the turn-end run happens and blocks, and `verify-pass` fails.
  - `unchanged tree after a full pass: the command is not run` (the log has no new line) for each of the three triggers.
  - `handover` for each trigger: `VERIFY_TRIGGER` is correct; `VERIFY_FILE` is set only for `edit`; `VERIFY_BASE` equals the merge-base sha; the `VERIFY_CHANGED_FILES` file exists and lists the modified path. The env log is written outside the hashed tree (into the temp repo's git dir).
  - `a tree changed during the run writes no pass record` (the command itself writes a file).
  - `a full failure deletes the pass record`.
  - `two real processes at once`: two spawned `cli.mjs run` processes started together → the second waits for the lock and then takes the shortcut or runs, and `pass.json` is valid JSON afterwards; `a run whose deadline passes while waiting reports contended`; `a concurrent proof read during a run returns "verification is running" or a valid result, never a crash`.
  - `a timed-out handler (signal aborted) writes no pass record`.
  - `a missing command binary blocks with a text naming it`.
  - verify-proof: `holds after a full pass`; `holds after committing unchanged content`; `fails after an edit with "content changed"`; `fails after a config change`; `never holds after only edit runs`.
  - cli-verify (spawned `cli.mjs`, `install` and `update`): `an edited copy refused`; `an unknown own key rejected`; `a foreign top-level key ignored`; `install refuses without hook-runtime`; `check fails when hook-runtime is missing from the lock`; `install adds the command stub and check fails with "set verify-gate.command"`; `check passes once the command is set`; `run exits 0 on a pass and 1 on a failure`; `four consecutive turn ends with a real, consistently failing node:test file (changing duration_ms) count as one failure, so the fourth gets the notice`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `handler.mjs` and `cli.mjs`. Add `AGENT_HARNESS_TRACE=1` support to the runtime: one line per event in `<state>/trace.jsonl` with `{event, processStart, hostCreatedAt?, receivedAt, handlersLoadedAt, settledAt, outcomes: {<handler name>: <outcome>}}` (design D7). The verify gate traces `"no-change"`, `"ran"` or `"contended"`. Write `bench-no-change.mjs`. It installs both tools into a temp repo with a command that appends to a log in the git dir and exits 0, then runs one full pass. It then times 20 `Stop` events through spawned `claude.mjs` and 20 `session.execution.succeeded` events through the OpenCode plugin's `setup` with a fake event stream, counting only events whose trace has `outcomes["verify-gate"] === "no-change"`. It prints, per host, the median of host-to-outcome time (Claude Code: `spawn` to child exit, including Node startup; OpenCode: pushing the event to the trace line) and of in-runtime time (`receivedAt` to `settledAt`). It asserts that the command log gained no line. It is not part of `npm test`.
- [ ] **Step 4:** Run `npm test`, then `node tests/agent-harness/bench-no-change.mjs`. Expected: tests PASS; the bench prints both medians (record them for the PR).
- [ ] **Step 5: Commit** — `feat(agent-harness-verify-gate): add the verify handler, verify-pass proof and CLI`

### Task 10: Skill text, catalog test, Node 22 CI job

**Files:**
- Modify: `skills/agent-harness-hook-runtime/SKILL.md`, `skills/agent-harness-verify-gate/SKILL.md`, `README.md`, `scripts/test_skills.py`, `.github/workflows/validate.yml`

**Interfaces:**
- Consumes: the CLI commands, config keys, texts and `HOST_CAPABILITIES` from Tasks 4–9.

- [ ] **Step 1: Write the failing catalog test** `test_real_repo_publishes_harness_assets` in `scripts/test_skills.py`: run `build_pages("0.0.1", out, "raidenyn/agentic-development-skills")` on `ROOT`. For each of the two skills, every path from `os.walk(skills/<skill>/assets)` appears as `assets/...` in that skill's `files` in `opencode/index.json` and exists under `out/opencode/<skill>/`.
- [ ] **Step 2:** Run `python3 -m unittest scripts.test_skills -k harness_assets`. Expected: it passes already if Tasks 2–9 landed (`skill_files` publishes `assets/`). If it fails, fix the build, not the test.
- [ ] **Step 3:** Write both SKILL.md files. Sections:
  - hook-runtime: When to use, What it installs, Handler interface (D2 shape, with `timeouts` and `manual` marked as additions), Capabilities table, Onboard, Update, Remove, and the security warning.
  - verify-gate: When to use, The one command (`VERIFY_*`), Triggers (every turn end, subagents' included; the background notice), Limits (A→B→A during a run, a conservative stat digest, synchronous handlers on OpenCode, ignore build output), Making it fast (related-test support first, a hand-built mapping only where none exists), Config keys with defaults, `verify-pass`, Onboard, Update, Remove, and the security warning.
  - The security warning, verbatim in both: "Before starting an agent in a clone you do not trust, read its `.claude/settings.json`, `opencode.json` and `.agents/harness/`: these hooks run code on every tool call."
  - Onboard: from the installed skill folder, `node <skill>/assets/<tool>/cli.mjs install`. Then set the config, add `node .agents/harness/<tool>/cli.mjs check` to CI, and verify live with one edit and one turn end.
- [ ] **Step 4:** Fill in the README rows. Add a `harness-node22` job to `validate.yml`: checkout, then `setup-node` with `node-version: "22.0.0"` (the promised floor) and `node --test "tests/agent-harness/*.test.mjs"` (an explicit glob; a bare directory is not expanded on 22.0), with no `npm ci`. Pin the actions to the same SHAs as the existing job.
- [ ] **Step 5:** Run `python3 scripts/skills.py validate`, `claude plugin validate .` and `python3 -m unittest discover -s scripts -p 'test_*.py'`. Expected: all pass.
- [ ] **Step 5b:** Trim fixtures: delete every file under `tests/agent-harness/fixtures/` that no test reads (`grep` each name in `tests/agent-harness/*.test.mjs`). Keep `fixtures/spike/` for repeating the spike runs.
- [ ] **Step 6: Commit** — `docs: write the hook runtime and verify gate skills, test their catalog assets`

### Task 11: Onboard this repository

**Files:**
- Create: `scripts/verify.mjs`, `tests/agent-harness/repo-verify.test.mjs`, `.agents/harness/hook-runtime/**`, `.agents/harness/verify-gate/**`, `.agents/harness/lock.json`, `.agents/harness.json`, `.claude/settings.json`, `opencode.json`
- Modify: `AGENTS.md`, `.github/workflows/validate.yml`

**Interfaces:**
- Consumes: both `cli.mjs install`, `VERIFY_*`.
- Produces: `scripts/verify.mjs` exports `editChecks(relPath) -> string[][]` (the argv list for one file): `.mjs` → `[["node", "--check", f]]`; `.py` → `[["python3", "-m", "py_compile", f]]`; `skills/**` or `.claude-plugin/marketplace.json` → `[["python3", "scripts/skills.py", "validate"]]` (added to the others); `.json` → JSON parse in process; anything else → `[]`. It also exports `FULL_CHECKS`: `[["python3", "scripts/skills.py", "validate"], ["python3", "-m", "unittest", "discover", "-s", "scripts", "-p", "test_*.py"], ["npm", "test"], ["node", ".agents/harness/hook-runtime/cli.mjs", "check"], ["node", ".agents/harness/verify-gate/cli.mjs", "check"]]`. Main reads `VERIFY_TRIGGER` and `VERIFY_FILE` and exits non-zero on the first failure, printing the failing argv.

- [ ] **Step 1: Write failing tests** in `repo-verify.test.mjs` (now) and `tests/agent-harness/vendored.test.mjs` (written now, but expected to pass only after Step 3 installs the copies). The latter checks, for each tool, that this repo's `.agents/harness/<tool>/` equals `skills/*/assets/<tool>/` byte for byte (else "run update"). Version-bump enforcement against the base branch is deferred to a follow-up task (design D6). In `repo-verify.test.mjs`: `editChecks` returns the argv above for `a.mjs`, `scripts/x.py`, `skills/feature-rfc/SKILL.md`; `[]` for `README.md`; `an invalid .json file fails the edit run`.
- [ ] **Step 2:** Run. Expected: FAIL. Then implement `scripts/verify.mjs`. Run again. Expected: PASS.
- [ ] **Step 3:** Run `node skills/agent-harness-hook-runtime/assets/hook-runtime/cli.mjs install` and then `node skills/agent-harness-verify-gate/assets/verify-gate/cli.mjs install`. Set `.agents/harness.json` to `{"hook-runtime": {}, "verify-gate": {"command": ["node", "scripts/verify.mjs"], "base": "origin/main"}}`. Read the generated `.claude/settings.json` and `opencode.json`. Then run `node --test tests/agent-harness/vendored.test.mjs`. Expected: PASS (the copies now exist).
- [ ] **Step 4:** Add to `AGENTS.md`: "Agent hooks run `node scripts/verify.mjs` on edits, ticked tasks and turn end (`.agents/harness/`); run it by hand with `node .agents/harness/verify-gate/cli.mjs run`." Add two steps to the existing `validate` job, after `npm test`: `node .agents/harness/hook-runtime/cli.mjs check` and `node .agents/harness/verify-gate/cli.mjs check`.
- [ ] **Step 5:** Run every standard check: `python3 scripts/skills.py validate`, `claude plugin validate .`, `python3 -m unittest discover -s scripts -p 'test_*.py'`, `npm test`, both `check` commands, and `node .agents/harness/verify-gate/cli.mjs run`. Expected: all exit 0.
- [ ] **Step 6: Commit** — `feat: onboard this repository onto the hook runtime and verify gate`

### Task 12: Live evidence and the PR report

The spike in Task 1 proved the host mechanisms with throwaway code. This task proves the shipped tools.

**Files:**
- Create: `openspec/changes/verify-on-three-triggers/evidence.md` (the transcript excerpts, host versions and timings for the PR body)

Every live step uses evidence written outside the hashed tree, in the scratch repo's git dir, so it
cannot change the content id. It does not rely on model self-reports alone:

- the verify command is a wrapper that appends one JSON line per invocation to
  `<git-dir>/live/invocations.jsonl`: `{argv, VERIFY_TRIGGER, VERIFY_FILE present, VERIFY_BASE,
  VERIFY_CHANGED_FILES present, agent}`;
- the denial sentinel matches the capability fixture's deny rule: the denied command is
  `echo HARNESS_DENY > <git-dir>/live/denied-ran`, and that file must not exist afterwards. An allowed
  control, `echo HARNESS_ALLOW > <git-dir>/live/allowed-ran`, must exist, which proves the session did
  run shell commands;
- the runtime trace (`AGENT_HARNESS_TRACE=1`, `<state>/trace.jsonl`) gives per-event timings and
  outcomes;
- markers the model never sees in its prompt (for example `HARNESS_AFTER <agentId> <n>`), checked in the
  session transcript, not asked for in the prompt.

- [ ] **Step 1: OpenCode capabilities.** Use a scratch repo with both tools and the capability fixture installed (copied to `.agents/harness/capability-fixture/` with a lock entry). Run an `opencode run --standalone` session that runs the sentinel command, edits a file, and launches a subagent that edits a file. The prompt must not mention the markers. Then compact it with a reproducible step (`ctx.session.compact` through a test-only plugin hook, or the TUI `/compact`) and continue the session. Show from the transcript and the evidence files:
  - the sentinel never ran;
  - `HARNESS_AFTER` reached the model with root and child counts that run independently;
  - one block and one continue happened;
  - re-delivery happened **once** after compaction ended, and a later request did not repeat it;
  - the shipped adapter changed `result.content` only.
  - a handler made to throw on a failed tool call (`status: "error"`) has its notice reach the model through `system` at the next request.

  Record `opencode --version`.
- [ ] **Step 2: OpenCode three triggers on this repo.** Make an **instrumented worktree**: `git worktree add <scratch>/live-wt HEAD` from this branch, outside this checkout. In it, run `npm ci` and `pip install -r requirements-dev.txt`, then run `node scripts/verify.mjs` with `VERIFY_TRIGGER=turn-end` and confirm a **passing baseline** before breaking anything. In it:
  - copy the onboarded `.agents/` and host configs;
  - set `verify-gate.command` to `["node", "<git-dir>/live/wrap.mjs", "node", "scripts/verify.mjs"]`. `wrap.mjs` lives in that worktree's git dir: it logs the invocation, then runs the real command with `stdio: "inherit"` and passes on its exit code;
  - add a **persistent failing check**: commit `skills/live-broken/SKILL.md` with frontmatter that has no `description`, so `skills.py validate`, and so every full run, fails until the folder is deleted.

  Then, in one session:
  - write an invalid `.json` file (the edit fails);
  - tick a box in a scratch `openspec/changes/live-check/tasks.md` (the task run fails);
  - end the turn (the turn end blocks).

  Show in `invocations.jsonl` the same wrapped argv with `edit`, `task` and `turn-end`, and that each failure reached the model. Then use a 120 s failing check (a `live-slow` command variant) to show that a task run of that length completes inside `execute.after`. After each slow variant, restore `verify-gate.command` to the wrapped real command. Then use a command that sleeps 20 s and fails, to show a delayed block still resumes the session, and that a second turn end during that run causes exactly one rerun. Show that the turn end passes after deleting `skills/live-broken/`, then remove the worktree with `git worktree remove --force` and delete its branch if one was made.
- [ ] **Step 2b: OpenCode child lifecycle.** Use a scratch repo with **only** the two shipped tools, so nothing else blocks the root. The verify command fails while `<git-dir>/live/fail` exists. Steps:
  1. With the fail file present, the root launches a subagent that edits a file. The shipped gate blocks the subagent's turn end. Record from the trace whether the parent sees the child's completion before or after that block.
  2. Remove the fail file; the child continues and finishes, and the root's turn end while the child still ran got the background notice.
  3. Launch a second child and cancel it with `ctx.session.interrupt` through a test-only plugin hook.
  4. For the final root turn: re-create the fail file **and** change a tracked file's content, so the content key differs from the last pass and the shortcut cannot apply. Then end the root turn and show it is blocked.
  5. **Expected order on OpenCode** (spike, "Subagent block on OpenCode"): the parent may be handed the child's pre-fix result, but it **must** be handed the child's result again after the child's resumed run passes, and the root's final turn end must verify. A missing second hand-off, or a child that never resumes after its block, is reported under the issue's stop rule. Record the child and parent session ids and the timestamps of each hand-off from the trace.

  Save the correlated events (start, blocked turn end, resume, succeeded, interrupted) as fixtures. (None were added; the lifecycle fixture in the tree is the spike's `fixtures/opencode/child-lifecycle.jsonl`.)
- [ ] **Step 3: Claude Code.** Repeat Steps 1–2 with `claude -p` (compaction with `--resume <id> "/compact"`), and record `claude --version`. Claude Code's own child recipe:
  1. With the fail file present, the root launches a background `Agent` that edits a file; the shipped gate blocks that subagent's `SubagentStop`.
  2. The root's `Stop` while the subagent runs (`background_tasks` lists it) gets the notice.
  3. Remove the fail file and let the subagent finish; the task-notification turn follows.
  4. Re-create the fail file and change a tracked file; the root's next `Stop` is blocked.

  Also show that a `PreToolUse` handler made to throw lets the command run and its notice (`additionalContext` with no permission decision) reaches the model.

  There is no programmatic cancel in `-p` mode, so cancellation is OpenCode-only and is reported as such.
- [ ] **Step 4: Timing.** Run `node tests/agent-harness/bench-no-change.mjs` (medians per host, zero command invocations). In one live session per host, after a full pass, end a turn with no change and read its `trace.jsonl` line, which must have `outcomes["verify-gate"] === "no-change"`. Report separately:
  - live host-to-outcome: OpenCode `settledAt - hostCreatedAt`; Claude Code `settledAt - processStart`, which excludes the host's own spawn time (stated);
  - in-runtime: `settledAt - receivedAt`;
  - the bench's two times.

  Compare each against 300 ms.
- [ ] **Step 5: Report.** Write `evidence.md` with each acceptance criterion of issue #13 and its evidence; the contracts and areas changed; deviations (the additive `timeouts`, `manual`, `ack`, `release`, `signal`, `trace`, `background` and `tool.callId` fields; the owner's turn-end decision; the stated limits: A→B→A during a run, a conservative stat digest, synchronous handlers on OpenCode, no model channel for Claude `Stop` notices; the OpenCode entry file name answering the "OpenCode plugin path" open question; any missing capability); effects on M2, M3 and the veles and line-mcp onboarding tasks; and discovered work as proposed tasks.
- [ ] **Step 6: Commit** — `docs: record live evidence for verify on three triggers`
