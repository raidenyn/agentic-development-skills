---
name: project-conductor
description: "Use when a GitHub Project board and its repositories must be prepared for unattended task runs, for example \"/project-conductor\" with a board URL, \"onboard this board\", \"set up the conductor for this board\" or \"check that the board is ready for the loop\", or when a message asks to run one wake of the conductor: a webhook or timer trigger (Trigger: webhook. or Trigger: timer.), a phase report from a task thread, or a manual wake, for example \"Run one wake of the project-conductor skill for this board.\" Onboarding makes its thread the conductor, creates the run fields, writes the settings block into the board readme, keys open issues, checks each repository and creates the triggers, with a dry-run form. A wake repairs half-made claims, settles the threads of merged work, answers phase reports and switches a planned thread to the implement model, then claims Ready tasks and launches their threads on the plan model. Also \"check the triggers\" and \"register the webhook for owner/name\". Not for publishing tasks."
---

# Project conductor

The conductor runs the tasks of a GitHub Project board unattended, from Ready to merged. Before it can run a board, the board and the repositories of its issues must be prepared, from the thread that becomes the board's conductor.

This skill holds four procedures: **Onboard a board** prepares the board, its repositories and the conductor thread, **Run one wake** repairs half-made claims, settles merged work, answers phase reports, switches a task thread's model and starts Ready tasks, **Check the triggers** keeps the conductor's webhook trigger and timer as they should be, and **Register the webhook** adds the webhook trigger's URL to one repository. The names below are frozen: the wake reads them.

The onboarding commands are in [references/onboarding-github.md](references/onboarding-github.md), the wake's commands are in [references/run-github.md](references/run-github.md), and the commands of the triggers, the webhooks and the end of the board are in [references/triggers-github.md](references/triggers-github.md). Every step below names the section that holds its commands and the requirement of the spec it meets.

## Onboarding inputs

The owner types `/project-conductor <board URL>` in a new thread, in any T3 project or in "No project". Onboarding runs in that thread, and that thread becomes the board's conductor. (Spec: Skill and procedure exist.)

| Input | Default | Notes |
|---|---|---|
| Board URL | none | `https://github.com/users/<owner>/projects/<n>` or `https://github.com/orgs/<owner>/projects/<n>`. A board named by URL or number is confirmed by that. The repositories come from the board's issues. |
| Plan model | `claudeAgent/claude-opus-5-5#medium` | A cell `<providerInstanceId>/<model id>#<effort>`. Shown in the plan for the person to confirm. |
| Review model | `opencode/openai/gpt-6.2-sol#medium` | Shown in the plan for the person to confirm. |
| Implement model | DeepSeek | The exact cell must be confirmed by the person. Never guess it. A `model.implement` line already in the board readme block counts as confirmed unless the person changes it in the plan. |
| Effort per role | `medium` | The `#<effort>` of each cell. Shown in the plan for the person to confirm. |
| Dry run | no | Yes: survey, show the plan and the report, write nothing. |
| Proceed without asking | no | Yes: show the plan and write without waiting for agreement. |

A model line already in the block is kept as written and shown as the one to confirm: the defaults fill only a missing line. If the board URL is missing, ask for it before the survey.

## Names this procedure writes

These are frozen. Write them verbatim.

| What | Name and value |
|---|---|
| Conductor title | `project-conductor <board URL>`, this thread's title |
| Settings block | the line `<!-- project-conductor -->` in the board readme, followed by one fenced `text` block with the keys `conductor`, `maxParallel` (2), `reviewRounds` (5), `reconcileMinutes` (30, from 1 to 1440), `maxAttempts` (2), `model.plan`, `model.review`, `model.implement` |
| Board fields | "Run phase" (single select: `plan`, `implement`, `closeout`, `care`), "Attempt" (number), "Run thread" (text) |
| Triggers | `project-conductor webhook` and `project-conductor timer`, bound to this thread |
| Task key | `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->`, the first line of the issue body |

A field is never renamed. A released name is never changed. Onboarding does not set `PROJECT_URL`, write `.agents/harness.json` or `repo-run-models.md`, or open a pull request: those steps are no longer used, and what an earlier onboarding left is not changed. (Spec: Settings block in the board readme.)

## Onboarding rules

