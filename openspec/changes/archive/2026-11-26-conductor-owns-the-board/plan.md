# Conductor Owns the Board: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the conductor serves a GitHub Project board from its own T3 thread. The thread needs no repository and keeps its settings in the board readme. Webhook and timer triggers wake it. Each wake repairs half-made claims, settles merged work and ends itself at the end of the board. `task-run` enforces 1 task = 1 issue = 1 PR.

**Architecture:** everything is skill text, prose plus `gh`, `jq` and T3 tool calls, as in #57. No Node tool changes.
- `project-conductor/SKILL.md` holds the procedures.
- `references/run-github.md`, `references/onboarding-github.md` and a new `references/triggers-github.md` hold the commands.
- `task-run/SKILL.md` gains the 1-PR rule, with its commands in a new `references/follow-up-github.md`.
- Proofs run live on the scratch board, and their evidence goes in the change's `evidence/` folder.

**Tech Stack:** Markdown skills, `gh` 2.105+, `jq`, T3 MCP tools (`schedule_task`, `list_scheduled_tasks`, `t3_thread_*`, `t3_project_list`, `request_secret`).

**Spec:** `openspec/changes/conductor-owns-the-board/design.md`, `specs/conductor-triggers/spec.md`, `specs/board-onboarding/spec.md`, `specs/conductor-wake/spec.md`, `specs/task-run-thread/spec.md`.

## Global Constraints

- Frozen names stay verbatim:
  - fields "Run phase" (`plan`, `implement`, `closeout`, `care`), "Attempt", "Run thread";
  - the label `blocked`;
  - the task key `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->`;
  - the launch key `<owner>/<repo>#<n> attempt <n>`;
  - the report line `phase-done <owner>/<repo>#<n> attempt=<n> phase=<phase> seq=<n> head=<sha>`.
- Conductor title: `project-conductor <board URL>`.
- Readme marker: `<!-- project-conductor -->`, followed by one fenced `text` block.
- Block keys and defaults: `conductor`, `maxParallel` 2, `reviewRounds` 5, `reconcileMinutes` 30 (from 1 to 1440), `maxAttempts` 2, `model.plan`, `model.review`, `model.implement`.
- Model cell: `<providerInstanceId>/<model id>#<effort>`, split at the first `/` and at the last `#`.
- Wake sentence: "Run one wake of the project-conductor skill for this board." The old "…for this repository." is still accepted.
- Trigger titles: `project-conductor webhook` and `project-conductor timer`. Prompt first lines: `Trigger: webhook.` and `Trigger: timer.`.
- Webhook signature: header `x-hub-signature-256`, prefix `sha256=`, hex. Coalesce window: 120 s.
- Second Stop comment: `Run stopped by the conductor.\nStep: <Repair | Settle>.\nReason: <reason>.`
- Grace periods: 5 minutes after a merge before calling an open issue a broken rule; 7 days of closed items in Settle.
- No new dependencies. Keep `SKILL.md` under about 500 lines and move long material to `references/`. English by default.
- Commits and the PR title follow Conventional Commits. The contract change goes in its own commit.
- Checks: `python3 scripts/skills.py validate`, `claude plugin validate .`, `python3 -m unittest discover -s scripts -p 'test_*.py'`, `pnpm run check`, `openspec validate conductor-owns-the-board`.

## Review Focus

1. **Two repositories with the same issue number on one board.** Every verdict and file is keyed `<repo>#<n>`, so A#5 is never judged by B#5's facts. Pinned by the fixture test in Task 2.
2. **The readme holds other text, or the block is hand-edited badly** (a repeated key, `reconcileMinutes: 0`, two markers). The block is a gap and never read as defaults, and the rest of the readme is kept byte for byte. Pinned by the fixture test of the block parser in Task 2.
3. **A wake that dies halfway through a release or a settle.** The next wake finishes it, and work is never lost. Pinned by the order checks in Task 3 and the live proof 8.3.
4. **A conductor thread renamed by hand, or a second `/project-conductor` for the same board from another project.** Nothing is written, and the report names the fix. Pinned by Task 8, Steps 2 and 3a.
5. **The owner never adds the hook for a repository where the agent is not admin.** No trigger check runs on every timer wake, and the repository is listed once as an owner step. Pinned by Task 4's exclusion and Task 8, Step 4, which closes an issue in `task-run-scratch-2`.

---

### Task 0: Settle the two trigger fields on a throwaway trigger

**Files:**
- Create: `openspec/changes/conductor-owns-the-board/evidence/00-trigger-syntax.md`
- Modify (only if the results differ from the design): `design.md` Decision 7 and `specs/conductor-triggers/spec.md` "Two triggers bound to the conductor"

