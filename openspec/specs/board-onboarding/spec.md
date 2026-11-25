# board-onboarding Specification

## Purpose
The "Onboard a board" procedure of the `project-conductor` skill prepares a GitHub Project board and the one repository it serves for unattended task runs. It sets the `PROJECT_URL` variable, creates the run fields, proposes the conductor settings and model file in a pull request, keys trusted open issues, and checks the approval rule. A dry run writes nothing, a repeat run changes nothing, and every run ends with a report of what it created, changed, reused, left pending or could not do.

## Requirements

### Requirement: Skill and procedure exist
The repository SHALL contain a skill `project-conductor` at `skills/project-conductor/` with a `SKILL.md`
whose procedure "Onboard a board" takes a GitHub Project board and the one repository it serves, a
marketplace entry with source `./skills/project-conductor`, a row in the README's Skills table, and a
reference file `references/onboarding-github.md` holding the `gh` commands the procedure uses.

#### Scenario: Validators accept the skill
- **WHEN** `python3 scripts/skills.py validate`, `claude plugin validate .`, the Python unit tests and
  `pnpm test` run
- **THEN** all pass with `project-conductor` present

### Requirement: Survey before any write
Every run of the procedure SHALL first read the current state of every step without writing, and SHALL
show a plan that marks each step as create, reuse, or cannot do. In dry-run form the run MUST stop after
the plan and write nothing. Otherwise it MUST write only after the person agrees to the plan, unless the
person said to proceed without asking.

#### Scenario: Dry run against a repository where the agent is not an admin
- **WHEN** the procedure runs in dry-run form against `raidenyn/line-mcp`
- **THEN** no variable, field, file, branch, pull request or issue changes, and the report contains the
  exact command `gh variable set PROJECT_URL --repo raidenyn/line-mcp --body "<board URL>"` for the owner

### Requirement: Repository variable
The procedure SHALL make the repository variable `PROJECT_URL` hold the board's URL. When the agent
account is not an admin of the repository, or setting the variable fails, it MUST NOT retry another way
and MUST print the exact `gh variable set` command for the owner. A variable that already holds the URL
MUST be reported as reused.

#### Scenario: Agent account is admin
- **WHEN** the agent account administers the repository and `PROJECT_URL` is absent
- **THEN** the variable is set to the board's URL and reported as created

### Requirement: Run fields on the board
The procedure SHALL ensure the board has the fields "Run phase" (single select with options plan,
implement, closeout, care), "Attempt" (number) and "Run thread" (text). A field whose name matches exactly, case included, MUST be
reused; missing options of "Run phase" MUST be added while keeping every existing option and its id; a
field with a matching name and a different type MUST be reported and left unchanged.

#### Scenario: Fields already exist
- **WHEN** the board already has all three fields with all options
- **THEN** nothing is written and the three are reported as reused

### Requirement: Field names match exactly
A board field whose name differs from "Run phase", "Attempt" or "Run thread" only in case SHALL be
reported as an owner step, and no competing field MUST be created.

#### Scenario: Case-only collision
- **WHEN** the board has a field "Run Phase"
- **THEN** it is not reused, no "Run phase" is created, and the report names it as an owner step

### Requirement: Settings key in harness.json
The procedure SHALL set the key `project-conductor` in `.agents/harness.json` to
`{"maxParallel": 2, "reviewRounds": 5, "reconcileMinutes": 30, "maxAttempts": 2}`. It MUST create the
file when absent, MUST NOT change any other key, and MUST stop this step when the file is not valid JSON.

#### Scenario: Harness file with another tool's key
- **WHEN** `.agents/harness.json` exists with a key `agent-harness-verify-gate`
- **THEN** the proposed file has both keys and the other key's value is unchanged