- **Survey first, then show the plan.** Every run first reads the current state of every step, and writes nothing while it does. Then it shows a plan that marks each item as **create**, **change** (a write over an existing value, such as another title or a `conductor` naming an archived thread), **reuse** or **cannot do**, with the reason and, for cannot do, the owner's exact step. Show every readme and body that would change as its full content or a diff. (Spec: Survey before any write.)
- **Wait for agreement.** Write only after the person agrees to the plan. When the person said to proceed without asking, show the plan and write at once, except for what needs their choice: an implement model that is neither given nor in the block is left out of the block and reported. (Spec: Survey before any write; Settings block in the board readme.)
- **Agreeing to part of the plan.** The person may drop items from the plan. A dropped item is not written; list it under Pending as "<item>: dropped by the person". Write the rest as planned. (Spec: Survey before any write.)
- **A dry run writes nothing.** It stops after the plan and prints the report, with every owner step and the exact commands. Nothing changes: no title, field, readme, issue, trigger or webhook, and no `request_secret` card appears. A dry run may run in any thread. Run outside the conductor thread, its report says that steps 2, 6 and 7 (the rename, the secret, and the triggers and webhooks) need the conductor thread. (Spec: Survey before any write.)
- **Look before every write.** Read the thing again just before writing it. If it changed since the survey, do not write it: report it. A step that already holds the planned value is reused. A run right after a completed run writes nothing. (Spec: Report and repeatability.)
- **Change only what this procedure manages:** this thread's title, the three fields and the missing options of "Run phase", the settings block in the board readme, the first line of keyless issue bodies, the two triggers bound to this thread, and the hooks with the webhook trigger's URL. Keep every other key, option, field, readme byte and hook.
- **Delete nothing.** No field, option, trigger, hook or readme text is removed.
- **Trusted input.** Key an issue only when its author and every editor of its body are the agent account or the owner of that issue's repository. When the edit history cannot be read completely, has more pages, holds a deleted edit, or names an editor or author that cannot be identified, or the query returns an error, the issue is untrusted. When authorship cannot be read, the answer is no. (Spec: Only trusted bodies are keyed.)
- **One onboarding per board at a time.** Do not start a run for a board while another run for it is in progress, in this session or another one you know of.
- **A failed step does not stop the run.** Report the failure with the owner's step, and go on with the next step. Exceptions: the one-conductor check stops the whole run before any write, and the keying step of a repository stops whole, writing no further key there, on a duplicate key or on a list that could not be read to its end. Steps already written stay written.
- **Never retry a refused write another way.** When the agent cannot rename the thread, write the readme, create a field, a trigger or a hook, print the owner's exact step. Do not try another API or account.
- **The secret stays the owner's.** It comes only through `request_secret`, and only when this run creates the webhook trigger or a hook. Never generate, print or store it. (Spec: Webhook secret from the owner.)
- **English by default.** Write in another language only when the person explicitly asks.

## Onboard a board

Run the eight steps in this order. Survey all of them first (each step's "Survey" part), show the plan, then write (each step's "Write" part) in the same order, and end with the report.

### 1. Preflight

