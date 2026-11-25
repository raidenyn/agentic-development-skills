## MODIFIED Requirements

### Requirement: Skill and procedure exist
The repository SHALL contain a skill `project-conductor` at `skills/project-conductor/` with a `SKILL.md`
whose procedure "Onboard a board" takes a GitHub Project board and the one repository it serves, a
marketplace entry with source `./skills/project-conductor`, a row in the README's Skills table, and a
reference file `references/onboarding-github.md` holding the `gh` commands the procedure uses.

#### Scenario: Validators accept the skill
- **WHEN** `python3 scripts/skills.py validate`, `claude plugin validate .`, the Python unit tests and
  `pnpm test` run
- **THEN** all pass with `project-conductor` present
