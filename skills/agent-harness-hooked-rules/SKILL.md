---
name: agent-harness-hooked-rules
description: "Use when a repo wants rules delivered to an agent at a skill, after a successful command or before a gated command; when writing, reviewing or onboarding rule files in .agents/hooked-rules/; when a rule file is invalid, a gate denies a command or the AGENTS.md pointer block is stale; or when updating or removing the hooked-rules handler."
---

# Agent harness hooked rules

A handler for the agent harness hook runtime (skill `agent-harness-hook-runtime`). It reads the rule
files in `.agents/hooked-rules/*.md` and brings each rule's text to the model at the moments the rule
names: when a skill runs, after a matching command succeeds, and as a one-time denial before a gated
command. It keeps a per-agent-context ledger, so a rule arrives once per moment and again after an edit
or a compaction.

Before starting an agent in a clone you do not trust, read its `.claude/settings.json`, `opencode.json`,
`.agents/harness.json` and `.agents/harness/`, its `.agents/hooked-rules/`, and the scripts the
`verify-gate.command` in `.agents/harness.json` runs: these hooks run code on every tool call, and rule
text is injected into the model's context.

## When to use

- A repo has conventions that matter at a particular moment, not every turn: before a commit, before a
  pull request, after a build, or when a skill starts.
- You are writing, reviewing or validating a rule file, or a rule failed to load.
- `pointers --check` fails, or the `## Hook-delivered rules` block in `AGENTS.md` is missing or stale.
- The handler should be installed, updated or removed.

The hook runtime must be installed first, at 0.2.0 or newer. The handler's `install`, `update` and
`check` refuse an older runtime, because only 0.2.0 normalizes a skill call and a successful tool call.

## Rule files

Every `*.md` file directly in `.agents/hooked-rules/` is one rule. Files are read in file-name order. A
missing folder means no rules, not an error.

A rule file is a regular file of at most 65,536 bytes of valid UTF-8, optionally starting with a BOM and
using CRLF or CR line endings. It opens with a `---` frontmatter block and ends with a `---` line, then a
body.

```markdown
---
pointer: "Conventional Commits: type(scope): summary, PR titles at most 92 characters"
skills: ["openspec-apply-change"]
commands: ["\\bpnpm\\s+run\\s+build\\b"]
gates: ["\\bgit\\b[^;&|\\n]*?\\scommit\\b"]
---

Before committing, write `type(scope): summary` with one of `feat`, `fix`, `perf`, `docs`, `chore`,
`ci`, `build`, `refactor`, `test`, `style` or `revert`.
```

Frontmatter keys:

| Key | Kind | Meaning |
|---|---|---|
| `pointer` | a required, non-empty, double-quoted string | the one-line description in the `AGENTS.md` pointer block |
| `skills` | list of strings | skill names that deliver the rule |
| `commands` | list of regexes | shell commands whose success delivers the rule |
| `gates` | list of regexes | shell commands that are denied once before they run |

- A list is flow (`["a", "b"]`) or block, one `  - "a"` per line, of double-quoted strings.
- The only escapes are `\"` and `\\`; write a regex backslash as `\\`.
- Tabs, indentation, unknown keys, duplicate keys and empty lists are errors.
- A rule needs at least one entry in `skills`, `commands` or `gates` (and `stops`, once it is supported).

The body is the text the model sees. It is at most 4096 bytes, counted on the raw bytes before line
endings are normalized, and must contain text. Leading and trailing blank lines are trimmed; internal
blank lines stay. An invalid rule file is reported at `session.start` in the main agent context and
skipped; the valid rules still deliver.

## The three moments

A rule is delivered once it matches a moment, with one trigger per match.

| Moment | Event that matches | Trigger |
|---|---|---|
| Skill | `tool.after` with `ok: true` and a `skill` field, or a `prompt` whose first word is `/<name>` | `skill:<name>` |
| Command | `tool.after` of kind `shell` with `ok: true` whose command matches a `commands` regex | `command:<pattern source>` |
| Gate | `tool.before` of kind `shell` whose command matches a `gates` regex; denies once | none |

