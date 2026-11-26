## Context

- **What exists.** `project-conductor` has two procedures in `skills/project-conductor/SKILL.md` (PRs #55 and #57).
  - **Onboard a board** has seven steps: preflight, `PROJECT_URL`, fields, a settings pull request, keys, the approval rule, and the webhook as a pending line.
  - **Run one wake** has Repair as a named empty step, then Advance and Start.

  The commands are in `references/onboarding-github.md` and `references/run-github.md`. `task-run` (`skills/task-run/SKILL.md`, 73 lines) holds no repository data. It takes everything from the conductor's instructions and the issue.
- **Where it is tied to one repository today.**
  - The served repository is the conductor's own checkout: `gh repo view` in Preflight.
  - Task threads launch into the conductor's own T3 project.
  - The settings come from that repository's default branch: `PROJECT_URL`, `.agents/harness.json` and `repo-run-models.md`.

  Everything else already passes `--repo <repo>` or uses the GitHub API. The launch key `<owner>/<repo>#<n> attempt <n>` and the phase report line already name the repository.
- **What T3 offers.** This comes from the tool schemas and a proof run on 2026-11-26 (T3 Code 0.1.11).
  - **Triggers (`schedule_task`).**
    - Trigger types `interval` and `webhook`.
    - Webhook filters `equals`, `notEquals`, `startsWith`, `in` and `exists`, combined with AND only.
    - An HMAC signature with `header`, `prefix`, `encoding` and `secret` or `secretRef`.
    - Dedupe with `replayKey`, `coalesceKey` and a window of 10 to 3600 seconds.
    - `maxDeliveryAgeMinutes`, at most 1440.
    - Options: `bindToCurrentThread`, `freshSession`, and `enabled=false` to pause.
  - **What the proof showed about triggers.**
    - A thread in "No project" could bind both trigger kinds to itself.
    - The run gets only the fixed prompt, not the request data.
    - Another thread can delete a trigger.
    - `list_scheduled_tasks` with a `projectId` returns each task with `boundThreadId`.
    - Only creation returns the webhook URL. After that it is shown in T3's Settings.
  - **Threads.**
    - `t3_thread_launch` into another project's `projectId` makes a worktree of that repository.
    - A queued `t3_thread_send` arrives with `senderThreadId`.
    - `t3_thread_search` searches only one project: the given `projectId`, or else the caller's own project. Checked: a search from this thread without `projectId` missed a `task-run-scratch` thread that the same search with that project's id found. It also matches message text, is "not exhaustive", returns at most 50 matches and skips archived threads.
    - `t3_thread_read` shows a thread's `pullRequests`, `settled` and `archived`.
    - `t3_thread_organize` settles a thread. A settled thread is woken by a send or a webhook. Archiving one's own thread fails the run.
    - `t3_thread_update rename` renames a thread.
  - **Projects and secrets.**
    - `t3_project_list` gives each project's `repositoryIdentity.canonicalKey`, such as `github.com/raidenyn-shadow/task-run-scratch`.
    - `request_secret` asks the owner for a secret. It returns a `secretRef` for a T3 tool, or a file for a command.
- **Constraints.**
  - The RFC's frozen names stay: skill names, field names, the `blocked` label, the task key, the launch key and the Phase report line.
  - The Settings contract and the Onboarding decision change. They are recorded as an RFC amendment, which the owner, as decider, agreed in the brainstorm.
  - No new dependencies.
  - The agent account `raidenyn-shadow` is not an admin of `raidenyn/line-mcp`.
- **Stakeholders.** The repository owner (raidenyn) decides. The agent account writes.

The agreed design and its alternatives are in [brainstorm.md](brainstorm.md). This file records the architecture and why.

## Goals / Non-Goals

**Goals:**
- The conductor serves a board. Its thread may be in any T3 project or in "No project". It takes each item's repository from GitHub and launches that item's task thread in the repository's T3 project.
- One command, `/project-conductor <board URL>`, onboards the board in the thread where it is typed. That thread becomes the conductor.
- Settings and models live in the board's readme. No setting lives in a repository, and onboarding opens no pull request.
- A webhook and a timer wake the conductor. Repair runs first in every wake. Merged work is settled. At the end of the board the conductor disables its triggers and settles itself.
- A standalone trigger check repairs the triggers when the owner asks for it.
- 1 task = 1 issue = 1 PR, as a generic rule in `task-run`.
- The open question "Webhook signature and dedupe" is answered with test deliveries.

**Non-Goals:**
- Stuck threads, restarts, the attempt limit and parked tasks (M3).
- Planning, review or merge changes beyond the 1-PR rule (M2).
- Onboarding `line-mcp` (a later M1 task).
- Proving a board with several repositories. The design allows one; the proof uses one.
- Changes to `task-publishing`, `milestone-breakdown`, the `superspec` schema, or this repository's `project-ready` workflow and its `PROJECT_NUMBERS` variable.

## Decisions

### 1. The board is the unit, and each item names its repository

A wake has no "served repository". For each board item, `<repo>` is `content.repository.nameWithOwner`, and every command for that item uses it.

- **Its T3 project** is the one whose `repositoryIdentity.canonicalKey` equals `github.com/<repo>`, compared without case, since GitHub names ignore case. #57 compared them with case.
- **No such project:** the item is not started (`skip no-project:<repo>`). It is still repaired and settled, because those steps need no checkout.
- **Several such projects:** a gap for that repository. The report lists their ids.
- **Cached per repository for the wake:**
  - the default branch;
  - the agent's permission;
  - the trust check against that repository's owner;
  - the `blocked` label, created the first time a stop needs it there.

**Scripts in `run-github.md`.** They change from one repository to one board:
- Every file and every verdict is keyed by `<repo>#<n>`, never by the issue number alone. This covers `filter.txt`, the judge's verdict map, `claims.json`, `stops.json` and `claim-<repo>-<n>.json`.
- The Ready filter takes the trusted owner from each item's repository.
- The filter verdict `other-repo` is retired.
- The Ready filter gains `no-project:<repo>` and `gap:projects:<repo>`, read from the per-repository facts, so they are reported even when no slot is free. Claim checks `no-project` again just before its writes.
- Claim's thread search uses the item's project.

**Why:** the owner wants no decision that blocks multi-repository boards, and the proof shows T3 supports them. **Rejected:** keeping the conductor in one repository's checkout.

### 2. The conductor's identity: its title and the readme block

The conductor is found from both sides:

- **Its title** is `project-conductor <board URL>`. Onboarding sets it with `t3_thread_update`. Every wake reads its own title (`t3_thread_configure`, then `t3_thread_read` on its own id) and takes the board from it.
- **The readme block** holds `conductor: <thread id>` (Decision 3).

A wake writes nothing when either does not hold:
- the title has exactly the form `project-conductor <URL>`;
- `conductor` in the block equals its own thread id.

It reports the fix: rename the thread, or correct the block. Repair and Settle do not run either, because another thread may own the board.

**One conductor per board.** Before it writes anything, onboarding checks two places:
- The block's `conductor`. If it names another thread that `t3_thread_read` shows as not archived, onboarding stops and names it.
- Every project from `t3_project_list`, "No project" included. It searches each one for the title and compares the titles exactly. A match that is not this thread stops onboarding too.

**Why:**
- The title can be seen and survives fresh sessions.
- The block records the owner exactly and cannot be lost to a search that is not exhaustive.
- Task threads get the conductor's id from their instructions, as today.

**Rejected:** the board in the trigger prompts, because that is a second source that could drift; and a state file.

### 3. The settings block in the board readme

````markdown
<!-- project-conductor -->
```text
conductor: mcp:launch:…
maxParallel: 2
reviewRounds: 5
reconcileMinutes: 30
maxAttempts: 2
model.plan: claudeAgent/claude-opus-5-5#medium
model.review: opencode/openai/gpt-6.2-sol#medium
model.implement: opencode/ollama-cloud/deepseek-v4.1-flash:1017#high
```
````

**Format.** The block is the first fenced block after the marker, one `<key>: <value>` per line.

**Values.**
- **Missing numbers** take their defaults: 2, 5, 30 and 2.
- **`reconcileMinutes`** must be between 1 and 1440.
- **A settings gap** is any of: an unknown key, a repeated key, a number that is not a positive integer, a missing `conductor`, no fenced block, or two markers. With a gap, Advance and Start write nothing. Repair and Settle still run when `conductor` holds (Decision 2).
- **A missing or unresolvable model line** stops only the step that uses that role, as today.

**Reading and writing.**
- The board query (`board.graphql`) is extended to read:
  - the project's `readme`;
  - each item's `milestone { number state }`;
  - the issue's `closedAt`;
  - `mergedAt` on `closedByPullRequestsReferences`.

  Today it reads only the items. Decisions 9, 11 and 12 need these fields.
- Onboarding writes the block with `gh project edit --readme` and keeps the rest of the readme byte for byte.
- A refused write becomes an owner step that shows the block.

**Why:** the board is what the conductor monitors. Models change often, and an edit here needs no PR.

**Rejected:**
- repository variables, which are per repository and need admin;
- board fields, which hold values per item;
- repository files, the RFC as accepted.

**Trade-off:** an edit here has no review and no history. A malformed block is never read as defaults.

### 4. Model cell `<providerInstanceId>/<model id>#<effort>`

The cell is split at the first `/` and at the last `#`. All three parts must be non-empty, otherwise the cell is a "bare name". Everything else in Models stays as it is: an exact match, one effort option, never substituted. Report lines name the readme block instead of `repo-run-models.md`.

### 5. Onboarding is the conductor's checklist

The owner types `/project-conductor <board URL>` in a new thread. That thread runs **Onboard a board** as today: survey, plan, write after agreement. The dry run and "proceed without asking" are kept.

1. **Preflight.**
   - `gh` with the `project` scope.
   - The board.
   - The one-conductor check (Decision 2).
2. **This thread is the conductor.** Rename it to its title.
3. **Fields.** As today.
4. **Settings block.** Create, reuse or change it (Decision 3), with `conductor` set to this thread's id. An implement model the owner did not confirm is left out and reported, as today.
5. **Repositories of the board.** Each repository with an open board issue, checked one by one:
   - its T3 project (Decision 1);
   - push permission;
   - the keys (as today, per repository);
   - the approval rule (as today).
6. **Webhook secret.** Only when the webhook trigger or a hook is created, the owner gives it with `request_secret`, as explained in Decision 8. A repeat run that reuses the trigger asks for nothing, and carries the `Webhook owner steps:` list from the newest report.
7. **Triggers** (Decision 7), then **Register the webhook** for each repository (Decision 8).
8. **Skills.** The report asks the owner to confirm that `project-conductor` and `task-run` are installed at account level for every provider instance named in the models. Nothing is written.

**Removed:**
- the `PROJECT_URL` step;
- the settings PR and its branch `chore/project-conductor-onboarding`;
- the `harness.json` key;
- `repo-run-models.md` and the roster migration.

`repo-review-models.md` is left alone for hand-started sessions.

- **A dry run writes nothing.** Run in another thread, it reports that steps 2, 6 and 7 need the conductor thread.
- **A repeat run reuses what holds:** the block, the fields, and the triggers of this thread, found with `list_scheduled_tasks` by `projectId` of this thread, `boundThreadId` and title.

### 6. The wake sentence names the board

A wake is a message ending with "Run one wake of the project-conductor skill for this board."

- `task-run`'s phase report and the start instruction send this sentence.
- The old sentence ("…for this repository.") is still accepted, so threads in flight keep reporting.

### 7. Triggers

Both are created with `bindToCurrentThread: true` and `freshSession: true`.

| Title | Schedule | Prompt |
|---|---|---|
| `project-conductor webhook` | see below | `Trigger: webhook.` + the wake sentence |
| `project-conductor timer` | `interval`, `everyMs` = `reconcileMinutes` × 60000 | `Trigger: timer.` + the wake sentence |

The webhook trigger's schedule is `webhook` with:
- **Filters:** `headers.x-github-event` in `issues`, `pull_request`, and `body.action` equals `closed`. No filter on `merged`: Task 0 showed that `body.pull_request.merged` `notEquals` `false` also drops every issue delivery (`evidence/00-trigger-syntax.md`).
- **Signature:** header `x-hub-signature-256`, prefix `sha256=`, hex. The secret comes from the owner (Decision 8).
- **Dedupe:** `replayKey` `{{headers.x-github-delivery}}`, which Task 0 proved drops a repeated delivery; a constant `coalesceKey` with a 120 s window.
- **`maxDeliveryAgeMinutes`:** `reconcileMinutes`.

- **Closed, unmerged PRs.** Filters only combine with AND, so a pull request closed without merging also wakes the conductor. That wake finds nothing to do.
- **Coalescing** is meant to turn a merge that closes its issue into one wake. What a constant key does with a delivery that comes later in the window is checked live (Verification). If it drops a different event, that event waits for the timer, which is acceptable because the board is read again.
- **The `Trigger:` line** makes each run's trigger visible in the run list.
- **Payloads are only hints.** The wake reads everything again.

**Why:** T3's own filters, signature check and dedupe, with no code of ours. **Rejected:** a GitHub Action calling T3, which adds a part and puts a token in the repository.

### 8. Register the webhook, a sub-procedure for one repository

**Inputs:**
- the repository;
- the webhook URL: from the trigger just created, or, when the owner runs it later, pasted from T3's Settings;
- the secret, through `request_secret` with `delivery: "file"`.

The secret is never printed or stored by the conductor. The owner keeps it. For `schedule_task`, onboarding takes a second `request_secret` with a `secretRef`. *(My call: the owner keeps the secret, so a repository added later reuses the same URL and secret, and no trigger has to be recreated.)* T3 does not show the two entries side by side, so a mismatch between them cannot be detected at entry. It shows up as missing deliveries, which the timer covers and the automatic check reports.

**Steps:**
0. **Read the permission first** (`gh api repos/<repo> --jq .permissions.admin`). Without admin, skip to step 2 and ask for no secret.
1. **The agent is an admin of the repository:**
   - List the hooks with `gh api repos/<repo>/hooks`.
   - A hook whose `config.url` equals the URL is reused, and it is updated to the events `issues` and `pull_request`.
   - Otherwise one hook is created: the URL, the secret, `content_type: json`, those two events.
2. **Not an admin, or the write is refused.** Nothing else is tried. The report gives the owner's steps:
   - the repository's webhook settings page;
   - the payload URL;
   - "content type `application/json`";
   - "the secret you gave at onboarding";
   - the events "Issues" and "Pull requests".

**Who runs it:**
- onboarding, for each repository;
- the owner, for one repository: "register the webhook for `<repo>`". This covers a repository added to the board later.

Nothing records which repositories have a hook. The conductor does not keep that state.

**A lost URL.** The owner copies it from T3's Settings. Only when the trigger itself is lost does the trigger check create a new one. The report then says that every repository's hook must be re-registered with the new URL.

### 9. Trigger check, a standalone procedure

**Check the triggers** does four things:
1. It lists the triggers with `list_scheduled_tasks`: `projectId` of this thread, matched by `boundThreadId` and title.
2. It compares them with Decision 7 and the current `reconcileMinutes`.
3. It fixes what differs:
   - a differing trigger is updated in place, so the URL stays;
   - a disabled one is re-enabled, unless the board has ended;
   - a missing timer is created;
   - a missing webhook trigger is created only on the owner's command, because it needs a new secret from the owner (`request_secret`). The report then says that every repository's hook must be re-registered with the new URL.
4. It runs Register the webhook (Decision 8) for any repository the owner names.

This calls `list_scheduled_tasks` inside a run. The tool's advice "do not call this to find your task" is about a scheduled run hunting for the prompt it should run. Here the call lists the triggers to check them, and the proof showed it works with a `projectId`.

**It runs only in two cases:**
- **The owner's command,** "check the triggers".
- **A timer wake with a missed event.** The board shows an issue closed or a pull request merged that is:
  - more than `reconcileMinutes` ago;
  - after the last webhook-triggered run of this thread;
  - after the last trigger check;
  - after the newest onboarding report in this thread, which is when the triggers were created.

  Two kinds of event do not count:
  - events within the coalesce window (120 s) of a webhook run;
  - events in a repository whose Register the webhook step is still an owner step in the report of the last onboarding or check.

  The times come from this thread's own messages whose text starts with `Trigger: webhook.` or with the heading `## Trigger check`. Every onboarding report and every check report repeats the full list of repositories whose webhook is still an owner step. The scan reads the thread's messages backwards. It stops at the oldest candidate event, or at the newest such report, whichever is older.

  When the condition holds, the check runs after the wake's steps, in its unattended form: it only updates, re-enables or creates the timer, and it never asks for a secret. A missing webhook trigger becomes the owner step "run: check the triggers". When the triggers turn out fine, the report adds the owner step "deliveries missing for `<repo>`: check its GitHub webhook".

  Because the bound includes the last check, one missed event runs the check once, not on every wake.

It never runs in a webhook wake or a manual wake, nor in a timer wake that finds the end of the board, a failed board read or a settings gap, because that wake cannot act on the result.

**Accepted gap:** a lost timer wakes nothing. The owner's command fixes it.

### 10. Repair

Repair runs first in every wake that passes Decision 2.

**Scope:** each open board issue whose whole first line is a task key and that is assigned to the agent, or whose "Run thread" is not empty. Issues without a key are never touched. *(My call.)*

**The thread.** The launch key is `<repo>#<issue> attempt <Attempt, or 1 when empty>`. Which way the thread is found depends on "Run thread":
- **Set:** `t3_thread_read` on that id decides. The search is not used.
- **Empty:** `t3_thread_search` in the repository's T3 project, with the launch key and `limit` 50, comparing titles exactly. An error, or 50 matches, is **unknown**: the item is skipped and reported, never treated as "no thread".

  "No match" can still be wrong, because the search is not exhaustive. A release is then safe: Start launches with `clientRequestId` set to the launch key, and that returns the existing thread instead of a second one. The launch's read-back then records it.

**Read failures.** A `t3_thread_read` that returns an error is **unknown** and leads to a skip. Only an explicit "not found" answer counts as missing.

**Branches.** More than one linked branch is a stop.

**`blocked` items.** An item labelled `blocked` is skipped whole: no record, no release, no stop. It is listed in the report.

| Found | Action |
|---|---|
| "Run thread" set; the thread exists, is not archived, and its title is the launch key | nothing |
| "Run thread" set; the read fails | skip: unknown |
| "Run thread" set; the thread is missing or archived, or its title differs | stop |
| "Run thread" empty; one exact match | write "Run thread" with its id, then read it back |
| "Run thread" empty; no match; no claimed branch, or one with no commits beyond its base and no pull request | release the claim |
| "Run thread" empty; no match; the branch has commits or a pull request | stop: "work without a thread" |
| "Run thread" empty; more than one match | stop, listing every id |
| No T3 project for the repository | report only |

**Release the claim** makes each write below, reads it back, then makes the next:
1. delete the empty branch, which drops its link;
2. clear "Run phase";
3. clear "Attempt";
4. set Status to "Ready" when it is "In progress";
5. clear "Run thread";
6. remove the agent from the assignees, last.

A wake that dies part-way leaves the agent assigned, so the next Repair continues the release.

**Stop.** Repair and Settle stops have no report line, so they use a second form of [Stop](../../../skills/project-conductor/references/run-github.md#stop):
- the `blocked` label;
- the agent comment `Run stopped by the conductor.\nStep: <Repair | Settle>.\nReason: <reason>.`

Its read-back is the label plus that comment text. Only the `blocked` label suppresses a repeat. A failed write stops that item, not the wake.

### 11. Settle

Settle runs after Repair, under the same Decision 2 condition. It needs no settings. *(My call.)*

**Scope:** each board item with a non-empty "Run thread". That is every open issue, and each closed issue closed in the last 7 days. *(My call: this bounds the cost, and a later thread that was never settled is only cosmetic.)*

1. **Find a merged pull request.** The branch is the thread's `branch` from `t3_thread_read`. It holds even when GitHub dropped the branch link or the branch was deleted on merge.

   Look in two places:
   - `gh api "repos/<repo>/pulls?state=closed&head=<owner>:<branch>"`, reading `merged_at`, `author_association`, `head.repo.full_name` and `user.login`. `gh pr list --json` has no `authorAssociation` field. A lookup error is unknown: skip the item, never read it as "none";
   - the thread's `pullRequests`.

   A pull request without `Closes` is found too. It must have:
   - merged;
   - as head, that branch in `<repo>` itself;
   - an author association of `OWNER`, `MEMBER` or `COLLABORATOR`, or the agent as author.

   No such pull request: nothing.
2. **Read the issue again.** Then, depending on its state:
   - **Closed.** Go on.
   - **Open, merged under 5 minutes ago.** Leave it for the next wake, since GitHub may not have closed it yet.
   - **Open, merged earlier.** One issue, one PR has been broken. Unless the issue already has `blocked`, write the label and the agent comment "merged without closing its issue". Do this before settling.
3. **Settle the thread** with `t3_thread_organize`, unless it is already settled.

Step 2 runs whatever the thread's state. So a wake that died between settling and labelling is finished by the next one. Nothing else on the board changes.

**Why:**
- It reuses T3's own pull-request record, and GitHub confirms it.
- The owner set "1 task = 1 issue = 1 PR", so an open issue after a merge is an exception and is shown at once.

### 11a. 1 task = 1 issue = 1 PR: the implementer's rule

`task-run` gets a generic rule. When the harness's rule delivery exists (harness M2), the rule moves to a per-repository hooked rule at the `superspec` finalize step, as veles's `repo-superspec-closeout.md` does.

1. **The pull request closes its issue.** Its body holds `Closes <owner>/<repo>#<n>`.
2. **Work that does not fit becomes a follow-up task.** When the task's "If it does not fit" rule applies, the implementer creates the follow-up before opening the pull request.
   - **Key:** a new issue whose first line is `<!-- task: <rfc-slug>/<milestone-slug>/<next> -->`, with the current task's prefix. `<next>` is one above the highest number used under that prefix in any issue of the repository.
   - **Body:** the task format, written from what is left, with the current design constraints.
   - **Placement:** the same milestone. It is added to the board from the instruction's new `Board:` line, with Status Backlog. Phase and Area are copied only when the board has the field and the current item has a value.
   - **Links:** it is blocked by the current task. Every issue the current task blocks, the milestone's plan issue included, is also blocked by the follow-up.
   - **Check the links:** read every link back.
   - **Check the key:** read the keys again. If another issue now holds the same key, renumber the new issue's first line once to the next free number. If it collides again, stop and ask the owner.
   - **The pull request** names the follow-up under "Work discovered" and marks the unmet criteria "moved to #<follow-up>".
3. **A failed write stops the task.** The implementer asks the owner in its thread and opens no pull request.

**What changes in `task-run` for this:**
- The "Only the report line" rule is amended to allow exactly these follow-up writes.
- The commands go into `skills/task-run/references/follow-up-github.md`, adapted from `task-publishing`'s blocked-by commands, so `task-run` does not depend on `task-publishing` being installed.
- Both instructions gain the line `Board: <board URL>`.

The agent account writes the follow-up, so a later wake trusts it.

**Scope:** #35 excludes changes to delivery. The owner added this, and the pull request records it.

### 12. End of the board

**The condition.** The board has ended when three things hold:
- every milestone that holds an item of the board, open or closed, is closed;
- at least one such milestone exists;
- no open board issue is assigned to the agent or has a "Run thread" whose thread is not settled.

While any milestone is open, the conductor stays active, even with no open item.

**When it holds:**
1. Start does not run. Advance still runs.
2. After Advance, the wake disables both triggers with `schedule_task`, `enabled: false`, and does not delete them.
3. The report says so, and gives the owner's command to resume after reopening a milestone: "check the triggers".
4. The wake settles its own thread. Settling applies at turn end, after the report. It never archives the thread.

A closed milestone sends no subscribed event, so the timer wake usually finds the end.

### 13. Order of a wake

1. **Preflight:** title, board, readme block, and the facts of each repository.
2. **Decision 2:** title and conductor.
3. **Repair**, then **Settle**.
4. **Read again.** If Repair or Settle wrote anything, read the board again and run the Ready filter again.
5. **The end-of-board check.**
6. **Advance**, then **Start**. Start is skipped at the end of the board.
7. **The trigger check**, only when Decision 9 says so.
8. **The wake report.**

The report gains "Trigger", "Repaired", "Settled" and "Triggers", and drops the line `Repair: not done yet.`.

## Risks / Trade-offs

- **[Anyone who can edit the board can change the models]** → models are still resolved exactly and never substituted; a bad cell stops its step. Trust in the board's editors already covers Status.
- **[The owner holds the webhook secret]** → the conductor never stores or prints it. The owner keeps it, for example in a password manager. If it is lost, a new trigger and every hook are re-registered.
- **[A closed, unmerged pull request wakes the conductor]** → one short wake with nothing to do. This is accepted.
- **[A lost timer goes unnoticed]** → accepted. The owner's check command fixes it.
- **[A release deletes a branch]** → only an empty branch with no pull request. Every other case stops.
- **[The settle window skips old closed items]** → their threads may stay unsettled. That is cosmetic.
- **[Two parallel follow-ups take the same key]** → the new issue reads the keys again and renumbers itself once.
- **[Size]** → about twice the task's M. The owner agreed. The contract change and the new behavior go in separate commits.

## Verification

This is how #35's criteria are proved on the scratch board (project 5, `raidenyn-shadow/task-run-scratch`, where the agent is admin).

- **Repair.**
  - An issue assigned by hand with no thread is released.
  - A thread launched with the launch key and an empty "Run thread" is recorded.
  - A thread whose "Run thread" is set but which has not pushed yet is left alone. This is the case Fable found.
  - Evidence: the board and the thread list before and after.
- **Webhook and timer.**
  - Closing a blocker wakes the conductor through the webhook, and the unblocked task starts.
  - **Lost delivery.** The GitHub hook is set `active: false` (`gh api -X PATCH repos/<repo>/hooks/<id> -F active=false`), a second blocker is closed, and the hook is turned back on. The timer wake then starts the task.
  - Evidence: the run list with each `Trigger:` line.
- **Signature and dedupe.**
  - A delivery signed by GitHub runs.
  - A `curl` delivery with a wrong `x-hub-signature-256` does not run.
  - A redelivery of the same delivery id (`POST repos/<repo>/hooks/<id>/deliveries/<delivery id>/attempts`) does not run again.
  - Two different events inside 120 s show what the coalesce key does.
  - An unmerged pull request close checks the `merged notEquals false` filter (Decision 7).
  - The PR states each result.
- **Settle and end of board.**
  - A test PR merged with its issue left open: the thread is settled and the issue labelled `blocked`. With one issue, one PR this is the exception path.
  - A normal merge: the thread is settled.
  - **Stays active:** after one milestone closes, with open items left in the other one, a timer wake leaves the triggers enabled and the conductor active. Evidence: `list_scheduled_tasks` and the thread state.
  - **Ends:** closing the last milestone of the scratch board disables both triggers and settles the conductor, which is not archived. The board has two milestones, "M1 scratch" and "M1 other", so both must close. Evidence: the same.
- **`line-mcp`.**
  - The owner's command "register the webhook for `raidenyn/line-mcp`" with the scratch URL is refused, because the agent is not an admin.
  - The report holds the owner's steps, and nothing is written.
- **Checks:** `python3 scripts/skills.py validate`, `claude plugin validate .`, `python3 -m unittest discover -s scripts -p 'test_*.py'` and `pnpm run check`. The issue says `npm`, but this repository uses only pnpm.

## Migration Plan

- **Scratch board.**
  - Write the block and onboard the board from a new thread in "No project".
  - The scratch threads still in flight hold the old conductor's id. These are #15, #16 and #17, all assigned with "Run thread" set, and draft PRs #23–#25 from #57.
  - Before the proofs, release them by hand: remove the assignee, clear the run fields and the `blocked` label, close the draft PRs and archive their threads. Otherwise they hold 3 slots against `maxParallel` 2.
  - The PR lists them.
- **`task-run`.** The old wake sentence stays accepted (Decision 6).
- **RFC.** The amendment covers three things:
  - Settings: the board readme block replaces the repository files and `PROJECT_URL`.
  - The model cell format.
  - The conductor serving a board, and Onboarding without `PROJECT_URL` and without a PR.

  The ADR "one conductor thread per board" still stands.
- **Rollback.** Disable or delete both triggers and remove the readme block. Hand-started sessions are not affected.

## Open Questions

- **The `replayKey` template:** how it names the `x-github-delivery` header, and what a constant `coalesceKey` does with a later, different delivery. Settled by the Verification deliveries.
- **Writing the readme:** can the agent account edit the readme of a board the owner owns? If not, writing it is an owner step, as designed.
- **Search and settled threads:** do settled threads count as active for `t3_thread_search`? Checked during the onboarding proof. Decision 2's readme `conductor` key does not depend on it.

## Review log

- **2026-11-26, Fable, three rounds of review** (requested by the owner, at most three).
  - **Round 1: 13 findings, all taken.** The main ones:
    - Repair now trusts "Run thread" over the search.
    - The release order is fixed, and the release clears "Attempt".
    - `t3_thread_search` searches only one project. I checked this live. The readme block therefore holds `conductor`.
    - The owner holds the webhook secret.
    - The board is read again after Repair.
    - The follow-up rule can now be implemented.
  - **Round 2: 7 new findings, all taken.** Multi-repository keys in the scripts, the branch used by Settle, an unattended trigger check, the end condition with runs still in flight, and the Repair edge cases.
  - **Round 3: verdict "ready to plan".** One wrong command (`gh pr list` has no `authorAssociation`) and three minor points were fixed.
