## Why

The verify gate passes only a failure's output to the model. line-mcp's own lint-on-edit hook also tells the model "ESLint --fix rewrote <file>; re-read it before editing it again" when no error is left. Its onboarding onto the gate (`agent-harness/m1-verify-triggers/3`) would lose that note, and the owner wants every existing feature kept. Passing a passing edit run's output to the model keeps it, and a command that prints nothing on a pass sees no change.

## What Changes

**Edit trigger, passing run**
- From: a passing edit run adds nothing to the tool result.
- To: a passing edit run whose output is not blank adds `verify: <command> passed after the edit of <file>:` and the output tail (60 lines, 1 MiB cap) after the tool call, on Claude Code and OpenCode. Blank output still adds nothing.
- Reason: keeps line-mcp's lint-fix note. Printing on a pass becomes the way a command hands a note to the model.
- Impact: non-breaking for commands that are silent on a pass. A command that prints on success starts adding notes; veles's `scripts/verify_gate.py` is one, to be checked in its onboarding task (#63), which #15 also waits on.

**This repo's verify command on an edit**
- From: `scripts/verify.mts` lets each edit check (Biome, the build, `skills.py validate`) print to the inherited stdout and stderr, even on a pass.
- To: on `VERIFY_TRIGGER=edit` it captures each check's output and prints it only when that check fails, so a passing edit prints nothing.
- Reason: without this, every edit in this repo would hand the model Biome's "Checked 1 file … No fixes applied." summary.
- Impact: non-breaking. A failing check prints the same output, now all on stderr, and full runs still stream theirs. One difference: when the gate kills an edit run at its timeout, the captured output dies with the script, so the model gets "timed out" without a tail. Edit checks here take well under a second.

**Side effect on failed edit calls:** both hosts run the edit check after a failed edit call too. On Claude Code (`PostToolUseFailure`) a passing run that prints now adds its note to `additionalContext`. On OpenCode, which reports edit and write calls with `input.filePath` even when they failed, the adapter adds its existing notice `hook-runtime: the context from tool.after of the failed edit call was not delivered.`, where today there is silence. No code change; reported in the pull request.

**Unchanged:** task and turn-end runs, failing edit runs, the pass record, the config keys, the hook handler interface.

**Docs:** the skill's "The one command", "Triggers" and "Making it fast" sections explain the note on a passing edit. "Onboard" and "Update" say to check that the command prints nothing on a passing edit unless it means to hand the model a note. `verify-gate` goes from 0.1.2 to 0.1.3 and is released to the Pages catalog.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `verify-gate-triggers`: a new requirement, "Output of a passing edit run", says a passing edit run's non-blank output reaches the model, while blank output and full-run passes add nothing. The Edit trigger and Bounded run requirements are unchanged.
- `code-quality-checks`: the "verify gate runs the checks" requirement adds that this repo's verify command prints nothing on a passing edit run.

## Impact

- `src/verify-gate/lib/gate.mts` (`runGate` keeps the tail on a pass), `src/verify-gate/handler.mts` (the edit branch of `afterTool`), `src/verify-gate/tool.json` (0.1.3), and the regenerated `skills/agent-harness-verify-gate/assets/verify-gate/` and `.agents/harness/` copies.
- `tests/agent-harness/verify-handler.test.mjs`, plus a test through each host adapter.
- `scripts/verify.mts` and its test `scripts/test-verify.mts`.
- `skills/agent-harness-verify-gate/SKILL.md`.
- Contracts: the Hook handler interface is unchanged (`context` at `tool.after` is already allowed). The Vendored tool layout and Skill names are unchanged.
