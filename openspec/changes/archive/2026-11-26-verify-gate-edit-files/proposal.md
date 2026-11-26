## Why

Every edit runs the verify command with `VERIFY_TRIGGER=edit`, even for a file the command then skips (Markdown, or Kotlin when only TypeScript is linted). In veles that costs about 0.45 s per edit (raidenyn/veles-android#197) and checks nothing. line-mcp's old hook linted only `.ts` edits. This change drops the gate's git and verify subprocesses for such edits under the RFC's "One command" decision ([#60](https://github.com/raidenyn/agentic-development-skills/issues/60)).

## What Changes

**Edit trigger scope**
- From: every edited file runs the edit check.
- To: when `verify-gate.editFiles` is set, only edited files that match one of its globs run it. When a call reported files and none match, the verify gate spawns no process and traces `edit-skipped`. Globs ignore `.` segments, as for `taskFiles`. When the key is absent, nothing changes.
- Reason: avoid a process per edit for files no check covers.
- Impact: non-breaking and opt-in. Existing configs behave and hash as before.

**Config**
- A new optional key `editFiles`: a non-empty list of glob strings with the `taskFiles` syntax. `check` validates it and still rejects unknown keys.
- Setting or changing `editFiles` changes the config hash, so the next trigger that reaches the gate runs the command.

**Unchanged**
- Tick detection and the `task` run, which still fire for a tick in a file outside `editFiles`.
- Shell calls, turn end, the pass record and `verify-pass`.

**Docs and release**
- `skills/agent-harness-verify-gate/SKILL.md` covers the key in "Config keys", "Making it fast" and the trace outcomes.
- The `verify-gate` tool goes to `0.2.0`. It ships through the manual Pages release on `main` after the merge, which is a handoff outside the implementation tasks.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `verify-gate-triggers`: "Edit trigger", "Ticked task trigger", "Tick detection by item identity" and "No-change shortcut" are modified to refer to the edit scope. "Edit trigger scope" (the filter), "editFiles glob matching" (segment rules) and "editFiles config key" (validation and hashing) are added.

## Impact

- Code: `src/verify-gate/handler.mts` (filter in `afterTool`), `src/verify-gate/lib/triggers.mts` (`matchesPathGlob`) and `src/verify-gate/lib/gate.mts` (`CONFIG_KEYS`, `normalizeConfig`, `configErrors`, `configHash`). Then the rebuilt `skills/agent-harness-verify-gate/assets/verify-gate/` and this repo's `.agents/harness/` with its lock, through `pnpm run harness:update`.
- Tests: `tests/agent-harness/triggers.test.mjs`, `tests/agent-harness/verify-handler.test.mjs`, `tests/agent-harness/cli-verify.test.mjs`, `tests/agent-harness/verify-proof.test.mjs` and `tests/agent-harness/verify-hosts.test.mjs`.
- Contracts: Vendored tool layout (frozen) is unchanged, since the key goes in the tool's own section. Hook handler interface: unchanged, as `trace` already takes any outcome string.
- Docs: `skills/agent-harness-verify-gate/SKILL.md`.
