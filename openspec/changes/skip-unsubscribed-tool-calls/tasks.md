## 1. Declared tool kinds in dispatch

- [x] 1.1 Add the optional `tools?: readonly ToolKind[]` to `Handler` in `src/shared/lib/handler.types.mts` and `tools?: unknown` to `ToolMeta` in `src/shared/lib/lock.types.mts`. Both are additive.
- [x] 1.2 In `src/hook-runtime/lib/runtime.mts`, export `declaredKinds(meta)`. It returns the valid, non-empty list of known kinds, or `null`, which means every kind. In `loadHandlers`, pass it from `tool.json` onto the started handler as `tools`.
- [x] 1.3 In `dispatch`, skip a handler on `tool.before`/`tool.after` when `declaredKinds(handler)` is non-null and excludes `event.tool.kind`. An invalid `tools` on an in-process handler means every kind.
- [x] 1.4 Add tests in `tests/agent-harness/runtime.test.mjs` for the filter, for a missing key and for an invalid key. These are the delta spec scenarios under "Handler loading and dispatch".

## 2. Verify gate declaration

- [x] 2.1 Add `"tools": ["shell", "edit"]` to `src/verify-gate/tool.json`.
- [x] 2.2 Add a test in `tests/agent-harness/verify-handler.test.mjs` that the built gate's `tool.json` declares exactly `tools: ["shell", "edit"]`.

## 3. Claude Code launcher skip

- [x] 3.1 In `src/hook-runtime/claude.mts`, after the checkout is resolved and after the delegation branch (which returns for another worktree, so the skip runs inside the delegated `main`), and before `loadHandlers`: on `tool.before`/`tool.after`, read the lock and each locked tool's `tool.json`. Return empty output when no `"handler": true` tool can want the kind. Fall back to the full load on any read or parse error.
- [x] 3.2 Write the trace record `{event, processStart, receivedAt, settledAt, skipped: "no-subscriber", outcomes: {}}` for a skipped call.
- [x] 3.3 Add tests in `tests/agent-harness/verify-hosts.test.mjs`, which spawns `claude.mjs` with the real gate installed, for four cases: a `Read` with only the verify gate loads no handler and traces the skip; an `Edit` still loads; a handler without `tools` still loads on `Read`; an unreadable `tool.json` loads and reports.

- [x] 3.4 Add tests in `verify-hosts.test.mjs` that prove the gate still gets its triggers through spawned `claude.mjs`: a `PostToolUse-Bash` that ticks a task in a configured task file runs the `task` trigger; `PostToolUse-Edit-tick`, preceded by a `PreToolUse` built from the same payload and `tool_use_id`, runs the `task` trigger; `PreToolUse-Bash` writes a before-image.

## 4. Versions, build and docs

- [x] 4.1 Bump `src/hook-runtime/tool.json` to 0.1.4 and `src/verify-gate/tool.json` to 0.2.3, then run `pnpm run harness:update`.
- [x] 4.2 Update `skills/agent-harness-hook-runtime/SKILL.md` in three places. Document the `tools` key in the handler `tool.json` shape. Add `tools?` to the handler interface block. Reword when the `was not loaded` notice appears on Claude Code: at events that a handler would receive. Add `skipped?` to the trace-shape comment in `src/hook-runtime/lib/runtime.mts`.

## 5. Evidence

- [ ] 5.1 Check that the existing tests for edits, shell calls and ticks pass with no change: run `git diff main -- tests/` and confirm it shows only additions. Together with 3.4, this is the evidence for the issue's criterion 2.
- [ ] 5.2 Replay the veles#197 sequence (prompt, Read, 2 edits, Bash, create task file, tick, turn end, prompt, no-change turn end) on a throwaway veles clone. Run it with the current harness and then with this branch's assets, and record the per-step and total hook times. If the clone cannot be set up, use a fixture repo and say so.
- [ ] 5.3 Run `pnpm run check`, `python3 scripts/skills.py validate`, `claude plugin validate .` and `python3 -m unittest discover -s scripts -p 'test_*.py'`.
- [ ] 5.4 In the PR, report each criterion with its evidence. Report the issue's "`update` migrates, `check` accepts both" item as not applicable: no host config changes under the chosen approach. Also report the trade-off that a skipped call no longer repeats a `was not loaded` notice, including for a copy that differs from the lock.
