# Start Ready Tasks and Switch Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A woken `project-conductor` claims Ready tasks into free slots and starts one worktree thread per task. That thread, running the new `task-run` skill, plans, reports and is switched once to the coding model with a fresh context.

**Architecture:** Both pieces are prose skills. `SKILL.md` holds the steps and rules. `references/run-github.md` holds the exact `gh`/GraphQL/`jq` commands and the T3 tool calls. The "tests" are the repository validators plus live proofs on the scratch board, saved as evidence files in the change folder.

**Tech Stack:** Markdown skills, `gh` CLI with GraphQL, `jq`, T3 thread tools (`t3_thread_launch`, `t3_thread_configure`, `t3_thread_send`, `t3_thread_read`, `t3_thread_wait`, `t3_thread_search`, `orchestrator_capabilities`).

**Spec:** `openspec/changes/start-ready-tasks-and-switch-models/`: `specs/conductor-wake/spec.md`, `specs/task-run-thread/spec.md`, `design.md`, and `brainstorm.md`, which holds every case.

## Global Constraints

- **Frozen names:** the skill names `project-conductor` and `task-run`; `PROJECT_URL`; the `.agents/harness.json` key `project-conductor` with `maxParallel`, `reviewRounds`, `reconcileMinutes` and `maxAttempts`; `.agents/hooked-rules/repo-run-models.md` with the roles plan, review and implement; the fields "Run phase" (`plan`, `implement`, `closeout`, `care`), "Attempt" and "Run thread".
- **Formats:**
  - launch key: `<owner>/<repo>#<n> attempt <n>`;
  - report line: `phase-done <owner>/<repo>#<n> attempt=<n> phase=<phase> seq=<n> head=<sha>`;
  - wake sentence: `Run one wake of the project-conductor skill for this repository.`
- **The task key** is the whole first line: `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->`.
- **Ready is exactly:** a task in the monitored project (open, keyed issue of the served repository on the `PROJECT_URL` board, Phase not Planning or Outline), no open blocker, and Status "Ready". Nothing else decides readiness. The start guards (not taken, trusted body) are separate.
- **Branch type mapping:** Feature, Foundation, Migration or an empty Phase → `feat`; Refactor → `refactor`; Hardening → `fix`; Spike → `chore`.
- **No changes to** `task-publishing`, `milestone-breakdown`, the `superspec` schema or `src/`. No new dependency. Never edit `skills/*/assets/` by hand.
- **`SKILL.md` stays under about 500 lines.** The description starts "Use when", is at most 1024 characters, and contains no `<` or `>`.
- **Live proofs run only** on `raidenyn-shadow/task-run-scratch` and board project 5 of `raidenyn-shadow`.
- **Commits and the PR title** follow Conventional Commits. PR title: `feat: start Ready tasks and switch models on a phase report`.
- **Model cells** are `<providerInstanceId>/<model id>`. Scratch: plan `claudeAgent/claude-opus-5-5` (`medium`), review `opencode/openai/gpt-6.2-sol` (`medium`), implement `opencode/ollama-cloud/deepseek-v4.1-flash:1017` (`high`).

## Review Focus

- **A board item that is a pull request or a draft:** the filter must skip it and never claim it. This is pinned in Task 3, Step 3.
- **An issue on the board from another repository:** skipped as `other-repo`. Task 3, Step 3.
- **A phase report line with extra spaces or a trailing CR:** it must be parsed or reported as malformed, never half-matched. Task 4, Step 2.
- **A wake that arrives while a previous wake's 5-minute wait is still running:** queue mode serialises them, and the second wake must see the first one's writes. Task 6, Step 4.
- **An issue title made only of symbols or non-Latin text:** the slug becomes empty, and the branch is `<type>/<n>`. Task 3, Step 4.

---

### Task 1: Host proofs and proof ground

**Files:**
- Create: `openspec/changes/start-ready-tasks-and-switch-models/evidence/01-host-proofs.md`
- Create: `openspec/changes/start-ready-tasks-and-switch-models/evidence/02-proof-ground.md`