### Requirement: Model file
The procedure SHALL write `.agents/hooked-rules/repo-run-models.md` naming the model for each of the
roles plan, review and implement, except when the roster migration is deferred (see "References to the
old roster"). When `.agents/hooked-rules/repo-review-models.md` exists, the new file
MUST keep its reviewer table and presets unchanged and the old file MUST be removed in the same commit.

#### Scenario: Migrated roster on a later run
- **WHEN** `repo-run-models.md` with migrated presets is on the default branch and the old file is gone
- **THEN** the presets are read from `repo-run-models.md`, nothing is proposed, and the step is reused

#### Scenario: Roster replaced
- **WHEN** `.agents/hooked-rules/repo-review-models.md` exists with presets `sol`, `opus` and `both`
- **THEN** the pull request deletes it and `repo-run-models.md` contains the same presets and reviewer rows

### Requirement: References to the old roster
Before removing `repo-review-models.md`, the procedure SHALL search the repository for references to its
path. When any exist outside the file itself and the person did not agree in the plan to edit them, the
roster migration MUST be deferred: neither `repo-run-models.md` is proposed nor the old file removed, and
the references MUST be reported as an owner step. With that agreement, the references are edited in the
same pull request.

#### Scenario: Roster still referenced
- **WHEN** `AGENTS.md` refers to `.agents/hooked-rules/repo-review-models.md` and the person has not
  agreed to edit it
- **THEN** the old file stays, `repo-run-models.md` is not proposed, the harness key still is, and the
  report names the reference

### Requirement: Settings go through one pull request
The procedure SHALL commit the settings key and, unless the roster migration is deferred, the model file on
branch
`chore/project-conductor-onboarding` and propose them in one pull request to the default branch. Content already on the default branch MUST be
reported as reused, with no branch or pull request created.

#### Scenario: Settings already merged
- **WHEN** the default branch already holds the key and the model file with the planned content
- **THEN** no branch or pull request is created and both are reported as reused

### Requirement: Reuse of the onboarding pull request
An existing pull request SHALL be reused only when it is from `chore/project-conductor-onboarding` of the
same repository to the current default branch, its changes equal the planned ones (`.agents/harness.json`,
`repo-run-models.md`, removal of `repo-review-models.md`, agreed reference edits), and its files at one
head commit equal the planned content. Otherwise the step MUST stop and report the conflict, except as
"Completing a partial onboarding pull request" allows.

#### Scenario: Unrelated change on the branch
- **WHEN** the onboarding branch also changes `README.md`
- **THEN** the pull request is not reused and the report names the conflict

### Requirement: Completing a partial onboarding pull request
An onboarding pull request whose changes are a strict subset of the planned ones, each equal to its planned
content, SHALL be completed with one more commit instead of being reported as a conflict.

#### Scenario: Harness-only pull request from an earlier run
- **WHEN** the open onboarding pull request holds only the planned `.agents/harness.json` and the plan also
  adds `repo-run-models.md`
- **THEN** one commit adding `repo-run-models.md` is pushed to the same pull request and no second one opens

### Requirement: Missing task keys are added
The procedure SHALL check every open issue of the repository on the board for a task key
`<!-- task: <rfc-slug>/<milestone-slug>/<number> -->` as the first line of its body, matched against the
whole line. For an issue without
one, it SHALL add a new key as a new first line and leave the rest of the body byte for byte unchanged.
An existing key MUST never change; when two issues share a key, the keying step MUST stop and
report both.

#### Scenario: Two keyless issues and one keyed
- **WHEN** the board holds two open keyless issues and one keyed issue, all in a marked milestone
- **THEN** the two receive distinct new keys as their first line, the rest of each body is unchanged, the
  keyed issue is untouched, and a second run adds nothing

### Requirement: Malformed markers
A first line that starts like a task or plan marker but does not match its whole form SHALL be reported as
malformed and MUST be left unchanged.

#### Scenario: Task marker without a number
- **WHEN** an issue's first line is `<!-- task: scratch-rfc/m1-scratch -->`
- **THEN** the body is unchanged and the report names the issue as malformed

### Requirement: Which board items are keyed
An issue whose first line is a plan marker `<!-- plan: <rfc-slug>/<milestone-slug> -->` SHALL be left
unchanged and counted as identified. Pull requests, draft items and issues of other repositories MUST NOT
be keyed.

#### Scenario: Plan issue on the board
- **WHEN** an open issue's first line is `<!-- plan: scratch-rfc/m1-scratch -->`
- **THEN** its body is unchanged and the report counts it as identified, not keyless

### Requirement: Slugs and numbers of a new key
`<rfc-slug>` SHALL come from the board readme's marker `<!-- rfc: <rfc-slug> -->` and `<milestone-slug>`
from the marker `<!-- rfc: <rfc-slug>/<milestone-slug> -->` in the issue's milestone; when either is
missing, or the two RFC slugs differ, the issue MUST get no key and be reported. The number MUST be one above the highest used under
that prefix in any issue of the repository, open or closed, and numbers allocated in one run MUST be
distinct.

#### Scenario: Higher number held by a closed issue
- **WHEN** a closed issue that is not on the board holds `<!-- task: scratch-rfc/m1-scratch/7 -->`
- **THEN** the next new key under that prefix gets number 8

#### Scenario: Issue without a marked milestone
- **WHEN** a keyless issue has no milestone, or its milestone has no marker
- **THEN** it gets no key and the report names it with the reason

### Requirement: Only trusted bodies are keyed
The procedure SHALL key an issue only when its author and every editor of its body are the agent account
or the repository owner. When the edit history cannot be read completely, has more pages, contains a
deleted edit or an editor that cannot be identified, the issue MUST be treated as untrusted. An untrusted issue
MUST get no key and MUST be named in the report.

#### Scenario: Body edited by a second account
- **WHEN** a keyless issue's body was edited by an account that is neither the agent nor the owner
- **THEN** it gets no key and the report names it with the reason

### Requirement: Re-check before keying
Immediately before writing a key, the procedure SHALL read again the issue's body, edit history (edit ids
and update times), state, presence on the board and milestone, and MUST skip the issue, naming it in the
report, when any of them changed since the survey. It SHALL also read the repository's keys again and MUST
skip and report an issue whose planned key another issue now holds.

#### Scenario: Body edited after the survey
- **WHEN** an issue's body is edited, or its milestone changed, between the survey and the write
- **THEN** it gets no key in this run and the report names it

### Requirement: Approval rule
The procedure SHALL report whether the default branch requires at least one approving review, as "yes",
"no" (with the owner's step to add it) or "unknown". "no" MUST be reported only when both the rulesets
for the branch and its classic protection were read and neither requires an approval; any unreadable
source makes the answer "unknown" unless the other source already says "yes".

#### Scenario: No approval rule
- **WHEN** the default branch has no rule requiring an approval
- **THEN** the report says so and names the owner's step

### Requirement: Webhook step pending
The procedure SHALL list the webhook step as "pending", created by the later task "Repair claims, settle
merged work and wake on events", and MUST NOT create a webhook.

#### Scenario: Any run
- **WHEN** the procedure runs
- **THEN** the report lists the webhook as pending and no webhook is created

### Requirement: Report and repeatability
Every run SHALL end with a report listing what it created, what it changed, what it reused, and what is
pending or could not be done with the owner's exact steps. "Nothing changed" MUST be stated exactly when
the run made no successful write. A run immediately after a completed run MUST write nothing.

#### Scenario: Second run
- **WHEN** the procedure runs again on an onboarded board and repository
- **THEN** it writes nothing, states that nothing changed, and still lists the pending webhook and every
  open owner step and unkeyed issue
