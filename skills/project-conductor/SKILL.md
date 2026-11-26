---
name: project-conductor
description: "Use when a GitHub Project board and its repository must be prepared for unattended task runs, for example \"onboard this board\", \"set up the conductor for this repo\" or \"check that the board is ready for the loop\", or when a message asks to run one wake of the conductor: a webhook or timer trigger (Trigger: webhook. or Trigger: timer.), a phase report from a task thread, or a manual wake, for example \"Run one wake of the project-conductor skill for this board.\" Onboarding sets PROJECT_URL, creates the Run phase, Attempt and Run thread fields, proposes the conductor settings and model file, keys the board's open issues and checks the approval rule, with a dry-run form. A wake repairs half-made claims, settles the threads of merged work, answers phase reports and switches a planned thread to the implement model, then claims Ready tasks and launches their threads on the plan model. Also \"check the triggers\" and \"register the webhook for owner/name\". Not for publishing tasks."
---

# Project conductor

The conductor runs the tasks of a GitHub Project board unattended, from Ready to merged. Before it can run a board, the board and the one repository it serves must be prepared.

This skill holds four procedures: **Onboard a board** prepares the board and the repository, **Run one wake** repairs half-made claims, settles merged work, answers phase reports, switches a task thread's model and starts Ready tasks, **Check the triggers** keeps the conductor's webhook trigger and timer as they should be, and **Register the webhook** adds the webhook trigger's URL to one repository. The names below are frozen: the wake reads them.

The onboarding commands are in [references/onboarding-github.md](references/onboarding-github.md), the wake's commands are in [references/run-github.md](references/run-github.md), and the commands of the triggers, the webhooks and the end of the board are in [references/triggers-github.md](references/triggers-github.md). Every step below names the section that holds its commands and the requirement of the spec it meets.

## Onboarding inputs

| Input | Default | Notes |
|---|---|---|
| Board URL | none | `https://github.com/users/<owner>/projects/<n>` or `https://github.com/orgs/<owner>/projects/<n>`. A board named by URL or number is confirmed by that. |
| Repository | none | `owner/name`, the one repository the board serves. |
| Plan model | `Opus-5.5` | Shown in the plan for the person to confirm. |
| Review model | `GPT-6.2-Sol` | Shown in the plan for the person to confirm. |
| Implement model | DeepSeek | The exact model id must be confirmed by the person. Never guess it. An id already in an existing `repo-run-models.md`, on the default branch or on the onboarding branch, counts as confirmed unless the person changes it in the plan. |
| Effort per role | `medium` | Shown in the plan for the person to confirm. |
| Dry run | no | Yes: survey, show the plan and the report, write nothing. |
| Proceed without asking | no | Yes: show the plan and write without waiting for agreement. |

If the board URL or the repository is missing, ask for it before the survey.

## Names this procedure writes

These are frozen. Write them verbatim.

| What | Name and value |
|---|---|
| Repository variable | `PROJECT_URL`, holding the board's URL |
| Board fields | "Run phase" (single select: `plan`, `implement`, `closeout`, `care`), "Attempt" (number), "Run thread" (text) |
| Settings key | `"project-conductor"` in `.agents/harness.json`: `{"maxParallel": 2, "reviewRounds": 5, "reconcileMinutes": 30, "maxAttempts": 2}` |
| Model file | `.agents/hooked-rules/repo-run-models.md`, roles `plan`, `review`, `implement`. Replaces `.agents/hooked-rules/repo-review-models.md` |
| Settings branch | `chore/project-conductor-onboarding` |
| Settings commit and PR title | `chore: onboard project-conductor settings` |
| Task key | `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->`, the first line of the issue body |

A field is never renamed. A released name is never changed.

## Onboarding rules

