## 1. Host proofs and proof ground

- [x] 1.1 Prove on scratch threads that `t3_thread_read` returns another thread's sender id as metadata, separate from the text. Record the result and the field in `evidence/01-host-proofs.md`. If there is no such field, stop under "If it does not fit".
- [x] 1.2 Prove that messages carry comparable timestamps, that `t3_thread_configure` without `threadId` returns the caller's own id, and that `clientRequestId` accepts the launch key and returns the same thread on a repeat. Record each result, and the fallback chosen when one is missing (bound by position; find own thread by exact title; a sanitised launch key as the request id).
- [x] 1.3 Prove that `t3_thread_launch` with a worktree on a branch that already exists on the remote (created by `gh issue develop`) checks that branch out. Record it. If it does not, record the fallback (a same-named local branch from `origin/<default>`) and use it in 2.x.
- [x] 1.4 Prepare project 5 of `raidenyn-shadow`:
  - set Status options to Backlog, Ready, In progress, In review, Done;
  - add the Phase field with the `task-publishing` options;
  - check that the three run fields exist.
- [x] 1.5 Prepare `raidenyn-shadow/task-run-scratch`:
  - an OpenSpec setup and an `AGENTS.md` naming its process;
  - provider-qualified model cells in `repo-run-models.md`: plan `claudeAgent/claude-opus-5-5` (`medium`), review `opencode/openai/gpt-6.2-sol` (`medium`), implement `opencode/ollama-cloud/deepseek-v4.1-flash:1017` (`high`; the owner confirmed the id, and `medium` is not offered);
  - the scratch repository registered as a T3 project, and the `.claude/skills/` path proved with `project-conductor` on Claude and OpenCode;
  - every item already on the board (#1 to #12) moved to Backlog, closed or removed;
  - the `project-conductor` key checked.
- [ ] 1.6 Create the keyed test issues in a marked milestone, on the board, with R1 to R3 first so they have the lowest numbers:
  - three Ready tasks;
  - one keyless;
  - one with an open "Ready to start when" condition, in Backlog;
  - one Ready with a linked branch;
  - one to be edited by `raidenyn`.

  Invite `raidenyn` with write access, ask the owner to accept the invite (check that the permission reads `write`), and ask the owner to edit that issue's body. If they do not, mark the second-author case "not done".

## 2. Conductor: wake procedure

- [x] 2.1 Add `references/run-github.md` with the preflight commands: settings and model file from the default branch, the board's fields and options by exact name, `blocked` label creation, and the model listing and resolution rule.
- [x] 2.2 Add the paginated board query: Status, Phase, run fields, assignees, labels, blockers with state and reason, linked branches, closing PRs with head repository and author, body, and edit history with `totalCount`. Check it on the scratch board.
- [x] 2.3 Add the `jq` filter. It prints `start` or `skip <reason>` per item. It decides Ready by exactly the owner's three conditions (a task in the project, no open blocker, Status Ready), and then the start guards (taken, trusted, overflow). Each reason must appear for the prepared issues of 1.6.
- [x] 2.4 Add the claim commands in their order: re-read, launch-key search, assignee, Status, Attempt, Run phase, `gh issue develop` with the sanitised `<type>/<n>-<slug>`, `t3_thread_launch` (title and `clientRequestId` = launch key, plan model and effort, worktree), Run thread. Each one is read back.
- [x] 2.5 Add the start and apply instruction texts and the wake sentence to the reference, verbatim.
- [x] 2.6 Add the Advance commands:
  - collect the reports (triggering message plus kept reports since each claim);
  - drop recorded stops;
  - drop superseded reports;
  - the answer order, with the 5-minute `t3_thread_wait`, the change-folder check, `t3_thread_configure`, the fresh-context queue send, and the Run phase write;
  - the `blocked` label and stop comment format.
- [x] 2.7 Rewrite `skills/project-conductor/SKILL.md`:
  - the new description with the wake triggers;
  - the procedure "Run one wake", with the sections Repair (named, empty), Advance and Start, in that order;
  - the rules;
  - the wake report format.

  Keep the steps of "Onboard a board" unchanged, but rename its Inputs, Rules and Report headings so they apply to onboarding only, rewrite the intro, and update the `project-conductor` marketplace description and README row. Keep `SKILL.md` under about 500 lines.

## 3. Task-run skill

- [x] 3.1 Run `python3 scripts/skills.py new task-run "<description>"` with a "Use when" description naming the start and apply instructions, and add the row to the README's Skills table.
- [x] 3.2 Write `skills/task-run/SKILL.md`:
  - reconcile by the task's Start section on the named branch;
  - plan by the repository's process with today's stops;
  - push, check that no background command runs, send the report and the wake sentence in queue mode with a fresh context, and end the turn;
  - after the switch, implement from the named change folder through to the pull request.

## 4. Live proofs on the scratch ground

- [x] 4.0 Copy both skills into the scratch repository's `.claude/skills/`, and prove that a fresh Claude thread loads both and a fresh OpenCode thread on the implement model loads `task-run`. Re-copy after every skill edit.

- [x] 4.1 Wake the conductor with three Ready tasks and `maxParallel` 2. Record that exactly two threads start, that the board shows assignee, In progress, plan, Attempt 1, the thread id and a linked branch, and that the third stays Ready (criterion 1). Save the board read and the wake report to `evidence/`.
- [ ] 4.2 Record the wake report for the keyless, edited-by-second-account, open-condition and linked-branch issues: each is reported and not started (criterion 2).
- [x] 4.3 Run one started thread through planning, with a codeword given only in a planning turn. Record:
  - the phase report;
  - the switch;
  - the thread's run list (provider and model per run);
  - "Run phase" implement;
  - the coding turn reading the named change folder and failing the codeword probe (criterion 3).
- [x] 4.4 Send four prepared reports, each with the item's Run phase stated: a repeat (handled), one while the thread is busy (not idle; then a manual wake acts), one from another thread (stop), and one with a wrong attempt (stop). Record each answer and the board after each (criterion 4).
- [x] 4.5 Clean up the scratch threads, branches and labels the proofs made, or record what is left on purpose.

## 5. Checks and report

- [ ] 5.1 Run `pnpm install --frozen-lockfile`, `python3 scripts/skills.py validate`, `claude plugin validate .`, `python3 -m unittest discover -s scripts -p 'test_*.py'` and `pnpm run check`. All must pass (criterion 5).
- [ ] 5.2 Write the PR report, including the effect of the model-cell format on onboarding's defaults:
  - each criterion with its evidence;
  - the contracts changed (Run record, Phase report with the `seq` weakening);
  - the differences from the task (Ready = Status Ready, npm → pnpm, the host-proof fallbacks used);
  - the effects on later tasks (Repair's inputs, `project-ready` for `line-mcp`);
  - proposed follow-up tasks.