- **Skill.** A skill call delivers every rule whose `skills` lists the call's name exactly. A skill file
  read also answers to each listed name's part after the last `:`, so a read of
  `skills/brainstorming/SKILL.md` matches `superpowers:brainstorming`. A prompt only matches when
  `/<name>` is its first whitespace-separated word; a mention later in the prompt does not.
- **Command.** A command regex matches anywhere in the whole command, after a successful call only. A
  failed command delivers nothing and records nothing.
- **Gate.** The first time a command matches a rule's `gates` and the rule is not delivered, the call is
  denied with the rule's text and the rule is recorded as pending with the matched patterns. A retry
  that matches one of those pending patterns passes and marks the rule delivered, whatever the rest of
  the command says. A disjoint gate denies again only while the rule is pending, and its pattern joins
  the pending set. A rule that was already delivered at a skill or command never denies.

## Once per context and re-delivery

Bookkeeping is one `ledger.json` per agent context, under
`<git dir>/agent-harness/hooked-rules/sessions/<host>-<session>/<agent>/`, so the root agent and every
subagent keep their own.

- A rule already delivered for a trigger is not delivered again for that trigger in the same generation.
- A new trigger delivers it again. A rule listed under a skill and a command arrives at the skill, then
  again at the command.
- An edited rule file (new sha256) delivers again.
- A `compact` event, or a `session.start` with `afterCompact: true`, starts a new generation in that
  context, so rules deliver again. A subagent's compaction re-arms only the subagent.
- When several rules match one event, their texts are joined in rule-name order with one blank line, up
  to 9000 UTF-8 bytes. A rule that does not fit is left out and the next is tried; only included rules
  are recorded.

## Regex dialect

Patterns are JavaScript regular expressions compiled with the `u` flag. Lookbehind is available.

- With `u`, `\b` and `\w` are ASCII-only, unlike Python's `re`.
- A pattern matches anywhere in the command; there is no implicit anchor.
- A pattern that does not compile is an error for its file.
- JavaScript never throws while matching, so a pathological regex can keep matching past the handler's
  deadline; the runtime's timer cannot preempt a synchronous match. Treat rule files as reviewed repo
  content.

## Keys not supported yet

`requires`, `exempt` and `stops` parse but are rejected by hooked-rules 0.1.0 as not supported. A rule
that uses one is an invalid rule, and its gates do not deny.

## Pointer block

`node .agents/harness/hooked-rules/cli.mjs pointers` writes one line per rule, in name order, under a
generated heading in the root `AGENTS.md`:

```markdown
## Hook-delivered rules
<!-- hooked-rules:begin -->
- <pointer> — .agents/hooked-rules/<file>
<!-- hooked-rules:end -->
```

- A missing block is appended; an existing block is replaced in place, keeping the file's line endings.
- The heading must be the line right before the begin marker. `pointers` writes it there when it is
  missing or separated by blank lines.
- Duplicate or unpaired markers, or any invalid rule file, make it exit 1 and write nothing.
- `pointers --check` exits non-zero when the block is missing, stale or not under its heading, and prints
  the fix command. `check` covers the install and the rule files only, not the block, so a repo can also
  run `pointers --check` from its own instruction-file check.

## Config

The section is `hooked-rules` in `.agents/harness.json`. It takes no keys in this version; any key is an
error for `install`, `update` and `check`.

## Onboard

1. **Install the hook runtime first**, by its skill's Onboard, at 0.2.0 or newer.
2. **Install the handler.** From the installed skill folder, run
   `node <skill>/assets/hooked-rules/cli.mjs install --repo <repo>`. Without `--repo` it uses the git
   checkout around the current directory. It copies the tool to `.agents/harness/hooked-rules/`, writes
   its lock entry, adds `"hooked-rules": {}` to `.agents/harness.json` and creates
   `.agents/hooked-rules/`. It does not touch the host configs: the runtime already routes every event.