- **Survey first, then show the plan.** Every run first reads the current state of every step, and writes nothing while it does. Then it shows a plan that marks each item as **create**, **change** (a write over an existing value, such as a different `PROJECT_URL`), **reuse** or **cannot do**, with the reason and, for cannot do, the owner's exact step. Show every file and body that would change as its full content or a diff. (Spec: Survey before any write.)
- **Wait for agreement.** Write only after the person agrees to the plan. When the person said to proceed without asking, show the plan and write at once, except for what needs their choice: an implement model id that is neither given nor in an existing `repo-run-models.md`, and edits to files that refer to the old roster. Those new choices are left out of this run and reported. What an earlier, approved run already put on the onboarding branch is not a new choice: it stays planned, so a repeated run reuses it instead of calling it a conflict. (Spec: Survey before any write.)
- **Agreeing to part of the plan.** The person may drop items from the plan. A dropped item is not written; list it under Pending as "<item>: dropped by the person". Write the rest as planned. (Spec: Survey before any write.)
- **A dry run writes nothing.** It stops after the plan and prints the report, with every owner step and the exact commands. Nothing on GitHub changes: no variable, field, file, branch, pull request or issue. Reading into a local clone in the scratchpad is allowed. (Spec: Survey before any write.)
- **Look before every write.** Read the thing again just before writing it. If it changed since the survey, do not write it: report it. A step that already holds the planned value is reused. A run right after a completed run writes nothing. (Spec: Report and repeatability.)
- **Change only what this procedure manages:** the variable `PROJECT_URL`, the three fields and the missing options of "Run phase", the two settings files, and the first line of keyless issue bodies. Keep every other key, option, field, file and byte.
- **Delete nothing,** except `repo-review-models.md` when it is replaced. Delete that only when no other file refers to its path, or when the person agreed in the plan to edit those references in the same pull request. (Spec: Model file; References to the old roster.)
- **Trusted input.** Key an issue only when its author and every editor of its body are the agent account or the repository owner. When the edit history cannot be read completely, has more pages, holds a deleted edit, or names an editor or author that cannot be identified, or the query returns an error, the issue is untrusted. When authorship cannot be read, the answer is no. (Spec: Only trusted bodies are keyed.)
- **One onboarding per repository at a time.** Do not start a run for a repository while another run for it is in progress, in this session or another one you know of.
- **A failed step does not stop the run.** Report the failure with the owner's step, and go on with the next step. One exception: the keying step stops whole, writing no further key, on a duplicate key or on a list that could not be read to its end. Steps already written stay written.
- **Never retry a refused write another way.** When the agent cannot set the variable or create a field, print the owner's exact command. Do not try another API or account.
- **English by default.** Write in another language only when the person explicitly asks.

## Onboard a board

Run the seven steps in this order. Survey all of them first (each step's "Survey" part), show the plan, then write (each step's "Write" part) in the same order, and end with the report.

### 1. Preflight