**Interfaces:**
- Produces:
  - the exact `replayKey` template string for the header `x-github-delivery`, which Task 4 copies verbatim;
  - whether the filter `body.pull_request.merged` `notEquals` `false` is kept, which Task 4 copies.

- [ ] **Step 1: Create the throwaway trigger.**
  - Launch a scratch thread in "No project", titled `Proof: trigger syntax`, whose prompt makes it create the trigger itself and return the `webhookUrl`. Only the thread itself can bind a trigger to itself.
  - The trigger is a `webhook` trigger with the filters `headers.x-github-event` in `issues`, `pull_request`; `body.action` equals `closed`; and `body.pull_request.merged` `notEquals` `false`.
  - Set `replayKey` to `{{headers.x-github-delivery}}`. If `schedule_task` rejects that template, try `{{ headers['x-github-delivery'] }}`, then `headers.x-github-delivery`, and record which form it accepts.
- [ ] **Step 2: Send five `curl` deliveries.**
  - an `issues` delivery with `action` `closed`, delivery id `d1`;
  - the same delivery again, `d1`;
  - an `issues` delivery with `action` `closed`, delivery id `d2`;
  - a `pull_request` delivery with `action` `closed` and `pull_request.merged` `false`, delivery id `d3`;
  - a `pull_request` delivery with `action` `closed` and `pull_request.merged` `true`, delivery id `d4`.

  Expected: runs for `d1` once, `d2` and `d4`, and none for the repeated `d1` or for `d3`.
- [ ] **Step 3: Record the results.** Write the accepted `replayKey` form and the run count per delivery to `00-trigger-syntax.md`. When the merged filter drops an issue delivery, remove it from the spec and the design, and keep the spec's "otherwise" branch.
- [ ] **Step 4: Clean up.** Delete the trigger with `delete_scheduled_task` and archive the thread.
- [ ] **Step 5:** Commit with the message `test: settle the webhook trigger's dedupe and merged filter`.

### Task 1: Contract amendment

**Files:**
- Modify: `openspec/design/archive/2026-11-unattended-task-runs/rfc-run-board-tasks-unattended.md`, the section `## Amendments` (now "None.")
- Add: `openspec/changes/conductor-owns-the-board/` (already written)

**Interfaces:**
- Produces: amendment `2026-11-26`, which later tasks cite as "RFC amendment 2026-11-26".

- [ ] **Step 1:** Replace "None." with one dated entry. It names:
  - the Settings change: the readme block replaces `PROJECT_URL`, the `harness.json` key and `repo-run-models.md`;
  - the model cell format;
  - the conductor serving a board from any thread;
  - Onboarding without `PROJECT_URL` and without a PR;
  - 1 task = 1 issue = 1 PR.

  The entry links `../../../changes/conductor-owns-the-board/design.md` and names the owner as decider.
- [ ] **Step 2:** Run `openspec validate conductor-owns-the-board`. Expected: no errors (length warnings are acceptable).
- [ ] **Step 3:** Commit.

```bash
git add openspec/design/archive/2026-11-unattended-task-runs/rfc-run-board-tasks-unattended.md openspec/changes/conductor-owns-the-board
git commit -m "docs: amend the unattended-runs RFC so the conductor owns the board"
```

### Task 2: Wake preflight, settings block and per-repository keys

**Files:**
- Modify: `skills/project-conductor/references/run-github.md`:
  - the intro, placeholders, and the sections `## Preflight`, `## Models`, `## Board` and `## Ready filter`;
  - `### Slots` and `### Look before claiming`;
  - `### Writes`, steps 5 and 6;
  - `### The label blocked`;
  - `## Reports`: Collect (the `timeline-$i` files near line 543) and Judge (`--arg repo` near line 646, and `other-repo` and `$verdict["\(.issue)"]` near lines 626 and 650);
  - `## Instructions`.
- Modify: `skills/project-conductor/SKILL.md`, the sections `### Wake inputs`, `### Before the steps` and `### Wake rules`.
- Create: `openspec/changes/conductor-owns-the-board/evidence/fixtures/board-two-repos.json` and `evidence/fixtures/readme-*.md`.