3. **Write the rules.** One file per moment or topic, with a `pointer` you want to see in `AGENTS.md`.
   Keep each body short, because every delivered rule costs context.
4. **Write the pointer block.** Run
   `node .agents/harness/hooked-rules/cli.mjs pointers`, then check it with `pointers --check`. Commit
   the generated block in `AGENTS.md`.
5. **CI.** Add `node .agents/harness/hooked-rules/cli.mjs check` and
   `node .agents/harness/hooked-rules/cli.mjs pointers --check` next to the runtime's `check`.
6. **Commit** `.agents/harness.json`, `.agents/harness/`, `.agents/hooked-rules/` and `AGENTS.md`.
7. **Verify live.** Restart the host after the first install or an update: OpenCode loads the plugin and
   its handlers once per process, and a new conversation alone does not reload them. Claude Code loads
   the handler for each hook call. Then, in a fresh session on each host the repo uses:
   - invoke a rule's skill and check that its text arrives once, and not a second time;
   - run a matching command and check that the rule arrives after the call;
   - in a separate fresh context where the rule is still pending, run a gated command and check that the
     first call is denied with the rule's text and the retry passes. Do not invoke the rule's skill
     first: that delivers the rule, and its gate then passes.
   - For timings, set `AGENT_HARNESS_TRACE=1`: `<git dir>/agent-harness/hook-runtime/trace.jsonl`
     records each handler outcome.

## Update

1. **Update.** From the newer skill folder, run
   `node <skill>/assets/hooked-rules/cli.mjs update --repo <repo>`.
   - It replaces a copy whose files all match its lock, removes files the new version no longer has and
     rewrites the lock entry.
   - It refuses on an edited, missing or extra file, naming it. Restore the file with
     `git checkout -- .agents/harness/hooked-rules/<file>`, or delete the tool folder and its lock entry
     and install again. There is no override flag.
   - `install` refuses when a different version is installed, so use `update` for that.
2. **Review** the diff of `.agents/`, the rule files and the `AGENTS.md` block.
3. **Check.** Run `node .agents/harness/hooked-rules/cli.mjs check` and
   `node .agents/harness/hooked-rules/cli.mjs pointers --check`.
4. **Restart the host**, not just start a new conversation: OpenCode loads the plugin and its handlers
   once per process, so an updated handler is not active until that process restarts. Claude Code loads
   the handler for each hook call.

In the skill's own source repo, `assets/hooked-rules/` is generated from TypeScript under
`src/hooked-rules/`; edit the source, never the assets. When you change it, bump `version` in
`src/hooked-rules/tool.json` by hand and rebuild. Nothing enforces the bump yet.

## Remove

1. Delete `.agents/harness/hooked-rules/`, the `hooked-rules` entry in `.agents/harness/lock.json` and
   the `hooked-rules` key in `.agents/harness.json`.
2. Delete `.agents/hooked-rules/` and the `## Hook-delivered rules` block in `AGENTS.md`.
3. Delete both `check` steps from CI.
4. Delete local references too: any `hooked-rules` `check` or `pointers --check` call in the repo's own
   verify command or scripts (for example `scripts/verify.mts`), and any `hooked-rules` step in a
   `harness:update`-style script. Left behind, the first calls a deleted CLI and the second reinstalls
   the tool.
5. Restart OpenCode after the removal, since it loads the plugin and its handlers once per process.
6. Optionally, delete `<git dir>/agent-harness/hooked-rules/`.

The host configs belong to the hook runtime. Remove them with that skill if no handler is left.

A handler failure never blocks the host: if the rules folder, the ledger or a match fails, the call goes
ahead and the model is told `hook hooked-rules failed on <event>: <reason>. Read the hooked rules listed
in AGENTS.md (.agents/hooked-rules/) by hand at the moments they name.`
