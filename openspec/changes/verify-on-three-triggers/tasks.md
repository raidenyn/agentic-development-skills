## 1. Host spike (OpenCode first, then Claude Code)

- [x] 1.1 OpenCode 2.4.1 in a throwaway repo: the plugin loads as `index.mjs` from `.agents/harness/hook-runtime/opencode/`; deny, context after a tool, block and resume, compaction re-delivery through the `context` hook, and child sessions with `parentID` all work. Payloads are in `tests/agent-harness/fixtures/opencode/` (see `spike.md`)
- [x] 1.2 Claude Code 2.1.332 in a throwaway repo: deny, `additionalContext`, `Stop` block, `SessionStart` source `compact` and `agent_id` all work. Compaction fires an internal `SubagentStop` (`agent_type: ""`), and subagents run in the background. Payloads are in `tests/agent-harness/fixtures/claude/`
- [x] 1.3 Findings written into `spike.md`, `design.md` (D2–D5, Risks, Open Questions), `brainstorm.md` and the specs. No capability is missing on either host

## 2. Shared tool libraries

- [x] 2.1 Scaffold both skills with `python3 scripts/skills.py new` (`agent-harness-hook-runtime`, `agent-harness-verify-gate`) and add `assets/<tool>/tool.json`; extend `npm test` with `tests/agent-harness/*.test.mjs`
- [x] 2.2 `lib/config.mjs`: load `.agents/harness.json`, return one tool's section, reject unknown own keys, ignore other tools' keys; tests
- [x] 2.3 `lib/state.mjs`: `<git-dir>/agent-harness/<tool>/sessions/<host>-<session>/<agent>/` folders; the monotonic generation lock (`gate.lock.<n>` claimed by hard-linking a complete temp file to `n+1`, owner only if still highest after the claim, the highest file never deleted, release marks its own file `released`, takeover only from a dead pid, never by age); `writeJsonAtomic`; tests including two contenders and the paused-stale-contender interleaving at a deterministic barrier
- [x] 2.4 `lib/install.mjs`: copy with sha256 lock, idempotent repeat, refuse on an edited copy with no override, version mismatch to `update`, update removing dropped files, every refusal decided before any write; tests for the five RFC cases against throwaway git repos
- [x] 2.5 Host-config merge in `lib/install.mjs` for `.claude/settings.json` and `opencode.json`, used by both `install` and `update`: create when absent, keep foreign entries and order, no duplicates, refuse non-JSON with a manual line and leave the repo unchanged; tests including foreign entries and through the public CLIs
- [x] 2.6 Byte-identity test: the shared `lib/` files are identical in both tools' `assets/`

## 3. Hook runtime

