## 0. Trigger syntax

- [x] 0.1 On a throwaway trigger, settle the `replayKey` template for `x-github-delivery` and whether the `body.pull_request.merged notEquals false` filter passes issue events. Record the results in `evidence/00-trigger-syntax.md`, and update the design and the spec when they differ.

## 1. Contract change

- [x] 1.1 Add an amendment entry to `openspec/design/archive/2026-11-unattended-task-runs/rfc-run-board-tasks-unattended.md` covering:
  - Settings: the board readme block replaces `PROJECT_URL`, the `harness.json` key and `repo-run-models.md`;
  - the model cell `<provider>/<model>#<effort>`;
  - the conductor serving a board, from a thread that may be in "No project";
  - Onboarding without `PROJECT_URL` and without a PR;
  - 1 task = 1 issue = 1 PR.
- [x] 1.2 Commit the amendment and the change folder as their own commit, separate from the behaviour changes.

## 2. Wake: board as the unit (`skills/project-conductor/references/run-github.md`)

- [x] 2.1 Extend `board.graphql`:
  - the project `readme`;
  - per item: `repository { nameWithOwner owner { login } }`, `milestone { number state }`, the issue `closedAt`;
  - `mergedAt` on the closing pull requests.
- [x] 2.2 Replace the served-repository preflight:
  - the identity check: title `project-conductor <board URL>` and the block's `conductor` equals the own id;
  - the settings block parser with its defaults and gaps;
  - per-repository facts: default branch, permission, the T3 project by `canonicalKey` compared without case.
- [x] 2.3 Change Models to the `<provider>/<model>#<effort>` cell, and make its report lines name the readme block.
- [x] 2.4 Key the filter, judge, claims, stops and claim files by `<repo>#<n>`:
  - take the trust owner per item;
  - retire `other-repo`;
  - add the Ready-filter verdicts `no-project:<repo>` and `gap:projects:<repo>`, read from `repos.json`, with Claim checking again before its writes;
  - run Claim's thread search and the launch in the item's T3 project.
- [x] 2.5 Create the `blocked` label lazily per repository.
- [x] 2.6 Update the Start and Apply instructions:
  - add the `Board:` line;
  - use the new wake sentence;
  - keep accepting the old sentence.

## 3. Wake: Repair, Settle, order (`SKILL.md` and `run-github.md`)

- [x] 3.1 Write Repair:
  - the scope;
  - deciding by `t3_thread_read` when "Run thread" is set, and by search when it is empty;
  - unknown on errors or 50 matches;
  - record, release or stop, as in the table of design Decision 10.
- [x] 3.2 Write the release, in its order and with a read-back per write: branch, Run phase, Attempt, Status, Run thread, assignee.
- [x] 3.3 Add the second Stop form (`Step: Repair|Settle`) and its read-back.
- [x] 3.4 Write Settle:
  - the branch from `t3_thread_read`;
  - the merged-PR lookup with `gh api …/pulls?state=closed&head=`;
  - the 5-minute grace;
  - label before settle when the issue stays open;
  - the 7-day window for closed items.
- [x] 3.5 Add these to the wake: the board read again after Repair or Settle wrote, the end-of-board check, the wake order, and the new report sections. Drop `Repair: not done yet.`.
- [x] 3.6 Update the skill's description: board-based, the wake triggers, Repair and Settle.

## 4. Triggers (`skills/project-conductor/references/triggers-github.md`, new)

- [x] 4.1 Write the two `schedule_task` calls:
  - filters, signature, `replayKey`, `coalesceKey`, `maxDeliveryAgeMinutes`;
  - the `Trigger:` prompts.
- [x] 4.2 Write Register the webhook:
  - read the admin permission first;
  - list and reuse hooks by URL, or create one;
  - the owner's steps text.
- [x] 4.3 Write Check the triggers:
  - list by `projectId` and `boundThreadId`;
  - update in place, re-enable, create the timer;
  - create the webhook trigger only on command, with `request_secret`.
- [x] 4.4 Write the automatic check:
  - the missed-event condition and its exclusions;
  - the bounded backward scan;
  - the unattended form.
- [x] 4.5 Write the end of the board: the condition, skipping Start, disabling the triggers after Advance, settling itself, and the resume command.

## 5. Onboarding (`SKILL.md` and `references/onboarding-github.md`)

- [ ] 5.1 Rewrite "Onboard a board" as the conductor's checklist:
  - preflight with the one-conductor check across every project;
  - rename the thread;
  - fields;
  - the settings block;
  - per-repository checks with keys and the approval rule;
  - the secret through `request_secret`;
  - triggers and webhooks;
  - skills to confirm.
- [ ] 5.2 Remove the `PROJECT_URL`, settings PR, harness key and model-file steps and their reference sections. Keep keys, the approval rule, dry run and "proceed without asking".
- [ ] 5.3 Update the onboarding report:
  - triggers, webhooks and the list of repositories whose webhook is an owner step;
  - no PR or variable lines;
  - the dry-run note for steps that need the conductor thread.

