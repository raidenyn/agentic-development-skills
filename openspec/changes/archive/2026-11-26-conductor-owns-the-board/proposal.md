## Why

The conductor runs only when someone wakes it by hand, and a wake that dies half-way leaves a half-made claim that nothing repairs (task #35). Its setup ties one board to one repository and needs a settings pull request, and every model change needs another PR, although models change often. The owner wants the loop to turn by itself from repository events and a timer. They also want the conductor to own a board rather than a repository, with its settings on the board, so that nothing stored now prevents a board with several repositories later.

## What Changes

**Where the conductor lives**
- From: a thread in the served repository's checkout; the served repository is that checkout.
- To: a thread in any T3 project or in "No project". It is titled `project-conductor <board URL>`, and the board readme records it by its thread id. The repository comes from each board item, and task threads launch into the T3 project whose repository matches.
- Reason: the conductor monitors a board. This also keeps multi-repository boards possible.
- Impact: breaking for the conductor thread's setup. The scratch board is migrated, and its in-flight runs are released by hand.

**Settings**
- From: `PROJECT_URL`, the `project-conductor` key in `.agents/harness.json`, and `.agents/hooked-rules/repo-run-models.md`, all merged through an onboarding PR. Model cells are `<provider>/<model>` with a separate effort.
- To: one block in the board readme (`conductor`, the four limits, `model.plan`, `model.review`, `model.implement`), with model cells `<provider>/<model>#<effort>`. No PR.
- Reason: models change often; the owner wants no PR for onboarding or for a model change.
- Impact: breaking. It amends the RFC's frozen Settings contract and its Onboarding decision. The owner, as decider, agreed.

**Onboarding**
- From: any session runs seven steps, including the variable and the settings PR. The webhook step is pending.
- To: `/project-conductor <board URL>` in a new thread. That thread becomes the conductor and runs a checklist:
  - checks that no other conductor serves the board, then renames itself;
  - creates the fields and the settings block;
  - checks each repository of the board: its T3 project, keys and approval rule;
  - takes the webhook secret from the owner;
  - creates the timer and webhook triggers and registers the GitHub webhooks, or prints the owner's steps;
  - asks the owner to confirm that both skills are installed at account level.
- Impact: breaking for the procedure. The dry run and "proceed without asking" stay.

**Wake**
- From: Repair is an empty step. A wake is started only by a message.
- To:
  - a webhook (issue closed, pull request closed) and a timer start wakes, each with a fresh session;
  - Repair fixes half-made claims;
  - Settle settles the threads of merged pull requests;
  - the end of the board disables the triggers and settles the conductor;
  - the wake sentence becomes "…for this board.", and the old one is still accepted.

**Trigger check**
- New, standalone: it runs on the owner's command, or by itself once per missed event, in an unattended form. It never runs in every wake.

**1 task = 1 issue = 1 PR**
- New rule in `task-run`: the pull request closes its issue, and work that does not fit becomes a keyed follow-up task in Backlog with the right blocked-by links.
- The conductor labels `blocked` any issue that stays open after its pull request merged.
- Later, the rule moves to a per-repository hooked rule at finalize, once the harness's rule delivery exists.

**Features removed, and where their behaviour goes**

| Feature today | After this change |
|---|---|
| The `PROJECT_URL` variable, set or printed by onboarding | Gone. Only the conductor read it. This repository's `project-ready` workflow uses its own `PROJECT_NUMBERS`. |
| Settings reviewed and versioned through a PR | Lost: a readme edit has no review and no history. A malformed block is a gap, never defaults. The owner accepted this loss on 2026-11-26. |
| The roster migration from `repo-review-models.md` to `repo-run-models.md` | Not needed. `repo-review-models.md` stays unchanged for hand-started sessions. |
| Reuse and completion of the onboarding PR | Gone with the PR. Repeat runs reuse the block, the fields and the triggers. |
| A full onboarding from any session | Only the dry run works from any session. Writing needs the conductor thread, which only the owner's command creates. |
| The `blocked` label created in every wake's preflight | It is created the first time a stop in a repository needs it. |
| The Ready filter verdict `other-repo` | Replaced. Items of every repository on the board are handled, and `no-project:<repo>` covers a repository without a T3 project. |

## Capabilities

### New Capabilities
- `conductor-triggers`: the timer and webhook triggers, Register the webhook for one repository, the trigger check, and the end of the board.

### Modified Capabilities
- `board-onboarding`: onboarding runs in the thread that becomes the conductor, with the settings block, per-repository checks and the webhook secret. The variable, harness key, model file and settings PR are removed.
- `conductor-wake`: the board is the unit; the wake sentence names the board; the settings come from the readme block; the model cell format changes; Repair and Settle are added; the board is read again after them; the wake order and the report change.
- `task-run-thread`: the PR closes its issue, the follow-up task rule, the `Board:` line, and the new wake sentence.

## Impact

- **Skill files:**
  - `skills/project-conductor/SKILL.md`, `references/run-github.md` and `references/onboarding-github.md`;
  - a new `references/triggers-github.md`;
  - `skills/task-run/SKILL.md` and a new `skills/task-run/references/follow-up-github.md`;
  - `README.md`.
- **RFC:** an amendment entry in `openspec/design/archive/2026-11-unattended-task-runs/rfc-run-board-tasks-unattended.md`.
- **Specs:** `board-onboarding`, `conductor-wake` and `task-run-thread`, plus the new `conductor-triggers`.
- **Systems:**
  - T3 scheduled tasks bound to the conductor thread;
  - GitHub repository webhooks, created by the owner where the agent is not an admin;
  - the scratch board `raidenyn-shadow` project 5.
- **No new dependencies, and no Node tool changes,** so `pnpm run build` and `harness:update` are not needed.
