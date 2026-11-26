## Design Summary

Input: task [#35](https://github.com/raidenyn/agentic-development-skills/issues/35) "Repair claims, settle merged work and wake on events" (key `unattended-task-runs/m1-loop/3`), RFC [Run the tasks of a project board unattended](../../design/archive/2026-11-unattended-task-runs/rfc-run-board-tasks-unattended.md), milestone M1. The owner widened it during the brainstorm: the conductor now owns a board, not a repository, and the settings move off the codebase. Both parts ship in one pull request.

**Intent.** The conductor runs without anyone waking it by hand, and it is set up by one command in one thread, with no pull request. It serves a GitHub Project board, not a repository, so that nothing stored now prevents a board with several repositories, or a repository on several boards, later. The owner also wants model versions changed without a pull request, because they change often.

**Goals.**
- **One command sets up the conductor.** The owner creates a T3 thread (Claude or OpenCode) and types `/project-conductor <board URL>`. That thread becomes the conductor: it runs the onboarding checklist, creates its own triggers and then waits.
- **The conductor owns the board.** Its thread needs no repository checkout. It takes the repository from each board item and launches the task thread in the T3 project whose repository matches.
- **The settings live on the board.** The limits and the three models go in a marked block of the board's readme. There is no `PROJECT_URL`, no `harness.json` key and no model file, and onboarding opens no pull request.
- **Models are written as `<provider>/<model>#<effort>`.**
- **Wakes come from events.** A webhook (issue closed, pull request closed) and a timer start a wake with a fresh session in the conductor thread. Each wake runs Repair, then Advance, then Start.
- **Repair** fixes half-made claims.
- **Settle.** A task thread whose pull request merged is settled.
- **End of the board.** When the board's last milestone closes, the conductor disables its triggers and settles itself.
- **The trigger check is a standalone procedure**, run on the owner's command or when a timer wake finds an event the webhook should have delivered. It never runs in every wake.
- **Both skills are installed once at account level**, for every provider. No repository carries either of them.

**Non-goals.** These stay out of scope, as in the task:
- telling a stuck thread from a working one, restarting a dead thread, the attempt limit and parked tasks (M3);
- any change to planning, review or merging (M2);
- onboarding `line-mcp` (a later M1 task);
- running and proving a board with several repositories. The design must not prevent it, but it is proved on one repository only.

**Anti-goals.**
- A second thread for one claim, or a claim released while its thread lives.
- A wake that reads a partial or wrong settings block and acts on guessed values.
- A setting stored in the codebase, or a pull request needed to change a model.
- An archived conductor, which would reject every later wake.
- A trigger check that runs in every wake and spends tokens for nothing.
- A webhook payload treated as fact.

## Alternatives Considered

### Alternative A: Settings in the repository, created by onboarding's pull request (the RFC as accepted)
- **Approach**: `PROJECT_URL`, the `project-conductor` key in `.agents/harness.json` and `.agents/hooked-rules/repo-run-models.md`, merged through `chore/project-conductor-onboarding`. The conductor thread lives in the repository's checkout.
- **Pros**: settings are versioned and reviewed, and it is already built.
- **Cons**: every model change needs a pull request. The settings PR must merge before the conductor can run. The settings tie one board to one repository.
- **Why not chosen**: the owner does not want a PR for onboarding or for model updates. The conductor watches a board, not a repository.

### Alternative B: Settings as repository variables
- **Approach**: `CONDUCTOR_*` Actions variables next to `PROJECT_URL`, edited with `gh variable set`.
- **Pros**: no PR, one value per name, already used for `PROJECT_URL`.
- **Cons**: still per repository, and writing variables needs admin, which the agent account lacks.
- **Why not chosen**: it keeps the repository ↔ board 1-1 mapping that the owner wants to avoid.

### Alternative C: Trigger setup checked in every wake
- **Approach**: every wake first lists its triggers and recreates or fixes the ones that are missing or wrong.
- **Pros**: a broken trigger repairs itself on the next wake.
- **Cons**: tokens and time on every wake, for a rare failure.
- **Why not chosen**: the owner asked for the check on demand, plus an automatic run when events look missing.

### Alternative D: Onboarding in any session, a separate conductor thread
- **Approach**: onboarding runs anywhere and launches or messages a conductor thread to create the triggers.
- **Pros**: onboarding stays independent of the thread.
- **Cons**: only the conductor thread can bind triggers, so the setup still runs there, with an extra hand-off.
- **Why not chosen**: the thread where the owner types the command becomes the conductor, which removes the hand-off.

## Agreed Approach

The conductor owns a board. The owner starts it with `/project-conductor <board URL>` in a new T3 thread, in any project or in "No project". That thread renames itself to the board's conductor title, runs the onboarding checklist, writes the settings block into the board's readme (or prints it for the owner), creates its timer and webhook triggers, tries to register the GitHub webhook in each repository of the board, and then waits. Wakes run Repair, Advance and Start. They take the settings from the board readme and the repository from each item, and they launch task threads into the matching T3 project. A standalone trigger check runs on demand. The RFC's Settings contract is amended, and the owner, as decider, agreed to this.

## Key Decisions

1. **Board, not repository.** The served repository is no longer the conductor's checkout. Each board item names its repository. A task is started only in a T3 project whose `repositoryIdentity` matches that repository (`github.com/<owner>/<repo>`). An item of a repository with no such project is not started, and the report names it.
2. **The conductor thread may have no repository.** Proved on 2026-11-26 from a thread in "No project":
   - a timer and a webhook trigger bound to it, each with a fresh session;
   - `t3_thread_launch` into `task-run-scratch`'s project made a worktree of that repository;
   - a queued `t3_thread_send` from that child started a turn in the conductor with `senderThreadId` set to the child.
3. **Settings block in the board readme**, below a marker line:
   - `maxParallel`, `reviewRounds`, `reconcileMinutes`, `maxAttempts`;
   - `model.plan`, `model.review`, `model.implement`.

   The board readme comes back in the board query the wake already runs. A missing number takes its default. A missing or malformed model line stops only the step that uses it. A malformed block, or two blocks, is a gap.
4. **Model cell `<providerInstanceId>/<model id>#<effort>`.** Split at the first `/` and at the last `#`. The effort is required. Resolution is otherwise unchanged: exact match, never substituted.
5. **No `PROJECT_URL`, no settings PR, no model file.** The board URL is given in the command and kept in the conductor thread's title. The readme block records the conductor's thread id. Trigger prompts carry no board. This repository's own `project-ready` workflow uses its own variable `PROJECT_NUMBERS` and is not touched. `repo-review-models.md` stays for hand-started sessions.
6. **The command's thread becomes the conductor.** One conductor per board: onboarding first searches T3 for a thread with the conductor title of that board and stops when one exists.
7. **The wake sentence names the board.** It becomes "Run one wake of the project-conductor skill for this board." `task-run`'s phase report sends the new sentence. *(My call: the old sentence says "repository", which is now wrong.)*
8. **Triggers.**
   - **Webhook trigger:** filters on `headers.x-github-event` in `issues`, `pull_request` and on `body.action` equals `closed`; a closed pull request that did not merge wakes the conductor too, and the wake finds nothing to do. HMAC signature check on `x-hub-signature-256`. Dedupe on the delivery id, with a coalesce window, so that a merge which closes an issue wakes the conductor once.
   - **Timer:** every `reconcileMinutes`, also when nothing is in progress.
   - Both triggers are bound to the conductor thread with fresh sessions. Their prompt is a `Trigger:` line followed by the wake sentence. The request data does not reach the run, so a webhook wake is only a hint (observed in the proof).
9. **GitHub webhook, one per repository of the board, all with the same URL.** The conductor tries to create each one. When the agent is not an admin, the report gives the owner's steps: the URL, the events and the content type. The owner gives the secret at onboarding through `request_secret` and keeps it. The conductor never prints it. A lost URL is copied from T3's Settings.
10. **Trigger check, a standalone procedure.** It runs on the owner's command, or by itself when a timer wake sees an issue close or a pull request merge on the board after the last webhook run. It checks that both triggers exist, are enabled, are bound to this thread and match the settings, and it creates, updates or re-enables what differs. It never runs as part of every wake.
11. **Repair, first in every wake.** For each board issue assigned to the agent, it searches its thread by the launch key, comparing titles exactly:
    - no thread: release the claim;
    - one thread and an empty "Run thread": record it;
    - more than one thread: label the issue `blocked` and report it.
12. **Settle.** A task thread is settled when its pull request has merged and was opened from the claimed branch by the repository or a collaborator. A merged pull request that leaves its issue open breaks one issue, one PR (decision 16). The issue is then labelled `blocked`.
13. **End of the board.** Every milestone that holds an item of the board is closed, and at least one exists. Then the conductor disables, but does not delete, both triggers, and settles itself. It never archives itself.
14. **One pull request** for the settings move, the board ownership and the work of #35, with the contract change and the new behaviour in separate commits. The size goes beyond the task's 1.5 times; the owner agreed, and the PR records it.
16. **1 task = 1 issue = 1 PR** (the owner's rule).
    - **The conductor's side:** a merged pull request that left its issue open gets the issue labelled `blocked` and is reported.
    - **The implementer's side:** a generic rule in `task-run`. The PR closes its issue, and work that does not fit becomes a keyed follow-up task in Backlog, blocked by this task and blocking this task's dependents.
    - **Later:** the rule becomes a per-repository hooked rule at finalize once the harness's rule delivery exists.
15. **Account-level skills.** `project-conductor` and `task-run` must be installed for every provider the models use. The onboarding report asks the owner to confirm this, because a wake cannot check it cheaply.

## Open Questions

- **Template syntax of the dedupe key** (`replayKey` from the delivery header): to be checked with one repeated delivery. That check is part of the task's acceptance criterion on signature and dedupe.
- **Readme write permission:** can the agent account edit the readme of a board that the owner owns? If not, onboarding prints the block for the owner. To be checked on the scratch board and recorded.
