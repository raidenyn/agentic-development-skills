## Context

- **What exists.** `project-conductor` has one procedure, "Onboard a board" (task #33, PR #55). It sets `PROJECT_URL`, creates the fields "Run phase", "Attempt" and "Run thread", and proposes `.agents/harness.json` (the `project-conductor` key) and `.agents/hooked-rules/repo-run-models.md`. Nothing reads those settings yet.
- **What decides Status today.** This repository's `project-ready` workflow (`scripts/project-ready.mts`) moves an item from Backlog to Ready when every blocker is closed as completed. An item with a "Ready to start when" condition stays in Backlog until a person sets it Ready. `task-publishing` sets Ready only when the person confirmed every condition.
- **What the host can do.** T3 offers `t3_thread_launch`, `t3_thread_configure`, `t3_thread_send` (queue mode, fresh context), `t3_thread_read`, `t3_thread_wait`, `t3_thread_search` and `orchestrator_capabilities`.
- **What the spikes established** ([spike-findings.md](../../design/archive/2026-11-unattended-task-runs/spike-findings.md)):
  - a model switch works from another thread while the target is idle;
  - T3 refuses a switch while a background command runs;
  - queue mode runs messages in order;
  - a fresh context starts a new provider session;
  - messages arrive with the sender's thread id;
  - one GraphQL query can read the whole board, blockers included.
- **Constraints.** These come from the RFC and its records:
  - the conductor keeps no state between wakes and reads everything again;
  - one conductor per board, with queued wakes, is the only protection against two writers, because GitHub Projects has no compare-and-set;
  - models come only from `repo-run-models.md`, and a model is never substituted.
- **Stakeholders.** The repository owner (raidenyn), who decides; the agent account `raidenyn-shadow`, which writes.

The validated design, with every case, is in [brainstorm.md](brainstorm.md). This file records the architecture and the reasons behind it.

## Goals / Non-Goals

**Goals:**
- A woken conductor starts every Ready task into a free slot, records the run on the board, and starts one worktree thread per task on the plan model.
- A matching phase report switches that thread once to the implement model. The thread then starts a fresh apply session pointed at the change folder.
- Repeated, superseded, forged and early reports each get the answer the Phase report contract names, and none of them starts or switches anything twice.
- The `task-run` skill and the two instruction texts.

**Non-Goals:**
- Repair. It is a named empty step here; its logic is the next task.
- Settling merged threads, the webhook and the timer.
- Removing owner stops, the decision policy, archive-first and auto-merge (M2).
- PR care, restarts and parked tasks (M3).
- Planning items and milestone closes (M4).
- Changes to `task-publishing`, `milestone-breakdown` or the `superspec` schema.

## Decisions

### 1. Prose procedure plus one reference file

`SKILL.md` gains the procedure "Run one wake", with one section per step: Repair, then Advance, then Start. `references/run-github.md` holds the board query, the `jq` filter and every command.

The filter prints one line per board item, either `start` or `skip <reason>`. The reason names are those of `references/run-github.md`: `not-task`, `plan-item`, `planning`, `outline`, `other-repo`, `closed`, `blocker-open`, `not-ready`, `waiting-for-ready` (the Ready rule), then `overflow:<list>`, `taken:<what>`, `untrusted` (the start guards).

The model runs the queries, follows the filter's verdict, and makes the writes.

- **Why:** the owner chose this. It follows the RFC's "read with `gh` and judge", matches the shape of the onboarding procedure, and makes the decision mechanical where safety depends on it.
- **Rejected:** a Node tool, which the RFC rejected among its abandoned ideas; and prose only, which leaves the rejections to the model's attention.

### 2. Ready = exactly the owner's three conditions, then two start guards

**Ready** is exactly these three:
- the issue is a task in the monitored project: an open, keyed issue of the served repository on the `PROJECT_URL` board, whose Phase is not Planning or Outline;
- it has no blockers: none open;
- its Status is Ready.

A Ready item is started only when two **start guards** also pass:
- **not taken** (Decision 3);
- **a trusted body**, using the onboarding trust query.

A nested list (blockers, body edits, assignees, linked branches, closing pull requests) that overflows its page means the facts cannot be read, so the answer is no.

The body is read only to word the report reason "waiting for a person to set Ready".

- **Why:** the owner's rule. The existing automation already holds back items with conditions, so a second confirmation mechanism would duplicate it.
- **Consequence:** a condition added to the body after Ready is set does not hold the item back. The pull request reports this.

### 3. Claim order, with the claim visible first

The claim is written in this order, and each write is read back:
1. the assignee;
2. Status "In progress";
3. "Attempt" 1;
4. "Run phase" plan;
5. `gh issue develop` (the branch is created and linked);
6. `t3_thread_launch` with the launch key as its title and `clientRequestId`, the plan model and effort, and a worktree on the branch;
7. "Run thread".

Before step 1, the conductor reads the item again and searches for the launch-key title.

- **Taken** means any of: an assignee, a run field set, a linked branch, a trusted linked pull request, or a thread with the launch key.
- **Slots in use** means open board issues that are assigned to the agent or have a "Run thread", whatever their Status.
- **Why:** the assignee is the cheapest marker that a later wake sees first. The run fields and the launch key close the gaps between writes. A half-made claim is reported and left for Repair.

### 4. Phase reports judged by an ordered rule

The conductor keeps no state of its own:
- the candidate reports are the triggering message, plus the incoming messages since each running item's claim;
- the board's run fields decide what is pending;
- agent comments record which reports already stopped a task.

The order is:
1. collect the reports;
2. drop those whose stop is already recorded;
3. per item, keep only the newest report from the recorded thread for the current attempt;
4. judge the rest one at a time.

The answers, checked in this order:
1. finish a half-done switch;
2. stop for a foreign sender or a wrong attempt;
3. already handled (from the recorded thread for the current attempt, with an earlier phase);
4. act (only a plan report while "Run phase" is plan);
5. not idle yet;
6. stop for another mismatch (`seq`, head, or a later phase);
7. report only.

A stop is the `blocked` label plus a comment quoting the message id, the line and the sender. Checking the sender and attempt before "already handled" means a forged or wrong-attempt report is never acknowledged as a repeat.

Act does the following:
1. waits up to 5 minutes for the reporting turn to end;
2. finds the single change folder the branch adds at `head`;
3. switches the model;
4. sends the apply instruction in queue mode with a fresh context;
5. writes "Run phase" implement last.

- **Why:**
  - Writing the phase last means a wake that dies part-way is finished by the next one. That wake sees the apply message is present and only writes the phase.
  - Judging only the newest report stops a superseded head from blocking a valid run.
  - Recording stops in comments makes them idempotent without a new field.
- **`seq`:** derived from the position of the phase, which adds no check beyond `phase` for now. This is accepted for M1 and recorded for M3.

### 5. Models resolved, never substituted

A Model cell in `repo-run-models.md` must be `<providerInstanceId>/<model id>`. The conductor checks it with `orchestrator_capabilities` searched by the model id, and the effort must be a value of one option of that model. Only plan (Start) and implement (Advance) are resolved. A bare name, no match, or an unsupported effort stops that step and is reported.

- **Why:** the host checked during review lists no models without a search, and a bare name like `Opus-5.5` matches neither the id `claude-opus-5-5` nor the label "Claude Opus 5.5". Matching on a loose name would be a guess.
- **Consequence:** onboarding's bare defaults do not resolve. A board onboarded with them must have its model file edited to provider-qualified ids. This is proposed as a follow-up task for onboarding.

### 6. A wake is one fixed sentence

Every wake message ends with "Run one wake of the project-conductor skill for this repository." A phase report puts its line before that sentence. The served repository is the conductor thread's own project checkout.

- **Why:** a fresh-context session must load the right skill from the message alone, and `t3_thread_launch` inherits the conductor's project.

### 7. `task-run` follows the repository's own process

The skill is generic:
1. reconcile by the task's Start section, on the branch the conductor named;
2. plan by the repository's process with today's stops;
3. commit and push;
4. with no background command running, send the report in queue mode with a fresh context, and end the turn;
5. after the switch, read the named change folder and implement through to the pull request by the repository's process.

- **Why:** the RFC keeps today's stops in M1 and does not edit the schema. The repository's own files decide the process.

### 8. Prove the host behaviour first

The first implementation step proves five things on the scratch ground, each with a fallback:
- the sender id is a metadata field (fallback: stop, under "If it does not fit");
- messages carry timestamps (fallback: bound the scan by message position);
- the conductor can read its own thread id (fallback: an exact title search);
- a worktree can start on a branch that already exists on the remote (fallback: a same-named local branch from `origin/<default>`, which fast-forwards);
- `clientRequestId` accepts the launch key (fallback: a sanitised launch key).

The proof ground is prepared at the same time:
- the Status options and the Phase field on project 5;
- an OpenSpec setup in the scratch repository;
- an exact implement model id, confirmed by the owner;
- the keyed test issues.

## Risks / Trade-offs

- [A model misreads the filter output] → The filter prints a verdict per item, and the procedure says to act only on `start`.
- [Two conductors on one board] → Out of the design: one conductor per board. The claim re-read and the launch-key search narrow the window.
- [A wake dies between writes] → The order makes every intermediate state visible. Advance finishes a half-done switch, and other half-made claims are reported for Repair.
- [A condition added to the body after Ready] → Accepted under the owner's rule, and reported in the pull request.
- [`seq` is redundant in M1] → Recorded as a weakening of the provisional contract, for M3.
- [Proof needs owner actions] → The second-author case needs `raidenyn` to accept the invite and edit one body. If not, that case is marked "not done" with the reason.
- [A host behaviour differs from the spike] → Each assumption has a fallback (Decision 8). A failed fallback stops the work under "If it does not fit".

## Migration Plan

Additive. A repository is affected only when a conductor thread is woken on it. Rollback is to remove `PROJECT_URL` or stop waking the conductor. Hand-started sessions keep today's stops.

## Open Questions

None. The owner confirmed the implement model (`opencode/ollama-cloud/deepseek-v4.1-flash:1017`, effort `high`), agreed to be the second author on `raidenyn-shadow/task-run-scratch`, and approved the scratch board's Status options.
