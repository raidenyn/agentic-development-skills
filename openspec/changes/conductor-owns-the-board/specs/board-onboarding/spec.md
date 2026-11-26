## MODIFIED Requirements

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

### Requirement: Which board items are keyed
An issue whose first line is a plan marker `<!-- plan: <rfc-slug>/<milestone-slug> -->` SHALL be left unchanged and counted as identified. Issues of every repository on the board MUST be considered, each against its own repository's keys. Pull requests and draft items MUST NOT be keyed.

#### Scenario: Plan issue on the board
- **WHEN** an open issue's first line is `<!-- plan: scratch-rfc/m1-scratch -->`
- **THEN** its body is unchanged and the report counts it as identified, not keyless

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

### Requirement: Missing task keys are added
The procedure SHALL check every open issue on the board, of every repository, for a task key `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->` as the first line of its body, matched against the whole line. For an issue without one, it SHALL add a new key as a new first line and leave the rest of the body byte for byte unchanged. Keys are allocated and checked per repository. An existing key MUST never change. When two issues of one repository share a key, the keying step for that repository MUST stop and report both.

#### Scenario: Two keyless issues and one keyed
- **WHEN** the board holds two open keyless issues and one keyed issue of one repository, all in a marked milestone
- **THEN** the two receive distinct new keys as their first line, the rest of each body is unchanged, the keyed issue is untouched, and a second run adds nothing

## ADDED Requirements

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

On a repeat run that reuses the webhook trigger, the URL is not known, because only creation returns it. The run then MUST NOT ask for a secret and MUST NOT register hooks. It MUST carry the `Webhook owner steps:` list from the newest onboarding or check report in this thread, and add every repository of the board that none of those reports covered.

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

## REMOVED Requirements

### Requirement: Repository variable
**Reason**: the conductor owns a board and reads it from its thread title and the readme block. Nothing else reads `PROJECT_URL`.
**Migration**: none. An existing `PROJECT_URL` is left as it is, and this repository's `project-ready` workflow uses `PROJECT_NUMBERS`.

### Requirement: Settings key in harness.json
**Reason**: the settings move to the board readme block.
**Migration**: copy the four numbers into the readme block. The key in `.agents/harness.json` is ignored and may be removed by hand.

### Requirement: Model file
**Reason**: the models move to the readme block as `model.<role>` lines.
**Migration**: write each role's cell and effort as `<provider>/<model>#<effort>`. `repo-review-models.md` stays unchanged for hand-started sessions.

### Requirement: References to the old roster
**Reason**: there is no roster migration any more.
**Migration**: none.

### Requirement: Settings go through one pull request
**Reason**: onboarding opens no pull request.
**Migration**: close an open `chore/project-conductor-onboarding` pull request by hand.

### Requirement: Reuse of the onboarding pull request
**Reason**: onboarding opens no pull request.
**Migration**: none.

### Requirement: Completing a partial onboarding pull request
**Reason**: onboarding opens no pull request.
**Migration**: none.

### Requirement: Webhook step pending
**Reason**: the webhook step is now real (see `conductor-triggers`).
**Migration**: none.