**Interfaces:**
- Consumes: Task 1's amendment, as the reason the wording changes.
- Produces:
  - Placeholders: `<board URL>`, `<board owner>`, `<n>`, `<conductor id>`, `<repo>` meaning **this item's** `owner/name`, and `<project of repo>`, the T3 `projectId` for `<repo>`.
  - Files: `<work>/board.json` (one array, items carry `.content.repository.nameWithOwner`), `<work>/settings.json` (`{conductor, maxParallel, reviewRounds, reconcileMinutes, maxAttempts, model: {plan, review, implement}}`) and `<work>/repos.json` (`{"<repo>": {default, admin, push, owner, projectId}}`).
  - Filter lines: `<repo>#<n> start` or `<repo>#<n> skip <reason>`.
  - Anchors: `#identity`, `#settings-block`, `#repositories`.
  - The verdicts `no-project:<repo>` and `gap:projects:<repo>`, printed by the Ready filter from `repos.json`. Claim checks again.

- [ ] **Step 1: Write the fixtures.**
  - `board-two-repos.json` holds `a/x#5` (Ready, keyed, trusted) and `b/y#5` (Backlog, keyed).
  - `readme-ok.md` has a block among other text.
  - `readme-dup.md` repeats `maxParallel`.
  - `readme-zero.md` has `reconcileMinutes: 0`.
  - `readme-two-markers.md` has the marker twice.
  - `repos-two.json` gives `a/x` and `b/y` one T3 project each.
- [ ] **Step 2: Run the current filter on the two-repo fixture.**

  Run: `jq -r --arg repo a/x --arg agent raidenyn-shadow -f <work>/filter.jq evidence/fixtures/board-two-repos.json`, with `filter.jq` extracted from the current `run-github.md`.

  Expected: both lines start with `5` and do not name the repository, and the second is `5 skip other-repo`. That shows the old behaviour this task replaces.
- [ ] **Step 3: Update the Preflight section.**
  - Add the section `### Identity`: read the own title through `t3_thread_configure` and `t3_thread_read`, check it against the exact title form, and take `<board URL>` from it.
  - Add `### Settings block`: a `jq` parser over `.readme`. It splits on `\n`, takes the lines after the marker between the first opening and closing ```` ``` ```` fence, and splits each line at the first `: `. It writes `settings.json` and prints `gap <reason>` for each gap of `conductor-wake`'s "Settings and board preflight". It always writes `conductor` to `settings.json` when that key appears exactly once, even when there are gaps.
  - Add `### Repositories`: for each `nameWithOwner` in the board read, the default branch and permissions, and the T3 project from `t3_project_list`, with `canonicalKey` compared to `github.com/<repo>` after `ascii_downcase`.
  - Remove `PROJECT_URL`, `gh repo view` and the two settings files.
- [ ] **Step 4: Extend `board.graphql`.** Add the project `readme`; per issue `repository { nameWithOwner owner { login } }`, `milestone { number state }` and `closedAt`; and `mergedAt` in the closing pull requests.
- [ ] **Step 5: Update the Ready filter.**
  - Print `<repo>#<n>`.
  - Take the trust owner from `.content.repository.owner.login`.
  - Delete `other-repo`.
  - Key the files of Judge, Slots and Claim by `<repo>#<n>`. Name the per-item files `claim-<owner>-<name>-<n>.json`.
  - Sort the Slots candidates by repository `nameWithOwner` compared without case, then by issue number, as `conductor-wake` "Parallel limit" says.
  - When a repository has several T3 projects, it is a gap: its items get `skip gap:projects:<repo>`.
  - The filter reads `repos.json`. A Ready item whose repository has no T3 project gets `skip no-project:<repo>`, so it is reported even when no slot is free.
- [ ] **Step 6: Update Models.** The cell is `<instance>/<model>#<effort>` from `settings.json`. Report lines name "the `model.<role>` line of the board readme block".
- [ ] **Step 7: Update Claim.**
  - Search for the thread and launch it with `projectId` set to `<project of repo>`.
  - Claim keeps one guard: if the repository's project is gone at claim time, skip with `no-project:<repo>` before any write.
  - Create the `blocked` label per repository, the first time it is needed.
- [ ] **Step 8: Update the instructions.** Add the line `Board: <board URL>` to Start and Apply, and use the new wake sentence in Start's report lines. Add one sentence to Collect: the old sentence counts the same.
- [ ] **Step 9: Run the filter test again.**

  Run: the new filter on `board-two-repos.json`, with `repos-two.json`.

  Expected: exactly `a/x#5 start` and `b/y#5 skip not-ready`.
- [ ] **Step 10: Run the parser tests.**

  Run: the settings parser on each readme fixture.

  Expected:
  - `readme-ok.md` gives the full `settings.json` with the defaults filled in;
  - each other fixture gives a gap line naming its fault;
  - `readme-dup.md` and `readme-zero.md` still give `conductor` in `settings.json`.