**Interfaces:**
- Produces, for Tasks 3 to 6: the name of the sender-id field in `t3_thread_read` output (seen during review: `sourceThreadId`, with `messageId`, `position` and `updatedAt`); how the conductor reads its own id (seen: `t3_thread_configure` without `threadId`); whether `clientRequestId` accepts the launch key; which branch path is used, either (A) a worktree on the existing remote branch, or (B) a same-named local branch from `origin/<default>`; the T3 project id of the scratch repository; and the skill install path.

- [ ] **Step 1:** From a scratch thread A, send a message to a scratch thread B. Read B with `t3_thread_read` (`view: activity`). Record the raw item, the field holding A's id, and whether that field is separate from the text. If there is no such field, stop and report under "If it does not fit".
- [ ] **Step 2:** In the same output, record whether each message has a timestamp. Call `t3_thread_configure` with no `threadId` and record whether it returns the caller's id. Launch a probe thread with `clientRequestId` set to a string with spaces, `#` and `/`, and launch again with the same id: record that the second call returns the same thread. Fallbacks: bound the scan by message position; find the conductor's own thread by an exact title search; use the launch key with every character outside `[A-Za-z0-9-]` replaced by `-` as the request id.
- [ ] **Step 3:** Run `gh issue develop <n> --repo raidenyn-shadow/task-run-scratch --name chore/<n>-probe --base main`. Then call `t3_thread_launch` with `workspaceStrategy {type: worktree, baseRef: origin/chore/<n>-probe, branch: chore/<n>-probe, startFromOrigin: true}`. In that thread, run `git rev-parse --abbrev-ref HEAD` and `git rev-parse HEAD`. Expected: the branch name and the remote head. Record whether path A or path B is used. Delete the probe thread, branch and link.
- [ ] **Step 4:** Make the scratch repository a T3 project (`t3_project_list`, then `t3_project_clone` if missing) and record its project id. Copy today's `skills/project-conductor/` into the scratch repository's `.claude/skills/`, which both Claude Code and OpenCode read, and push to `main`. Prove the path: one fresh Claude thread and one fresh OpenCode thread in that project each name `project-conductor` among the skills they can load.
- [ ] **Step 5:** Set project 5's Status options to Backlog, Ready, In progress, In review, Done. Every item already on the board (#1 to #12 from onboarding) ends in Backlog, or is closed or removed, so that only the new test issues can be Ready. Add a single-select field Phase with Spike, Refactor, Foundation, Feature, Migration, Hardening, Outline, Planning. Check with `gh project field-list 5 --owner raidenyn-shadow --format json`: all names exact, and the three run fields present.
- [ ] **Step 6:** In the scratch repository, run `openspec init` with the default schema, and add an `AGENTS.md` that names the process (`openspec-ff-change`, then apply, then a PR). In `repo-run-models.md`, set the three rows to the scratch model cells of Global Constraints. Merge to `main`.
- [ ] **Step 7:** Create these issues in a marked milestone and put them on the board. All except K are keyed by the onboarding rules:
  - R1, R2, R3: Ready, Phase Feature;
  - K: keyless, Ready;
  - C: Backlog, with a body `**Ready to start when:** owner signs off`;
  - L: Ready, with a linked branch;
  - E: Ready, to be edited by `raidenyn`.

  Create R1, R2 and R3 first, so they have the lowest numbers, and the slots go to them even when E stays trusted because the owner did not edit it.

  Invite `raidenyn` with write access (`gh api -X PUT repos/raidenyn-shadow/task-run-scratch/collaborators/raidenyn -f permission=push`). Ask the owner to accept the invite, then check that `gh api repos/raidenyn-shadow/task-run-scratch/collaborators/raidenyn/permission --jq .permission` prints `write`. Then ask the owner to edit E's body. If they do not, mark the case "not done". Record every issue number in `evidence/02-proof-ground.md`.
