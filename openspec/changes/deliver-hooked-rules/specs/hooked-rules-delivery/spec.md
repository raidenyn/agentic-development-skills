## ADDED Requirements

### Requirement: Rule files
The hooked-rules handler SHALL read every `*.md` entry of `.agents/hooked-rules/` as one rule, in file-name order. A rule file SHALL be a regular file (not a symlink) of at most 65,536 bytes of valid UTF-8, optionally with a BOM and CRLF or CR line endings. A missing `.agents/hooked-rules/` folder SHALL mean no rules. A rule's identity SHALL be its file name and the sha256 of its raw bytes.

#### Scenario: Flow and block lists
- **WHEN** one rule writes `skills: ["a", "b"]` and another writes `skills:` followed by `  - "a"` and `  - "b"`
- **THEN** both rules list the skills `a` and `b`

#### Scenario: CRLF and BOM
- **WHEN** a rule file starts with a UTF-8 BOM and uses CRLF line endings
- **THEN** it parses, and its body text has LF line endings

#### Scenario: Unknown key
- **WHEN** a rule's frontmatter has `when: "x"`
- **THEN** that rule is an error naming the key, and the other rules still deliver

#### Scenario: Symlinked rule
- **WHEN** `.agents/hooked-rules/a.md` is a symlink
- **THEN** that rule is an error and is not read

#### Scenario: Missing folder
- **WHEN** the folder is missing
- **THEN** there are no rules and no error

### Requirement: Rule file format
A rule file SHALL open with a `---` frontmatter block holding only `pointer` (a required, non-empty, double-quoted scalar) and the lists `skills`, `commands`, `gates`, `stops`, `requires` and `exempt`. A list SHALL be a flow list (`["a"]`) or a block list (`  - "a"`) of double-quoted strings using only the escapes `\"` and `\\`. Each regex SHALL compile as a JavaScript `u`-flag pattern. The body SHALL have text and be at most 4096 bytes, counted before line endings are normalized.

#### Scenario: Frontmatter errors
- **WHEN** a rule's frontmatter holds a tab, an indented line, a duplicate key or an empty list, or none of `skills`, `commands`, `gates` and `stops` has an entry
- **THEN** that rule is an error

#### Scenario: Body over the limit
- **WHEN** a rule's body is 4097 bytes
- **THEN** that rule is an error naming the 4096-byte limit

#### Scenario: CRLF body counted raw
- **WHEN** a CRLF rule's body is 4000 bytes with LF endings and 4200 bytes as written
- **THEN** that rule is an error naming the 4096-byte limit

#### Scenario: Invalid regex
- **WHEN** a rule has `commands: ["("]`
- **THEN** that rule is an error naming `commands`

### Requirement: Keys not supported yet
In this version, a rule that uses `requires`, `exempt` or `stops` SHALL be an error naming the key as not supported by this hooked-rules version.

#### Scenario: Rule with requires
- **WHEN** a rule has `gates: ["\\bgit\\s+push\\b"]` and `requires: ["verify-pass"]`
- **THEN** that rule is an error naming `requires` as not supported yet, and its gate does not deny

### Requirement: Delivery at a skill
At `tool.after` with `ok: true` and a `skill` field, and at a `prompt` whose first whitespace-separated word is `/<name>`, the handler SHALL return as `context` the text of every rule whose `skills` list contains the name exactly. A rule's text is its body without leading and trailing blank lines. For a skill file read (`skillVia: "read"`), a listed name SHALL also match by its part after the last `:`.

#### Scenario: Skill tool call
- **WHEN** a rule lists `skills: ["openspec-apply-change"]` and a `tool.after` arrives with `skill: "openspec-apply-change"` and `ok: true`
- **THEN** the handler returns that rule's text as context

#### Scenario: Slash prompt
- **WHEN** a `prompt` event's text is `/openspec-apply-change add-x`
- **THEN** the handler returns that rule's text as context

#### Scenario: Skill file read
- **WHEN** a `tool.after` of kind `read` carries `skill: "openspec-apply-change"` and `ok: true`
- **THEN** the handler returns that rule's text as context

#### Scenario: Plugin skill read
- **WHEN** a rule lists `skills: ["superpowers:brainstorming"]` and a `tool.after` of kind `read` carries `skill: "brainstorming"`, `skillVia: "read"` and `ok: true`
- **THEN** the handler returns that rule's text as context

#### Scenario: Prompt that only mentions a skill
- **WHEN** a `prompt` is `please run /openspec-apply-change`
- **THEN** no rule is delivered

### Requirement: Delivery after a command
At `tool.after` of kind `shell` with `ok: true`, the handler SHALL return as `context` the text of every rule with a `commands` regex that matches anywhere in the command.