- [ ] **Step 11:** Run `python3 scripts/skills.py validate`. Expected: 0 errors.
- [ ] **Step 12:** Commit with the message `feat: let the conductor wake serve a board across repositories`.

### Task 3: Repair, Settle, and the wake order

**Files:**
- Modify: `skills/project-conductor/SKILL.md`:
  - `### 1. Repair`;
  - a new `### 2. Settle`, with Advance and Start renumbered to 3 and 4;
  - `### Wake report`;
  - the frontmatter `description`.
- Modify: `skills/project-conductor/references/run-github.md`:
  - new `## Repair` (anchors `#repair` and `#release`) and `## Settle` (`#settle`);
  - `## Stop`, which gains `### Stop without a report`.

**Interfaces:**
- Consumes: Task 2's `board.json`, `repos.json` and `<project of repo>`.
- Produces:
  - the files `<work>/repair.tsv` and `<work>/settle.tsv`, one line `<repo>#<n>\t<action>\t<detail>` per item;
  - the sections "Repaired" and "Settled" of the wake report;
  - a flag `<work>/wrote` that is present when Repair or Settle wrote anything.

- [ ] **Step 1: Write the Repair scope selector.** It is a `jq` expression over `board.json`: open, keyed, not `blocked`, and assigned to `<agent>` or with a non-empty "Run thread".

  Test it on a fixture with four items:
  - keyed and assigned: selected;
  - keyless and assigned: not;
  - keyed, `blocked` and assigned: not, but listed;
  - keyed with a "Run thread" and no assignee: selected.
- [ ] **Step 2: Write the decision table.** It covers exactly the rows of the design, Decision 10, plus the spec's row for a repository with no T3 project or with several: report only, never searched without a `projectId`.
  - with "Run thread" set, `t3_thread_read` decides;
  - with it empty, `t3_thread_search` with `projectId` `<project of repo>` and `limit` 50 decides;
  - an error or 50 matches is unknown, and only an explicit not-found is missing.
- [ ] **Step 3: Write the release** as six writes in this order, each with its `gh` command and read-back line:
  1. `gh api -X DELETE repos/<repo>/git/refs/heads/<branch>`, only after two checks: `gh api repos/<repo>/compare/<default>...<branch> --jq .ahead_by` prints `0`, and `gh api "repos/<repo>/pulls?state=all&head=<owner>:<branch>" --jq length` prints `0`;
  2. clear "Run phase";
  3. clear "Attempt";
  4. Status "Ready", when it is "In progress";
  5. clear "Run thread";
  6. `gh issue edit --remove-assignee <agent>`.

  To clear a field, use `gh project item-edit --clear`.
- [ ] **Step 4: Write Stop without a report.** It writes the label and the comment in its exact form. The read-back finds the comment whose body starts with `Run stopped by the conductor.\nStep: `.
- [ ] **Step 5: Write Settle.**
  - The scope: open items, and closed items with `closedAt` in the last 7 days.
  - The branch from `t3_thread_read .branch`. When it is empty, Settle skips the item and reports it, because the API ignores an empty `head` filter.
  - The lookup with `gh api "repos/<repo>/pulls?state=closed&head=<owner>:<branch>" --jq '[.[] | select(.merged_at != null and .head.repo.full_name == "<repo>" and .head.ref == "<branch>")]'`. The author must be the agent or have `author_association` in `OWNER`, `MEMBER` or `COLLABORATOR`. A lookup error is unknown.
  - Read the issue again, then: closed means settle; open and merged less than 5 minutes ago means wait; open and older means label and comment, then settle.
  - Settle the thread with `t3_thread_organize` `settle`, skipped when `settled` is already true.
- [ ] **Step 6: Write the order.**
  - The steps run in this order: identity, Repair, Settle, read again when `wrote` is set, end check (Task 4), Advance, Start, automatic check (Task 4), report.
  - Repair and Settle also run when the settings block has a gap.
  - Advance and Start do not run when it has a gap.
- [ ] **Step 7: Update the wake report.** Add "Trigger", "Repaired", "Settled" and "Triggers", and remove `Repair: not done yet.`.
- [ ] **Step 8: Check the section order.** Run `grep -n '^### [0-9]\. ' skills/project-conductor/SKILL.md`. Expected: `1. Repair`, `2. Settle`, `3. Advance`, `4. Start`, in that order.
- [ ] **Step 9:** Run `python3 scripts/skills.py validate`. Expected: 0 errors. Run `wc -l skills/project-conductor/SKILL.md`. Expected: at most about 500 lines; otherwise move tables to `run-github.md`.
- [ ] **Step 10:** Commit with the message `feat: repair half-made claims and settle merged work in every wake`.

