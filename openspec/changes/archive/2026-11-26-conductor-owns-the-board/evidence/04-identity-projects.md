# Task 8.3a: identity and project proofs (2026-11-26)

The timer was paused for the controlled cases and re-enabled only when the onboarding
survey needed it; it was paused again afterwards for the webhook and timer proofs.

## 1. Renamed conductor thread

The conductor thread was renamed to `my conductor` and a manual wake was sent.

**First attempt (found a defect).** The wake at 14:49 did not read its own title. It reused
the title from the earlier conversation, ran the whole wake and reported:

```text
## Wake: board https://github.com/users/raidenyn-shadow/projects/5
...
- not checked — this is a manual wake; both triggers remain enabled and bound to this thread.
```

No board write was made, but the identity check had not run. This is the defect the proof
was for.

**Fix.** The skill now says, in both `SKILL.md` and `run-github.md#identity`, that every wake,
a repeat included, calls `t3_thread_configure` and `t3_thread_read` for its own thread and
writes the title to `<work>/title.txt`; a title remembered from earlier messages is not a
read, and skipping the call is an identity failure. The manual-wake Triggers line is now
exactly `- not checked.` with no claim that the triggers are enabled. The cache copy used by
the OpenCode conductor was refreshed from the worktree.

**Second attempt (pass).** The renamed thread was woken again with a fresh context. It
reported:

```text
## Wake: board unknown — this thread's title does not name a board

Trigger: manual wake

Nothing to do in this wake: the identity check failed before any step ran, so there was no
board read, no Repair, no Settle, no Advance and no Start.
...
### Triggers
- not checked.

### Gaps (owner step)
- **Identity failure:** the conductor title was read fresh with `t3_thread_configure` +
  `t3_thread_read` and is `my conductor`. ... Fix: rename this thread with
  `t3_thread_update` to `project-conductor <board URL>` exactly ..., or run the
  project-conductor onboarding procedure in it.
```

No write was made. The title was restored to
`project-conductor https://github.com/users/raidenyn-shadow/projects/5` and read back equal.

## 2. The block names another conductor

The readme block's `conductor` was changed from the conductor thread to
`adf02ed1-bffb-4804-9cbe-f48f8def988e` (the dev thread), preserving every other byte. A
manual wake was sent.

The wake reported an identity failure, named the thread the block holds, and wrote nothing:

```text
### Gaps (owner step)
- **Identity failure: the board readme's settings block names another thread.** ...
  Its `conductor` is `adf02ed1-bffb-4804-9cbe-f48f8def988e`,
  [Unattended Conductor Wake Triggers](t3-thread://v2/ae4a4ef3-e2d1-46d5-ab60-62a3a3412bc3/adf02ed1-bffb-4804-9cbe-f48f8def988e) ...
  set `conductor: mcp:launch:f5eb1a9b6c4e550e459a804490241d46c7a63f238cd9fefead70391e0a803540`
  in the board readme block, or run the wake in that thread instead.
```

The block was restored to the conductor id and read back equal.

## 3. A second repository with no T3 project

Created `raidenyn-shadow/task-run-scratch-2` (private), with milestone `M2 scratch`
(`<!-- rfc: scratch-rfc/m2-scratch -->`) and issue #1:

```text
<!-- task: scratch-rfc/m2-scratch/1 -->

This issue proves that a Ready task in a repository with no T3 project is reported and not
started.
```

The issue was added to board 5 as item `PVTI_lAHOD4ARxs4BtKTKzhMIyWc` and set to Status
Ready. No T3 project was created for the repository, by design.

A manual wake reported the item as not started and made no write:

```text
- raidenyn-shadow/task-run-scratch-2#1: Ready, but `raidenyn-shadow/task-run-scratch-2`
  has no T3 project. Add a T3 project for a checkout of
  `raidenyn-shadow/task-run-scratch-2`.
...
Nothing was written to the board, the issues or this thread.
```

## 4. Repeat onboarding with the second repository

**First attempt (found a second defect).** A fresh-context run's backward scan returned only
the current run (109 items) and concluded that the thread held no earlier `Webhook owner
steps:` report. It would have listed both repositories as owner steps, including the first
one whose hook is already registered. That would make the automatic check skip the
registered repository.

**Fix.** The backward scan in `triggers-github.md` and the onboarding's reuse path now pass
`runLimit: 50` to `t3_thread_read`; the wake's Collect does too. Without it the host returns
only the current run. The cache copy was refreshed.

**Second attempt (pass).** The rerun scanned the thread to its start (97 pages, 548 items),
found the earlier onboarding reports, and wrote only the paused timer back to enabled:

```text
## Onboarding: board https://github.com/users/raidenyn-shadow/projects/5

Mode: written without asking

### Changed
- Trigger `project-conductor timer` (`scheduled-task:f2005dbe-4a5f-406d-993a-3255db5e41ce`):
  `enabled` false → true. Schedule kept at `everyMs` 120000, still bound to this thread.

### Reused
... title, fields, settings block, all keys, the webhook trigger (URL and secret untouched)

### Could not do (owner step)
- The webhook trigger's `dedupe.coalesceKey` cannot be set: this host rejects it. ... a merge
  that both closes an issue and closes its pull request can produce two wakes instead of one.
- `raidenyn-shadow/task-run-scratch-2` has no T3 project ...
- approval rules: `task-run-scratch` no, `task-run-scratch-2` unknown ...

### Triggers
- Timer: re-enabled ...
- Webhook trigger: reused ...
- Webhooks: not run: the trigger was reused.

Webhook owner steps: raidenyn-shadow/task-run-scratch-2

### Repositories
- raidenyn-shadow/task-run-scratch: T3 project mcp:84ce…, push yes, approval rule no,
  keys 15 identified, 0 keyed, 3 without a key.
- raidenyn-shadow/task-run-scratch-2: T3 project none, push yes, approval rule unknown,
  keys 1 identified, 0 keyed, 0 without a key.
```

The carried list is correct: the first repository's hook was registered by the first
onboarding, so only the new repository is an owner step. The run asked for no secret.

The timer was paused again after this run, to prepare the webhook and timer proofs.
