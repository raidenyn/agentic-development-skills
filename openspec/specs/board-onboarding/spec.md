# board-onboarding Specification

## Purpose
The "Onboard a board" procedure of the `project-conductor` skill prepares a GitHub Project board and the repositories of its issues for unattended task runs, from the thread that becomes the board's conductor. It renames the thread, creates the run fields, writes the settings block into the board readme, keys trusted open issues per repository, checks each repository's T3 project and approval rule, creates the two triggers, and registers each repository's webhook where the agent is an admin. A dry run writes nothing, a repeat run changes nothing, and every run ends with a report of what it created, changed, reused, left pending or could not do.

## Requirements

### Requirement: Skill and procedure exist
The repository SHALL contain a skill `project-conductor` at `skills/project-conductor/`. It MUST have:
- a `SKILL.md` whose procedure "Onboard a board" takes a GitHub Project board URL;
- a marketplace entry with source `./skills/project-conductor`;
- a row in the README's Skills table;
- a reference file `references/onboarding-github.md` holding the `gh` commands the procedure uses.

The procedure MUST start from the command `/project-conductor <board URL>`, and MUST run in the thread where that command is typed. That thread MAY be in any T3 project or in "No project".

#### Scenario: Validators accept the skill
- **WHEN** `python3 scripts/skills.py validate`, `claude plugin validate .`, the Python unit tests and `pnpm run check` run
- **THEN** all pass with `project-conductor` present

### Requirement: Survey before any write
Every run of the procedure SHALL first read the current state of every step without writing. It SHALL then show a plan that marks each step as create, change, reuse, or cannot do.
- In dry-run form, the run MUST stop after the plan and write nothing. A dry run MAY run in any thread. Run outside the conductor thread, it MUST report that the rename, the secret, and the triggers and webhooks need the conductor thread.
- Otherwise, it MUST write only after the person agrees to the plan, unless the person said to proceed without asking.

#### Scenario: Dry run against a repository where the agent is not an admin
- **WHEN** the procedure runs in dry-run form for a board whose items are in `raidenyn/line-mcp`
- **THEN** no field, readme, issue, trigger or webhook changes, and the report names the webhook registration for `raidenyn/line-mcp` as an owner step

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

### Requirement: Missing task keys are added
The procedure SHALL check every open issue on the board, of every repository, for a task key `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->` as the first line of its body, matched against the whole line. For an issue without one, it SHALL add a new key as a new first line and leave the rest of the body byte for byte unchanged. Keys are allocated and checked per repository. An existing key MUST never change. When two issues of one repository share a key, the keying step for that repository MUST stop and report both.

#### Scenario: Two keyless issues and one keyed
- **WHEN** the board holds two open keyless issues and one keyed issue of one repository, all in a marked milestone
- **THEN** the two receive distinct new keys as their first line, the rest of each body is unchanged, the keyed issue is untouched, and a second run adds nothing

### Requirement: Malformed markers
A first line that starts like a task or plan marker but does not match its whole form SHALL be reported as
malformed and MUST be left unchanged.

#### Scenario: Task marker without a number
- **WHEN** an issue's first line is `<!-- task: scratch-rfc/m1-scratch -->`
- **THEN** the body is unchanged and the report names the issue as malformed

### Requirement: Which board items are keyed
An issue whose first line is a plan marker `<!-- plan: <rfc-slug>/<milestone-slug> -->` SHALL be left unchanged and counted as identified. Issues of every repository on the board MUST be considered, each against its own repository's keys. Pull requests and draft items MUST NOT be keyed.

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

### Requirement: Report and repeatability
Every run SHALL end with a report listing:
- what it created;
- what it changed;
- what it reused;
- what is pending or could not be done, with the owner's exact steps.

"Nothing changed" MUST be stated exactly when the run made no successful write. A run immediately after a completed run MUST write nothing. The report MUST list every repository whose webhook registration is still an owner step.

#### Scenario: Second run
- **WHEN** the procedure runs again in the conductor thread of an onboarded board
- **THEN** it writes nothing and states that nothing changed. It still lists every open owner step, the repositories whose webhook is an owner step, and the unkeyed issues

### Requirement: The onboarding thread becomes the conductor
A run that writes SHALL rename its own thread to `project-conductor <board URL>`, and SHALL record its own thread id as `conductor` in the settings block.

