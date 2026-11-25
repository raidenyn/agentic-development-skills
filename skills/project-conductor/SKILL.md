---
name: project-conductor
description: "Use when a GitHub Project board and its repository must be prepared for unattended task runs, for example \"onboard this board\", \"set up the conductor for this repo\" or \"check that the board is ready for the loop\". Sets PROJECT_URL, creates the Run phase, Attempt and Run thread fields, proposes the conductor settings and model file, keys the board's open issues and checks the approval rule, with a dry-run form. Not for publishing tasks or running them."
---

# Project conductor

The conductor runs the tasks of a GitHub Project board unattended, from Ready to merged. Before it can run a board, the board and the one repository it serves must be prepared.

This version holds one procedure: **Onboard a board**. The loop itself comes later. Nothing reads these settings yet, but every later part of the conductor does, so the names below are frozen.

All commands are in [references/onboarding-github.md](references/onboarding-github.md). Every step below names the section that holds its commands and the requirement of the spec it meets.

## Inputs

| Input | Default | Notes |
|---|---|---|
| Board URL | none | `https://github.com/users/<owner>/projects/<n>` or `https://github.com/orgs/<owner>/projects/<n>`. A board named by URL or number is confirmed by that. |
| Repository | none | `owner/name`, the one repository the board serves. |
| Plan model | `Opus-5.5` | Shown in the plan for the person to confirm. |
| Review model | `GPT-6.2-Sol` | Shown in the plan for the person to confirm. |
| Implement model | DeepSeek | The exact model id must be confirmed by the person in this run. Never guess it. When `repo-run-models.md` already exists, its id is shown for confirmation. |
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

## Rules

- **Survey first, then show the plan.** Every run first reads the current state of every step, and writes nothing while it does. Then it shows a plan that marks each item as **create**, **change** (a write over an existing value, such as a different `PROJECT_URL`), **reuse** or **cannot do**, with the reason and, for cannot do, the owner's exact step. Show every file and body that would change as its full content or a diff. (Spec: Survey before any write.)
- **Wait for agreement.** Write only after the person agrees to the plan. When the person said to proceed without asking, show the plan and write at once, except for what needs their choice: an implement model id they have not confirmed, and edits to files that refer to the old roster. Those are left out of this run and reported. (Spec: Survey before any write.)
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
| the variables cannot be read | the value is "unknown, owner checks". With admin, create or change as above after reading again. Without admin, owner step as above |

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
   - The implement model id is not confirmed: the model file is cannot do in this run. The harness key goes ahead.
4. **Expected changes.** From the plan, list each planned path with its status against the default branch: `.agents/harness.json` modified or added, `repo-run-models.md` added (or modified), `repo-review-models.md` removed, each agreed reference edit modified.
5. **Existing branch and pull request.** Compare what the branch holds with the expected changes, at one head commit, as the reference describes:

| Found | Plan |
|---|---|
| nothing to change: the default branch holds the planned content | reuse, no branch or pull request. An open onboarding pull request left over is reported for the owner to close |
| no branch | create: one commit and one pull request |
| an open pull request from the branch to another base, or from a fork | cannot do: conflict, report it |
| the branch's changes and contents equal the expected ones | reuse the branch, and its pull request (open one if none is open) |
| the branch's changes are a strict subset of the expected ones, each equal to its planned content | change: one more commit on the same branch adding the rest |
| anything else, such as a change to another file or other content | cannot do: conflict, report it, do not push |

Write: as the reference describes, through a local clone in the scratchpad, never with force. Before reusing as is, check the pull request's head is still the commit you compared. Merging the pull request is the owner's step: report it.

### 5. Keys

Reference: [Keys](references/onboarding-github.md#keys). Spec: Missing task keys are added; Malformed markers; Which board items are keyed; Slugs and numbers of a new key; Only trusted bodies are keyed; Re-check before keying.

Survey:

1. Read every item of the board, page by page, to the end. If a page fails, stop the keying step. Keep only open issues of the repository. Pull requests, draft items and issues of other repositories are never keyed.
2. Take each issue's first line, the whole line, a CR at its end tolerated:
   - a full task key `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->` or a full plan marker `<!-- plan: <rfc-slug>/<milestone-slug> -->`: **identified**, left unchanged;
   - starts with `<!-- task:` or `<!-- plan:` but does not match its whole form: **malformed**, reported, left unchanged;
   - anything else: **keyless**.
3. Read every task key in the repository, open and closed, on and off the board, every page. A key held by two issues stops the keying step: report both.
4. For each keyless issue, find its slugs. `<rfc-slug>` comes from the board readme's marker `<!-- rfc: <rfc-slug> -->`. `<milestone-slug>` comes from the marker `<!-- rfc: <rfc-slug>/<milestone-slug> -->` in the description of the issue's milestone. No readme marker, no milestone, no marker in the milestone, or an RFC slug in the milestone that differs from the readme's: no key, reported with the reason.
5. Check trust for each keyless issue (see Rules). Untrusted: no key, reported with the reason.
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

## Report

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
- Pending and Could not do are listed on every run, also when nothing changed: the webhook, the unmerged settings pull request ("Merge <PR link>"), a deferred roster migration with each reference, the variable command, a case-only field collision, a field of the wrong type, the approval rule when it is not "yes", and every open issue without a key with its reason (malformed, untrusted, no marked milestone, RFC slugs differ, changed during the run, key taken meanwhile).
- In a dry run, the plan's creates and changes are listed under Pending as "would create" and "would change".
- End with the line `Nothing changed.` exactly when the run made no successful write. A dry run always ends with it. A run that wrote anything never does.
