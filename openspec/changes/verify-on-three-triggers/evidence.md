# Live evidence: verify on three triggers (issue #13)

Hosts: **OpenCode 2.4.1** (`openai/gpt-6.2-sol-fast`) and **Claude Code 2.1.332** (`haiku`), on this server,
2026-11-25. Every check below ran the shipped code from this branch. Evidence was written outside the
hashed tree (the scratch repo's git dir), as plan Task 12 requires.

## 1. Five capabilities with the capability fixture

Scratch repo with `hook-runtime` installed by its CLI and `tests/agent-harness/fixtures/capability-handler`
installed as a tool with a lock entry. The prompt never mentions the `HARNESS_AFTER`, `HARNESS_BLOCK` or
`HARNESS_REDELIVER` markers.

| Capability | OpenCode 2.4.1 | Claude Code 2.1.332 |
|---|---|---|
| Deny before a command | `echo HARNESS_DENY > .git/live/denied-ran` was denied: `denied-ran` never existed, while the allowed control `allowed-ran` did | same: `denied-ran` never existed, `allowed-ran` did; the transcript has `HARNESS_DENY: capability-fixture denied this command` |
| Text after a tool | `HARNESS_AFTER main 1…4` in the tool results (`session.tool.success`) | `HARNESS_AFTER main 1…13` in the transcript |
| Block at turn end and continue | `HARNESS_BLOCK` enqueued twice (`session.inbox.enqueued`), root and child; the model answered it | `HARNESS_BLOCK` in the root's and the subagent's transcripts; both continued |
| Re-delivery after compaction | after `session.compaction.ended`, `HARNESS_REDELIVER` was appended to `system` once (logged by a test-only plugin at the `context` hook) | after `--resume <id> "/compact"`, the model quoted `HARNESS_REDELIVER` |
| Separate state per subagent | the child counted on its own: `HARNESS_AFTER <child session id> 1…4` | the subagent counted on its own: `HARNESS_AFTER a69b7fe8f7ba38202 1…3` |

No capability is missing on either host.

## 2. Three triggers on this repository (OpenCode)

An instrumented worktree of this branch (`git worktree add --detach`), `node_modules` linked, PyYAML on the
server's `PATH`. **Baseline:** `VERIFY_TRIGGER=turn-end node scripts/verify.mjs` passed (exit 0, 50 s).
Then a persistent failure was committed (`skills/live-broken/SKILL.md` without a `description`) and
`verify-gate.command` was wrapped to log each invocation to `<git-dir>/live/invocations.jsonl`.
Run against `opencode serve` (the long-lived server, as in normal use):

| Trigger | Invocation log | What reached the model |
|---|---|---|
| Edit (`patch` creates `live.json` with `{broken`) | `edit live.json`, base set, changed list set | `verify: invalid JSON in live.json: …` and `verify: … failed after the edit of live.json: exit code 1.` |
| Ticked task (`- [ ] 1.1` → `- [x] 1.1`) | `task`, base set, changed list set | `verify: a task was ticked while verification fails. Ticked: …` with `verify: failed (exit 1): python3 scripts/skills.py validate` |
| Turn end | `turn-end` four times | blocked three times (three confirmed charges in `blocks.json` for one failure key), and the fourth passed with the notice |

The same wrapped argv ran on all three triggers. The earlier Claude Code session in this very checkout
also caught a `sed -i` tick live: `verify: a task was ticked while verification fails` reached the model
after the shell call.

**Finding:** with `opencode run --standalone`, the process exits once the session is idle, before the
detached turn-end check finishes, so that check ends as `failed` (fail-open; nothing blocks). Against the
long-lived server it works. The skill should say that one-shot standalone runs do not get turn-end
blocks.

## 3. Slow checks (OpenCode server)

`verify-gate.command` was pointed at a wrapped script that fails after 120 s.

- **120 s task check inside `execute.after`:** the tick of 1.2 ran the 120 s check inside the tool hook,
  and its failure (`live-slow: failed after 120000 ms`) reached the model about 130 s after the session
  started. No hook timeout cut it.
- **A turn end while a run is in flight:** while the first turn-end check (120 s) ran, a new prompt
  (`PING`) was sent to the same session. When the first check settled, its block was **not** delivered,
  because the session had moved on, and its charge was refunded (`blocks.json` had no charges). The
  `PING` turn's end, queued behind it, ran next and its block **was** delivered after its own 120 s, with
  one confirmed charge. The session resumed and queued a further turn end.
- **Shutdown mid-run:** stopping the server during that further 120 s check left no orphan process, and
  the gate lock file was marked `released`.

## 4. Three triggers on this repository (Claude Code)

The same instrumented worktree and wrapper, `claude -p` with PyYAML on `PATH`:

| Trigger | Invocation log | What reached the model |
|---|---|---|
| Edit (`Write` creates `live.json`) | `edit live.json`, base and changed list set | `verify: invalid JSON in live.json: …` |
| Ticked task (`Edit` of 1.1) | `task` | `verify: a task was ticked while verification fails. …` |
| Turn end | `turn-end` four times | three blocks (three confirmed charges), then `verify: still failing after 3 blocks; continuing. Run node .agents/harness/verify-gate/cli.mjs …` |

The failure key matched the OpenCode run's key for the same failure.

**Failure notices (Claude Code):** a handler that always throws let `echo ran-ok > .git/notice-ran` run
(the file exists). `hook thrower failed on tool.before: THROWER_BOOM. THROWER_MANUAL: …`
(`additionalContext` with no permission decision) and the same notice on `tool.after` reached the model,
including after a failing `ls`, which Claude Code sent as `PostToolUseFailure`. Its real payload carries
`tool_name`, `tool_input`, `tool_use_id` and `error`, as the adapter expects.

## 5. Subagent lifecycle

Scratch repo with only the two shipped tools; the command fails while `<git-dir>/live/fail` exists.

**OpenCode server.** A test-only logger plugin recorded session events and cleared the fail flag when the
child resumed:

| t (s) | Event |
|---|---|
| 8.9 | root turn end while the child runs: the check ran and failed, and the root got the **notice** (no block) |
| 13.7 | child turn end: the check failed and the **child was blocked**; at the same moment the root was handed the child's pre-fix result (the OpenCode limit, spike.md) |
| 14.0 | child resumed (fail flag cleared) |
| 16.5 | child finished; its turn-end check passed; the root was handed the child's result **again** |

Then, with the fail flag re-armed and `README.md` changed, the root's own turn end was blocked (the session
ledger counts the child's and the root's blocks together). Cancellation of a second child was **not run**.

