## Design Summary

Input: task [#34](https://github.com/raidenyn/agentic-development-skills/issues/34) "Start Ready tasks and switch models on a phase report" (key `unattended-task-runs/m1-loop/2`), RFC [Run the tasks of a project board unattended](../../design/archive/2026-11-unattended-task-runs/rfc-run-board-tasks-unattended.md), milestone M1.

**Intent.** Prove the thinnest end-to-end path of the loop inside a real task. A woken conductor reads the board, claims Ready tasks within the parallel limit, records each run on the board and starts one worktree thread per task. That thread plans with today's owner stops, reports the phase, is switched once to the coding model, and starts implementing in a fresh session from the saved files. This tests the RFC's riskiest assumption: that a fresh coding session on saved files is enough.

**Goals.**
- One wake's Advance and Start steps in `project-conductor`.
- The new `task-run` skill.
- The wording of the start and apply instructions.
- Wakes delivered one at a time in queue mode, as the RFC requires, never start a task twice or switch a thread twice.
- A wake that dies part-way leaves a state that the next wake reports and does not repeat.

**Non-goals.**
- Repair, left as a named empty step.
- Settling merged threads, the webhook and the timer.
- Removing owner stops, PR care beyond today's process, restarts, planning items.

All of these belong to later tasks or milestones. There is no change to `task-publishing`, `milestone-breakdown` or the `superspec` schema, and no new dependency.

**Anti-goals.**
- A task started twice.
- A thread switched on a forged or stale report.
- A planning item, outline or untrusted issue started.
- A model substituted for the one in `repo-run-models.md`.
- A task stopped again on every wake for the same report.

### Settings and preflight

Each wake first reads the following from the served repository's default branch:
- the `project-conductor` key in `.agents/harness.json` (`maxParallel`, `maxAttempts`);
- `.agents/hooked-rules/repo-run-models.md` (roles plan and implement, with their efforts);
- the `PROJECT_URL` variable.

It also reads the board's fields. Field and option names are matched exactly, case included:
- Status, with the options "Ready" and "In progress";
- "Phase";
- "Run phase", with the options plan and implement;
- "Attempt";
- "Run thread".

If any of these is missing, or a setting is missing or invalid, Start and Advance write nothing, and the wake reports the gap and its owner step. If the label `blocked` is missing, the conductor creates it (`gh label create blocked`). If it cannot be created, the gap is reported, and a stop that needs the label is reported in place of the label.

**Model resolution.** Only the roles a step uses are resolved: plan for Start, implement for Advance.
- A Model cell must be `<providerInstanceId>/<model id>`, split at the first `/`. For example, `opencode/ollama-cloud/deepseek-v4.1-flash:1017` is instance `opencode`, model `ollama-cloud/deepseek-v4.1-flash:1017`.
- The conductor calls `orchestrator_capabilities` with `search` set to the model id. Without `search`, the host lists no models. That instance must list exactly that id.
- The Effort goes into the one option of that model whose values include it. The option id differs per provider: `effort` (Claude), `variant` (OpenCode), `thought_level` (Antigravity).
- A bare name such as the onboarding default `Opus-5.5`, no match, or an effort that no option offers: the step is not taken, and the report asks for a provider-qualified id. A model is never substituted.

The scratch model file: plan `claudeAgent/claude-opus-5-5` (`medium`), review `opencode/openai/gpt-6.2-sol` (`medium`), implement `opencode/ollama-cloud/deepseek-v4.1-flash:1017` (`high`).

**What a wake is.** The conductor is one T3 thread in the served repository's project checkout. `t3_thread_launch` inherits that project, so the served repository is the checkout's own repository. A wake whose checkout has no `PROJECT_URL` fails preflight.

Every wake message has the same shape. Line 1 is the exact report line, or nothing for a manual wake. Then comes a fixed sentence: "Run one wake of the project-conductor skill for this repository." The task thread sends this. The owner sends the sentence alone to wake the conductor by hand. The skill's frontmatter description gains these triggers and drops "Not for … running them".

### Ready (the owner's rule, exactly)

An item is **Ready** when, and only when, all three hold:

1. **it is a task in the monitored project:** an open issue of the served repository on the `PROJECT_URL` board, whose whole first line is a task key `<!-- task: … -->`, and whose Phase is not Planning or Outline;
2. **it has no blockers:** no issue it is blocked by is open;
3. **its Status is Ready.**

Nothing else is part of Ready. In particular, the conductor does not look at the `blocked` label, how a blocker was closed, or "Ready to start when" to decide readiness.

### Start guards (not part of Ready)

A Ready item is started only when two guards also pass. A guard that fails is reported with its reason, and the item is left alone.

- **Not taken:** concurrency and repeated calls. See Taken below.
- **Trusted body:** this is the RFC's Trusted input rule, which works the same way as in onboarding. The author and every body editor must be the agent account or the repository owner. A history that cannot be read, or that overflows, means no.

**Any nested list that overflows its page means the item is not started, and it is reported.** The lists are blockers, body edits, assignees, linked branches and closing pull requests. Overflow means `totalCount` is above the nodes returned.

Items that are not tasks get a report line and no action:
- plan items (`<!-- plan: … -->`): "plan item, not handled yet";
- Phase Planning: "planning item, not handled yet";
- Phase Outline: "outline, never started";
- keyless issues: `not-task` (no task key).

Untrusted issues are reported by the trust guard.

**Why "Ready to start when" needs no check of its own.** This repository's `project-ready` workflow (#52) keeps an item with such a condition in Backlog until a person sets it Ready. `task-publishing` sets Ready only when the person confirmed every condition. So Status already carries the confirmation. The conductor reads the body only to word the report: an item in Backlog whose body has a condition (the `hasStartCondition` pattern of `scripts/project-ready.mts`) is reported as "waiting for a person to set Ready".

Consequences to state in the pull request:
- Acceptance criterion 2's "open condition" case is proved by that item not being Ready.
- A condition added to the body after the item was set Ready does not hold the item back.
- A repository without `project-ready` (`line-mcp` today) needs a person to move Status.

This refines the RFC's Board reading sentence. The RFC says the conditions are "confirmed"; here, confirmation is a person setting Status to Ready.

### Concurrency and repeated calls

- **Taken.** An item counts as taken if it has any of the following:
  - an assignee;
  - any non-empty run field ("Run thread", "Attempt" or "Run phase");
  - a linked branch;
  - a linked pull request that is not cross-repository, or whose author association is `OWNER`, `MEMBER` or `COLLABORATOR` (a stranger's fork pull request is ignored);
  - a T3 thread whose title is exactly its launch key.

  A taken item that is not a complete claim of this conductor is reported and left alone. A complete claim means assigned to the agent, all three run fields set, and a linked branch.
- **Slots.**
  - In use = open issues on the board that are assigned to the agent account or have a non-empty "Run thread", whatever their Status. This matches the M1 assumption that every claim whose pull request has not merged holds a slot.
  - Free = `maxParallel` − in use.
  - Ready items are started in ascending issue number until no slot is free. The rest stay Ready and are reported.
- **Look before writing.** Just before the first claim write, the conductor reads the item again: Status, assignees, run fields, linked branch and pull requests, blockers, the task key, and the body's edit ids. It also searches for the launch-key title (`t3_thread_search`, then compares titles exactly). If anything changed, it skips the item and reports it.
- **Claim order.** Each write is read back.
  1. Assign the agent account.
  2. Set Status "In progress".
  3. Set "Attempt" to 1.
  4. Set "Run phase" to plan.
  5. Create and link the branch: `gh issue develop <n> --name <branch> --base <default>`.
  6. Launch the thread. Title: the launch key `<owner>/<repo>#<n> attempt 1`. `clientRequestId`: the launch key, so a retry after a lost reply makes no second thread. Model and effort: the plan role's. Worktree: `baseRef: origin/<branch>` on `<branch>`. Message: the start instruction.
  7. Write "Run thread".

  The assignee is written first, so a later wake sees the item as taken. A wake that dies part-way leaves a half-made claim. This task reports it and does not touch it; the Repair step of a later task fixes it.
- **Branch.**
  - Name: `<type>/<n>-<slug>`. The type comes from Phase: Feature, Foundation, Migration or an empty Phase → `feat`, Refactor → `refactor`, Hardening → `fix`, Spike → `chore`.
  - Slug: the issue title in lowercase, every character outside `[a-z0-9]` turned into `-`, repeats collapsed, trimmed, cut to 40 characters, then trimmed again. If the slug ends up empty, the branch is `<type>/<n>`.
  - Step 5 always runs, in both paths below, so the branch is created and linked before the launch.
  - The first implementation step proves that T3 starts a worktree on a branch name that already exists on the remote.
  - If it does not, the thread is launched on a new local branch of the same name from `origin/<default>`. That is the commit `gh issue develop --base <default>` just created, so the thread's first push fast-forwards the linked branch. "Complete claim" and criterion 1 are the same in both paths.
- **Phase report.**
  - Format: `phase-done <owner>/<repo>#<n> attempt=<n> phase=<phase> seq=<n> head=<sha>`, sent by the task thread in queue mode with a fresh context (RFC Phase report).
  - Expected `seq`: the position of the reported phase in `plan, implement, closeout, care`, so plan = 1. This means `seq` adds no check beyond `phase` for now. It is recorded as a known weakening of the provisional contract, for M3 to revisit.
  - Only incoming messages from another thread count as reports, with the sender id taken from the host's message metadata. A `phase-done` line in the conductor's own messages, or in a message without a sender thread id, is ignored.
- **Which reports are judged.** In this order:
  1. Collect one set: the message that triggered the wake, plus the kept reports. Kept reports are the wake's own incoming messages since the claim time (the assignment event) of every open item with a non-empty "Run thread", in any phase.
  2. Drop every report whose stop is already recorded. Recorded means an agent comment on the item that quotes the report's message id, line and sender id, whether or not the label is still there.
  3. For each item, look at the reports from its recorded "Run thread" whose attempt equals "Attempt". Keep the newest; the others are superseded and only reported. This applies to the triggering message too.
  4. Judge everything left, one at a time. That includes reports from other senders, and reports from the recorded thread that carry another attempt.
- **Blocked items.** Advance never acts on an item labelled `blocked`; it reports "blocked, waiting for the owner". A kept matching report is acted on at the first wake after the label is gone.
- **The conductor's answer to a report**, in this order. The first answer that applies is given.
  1. **Finish a half-done switch.** The report is from the recorded thread for the current attempt, the thread already holds the apply message for this launch key and head, and "Run phase" is still plan. Write "Run phase" implement and read it back. No wait, no switch, no send.
  2. **Stop for a foreign sender or a wrong attempt.** The report names a complete claim, and its sender is not "Run thread" or its attempt is not "Attempt", whatever the phase.
  3. **Already handled.** The report is from the recorded thread for the current attempt, and its phase is earlier than "Run phase". It is acknowledged with a line in the wake's own report. Nothing is sent to the task thread and nothing is written.
  4. **Act.** Only a plan report while "Run phase" is plan, with `seq` 1 and `head` equal to the remote head of the linked branch (`gh api repos/<repo>/git/ref/heads/<branch> --jq .object.sha`). The conductor waits up to 5 minutes for the thread to be idle, looping `t3_thread_wait` until the 5 minutes are used up, because the report is sent from inside the reporting thread's own turn. Then it:
     1. finds the change folder: the one `openspec/changes/<name>/` that is not under `archive` and has files with status `added` in `gh api repos/<repo>/compare/<default>...<head>`. None, or several, stops the task before any switch;
     2. switches the thread to the implement model (`t3_thread_configure`);
     3. sends the apply instruction in queue mode with a fresh context;
     4. writes "Run phase" implement.
  5. **Not idle yet.** Everything for Act matches, but the thread still runs after the wait, or the switch is refused (active turn, background command). Nothing is written, and the report is judged again at the next wake.
  6. **Stop for another mismatch.** The report is from the recorded thread for the current attempt, and its `seq` or head does not match, or its phase is later than "Run phase".
  7. **Report only.** The line is malformed; it names an issue that is not a task on this board, or whose claim is incomplete; or it matches but its phase is not plan ("not handled in M1"). Nothing is written to any issue. Report-only and already-handled reports are judged again on each wake. This is accepted: they cost one report line and no write.
- **How a task is stopped.** The conductor adds `blocked` and a comment by the agent account. The comment quotes the report's message id, its line and its sender id, gives the reason, and names the phase to resume in. Then the conductor reports it.
- **Next wake in M1.** There is no timer or webhook yet, so the next wake is the next message to the conductor. The "not idle yet" proof uses a manual wake, with the task thread held busy for more than 5 minutes.
- **The conductor's own id.** It reads its own thread id with `t3_thread_configure` (no `threadId`) and puts it in the start instruction.

### The task thread (`task-run`)

1. **Reconcile** by the task's Start section, steps 1 and 2, and stop for the owner where it says to. Start step 3's "fresh `type/<topic>` branch" is the branch the conductor named; the thread works on that branch and opens no other.
2. **Plan** on the planning model by the repository's own process (`superspec` through `openspec-ff-change` here), with every owner stop of today.
3. **Report.** Commit and push the planning files. Then, with no background command running, send the phase report to the conductor thread named in the start instruction, in queue mode with a fresh context, and end the turn.
4. **Implement** after the switch, in a fresh session. Read the change folder named in the apply instruction, and implement by the repository's own process through to its pull request (draft, checks, today's closeout). PR care beyond that is M3.

### Instructions

- **Start**, sent with the launch. It names:
  - the skill `task-run`;
  - the issue URL, the launch key, the attempt and the branch;
  - the conductor thread id;
  - the exact report line to send, with `head` left for the thread to fill.
- **Apply**, sent with a fresh context after the switch. It names:
  - the skill `task-run` and the phase `implement`;
  - the issue URL, the launch key, the branch and the head sha;
  - the conductor thread id;
  - the change folder `openspec/changes/<name>/`, found in step 1 of Act.

### Proof ground

The assumption says to create what is missing. It is missing today:
- The scratch board, project 5 of `raidenyn-shadow`, has Status "Todo, In Progress, Done" and no Phase field.
- The scratch repository has no OpenSpec.
- Its model file names the implement model only as `DeepSeek`.

Host proofs, also in the first implementation step, each with its fallback:
- **`t3_thread_read` gives the sender thread id as a field, separate from the text.** If it is only in the text, any thread can forge it. The fallback is to stop and report under the RFC's "If it does not fit".
- **Messages carry timestamps that can be compared with the assignment event.** If they do not, the scan is bounded by message position.
- **`t3_thread_configure` with no `threadId` returns the conductor's own id.** If it does not, the conductor finds its own thread by an exact title search.
- **T3 starts a worktree on a branch that already exists on the remote.** The fallback is described under Branch.

Preparation, the first implementation step (the owner approved changing the board):
- set the Status options of project 5 to Backlog, Ready, In progress, In review, Done;
- add the Phase field with the `task-publishing` options;
- give the scratch repository an OpenSpec setup and an `AGENTS.md` naming its process;
- set the implement model `opencode/ollama-cloud/deepseek-v4.1-flash:1017` with effort `high` in its model file;
- create the keyed test issues.

The "edited by a second account" case needs `raidenyn` as a collaborator on the scratch repository. That repository's owner is the agent account, so `raidenyn` is a real second author there. The owner has to act for it.

## Alternatives Considered

### Alternative A: Skill text plus one reference file with a query and a `jq` filter
- **Approach**: `SKILL.md` holds the wake steps (Repair empty, then Advance and Start) and the rules. `references/run-github.md` holds one paginated GraphQL board query, a `jq` filter that prints each item with `start` or the reason it is skipped, and the claim, switch and report commands.
- **Pros**: the same shape as the onboarding procedure; follows the RFC's "read with `gh` and judge"; the rejection cases are mechanical and can be tested by hand on the scratch board.
- **Cons**: the filter lives in prose and has no unit tests.
- **Why chosen**: picked by the owner.

### Alternative B: A shipped Node tool for the Ready decision
- **Approach**: a strict TypeScript tool under `src/` that reads the board and prints the decision.
- **Pros**: exact and tested.
- **Cons**: the RFC rejected porting a tool (Abandoned ideas); it adds a build artifact and a version.
- **Why not chosen**: it contradicts an agreed decision.

### Alternative C: Prose only
- **Approach**: the model reads the raw board JSON and decides.
- **Pros**: the least text.
- **Cons**: the rejection cases depend on the model's attention, and repeated wakes may judge differently.
- **Why not chosen**: it gives weaker safety for claims.

## Agreed Approach

Alternative A, chosen by the owner. Ready is exactly the owner's three conditions: a task in the monitored project, no blockers, and Status Ready. Two start guards apply on top: the run fields, launch key and queued wakes guard against concurrency and repeated calls, and Trusted input guards the body.

## Key Decisions

- **Owner (restated):** Ready is exactly three things: a task in the monitored project, no blockers, and Status Ready. The run fields handle concurrency and repeated calls. The `blocked` label and the blocker's close reason are not part of Ready.
- **Owner:** the trust check works the same way as in onboarding. The owner agreed to be the second author on the scratch repository.
- **Owner:** the implement model is `DeepSeek-v4.1-flash:1017`. On the host this is OpenCode `ollama-cloud/deepseek-v4.1-flash:1017`, whose efforts are low, high and max. The scratch file uses `high`, because `medium` is not offered.
- **Owner:** the scratch board's Status options may be changed.
- **Owner:** skill text plus a reference file (A).
- **Owner:** the design is reviewed with Fable, for at most 3 rounds.
- **My call:** Status Ready set by a person confirms "Ready to start when"; there is no new marker or label.
- **My call:** the expected `seq` is derived from the phase order, so there is no new board field. Recorded as a weakening for M3.
- **My call:** pending reports are read again from the conductor's own incoming messages on each wake, from the item's claim time.
- **My call:** the conductor waits up to 5 minutes for the reporting thread's turn to end.
- **My call:** the branch is named `<type>/<n>-<slug>` and is created and linked with `gh issue develop` before the launch. If T3 cannot start a worktree on a branch that already exists, the fallback is a same-named local branch from `origin/<default>`, which the first push fast-forwards.
- **My call:** the label `blocked` is created by the conductor when it is missing.
- **My call:** model cells must be `<providerInstanceId>/<model id>` and match one host model exactly; bare names are reported, never guessed.
- **My call:** a stop is recorded once per report message, by the comment. Only the newest report from the recorded thread is judged. Advance never acts on a `blocked` item. Malformed reports, foreign reports and reports for an incomplete claim are only reported.
- **My call:** a wake is one fixed sentence naming `project-conductor`, after the report line if there is one. The served repository is the conductor thread's own project.

## Open Questions

- **Second account.** `raidenyn` has only `read` on `raidenyn-shadow/task-run-scratch` today, with no pending invite. Task 1 sends the invite, and the owner accepts it and edits one issue body. The invite is kept after the proofs.
- **`npm` → `pnpm`.** The task names `npm test` and `npm ci`. Since #56 the checks are `pnpm install --frozen-lockfile` and `pnpm run check`. This is a rename, noted here.
- **Repositories without `project-ready`.** `line-mcp` lacks the workflow. Copying it is a later task ("Onboard line-mcp's board and prove the loop there").
