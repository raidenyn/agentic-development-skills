## Why

The owner wants conductor threads titled by the board's name, for example `Bank MCP Conductor`, rather than `project-conductor <board URL>`.

## What Changes

**Conductor title**
- From: `project-conductor <board URL>`, the source of the board on every wake.
- To: `<board title> Conductor`, a label only.
- Impact: a frozen name changes, so the owner approved it in #36. Conductors with the old title keep working, and the next onboarding renames them.

**Where a wake finds the board**
- From: the title.
- To: the launch line, the first line of the thread's first message, `/project-conductor <board URL>`. A missing launch line is an identity failure. A wrong title is a gap, and the wake goes on.

**One conductor per board**
- The search looks for both titles, and checks a match's launch line before it stops the run.

## Capabilities

### Modified Capabilities

- `conductor-wake`: Wake message, Settings and board preflight, The wake checks its own identity.
- `board-onboarding`: Skill and procedure exist, The onboarding thread becomes the conductor, One conductor per board.

## Impact

- Docs: `skills/project-conductor/SKILL.md`, `references/run-github.md` and `references/onboarding-github.md`.
- Contracts: the Settings block, the Run record and the Phase report are unchanged.
- Live: the Bank MCP conductor is renamed to `Bank MCP Conductor` by running onboarding again.