**Claude Code.** A background `Agent` edited a file while the check failed. The root's `Stop` while the
subagent ran got the notice (`systemMessage`). The subagent got the failure on its edit, fixed it
(removed the fail flag), and its `SubagentStop` check then passed, so the shipped gate's
`SubagentStop` **block** was not exercised live here. The runtime's subagent block on Claude Code was
shown with the capability fixture (section 1), and the gate's is covered by the unit tests.

## 6. No-change timing

Bench (`node tests/agent-harness/bench-no-change.mjs`, Task 9, 20 runs each, all 20 traced as `no-change`,
zero command invocations):

| Host | Host-to-outcome median | In-runtime median |
|---|---|---|
| Claude Code (spawned `claude.mjs`, includes Node startup) | 272.3 ms | 151.0 ms |
| OpenCode (plugin `setup`, fake event stream) | 49.5 ms | 49.5 ms |

Both are under the 300 ms target. Live traced no-change turn ends (`AGENT_HARNESS_TRACE=1`, outcome
`no-change`, three each):

| Host | Measured from | Times |
|---|---|---|
| Claude Code | Node process start to outcome (excludes the host's own spawn) | 247, 284, 262 ms (in-runtime 153, 175, 167 ms) |
| OpenCode server | the event's `created` timestamp to outcome | 97, 59, 53 ms (in-runtime 89, 52, 48 ms) |

## 7. Follow-up live checks (OpenCode with `ollama-cloud/deepseek-v4.1-flash:1017`)

The three checks that were missing at first, run after the ChatGPT quota ran out:

- **OpenCode notice after a failed tool, through `system`:** a handler that always throws, plus a `read`
  of a missing file, which OpenCode reports with `status: "error"`. Both notices (`hook thrower failed on
  tool.before …` and `… on tool.after …`) were appended to `system` at the next `context` hook call, and
  the model quoted them.
- **Cancelling an OpenCode child:** a test-only plugin called `ctx.session.interrupt` on the child 4 s
  after it started, with a command that always fails.
  - 3.5 s: the root's turn ended while the child ran, and it got the notice (no resume).
  - 6.1 s: `session.execution.interrupted` marked the child idle.
  - From then on, the root's turn ends were blocked three times (three resumes, three confirmed charges),
    and the fourth passed with the notice.
  - In an earlier attempt with a removable fail flag, the root model ran the check itself and removed
    the flag, so its turn end passed legitimately. The always-failing command avoided that.
- **The verify gate's own `SubagentStop` block on Claude Code:** a foreground subagent with an always
  failing command was blocked three times at `SubagentStop` (three confirmed charges), then got
  `verify: still failing after 3 blocks; continuing.` The root's `Stop` got the same notice at once,
  because root and subagents share one limit per session.

## 8. Environment finding

This machine's `python3` had no PyYAML, which `scripts/skills.py` needs (CI installs it from
`requirements-dev.txt`). With the hooks onboarded in this checkout, every full run here failed at
`skills.py validate`, and agent sessions were blocked up to three times per failure, then continued with
the notice. That is the gate working as designed. PyYAML 6.0.4 was then installed into the user
site-packages, and the full check now passes here (49 s). The owner wants the requirement removed (a
follow-up task).
