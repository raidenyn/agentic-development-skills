# Relax PR Size Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the default line and file limits and the size overrun stop from `milestone-breakdown`. Tasks are sized by behavior, criteria and verification only, unless a repository sets its own limit.

**Architecture:** This is a text-only change to Markdown files of `milestone-breakdown` and two lines of `rfc-breakdown`.
- The default Settings lose three rows.
- The sizing prose switches from line counts to "one behavior, one verification path".
- The old size rules move into one section of `task-sizing.md`, "When the repository sets a size limit". That section applies only when a repository sets "Task size, lines of code" or "Task size, files". The other files point to it instead of repeating it.

**Tech Stack:** Markdown skills. Checks: `scripts/skills.py validate`, `claude plugin validate .`, unittest, `pnpm run check`.

**Spec:** `openspec/changes/relax-pr-size-limit/specs/milestone-task-sizing/spec.md`, with `design.md` and `brainstorm.md` in the same folder.

## Global Constraints

- Plain English and short sentences, in the style of the surrounding skill text.
- Refer to settings by their exact names: "Task size, lines of code", "Task size, files", "Task overrun", "Task size, acceptance criteria".
- No skill text asks the person whether to stack pull requests, and no setting or recorded answer exists for it. A stack happens only when the person asks for one unprompted.
- The default Settings table MUST NOT contain "Task size, lines of code", "Task size, files", "Task overrun" or "Stacked pull requests".
- When a repository sets a line or file setting, the overrun stop is the repository's "Task overrun" value, or about 1.5 times the task's estimate.
- Keep `SKILL.md` under about 500 lines.
- Do not touch `feature-rfc`, `task-run`, `harness-audit`, `openspec/specs/` or anything under `openspec/**/archive/`.
- Commits follow Conventional Commits.

## Review Focus

1. **A repository that restores the limit.** It must get sizing against the values, the overrun stop and the size exception, without a stacking question. This comes from the one section in Task 2, step 3, and the pointers to it in Task 1, step 2 and Task 3, step 2.
2. **A dangling reference.** Text that still says "size settings", "S / M / L", "1,000" or "below the limit" outside the repository-limit section. Pinned by the greps in Tasks 1 to 4.
3. **The stacking question is gone.** No sentence anywhere may tell the agent to ask about stacking or record an answer to it. This includes `rfc-breakdown` (Task 4). A stack the person asks for must still pass the dependency checks (Task 1, step 4 and Task 3, step 3). Pinned by the greps in Tasks 1 to 4.
4. **Too-small tasks.** The sentence "A task that is too small is as much a defect" and the section "Signs a task is too small" stay unchanged.
5. **Mechanical changes.** The check that nothing was missed stays (Task 2, step 2).

---

### Task 1: milestone-breakdown SKILL.md

**Files:**
- Modify: `skills/milestone-breakdown/SKILL.md`. Line numbers are as of 1b0db00:
  - 26: Principles bullet
  - 31–55: Settings
  - 128, 149–151, 195, 216, 231: procedure, checks and report

**Interfaces:**
- Consumes: the section title "When the repository sets a size limit" in `references/task-sizing.md`, from Task 2.

- [ ] **Step 1: Principle.** Replace the bullet "Review is the limit, not generation." with **"One behavior, one way to verify it."** Size tasks by behavior and by what the checks can verify inside one pull request, not by line count. Agents review the change, and the person accepts it on its report and evidence.
- [ ] **Step 2: Settings.**
  - Delete the rows "Task size, lines of code", "Task size, files" and "Task overrun".
  - Delete the "Stacked pull requests" row.
  - Reword the note at line 55 to: "The size estimate, and any size setting the repository sets, counts code and configuration, tests included. Documents, generated files and process files … are not counted." Keep the rest of the note.
  - Then add: "There is no line or file limit by default. A repository that wants one adds "Task size, lines of code" or "Task size, files" to its Settings table, and optionally "Task overrun" (default about 1.5 times the task's estimate). Then the rules in [references/task-sizing.md](references/task-sizing.md#when-the-repository-sets-a-size-limit) apply."
