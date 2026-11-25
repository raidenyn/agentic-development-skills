## Design Summary

Source: [issue #13](https://github.com/raidenyn/agentic-development-skills/issues/13), milestone M1 of the accepted RFC
[`rfc-split-agent-harness-into-node-skills.md`](../../design/archive/2026-11-agent-harness/rfc-split-agent-harness-into-node-skills.md).
The RFC and the issue fix the scope, the three contracts (Skill names and Vendored tool layout frozen, Hook
handler interface provisional) and every agreed decision. The brainstorm only settles the issue's "open
choices", which the issue gives to the implementer. Each one below is the implementer's call, not
something the owner agreed to, and is listed again in the pull request.

What gets built, in one pass:

- Two new skills, `agent-harness-hook-runtime` and `agent-harness-verify-gate`. Each one keeps its tool under
  `assets/<tool>/` (`hook-runtime`, `verify-gate`) and has a marketplace entry, a README row, an Onboard
  section, an Update section and the untrusted-checkout warning.
- The **hook runtime**. A Claude Code adapter is one command, `node .agents/harness/hook-runtime/claude.mjs`,
  registered for every hook event and dispatching on `hook_event_name`. An OpenCode adapter is a plugin
  module that OpenCode imports from `.agents/harness/hook-runtime/`. Both turn host events into the six
  normalized events, call every installed handler in process under a deadline, and turn results back into
  host actions. A failing or late handler never blocks the host; where the host has a text channel, the
  model is told which hook failed and what to do by hand. A `capabilities` command reports the five
  capabilities per host and any handler that needs a capability the host lacks.
- The **verify gate** handler. It wraps one configured command and runs it on three triggers: an edit
  (after an edit tool, for that file), a ticked task (a `- [ ]` that became `- [x]` in a file matching
  `openspec/changes/*/tasks.md`), and turn end. Each run hands the command the trigger, the edited file,
  the base commit and the changed-file list. A tree that already passed a full run returns at once. Only a
  full run (task or turn end) writes the pass record. The gate registers the proof `verify-pass`, which
  holds while the working tree's content equals the content of the last full pass.
- `install`, `update` and `check` for both tools, using the frozen layout (`.agents/harness/<tool>/`,
  `.agents/harness/lock.json`, `.agents/harness.json`).
- Tests under `tests/agent-harness/`, run by `npm test` and by a CI job on Node 22.
- Onboarding this repository: copied files, lock, `.agents/harness.json`, `.claude/settings.json`,
  `opencode.json`, a `check` step in CI and a verify command for this repo.

## Alternatives Considered

The architecture is fixed by the RFC (Shared runtime, One command, Vendored copy, Node only). The real
choice left is how the gate decides "this tree already passed", because that drives the no-change
shortcut, `verify-pass` surviving a commit, and the 300 ms target.

### Alternative A: Git tree id of the working tree content (chosen)
- **Approach**: keep a private index in the state folder, built once with `git read-tree HEAD` (a copy of
  the real index would inherit `assume-unchanged` and `skip-worktree` flags). Run
  `git add -A` against it (`GIT_INDEX_FILE`), then `git write-tree`. The spike first tried a fresh copy
  for every call: 2.1–2.6 s in veles, because a fresh copy must re-hash what the stat cache cannot vouch
  for. A kept index takes 124–191 ms there and about 50 ms here. The resulting tree id covers tracked
  and untracked, non-ignored files and nothing else. The key is that tree id, a stat digest of the private index (so an edit that git's clean filters
  hide, such as LF to CRLF, still counts), and a sha256 of the gate's config section (design D4).
- **Pros**: committing unchanged content gives the same tree id, so `verify-pass` survives a commit as the
  RFC requires. Git does the hashing and reuses the stat cache, which keeps it fast. Ignored build output
  never invalidates a pass.
- **Cons**: writes blob objects for untracked files into the object store (git gc removes them); two git
  process starts per check; untracked build output that is not ignored makes it slower (veles has 5,699
  such files).
- **Why chosen**: it is the only option of the three that matches "the current content of the working
  tree" exactly and is cheap.

### Alternative B: HEAD plus `git status --porcelain` digest
- **Approach**: hash HEAD's sha and the porcelain output, including modified files' content hashes.
- **Pros**: one read-only git call, no object writes.
- **Cons**: committing changes HEAD and empties status, so the key changes and `verify-pass` breaks on commit,
  which the acceptance criteria forbid. Rebuilding the content hash for modified files is the same work as A.
- **Why not chosen**: fails the "committed unchanged, still holds" criterion.

### Alternative C: Walk and sha256 every non-ignored file in Node
- **Approach**: `git ls-files -co --exclude-standard`, then hash each file in Node.
- **Pros**: no writes to the object store.
- **Cons**: reads every file on every check with no stat cache, so it gets slow in veles-sized repos and
  misses the 300 ms target there.
- **Why not chosen**: cost grows with repo size; A gets the stat cache for free.

## Agreed Approach

The RFC architecture, with Alternative A for repo state. The open choices are settled as follows (all
the implementer's calls):

1. **Pass record**: `<state>/verify-gate/pass.json`,
   `{"version": 1, "tree": "<tree id>", "stat": "<stat digest>", "config": "<sha256 of the verify-gate section>", "trigger": "task|turn-end"}`.
   A full-run failure deletes it, and an edit run never writes it.
2. **Repo state hash**: Alternative A.
3. **How files are copied**: each tool's `cli.mjs` copies its own `assets/<tool>/` folder byte for byte,
   records sha256 per file in `lock.json`, and refuses to overwrite a copied file whose hash differs from
   the lock (an edit in the repo), with no override flag (the RFC's Onboarding decision). The tool version in the lock is the
   `version` field of `assets/<tool>/tool.json`, bumped by hand with each change to the tool. Release
   versions exist only in the Pages build, so the copied files cannot carry them. A forgotten bump would
   leave an old copy that still matches its own lock (Sol's review). In this change a test fails when this
   repo's vendored copy differs from the assets; enforcing the bump against the base branch is deferred
   to a follow-up task to stay inside the size budget (design D6).
4. **State storage and locking**: `<git-dir>/agent-harness/<tool>/` (per worktree, never committed, never
   seen by `git add -A`). Each session gets `sessions/<host>-<session>/<agent>/`. The gate lock is a
   set of numbered generation files, each claimed by hard-linking a complete temp file to the next number,
   so it appears with its content; the highest file is never deleted, so numbers are never reused, and a
   claimer owns the lock only if its number is still the highest. Only a dead owner's lock can be taken
   over, never an old one (design D5).
5. **Config keys**: `hook-runtime: { "deadlines": { "<event>": ms } }` (optional overrides).
   `verify-gate: { "command": [argv…], "base": "origin/main", "taskFiles": ["openspec/changes/*/tasks.md"],
   "timeoutSeconds": 900, "maxBlocks": 3 }`, with only `command` required. Unknown keys in a tool's own
   section are an error; other top-level keys are ignored.
6. **Tests**: `tests/agent-harness/*.test.mjs` at the repo root. `npm test` runs
   `node --test scripts/test-release-*.mjs tests/agent-harness/*.test.mjs`, and a CI job also runs
   the harness tests on Node 22.
7. **This repo's verify command**: `node scripts/verify.mjs`. On `edit` it checks the one file
   (`node --check` for `.mjs`, `python3 -m py_compile` for `.py`, `skills.py validate` for a skill or the
   marketplace, JSON parse for `.json`). On a full run it runs `skills.py validate`, the Python unit tests,
   `npm test` and both tools' `check`. `claude plugin validate .` stays in CI only, because it downloads
   through npx.
8. **OpenCode plugin folder**: `opencode.json` lists `"./.agents/harness/hook-runtime/opencode"`, a folder
   holding the plugin's `index.mjs`. The spike confirmed that OpenCode 2.4.1 loads it, which answers the
   RFC open question "OpenCode plugin path".

## Key Decisions

- **Event mapping** (confirmed by the spike, [`spike.md`](spike.md); full table in design D3). Claude
  Code: `PreToolUse` maps to `tool.before`, `PostToolUse` to `tool.after`, `UserPromptSubmit` to
  `prompt`, `Stop` and `SubagentStop` to `turn.end`, `PreCompact` to `compact`, and `SessionStart` to
  `session.start` (`afterCompact` when `source` is `compact`). Compaction's internal `SubagentStop`
  (`agent_type: ""`) is dropped. OpenCode: `execute.before` deny is a thrown `Error`; `execute.after`
  appends to `result.content`; `session.execution.succeeded` maps to turn end, and a block is a
  `synthetic({resume: true})`; compaction re-delivery appends to `system` in the `context` session hook
  after `session.compaction.ended`; the first event seen for a session is its start.
- **Agent context id**: `main` for the root session. On Claude Code a subagent is identified by the hook
  input's `agent_id`; on OpenCode, by the child session id found by walking `parentID`. Both were seen
  live.
- **Handler deadlines**: a handler may declare `timeouts: { "<event>": ms }`, and a `manual` text for
  failure notices. These are additive fields on the provisional interface, reported as such, as is the
  event field `background`. Defaults: 5 s; the verify gate declares
  `tool.after` and `turn.end` from `timeoutSeconds`.
- **Handler discovery**: the runtime loads `.agents/harness/<tool>/handler.mjs` for every tool in
  `lock.json` whose `tool.json` has `"handler": true`. `check` verifies each one's lock entry first, so a
  tampered handler is not loaded.
- **Changed-file handover**: environment variables `VERIFY_TRIGGER` (`edit`, `task` or `turn-end`),
  `VERIFY_FILE` (edit only), `VERIFY_BASE` (the merge-base of HEAD and `base`, else HEAD) and
  `VERIFY_CHANGED_FILES`, the path of a newline-separated list, so a long list cannot overflow the
  environment.
- **Bounded turn-end block**: at most three blocks for the same failure (a normalized output-tail key)
  per session, shared by the root agent and its subagents, then a pass with a notice. This is the issue's assumption, taken as
  given; `maxBlocks` may only lower it.
- **Subagent turn end and background subagents** (owner's decision, 2026-11-25, after Sol's review): the
  spike showed that subagents run in the background on both hosts, so the root's turn end can come while
  they still edit. Every turn end runs the gate. A subagent's failing turn end blocks that subagent. A
  root turn end that fails while subagents still run (`background > 0`) gets a notice instead of a
  block, and the next root turn end verifies again. Block counts are kept per session, shared by
  root and subagents, for each failure.
- **Install order**: `verify-gate install` refuses until `hook-runtime` is in the lock; `hook-runtime
  install` writes the host configs, and `verify-gate install` touches only its folder, the lock, and a
  `verify-gate` section stub if none exists.

## Open Questions

- Resolved by the spike: the OpenCode `index.mjs` entry, 2.4.1 hook names and payloads, Claude Code
  `agent_id`, and compaction re-delivery on both hosts. All five capabilities work on both.
- The 300 ms no-change target is measured end to end on both hosts and reported. The veles baseline
  belongs to the veles onboarding task.