- [x] 3.1 `lib/runtime.mjs`, `lib/supervisor.mjs`, `lib/worker-entry.mjs`: every handler in its own worker under a supervisor on both hosts; the supervisor spawns all processes and holds the gate lock for workers, and cleans both up when a worker ends; messages carry worker generation and request id; handler discovery from `lock.json` and `tool.json`, lock check before import, dispatch in name order, result validation per event (`compact` takes none), merge rules; tests
- [x] 3.2 Deadlines and fail-open: a work budget (the handler's timeout, else config, else 5 s) plus a separate 6 s cleanup budget, capped by the host timeout on Claude Code; results after a handler's deadline discarded; a 2 s loading bound on both hosts; per-event `timeouts`, `hook-runtime.deadlines`, 5 s default; referenced timers; `context.signal` aborted at the deadline; failure notice with the handler's `manual` text on events with a model channel; `context.trace` and `AGENT_HARNESS_TRACE`; failure tests (throw, reject, timeout on a text event in a spawned process, invalid result, budget exhausted, a stuck import)
- [x] 3.3 Named proofs: registration, `context.proof(name)`, unknown and throwing proofs; tests
- [x] 3.4 `lib/claude-adapter.mjs` and `claude.mjs`: stdin event to normalized event, the agent context id from `agent_id`, `background` from running subagent `background_tasks` on `Stop` only, `PostToolUseFailure` mapped to `tool.after`, the `PreToolUse` failure notice as `additionalContext` without a permission decision, `ack` awaited until `acked` before exit, the internal `SubagentStop` (`agent_type: ""`) dropped, results to Claude Code hook JSON, `main()` returning `{text, ack}` with `ack` called in the write callback, flush then `process.exit(0)` on every path; tests against the fixtures and a spawned `claude.mjs` with broken config
- [x] 3.5 `lib/opencode-adapter.mjs` and `opencode/index.mjs`: deny by a thrown `Error`, context appended to `result.content` only, the `parentID` walk (unknown identity is root), `session.start` on the first event seen for a session, the child lifecycle state machine for `background`, handlers loaded through the supervisor at `setup` (one event per worker, a pool of up to 4 per handler; `ack` awaited until `acked`; `dispose` returns within 1 s while cleanup finishes before locks are released), detached turn-end work with one slot per session and a FIFO of `{event, generation}` (every turn end runs, each with a budget that starts when it runs), a start generation per session and superseded-result suppression, a synthetic resume for a block with `ack` after it resolves, one-shot compaction re-delivery through the `context` hook after `session.compaction.ended` (the mark kept in state), bounded dispose; tests with a fake `ctx` built from the fixtures
- [x] 3.6 `cli.mjs install | update | check | capabilities` for hook-runtime, with the capability table and the missing-capability check at `session.start`; tests
- [x] 3.7 Fixture handler `tests/agent-harness/fixtures/capability-handler/` that exercises all five capabilities (deny a marker command, add context after a tool, block the first turn end of each agent and then continue, re-deliver a marker after compaction, count per agent context); unit test through both adapters

## 4. Verify gate

- [x] 4.1 `lib/tree.mjs`: content key `{tree, stat}` from a private index built with `git read-tree HEAD` and kept in the state folder. Stat comes from filesystem `lstat` (path, mode, ctime, mtime, inode, size), git runs with `core.trustctime=true` and `core.checkStat=default`, and tracked-but-ignored membership is reconciled against the real index (`git rev-parse --git-path index`) on each call. Tests:
  - the same key after an unchanged commit, and two no-change calls equal;
  - the key changes on a tracked, untracked, LF-to-CRLF, `assume-unchanged`, same-size-restored-mtime or lowercase-filter edit, and on an edit in the racy-git second, including in a repo with `core.trustctime=false`;
  - ignored files are ignored, and force-tracked ignored files count;
  - linked worktree, real index untouched, reuse, corrupt-index rebuild
- [x] 4.2 `lib/run.mjs`: argv spawn without a shell, `VERIFY_*` environment, the changed-file list as the union of the private-index diff, the real index's untracked files and stat changes since the last pass, the exit status with the signal name, process-group timeout and abort signal with SIGTERM then SIGKILL, resolving only when the whole group is gone, 1 MiB cap, 60-line tail, spawn errors as failures; tests including a leader that exits on SIGTERM while a descendant traps it and the changed list for LF-to-CRLF and `assume-unchanged` edits
- [x] 4.3 `lib/triggers.mjs`: edit-file extraction, `taskFiles` glob matching, one tick detector (unticked-fall plus ticked-rise per item key between the call's before-image and the file afterwards), deduplicated only against ticks recorded after the call began; an added done item and a new ticked file are not ticks; tests from both tick fixtures' texts, moved and ticked, reorder, duplicate labels, re-tick after an untick, overlapping calls, CRLF and bullets, and the identical-label swap as a known non-detection
- [x] 4.4 `handler.mjs`:
  - the three triggers, the no-change shortcut with `trace("no-change")`, the pass record written only by a full run with equal keys before and after, deleted on full failure;
  - the gate lock and its contention notice;
  - a full run at every turn end, subagents included, with a notice instead of a block while `background > 0`;
  - bounded blocks: `min(maxBlocks, 3)` per session and failure key, shared by the root and its subagents (exact argv, exit status with signal name, volatile-field normalization that keeps decimal codes and covers Node TAP `duration_ms`), plus the 10-block backstop, reserved before delivery and committed in `ack` or released in `release`, with expiry;
  - contended full runs and edit checks wait for the lock until their deadline;
  - `tool.callId` matches a shell call's `tool.before` and `tool.after`;
  - ticks from call-scoped before-images (`calls/<callId>.json`, for shell and edit calls) written at `tool.before` without the lock and compared at `tool.after`; the snapshot is never refreshed by a run;
  - the `verify-pass` proof, the `manual` text, `timeouts` from `timeoutSeconds`.

  Wrapper tests include the edit-pass-then-turn-end-fail sequence, the per-trigger handover of trigger, file, base and changed list, two real processes, a timed-out run writing no record, and failure keys (`E101` vs `E202` distinct, SIGSEGV vs SIGABRT distinct, an 8-digit decimal code kept, a changing temp path the same).
- [x] 4.5 Proof tests: `verify-pass` holds after a full pass, still holds after committing unchanged content, fails after any edit (including LF to CRLF) or config change, never holds after only edit runs, reports "verification is running" while the lock is held
- [x] 4.6 `cli.mjs install | update | check | run` for verify-gate: refuse without hook-runtime, add a `{"command": []}` section stub, `check` fails until the command is set and rejects `maxBlocks` outside 1–3; tests
- [x] 4.7 `tests/agent-harness/bench-no-change.mjs`: median of 20 no-change turn ends per host, host-to-outcome and in-runtime, counting only traced `no-change` outcomes, with zero command invocations asserted

## 5. Skill text, catalog and CI

- [x] 5.1 `skills/agent-harness-hook-runtime/SKILL.md`: when to use it, the interface for handler authors (with the additive fields), the capability table, the synchronous-handler limit, Onboard, Update, the rollback and the untrusted-checkout warning; README row and marketplace entry
- [x] 5.2 `skills/agent-harness-verify-gate/SKILL.md`: the one command and its `VERIFY_*` handover, the triggers (every turn end, the background notice), making the command fast (related-test support first), config keys, limits (A→B→A during a run, a conservative stat digest, ignore build output), Onboard, Update and the untrusted-checkout warning; README row and marketplace entry
- [x] 5.3 Python test in `scripts/test_skills.py`: build Pages from the real repo and assert both skills and every file under their `assets/` are in `opencode/index.json` and in the output
- [x] 5.4 `.github/workflows/validate.yml`: a Node 22.0.0 job running `node --test "tests/agent-harness/*.test.mjs"`. (version-bump enforcement and its base fetch are deferred to a follow-up task)

## 6. Onboard this repository

- [x] 6.1 `scripts/verify.mjs`: `edit` checks the one file by type, `task` and `turn-end` run `skills.py validate`, the Python unit tests, `npm test` and both tools' `check`; tests for the edit dispatch
- [x] 6.2 Run both `install` commands from `skills/*/assets/`, write `.agents/harness.json` with `command: ["node", "scripts/verify.mjs"]` and `base: "origin/main"`, review the generated `.claude/settings.json` and `opencode.json`, and add the verify line to `AGENTS.md`
- [x] 6.3 After the installs in 6.2: add `check` for both tools to `validate.yml`, and add `vendored.test.mjs` (byte parity of the vendored copies with the assets)
- [x] 6.4 Run every standard check: `python3 scripts/skills.py validate`, `claude plugin validate .`, `python3 -m unittest discover -s scripts -p 'test_*.py'`, `npm test`, and both `check` commands

## 7. Live evidence (OpenCode first, then Claude Code)

- [ ] 7.1 OpenCode, with an invocation log, a denial sentinel that matches the deny rule plus an allowed control, the trace, and markers not mentioned in the prompt:
  - in a throwaway repo with the fixture handler, show all five capabilities;
  - in an instrumented worktree of this repo, with dependencies installed and a passing baseline first, show an edit that fails a check, a ticked task while a check fails, and a turn end while a check fails, each reaching the model from the same command;
  - show a 120 s task check, a delayed block, and a turn end during a run;
  - with only the shipped tools installed, capture one child's start, its blocked turn end, its resume, its finish, and another child's cancellation (`ctx.session.interrupt`); record whether the parent sees the child's completion before the child's block; save them as fixtures; show the root's notice while a child runs and its block after both have stopped;
  - record the host version
- [ ] 7.2 Claude Code: the same runs, plus a background subagent's blocked turn end and the root's notice; record the host version
- [x] 7.3 Measure the no-change turn end on both hosts against 300 ms, reported separately: the bench's host-to-outcome and in-runtime times, and live host-to-outcome (OpenCode from the event's `created`; Claude Code from Node process start, which excludes the host's own spawn time, as stated)
- [ ] 7.4 Write the PR report:
  - each acceptance criterion with its evidence;
  - the contracts and areas changed;
  - deviations: the additive fields (`timeouts`, `manual`, `ack`, `release`, `signal`, `trace`, `background`, `tool.callId`), the owner's turn-end decision, the stated limits, any missing capability, the OpenCode plugin path answer;
  - effects on M2 and M3 and on the onboarding tasks;
  - discovered work as proposed tasks, including the deferred version-bump enforcement.