Reference: [Preflight](references/onboarding-github.md#preflight). Spec: Skill and procedure exist; Survey before any write.

Survey:

- `gh` is logged in and the token has the `project` scope.
- The agent's login, from the token. The repository owner's login, the default branch, and the agent's `admin` and `push` permissions on the repository.
- The board can be read by its explicit number and owner, and its URL and id are known.

If `gh` is not logged in, the scope is missing, the repository cannot be read or the board cannot be read, stop the run and give the person the fix. Without `push`, the settings pull request and the keys are cannot do: say so in the plan. Without `admin`, the variable is an owner step (step 2).

Preflight writes nothing.

### 2. `PROJECT_URL`

Reference: [Repository variable](references/onboarding-github.md#repository-variable). Spec: Repository variable; Survey before any write.

Survey: read the repository's variables.

| Found | Plan |
|---|---|
| `PROJECT_URL` holds the board's URL | reuse |
| absent, and the agent is admin | create |
| a different value, and the agent is admin | change: show the old and the new value |
| the agent is not admin | cannot do: owner step, the exact `gh variable set` command with the real board URL |
| the variables cannot be read | the value is "unknown, owner checks". With admin, read again just before the write; a value read then decides create, change or reuse as above. If the second read fails too, or without admin: owner step as above, and no write |

Write: only when the agent is admin. Read the variable again, then set it. If setting it fails, do not retry another way: print the exact command for the owner.

### 3. Fields

Reference: [Fields](references/onboarding-github.md#fields). Spec: Run fields on the board; Field names match exactly.

Survey: read every field of the board with its type and, for single-select fields, its options with id, color and description.

| Found | Plan |
|---|---|
| a field with the exact name, case included, and the right type | reuse |
| "Run phase" without some of `plan`, `implement`, `closeout`, `care` | change: add the missing options, keeping every existing option and its id |
| a field with the exact name and another type | cannot do: report it, leave it unchanged |
| a field whose name differs only in case, such as "Run Phase" | cannot do: owner step. Do not reuse it and do not create a competing field |
| no field with that name in any case | create |

An option of "Run phase" whose name differs from a planned one only in case is an owner step too; no option is added beside it.

Write: read the fields again, then create each missing field and add missing options. Read them back.

### 4. Settings pull request

Reference: [Settings pull request](references/onboarding-github.md#settings-pull-request) and [The model file](references/onboarding-github.md#the-model-file). Spec: Settings key in harness.json; Model file; References to the old roster; Settings go through one pull request; Reuse of the onboarding pull request; Completing a partial onboarding pull request.

Survey:

1. Read `.agents/harness.json`, `.agents/hooked-rules/repo-run-models.md` and `.agents/hooked-rules/repo-review-models.md` from the default branch, and the state of branch `chore/project-conductor-onboarding` and of every open pull request from it.
2. **Harness key.** Parse `.agents/harness.json` as JSON. If it is not valid JSON, this step stops: report it as cannot do, and propose neither file. Plan the key `"project-conductor"` with the frozen value; keep every other key, their order and the file's indentation. A file that is absent is created with only that key. When the default branch already holds the key with that value, the key is reused.
3. **Model file.** Build `repo-run-models.md` from the template in the reference, with the confirmed models.
   - `repo-review-models.md` exists: search the repository for references to its path. A reference outside the file itself defers the roster migration: `repo-run-models.md` is not proposed, the old file stays, and the references are an owner step. The person can agree in the plan to edit those references in the same pull request; then the migration goes ahead and the edits are part of it. Without deferral, the new file carries the old file's reviewer table and presets unchanged, and the old file is removed in the same commit.
   - Only `repo-run-models.md` exists: it is the source of its own triggers, reviewer presets and models. Show its models as the ones to confirm; confirmed, the planned content equals the file, so it is reused and nothing is proposed. The file changes only when the person picks other models in the plan.
   - Neither exists: propose `repo-run-models.md` with the role table only.
   - The implement model id is not confirmed: it is neither given by the person nor in an existing `repo-run-models.md` on the default branch or the onboarding branch. Then the model file is cannot do in this run. The harness key goes ahead.
   - **Unattended carry-over.** When the person said to proceed without asking, a model file or reference edit that would be left out only because it needs their choice stays planned when the onboarding branch already holds it: the earlier run's approved plan made that choice. Plan it with the branch's model ids and the same reference edits, so the branch's content is the planned content.
4. **Expected changes.** From the plan, list each planned path with its status against the default branch: `.agents/harness.json` modified or added, `repo-run-models.md` added (or modified), `repo-review-models.md` removed, each agreed reference edit modified.
5. **Existing branch and pull request.** Compare what the branch holds with the expected changes, at one head commit, as the reference describes:

| Found | Plan |
|---|---|
| nothing to change: the default branch holds the planned content | reuse, no branch or pull request. An open onboarding pull request left over is reported for the owner to close |
| no branch | create: one commit and one pull request |
| an open pull request from the branch to another base, or from a fork | cannot do: conflict, report it |
| the branch's changes and contents equal the expected ones | reuse the branch, and its pull request (open one if none is open) |
| the branch's changes are a strict subset of the expected ones, each equal to its planned content, and the roster swap is either whole or absent on it | change: one more commit on the same branch adding the rest |
| anything else, such as a change to another file, other content, or only one half of the roster swap (the added `repo-run-models.md` without the removal of `repo-review-models.md`, or the other way round) | cannot do: conflict, report it, do not push. The add and the removal must be in one commit |

Write: as the reference describes, through a local clone in the scratchpad, never with force. Before reusing as is, check the pull request's head is still the commit you compared. The pull request's body lists its current changes: after completing a partial branch, replace the body; when reusing an open pull request whose body differs from the planned one, plan the body as change and replace it. Merging the pull request is the owner's step: report it.

### 5. Keys

Reference: [Keys](references/onboarding-github.md#keys). Spec: Missing task keys are added; Malformed markers; Which board items are keyed; Slugs and numbers of a new key; Only trusted bodies are keyed; Re-check before keying.

Survey:

1. Read every item of the board, page by page, to the end. If a page fails, stop the keying step. Keep only open issues of the repository. Pull requests, draft items and issues of other repositories are never keyed.
2. Take each issue's first line, the whole line, a CR at its end tolerated:
   - a full task key `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->` or a full plan marker `<!-- plan: <rfc-slug>/<milestone-slug> -->`: **identified**, left unchanged;
   - matches `^\s*<!--\s*(task|plan):` (leading spaces or no space allowed) but is not the exact marker form: **malformed**, reported, left unchanged;
   - anything else: **keyless**.
3. Read every task key in the repository, open and closed, on and off the board, every page. A key held by two issues stops the keying step: report both.
4. For each keyless issue, find its slugs. `<rfc-slug>` comes from the board readme's marker `<!-- rfc: <rfc-slug> -->`. `<milestone-slug>` comes from the marker `<!-- rfc: <rfc-slug>/<milestone-slug> -->` in the description of the issue's milestone. No readme marker, no milestone, no marker in the milestone, or an RFC slug in the milestone that differs from the readme's: no key, reported with the reason.
5. Check trust for each keyless issue (see [Onboarding rules](#onboarding-rules)). Untrusted: no key, reported with the reason.
6. Allocate the numbers in one pass, in ascending issue number: for each prefix `<rfc-slug>/<milestone-slug>`, start from the highest number used under it in any issue of the repository, open or closed, and give each issue the next one. Numbers given in one run are distinct.

The plan lists each proposed key with its issue, and every malformed, untrusted and unmarked issue with its reason.

Write, one issue at a time:

1. Read the issue again: its body, its edit ids and their update times, its state, whether it is still on the board, and its milestone. If any of them changed since the survey, skip it and report it.
2. Read the repository's keys again, every page. If another issue now holds the planned key, skip and report it. Never renumber silently. A duplicate key now stops the keying step.
3. Write the key line, a newline, then the body exactly as read in step 1. Read the body back and compare byte for byte. A difference is reported, and the keying step stops.

An existing key never changes.

### 6. Approval rule

Reference: [Approval rule](references/onboarding-github.md#approval-rule). Spec: Approval rule.

Survey: read the rulesets that apply to the default branch, and the branch's classic protection.

| Found | Answer |
|---|---|
| either source requires at least one approving review | yes |
| both sources were read and neither requires one | no: owner step to add a rule, with the repository's rules page |
| any other case, such as classic protection that cannot be read without admin | unknown: owner checks, with the rules page |

This step only reads. It never writes a rule.

### 7. Webhook

Reference: [Webhook](references/onboarding-github.md#webhook). Spec: Webhook step pending.

Do not create a webhook. On every run, list this line under Pending, verbatim:

```text
Webhook: pending. Created by the task "Repair claims, settle merged work and wake on events".
```

## Onboarding report

Every run ends with this report, a dry run included. (Spec: Report and repeatability.)

```markdown
## Onboarding: <repo>, board <board URL>

Mode: <dry run | written after agreement | written without asking>

### Created
- <what, with its link or id>

### Changed
- <what, old value → new value>

### Reused
- <what>

### Pending
- Webhook: pending. Created by the task "Repair claims, settle merged work and wake on events".
- <issues skipped because they changed during the run: keyed by the next run>

### Could not do (owner step)
- <what, why, and the owner's exact command or page>

Approval rule: <yes | no | unknown>
Keys: <n> identified, <n> keyed in this run, <n> without a key (listed above with the reason)

<Nothing changed.>
```

- Every list is printed, with "none" when it is empty.
- Under Created, Changed and Reused, name each item of steps 2 to 5: `PROJECT_URL`, each field and the options added, `.agents/harness.json`, `repo-run-models.md`, the removal of `repo-review-models.md`, the branch, the pull request with its link, and each key with its issue.
- Pending and Could not do are listed on every run, also when nothing changed: the webhook, the unmerged settings pull request ("Merge <PR link>"), a deferred roster migration with each reference, the variable command, a case-only field collision, a field of the wrong type, the approval rule when it is not "yes", every plan item the person dropped, and every open issue without a key with its reason (malformed, untrusted, no marked milestone, RFC slugs differ, changed during the run, key taken meanwhile).
- In a dry run, the plan's creates and changes are listed under Pending as "would create" and "would change".
- End with the line `Nothing changed.` exactly when the run made no successful write. A dry run always ends with it. A run that wrote anything never does.

## Run one wake

One wake runs four steps once. All commands are in [references/run-github.md](references/run-github.md). (Spec: Wake procedure exists; Wake order.) The order:

1. [Before the steps](#before-the-steps): preflight and the identity check. An identity failure ends the wake here, with the report.
2. [Repair](#1-repair), then [Settle](#2-settle). Both run also when the settings block has a gap.
3. [Read again](#after-settle) when Repair or Settle wrote anything.
4. The [end-of-board check](references/triggers-github.md#end-of-the-board).
5. [Advance](#3-advance), then [Start](#4-start). Neither runs when the settings block has a gap, and Start is skipped at the end of the board.
6. The [automatic trigger check](references/triggers-github.md#automatic-check), only when its condition holds.
7. The [wake report](#wake-report).

### Wake inputs

| Input | Notes |
|---|---|
| The wake message | A message to the conductor thread that ends with the sentence "Run one wake of the project-conductor skill for this board." The old sentence "…for this repository." is accepted the same way. It may start with one `Trigger: webhook.` or `Trigger: timer.` line, or with one phase report line. A message with only the sentence is a manual wake. |
| The board | From the conductor thread's own title, `project-conductor <board URL>`. It is never taken from the message. |
| The repositories | Each board item's own repository, `content.repository.nameWithOwner`. A wake has no served repository: every command for an item uses that item's repository and that repository's T3 project. |

(Spec: Wake message.)

### Before the steps

Reference: [Preflight](references/run-github.md#preflight), [Models](references/run-github.md#models) and [Board](references/run-github.md#board). Spec: The wake checks its own identity; Settings and board preflight; Models are resolved, never substituted; Board read in one query.

1. **Identity.** Read the agent's login, this thread's own id and its title, as in [Identity](references/run-github.md#identity). The title must be exactly `project-conductor <board URL>`; the board comes from it.
2. **Board.** Read the board's fields, names matched exactly, case included. Then read every page of the board once, into one file, with the board readme, as in [Board](references/run-github.md#board). A failed page means Advance and Start write nothing, and the report names the gap; a partial board is never judged.
3. **Settings block.** Parse the block after `<!-- project-conductor -->` in the board readme, as in [Settings block](references/run-github.md#settings-block). A missing number takes its default. An unknown or repeated key, a number that is not a positive integer, `reconcileMinutes` outside 1 to 1440, a missing `conductor`, no fenced block or two markers is a settings gap.
4. **Identity, second half.** The block's `conductor` must equal this thread's id. When it does not, or the title does not have the exact form, the wake writes nothing at all, Repair and Settle included, and the report gives the fix: rename the thread, or correct the block, naming the thread the block names.
5. **Repositories.** For each repository of the board, read its default branch, the agent's permission and its one T3 project, matched by `canonicalKey` without case, as in [Repositories](references/run-github.md#repositories).
6. **Ready filter.** Run the [Ready filter](references/run-github.md#ready-filter) on the board read once. Advance and Start both use the board read and the filter's lines.
7. **Models.** Resolve only the role a step uses: plan for Start, implement for Advance, never review. A missing line, a bare name, no match or an unsupported effort stops that step only, and is reported with the line as written in the block.

Run every read, so one report lists every gap. A wake-wide gap (`gh` login or scope, a board field or option, a failed board read, or a settings block gap) means Advance and Start write nothing in this wake, while Repair and Settle still run; the report names it with the owner's step. A finding of step 5 is per repository, never wake-wide: it stops only the starts of that repository's items, which are reported, and other repositories go on. A failed T3 project list stops Start only, since no task can be launched without a project; Advance goes on. Preflight writes nothing. The label `blocked` is created in a repository only when a stop there first needs it, as [The label `blocked`](references/run-github.md#the-label-blocked) says; when it cannot be created, the stops in that repository are reported for the owner, never written. (Spec: Stop label exists.)

### Wake rules

- **No state of its own.** The wake keeps nothing between wakes. Everything it needs is on the board, in its readme, on the issues and in the threads, and it reads it again on every wake. The files in `<work>` are for this wake only.
- **Name every item with its repository.** Every file and verdict of the wake is keyed by `<repo>#<n>`, never by the issue number alone: two repositories of the board may both have an issue 5.
- **Act only on the filter's `start`.** The [Ready filter](references/run-github.md#ready-filter) prints one verdict per item. Start claims only the items it prints `start` for. Never start an item from your own reading of the board, and never start a `skip`.
- **Never substitute a model.** Use exactly the resolved `model.<role>` line of the board readme block. No other model of the provider, no model of the conductor's own thread and no other effort. A role that does not resolve stops its step.
- **One wake at a time.** Do not start a wake while another wake of this conductor is in progress.
- **Read back every write.** Write in the order the reference gives, and read each write back before the next. A failed write or read-back stops that item, never the wake; the writes that completed stay and are reported.
- **English by default.** Write in another language only when the person explicitly asks.

**Ready is exactly three conditions:** the item is a task in the monitored project (an open issue of any repository, on the conductor's board, whose whole first line is a task key and whose Phase is not Planning or Outline), it has no open blocker, and its Status is "Ready". Nothing else decides readiness. A Ready item whose repository has no T3 project is `no-project:<repo>`, and one whose repository has several is `gap:projects:<repo>`: neither is started. The start guards are separate and apply only to a Ready item: the read returned every entry (no overflow), it is not taken, and its body is trusted, by its author and editors being the agent or the owner of that issue's repository. (Spec: Ready rule; Items that are not tasks; Taken items are left alone; Trusted issues only.)

### 1. Repair

Reference: [Repair](references/run-github.md#repair), [Release](references/run-github.md#release) and [Stop without a report](references/run-github.md#stop-without-a-report). Spec: Repair half-made claims; Release order.

Repair runs first in every wake that passes the identity check, also when the settings block has a gap.

1. **Scope.** Each open board issue whose whole first line is a task key, that is assigned to the agent or has a non-empty "Run thread". An issue labelled `blocked` is skipped whole and listed: no record, no release, no stop.
2. **Find the thread** by the launch key `<repo>#<issue> attempt <Attempt, or 1 when empty>`. With "Run thread" set, `t3_thread_read` on that id decides. With it empty, `t3_thread_search` in the repository's T3 project with `limit` 50 decides, titles compared exactly. A read error, a search error or 50 matches is unknown: skip and report. Only an explicit `thread_not_found` is missing. A repository with no T3 project, or several, is reported only: never searched without a `projectId`, released or stopped.
3. **Decide,** as the [table](references/run-github.md#decide) says:
   - a live thread with the launch key as title needs nothing;
   - a missing or archived thread, or another title, is a stop;
   - one exact match is recorded in "Run thread" and read back;
   - several matches is a stop, and so are several linked branches, whatever "Run thread" holds;
   - no match releases the claim when there is no claimed branch, or the branch has no commits beyond its base and no pull request; a branch with work is a stop, "work without a thread".
4. **Release** in six writes, each read back: delete the empty branch, clear "Run phase", clear "Attempt", Status "Ready" when it is "In progress", clear "Run thread", and remove the agent from the assignees, last. A wake that dies part-way leaves the agent assigned, so the next Repair finishes it.

A stop writes the label `blocked` and the comment of [Stop without a report](references/run-github.md#stop-without-a-report) with `Step: Repair.`. Every item gets one line in `<work>/repair.tsv`. A failed write stops that item, never the wake.

### 2. Settle

Reference: [Settle](references/run-github.md#settle). Spec: Settle merged work.

Settle runs after Repair, under the same identity check, also when the settings block has a gap.

1. **Scope.** Each board issue with a non-empty "Run thread" that is open, or was closed in the last 7 days.
2. **The branch** is the thread's `branch` from `t3_thread_read`. A thread with no branch is skipped and reported.
3. **The merged pull request,** looked for on GitHub by that branch and in the thread's `pullRequests`. It counts only when it merged, its head is that branch in `<repo>` itself, and its author is the agent or has the association `OWNER`, `MEMBER` or `COLLABORATOR`. A lookup error is unknown: skip the item. None: nothing.
4. **Read the issue again.** Closed: settle. Open, merged less than 5 minutes ago: leave it to the next wake. Open, merged earlier: unless it already has `blocked`, write the label and the comment with `Step: Settle.` and the reason "merged without closing its issue", before settling.
5. **Settle the thread** with `t3_thread_organize`, unless it is already settled. Step 4 runs whatever the thread's state.

Every item gets one line in `<work>/settle.tsv`.

### After Settle

Reference: [Read again](references/run-github.md#read-again) and [End of the board](references/triggers-github.md#end-of-the-board). Spec: Board read again after Repair and Settle; Wake order.

1. **Read again.** When `<work>/wrote` exists, Repair or Settle wrote something: read the board again and run the Ready filter again. Advance and Start judge the new read, so a released item that is Ready can start in the same wake.
2. **End of the board.** Run the [end-of-board check](references/triggers-github.md#end-of-the-board). When it holds, Advance still runs, Start does not, and the triggers are disabled after Advance.

### 3. Advance

Reference: [Reports](references/run-github.md#reports), [Switch](references/run-github.md#switch) and [Stop](references/run-github.md#stop). Spec: Which reports are judged; Blocked items are not advanced; Answer order; and the requirements of each answer.

Advance runs only when Preflight has no wake-wide gap, the board was read whole and the implement model resolves. It judges the board read again when Repair or Settle wrote.

1. **Collect** the phase reports: lines of incoming messages from another thread, with the sender from host metadata, as in [Collect](references/run-github.md#collect). A `phase-done` line typed by a person is not a report.
2. **Judge** them with the [Judge](references/run-github.md#judge) script: drop the reports whose stop is already [recorded](references/run-github.md#recorded-stops), keep only the newest per item from its "Run thread" for the current "Attempt", and route the rest. An item labelled `blocked` is not advanced: "blocked, waiting for the owner".
3. **Answer** each judged report, one at a time, with the first answer that applies, in this order:
   1. `finish-switch`: a [half-done switch](references/run-github.md#1-a-half-done-switch). Write "Run phase" implement; nothing is switched or sent.
   2. `stop`: a foreign sender or a wrong attempt, whatever the phase.
   3. `handled`: the phase is earlier than "Run phase". Nothing is written or sent.
   4. `act`: a matching plan report on a thread that is idle within 5 minutes. Find the one change folder, switch the model, send the apply instruction, write "Run phase" implement, as in [Act](references/run-github.md#5-act).
   5. `not-idle`: everything for `act` matches, but the thread still runs after [5 minutes](references/run-github.md#4-wait-for-the-thread), or the switch is refused. Nothing is written.
   6. `stop`: another mismatch: `seq`, `head`, a later phase, or no or several change folders.
   7. `report-only`: a malformed line, an issue that is not a task on this board or whose claim is incomplete, or a matching report for a phase other than plan ("not handled in M1"). Nothing is written.

   Every `stop` adds the label `blocked` and the agent comment of [Stop](references/run-github.md#stop). An item that an answer of this wake stopped is not advanced by a later line of the same wake.

### 4. Start

Reference: [Ready filter](references/run-github.md#ready-filter) and [Claim](references/run-github.md#claim). Spec: Ready rule; Items that are not tasks; Waiting for Ready is reported; Trusted issues only; Taken items are left alone; Parallel limit; Look before claiming; Claim order; Start instruction.

Start runs only when Preflight has no wake-wide gap, the board was read whole, the T3 projects were listed, the plan model resolves and the board has not ended.

1. **Filter.** Take the lines of the [Ready filter](references/run-github.md#ready-filter), run on the board read before the steps. It decides Ready by the three conditions, then applies the start guards: overflow, taken, trust. Keep its line for every item: the report gives the reason of each `skip`.
2. **Slots.** Count the items in use and the free slots, as in [Slots](references/run-github.md#slots). Take the `start` items in ascending order of repository, compared without case, then issue number, while a slot is free. A candidate left over stays Ready and is reported.
3. **Look before claiming.** For each candidate, check that its repository's T3 project still exists (`no-project:<repo>` otherwise), read it again and search that project for a thread titled exactly with its launch key, as in [Look before claiming](references/run-github.md#look-before-claiming). Anything changed, a verdict other than `start`, or such a thread: skip it and report it.
4. **Claim.** Write the seven [writes](references/run-github.md#writes) in order, reading each back: assign the agent, Status "In progress", "Attempt" 1, "Run phase" plan, the linked branch, the thread launched on the plan model with the [start instruction](references/run-github.md#start), and "Run thread". A failed write stops this item's claim: report it as a half-made claim, and go on with the next candidate.

### After Start

Reference: [End of the board](references/triggers-github.md#end-of-the-board) and [Automatic check](references/triggers-github.md#automatic-check). Spec: End of the board; Automatic trigger check on a missed event; Wake order.

1. **End of the board.** When the [end-of-board check](references/triggers-github.md#end-of-the-board) held, after Advance: disable both triggers with `schedule_task` `enabled: false`, never deleting them; give the command "check the triggers" in the report to resume after a milestone is reopened; and, as the wake's last tool call, settle this thread with `t3_thread_organize` `settle` and no `threadId`. Never archive this thread. A failed disable leaves the thread unsettled, so the next wake tries again.
2. **Automatic check.** Run the [automatic trigger check](references/triggers-github.md#automatic-check) only when its condition holds: a timer wake whose board shows an issue closed or a pull request merged more than `reconcileMinutes` ago, after the last webhook run (plus 120 s), the last `## Trigger check` report and the newest onboarding report, in a repository not on the newest `Webhook owner steps:` line. It runs [Check the triggers](#check-the-triggers) in its unattended form: it never asks for a secret, and never creates the webhook trigger. It never runs in a webhook wake, a manual wake or a wake that found the end of the board.

### Wake report

Every wake ends with this report, a wake with nothing to do included. (Spec: Wake report.)

```markdown
## Wake: board <board URL>

Trigger: <webhook | timer | manual wake | report line "<line>">

### Repaired
- <repo>#<issue>: <ok | recorded | released | stopped | skip | unknown | report-only | failed>, <detail: the thread id, the writes made, or the reason>

### Settled
- <repo>#<issue>: <settled | already-settled | labelled | wait | none | skip | unknown | failed>, <detail: the thread id, the pull request, or the reason>

### Started
- <repo>#<issue> <title>: thread <threadId>, branch <branch>

### Not started
- <repo>#<issue> <title>: <reason, from the filter's verdict, the slots or the claim's look>

### Report answers
- <repo>#<issue> <message id> from <sender id>: <finish-switch | stop | handled | act | not-idle | report-only | recorded | superseded | blocked>, <reason; for act the thread id and the change folder; for stop the reason and the phase to resume in>

### Half-made claims
- <repo>#<issue>: <the writes that completed, and the write that failed with its error>

### Triggers
- <the state of the triggers when this wake changed or checked them, or "not checked">

### Gaps (owner step)
- <what is missing or invalid, and the owner's exact step>
```

- Every list is printed, with "none" when it is empty.
- The Trigger line names the wake's `Trigger:` line, the phase report line that started it, or a manual wake.
- Under Repaired and Settled, list every line of `<work>/repair.tsv` and `<work>/settle.tsv`, a `skip blocked` item and every issue labelled for a merge that left it open included. Under Settled, `none` lines (no merged pull request) may be left out; say how many.
- Under Not started, list every board item the filter did not print `start` for, with the wording of its reason in [Ready filter](references/run-github.md#ready-filter), and every candidate a slot, the look or the thread search held back. At the end of the board, say that Start did not run.
- Under Triggers, give what the end-of-board step or the automatic check did, as [triggers-github.md](references/triggers-github.md) words it.
- Under Gaps, list every gap of the steps before, every model that did not resolve, a board read that failed, and every stop that was reported in place of being written.
- When nothing was repaired or settled, no item was started and no report was answered, say so above the lists: "Nothing to do in this wake."

## Check the triggers

Reference: [Triggers](references/triggers-github.md#triggers) and [Check the triggers](references/triggers-github.md#check-the-triggers). Spec: Two triggers bound to the conductor; Trigger check.

The owner runs it in the conductor thread with "check the triggers", for example after changing `reconcileMinutes` or reopening a milestone. The automatic check runs its unattended form. It never runs as part of every wake.

1. **Preflight** as a wake: identity, board, settings block, repositories, and the end-of-board condition. An identity failure stops it.
2. **List** this thread's triggers with `list_scheduled_tasks`, passing this thread's `projectId`, and select them by `boundThreadId` and the titles `project-conductor webhook` and `project-conductor timer`.
3. **Compare** them with the two `schedule_task` objects of [Triggers](references/triggers-github.md#triggers) for the current `reconcileMinutes`.
4. **Fix:** update a trigger that differs in place by `scheduledTaskId`, so its URL stays; re-enable a disabled one unless the board has ended; create a missing timer. Create a missing webhook trigger only on the owner's command, with two `request_secret` calls: a `secretRef` for the trigger and a `file` for the hooks. Then the report says that every repository's hook must be registered again with the new URL.
5. **Register the webhook** for each repository the owner names.

It ends with the `## Trigger check` report, whose last line is `Webhook owner steps: <repo>, <repo>` (or `none`), the full list.

## Register the webhook

Reference: [Register the webhook](references/triggers-github.md#register-the-webhook). Spec: Register the webhook for one repository.

Onboarding runs it for each repository of the board; the owner runs it alone with "register the webhook for `<repo>`". Its inputs are the repository, the webhook trigger's URL (from the trigger just created, or pasted from T3's Settings) and the secret through `request_secret` with `delivery: "file"`.

1. **Read the admin permission first.** Without admin, ask for no secret and go to step 3.
2. **With admin,** list the repository's hooks. Reuse the hook whose `config.url` equals the URL and set its events to `issues` and `pull_request`; otherwise create one hook with the URL, the secret, `content_type` `json` and those two events. Read it back.
3. **Without admin, or when a write is refused,** try nothing else. The report gives the owner's steps of [Owner steps](references/triggers-github.md#owner-steps): the webhook settings page, the payload URL, the content type `application/json`, "the secret you gave at onboarding", and the events "Issues" and "Pull requests".

The secret is never printed or stored. A standalone run ends with its report and the `Webhook owner steps:` line, listing every repository whose registration is an owner step after this run.
