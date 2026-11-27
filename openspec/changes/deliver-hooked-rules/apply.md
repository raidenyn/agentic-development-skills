# Apply Receipt

**Change**: `deliver-hooked-rules` (issue #16)
**Iteration**: `1`
**Applied at**: `2026-11-27 13:45`
**Executor**: `subagent-driven-development`

---

## Workspace

- **Worktree**: `/home/dev/.t3/worktrees/agentic-development-skills/t3-ebb73c1f-4bfeaeef6834c54f`
- **Branch**: `feat/openspec-ff-change-issue-16`

---

## Commits

- **Range**: `1b0db00..HEAD` (HEAD is the receipt commit)
- **Count**: `25` (including the change scaffold, the unrelated test-margin fix `157ebeb`, and the final fix wave)

---

## Tasks

- **Completed**: `27 of 27` checkboxes in tasks.md flipped to `- [x]`
- **Remaining**: none

---

## Live evidence for the goals of #16

Recorded by the Task 6 runs; raw traces in the worktree's git dir
(`agent-harness/hook-runtime/trace.jsonl`) and the consolidated evidence with
transcript excerpts in `evidence/task-6-live-evidence.md`.

| Goal | Evidence | Verdict |
| --- | --- | --- |
| A rule is delivered at a skill | OpenCode session `ses_de2d4e274ffeqike0q4wB0xnJv` and Claude session `dc4be8c6-…`: `repo-harness-tools` body attached after the first `Skill` call (`skill:agent-harness-hooked-rules`); a second call in the same context delivered nothing | observed |
| … after a successful command | Same sessions: body delivered after `pnpm run build` (exit 0), trigger `command:\bpnpm\s+(run\s+)?(build\|harness:update)(?=\s\|$)` | observed |
| … and as a one-time denial before a gated command | Same sessions: first `git commit --allow-empty -m "test: live gate"` denied with `repo-commit-types` text; the identical retry ran; both ledgers end `state:"delivered"` | observed |
| On OpenCode and Claude Code | OpenCode 2.4.1 (`skill` tool, input `id`) and Claude Code 2.1.332 (`Skill` tool, input `skill`) | observed |
| The handler holds no host knowledge | Runtime normalizes `skill`, `skillVia`, `ok` (spec `agent-hook-runtime`); adapters are the only host-aware code | unit + live |
| Plain Read still loads no handler on Claude Code | `Read` of `src/a.mts` traced `skipped:"no-subscriber"` | observed |
| veles's format parses unchanged | `tests/agent-harness/hooked-rules-grammar.test.mjs`, including veles's commit-types gate patterns, `gh pr create\|edit`, raw CRLF size, BOM, U+2028 values | unit |
| Install, update, check, pointer block | `tests/agent-harness/hooked-rules-cli.test.mjs`; this repository runs `check` and `pointers --check` in `scripts/verify.mts` and CI | unit + repo |
| This repository delivers hooked rules | `.agents/hooked-rules/repo-commit-types.md`, `repo-harness-tools.md`, generated block in `AGENTS.md`; live runs above | observed |

The `/agent-harness-verify-gate` prompt reached the `prompt` hook on both hosts and delivered
`repo-harness-tools`. On Claude Code the transcript shows the rule body in the
`UserPromptSubmit` attachment; on OpenCode the injection is not persisted in
`session export`, so that delivery is evidenced at the handler boundary only.

---

## Parked at the fix-loop cap (Task 3)

- **Stale-takeover residual** — accepted, not fixed: requires a crashed holder plus a pause
  between the final canonical-token read and the ledger rename; POSIX has no compare-and-rename
  and Node exposes no `flock`. Same-process calls are serialized by a mutex. Worst case is a lost
  ledger update during crash recovery (an extra delivery, or one extra denial), never a block.
- **Compaction deadline behind the queue** — fixed in the final fix wave: `bump` now appends to
  `compactions.log` directly, after one clock sample and the final abort/deadline check, so it no
  longer waits behind a ledger operation.
- **Retired worker's ledger lock** — fixed in the final fix wave: the ledger acquires a hook
  worker's supervisor-owned `context.lock`, which the supervisor releases when that worker
  generation retires, instead of a host-pid-keyed `ledger.lock` that would stay live forever.

---

## What is left to later work

- **#17** — `requires` and `exempt` with named proofs, and the proofs they name. This version
  rejects both keys as unsupported; veles's rule files that use them stay invalid until #17.
- **#18** — `stops`, the OpenSpec stop reminder, the `opsx:` skill aliases and apply-skill arming.
  `stops` is rejected here, and an `opsx:` name matches only literally in this version.
- **#23** — running veles's full rule-case suite and onboarding veles and line-mcp. Only the
  grammar, two gate patterns and the moments are ported and tested here.
- **Follow-ups recorded but not done** — a match-time guard for pathological regexes (a
  synchronous match can run past the handler deadline; the supervisor can only terminate the
  worker afterwards), and recovery when a lock's release fails mid-flight.

## Residual findings accepted before merge

- **Failed unlock can strand a context's lock** — if the supervisor's release throws, the
  ownership record is dropped and a later acquisition can treat the lock as live until restart.
  The direction is fail-open (no deny), and the trigger is a filesystem error in the release path.
- **Directory failure at a contended `session.start`** — the handler returns before reading the
  rules folder, so an unreadable folder is reported at the next non-contended startup rather
  than on that one.
- **Write before the unlock acknowledgement** — the ledger is written after the abort/deadline
  check but before the supervisor confirms the unlock; a retirement in that window can record a
  delivery the host never showed.
- **Worker contention fails open immediately** — a briefly held worker lock no longer retries for
  up to a second as design D5 describes; the call passes and records nothing.

---

## Next step

Run `/opsx:verify` on this change.