#### Scenario: First onboarding
- **WHEN** the owner types `/project-conductor https://github.com/users/raidenyn-shadow/projects/5` in a new thread in "No project" and agrees to the plan
- **THEN** that thread's title is `project-conductor https://github.com/users/raidenyn-shadow/projects/5` and the readme block's `conductor` is its id

### Requirement: One conductor per board
Before any write, the procedure SHALL check two places for another conductor:
- **The settings block's `conductor`.** When it names another thread that is not archived, the run MUST stop and name that thread.
- **Every T3 project from `t3_project_list`, "No project" included.** The procedure MUST search each for the conductor title and compare titles exactly. A match that is not this thread MUST stop the run.

#### Scenario: Conductor already exists in another project
- **WHEN** a thread in project A titled `project-conductor <board URL>` exists and the owner runs the command in project B
- **THEN** nothing is written and the report names the existing thread

### Requirement: Settings block in the board readme
The procedure SHALL keep the conductor's settings in one fenced `text` block following the line `<!-- project-conductor -->` in the board readme. The block has these keys:
- `conductor`;
- `maxParallel` (default 2), `reviewRounds` (5), `reconcileMinutes` (30, from 1 to 1440) and `maxAttempts` (2);
- `model.plan`, `model.review` and `model.implement`, each written `<providerInstanceId>/<model id>#<effort>`.

Valid keys already in the block MUST be kept as written. Onboarding adds only the missing keys and sets `conductor`. A model changes only when the owner gives another one in the plan. It MUST write the block with `gh project edit --readme`, keeping the rest of the readme byte for byte. A refused write MUST become an owner step showing the block. An implement model the owner did not confirm MUST be left out and reported. The procedure MUST NOT set `PROJECT_URL`, write `.agents/harness.json` or `repo-run-models.md`, or open a pull request.

#### Scenario: Existing values kept
- **WHEN** the block already holds `reconcileMinutes: 2` and no other key
- **THEN** onboarding keeps `reconcileMinutes: 2`, adds the missing keys, and creates the timer with `everyMs` 120000

#### Scenario: Readme with other text
- **WHEN** the board readme holds the marker `<!-- rfc: scratch-rfc -->` and a paragraph
- **THEN** after onboarding both are unchanged and the block follows the `<!-- project-conductor -->` line

### Requirement: Repositories of the board
For each repository with an open issue on the board, the procedure SHALL check four things:
- one T3 project whose `repositoryIdentity.canonicalKey` equals `github.com/<repo>`, compared without regard to case;
- the agent's push permission;
- the keys;
- the approval rule.

A repository with no T3 project, or with several, MUST be reported as an owner step, naming the project ids when there are several.

#### Scenario: Repository without a T3 project
- **WHEN** a board issue belongs to a repository that no T3 project has
- **THEN** the report names the repository and the owner's step to add its project

### Requirement: Webhook secret from the owner
The procedure SHALL ask the owner for the webhook secret with `request_secret` only when it creates something that needs the secret:
- with a `secretRef` when it creates the webhook trigger;
- with file delivery when it creates or updates a hook in a repository where the agent is an admin.

It MUST NOT generate, print or store the secret. When the webhook trigger is created in this run, the procedure SHALL run Register the webhook for each repository of the board with the new URL.

On a repeat run that reuses the webhook trigger, the URL is not known, because only creation returns it. The run then MUST NOT ask for a secret and MUST NOT register hooks. It MUST carry the `Webhook owner steps:` list from the newest onboarding, check or register report in this thread, and add every repository of the board that none of those reports covered. It MUST read the thread's messages (`view` `"messages"`), newest first, and MAY stop once it has the newest such report and every repository of the board is named by a report read.

#### Scenario: Onboarding the scratch board
- **WHEN** onboarding runs on the scratch board, where the agent is an admin of the repository
- **THEN** both triggers exist, bound to the conductor thread, and the repository has one hook with the trigger's URL

#### Scenario: Repeat run
- **WHEN** onboarding runs again in the conductor thread of an onboarded board
- **THEN** no `request_secret` card appears, no hook is written, and the report repeats the `Webhook owner steps:` list

### Requirement: Skills confirmed at account level
The report SHALL ask the owner to confirm that `project-conductor` and `task-run` are installed at account level for every provider instance that the settings block's models name. It MUST NOT write anything for this.

#### Scenario: Two providers in the models
- **WHEN** the models name `claudeAgent` and `opencode`
- **THEN** the report asks the owner to confirm both skills for both providers