- [ ] **Step 3: Procedure.**
  - Line 128: change "fits the task size settings" to "fits the acceptance criteria setting, and any size setting the repository sets".
  - Line 149: change "against the settings" to "by behavior and criteria".
  - Replace the "Ask before stacking" paragraph (line 151) with: "**Stack only on request.** Do not ask whether to stack pull requests. Stack them only when the person asks for it. A behavior that cannot be split into parts that can each be verified alone stays one task. When the repository sets a size limit, that task states the size exception (see [references/task-sizing.md](references/task-sizing.md#when-the-repository-sets-a-size-limit))."
- [ ] **Step 4: Checks and report.**
  - Line 195: change "because the person allowed it for this milestone" to "because the person asked for it".
  - Line 216: change it to "Every task has one behavior and criteria within the setting, and none is too small. When the repository sets a size limit, every task fits it or states its exception."
  - Line 231: change "anything outside the size settings" to "anything outside the settings".
- [ ] **Step 5: Verify.** Run `grep -nE "1,000|Ask before stacking|below the size|allowed it for this milestone|Stacked pull requests \|" skills/milestone-breakdown/SKILL.md`. Expected: no output.
- [ ] **Step 6: Commit.** Run `git commit -am "feat: drop the default line and file limit from milestone-breakdown"`.

### Task 2: references/task-sizing.md

**Files:**
- Modify: `skills/milestone-breakdown/references/task-sizing.md`

**Interfaces:**
- Produces: the section heading `## When the repository sets a size limit`, whose anchor is `#when-the-repository-sets-a-size-limit`.

- [ ] **Step 1: Intro and envelope.**
  - Rewrite the first two paragraphs. A task is one behavior that the checks can verify inside one pull request. Agents can produce and review large changes, so line count is not the limit. The only default number is the criteria setting, and a repository may set a size limit (see the new section).
  - In the envelope, delete the "Changed lines of code" row (line 12) and the "Changed code and config files" row (line 13).
  - Change the Dependencies cell (line 17) to "…and the person has not asked for a stack".
- [ ] **Step 2: Estimates, too-big signs and mechanical changes.**
  - Replace the S/M/L paragraph (line 21) with: "Record a rough estimate of lines and files in the task, so the reviewer knows what is coming. It is not a limit unless the repository sets one. A task with an unclear "done" behaves like a much bigger task, whatever its line count."
  - Under "Signs a task is too big", replace "Any limit in the envelope is exceeded." with two bullets: "Its changes spread over unrelated areas." and "It exceeds a limit the repository sets."
  - Under "Mechanical changes", change "does not count against the line limit" to "does not count against any size limit the repository sets". The next sentence ("Review covers the script and a sample of its output") stays. Keep the paragraph about checking that nothing was missed.
- [ ] **Step 3: Exceptions, stacking and the repository-limit section.**
  - Delete the exception-table row "One behavior that does not split cleanly below the limit" (line 59).
  - Retitle "Stacked pull requests are the person's choice" to "Stacked pull requests only on request". Say that a stack is used only when the person asks for it, and that the skill never asks. Keep these parts:
    - the definition and trade-off sentences;
    - the "merged contract would decouple them" check, reworded to "Before stacking, check whether a merged contract would decouple them. If it would, split instead.";
    - the "each task names the task it sits on" rule.
  - Delete the paragraph at line 68 ("So do not decide this yourself. The first time a milestone has a behavior…"), which holds the question and recording the answer.
  - Change the last sentence to "The one to avoid is a single pull request that carries several behaviors because the agent was able to keep going."
  - Before "## Running tasks in parallel", add `## When the repository sets a size limit`. It applies only when the repository's Settings table sets "Task size, lines of code" or "Task size, files", and holds the old rules:
    - size tasks against those values;
    - a task also stops at the "Task overrun" value (default about 1.5 times its estimate);
    - a behavior that will not split below the limit into parts that can each be verified alone: first check whether a merged contract would decouple the parts (then it is a plain split), otherwise write one task that states the size exception. Do not ask about stacking.
- [ ] **Step 4: Verify.** Run `grep -nE "1,000|lines setting|files setting|below the limit|S is well|Any limit in the envelope|Before asking|ask the person whether|do not decide this yourself" skills/milestone-breakdown/references/task-sizing.md`. Expected: no output.
- [ ] **Step 5: Commit.** Run `git commit -am "feat: size milestone tasks by behavior, not lines"`.