### Task 4: Triggers, webhook registration, the trigger check and the end of the board

**Files:**
- Create: `skills/project-conductor/references/triggers-github.md`, with the sections:
  - `## Triggers` (`#triggers`);
  - `## Register the webhook` (`#register-the-webhook`);
  - `## Check the triggers` (`#check-the-triggers`);
  - `## Automatic check` (`#automatic-check`);
  - `## End of the board` (`#end-of-the-board`).
- Modify: `skills/project-conductor/SKILL.md`, to add the procedures "Check the triggers" and "Register the webhook" and the end-of-board step, each linking its anchor.

**Interfaces:**
- Consumes: `settings.json` (`reconcileMinutes`), `repos.json` (`admin`), the own thread id and `projectId`.
- Produces:
  - the two `schedule_task` argument objects, verbatim;
  - the owner-steps text block for a refused webhook;
  - the report heading `## Trigger check`;
  - a line `Webhook owner steps: <repo>, <repo>`, repeated in every onboarding and check report.

- [ ] **Step 1: Write the trigger calls.** Write the two `schedule_task` calls as JSON with every field of `conductor-triggers`' "Two triggers bound to the conductor":
  - `everyMs` = `reconcileMinutes`*60000;
  - `maxDeliveryAgeMinutes` = `reconcileMinutes`;
  - `replayKey` uses the template string recorded in `evidence/00-trigger-syntax.md` (Task 0);
  - the filters include the merged filter only if Task 0 kept it.
- [ ] **Step 2: Write Register the webhook.**
  1. Read admin.
  2. With admin: `gh api repos/<repo>/hooks --paginate`, then:
     - reuse the hook whose `config.url` matches, and set its events with `gh api -X PATCH repos/<repo>/hooks/<id> -f 'events[]=issues' -f 'events[]=pull_request' -F active=true`;
     - otherwise create one with `gh api -X POST repos/<repo>/hooks -f name=web -F active=true -f 'events[]=issues' -f 'events[]=pull_request' -f 'config[url]=<url>' -f 'config[content_type]=json' -f "config[secret]=$(cat <secret file>)"`.
  3. Without admin, or on a refusal, write the owner-steps text block and nothing else.
  4. End a standalone run with the report line `Webhook owner steps: <repos>`.
- [ ] **Step 3: Write Check the triggers.**
  - `list_scheduled_tasks` with `projectId`, then select by `boundThreadId` and title.
  - Compare with the expected objects.
  - Update a differing trigger by `scheduledTaskId`, re-enable a disabled one, and create a missing timer.
  - Create a missing webhook trigger only on the owner's command, with two `request_secret` calls (`secretRef` for the trigger, `file` for the hooks).
- [ ] **Step 4: Write the automatic check.**
  - The missed-event condition reads the board's `closedAt` and `mergedAt`.
  - It counts only events after the newest onboarding report in this thread, as well as after the last webhook run and the last check.
  - It reads the own thread's messages backwards through `t3_thread_read` with `beforePosition`, and stops at the older of the oldest candidate event and the newest report with a `Webhook owner steps:` line.
  - It applies the 120 s exclusion and the owner-steps exclusion.
  - In its unattended form it never calls `request_secret`.
- [ ] **Step 5: Write the end of the board.**
  - The condition reads the milestone states and the in-flight items from `board.json`.
  - Start is skipped and Advance still runs.
  - After Advance, both triggers get `schedule_task` `enabled: false`.
  - The report gives the command "check the triggers".
  - The own thread is settled with `t3_thread_organize` `settle`, with no `threadId`. It is never archived.
- [ ] **Step 6: Check the links.** Run `grep -o 'triggers-github.md#[a-z-]*' skills/project-conductor/SKILL.md | sort -u` and compare with `grep '^## ' skills/project-conductor/references/triggers-github.md`. Expected: every anchor exists.
- [ ] **Step 7:** Run `python3 scripts/skills.py validate`. Expected: 0 errors.
- [ ] **Step 8:** Commit with the message `feat: wake the conductor from a webhook and a timer and end it with the board`.

### Task 5: Onboarding as the conductor's checklist

**Files:**
- Modify: `skills/project-conductor/SKILL.md`, the sections from `## Onboarding inputs` to `## Onboarding report`.
- Modify: `skills/project-conductor/references/onboarding-github.md`:
  - remove `## Repository variable`, `## Settings pull request`, `## The model file` and both `## Reviewer presets`;
  - replace `## Webhook`;
  - add `## Conductor thread` and `## Settings block`;
  - make `## Keys` and `## Approval rule` work per repository.

