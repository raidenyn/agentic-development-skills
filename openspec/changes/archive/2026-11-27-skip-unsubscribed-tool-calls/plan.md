# Skip Unsubscribed Tool Calls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Claude Code, a tool call whose kind no installed handler declares returns without loading any handler.

**Architecture:** A handler tool can declare `"tools": [kinds]` in its `tool.json`. `loadHandlers` copies the key onto the handler as `tools`, and `dispatch` skips a handler on `tool.before`/`tool.after` when its `tools` excludes the kind. `claude.mts` reads the lock and each `tool.json` before loading, and returns early when no handler tool can want the kind. The verify gate declares `["shell", "edit"]`.

**Tech Stack:** strict TypeScript under `src/`, built with `pnpm run build` into `skills/*/assets/`. Tests use `node:test` in `tests/agent-harness/*.test.mjs`, run against the built assets.

**Spec:** `openspec/changes/skip-unsubscribed-tool-calls/brainstorm.md`, `proposal.md`, `specs/agent-hook-runtime/spec.md`, `specs/verify-gate-triggers/spec.md`.

## Global Constraints

- Edit only the TypeScript under `src/`. Never edit `skills/*/assets/` or `.agents/harness/`; `pnpm run harness:update` regenerates them.
- Use erasable syntax only. Type-only declarations go in `*.types.mts`.
- Tests stay `.mjs`, import only the built assets and run on Node 22.0.0.
- Existing tests stay unchanged. Only add tests.
- The Hook handler interface changes only additively: `tools` is optional.
- `.claude/settings.json` and the install/check code are untouched.
- Versions are exactly hook-runtime `0.1.4` and verify-gate `0.2.3`, bumped once.
- Known kinds are exactly `shell`, `edit`, `read` and `other`. `tools` is valid only as a non-empty array of those kinds. Anything else means every kind.
- Commits follow Conventional Commits.

## Review Focus