### Task 3: references/task-list-template.md

**Files:**
- Modify: `skills/milestone-breakdown/references/task-list-template.md`. Line numbers: 14, 66, 80, 101, 122, 181, 187–192, 207.

- [ ] **Step 1: Size field.**
  - Line 66: change the cell `S / M / L, ~lines, ~files` to `~lines, ~files`.
  - Line 122: change `**Size:** S / M / L (<rough lines and files>)` to `**Size:** <rough lines and files, for the reviewer>`.
  - Line 207: change the note to "**Size** is a rough signal for the reviewer. It is not a limit unless the repository sets a size setting. See [task-sizing.md](task-sizing.md)."
- [ ] **Step 2: If it does not fit, and the report.**
  - Line 181: delete the clause ", or when the work goes well past the size above (<the task overrun setting, about 1.5 times by default>)", and add "or" before "when the criteria cannot be proved inside this pull request".
  - Add after that sentence: "<Only when the repository sets a size setting:> Also stop when the work goes well past the size above (<the repository's Task overrun, about 1.5 times by default>)."
  - Under "The pull request reports", after "Anything that differs from this task…", add "- The actual size against the estimate, when they differ a lot."
- [ ] **Step 3: Plan header and checks.**
  - Line 14: delete the plan header line `**Stacked pull requests:** <…>`. It recorded the answer to the removed question. A stacked task is already visible under its own "Depends on".
  - Line 80: change it to "- Every task depends only on merged work, or is stacked because the person asked for it: yes / no".
  - Line 101: change it to "- Every task has one behavior and criteria within the setting, and none is too small: yes / no", followed by the placeholder line `<Only when the repository sets a size limit:> - Every task fits it or states its exception: yes / no`, which the breakdown drops when the repository sets no limit.
- [ ] **Step 4: Verify.** Run `grep -nE "S / M / L|task overrun setting|agreement for this milestone|\*\*Stacked pull requests:\*\*" skills/milestone-breakdown/references/task-list-template.md`. Expected: no output.
- [ ] **Step 5: Commit.** Run `git commit -am "feat: make task size informational in the task template"`.

### Task 4: rfc-breakdown, the proposal and the checks

**Files:**
- Modify:
  - `skills/rfc-breakdown/SKILL.md:70` and `:177`
  - `skills/rfc-breakdown/references/breakdown-brief.md:14` and `:26`
- Inspect: `skills/task-run/SKILL.md`, `skills/milestone-breakdown/references/after-the-split.md:15`, and the `README.md` row for `milestone-breakdown`.

- [ ] **Step 1: rfc-breakdown.**
  - `SKILL.md:70`: delete the bullet "whether stacked pull requests are allowed for every milestone of this RFC…" from the "Ask once, together" list. Check that the list's lead-in still reads correctly without it.
  - `SKILL.md:177`: change "anything outside the size settings" to "anything outside the settings". Leave the milestone size overrun wording alone.
  - `breakdown-brief.md:14`: delete the line `- Stacked pull requests: <allowed / not allowed / not decided>`.
  - `breakdown-brief.md:26`: delete the clause " and the question about stacked pull requests when it is not decided above", so the sentence ends "This includes blocking questions."
- [ ] **Step 2: Confirm the files that need no change.** Read them to confirm:
  - `task-run`;
  - `after-the-split.md:15` ("by the person's choice" still holds);
  - the README row ("size for review" still holds).
- [ ] **Step 3: Grep for stale references.** Run `grep -rniE "1,000 changed|30 changed|task overrun setting|S / M / L|below the size settings|allowed it for this milestone|stacked pull requests (are allowed|setting|:)|question about stacked|whether to (split further or )?stack" skills README.md`. Expected: no output.
- [ ] **Step 4: Run the checks.** Run `python3 scripts/skills.py validate && claude plugin validate . && python3 -m unittest discover -s scripts -p 'test_*.py' && pnpm run check`. Expected: all pass. The timing tests in `tests/agent-harness/` may fail under machine load. If one does, rerun that file alone before calling it a failure.
- [ ] **Step 5: Commit.** Run `git commit -am "docs: align rfc-breakdown with the relaxed task size"`.
