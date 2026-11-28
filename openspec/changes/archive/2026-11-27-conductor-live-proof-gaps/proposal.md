## Why

The live proof of #36 on the Bank MCP board found three gaps in `project-conductor`:
- The webhook trigger object names a `coalesceKey` that the host rejects.
- The thread scans read tool activity and grow too large to read.
- There is no result for a hook the owner added by hand.

The owner asked to fix them in this task's one pull request in this repository.

## What Changes

**Webhook `coalesceKey`**
- From: `"coalesceKey": "project-conductor"`, which the host rejects. Every compare of the live trigger reports `dedupe` as an owner step nobody can close.
- To: `"coalesceKey": "{{headers.x-github-hook-id}}"`, constant for one repository's hook.
- Impact: non-breaking. The live trigger already holds this value, and no trigger with the literal value can exist.

**Thread scans read messages**
- From: the automatic check's backward scan and the onboarding's owner-steps carry call `t3_thread_read` with `view: "activity"`, and the carry reads every page.
- To: both use `view: "messages"`. The carry stops once it has the newest owner-steps report and a report naming every repository.
- Impact: non-breaking. The same items are read.

**Hook added by the owner**
- From: no defined result.
- To: Register the webhook, rerun after the owner says it is done. With admin it is `reused <id>`, found by the trigger id in the hook URL. Without admin it is `done by the owner, not checked: not an admin`, and the repository leaves the `Webhook owner steps:` list.
- Impact: additive result value.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `conductor-triggers`: the webhook trigger's `coalesceKey`, the owner-done result of Register the webhook, and the messages view for the backward scan.
- `board-onboarding`: the owner-steps carry reads messages and may stop early, and it also counts register reports.

## Impact

- Docs: `skills/project-conductor/SKILL.md`, `references/triggers-github.md` and `references/onboarding-github.md`.
- Contracts: none of Settings, Run record or Phase report change.
- Code and tests: none. The skill has no Node tool.
