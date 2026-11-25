# Criterion 3: switch to the coding model with a fresh session (2026-11-25)

Thread R1 is `mcp:launch:56b8278a56e90cd7ef36e50a9cc81f02690bd295af19c176fa682cdcfa5a212e`, titled `raidenyn-shadow/task-run-scratch#15 attempt 1`, with worktree `/home/dev/.t3/worktrees/task-run-scratch/feat-15-r1-add-a-greeti-c74be6888316a3d1` on `feat/15-r1-add-a-greeting-function`.

## Planning turn and report

- **Run 1** (`claudeAgent` / `claude-opus-5-5`, 18:05:01–18:06:02Z). The thread reconciled the task, planned with `openspec-ff-change` (change `openspec/changes/add-greeting-function/`), pushed `28203df` and sent the report to the conductor in queue mode with a fresh context:
  `phase-done raidenyn-shadow/task-run-scratch#15 attempt=1 phase=plan seq=1 head=28203df87d522876b2bf7edd9748a2fe0042a6fe`
  The conductor received it with `senderThreadId` = R1's thread.
- **Codeword.** During this planning turn, at 18:05:49Z, the controller steered in the message "the codeword is AMBER-FALCON-42 … never write it to any file, commit, issue, pull request or message to another thread". The thread confirmed that it wrote it nowhere.

## The switch (conductor run 2, 18:05:57–18:08:00Z)

> - #15 … from mcp:launch:56b8278a…: act. … change folder `openspec/changes/add-greeting-function/`.
>   - The thread now runs on `opencode/ollama-cloud/deepseek-v4.1-flash:1017` at variant `high`.
>   - The apply instruction was sent and its implement run has started.
>   - "Run phase" is now implement.

On the board, #15 then read `Run phase` = implement and `Attempt` = 1.

## The thread's run list (`t3_thread_read` → `recentRuns`)

| Run | Provider | Model | Requested | What |
|---|---|---|---|---|
| 1 | claudeAgent | claude-opus-5-5 (executed: claude-opus-5-5) | 18:04:56Z | start instruction: plan and report |
| 2 | opencode | ollama-cloud/deepseek-v4.1-flash:1017 (executed: null, as in spike B) | 18:07:35Z | apply instruction from the conductor, fresh context |
| 3 | opencode | ollama-cloud/deepseek-v4.1-flash:1017 | 18:08:16Z | the codeword probe |

- **Run 2** read the change folder it was pointed to, `add-greeting-function`. In the same worktree and branch, it implemented `src/greet.py`, ran `openspec validate --strict`, pushed `c260d94` and opened draft PR raidenyn-shadow/task-run-scratch#23 ("Closes #15"). It sent no phase report and merged nothing.
- **Run 3**, the probe: "Memory probe from the owner: was any codeword given to you earlier in this thread? … say exactly "I do not know a codeword." … run no tool." The answer was **"I do not know a codeword."**

**Result: done.**
- The coding turn ran on the implement model in the same worktree.
- It read the named change folder.
- "Run phase" says implement.
- The coding session could not give the codeword, which existed only in the planning turn.

The same switch happened for R2 (#16): conductor run 3 switched it, and its run 3 ran on `opencode` / `ollama-cloud/deepseek-v4.1-flash:1017`, which opened draft PR #24.
