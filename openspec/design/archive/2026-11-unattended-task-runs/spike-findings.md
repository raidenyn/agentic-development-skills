# Spike findings: running board tasks unattended

Evidence for [the RFC](rfc-run-board-tasks-unattended.md), collected on 2026-11-25. Each spike ran in its own agent thread with written questions. The full transcripts stayed in the session's scratch folder and are not in the repository; this file is the record.

## 1. First switch test (scratch thread)

- **Question:** can a T3 thread move from Claude to OpenCode with DeepSeek mid-task?
- **Result:** a switch from inside the thread's own turn is rejected ("has an active turn"). Another thread can switch it while it is idle, and the next turn runs on the new model in the same folder.

## 2. Spike A: conductor mechanics (Sonnet, scratch threads)

- Messages sent in **queue mode** ran in order with no overlap. `auto` mode steered a running turn when the queue was empty.
- A scheduled task bound to a thread with a **fresh session** ran there without the earlier context. A later ordinary message resumed the old session; a message sent with a fresh context started a new one.
- **Only the thread itself** could bind a scheduled task to it.
- A scheduled run triggered while the thread was busy **queued** behind the turn; two quick triggers both ran, one after the other.
- A **webhook** task returned a URL. Matching and filtered calls both got HTTP 202 and only matching ones ran, including identical repeats. Request data reaches the run only through templates, marked untrusted.
- A thread could **disable and delete its own triggers and settle itself**. Archiving itself failed its own run. A settled thread is woken again by a send or a webhook; an archived one rejects sends.
- A new or renamed thread was **findable by title at once**. Search matches by word prefix and skips archived threads.
- A thread **waiting on a question shows as running**; only its pending-request count reveals it. A queued message waits behind it. No heartbeat field exists.
- **Not tested:** signatures, dedupe, offline delivery, restarts, real hangs or provider failures.

## 3. Spike B: the coding model as a delegated child (DeepSeek on OpenCode)

- Its own subagents ran **in parallel**. An OpenCode agent definition pins a subagent to another model; a `reviewer` agent ran on GPT-6.2 Sol.
- It started a **GPT-6.2 Sol child and a Claude child** through T3, and completion woke it.
- T3 does **not record the executed model** for OpenCode children. A reviewer's read-only mode is an instruction, not a permission.
- A message to another thread arrived **with the sender's thread id**.
- It switched another thread's model in both directions.
- It had **no pull request watch tool**. This held only because it ran as a delegated child; see spike E.

## 4. Spike C: the switch in a real repository (Sonnet driving a veles worktree thread)

- After Claude to OpenCode: **same worktree and branch**, rule text delivered again, and a dry-run commit **denied** by the repository's plugin with the right rule text.
- **Each provider keeps its own session.** The other side receives a summary of the turns it missed; in this test the summary omitted items on all three switches. The owner uses switching daily in the T3 interface without this problem, so the loss may be specific to the test; the design does not depend on it either way.
- Rule and gate state is **per provider session**: after a second switch to OpenCode the gate did not deny again.
- T3 **refused a switch while a background command ran**. The working directory did not carry over.
- First token after a switch: 4.8 s and 6.9 s, one sample each.
- **Read, not tested:** veles's stop predicate arms only if the same session invoked apply.

## 5. Spike D: GitHub (Sonnet, read-only)

- One custom query reads a whole board with every blocker's state for **3 of 5,000 hourly points**. `gh project item-list` returns 30 items by default.
- Blockers come with state and reason. An issue's author, editors and revisions are readable, for fewer than 100 edits.
- A **stranger's fork pull request** appeared among an issue's closing pull requests.
- **No veles issue has a task key** or "Ready to start when" text; `line-mcp`'s issues have both.
- Project fields: 50 per board, **no compare-and-set**, no history except Status.
- Project webhooks are **organization-only**. A failed delivery is **not retried** and can be redelivered for 3 days.
- The agent account has write access, **not admin**, so it cannot list or create repository webhooks.
- **Auto-merge stayed enabled** through a dismissed approval and a later push, in `line-mcp`'s history.
- `line-mcp` and veles (default branch `master`) require one approval and checks; this repository requires neither.

## 6. Spike E: pull request watch from an ordinary OpenCode thread (DeepSeek)

- **Question:** does T3's pull request watch work for a thread on OpenCode with DeepSeek?
- **Done:** an ordinary thread in its own worktree opened draft pull request #26 in this repository with T3's own tool, started the watch until merge, and ended its turn. A failing commit was then pushed to the branch.
- **Result:** the thread has the watch tool. T3 woke it about three minutes after the push with the failed check's name, its link and the commit. The thread stayed on DeepSeek.
- **No wake** for a comment by the pull request's own account, nor when the first commit's checks passed (this repository has no required checks).
- **Not tested:** a review or comment by the owner, a conflict, the merge.
- **Cleanup:** the pull request is closed and its branch deleted.

## 7. Board fields (scratch board on the agent account)

- **Done:** on a new board "task-run scratch" owned by `raidenyn-shadow`, the fields "Run phase" (single select), "Attempt" (number) and "Run thread" (text) were created, written on one item, read back and cleared, with `gh`.
- **Result:** all worked with the current token. A 2,000-character text value was rejected.
- **Not tested:** writing these fields on a board owned by the owner's account, where the agent already writes Status.
