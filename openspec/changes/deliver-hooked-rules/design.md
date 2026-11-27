## Context

veles-android delivers its hooked rules with `scripts/agent_rules.py` (2,194 lines, Python), which Claude Code
calls from five hook events and OpenCode reaches through a plugin that spawns it
(`scripts/opencode-hooked-rules/index.js`). The harness RFC moves the engine to a Node handler on the shared hook
runtime (row "Rule engine", CHANGED; contract Skill names: `agent-harness-hooked-rules`). M1 delivered the runtime,
the vendored layout (`.agents/harness/<tool>/`, `lock.json`, `.agents/harness.json`), the handler interface and
the verify gate, which is the model for the new tool (`src/verify-gate/`, `tool.json` with `"handler": true` and
`"tools"`).

What the runtime gives a handler today, read from `main` at `1b0db00`:

- Six events, with tool events carrying `tool.name`, `tool.kind` (`shell|edit|read|other`), the raw `tool.input`,
  `command` on shell calls and `files` on edits (`src/hook-runtime/lib/claude-adapter.mts`,
  `opencode-adapter.mts`).
- A state folder per (tool, host, session, agent context), so a subagent's bookkeeping is already separate.
- `compact` from Claude Code `PreCompact` and OpenCode `session.compaction.started`, and `session.start` with
  `afterCompact`.
- `tool.after` for both `PostToolUse` and `PostToolUseFailure`, with nothing that tells them apart. On OpenCode a
  failed call's context is not delivered and a notice says so.
- A per-handler tool-kind filter in dispatch, and on Claude Code a skip before handlers load when no handler tool
  declares the call's kind (#61).

veles's engine detects a skill in three ways: a Skill tool call (`tool_input.skill` on Claude Code, `args.id` on
OpenCode), a prompt whose first word is `/<skill>`, and a read whose real path ends in
`/skills/<name>/SKILL.md`. The issue records that reading those fields in a handler is the rejected alternative of
the Hook handler interface.

## Goals / Non-Goals

**Goals:**

- A rule is delivered at a skill, after a successful matching command, and as a one-time denial before a gated
  command, on OpenCode and on Claude Code, from the copied code in this repository.
- The rule file format stays veles's, so veles's six rule files parse unchanged once #17 and #18 land.
- The handler holds no host knowledge; the runtime normalizes what it needs, additively.
- Plain Read, Glob, Grep and MCP calls still load no handler on Claude Code.
- `install`, `update`, `check` and `pointers --check` work as the verify gate's do, and this repository runs them.

**Non-Goals:**

