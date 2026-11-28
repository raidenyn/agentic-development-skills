## 1. milestone-breakdown SKILL.md

- [ ] 1.1 Rewrite the principle "Review is the limit, not generation" around agent review, one behavior and one verification path
- [ ] 1.2 Remove the "Task size, lines of code", "Task size, files" and "Task overrun" rows from Settings, delete the "Stacked pull requests" row, reword the "Task size counts" note, and add the override sentence pointing to the repository-limit section
- [ ] 1.3 Update the "Task size counts code and configuration" note, the single-task shortcut ("fits the task size settings"), "Size each task", and remove "Ask before stacking"
- [ ] 1.4 Update the checks ("Every task fits the size settings…", "A task depends only on merged work") and the report ("anything outside the size settings, any stacked pull requests")

## 2. references/task-sizing.md

- [ ] 2.1 Rewrite the intro, and drop the lines and files rows from the envelope, keeping behavior, criteria, coverage, verification and dependencies
- [ ] 2.2 Replace the S/M/L paragraph with the informational estimate, and update the "too big" signs and the mechanical changes wording
- [ ] 2.3 Remove the size-triggered row from the exception table, reword the stacked pull requests section to apply on request, change "the one to avoid" to a pull request with more than one behavior, delete the stacking question and the recorded answer, and add the section "When the repository sets a size limit" (sizing, overrun, size exception; no stacking question)

## 3. references/task-list-template.md

- [ ] 3.1 Change the plan table's Size cell, the **Size** line and the "Notes on the fields" Size entry to a rough lines and files estimate
- [ ] 3.2 Remove the size stop from "If it does not fit", keeping the scope stops, with a note that a repo-set size setting adds the overrun stop back, and add "actual size against the estimate" to the pull request report
- [ ] 3.3 Update the plan checks (size, and "stacked with the person's agreement") and delete the "Stacked pull requests" plan header line

## 4. Other references and checks

- [ ] 4.1 Update `rfc-breakdown`: delete the stacking bullet from SKILL.md's "Ask once" list, fix the "size settings" report line, and delete the stacking line and question clause from breakdown-brief.md; confirm `task-run`, after-the-split.md and the README row need no change
- [ ] 4.2 Grep `skills` and `README.md` for "1,000 changed", "30 changed", "task overrun setting", "S / M / L", "below the size settings" "allowed it for this milestone" and the stacking question phrases, and confirm no output ("Task overrun" inside the repository-limit section and the Settings note is expected)
- [ ] 4.3 Run `python3 scripts/skills.py validate`, `claude plugin validate .`, `python3 -m unittest discover -s scripts -p 'test_*.py'` and `pnpm run check`