- [ ] **Step 8:** Commit with `git commit -m "docs: record host proofs and scratch proof ground"`.

### Task 2: Conductor preflight and model resolution

**Files:**
- Create: `skills/project-conductor/references/run-github.md`, sections `## Preflight`, `## Models`

**Interfaces:**
- Consumes: Task 1's proof results.
- Produces: the section anchors `#preflight` and `#models`, and the values the wake later uses: the variables `<repo>`, `<default>`, `<board owner>`, `<n>`, `<agent>`, `<conductor id>`, `maxParallel`, `<plan model>`, `<implement model>`.

- [ ] **Step 1:** Write `## Preflight`. It covers:
  - `PROJECT_URL` through `gh variable get`;
  - `harness.json` and `repo-run-models.md` through `gh api repos/<repo>/contents/<path>?ref=<default>`, decoded;
  - the board fields through `gh project field-list`, with an exact-name check of the options listed in the spec requirement "Settings and board preflight";
  - `gh label create blocked --repo <repo> --color B60205 --description "Waiting for the owner"`, run only when `gh label list` lacks it.

  Each failure line names its owner step.
- [ ] **Step 2:** Write `## Models`. It covers: splitting the cell at the first `/` into `providerInstanceId` and model id; `orchestrator_capabilities` with `search: <model id>`; an exact id match in that instance; picking the one option whose values include the Effort (`effort`, `variant` or `thought_level`); building `modelSelection {instanceId, model, options}`; and the report line for a bare name, no match or an unsupported effort. Only plan (for Start) and implement (for Advance) are resolved. Check it on the three scratch cells, and on `Opus-5.5`, which must be reported as bare.
- [ ] **Step 3:** Verify on the scratch repository by running each preflight command by hand. Expected: all values are read and the board passes the name check. Then rename option "Ready" to "Ready2" on a copy of the field list in a `jq` dry run and confirm the check fails. Restore it.
- [ ] **Step 4:** Commit with `git commit -m "feat: add conductor wake preflight"`.

### Task 3: Board query, Ready filter and claim

**Files:**
- Modify: `skills/project-conductor/references/run-github.md`, sections `## Board`, `## Ready filter`, `## Claim`, `## Instructions`

**Interfaces:**
- Consumes: the preflight variables.
- Produces: `<work>/board.json` and its filter output, one line per item: `<issue> start` or `<issue> skip <reason>`. The reasons are `not-task`, `plan-item`, `planning`, `outline`, `other-repo`, `closed`, `blocker-open`, `not-ready`, `waiting-for-ready`, `taken:<what>`, `untrusted`, `overflow:<list>`. This task also produces the start instruction text and the claim commands.

- [ ] **Step 1:** Write the paginated GraphQL query in `## Board`, over `items(first: 50, after: $cursor)`. Its root is `user(login:)` or `organization(login:)`, as `PROJECT_URL` says, then `projectV2(number:)`. It reads, per item:
  - the item `id`, which `gh project item-edit --id` needs, and the content type;
  - for an Issue: `number`, `state`, `repository.nameWithOwner`, `body`, `assignees(first: 10){totalCount nodes{login}}`, `labels(first: 20){totalCount nodes{name}}`, `blockedBy(first: 50){totalCount nodes{number state stateReason}}`, `linkedBranches(first: 10){totalCount nodes{ref{name}}}`, `closedByPullRequestsReferences(first: 10, includeClosedPrs: true){totalCount nodes{number isCrossRepository authorAssociation author{login}}}`, `userContentEdits(first: 100){totalCount nodes{editor{login} deletedAt}}`, `author{login}`;
  - the field values Status, Phase, "Run phase", "Attempt" and "Run thread".

  It loops on `pageInfo.hasNextPage`. Run it on project 5 and save the output to `evidence/03-board.json`.