- `requires` and `exempt` with named proofs (`agent-harness/m2-rule-delivery/2`, #17).
- `stops`, the OpenSpec stop reminder, the `opsx:` aliases and apply-skill arming (`agent-harness/m2-rule-delivery/3`,
  #18).
- Running veles's rule cases and onboarding veles or line-mcp (#23, #24).
- The instruction-file check that imports the pointer code in veles (M3).
- Hosts other than OpenCode and Claude Code.

## Decisions

### D1. Normalized skill fields in the runtime (owner's pick, approach A)

The adapters add, on tool events:

- `tool.kind: 'skill'` for Claude Code `Skill` and OpenCode `skill`. `ToolKind` becomes
  `shell | edit | read | skill | other`.
- `skill: string` on a `skill`-kind call (Claude `tool_input.skill`; OpenCode the tool arguments' `id`, falling
  back to `name`, i.e. `input.input.id` in `toToolEvent`, never the hook input's `id`, which is the call id). It is
  also set on a call of the tool `Read` (Claude Code) or `read` (OpenCode; not `grep` or `glob`, though they are
  kind `read` too) whose path (`file_path`; OpenCode `path`, else `filePath`), joined to the payload `cwd` (or the repo root),
  resolved with `realpath` and with backslashes turned into slashes, ends in `/skills/<name>/SKILL.md`, with
  `skillVia: 'call' | 'read'` to tell the two apart. The `read` keeps kind `read`, so the verify gate and any
  `read` handler see it as before. A path that cannot be resolved has no `skill`.
- `ok: boolean` on `tool.after`. On Claude Code, `PostToolUse` is `true` and `PostToolUseFailure` is `false`. On
  OpenCode, `status === 'completed'`, and for a shell call also `result.metadata.exit === 0`.

Filtering: a handler whose declared kinds include `skill` is also called for a tool event that carries `skill`,
whatever its kind. `declaredKinds` accepts `skill`, and `anyHandlerWants` takes the event, not only the kind. The
rules handler declares `"tools": ["shell", "skill"]`. On an older runtime (0.1.x), `skill` is an unknown kind, so
`declaredKinds` returns `null` and the handler is called for every kind: that fails open. `install` still refuses a
runtime older than 0.2.0, because the old runtime never sets `skill`.

Prompts are not normalized: a `/<skill>` first word is host-independent text in the `prompt` event on both hosts
(OpenCode's `prompt` session hook is the one veles reads). The handler parses it.

Alternatives: the handler reads raw input (rejected by the interface, and reads would load handlers again); a
`read` declaration (the cost of every read comes back). See `brainstorm.md`.

### D2. Tool layout

```
src/hooked-rules/
  tool.json          { "name": "hooked-rules", "version": "0.1.0", "handler": true, "tools": ["shell", "skill"] }
  handler.mts        events: tool.before, tool.after, prompt, compact, session.start
  cli.mts            install | update | check | pointers [--check]   [--repo DIR]
  lib/rules.mts      grammar: parse a rule file, load the folder, rule text
  lib/deliver.mts    moments, gates, capping; pure functions over (rules, state, event)
  lib/ledger.mts     the per-context delivery state file and its lock
  lib/pointers.mts   render, locate, apply and check the AGENTS.md block
```

`tsconfig.json` `rootDirs` gains `src/hooked-rules`, so the shared `./lib/*.mts` imports resolve for `tsc`.
`src/build.json` gains `"hooked-rules": { "skill": "agent-harness-hooked-rules", "shared": ["lib/config.mts",
"lib/state.mts", "lib/install.mts"] }`. Shared files are not changed, so the verify gate's copy does not change.
`deliver.mts` is pure, so most tests run without a host.

### D3. Grammar (ported unchanged)

`---` frontmatter, then a body. The keys are `pointer` (a required double-quoted scalar) and the lists `skills`,
`commands`, `gates`, `stops`, `requires`, `exempt`. A list is flow (`["a", "b"]`) or block (`  - "a"`) of
double-quoted strings with only the `\"` and `\\` escapes. A file may have a BOM and CRLF or CR line endings. Tabs,
indentation, unknown keys, duplicate keys and empty lists are errors. The body is at most 4096 bytes, counted on the raw body
before line endings are normalized (veles's `original_body`), and must have text. The file is at most 65,536 bytes, valid UTF-8, a regular file and not a symlink. A rule needs at least one of
`skills`, `commands`, `gates`, `stops`. Rules are sorted by file name; the rule identity is the name plus the
sha256 of the raw file bytes, BOM included.

Scope rejections for this version: a rule with `stops`, `requires` or `exempt` is an error naming the key and "not
supported by hooked-rules 0.1.0". #17 and #18 replace these errors with veles's checks: `requires` needs `gates`,
`exempt` needs `requires`, and names must be known.

Regexes compile as `new RegExp(source, 'u')`. A pattern that does not compile is an error for its file. The skill
documents the dialect: JavaScript, with lookbehind supported; with `u`, `\b` and `\w` are ASCII-only, unlike in
Python.

An invalid rule file is reported and skipped. Valid rules still deliver. At a `session.start` that is not a compaction
in the main agent context (`agentId` `'main'` or missing; OpenCode also emits `session.start` for each child
session) the handler returns the load errors not yet reported as context, and
`check` fails on them.

### D4. Moments and gates (ported from `_moment_rules` and `_gate`)

- **Skill moment.** On `tool.after` with `ok === true` and `skill` set, every rule whose `skills` contains `skill`
  exactly matches, with trigger `skill:<name>`. For `skillVia: 'read'` the rule's skills also answer to their part
  after the last `:` (veles `_skill_dirs`), so a read of `skills/brainstorming/SKILL.md` matches
  `superpowers:brainstorming`, with trigger `skill:brainstorming`. On `prompt`, the first whitespace-separated word `/<name>` (at least
  one character after `/`) matches `skills` exactly, without the suffix rule, as in veles `_moment_rules`. `opsx:` names are matched only literally here (#18 adds aliases).
- **Command moment.** On `tool.after` of kind `shell` with `ok === true`, every rule whose `commands` regex
  `search`es the whole command matches, with trigger `command:<pattern source>`.
- **Delivery.** A matched rule is skipped when its entry in this agent context is `delivered` in the current
  generation and already holds every trigger the event matched. Otherwise it is delivered: the texts (the body
  trimmed of leading and trailing blank lines) are joined in rule-name order with one blank line, each whole, up to
  9000 UTF-8 bytes. A rule that does not fit is left out and the next is tried. Only included rules are recorded.
- **Gate.** On `tool.before` of kind `shell`, the patterns of each rule's `gates` that `search` the command are
  collected:
  - When the rule has no live entry, it is denied, and the entry is recorded `pending` with the matched patterns.
  - When the entry is `pending` and the matched patterns share one with it, the rule is marked `delivered` and does
    not deny.
  - When the entry is `pending` with other patterns, the rule is denied again, with the union of the patterns.
  - When the entry is `delivered`, the command passes.

  The deny text is the capped join of the denied rules. A rule delivered at a moment never denies its gates in the
  same context.

### D5. Ledger

One JSON file per agent context, `context.stateDir/ledger.json`:
`{version: 1, generation, entries: {<rule name>: {sha256, generation, state, patterns, triggers}}, reported}`, where
`reported` lists the `path:message` keys of load errors already reported (missing means `[]`); an edited file with
a new error is reported again. An entry whose
`sha256` differs from the loaded rule, or whose generation is older than the ledger's, is not live, so an edited
rule or a compaction delivers again. An entry is updated as veles's `put` does: when the existing entry is live
(same sha256, current generation), the new `patterns` and `triggers` are merged into it and `state` moves to
`delivered` when either step delivers; otherwise the entry is replaced. So a moment keeps pending patterns, and a gate
confirmation keeps earlier triggers. Writes are atomic (`writeJsonAtomic`).

In a hook worker the lock is the one the supervisor owns through `context.lock`: it is tracked per worker
generation, released when that generation retires, and a busy lock is retried every 20 ms for up to 1 s or the
handler deadline, whichever comes first. In process (tests) a pid-keyed `ledger.lock`, created exclusively with a
complete owner record, provides the same wait. A lock not won fails open with no write: a gated command is not
denied and the runtime shows its failure notice with the handler's manual, while a moment returns its context
without recording. Before locking, the handler reads the ledger unlocked and decides; an event that would neither
deliver nor record (most shell events) returns without the lock, so a sibling call rarely contends.

A compaction is per agent context, not a rewrite of the ledger: `compact` and `session.start` with `afterCompact`
append one timestamp line to `compactions.log`, whose line count is the effective generation. The log is
append-only, so a late writer cannot lower the generation or revive an entry a compaction voided, and `bump`
appends without the lock because a lost concurrent write only causes an extra delivery. `ledger.json`'s
`generation` is kept for readability and ignored on read. veles's `bump_all`, needed only because veles had no
reliable agent id on a main compaction, has no counterpart.

The handler writes the ledger only after it has decided, just before it returns, and skips the write (returning
nothing) when `context.signal` is aborted or `context.deadline` has passed, so a result the runtime would drop is
not recorded as delivered. veles's `void` (un-recording after a lost result) has no counterpart; this check
narrows that window.

### D6. Failure behavior

The runtime already fails open and prints a failure notice. The handler sets `manual`: "Read the hooked rules listed
in AGENTS.md (.agents/hooked-rules/) by hand at the moments they name." An unreadable rules folder, a broken ledger
file (it is replaced), or any exception from matching makes the handler pass, with a notice where the event has
a channel. A missing `.agents/hooked-rules/` folder means no rules, not an error. The event budget stays at the
runtime default of 5 s; the handler does no process work.

### D7. Pointer block (ported from `_pointers`)

`pointers` writes, and `pointers --check` checks, the block in the root `AGENTS.md`:

```
## Hook-delivered rules
<!-- hooked-rules:begin -->
- <pointer> — .agents/hooked-rules/<file>
<!-- hooked-rules:end -->
```

There is one line per rule, in name order. `pointers` refuses, exits 1 and writes nothing when any rule file is
invalid, as veles's `_pointers` does. The heading and markers are veles's, so veles's `AGENTS.md` keeps
its block byte for byte. A missing block is added under a `## Hook-delivered rules` heading already in the file,
or at the end under a new heading if none exists. A block is replaced in
place, keeping the file's line ending. The heading must be the line right before the begin marker:
`pointers` writes it there when it is missing or separated by blank lines, and leaves a current block under its
heading byte-identical. Duplicate or unpaired markers are an error. A missing or unreadable `AGENTS.md` makes `pointers` and `--check`
print "cannot be read" and exit 1, as veles does. `--check` fails when the block is missing,
differs, lacks the heading on the line before it, or any rule file is invalid, and prints the fix (`node .agents/harness/hooked-rules/cli.mjs pointers`).
`check` covers the lock and the rule files only, so a repo can run `pointers --check` from its own instruction-file
check later (M3).

### D8. Install, update, check

These mirror `src/verify-gate/cli.mts`. `install` and `update` require Node 22 or newer, a git work tree, and a
hook-runtime lock entry at version 0.2.0 or newer. They copy the tool with `installTool`, add an empty
`"hooked-rules": {}` section to `.agents/harness.json`, and create `.agents/hooked-rules/` if it is missing. The
section has no keys in this version, and a key is an error for `install`, `update` and `check`. They write no host config, because the
runtime's entries already route every event. `check` fails on a copied file that differs from the lock, on an
invalid rule file, on a key in the config section, and on a hook runtime older than 0.2.0.

### D9. Onboarding this repository

- The runtime bump lands with its own `harness:update` in the runtime task, so the installed copy always matches the
  build. Then `pnpm run harness:update` also runs
  `node skills/agent-harness-hooked-rules/assets/hooked-rules/cli.mjs update`, after the hook-runtime update. With
  no lock entry, `update` installs.
- Two rules (wording drafted during implementation):
  - `repo-commit-types.md`: `skills: ["openspec-apply-change"]` and, as written in the file (the grammar's only
    escapes are `\"` and `\\`), `gates: ["\\bgit\\b[^;&|\\n]*?\\scommit\\b", "\\bgh\\s+pr\\s+(create|edit)\\b"]`. The body holds this repo's Conventional Commit types and the PR title rule.
  - `repo-harness-tools.md`: the skills `agent-harness-hook-runtime`, `agent-harness-verify-gate` and
    `agent-harness-hooked-rules`, each also in its Claude Code plugin form `<name>:<name>` (the harness skills are
    installed from this repo's marketplace there, and a Skill call carries the namespaced name; calls match
    exactly), and in the file `commands: ["\\bpnpm\\s+(run\\s+)?(build|harness:update)(?=\\s|$)"]`, so
    `pnpm run build:check` does not match. The body says to
    bump `tool.json` once per PR, never to edit `assets/` or `.agents/harness/`, and to run `harness:update`.
- The `AGENTS.md` pointer block is generated. `AGENTS.md` text is not trimmed, because the rules add moment-specific
  detail and do not replace the conventions.
- `scripts/verify.mts` (`FULL_CHECKS`) and `.github/workflows/validate.yml` run `hooked-rules/cli.mjs check` and
  `pointers --check`; `editChecks` also runs `pointers --check` for edits of `.agents/hooked-rules/*.md` and
  `AGENTS.md`. The lists that enumerate checks and tools grow with it: `scripts/test-verify.mts`,
  `tests/agent-harness/vendored.test.mjs` and `scripts/test_skills.py`.
- Marketplace entry: created with `scripts/skills.py new`. README Skills row: added by hand.

### D10. Versions

hook-runtime goes from 0.1.6 to 0.2.0, a minor version for a contract addition. hooked-rules starts at 0.1.0.
verify-gate is unchanged: it imports only types from the changed files, which the build erases, and its built output must not change. The build
check proves that.

## Risks / Trade-offs

- [A Skill call is no longer kind `other`] → No installed handler declares `other`. The skill
  `agent-harness-hook-runtime` documents the new kind. A handler with no declaration still gets every kind.
- [Skill reads are prefiltered by text] → Only a path whose text ends in `SKILL.md` is resolved, and a missing file
  gives no `skill`. veles resolved every read path non-strictly. A link `notes.md → skills/x/SKILL.md` is not a
  skill read here; this keeps the cost of a plain Read at zero syscalls.
- [A `realpath` on every Read in `claude.mjs` before the skip] → It is one syscall on a path the host just read. It
  runs only for kind `read`, only when the path ends in `SKILL.md` by its text, and then again on the real path.
- [Parallel tool calls in one context race on the ledger] → The exclusive-create lock, with lean-to-extra-delivery
  on timeout. Tests cover two concurrent dispatches.
- [Python and JavaScript regex dialects differ] → The `u` flag, documentation, and #23 running veles's cases. The
  ported tests in this change include veles's gate patterns for `git commit` and `git push`.
- [A deny on OpenCode is a thrown error, and some OpenCode versions may retry the tool] → It is covered by the live
  check. A retry that matches a pending pattern passes, which is the intended deny-once behavior.
- [A result dropped after the ledger is written] → The deadline and abort check before the write. A drop after
  the handler returned (host timeout) can still lose one delivery until the next compaction or rule edit; veles's
  `void` is a follow-up if live use shows it.
- [Parallel gated calls in one turn] → The second sees the first's pending pattern and passes, as in veles. The
  rule text arrived with the sibling's denial in the same turn.
- [A pathological regex backtracks without end] → JavaScript never throws while matching; it blocks the handler
  past its deadline, as Python did in veles. Rule files are repo content under review. A match-time guard is a
  follow-up.
- [The live check needs the harness skills on each host] → `agent-harness-hooked-rules` is new on this branch, and
  OpenCode here has no harness skill installed. For the live run only, symlink `skills/<name>` into
  `.claude/skills/` and `.opencode/skills/` (not committed) and record the Skill-call name each host shows.
- [The OpenCode Skill tool name or field differs on 2.4.1] → The live check in tasks. The adapter accepts `id` and
  falls back to `name`; the live run fixes which one.

## Migration Plan

- This repository: `pnpm run harness:update` updates the hook runtime to 0.2.0 and installs hooked-rules 0.1.0 in
  the same PR. CI checks both.
- Other repositories get it through #23 and #24, by installing from the published catalog. They are unaffected until
  then. A repo that updates only the hook runtime sees no behavior change.
- Rollback: delete `.agents/harness/hooked-rules/`, its lock entry and its config section, and revert the runtime
  copy with `update` from the previous release. The pointer block can stay as plain text.

## Open Questions

- The OpenCode 2.4.1 Skill tool's name and input field, and whether a `/<skill>` command reaches the `prompt` hook
  as raw text, are settled by the live check (tasks, group 7). The adapter and the tests follow what it shows.
