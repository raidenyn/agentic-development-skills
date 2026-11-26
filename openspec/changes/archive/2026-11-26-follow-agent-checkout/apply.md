# Apply Receipt

**Change**: `follow-agent-checkout`
**Iteration**: `1`
**Applied at**: `2026-11-26 13:38`
**Executor**: `executing-plans` (done in this session with TDD, then one final code-review subagent; the plan had three Fable reviews before apply)

---

## Workspace

- **Worktree**: `/home/dev/.t3/worktrees/agentic-development-skills/t3-7864d395-880bb742b343295d` (the T3 worktree this session runs in; no nested worktree)
- **Branch**: `feat/openspec-ff-change-59`

---

## Commits

- **Range**: `b1bd220..5b7ddc7`
- **Count**: `7`

---

## Tasks

- **Completed**: `15 of 17` checkboxes in tasks.md flipped to `- [x]`
- **Remaining**: `5.2` (open the PR), `5.3` (link the Pages release after merge)

Evidence: the full `pnpm run check` passes (368 tests); `python3 scripts/skills.py validate`, `claude plugin validate .` and the Python unit tests pass. The live headless Claude Code run in a throwaway repo was blocked 3 times by the worktree's failing verify command, then passed with the limit notice. Its trace was in `.git/worktrees/wt/agent-harness/hook-runtime/trace.jsonl`, and 3 confirmed charges were in the common-dir `blocks.json`.

Deviations from plan.md: the new Claude entry tests are in `tests/agent-harness/claude-checkout.test.mjs`, and the ledger and state tests in `tests/agent-harness/ledger-worktree.test.mjs`. New files, so `claude-adapter.test.mjs`, `verify-handler.test.mjs` and `state.test.mjs` stay unchanged. Review fixes added: the symlink spelling is kept for worktrees, `capabilities` is not passed to the delegate, the ledger lookup is lazy with a 2 s git timeout, and there is a real 2 s hang test.

---

## Next step

Run openspec-verify-change, then finalize (push and open the PR).