#### Scenario: Successful matching command
- **WHEN** a rule lists `commands: ["\\bpnpm\\s+run\\s+build\\b"]` and `pnpm run build` succeeds
- **THEN** the handler returns that rule's text as context

#### Scenario: Failed command
- **WHEN** the same command arrives at `tool.after` with `ok: false`
- **THEN** no rule is delivered and the rule is not recorded as delivered

### Requirement: Once per context
A rule delivered at a moment SHALL NOT be delivered again in the same agent context for an event whose triggers it has already been delivered for. A trigger is `skill:<name>` or `command:<pattern>`. A new trigger SHALL deliver the rule again. Bookkeeping SHALL be separate per agent context: the root agent and each subagent keep their own.

#### Scenario: Same skill twice
- **WHEN** the same skill is invoked twice in one agent context
- **THEN** the rule is delivered only the first time

#### Scenario: Earlier triggers kept
- **WHEN** a rule is delivered at its skill, then at its command, and the skill is invoked again in the same context
- **THEN** the third event delivers nothing

#### Scenario: A different trigger
- **WHEN** a rule lists a skill and a command, is delivered at the skill, and the command later succeeds
- **THEN** the rule is delivered again at the command

#### Scenario: Subagent
- **WHEN** a rule was delivered to the root agent and a subagent of the same session invokes the same skill
- **THEN** the rule is delivered to the subagent

### Requirement: Re-delivery after an edit or a compaction
An entry SHALL stop counting as delivered when the rule file's content changes, or when a `compact` event, or a `session.start` with `afterCompact: true`, arrives in that agent context.

#### Scenario: After compaction
- **WHEN** a rule was delivered, then a `compact` event arrives in the same context, then the skill is invoked again
- **THEN** the rule is delivered again

#### Scenario: Edited rule
- **WHEN** a delivered rule's body is edited and its skill is invoked again
- **THEN** the edited rule is delivered

#### Scenario: Compaction of another context
- **WHEN** a subagent's context is compacted
- **THEN** the root agent's delivered rules stay delivered

### Requirement: Denial before a gated command
At `tool.before` of kind `shell`, the handler SHALL check each rule whose `gates` regexes match anywhere in the command. A rule not delivered in this agent context SHALL be denied with its text and recorded as pending with the matched patterns. A pending rule SHALL count as delivered, without a deny, when a matched pattern is one of its pending patterns; otherwise it SHALL be denied again and the matched patterns added. A delivered rule SHALL NOT deny.

#### Scenario: First gated command
- **WHEN** a rule gates `\bgit\b[^;&|\n]*?\scommit\b` and was not delivered, and `git commit -m "x"` is about to run
- **THEN** the command is denied with the rule's text

#### Scenario: Retry after the denial
- **WHEN** `git commit -m "y"` is about to run next in the same context
- **THEN** it is not denied, and the rule counts as delivered

#### Scenario: Gate after the skill delivered the rule
- **WHEN** the rule also lists a skill that was invoked earlier in this context
- **THEN** the first `git commit` is not denied

#### Scenario: Retry with a different gate
- **WHEN** the rule was denied for `git commit` and `gh pr create` is about to run next
- **THEN** it is denied again, and both patterns are pending

#### Scenario: Non-shell tool
- **WHEN** a `tool.before` of kind `edit` arrives
- **THEN** no gate is checked

### Requirement: Joined and capped texts
When several rules are delivered or denied by one event, the handler SHALL join their texts in rule-name order with one blank line. Each rule SHALL be included whole, up to 9000 UTF-8 bytes in total. A rule that does not fit SHALL be left out, the next one tried, and only included rules recorded.

#### Scenario: Over the cap
- **WHEN** three matched rules of 4000 bytes each are delivered by one event
- **THEN** the context holds the first two in name order, and the third is not recorded as delivered

### Requirement: Rules handler fails open
A failure of the rules handler (an unreadable rules folder, a broken state file, a regex that throws at match time, a lock that cannot be won) SHALL NOT block or deny the host's call. When the lock cannot be won, a moment SHALL still return its context without recording it. A broken state file SHALL be replaced. A failure notice SHALL tell the agent to read the hooked rules listed in `AGENTS.md` by hand.

#### Scenario: Broken state file
- **WHEN** the context's state file is not valid JSON and a gated command arrives
- **THEN** the handler treats the rule as not delivered, denies once, and writes a valid state file

#### Scenario: Lock held elsewhere
- **WHEN** another dispatch holds the context's lock for longer than the wait and a gated command arrives
- **THEN** the command is not denied and the state file is unchanged