Reference: [Preflight](references/onboarding-github.md#preflight) and [Conductor thread](references/onboarding-github.md#conductor-thread). Spec: Skill and procedure exist; Survey before any write; One conductor per board.

Survey:

- `gh` is logged in and the token has the `project` scope. The agent's login, from the token.
- The board can be read by its explicit number and owner; its URL, id and readme are known.
- This thread's id, title and T3 project.
- **One conductor.** The block's `conductor`: when it names another thread that `t3_thread_read` shows as not archived, stop. Then every project of `t3_project_list`, "No project" included: search each for the conductor title and compare the titles exactly; a match that is not this thread stops the run. A failed search stops it too. A full page of 50 matches with no exact match from another thread does not: report "search not exhaustive for project <id>" under Pending and go on, since the block's `conductor` is the exact guard.

If `gh` is not logged in, the scope is missing, the board cannot be read or the one-conductor check stops, end the run with the report: nothing is written, and the report names the existing conductor or the fix.

Preflight writes nothing.

### 2. This thread is the conductor

Reference: [The rename](references/onboarding-github.md#the-rename). Spec: The onboarding thread becomes the conductor.

Survey: this thread's title. Exactly `project-conductor <board URL>`: reuse. Another board's conductor title: stop, "Run the onboarding of this board in a new thread." Anything else: change.

Write: rename this thread with `t3_thread_update` `rename`, then read the title back. A refused rename is an owner step.

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

### 4. Settings block

Reference: [Settings block](references/onboarding-github.md#settings-block), with the format and parser of [Settings block](references/run-github.md#settings-block). Spec: Settings block in the board readme.

Survey: parse the block in the board readme, then plan it:

- **No marker:** create. The marker and the block go after the readme's text, which stays byte for byte.
- **A block without a gap, or one lacking only `conductor`:** keep every valid key as written, in its place. Add only the missing keys, with the defaults and the confirmed models, and set `conductor` to this thread's id. Change a model only when the owner gives another cell in the plan. A planned block equal to the readme's is reused.
- **A block with another gap** (two markers, no fenced block, an unknown or repeated key, an invalid number): cannot do. The owner step is the gap's fix, and the report shows the planned block.
- **The implement model** not confirmed: its line is left out, and the report names it under Could not do.

Each model line of the planned block is resolved read-only, as a wake does; one that does not resolve is reported with its owner step.

Write: read the readme again, write it with `gh project edit --readme`, and read it back: equal byte for byte, the trailing newline aside. A refused write is an owner step that shows the block to paste.

### 5. Repositories of the board

Reference: [Repositories](references/onboarding-github.md#repositories), [Keys](references/onboarding-github.md#keys) and [Approval rule](references/onboarding-github.md#approval-rule). Spec: Repositories of the board; Missing task keys are added; Malformed markers; Which board items are keyed; Slugs and numbers of a new key; Only trusted bodies are keyed; Re-check before keying; Approval rule.

Survey: read every item of the board, page by page, to the end. Each repository with an open issue on the board is checked on its own, and none of its findings stops another repository:

1. **Its T3 project:** exactly one project whose `repositoryIdentity.canonicalKey` equals `github.com/<repo>`, compared without case. None, or several (named by id), is an owner step.
2. **Push permission.** Without it, its keys are cannot do: "Give the agent account write access to `<repo>`."
3. **Its keys**, allocated and checked against that repository's keys only:
   1. Take each of its open issues' first line, the whole line, a CR at its end tolerated:
      - a full task key `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->` or a full plan marker `<!-- plan: <rfc-slug>/<milestone-slug> -->`: **identified**, left unchanged;
      - matches `^\s*<!--\s*(task|plan):` (leading spaces or no space allowed) but is not the exact marker form: **malformed**, reported, left unchanged;
      - anything else: **keyless**.

      Pull requests and draft items are never keyed. A failed page of the board stops the keying of every repository.
   2. Read every task key in the repository, open and closed, on and off the board, every page. A key held by two issues stops that repository's keying step: report both.
   3. For each keyless issue, find its slugs. `<rfc-slug>` comes from the board readme's marker `<!-- rfc: <rfc-slug> -->`. `<milestone-slug>` comes from the marker `<!-- rfc: <rfc-slug>/<milestone-slug> -->` in the description of the issue's milestone. No readme marker, no milestone, no marker in the milestone, or an RFC slug in the milestone that differs from the readme's: no key, reported with the reason.
   4. Check trust for each keyless issue (see [Onboarding rules](#onboarding-rules)), against that repository's owner. Untrusted: no key, reported with the reason.
   5. Allocate the numbers in one pass, in ascending issue number: for each prefix `<rfc-slug>/<milestone-slug>`, start from the highest number used under it in any issue of the repository, open or closed, and give each issue the next one. Numbers given in one run are distinct.
4. **Its approval rule:** read the rulesets that apply to its default branch, and the branch's classic protection.

   | Found | Answer |
   |---|---|
   | either source requires at least one approving review | yes |
   | both sources were read and neither requires one | no: owner step to add a rule, with the repository's rules page |
   | any other case, such as classic protection that cannot be read without admin | unknown: owner checks, with the rules page |

   This only reads. It never writes a rule.

The plan lists each repository's findings, each proposed key with its issue, and every malformed, untrusted and unmarked issue with its reason.

Write the keys, one issue at a time:

1. Read the issue again: its body, its edit ids and their update times, its state, whether it is still on the board, and its milestone. If any of them changed since the survey, skip it and report it.
2. Read the repository's keys again, every page. If another issue now holds the planned key, skip and report it. Never renumber silently. A duplicate key now stops that repository's keying step.
3. Write the key line, a newline, then the body exactly as read in step 1. Read the body back and compare byte for byte. A difference is reported, and that repository's keying step stops.

An existing key never changes.

### 6. Webhook secret

Reference: [The secret and the webhook trigger](references/onboarding-github.md#the-secret-and-the-webhook-trigger). Spec: Webhook secret from the owner.

Survey: none of its own. Step 7's survey says whether the webhook trigger is created in this run.

Write, only when the webhook trigger is created: `request_secret` with a `secretRef`, for the trigger; and, when any repository of the board has `admin`, `request_secret` with `delivery: "file"`, for its hooks. A run that reuses the webhook trigger asks for nothing.

### 7. Triggers and webhooks

Reference: [Webhook](references/onboarding-github.md#webhook), [Triggers](references/triggers-github.md#triggers) and [Register the webhook](references/triggers-github.md#register-the-webhook). Spec: Two triggers bound to the conductor; Register the webhook for one repository; Webhook secret from the owner.

Survey: list this thread's triggers with `list_scheduled_tasks` by `projectId` of this thread, `boundThreadId` and title, and compare each with its object for the planned `reconcileMinutes`. Equal and enabled: reuse. Different or disabled: change, in place by `scheduledTaskId`. Missing: create. Several with one title: owner step.

Write:

1. The timer, then the webhook trigger, each read back. A created webhook trigger's `webhookUrl` is printed in the report.
2. **When the webhook trigger was created in this run,** run [Register the webhook](#register-the-webhook) for each repository of the board with the new URL. A repository without `admin`, or a refused write, gets the owner steps block.
3. **When it was reused,** register no hook. Carry the `Webhook owner steps:` list from the newest report in this thread that holds one, and add every repository of the board that none of those reports names.

### 8. Skills

Spec: Skills confirmed at account level.

Nothing is read or written. The report asks the owner to confirm that `project-conductor` and `task-run` are installed at account level for every provider instance that the planned block's models name, such as `claudeAgent` and `opencode`.

## Onboarding report

Every run ends with this report, a dry run included. (Spec: Report and repeatability.)

```markdown
## Onboarding: board <board URL>

Mode: <dry run | written after agreement | written without asking>
Conductor: <this thread's id>, titled `project-conductor <board URL>`

### Created
- <what, with its link or id>

### Changed
- <what, old value → new value>

### Reused
- <what>

### Pending
- <issues skipped because they changed during the run: keyed by the next run>

### Could not do (owner step)
- <what, why, and the owner's exact command or page>

### Triggers
- Timer: <created <scheduledTaskId> | updated <fields> | re-enabled | reused | several | failed <error>>
- Webhook trigger: <created <scheduledTaskId>, URL <webhookUrl> | updated <fields> | re-enabled | reused | several | failed <error>>
- Webhooks: <repo>: <registered <id> | reused <id> | owner step>; … or "not run: the trigger was reused"

Webhook owner steps: <repo>, <repo>

### Repositories
- <repo>: T3 project <id | none | several: <ids>>, push <yes | no>, approval rule <yes | no | unknown>, keys <n> identified, <n> keyed in this run, <n> without a key

### Skills to confirm
- Confirm that `project-conductor` and `task-run` are installed at account level for <each provider instance of the models>.

<Nothing changed.>
```

- Every list is printed, with "none" when it is empty.
- Under Created, Changed and Reused, name each item of steps 2 to 7: the thread title, each field and the options added, the settings block (the keys added and the lines changed), each key with its issue, each trigger and each hook.
- Pending and Could not do are listed on every run, also when nothing changed: a conductor search that was not exhaustive, a repository without a T3 project or with several, a repository without push, a case-only field collision, a field of the wrong type, a settings block with a gap, an implement model not confirmed, a model line that does not resolve, a refused readme write with the block to paste, the approval rule of each repository when it is not "yes", each repository's webhook owner steps block, every plan item the person dropped, and every open issue without a key with its reason (malformed, untrusted, no marked milestone, RFC slugs differ, changed during the run, key taken meanwhile).
- The line `Webhook owner steps:` is a line of its own, with the full list or `none`: the wakes' automatic check reads the newest one, and finds this report by its heading `## Onboarding:`.
- In a dry run, the plan's creates and changes are listed under Pending as "would create" and "would change". Run outside the conductor thread, Pending also says: "Steps 2, 6 and 7 (the rename, the secret, the triggers and webhooks) need the conductor thread: run the onboarding there without dry run."
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