- [ ] **Step 2:** For the `taken:pr` check, decide inside the filter: a closing pull request makes the item taken when `isCrossRepository` is false, or `authorAssociation` is `OWNER`, `MEMBER` or `COLLABORATOR`. A fork pull request by anyone else is ignored. Blockers' `stateReason` is read but not used; say so in the reference.
- [ ] **Step 3:** Write the `jq` filter in `## Ready filter`. It first decides **Ready**, and only from these facts: content is an Issue (else `not-task`); same repository (else `other-repo`); open; a task key (a plan marker gives `plan-item`), and Phase not Planning or Outline; no open blocker (else `blocker-open`); Status "Ready" (else `not-ready`, or `waiting-for-ready` when Status is Backlog and the body matches the `hasStartCondition` pattern of `scripts/project-ready.mts:36`). On a Ready item it then applies the start guards: overflow, taken, trust. It never looks at the `blocked` label or a blocker's close reason. Add a case of its own: a Ready task whose only blocker was closed as not planned is `start`. Run it on `evidence/03-board.json`. Expected: R1, R2 and R3 are `start` and no other item is (E is also `start` in the "not done" case), K is `not-task`, C is `waiting-for-ready`, L is `taken:branch`, E is `untrusted` (or "not done" if the owner did not edit it), and a draft item is `not-task`. Save the output to `evidence/04-filter.txt`.
- [ ] **Step 4:** Write `## Claim`:
  - the re-read of one issue, with the same fields plus the edit ids;
  - the exact launch-key title check through `t3_thread_search`;
  - the writes, in the order of the spec requirement "Claim order": `gh issue edit --add-assignee`, `gh project item-edit` for Status, Attempt and Run phase, `gh issue develop`, `t3_thread_launch` with `clientRequestId` set to the launch key (or its sanitised form, if Task 1 chose that fallback) and the worktree path from Task 1, and Run thread;
  - each write followed by its read-back;
  - the slug rule: `ascii_downcase | gsub("[^a-z0-9]+";"-") | .[0:40] | gsub("^-+|-+$";"")`, with an empty slug giving `<type>/<n>`.
- [ ] **Step 5:** Write `## Instructions`, holding the start instruction verbatim. It names the `task-run` skill, the issue URL, the launch key, the attempt, the branch, the conductor id, and the report line with `head=<sha of your pushed commit>`, followed by the wake sentence.
- [ ] **Step 6:** Commit with `git commit -m "feat: add conductor board filter and claim"`.

### Task 4: Advance

**Files:**
- Modify: `skills/project-conductor/references/run-github.md`, sections `## Reports`, `## Switch`, `## Stop`; and `## Instructions`, to add the apply instruction

**Interfaces:**
- Consumes: the sender field from Task 1, and the claim fields.
- Produces: the regex for the report line, the answer names (`finish-switch`, `act`, `not-idle`, `handled`, `stop`, `report-only`), the stop comment format, and the apply instruction text.

- [ ] **Step 1:** Write `## Reports`. It covers reading the conductor's own incoming messages since each claim time (`gh api repos/<repo>/issues/<n>/timeline` for the `assigned` event), the drop of recorded stops, the newest-per-item rule, and the judging order from the spec requirement "Which reports are judged".
- [ ] **Step 2:** Add the regex `^phase-done ([^/ ]+/[^# ]+)#([0-9]+) attempt=([0-9]+) phase=(plan|implement|closeout|care) seq=([0-9]+) head=([0-9a-f]{40})\r?$`. Lines are trimmed first, and any other line containing `phase-done` is `report-only` with the reason malformed. Check the regex against these four inputs: a valid line, a line with a trailing CR, a line with a double space, and a line with a 7-character head. Only the first two must match.
- [ ] **Step 3:** Write `## Switch`. It covers:
  - the answer order of the spec's "Answer order": finish-switch, stop (foreign sender or wrong attempt), handled, act (plan only), not-idle, stop (other mismatch), report-only;
  - the head check, `gh api repos/<repo>/git/ref/heads/<branch> --jq .object.sha`, which must equal `head`;
  - `t3_thread_wait` looped until 300000 ms have passed in total, because it may return early;
  - the change-folder check, `gh api repos/<repo>/compare/<default>...<head> --paginate --jq '.files[] | select(.status=="added") | .filename'`, keeping paths `openspec/changes/<name>/…` where `<name>` is not `archive`, which must give exactly one `<name>`;
  - `t3_thread_configure` with the implement `modelSelection`, where a refusal is `not-idle`;
  - `t3_thread_send` with `mode: queue`, `freshContext: true` and the apply instruction;
  - the "Run phase" implement write and its read-back;
  - the finish-switch check: an apply message for this launch key and head exists in the thread.