### Requirement: No record of a dropped result
The handler SHALL NOT record a delivery or a pending gate when its call was aborted or its deadline passed before it returned.

#### Scenario: Aborted call
- **WHEN** a skill event's call is aborted before the handler records it
- **THEN** the state file is unchanged and the rule delivers at the next matching event

### Requirement: Invalid rules reported at session start
Invalid rule files SHALL be reported once per session, naming each file and its error, as context at a `session.start` that is not a compaction, in the main agent context only.

#### Scenario: Invalid rule at session start
- **WHEN** one rule file is invalid and a session starts
- **THEN** the session-start context names that file and its error

### Requirement: Pointer block
`node .agents/harness/hooked-rules/cli.mjs pointers` SHALL write into the root `AGENTS.md` a block between `<!-- hooked-rules:begin -->` and `<!-- hooked-rules:end -->`, with one line `- <pointer> — .agents/hooked-rules/<file>` per rule in name order, right under the heading `## Hook-delivered rules`. A missing block SHALL be appended; an existing one replaced in place, keeping line endings. Duplicate or unpaired markers, or an invalid rule, SHALL make it fail and write nothing.

#### Scenario: Block added
- **WHEN** `AGENTS.md` has no block and two valid rules exist
- **THEN** `pointers` appends the heading and a block with two lines in name order, and `pointers --check` passes

#### Scenario: Invalid rule
- **WHEN** one rule file is invalid and `pointers` runs
- **THEN** it exits non-zero naming the file, and `AGENTS.md` is unchanged

#### Scenario: Missing heading
- **WHEN** the block exists but the line before the begin marker is not `## Hook-delivered rules`
- **THEN** `pointers` writes the heading right before the marker

### Requirement: Pointer check
`pointers --check` SHALL exit non-zero, printing the fix command `node .agents/harness/hooked-rules/cli.mjs pointers`, when the block is missing, differs from the rules, is not right under its heading, or any rule file is invalid.

#### Scenario: Stale block
- **WHEN** a rule's `pointer` changes after the block was written
- **THEN** `pointers --check` fails and names the fix command

#### Scenario: Heading separated by a blank line
- **WHEN** a blank line sits between `## Hook-delivered rules` and the begin marker
- **THEN** `pointers --check` fails

### Requirement: Install, update and check
The tool SHALL provide `install`, `update` and `check`, as the verify gate does. `install` and `update` SHALL refuse, changing nothing, when Node is older than 22, the target is not a git work tree, or the hook runtime is not installed at version 0.2.0 or newer. Otherwise they SHALL copy the tool to `.agents/harness/hooked-rules/`, record it in the lock, and leave host config files unchanged.

#### Scenario: Old runtime
- **WHEN** `install` runs in a repo whose lock has hook-runtime 0.1.6
- **THEN** it exits non-zero, names the required runtime version, and changes nothing

#### Scenario: Fresh install
- **WHEN** `install` runs in a repo with hook-runtime 0.2.0
- **THEN** `.agents/harness/hooked-rules/` and its lock entry exist, `.agents/harness.json` has `"hooked-rules": {}`, and `.claude/settings.json` and `opencode.json` are unchanged

#### Scenario: Edited copy
- **WHEN** a file under `.agents/harness/hooked-rules/` was edited
- **THEN** `check` fails naming the file, and `update` refuses to overwrite it

### Requirement: Install check
`check` SHALL fail when a copied file differs from the lock, a rule file is invalid, or the hook runtime is older than 0.2.0.

#### Scenario: Check with an old runtime
- **WHEN** the lock's hook-runtime entry is 0.1.6 and `check` runs
- **THEN** it exits non-zero naming the required runtime version

### Requirement: Config section and rules folder
`install` and `update` SHALL add an empty `hooked-rules` section to `.agents/harness.json` and create `.agents/hooked-rules/` when it is missing. A key in that section SHALL be an error for `install`, `update` and `check`.

#### Scenario: Unknown config key
- **WHEN** `.agents/harness.json` has `"hooked-rules": {"x": 1}` and `install` runs
- **THEN** it exits non-zero naming `x`

### Requirement: This repository delivers hooked rules
This repository SHALL have hooked-rules installed with at least one rule delivered at a skill, one after a command and one before a gated command. It SHALL have a generated pointer block in `AGENTS.md`. CI and `scripts/verify.mts` SHALL run `check` and `pointers --check`.

#### Scenario: Gate in this repository
- **WHEN** an agent in this repository runs `git commit` in a context where `repo-commit-types.md` was not delivered
- **THEN** the commit is denied once with that rule's text, on Claude Code and on OpenCode