## 6. Task run (`skills/task-run/`)

- [ ] 6.1 Add the rule "1 task = 1 issue = 1 PR": `Closes <owner>/<repo>#<n>` in the pull request body.
- [ ] 6.2 Add the follow-up task rule: key allocation and re-check, body, placement, the blocked-by and blocking links with read-back, the PR's notes, and stopping on a failed write.
- [ ] 6.3 Write `references/follow-up-github.md` with the commands, adapted from `task-publishing`'s blocked-by section.
- [ ] 6.4 Amend the "Only the report line" rule, add the `Board:` field, and update the phase report to the new wake sentence.

## 7. Docs and checks

- [ ] 7.1 Update the `project-conductor` and `task-run` rows in `README.md`.
- [ ] 7.2 Run `python3 scripts/skills.py validate`, `claude plugin validate .`, `python3 -m unittest discover -s scripts -p 'test_*.py'`, `pnpm run check` and `openspec validate conductor-owns-the-board`.

## 8. Live proofs on the scratch board (evidence in `evidence/`)

- [ ] 8.1 Clear the scratch ground:
  - release #15, #16 and #17 by hand (assignee, run fields, `blocked`, Status Backlog, their branches deleted), and set #18 to Backlog;
  - close draft PRs #23–#25;
  - archive their threads;
  - close the old onboarding PR if one exists.
- [ ] 8.2 Write `reconcileMinutes: 2` into the scratch readme block, then onboard project 5 from a new thread in "No project". A second `/project-conductor` from another project must stop and name the first conductor. A repeat run in the conductor thread must report "Nothing changed." and ask for no secret. Record whether the agent can write the readme of a board it owns, and the first onboarding report.
- [ ] 8.3 Repair proofs. Pause the timer while the cases are prepared, and launch threads before writing their fields. Afterwards, release #4 and #5 by hand and re-enable the timer, so that both slots are free for 8.4:
  - an issue assigned by hand with no thread is released;
  - a thread launched with the launch key and an empty "Run thread" is recorded;
  - a live thread with "Run thread" set and nothing pushed is left alone;
  - evidence: board and thread list before and after one wake.
- [ ] 8.3a Identity and project proofs: a renamed title, a block naming another thread, and a repository with no T3 project (`task-run-scratch-2`); then a repeat onboarding run adds `task-run-scratch-2` to `Webhook owner steps:`.
- [ ] 8.4 Webhook and timer proofs, on two prepared pairs: B1 blocking T1, and B2 blocking T2, where T2 does not fit and is reused in 8.8, and T2 blocking D2. Wait more than 120 s after the webhook run before the lost delivery:
  - closing a blocker starts the unblocked task through the webhook;
  - a delivery lost on purpose (hook `active: false`) is made good by the timer wake, and the automatic check runs once; a close in `task-run-scratch-2`, whose hook is an owner step, runs no check;
  - evidence: run list with `Trigger:` lines.
- [ ] 8.5 Signature and dedupe proofs:
  - a GitHub-signed delivery runs;
  - a wrong signature does not;
  - a redelivery of the same delivery id does not run again;
  - two events within 120 s show the coalesce behaviour;
  - an unmerged PR close behaves as Task 0 decided.
- [ ] 8.6 Settle and end proofs:
  - a normal merge settles its thread;
  - a test PR merged with its issue left open gets `blocked` and settles;
  - with "M1 other" closed and "M1 scratch" open, the triggers stay enabled;
  - with both closed and nothing in flight, both triggers are disabled and the conductor is settled, not archived; reopening "M1 scratch" and "check the triggers" re-enables them;
  - evidence: thread states and `list_scheduled_tasks`.
- [ ] 8.7 Run "register the webhook for `raidenyn/line-mcp`" with the scratch URL. Expect a refusal, the owner's steps, and nothing written.
- [ ] 8.8 Follow-up rule proof (run before 8.6): T2 from 8.4, which does not fit, creates a keyed follow-up in Backlog with the blocked-by and blocking links, and its PR closes the original issue.
- [ ] 8.9 Re-enable or delete the scratch triggers as the owner prefers, and record the leftovers.

## 9. Pull request

- [ ] 9.1 The PR reports:
  - each acceptance criterion of #35 with its evidence;
  - the signature and dedupe answer;
  - the contracts changed;
  - the differences from the task (scope widened by the owner, `pnpm`, size);
  - the features removed, with where each went;
  - effects on later tasks;
  - the proposed follow-ups: the hooked rule at finalize once harness M2 exists, and onboarding `line-mcp` with the readme block.
- [ ] 9.2 Sync the delta specs, archive the change in the same PR, and rewrite the Purpose sections of `board-onboarding`, `conductor-wake` and the new `conductor-triggers` spec.