- [ ] **Step 4:** Write `## Stop`. It covers `gh issue edit --add-label blocked` and this comment:
  ```
  Run stopped by the conductor.
  Report: <message id> from <sender id>
  > <report line>
  Reason: <reason>. Resume in phase: <Run phase>.
  ```
- [ ] **Step 5:** Add the apply instruction to `## Instructions`, verbatim. It names `task-run`, the phase implement, the issue URL, the launch key, the branch, the head, the conductor thread id and the change folder, with the line "Start from these files; nothing from earlier turns is available."
- [ ] **Step 6:** Commit with `git commit -m "feat: add conductor phase report handling"`.

### Task 5: Skills text

**Files:**
- Modify: `skills/project-conductor/SKILL.md`, the frontmatter description, the intro (lines 8-12), headings that become onboarding-only, and a new `## Run one wake` after `## Onboarding report`
- Create: `skills/task-run/SKILL.md`, through `python3 scripts/skills.py new task-run "<description>"`
- Modify: `.claude-plugin/marketplace.json` (the new `task-run` entry from the script, and the `project-conductor` entry's description) and `README.md` (a new `task-run` row and the `project-conductor` row's text)

**Interfaces:**
- Consumes: the reference sections and anchors from Tasks 2 to 4.

- [ ] **Step 1:** Update the `project-conductor` description so it covers onboarding plus "run one wake: start Ready tasks, handle phase reports, switch a task thread's model". Remove "Not for … running them". Keep it at most 1024 characters, with no `<` or `>`. Rewrite intro lines 10 and 12: the skill now holds two procedures, and the wake's commands are in `references/run-github.md`. Mark `## Inputs`, `## Rules` and `## Report` as applying to "Onboard a board" only, by renaming them `## Onboarding inputs`, `## Onboarding rules` and `## Onboarding report` and fixing every link to them. Update the `project-conductor` description in `marketplace.json` and its README row.
- [ ] **Step 2:** Write `## Run one wake` with:
  - inputs: the wake message and the served repository;
  - `### Before the steps`: preflight and models, linking `references/run-github.md#preflight` and `#models`, and the `blocked` label;
  - rules: no state of its own; act only on the filter's `start`; never substitute a model; one wake at a time;
  - `### 1. Repair`: "Not done yet: the task 'Repair claims, settle merged work and wake on events' adds it. Half-made claims are listed in the report.";
  - `### 2. Advance`: the answers in order, with links to `#reports`, `#switch`, `#stop`;
  - `### 3. Start`: slots, filter, claim, with links;
  - `### Wake report`: a template listing started, not started with reasons, report answers, half-made claims, and gaps.
