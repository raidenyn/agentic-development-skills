# Task 8.2: onboarding (2026-11-26)

## Test models

All three model roles use DeepSeek, as the owner asked:

```text
model.plan: opencode/ollama-cloud/deepseek-v4.1-flash:1017#high
model.review: opencode/ollama-cloud/deepseek-v4.1-flash:1017#high
model.implement: opencode/ollama-cloud/deepseek-v4.1-flash:1017#high
```

The three lines were put in the readme block before onboarding, so the run treated
them as confirmed and kept them unchanged.

## Conductor thread

- Thread id: `mcp:launch:f5eb1a9b6c4e550e459a804490241d46c7a63f238cd9fefead70391e0a803540`
- Project: "No project"
- Provider and model: `opencode`, `ollama-cloud/deepseek-v4.1-flash:1017`, variant `high`
- The run renamed the thread to
  `project-conductor https://github.com/users/raidenyn-shadow/projects/5` (read back
  equal).

## Plan

The run showed this plan and wrote without asking, as the message said to proceed:

```text
## Plan: onboarding board https://github.com/users/raidenyn-shadow/projects/5

Mode: written without asking (you said proceed).

**1. Preflight — reuse.** gh logged in as `raidenyn-shadow` with `project` scope; board
readable; thread read. One-conductor check: the block has no `conductor`, and no project
holds a thread titled `project-conductor https://github.com/users/raidenyn-shadow/projects/5`
(6 projects searched, 0 exact matches).

**2. Thread title — change.** `project-conductor onboarding (DeepSeek v2)` →
`project-conductor https://github.com/users/raidenyn-shadow/projects/5`.

**3. Fields — reuse.** `Run phase` (plan, implement, closeout, care), `Attempt` (number),
`Run thread` (text) all exist with the right types.

**4. Settings block — change.** Add the four missing keys after the existing lines; keep
`reconcileMinutes: 2` and all three model lines exactly as written:

 reconcileMinutes: 2
 model.plan: opencode/ollama-cloud/deepseek-v4.1-flash:1017#high
 model.review: opencode/ollama-cloud/deepseek-v4.1-flash:1017#high
 model.implement: opencode/ollama-cloud/deepseek-v4.1-flash:1017#high
+conductor: mcp:launch:f5eb1a9b6c4e550e459a804490241d46c7a63f238cd9fefead70391e0a803540
+maxParallel: 2
+reviewRounds: 5
+maxAttempts: 2

All three model lines resolve: `opencode` / `ollama-cloud/deepseek-v4.1-flash:1017`,
variant `high`.

**5. Repositories — raidenyn-shadow/task-run-scratch.** T3 project
`mcp:84ce4bcf-4cde-4084-b7dd-d7ee5ba21f79` (task-run-scratch), push yes, admin yes.
Approval rule: **no** → owner step to require 1 approval. Keys: 12 identified, 4 to key —
#7 → `scratch-rfc/m1-scratch/27`, #11 → `…/28`, #12 → `…/29`, #18 → `…/30`. No key: #8 (no
milestone), #10 (milestone RFC slug `other-rfc` differs from board's `scratch-rfc`), #9
malformed (`<!-- task: scratch-rfc/m1-scratch -->`).

**6–7. Triggers — create both.** They are missing, so: request the webhook secret, create
`project-conductor webhook` and `project-conductor timer` (2-minute interval) bound to this
thread, then register the webhook on `raidenyn-shadow/task-run-scratch` (admin yes).

**8. Skills.** You will be asked to confirm `project-conductor` and `task-run` are installed
at account level for `opencode`.
```

## Readme write

The agent could write the board readme. The run re-read it, wrote the planned block and read
it back byte for byte (the trailing newline aside). The block now reads:

````text
<!-- project-conductor -->
```text
reconcileMinutes: 2
model.plan: opencode/ollama-cloud/deepseek-v4.1-flash:1017#high
model.review: opencode/ollama-cloud/deepseek-v4.1-flash:1017#high
model.implement: opencode/ollama-cloud/deepseek-v4.1-flash:1017#high
conductor: mcp:launch:f5eb1a9b6c4e550e459a804490241d46c7a63f238cd9fefead70391e0a803540
maxParallel: 2
reviewRounds: 5
maxAttempts: 2
```
````

The text before the marker is unchanged.

## Keys written

| Issue | Key | Read-back |
|---|---|---|
| #7 | `scratch-rfc/m1-scratch/27` | equal |
| #11 | `scratch-rfc/m1-scratch/28` | equal |
| #12 | `scratch-rfc/m1-scratch/29` | equal |
| #18 | `scratch-rfc/m1-scratch/30` | equal |

Left without a key, as planned: #8 (no milestone), #10 (milestone RFC slug differs), #9
(malformed marker).

## First onboarding report

The owner entered the two secret cards, the run created both triggers and registered the
hook, and it produced this report:

```text
## Onboarding: board https://github.com/users/raidenyn-shadow/projects/5

