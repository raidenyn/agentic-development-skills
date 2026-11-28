## Why

Hooked rules exist only in veles-android: a Python engine plus a 917-line OpenCode plugin that spawns it. M1 delivered the shared hook runtime and the verify gate, so the rules can now run as an in-process Node handler on both hosts. This is the first part of M2 (issue #16): deliver a rule at a skill, after a command and as a denial before a gated command, onboarded in this repository first, so that #17, #18 and the veles and line-mcp onboardings can build on it.

## What Changes

- New skill `agent-harness-hooked-rules` with the tool `hooked-rules` (`src/hooked-rules/`, built into `skills/agent-harness-hooked-rules/assets/hooked-rules/`). It has the commands `install`, `update`, `check`, `pointers` and `pointers --check`. It parses `.agents/hooked-rules/*.md` in veles's unchanged grammar and delivers rules at three moments:
  - at a skill (a Skill call, a `/<skill>` prompt, or a `SKILL.md` read)
  - after a successful matching command
  - once, as a denial, before a gated command
- The `requires`, `exempt` and `stops` keys are parsed but rejected as not supported yet; #17 and #18 lift that.
- **Normalized skill fields**
  - From: a Skill call has kind `other`, its name is only in the raw input, a `SKILL.md` read is a plain `read`, and `tool.after` does not say whether the call succeeded.
  - To: kind `skill` for the Skill tool, `skill` on Skill calls and on `SKILL.md` reads, and `ok` on `tool.after`. A handler that declares `skill` also receives reads that carry `skill`, in dispatch and in the Claude Code skip.
  - Reason: handlers must not read host input (Hook handler interface), and the hook cost cut of #61 must hold.
  - Impact: additive. A Skill call is no longer kind `other`; no installed handler declares `other`. The hook runtime version goes to 0.2.0.
- This repository is onboarded: the tool is installed, two rules are added, the `AGENTS.md` pointer block is generated, `harness:update` updates the new tool, and CI runs its `check` and `pointers --check`.

## Capabilities

### New Capabilities
- `hooked-rules-delivery`: rule file grammar, delivery at a skill, after a command and before a gated command, per-context bookkeeping and compaction, the context cap, failure behavior, the pointer block, and the tool's install, update and check.

### Modified Capabilities
- `agent-hook-runtime`: normalized events gain the `skill` kind, the `skill` field and `ok`. Declared kinds and the Claude Code skip treat a skill read as matching `skill`.

## Impact

- Code: new `src/hooked-rules/`; `src/hook-runtime/lib/claude-adapter.mts`, `opencode-adapter.mts`, `runtime.mts`, `claude.mts`; `src/shared/lib/handler.types.mts`; `src/build.json`; `tsconfig.json` (`rootDirs`).
- Generated: `skills/agent-harness-hooked-rules/assets/`, `skills/agent-harness-hook-runtime/assets/`, `.agents/harness/` and its lock.
- Repo: `.agents/hooked-rules/`, `.agents/harness.json`, the `AGENTS.md` pointer block, `package.json` `harness:update`, `.claude-plugin/marketplace.json`, `README.md`, CI, `scripts/verify.mts` and `scripts/test-verify.mts` (the new checks).
- Tests: new `tests/agent-harness/hooked-rules-*.test.mjs`; adapter and runtime tests gain cases; `vendored.test.mjs` and `scripts/test_skills.py` list the new tool.
- No new npm dependencies. Node 22.0.0 or newer.
