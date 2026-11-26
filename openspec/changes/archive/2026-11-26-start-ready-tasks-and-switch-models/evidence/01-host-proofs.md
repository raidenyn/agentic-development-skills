# Host proofs (Task 1, 2026-11-25)

All probes ran from the controller thread `808d7ed4-2ae6-4042-8b7b-953cdef32c7d` against the T3 project `task-run-scratch` (`mcp:84ce4bcf-4cde-4084-b7dd-d7ee5ba21f79`, workspace `/home/dev/repos/task-run-scratch`).

## 1. Sender id is metadata

A message sent with `t3_thread_send` to the probe thread `mcp:launch:3ee58189…` appears in `t3_thread_read` (`view: activity`) as a `user_message` item with these fields:

```json
{"position": 0, "sourceThreadId": "mcp:launch:3ee58189…", "messageId": "message:mcp:406b6933-…:thread-send:79f4e70c-…",
 "createdBy": "agent", "creationSource": "mcp", "senderThreadId": "808d7ed4-2ae6-4042-8b7b-953cdef32c7d",
 "type": "user_message", "text": "phase-done raidenyn-shadow/task-run-scratch#0 attempt=1 phase=plan seq=1 head=000…\n…",
 "updatedAt": "2026-11-25T17:11:29.256Z"}
```

- **The sender is `senderThreadId`, separate from `text`.** `sourceThreadId` is the thread that holds the item, not the sender. The design's guess, `sourceThreadId`, was wrong; the wake uses `senderThreadId`.
- A message with no `senderThreadId` (typed by a person) is not a report.

## 2. Timestamps, own id, request ids

- **Timestamps:** every item has `updatedAt`, and every run has `requestedAt`, `startedAt` and `completedAt`. The scan is bounded by time, with no fallback needed.
- **Own id:** `t3_thread_configure` with no arguments returned `{"threadId": "808d7ed4-…", "modelSelection": {...}}`.
- **`clientRequestId`:** a launch with `clientRequestId: "raidenyn-shadow/task-run-scratch#0 attempt 1 probe"` (spaces, `#`, `/`), repeated with the same id, returned the same `threadId` both times. The launch key is used as is; the sanitised fallback is not needed.
- **Thread state:** `t3_thread_read` gives `status` (`idle`, `running`, `completed`, …), `activeRunId`, `pendingRequestCount` and `pendingBackgroundTasks`. Each run lists `providerInstanceId`, `model` and `executedModel`. For OpenCode runs `executedModel` is `null` (as in spike B), so the run list proves the provider and model requested.

## 3. Worktree on an existing remote branch (path A)

1. `gh issue develop 14 --name chore/14-probe --base main` created and linked `chore/14-probe` at `b8f4af5`.
2. `t3_thread_launch` with `workspaceStrategy {type: worktree, baseRef: origin/chore/14-probe, branch: chore/14-probe, startFromOrigin: true}` gave thread `mcp:83e56906-…` with `branch: chore/14-probe` and worktree `/home/dev/.t3/worktrees/task-run-scratch/chore-14-probe-adad9f585aef98a8`.
3. In that worktree, `git rev-parse --abbrev-ref HEAD` printed `chore/14-probe` and `HEAD` was `b8f4af5`, equal to the remote branch.
4. The local branch has no upstream. `git push -u origin HEAD` updated the remote branch, and `gh api repos/…/git/ref/heads/chore/14-probe` then printed the new head `c8b5be3`.

**Result: path A works.** The task thread pushes with `git push -u origin HEAD`. The probe issue #14 is closed as not planned, its branch is deleted, and #14 now serves as R3's "closed as not planned" blocker.

## 4. Skill path

The project-local `.claude/skills/project-conductor/` of the scratch repository (commit `57bd73d`) was named as an available skill by a fresh Claude thread (`claude-haiku-5-5`, `mcp:45a54913-…`) and a fresh OpenCode thread (`opencode` / `ollama-cloud/deepseek-v4.1-flash:1017`, variant `high`, `mcp:bdd523e1-…`). Both answered `project-conductor`.

## 5. Models

`orchestrator_capabilities` with `search: "DeepSeek"` listed `{"providerInstanceId": "opencode", "models": [{"id": "ollama-cloud/deepseek-v4.1-flash:1017", "options": [{"id": "variant", "values": ["low", "high", "max"]}]}]}`. Without `search`, every provider lists `models: []`.

## Side finding

The scratch clone had no git identity. It is now set locally to the agent's (`Shadow`, as in this repository's history). Worktrees of that clone inherit it.
