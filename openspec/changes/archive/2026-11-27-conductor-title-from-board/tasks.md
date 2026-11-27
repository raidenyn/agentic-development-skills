## 1. Identity from the launch line

- [x] 1.1 Rewrite [Identity](skills/project-conductor/references/run-github.md) to read the first message, parse the launch line and treat the title as a gap.
- [x] 1.2 Update the wake inputs, step 1 and step 4 of "Before the steps" in `SKILL.md`.

## 2. Onboarding

- [x] 2.1 Add the launch-line check to Preflight, and both titles and the launch-line check to the one-conductor search in `onboarding-github.md` and `SKILL.md`.
- [x] 2.2 Change the rename to `<board title> Conductor`, with the old form planned as a change.
- [x] 2.3 Update the frozen names table and the report's `Conductor:` line.

## 3. Checks

- [x] 3.1 Test the launch-line parser on four sample lines.
- [x] 3.2 Run `openspec validate --all` and `node scripts/verify.mts`.
