# ADR: Archive before the pull request is ready, and let the task thread watch it

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-11-25 |
| Decider | Repository owner (raidenyn) |
| Refines | [PR flow](rfc-run-board-tasks-unattended.md#pr-flow) |

## Context

`line-mcp` and veles require one approval and dismiss it when a new commit is pushed; `line-mcp` also requires approval of the last push. Veles's closeout archives the OpenSpec change after the checks are green, which can fall after the owner's approval; that push would dismiss the approval and cost a second one.

T3 Code can watch a pull request for a thread and wake it. A spike confirmed this from a DeepSeek thread on OpenCode: the thread opened a draft pull request with T3's own tool, started the watch, and was woken with the failed check's name and commit when a failing commit was pushed.

## Decision

We will order the end of a task's run so that the owner's approval is the last step.

1. The task thread opens the pull request as a **draft** when implementation is done.
2. When the checks are green, it archives the OpenSpec change, exactly once, and pushes.
3. The review model reviews the whole head.
4. The thread marks the pull request **ready** and arms auto-merge.
5. The owner approves, and GitHub merges. The merge closes the issue through the closing keyword.

Pull request handling is the task thread's duty from start to merge. The thread holds T3's pull request watch until the pull request is merged or closed, and fixes failed checks, conflicts and review comments itself, with veles's bounded-fixing rules. It acts only on comments and reviews from accounts with write permission.

A fix pushed after the owner's approval dismisses it. The thread reviews the new head and the owner approves again. An approval never stops the agent from pushing a needed fix.

Onboarding checks that the repository requires at least one approval. This repository requires none today, so auto-merge here would merge without the owner until that is changed.

## Options considered

- **Archive after approval.** The push dismisses the approval.
- **Drop the rules that dismiss a stale approval.** An agent could then push anything after approval.
- **The conductor holds the watch and forwards events.** I proposed this after a spike in which a delegated child agent had no watch tool. That result did not hold for an ordinary thread, and the owner kept the duty on the task thread.
- **Disarm auto-merge and return to draft before every later push, or require a commit status that the agent sets on each reviewed commit.** Both would stop a fix from merging before the agent's own review of it ends. The owner put this out of scope for now.

## Consequences

- With a clean run the owner acts once.
- Auto-merge stays armed through a later push (seen in `line-mcp`'s history). If the owner approves a fix quickly, it can merge before the agent's review of that fix ends. The owner's approval is the check; this is accepted.
- The watch did not wake the thread for a comment by the pull request's own account, nor when checks passed in a repository with no required checks. Not yet tested: a review or comment by the owner, a conflict, and the merge itself.