1. **A `tool.json` without `"handler": true`** (hook-runtime's own): the launcher must ignore it, so it does not force a load. The test is in Task 3, Step 1, case (a).
2. **A `PostToolUseFailure` for `Read`**: it maps to `tool.after` and must skip as well. The test is in Task 3, Step 1, case (e).
3. **The delegation path into another worktree's copy**: the skip runs inside the delegated `main`, which reads that copy's lock. No new test is needed, because the delegated call runs the same `main`. Note this in the PR.
4. **A stale `.agents/harness/<tool>` folder that is not in the lock**: the launcher must ignore it, because it iterates the lock's tools, as `loadHandlers` does. This is covered by the implementation reading `lock.tools`.
5. **A `Bash` call that ticks a task**: it must still run the gate. The existing tick tests call the handler directly and never pass through the kind filter, so Task 3 adds spawned-`claude.mjs` tests for a Bash tick, an Edit tick and a Bash before-image.

---

### Task 1: Declared kinds in dispatch

**Files:**
- Modify: `src/shared/lib/handler.types.mts` (the `Handler` interface)
- Modify: `src/shared/lib/lock.types.mts` (the `ToolMeta` interface)
- Modify: `src/hook-runtime/lib/runtime.mts` (`loadHandlers` and `dispatch`)
- Test: `tests/agent-harness/runtime.test.mjs`

**Interfaces:**
- Produces: `export function declaredKinds(meta: unknown): ToolKind[] | null` in `runtime.mts`. It returns the `tools` list when it is valid, and `null` otherwise, which means every kind.
- Produces: `Handler.tools?: readonly ToolKind[]`, with a comment saying it applies only to `tool.before` and `tool.after`.
- Produces: `ToolMeta.tools?: unknown`.

- [ ] **Step 1: Write the failing tests** in `runtime.test.mjs`:
  - `declaredKinds validates the tools key`. Expected results: `declaredKinds({tools: ['shell','edit']})` is `['shell','edit']`. `declaredKinds({})`, `declaredKinds({tools: 'edit'})`, `declaredKinds({tools: []})`, `declaredKinds({tools: ['write']})` and `declaredKinds(null)` are all `null`.
  - `a handler with tools is skipped for other kinds`. Use `rt([{name:'h', events:['tool.after'], tools:['shell','edit'], handle: () => ({context:'x'})}])`. Dispatching `{type:'tool.after', host:'claude-code', tool:{name:'Read', kind:'read', input:{}}}` must give no `context`, and `outcomes` must not contain `h`. The same dispatch with kind `edit` must give `context` `'x'`.
  - `a handler without tools gets every kind`. With no `tools` and kind `other`, the handler is called.
  - `an invalid tools on an in-process handler means every kind`. A handler with `tools: []`, or with `tools: ['write']`, is called for kind `read`.
  - `tools does not filter non-tool events`. A handler with `tools:['shell']` on `prompt` is called.
  - `loadHandlers carries tools from tool.json`. Install a stub handler tool with `installTool` and `tool.json` `{name, version, handler:true, tools:['edit']}`, as `cli-runtime.test.mjs:236-243` does. The loaded handler's `tools` must deep-equal `['edit']`. Close it afterwards.
- [ ] **Step 2: Run** `pnpm run build && node --test tests/agent-harness/runtime.test.mjs`. Expected: the new tests FAIL, because `declaredKinds` is not exported.
- [ ] **Step 3: Implement.** Add `declaredKinds`. In `loadHandlers`, once `startWorker` resolves, set `handler.tools = kinds` when `declaredKinds(meta)` is non-null. This is the only place a worker-loaded handler gets `tools`; a `tools` export in `handler.mjs` is ignored, and `supervisor.mts` is unchanged. In `dispatch`, extend the handler filter: on `tool.before`/`tool.after`, compute `const kinds = declaredKinds(h)` and skip `h` when `kinds` is non-null and does not include `event.tool?.kind ?? 'other'`. Always validate in `dispatch`, so that an in-process handler with `tools: []` or `['write']` still gets every kind.
- [ ] **Step 4: Run** `pnpm run build && node --test tests/agent-harness/runtime.test.mjs tests/agent-harness/supervisor.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: let a handler tool declare the tool kinds it needs`.

### Task 2: Verify gate declares its kinds

**Files:**
- Modify: `src/verify-gate/tool.json`
- Test: `tests/agent-harness/verify-handler.test.mjs`

- [ ] **Step 1: Write the failing test** `the gate declares exactly the kinds it acts on`. Read `join(ASSETS.verifyGate, 'tool.json')` and assert that `tools` deep-equals `['shell', 'edit']`.
- [ ] **Step 2: Run** `pnpm run build && node --test tests/agent-harness/verify-handler.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** Set `{ "name": "verify-gate", "version": "0.2.2", "handler": true, "tools": ["shell", "edit"] }`. The version is bumped in Task 4.
- [ ] **Step 4: Run** `pnpm run build && node --test "tests/agent-harness/*.test.mjs"`. Expected: PASS, including every existing edit, shell and tick test, unchanged.
- [ ] **Step 5: Commit** `feat: the verify gate declares the shell and edit kinds`.

### Task 3: Claude Code launcher skip

**Files:**
- Modify: `src/hook-runtime/claude.mts` (`main`, just before `loadHandlers`)
- Modify: `src/hook-runtime/lib/runtime.mts` (new export)
- Test: `tests/agent-harness/verify-hosts.test.mjs` (uses the real verify gate through spawned `claude.mjs`)

**Interfaces:**
- Consumes: `declaredKinds` from Task 1, and the gate's `tools` from Task 2; `readLock(repoRoot)` from `lib/install.mts`.
- Produces: `export function anyHandlerWants(repoRoot: string, kind: ToolKind): boolean` in `runtime.mts`. It returns `true` when any locked tool with `handler: true` has no valid `tools`, or has `tools` that include `kind`. It also returns `true` on any thrown read or parse error. It returns `false` only when every handler tool provably excludes `kind`.

- [ ] **Step 1: Write the failing tests** in `verify-hosts.test.mjs`. Use the `installed()` repo, which has the hook runtime and the verify gate, which now declares `tools` (Task 2). Each test spawns `CLAUDE_MJS` with `AGENT_HARNESS_TRACE: '1'`.
  - `a Read with only the verify gate loads no handler and traces the skip`. Feed (a) `PostToolUse-Read.json`, (b) `PreToolUse-Read.json` and (e) the `PostToolUse-Read.json` payload with `hook_event_name: 'PostToolUseFailure'`. Each must give stdout `''` and exit code 0, and its trace line must have `skipped === 'no-subscriber'`, `outcomes` equal to `{}`, and no `handlersLoadedAt`.
  - `an Edit still loads the gate`. With `PostToolUse-Edit.json`, the trace line has `handlersLoadedAt` and an `outcomes['verify-gate']` entry.
  - `a handler without tools still loads on Read`. Also install a stub handler tool whose `tool.json` has no `tools`. `PostToolUse-Read` then gives a trace line with `handlersLoadedAt`.
  - `a Bash call that ticks a task still runs the task trigger`. Configure `taskFiles`, commit a task file with `- [ ] 1.1 x`, then send `PreToolUse-Bash` followed by a `PostToolUse-Bash` whose command ticks the task, with the same `tool_use_id` and the file changed on disk in between. The last trace line (`lines.at(-1)`, the Post call) has `outcomes['verify-gate'] === 'ran'`, and `r.log().at(-1).trigger === 'task'`. Use the existing `r.log()` and `r.setConfig()` from `verify-helpers.mjs`.
  - `an Edit that ticks a task still runs the task trigger`. Ticks are found only against the before-image written by a `tool.before` with the same `tool_use_id`, and no fixture has a matching Pre call. So:
    1. Commit `openspec/changes/x/tasks.md` with the fixture's `tool_response.originalFile` content.
    2. Build the Pre payload from `PostToolUse-Edit-tick.json`: set `hook_event_name: 'PreToolUse'`, drop `tool_response`, keep `tool_use_id` and `session_id`, and replace `/REPO` with `r.dir`. Spawn it.
    3. Write the ticked content to disk.
    4. Spawn the Post fixture, also with `/REPO` replaced.
    5. Assert as in the Bash tick test, on `lines.at(-1)` and `r.log().at(-1).trigger === 'task'`.
  - `a PreToolUse-Bash writes a before-image`. After the call, `join(toolStateDir(r.dir, 'verify-gate'), 'sessions', 'claude-code-' + payload.session_id, 'main', 'calls')` holds exactly `<tool_use_id>.json`. `toolStateDir` is exported by `verify-helpers.mjs`. Do not call `sessionStateDir`, which creates the folder.
  - `an unreadable tool.json falls back to the full load`. Overwrite `.agents/harness/verify-gate/tool.json` with `{`. `PostToolUse-Read` then gives non-empty stdout whose `additionalContext` matches `/hook verify-gate was not loaded/`.
- [ ] **Step 2: Run** `pnpm run build && node --test tests/agent-harness/verify-hosts.test.mjs`. Expected: the new tests FAIL, because the trace has `handlersLoadedAt` and no `skipped`.
- [ ] **Step 3: Implement `anyHandlerWants`.** Use plain `readFileSync` and `JSON.parse` over `Object.keys(lock.tools)`, and skip tools whose `tool.json` lacks `handler: true`. It never throws. In `claude.mts`, after `type = mapped.event.type` and the worktree-delegation block, add the skip: when `type` is `tool.before` or `tool.after` and `!anyHandlerWants(repoRoot, mapped.event.tool?.kind ?? 'other')`, call `writeTrace(repoRoot, {event: type, processStart: performance.timeOrigin, receivedAt: start, settledAt: now(), skipped: 'no-subscriber', outcomes: {}}, env)` and return `empty`.
- [ ] **Step 4: Run** `pnpm run build && node --test tests/agent-harness/verify-hosts.test.mjs tests/agent-harness/claude-checkout.test.mjs tests/agent-harness/claude-adapter.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: return before loading handlers for a tool call none needs`.

### Task 4: Versions, harness copy and docs

**Files:**
- Modify: `src/hook-runtime/tool.json` (version `0.1.4`)
- Modify: `src/verify-gate/tool.json` (version `0.2.3`)
- Modify: `skills/agent-harness-hook-runtime/SKILL.md`: line 38 (the `tool.json` shape and the notice sentence) and the `handler:` interface block below it
- Modify: `src/hook-runtime/lib/runtime.mts`, the trace-shape comment above `writeTrace`
- Generated: `skills/*/assets/**` and `.agents/harness/**`

- [ ] **Step 1: Bump both versions.** Then run `pnpm run harness:update`. Expected: it rebuilds, and `git status` shows the assets, `.agents/harness/` and `lock.json` updated.
- [ ] **Step 2: Update `SKILL.md`.** The `tool.json` shape becomes `{"name", "version", "handler": true, "tools"?}`. Add one sentence: `"tools"` lists the tool kinds (`shell`, `edit`, `read`, `other`) the handler needs on `tool.before` and `tool.after`. When it is set, a tool call of another kind is not dispatched to the handler, and on Claude Code a call that no handler needs loads no handler. Without the key, the handler gets every kind. Reword the notice sentence so the `was not loaded` notice appears on Claude Code "at every event that has a channel and that a handler would receive". Add `tools?: [kind]  // addition, from tool.json` to the interface block. Add `skipped?` to the trace comment `{event, processStart, ...}` in `runtime.mts`.
- [ ] **Step 3: Run** `node .agents/harness/hook-runtime/cli.mjs check && node .agents/harness/verify-gate/cli.mjs check`. Expected: `ok` twice.
- [ ] **Step 4: Commit** `chore: release hook-runtime 0.1.4 and verify-gate 0.2.3`.

### Task 5: Evidence and checks

- [ ] **Step 1:** Run `git diff main --stat -- tests/` and `git diff main -- tests/ | grep '^-[^-]'`. Expected: the second command prints nothing, so existing tests are unchanged.
- [ ] **Step 2: Replay the veles sequence.** The steps are prompt, Read, edit `docs/verify.md`, edit `docs/checks/check_offline.py`, Bash, create a task file, tick it, turn end, prompt, and a no-change turn end. Make two throwaway clones of `~/repos/veles-android` in the scratchpad: one with the current catalog harness, and one with this branch's assets installed by `node <this repo>/skills/agent-harness-*/assets/*/cli.mjs update --repo <clone>`. Feed each step's payload to every `.claude/settings.json` hook command for that event. Time the whole processes per step, warm, run back to back, and keep the median of 3 runs. Record a table of per-step and total time, before and after. If veles cannot be set up, use the same sequence on a `tempRepo` fixture with both tools installed, and say so in the PR.
- [ ] **Step 3: Run** `pnpm run check`, `python3 scripts/skills.py validate`, `claude plugin validate .` and `python3 -m unittest discover -s scripts -p 'test_*.py'`. Expected: all pass.
- [ ] **Step 4: Tick `tasks.md`.** Then sync and archive this OpenSpec change in the same PR. Open the PR linked to #61 (`Closes #61`), reporting each acceptance criterion with its evidence, the versions, the approach chosen and why, and the Review Focus item 3 note. Report the issue's "`update` migrates, `check` accepts both" item as not applicable: the chosen approach changes no host config, so there is nothing to migrate and `check` is unchanged. Also report the trade-off that a skipped call no longer repeats a `was not loaded` notice, even for a copy that differs from the lock; it still appears on every event a handler receives.
