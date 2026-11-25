# ADR: Switch a task thread's model once, and start coding from the saved files

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-11-25 |
| Decider | Repository owner (raidenyn) |
| Refines | [Model switch](rfc-run-board-tasks-unattended.md#model-switch) |

## Context

The owner wants planning on a strong model and implementation on a cheaper one: Opus for the OpenSpec artifacts, GPT-6.2 Sol for reviews, DeepSeek V4.1 on OpenCode for the code. Changing the model of a running task was the part the owner expected to be hard.

The spikes showed what a switch does. Another thread can change an idle thread's provider and model, and the next turn runs there in the same worktree and branch. Each provider keeps its own session: the other side receives a summary of the turns it missed, and that summary dropped items in a test. Hook rules were delivered again after a switch and a gated command was denied, but that delivery state is per provider session. T3 refuses to switch while a background command runs, and the working directory does not carry over.

## Decision

We will keep one thread and one worktree per task, and switch its model once.

- **Roles.** The planning model writes the artifacts. The review model reviews each artifact and the final head as a child agent. The coding model implements with its own subagents, closes out, and looks after the pull request until merge. The models are named in one file only, `.agents/hooked-rules/repo-run-models.md`.
- **The switch.** When the plan is reviewed, the task thread reports the phase and ends its turn with no background command running. The conductor switches the thread to the coding model and sends the instruction for the apply phase.
- **A fresh session from files.** The coding model starts a fresh apply session. Its instruction names the change folder and what to read. Nothing in the planning chat is needed, because everything decided there is in the reviewed artifacts. The owner's reason: a fresh session on saved files is better and saves context.
- **Reviews.** At most 5 rounds per artifact and for the final review. If a critical or high finding is still open after that, the review model is started once more to make the fix, and the author checks it once. A reviewer runs with the host's read-only restriction where it has one (plan mode, or an agent definition without write tools) and is otherwise trusted.

## Options considered

- **A new thread per phase.** A clean handoff, but two threads per task, and the pull request watch and the owner's view split.
- **The planning model stays in charge and delegates implementation.** It keeps the context but pays the planning model's price for the whole run.
- **Carrying the planning chat across the switch.** The summary is lossy, and the owner prefers a fresh session.
- **Switching back to the planning model for pull request care.** A second switch resumes a stale session; not needed, since T3's pull request watch works on OpenCode threads.
- **Comparing the tree before and after each review** to enforce read-only. The owner chose to trust the model and not overcomplicate.

## Consequences

- The artifacts must be complete enough to implement from. This is what the review gate already checks.
- The stop predicate for unattended runs must read the run mark in the worktree, not session history, because the coding session is new.
- T3 does not record which model ran an OpenCode child agent, so that a review ran on the review model rests on the request and the model's own statement.
- OpenCode agent definitions can pin a subagent to a model, so the coding model can call a reviewer on the review model as a native subagent.
