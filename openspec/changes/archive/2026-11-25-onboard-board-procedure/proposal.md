## Why

Every task of the unattended-runs RFC reads the conductor's settings and writes its run fields, but no
board or repository has them, and onboarding is done by hand. Task #33 is the first of milestone M1: one
repeatable procedure that prepares a board and its repository, so the loop has a frozen place to read
from and write to.

## What Changes

- New skill `skills/project-conductor/` with the procedure "Onboard a board": survey, plan (a dry run stops
  here), write, report.
- The procedure sets `PROJECT_URL` or prints the owner's exact command; creates or reuses the fields
  "Run phase", "Attempt" and "Run thread"; proposes `.agents/harness.json` (`project-conductor` key) and
  `.agents/hooked-rules/repo-run-models.md` in a pull request, replacing `repo-review-models.md` and
  keeping its presets; keys every trusted keyless open issue on the board; checks the approval rule; lists
  the webhook as pending.
- New reference `skills/project-conductor/references/onboarding-github.md` with the `gh` commands.
- Marketplace entry in `.claude-plugin/marketplace.json` and a row in the README's Skills table.

## Capabilities

### New Capabilities
- `board-onboarding`: the "Onboard a board" procedure of `project-conductor` — what it checks, writes,
  refuses and reports, its dry-run form and its repeatability.

### Modified Capabilities
- None.

## Impact

- New files under `skills/project-conductor/`; `.claude-plugin/marketplace.json`; `README.md`.
- Produces the Settings contract (frozen) and the three board fields of the Run record (provisional).
- No code, no dependency. Live proof uses the scratch board (`raidenyn-shadow` project 5), a scratch
  repository created for it, and a dry run against `raidenyn/line-mcp`.
