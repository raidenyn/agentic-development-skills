## 1. Scaffold the skill

- [x] 1.1 Run `python3 scripts/skills.py new project-conductor "<description>"` with a "Use when …" description covering onboarding a board for unattended runs
- [x] 1.2 Check the marketplace entry it adds (source `./skills/project-conductor`, no `version`) and add the README Skills-table row

## 2. Write the procedure

- [x] 2.1 Write `skills/project-conductor/SKILL.md`: purpose, inputs (board URL, repository, models, dry run, proceed without asking), rules (survey first, look before write, change only what it manages, never delete except the replaced roster, trusted input), the seven steps, and the report format
- [x] 2.2 Write `skills/project-conductor/references/onboarding-github.md`: preflight checks; per step the read command, the write condition and the write command (variable, fields, settings branch and PR, keys with trust check, approval rule); the owner-step wording; the webhook "pending" line
- [x] 2.3 Include the `repo-run-models.md` template (frontmatter pointer and triggers, role table, reviewer presets section) in the reference

## 3. Static checks

- [x] 3.1 Check the commit hooks are installed, then run `python3 scripts/skills.py validate`, `claude plugin validate .`, `python3 -m unittest discover -s scripts -p 'test_*.py'` and `npm test` (after `pip install -r requirements-dev.txt` and `npm ci`) and a `build-pages` smoke build into a temporary folder

## 4. Live proof on the scratch ground

- [x] 4.1 Create `raidenyn-shadow/task-run-scratch` and `task-run-scratch-bare`, link both to project 5, add the readme and milestone markers, the seeded harness file and roster, and issues A (keyed), P (plan), Z (closed, `/7`, off the board), B and C (keyless, C with CRLF), and a draft item
- [x] 4.2 First run: capture the report, the field read, the PR diff, and byte comparisons of B and C
- [x] 4.3 Second run with the PR open: capture "Nothing changed." with pending items still listed
- [x] 4.4 Merge the scratch PR, run again: settings reused from the default branch
- [ ] 4.5 Issues D (edited by a second account, in the marked milestone) and E (no milestone): run again; both named, neither keyed
- [x] 4.5b Malformed marker M, mismatched-RFC milestone issue X, issue W edited while the plan waits, and V whose key another issue takes meanwhile: all reported, none keyed
- [x] 4.6 Run for `task-run-scratch-bare` with a partial onboarding PR already open: the same PR completed; `.agents/harness.json` holds only the conductor key
- [x] 4.7 Dry run against `raidenyn/line-mcp` with board project 4: before/after snapshots of variables, fields, items and bodies identical; report holds the owner's exact command

## 5. Pull request

- [ ] 5.1 Open the PR with each acceptance criterion and its evidence, contracts changed, differences from the task, effects on later tasks, and discovered work
