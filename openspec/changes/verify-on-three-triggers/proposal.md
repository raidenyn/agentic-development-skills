## Why

The veles agent harness runs verification only at turn end, from Python wired by hand into each host, and no other repo can reuse it. M1 of the accepted RFC is the thinnest path through every new part. It adds a shared hook runtime, a verify gate around one command, and per-tool install, update and check. It also tests the riskiest assumption, handlers running inside OpenCode, before rule delivery (M2) starts to depend on it.

## What Changes

- **New skill `agent-harness-hook-runtime`**: the Node tool in `assets/hook-runtime/`. It has a Claude Code entry run as one command for every hook event, an OpenCode plugin entry, normalized events and results, in-process handler dispatch under deadlines, fail-open with a manual instruction to the model, a capability report, and the provisional Hook handler interface including named proofs.
- **New skill `agent-harness-verify-gate`**: the verify handler in `assets/verify-gate/`. It runs the repo's one command on a file edit, a ticked task in a matching `tasks.md`, and turn end. It hands the command the trigger, the edited file, the base commit and the changed-file list. It returns at once when the working-tree content already passed a full run, runs at every turn end, subagents' included, and blocks a turn end at most three times for the same failure per session (root and subagents together). While background subagents still run, a failing root turn end gets a notice instead of a block. It registers the proof `verify-pass`.
- **Vendored layout and per-tool commands**: `install`, `update` and `check` for both tools, using `.agents/harness/<tool>/`, `.agents/harness/lock.json` and `.agents/harness.json`. They refuse to overwrite an edited copy and change nothing when they refuse. The hook runtime's `install` and `update` merge the host configs without touching foreign entries; the verify gate's never touch them.
- **Skill text**: each skill gets an Onboard section, an Update section and the untrusted-checkout warning, plus a marketplace entry and a README row.
- **Tests and CI**: `tests/agent-harness/` (unit, throwaway-repo integration, fail-open, a no-change benchmark), added to `npm test`. A Node 22 CI job, a Pages catalog test for `assets/`, and `check` for both tools in CI.
- **Onboarding this repository**: the copied tools, the lock, `.agents/harness.json`, `.claude/settings.json`, `opencode.json`, and a repo-owned verify command `scripts/verify.mjs`.
- **Host spike (done)**: live runs on OpenCode 2.4.1 and Claude Code 2.1.332 confirmed all five capabilities and their mechanisms before the design was settled, and a follow-up showed that OpenCode awaits a 40 s `execute.after` ([`spike.md`](spike.md)). The recorded payloads become adapter test fixtures.
- **Live evidence**: fixture-handler runs of all five capabilities, and three-trigger runs on OpenCode, then on Claude Code, recorded in the PR with host versions and the no-change timing.

## Capabilities

### New Capabilities
- `agent-hook-runtime`: host adapters for Claude Code and OpenCode, the six normalized events and three result kinds, handler loading and dispatch, deadlines and fail-open, named proofs, and the capability report.
- `verify-gate-triggers`: the wrapper around one command, the three triggers, what the command receives, the no-change shortcut, the bounded turn-end block, and the `verify-pass` proof.
- `harness-tool-install`: the vendored tool layout, `install`, `update` and `check`, the lock, config-section validation, host-config merging, and the skills' publication with their `assets/`.

### Modified Capabilities
<!-- None: openspec/specs/ has no specs yet. The Pages catalog already publishes every non-hidden skill file; this change only adds a test for assets. -->

## Impact

- **New**: `skills/agent-harness-hook-runtime/`, `skills/agent-harness-verify-gate/`, `tests/agent-harness/`, `scripts/verify.mjs`, `.agents/harness/`, `.agents/harness.json`, `.claude/settings.json`, `opencode.json`.
- **Changed**: `.claude-plugin/marketplace.json` (two entries), `README.md` (two rows), `package.json` (`npm test` globs), `.github/workflows/validate.yml` (Node 22 job, `check` steps), `scripts/test_skills.py` (catalog test for assets), `AGENTS.md` (verify command line).
- **Contracts**: produces Skill names (frozen), Vendored tool layout (frozen), Hook handler interface (provisional; this change adds only optional fields: the handler's `timeouts` and `manual`, the block result's `ack` and `release`, the context's `signal` and `trace`, and the event's `background` and `tool.callId`), and Published skills.
- **Dependencies**: none. The copied code needs only Node 22 or newer. Agents working in this repo get verification hooks once the onboarding lands.
- **Unchanged**: the `commit-msg` hook and `scripts/skills.py` commit checks (M3), and every other skill.
