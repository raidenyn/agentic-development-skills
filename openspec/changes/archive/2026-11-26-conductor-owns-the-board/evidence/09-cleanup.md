# Task 8.9: leftovers after the live proofs

## Removed

- The account-level skill links were removed:
  `~/.claude/skills/project-conductor`, `~/.claude/skills/task-run`,
  `~/.config/opencode/skills/project-conductor` and
  `~/.config/opencode/skills/task-run`. The cache copy that the running OpenCode conductor
  used remains installed; it is not a link into this worktree.
- Both scheduled tasks were deleted:
  `project-conductor webhook` (`scheduled-task:5e9f87cb-f877-44fb-8b7d-9c5d15e39ca8`) and
  `project-conductor timer` (`scheduled-task:f2005dbe-4a5f-406d-993a-3255db5e41ce`).
  `list_scheduled_tasks` for the conductor project returns none.
- GitHub hook `717162700` on `raidenyn-shadow/task-run-scratch` was deleted. Both scratch
  repositories now have 0 hooks. The trigger's signature secret had been cleared by the
  automatic trigger check before it was deleted; see the finding below.
- The temporary T1/T2 branches were removed with their merged pull requests; the T3 branch
  `feat/33-t3-timer-recovered-task` and its worktree are recorded as leftovers below.

## Left in place

- Board project 5 (`task-run scratch`), its readme settings block (the settled conductor's
  id) and its items. The milestones `M1 scratch`, `M1 other` and the second repository's
  `M2 scratch` are closed. The follow-up `task-run-scratch#34` and `task-run-scratch#30`
  (D2) remain open in the closed `M1 scratch` milestone, as the follow-up proof left them.
- `raidenyn-shadow/task-run-scratch` and `raidenyn-shadow/task-run-scratch-2`, their issues
  and the readme of the second repository.
- `raidenyn-shadow/task-run-scratch-2#1` is Ready but has no T3 project; its milestone is
  closed.
- The conductor thread is settled and not archived. Its title and block id still identify it;
  a new onboarding would need it archived first.
- The T3 worktree:
  `/home/dev/.t3/worktrees/task-run-scratch/feat-33-t3-timer-recovered-task-*` (the thread is
  archived; the branch was not merged).
- The old scratch branches and worktrees from earlier proofs (`feat/15…`, `feat/16…`,
  `feat/17…`, `chore/14-probe`, `proof/cross-project-child`, `r3-tmp`) are unchanged.

## Finding: the automatic trigger check cleared the webhook signature

The unattended check updated the webhook trigger to add `dedupe.coalesceKey` and
`maxDeliveryAgeMinutes`; the host accepted a template for `coalesceKey` but the update cleared
the stored signature secret. The trigger then had `webhookSignature` unset while the GitHub
hook still sent `x-hub-signature-256`. The skill now says:

> The webhook trigger's `schedule` is never updated here. On this host, an update that passes
> `schedule` clears the stored signature secret. Only `enabled: true` may be set on the
> webhook trigger. A differing webhook schedule is an owner step: recreate the trigger with a
> new secret and register every repository's hook again.

The trigger and hook were deleted in this cleanup, so the unsecured trigger is gone. A future
onboarding creates a fresh trigger and secret.