- [ ] **Step 3:** Run `python3 scripts/skills.py new task-run "Use when a thread was started by the project-conductor with a start instruction or an apply instruction naming task-run: reconcile the task, plan by the repository's process, send the phase report, and after the model switch implement from the saved change folder through to the pull request."`.
- [ ] **Step 4:** Write `skills/task-run/SKILL.md` with the sections `## Start instruction` (reconcile, plan, report, end the turn) and `## Apply instruction` (fresh session, read the change folder, implement by the repository's process, through to the PR). Add the README row.
- [ ] **Step 5:** Run `python3 scripts/skills.py validate && claude plugin validate .`. Expected: 0 errors, and both skills listed.
- [ ] **Step 6:** Commit with `git commit -m "feat: add the conductor wake and the task-run skill"`.

### Task 6: Live proofs

**Files:**
- Create: `openspec/changes/start-ready-tasks-and-switch-models/evidence/05-start.md`, `06-rejections.md`, `07-switch.md`, `08-reports.md`

**Interfaces:**
- Consumes: both skills, and the scratch project and issues from Task 1.

- [ ] **Step 0:** Copy `skills/project-conductor/` and `skills/task-run/` into the scratch repository's `.claude/skills/`, push to `main`, and `git pull` the scratch project checkout. Re-copy after every later skill edit. Prove loading: a fresh Claude thread names both skills, and a fresh OpenCode thread on `opencode/ollama-cloud/deepseek-v4.1-flash:1017`, given an apply instruction for a dummy change, loads `task-run`.

- [ ] **Step 1:** Set `maxParallel` 2 in the scratch settings. Start a conductor thread in the scratch project and send the wake sentence. Expected: two threads, for R1 and R2, each with the assignee, In progress, plan, Attempt 1, the thread id and a linked branch; R3 stays Ready and is reported. Save the board read and the wake report to `05-start.md` (criterion 1).
- [ ] **Step 2:** From the same wake report, save to `06-rejections.md` the lines for K, E, C and L, each reported and not started (criterion 2).
- [ ] **Step 3:** In R1's thread, give the codeword in a planning turn, outside any file. Let planning finish and the report arrive. Then save to `07-switch.md`: the thread's run list (provider and model per run), "Run phase" implement, the first coding turn reading the change folder, and the answer to "what was the codeword?", which must not be the codeword (criterion 3).
- [ ] **Step 4:** Let R2's thread finish planning, with its owner stops answered by the owner, but tell it before its report: "After you send the phase report, run `python3 -c 'import time; time.sleep(540)'` in the foreground with a tool timeout of 600000 ms, in the same turn, then end the turn." Record in the evidence whether `not-idle` came from the 5-minute wait or from a refused switch. Then send these and save each reply and the board after it to `08-reports.md` (criterion 4):
  - R1's report again from R1's thread, with R1 at implement → `handled`;
  - R2's own report, while its turn sleeps → `not-idle`; then a manual wake after the turn ends → `act`, with R2 at implement;
  - a `phase=plan` report for R2 from a separate scratch thread, with R2 at implement → `stop`; R2 gets `blocked`, and a further manual wake adds no second comment;
  - a `phase=plan attempt=2` report from R1's own thread, with R1 at implement and Attempt 1 → `stop`; R1 gets `blocked`.

  Also send a wake during another wake's wait (Review Focus): it runs after the first wake and sees its writes.
- [ ] **Step 5:** Clean up the scratch threads, branches and `blocked` labels, or list what is kept, in `08-reports.md`. `raidenyn` stays a collaborator for later proofs. Commit with `git commit -m "docs: record live proofs of the conductor wake"`.

### Task 7: Checks and PR report

**Files:**
- Modify: `openspec/changes/start-ready-tasks-and-switch-models/tasks.md`, ticked

- [ ] **Step 1:** Run `pnpm install --frozen-lockfile && python3 scripts/skills.py validate && claude plugin validate . && python3 -m unittest discover -s scripts -p 'test_*.py' && pnpm run check`. Expected: every command exits 0 (criterion 5).
- [ ] **Step 2:** Draft the PR body. Among the effects on later tasks, name the model-cell format: onboarding's defaults `Opus-5.5`, `GPT-6.2-Sol` and `DeepSeek` no longer resolve, so a follow-up task updates the onboarding inputs to provider-qualified ids. For each criterion, give its evidence file. List the contracts changed (Run record; Phase report, with `seq` derived), the differences from the task (Ready = Status Ready; npm → pnpm; the Task 1 fallbacks), the effects on later tasks (Repair reads the launch key and the claim order; `line-mcp` needs `project-ready`), and the proposed follow-up tasks.