**Interfaces:**
- Consumes:
  - from Task 2: the settings block format and the `<project of repo>` lookup;
  - from Task 4: Register the webhook, the trigger calls and the `Webhook owner steps:` line.
- Produces: the onboarding steps 1 to 8 named in design Decision 5, and the onboarding report, which keeps the lists Created, Changed, Reused, Pending and "Could not do", and adds "Triggers" and the `Webhook owner steps:` line.

- [ ] **Step 1: Rewrite the inputs table.** The inputs are the board URL, the three models with their efforts, dry run, and proceed without asking. The Repository input is removed. The implement model must still be confirmed.
- [ ] **Step 2: Write `## Conductor thread`.**
  - The one-conductor check: the block's `conductor` with `t3_thread_read`, and, for every `t3_project_list` id, `t3_thread_search` for the title with an exact compare.
  - The rename with `t3_thread_update` `rename`.
- [ ] **Step 3: Write `## Settings block`.**
  - Read the readme.
  - Plan a create, change or reuse of the block. Valid keys already there are kept as written: add only the missing keys and `conductor`, and change a model only when the owner gives another one in the plan.
  - Write the new readme to `<work>/readme.new` and run `gh project edit <n> --owner <board owner> --readme "$(cat <work>/readme.new)"`. Then read it back and compare it byte for byte outside the block, ignoring the one trailing newline that `$(…)` strips.
  - When the write is refused, the owner step shows the block.
- [ ] **Step 4: Make Keys and the approval rule per repository.** Loop over `repos.json`. The trust owner is each repository's owner.
- [ ] **Step 5: Replace `## Webhook`.** Link `triggers-github.md`.
  - **When the webhook trigger is created:** ask for the secret with `request_secret` (a `secretRef` for the trigger, a `file` for each admin repository), create the triggers, and run Register the webhook for each repository.
  - **On a repeat run** that reuses the trigger: ask for no secret and register no hooks. Carry the `Webhook owner steps:` list from the newest report in this thread, and add the repositories that no report covered.
- [ ] **Step 6: Update the rules and the report.**
  - A dry run notes that steps 2, 6 and 7 need the conductor thread.
  - Delete the PR, variable and roster lines.
  - Add the step "Skills to confirm".
- [ ] **Step 7: Check that the removed steps are gone.** Run `grep -rn 'PROJECT_URL\|harness.json\|repo-run-models\|chore/project-conductor-onboarding' skills/project-conductor/`. Expected: matches only in a sentence that says these are no longer used, or none.
- [ ] **Step 8:** Run `python3 scripts/skills.py validate`, `claude plugin validate .` and `wc -l skills/project-conductor/SKILL.md`. Expected: 0 errors, a valid plugin, and at most about 500 lines.
- [ ] **Step 9:** Commit with the message `feat: onboard a board from the thread that becomes its conductor`.

### Task 6: `task-run`, 1 task = 1 issue = 1 PR

**Files:**
- Modify: `skills/task-run/SKILL.md`: the fields table (add `Board`), the rule "Only the report line", the phase report message, and the apply steps 4 and 5.
- Create: `skills/task-run/references/follow-up-github.md`.

**Interfaces:**
- Consumes: the instruction line `Board: <board URL>` from Task 2.
- Produces: the follow-up key `<!-- task: <prefix>/<next> -->`, and the PR body lines `Closes <owner>/<repo>#<n>` and `moved to #<follow-up>`.

- [ ] **Step 1: Add the rule "One task, one PR".** The PR body holds `Closes <owner>/<repo>#<n>`.
- [ ] **Step 2: Add the rule "Work that does not fit".** It has the steps of `task-run-thread`'s "Work that does not fit becomes a follow-up task", in order. A failed write stops the task and the thread asks the owner.
- [ ] **Step 3: Write `references/follow-up-github.md`.** Each command is followed by its read-back:
  - read every key under the prefix: `gh issue list --state all --search` and the first-line `jq`;
  - `gh issue create --repo <repo> --milestone <m> --body-file`;
  - `gh project item-add <n> --owner <board owner> --url <issue url>`;
  - set Status Backlog with `gh project item-edit`, and copy Phase and Area only when the board has the field and the current item has a value;
  - `gh issue edit <follow-up> --add-blocked-by <current url>`;
  - for each `dependencies/blocking` issue of the current task, `gh issue edit <it> --add-blocked-by <follow-up url>`;
  - read the keys again, and renumber once.
