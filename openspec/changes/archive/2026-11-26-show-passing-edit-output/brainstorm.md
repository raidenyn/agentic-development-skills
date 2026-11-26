## Design Summary

Issue #58 (`agent-harness/m1-verify-triggers/4`). When the verify command passes on an edit (`VERIFY_TRIGGER=edit`, exit 0) and prints something other than whitespace, the gate adds that output to the tool result, so the model reads it after the tool call. This works the same on Claude Code and OpenCode. Without it, line-mcp's lint-on-edit note ("ESLint --fix rewrote <file>; re-read it before editing it again") would be lost when line-mcp moves onto the gate.

- **What the model sees.** `verify: <command> passed after the edit of <file>:` followed by a blank line and the output tail. The tail uses the same 60-line and 1 MiB cap as a failure. The word "passed" keeps it from reading as a failure.
- **Silence stays silent.** A passing edit run whose output is empty or only whitespace returns nothing, as it does today.
- **Full runs are unchanged.** A passing task run or turn-end run adds nothing, whatever it prints.
- **Failures are unchanged.** A failing edit run reports byte for byte as before for identical command output; the repo wrapper intentionally suppresses an earlier check that passed.
- **Several files.** When one edit touches several files, each file's note or failure is joined in file order, the way failures are joined today.
- **This repo's own command is quieted.** `scripts/verify.mts` stops letting its edit checks print on a pass. Each edit check's output is captured and printed only when that check fails, so a pass here prints nothing and adds nothing. Full runs keep streaming their output, because a pass there never reaches the model and a person running by hand wants to see progress.
- **Docs.** The skill's "The one command", "Triggers" and "Making it fast" sections say how a command hands a note to the model on a passing edit: print it and exit 0. Print nothing to stay silent.
- **Release.** `verify-gate` ships as **0.2.2** (it was 0.1.2 when this change was written, and main reached 0.2.1 before the rebase). `pnpm run harness:update` refreshes the installed copy, and the version reaches the Pages catalog through the release.

## Alternatives Considered

### Alternative A: Pass output on edit, opt-in by printing (chosen)
- **Approach**: `runGate` keeps the output tail on a pass, and the edit branch of `afterTool` adds it when it is not blank. There is no setting.
- **Pros**: The smallest change. No config key, so the frozen config contract stays as it is. A command that prints nothing on a pass sees no change.
- **Cons**: A command that prints on success, like Biome's summary or a progress line, starts adding notes until it is quieted.

### Alternative B: The same, plus a config key to turn it off (for example `passOutput: false`)
- **Approach**: As A, with a new boolean in the `verify-gate` section.
- **Pros**: A repo can turn it off without touching its command.
- **Cons**: The setting does nothing printing nothing cannot already do. It grows `CONFIG_KEYS`, `check` and the docs, and it needs a config-hash change.
- **Why not chosen**: Printing nothing already turns it off. The RFC's "One command" decision keeps behaviour in the command, not in gate settings.

### Alternative C: A separate channel for notes (for example lines prefixed `verify-note:`, or a file named in an env variable)
- **Approach**: Only marked output, or the contents of `$VERIFY_NOTE_FILE`, reaches the model on a pass.
- **Pros**: Ordinary success chatter can never leak.
- **Cons**: A new contract that every command must learn. line-mcp's existing hook output would need rewriting. It also adds an env variable to the handover.
- **Why not chosen**: It is more than the task asks, and it changes the command contract instead of only adding to the handler result.

## Agreed Approach

Alternative A. The owner also chose to quiet this repo's `scripts/verify.mts` in the same pull request instead of a follow-up, so the change adds no noise to agentic-development-skills.

## Key Decisions

- The wording is `verify: <command> passed after the edit of <file>:\n\n<tail>`. It is my call, and the issue left the wording open.
- No setting turns it off. Also my call: printing nothing is the switch.
- Blank means the captured tail (the last 60 lines) is whitespace only: `tail.trim() === ''`. The note carries the tail as captured, not trimmed, matching failures.
- `runGate` returns the tail on every pass, and only the edit branch of `afterTool` uses it. A task run, a turn end and `cli.mjs run` ignore it, so their behaviour does not change.
- The hook handler interface does not change. `{ context }` at `tool.after` is already allowed, and both host adapters already deliver it: `additionalContext` on Claude Code and appended output on OpenCode.
- `scripts/verify.mts` on `edit`: each check's output is captured and printed only when the check fails. Full triggers keep `stdio: 'inherit'`.

## Open Questions

- Live runs on both hosts (OpenCode first) are evidence for the pull request. They are not a code change. They need a temporary edit-pass note printed by a scratch command in a test repo.
- veles's `scripts/verify_gate.py` prints on success. It belongs to the veles onboarding task (#63, which #15 also waits on), not to this change, and the pull request will note it.