Mode: written without asking
Conductor: `mcp:launch:f5eb1a9b6c4e550e459a804490241d46c7a63f238cd9fefead70391e0a803540`, titled `project-conductor https://github.com/users/raidenyn-shadow/projects/5`

### Created
- Task key `scratch-rfc/m1-scratch/27` on task-run-scratch#7
- Task key `scratch-rfc/m1-scratch/28` on task-run-scratch#11
- Task key `scratch-rfc/m1-scratch/29` on task-run-scratch#12
- Task key `scratch-rfc/m1-scratch/30` on task-run-scratch#18
- Timer trigger `project-conductor timer`, `scheduled-task:f2005dbe-4a5f-406d-993a-3255db5e41ce`, every 120000 ms, bound to this thread, next run 14:30Z
- Webhook trigger `project-conductor webhook`, `scheduled-task:5e9f87cb-f877-44fb-8b7d-9c5d15e39ca8`, bound to this thread
- GitHub webhook `717162700` on `raidenyn-shadow/task-run-scratch` (events `issues`, `pull_request`, active)

### Changed
- This thread's title: `project-conductor onboarding (DeepSeek v2)` → `project-conductor https://github.com/users/raidenyn-shadow/projects/5` (read back equal)
- Board readme settings block: added `conductor`, `maxParallel: 2`, `reviewRounds: 5`, `maxAttempts: 2`; kept `reconcileMinutes: 2` and all three model lines exactly as written (read back equal)

### Reused
- Fields `Run phase` (plan, implement, closeout, care), `Attempt` (number), `Run thread` (text)
- Board RFC marker `<!-- rfc: scratch-rfc -->` and milestone 1's marker `scratch-rfc/m1-scratch`
- 11 already-identified keys; no duplicate key in the repository

### Pending
- `task-run-scratch#8`: no milestone, so no key
- `task-run-scratch#10`: its milestone's RFC slug `other-rfc` differs from the board's `scratch-rfc`, so no key
- `task-run-scratch#9`: malformed marker `<!-- task: scratch-rfc/m1-scratch -->` (plan form), left unchanged
- All three model lines resolve with `variant: high`

### Could not do (owner step)
- **Approval rule is `no`** — neither rulesets nor classic protection require an approving review. Require a pull request with at least 1 approving review on `main`: add a branch ruleset at https://github.com/raidenyn-shadow/task-run-scratch/settings/rules
- **`dedupe.coalesceKey` is unset on the webhook trigger** — the host's `schedule_task` rejects a string there ("Expected `<filter>` at `schedule.dedupe.coalesceKey`"), so the trigger carries `replayKey` and `coalesceWindowSeconds: 120` but no `coalesceKey`. A merge that closes its issue can start two wakes instead of one; both are harmless.

### Triggers
- Timer: created `scheduled-task:f2005dbe-4a5f-406d-993a-3255db5e41ce`
- Webhook trigger: created `scheduled-task:5e9f87cb-f877-44fb-8b7d-9c5d15e39ca8`
- Webhooks: `raidenyn-shadow/task-run-scratch`: registered `717162700`

Webhook owner steps: none

### Repositories
- `raidenyn-shadow/task-run-scratch`: T3 project `mcp:84ce4bcf-4cde-4084-b7dd-d7ee5ba21f79` (task-run-scratch), push yes, admin yes, approval rule no, keys 11 identified, 4 keyed in this run, 3 without a key

### Skills to confirm
- Confirm that `project-conductor` and `task-run` are installed at account level for `opencode`, the provider instance named by all three model lines.
```

The run noted that a T3 MCP restart removed the scheduling tools for several minutes; the retry
succeeded and nothing was written twice.

## Second conductor check

A new thread, `mcp:launch:d0d4987f9df282305083a76b3cc4558f66f713f5431c423cc22ab1dc9df3de9c`,
was launched in the `task-run-scratch` project with the same
`/project-conductor https://github.com/users/raidenyn-shadow/projects/5` request. It stopped
without writing and reported:

> Found it. I stopped without writing anything.
>
> The board's conductor is thread
> `mcp:launch:f5eb1a9b6c4e550e459a804490241d46c7a63f238cd9fefead70391e0a803540`, titled
> `project-conductor https://github.com/users/raidenyn-shadow/projects/5`, in project
> **No project**; it is not archived — so this board already has a live conductor. Run
> onboarding there, or archive that thread first.

The second thread was archived after the check.

## Repeat onboarding run

The same command was sent again in the conductor thread. It reported `Nothing changed.`,
created and changed nothing, asked for no secret, and reused:

- the title and the block's `conductor`;
- all fields and the nine settings keys;
- the 15 identified board keys (14 task keys, 1 plan marker);
- both triggers, with the timer at 120000 ms and the webhook trigger's URL unchanged;
- GitHub webhook `717162700`.

`Webhook owner steps: none`; the approval-rule and `coalesceKey` owner notes were repeated.

## Timer paused for the repair proofs

The timer trigger `scheduled-task:f2005dbe-4a5f-406d-993a-3255db5e41ce` was disabled after
the repeat run, as Task 8.3 requires. It is re-enabled after the repair cases.