- [ ] **Step 4: Amend "Only the report line"** to allow exactly these writes. Change the phase report to the new sentence, and add `Board` to the fields table.
- [ ] **Step 5:** Run `python3 scripts/skills.py validate`. Expected: 0 errors.
- [ ] **Step 6:** Commit with the message `feat: keep one pull request per task and file the rest as a follow-up task`.

### Task 7: README and checks

**Files:**
- Modify: `README.md`, the `project-conductor` and `task-run` rows.

- [ ] **Step 1: Rewrite the two rows.**
  - The `project-conductor` row covers: a board-owned conductor, the settings in the board readme, the triggers, Repair, Settle and the end of the board.
  - The `task-run` row covers: one PR per task and follow-up tasks.
  - Neither row mentions `PROJECT_URL`.
- [ ] **Step 2: Run the checks.** Run `python3 scripts/skills.py validate && claude plugin validate . && python3 -m unittest discover -s scripts -p 'test_*.py' && pnpm run check && openspec validate conductor-owns-the-board`. Expected: every command exits 0.

  The known timing failure in `tests/agent-harness/opencode-adapter.test.mjs:533` under load is re-run once. If it still fails, it is reported as already failing before this change.
- [ ] **Step 3:** Commit with the message `docs: describe the board-owned conductor in the README`.

### Task 8: Live proofs on the scratch board

**Files:**
- Create: `openspec/changes/conductor-owns-the-board/evidence/01-cleanup.md` to `09-follow-up.md` and `verify.md`.

**Interfaces:**
- Consumes: every earlier task, installed at account level for `claudeAgent` and `opencode`.

  Before the proofs, link the two skill folders of this branch into both account-level folders: `ln -sfn <worktree>/skills/project-conductor ~/.claude/skills/project-conductor`, the same for `task-run`, and the same two into `~/.config/opencode/skills/`. Record the links in `01-cleanup.md`, and remove them after the proofs.

  For the proofs, the scratch board's block sets `reconcileMinutes: 2`, so a timer wake comes every 2 minutes. The value is written into the readme before onboarding (Step 2): onboarding reuses the number already in the block, so the timer is created at 120000 ms.

- [ ] **Step 1: Clean up (8.1).**
  - Release #15, #16 and #17: clear the assignee, the run fields and `blocked`, set Status Backlog, and delete their branches `feat/15…`, `feat/16…` and `feat/17…`.
  - Set #18 (Ready, keyless) to Backlog, so the keys that onboarding adds start nothing.
  - Check that no Ready item is startable. #20 (linked branch), #21 (untrusted) and #22 (open blocker #1) stay Ready on purpose, with these skip reasons. List the board in `01-cleanup.md`.
  - Close the draft PRs #23–#25 without merging, and archive their threads.
  - Check that "Run thread" is empty on all three.
- [ ] **Step 2: Onboard the board (8.2).**
  - In a new thread in "No project", run `/project-conductor https://github.com/users/raidenyn-shadow/projects/5`.
  - Before onboarding, put a block with only `reconcileMinutes: 2` in the readme. Onboarding then plans the change that adds the other keys.
  - Record the plan, the report, the readme diff, the triggers (`list_scheduled_tasks`, timer `everyMs` 120000) and the hook.
  - Then run the same command in a second new thread in another project. Expected: it stops and names the first thread.
  - Run the same command again in the conductor thread. Expected: "Nothing changed.", no `request_secret` card, and the `Webhook owner steps:` line repeated.
- [ ] **Step 3: Repair (8.3).** Pause the timer first (`schedule_task` `enabled: false` on `project-conductor timer`), so that no wake runs while the cases are prepared. Launch each thread before writing its board fields, as a worktree thread on a branch of its own in the `task-run-scratch` project, so it has a `branch`. Prepare three cases:
  - assign #1 by hand with no thread;
  - launch a thread titled `raidenyn-shadow/task-run-scratch#4 attempt 1` with "Run thread" empty on #4, which is claimed by hand;
  - a live thread titled `raidenyn-shadow/task-run-scratch#5 attempt 1`, recorded in "Run thread" of #5, with nothing pushed.

  Send one manual wake. Expected:
  - #1 is released;
  - #4 is recorded;
  - #5 is untouched;
  - the thread list shows no second thread.
  - Afterwards, release #4 and #5 by hand (assignee, run fields, branch) and archive their threads, so that both slots are free for Step 4. Re-enable the timer.
