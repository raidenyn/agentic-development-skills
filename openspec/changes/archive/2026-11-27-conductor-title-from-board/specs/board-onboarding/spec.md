## MODIFIED Requirements

### Requirement: Skill and procedure exist
The repository SHALL contain a skill `project-conductor` at `skills/project-conductor/`. It MUST have:
- a `SKILL.md` whose procedure "Onboard a board" takes a GitHub Project board URL;
- a marketplace entry with source `./skills/project-conductor`;
- a row in the README's Skills table;
- a reference file `references/onboarding-github.md` holding the `gh` commands the procedure uses.

The procedure MUST start from the command `/project-conductor <board URL>` as the first line of the thread's first message, the launch line, and MUST run in that thread. A run in a thread whose first message is not a launch line for this board MUST NOT write; it MAY run as a dry run. That thread MAY be in any T3 project or in "No project".

#### Scenario: Validators accept the skill
- **WHEN** `python3 scripts/skills.py validate`, `claude plugin validate .`, the Python unit tests and `pnpm run check` run
- **THEN** all pass with `project-conductor` present

### Requirement: The onboarding thread becomes the conductor
A run that writes SHALL rename its own thread to `<board title> Conductor`, such as `Bank MCP Conductor`, and SHALL record its own thread id as `conductor` in the settings block.

#### Scenario: First onboarding
- **WHEN** the owner types `/project-conductor https://github.com/users/raidenyn-shadow/projects/5` in a new thread in "No project" and agrees to the plan
- **THEN** that thread's title is `task-run scratch Conductor` and the readme block's `conductor` is its id

#### Scenario: Conductor with the old title
- **WHEN** onboarding runs again in a conductor titled `project-conductor <board URL>`
- **THEN** the plan changes the title to `<board title> Conductor` and nothing else

### Requirement: One conductor per board
Before any write, the procedure SHALL check two places for another conductor:
- **The settings block's `conductor`.** When it names another thread that is not archived, the run MUST stop and name that thread.
- **Every T3 project from `t3_project_list`, "No project" included.** The procedure MUST search each for the conductor title `<board title> Conductor` and the old title `project-conductor <board URL>`, and compare titles exactly. A match that is not this thread MUST stop the run when its launch line names this board, is missing, or cannot be read; a match whose launch line names another board MUST NOT.

#### Scenario: Conductor already exists in another project
- **WHEN** a thread in project A titled `<board title> Conductor`, whose launch line names this board, exists and the owner runs the command in project B
- **THEN** nothing is written and the report names the existing thread