- [ ] **Step 3a: Identity and projects.**
  - Rename the conductor thread to "my conductor" and send a manual wake. Expected: nothing written, and the report asks for the title. Rename it back.
  - Put another thread's id in the block's `conductor` and send a wake. Expected: nothing written, and the report names that thread. Restore the id.
  - Add a keyed Ready issue from a second scratch repository with no T3 project to the board (`raidenyn-shadow/task-run-scratch-2`, created if missing). Expected: `no-project:raidenyn-shadow/task-run-scratch-2` in the report, and no write.
  - Run `/project-conductor https://github.com/users/raidenyn-shadow/projects/5` again in the conductor thread. Expected: a repeat run that adds `raidenyn-shadow/task-run-scratch-2` to the `Webhook owner steps:` line, because no report covered it, and asks for no secret.
- [ ] **Step 4: Webhook and timer (8.4).** Prepare two pairs on the board and in milestone "M1 scratch", written by the agent and keyed:
  - pair A: a blocker `B1` and a task `T1` that is blocked by `B1`, with Status Ready;
  - pair B: a blocker `B2` and a task `T2` that is blocked by `B2`, with Status Ready. `T2`'s body is written so that its "If it does not fit" rule applies, because Step 6 uses it.
  - a keyed Backlog issue `D2` that is blocked by `T2`. Step 6 checks that it is also blocked by the follow-up.

  Both slots are free after Step 3.
  - Close `B1`. Expected: a run with `Trigger: webhook.` starts `T1`.
  - Wait more than 120 s after the `Trigger: webhook.` run, then set the hook `active: false`, close `B2`, then set it back to `active: true`. Expected:
    - the first `Trigger: timer.` run after the close starts `T2`;
    - the first timer run more than 2 minutes after the close shows one automatic trigger check;
    - the timer run after that shows none.
  - Close an issue of `task-run-scratch-2`, whose repository is in `Webhook owner steps:`. Expected: no automatic check for it.
- [ ] **Step 5: Signature and dedupe (8.5).**
  - A `curl` delivery with a wrong `x-hub-signature-256`. Expected: no run.
  - `gh api -X POST repos/raidenyn-shadow/task-run-scratch/hooks/<id>/deliveries/<delivery id>/attempts`. Expected: no second run.
  - Two different events within 120 s: record the number of runs.
  - Close a PR without merging. Expected: as Task 0 decided, no run when the merged filter is kept, or one run that does nothing.
  - Write the results to `05-signature-dedupe.md`.
- [ ] **Step 6: Follow-up (8.8).** Run `T2`, started in Step 4, to its PR. Expected:
  - a new issue keyed `<prefix>/<next>` in Backlog;
  - blocked by the task;
  - `D2`, which the task blocked, is also blocked by the follow-up;
  - the PR body holds `Closes`.
- [ ] **Step 7: `line-mcp` (8.7).** Send "register the webhook for `raidenyn/line-mcp`" with the scratch URL. Expected:
  - a report with the owner steps (URL, events "Issues" and "Pull requests", content type);
  - no `request_secret` card;
  - `gh api repos/raidenyn/line-mcp/hooks` still refused, with nothing created.
- [ ] **Step 8: Settle and the end of the board (8.6).**
  - Merge a test PR with `Closes`. Expected: its thread is settled.
  - Merge a test PR that leaves its issue open, and wait 5 minutes. Expected: `blocked`, the comment, and the thread settled.
  - Close "M1 other". Expected: the triggers stay enabled.
  - Close every issue that has a "Run thread", then "M1 scratch". Expected: both triggers disabled, the conductor settled, `archived` false.
  - Reopen "M1 scratch" and send "check the triggers". Expected: both triggers re-enabled. This proves the resume path.
- [ ] **Step 9: Clean up after the proofs (8.9).** Re-enable the triggers if the owner wants the scratch conductor kept, and record the leftovers in `verify.md`.
- [ ] **Step 10:** Commit with the message `test: record live proofs of the board-owned conductor`.

### Task 9: Pull request

- [ ] **Step 1:** Push the branch and open the PR titled `feat: run the conductor from a board, wake it on events and repair claims`. The body follows tasks.md 9.1 and ends with the attribution line.
- [ ] **Step 2:** Link the PR.
- [ ] **Step 3:** Sync the delta specs and archive the change in the same PR before it is ready (memory: archive in the same PR).
- [ ] **Step 4:** After the sync, rewrite the Purpose sections:
  - in `openspec/specs/board-onboarding/spec.md` and `openspec/specs/conductor-wake/spec.md`, remove `PROJECT_URL`, "the one repository" and "Repair (named, empty for now)";
  - write the Purpose of `openspec/specs/conductor-triggers/spec.md`.
- [ ] **Step 5:** Run `openspec validate --all`, then commit with the message `docs: archive the conductor-owns-the-board change`.
