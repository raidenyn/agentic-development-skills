## MODIFIED Requirements

### Requirement: Six normalized events
The hook runtime SHALL turn host events into exactly six event types: `tool.before`, `tool.after`, `prompt`, `turn.end`, `compact` and `session.start`. Each tool event SHALL carry the tool's raw name, a kind (`shell`, `edit`, `read`, `skill` or `other`) and its input. An edit event SHALL carry the edited paths relative to the repo root, dropping paths outside it, and a shell event SHALL carry the command. The Claude Code `Skill` tool and the OpenCode `skill` tool SHALL have kind `skill`.

#### Scenario: Claude Code edit becomes tool.after
- **WHEN** `claude.mjs` receives a `PostToolUse` payload for the `Edit` tool with `tool_input.file_path` inside the repo
- **THEN** handlers receive `{type: "tool.after", tool: {kind: "edit"}, files: ["<relative path>"]}`

#### Scenario: Path outside the repo
- **WHEN** an edit event names a file outside the repo root
- **THEN** that path is not in `files`

#### Scenario: Skill tool kind
- **WHEN** `claude.mjs` receives a `PreToolUse` for the `Skill` tool, or the OpenCode plugin's `execute.before` runs for the `skill` tool
- **THEN** handlers receive a `tool.before` whose `tool.kind` is `skill`

### Requirement: Declared tool kinds
A handler tool's `tool.json` MAY declare `"tools"`, a non-empty list of tool kinds (`shell`, `edit`, `read`, `skill`, `other`). The runtime SHALL attach it to the loaded handler as `tools`. A missing `tools` key, or a value that is not a non-empty list of known kinds, SHALL mean every kind. A handler whose declared kinds include `skill` SHALL also be called for a tool event that carries a `skill` field, whatever its kind. `tools` SHALL NOT affect events other than `tool.before` and `tool.after`.

#### Scenario: No declaration means every kind
- **WHEN** a handler's `tool.json` has no `tools` key, and a `tool.before` with kind `other` is dispatched
- **THEN** the handler is called as before

#### Scenario: Invalid declaration fails open
- **WHEN** a handler's `tool.json` declares `"tools": "edit"` or `"tools": ["write"]`
- **THEN** the handler is called for every tool kind

#### Scenario: Other events are not filtered
- **WHEN** a handler declares `"tools": ["shell"]` and subscribes to `prompt`
- **THEN** it is called on every `prompt`

#### Scenario: A skill declaration receives a skill read
- **WHEN** a handler declares `"tools": ["shell", "skill"]` and a `tool.after` of kind `read` with `skill: "x"` is dispatched
- **THEN** the handler is called

#### Scenario: A skill declaration skips a plain read
- **WHEN** the same handler and a `tool.after` of kind `read` without `skill` are dispatched
- **THEN** the handler is not called

### Requirement: Claude Code skips tool calls no handler needs
On a `PreToolUse`, `PostToolUse` or `PostToolUseFailure`, once the checkout is resolved and before any handler is loaded, `claude.mjs` SHALL read the lock and each locked tool's `tool.json`. When every tool with `"handler": true` has valid `tools` that exclude the call's kind, and, for a call that carries `skill`, also exclude `skill`, it SHALL load no handler, print nothing and exit 0. On any read or parse error it SHALL load handlers as before.

#### Scenario: Read with only the verify gate installed
- **WHEN** only the hook runtime and the verify gate (`"tools": ["shell", "edit"]`) are installed and `claude.mjs` receives a `PostToolUse` for `Read`
- **THEN** no handler is loaded and the output is empty

#### Scenario: Edit still reaches the gate
- **WHEN** the same repo receives a `PostToolUse` for `Edit`
- **THEN** the handlers are loaded and the verify gate runs on the edit

#### Scenario: A handler without a declaration
- **WHEN** another installed handler tool's `tool.json` has no `tools` key and a `PreToolUse` for `Read` arrives
- **THEN** the handlers are loaded and dispatched as before

#### Scenario: Unreadable metadata fails open
- **WHEN** a locked tool's `tool.json` is missing or is not valid JSON and a `PostToolUse` for `Read` arrives
- **THEN** the handlers are loaded and the existing `was not loaded` notice is reported

#### Scenario: Plain read with the rules handler installed
- **WHEN** the verify gate and hooked-rules (`"tools": ["shell", "skill"]`) are installed and a `PostToolUse` for `Read` of `src/a.mts` arrives
- **THEN** no handler is loaded and the output is empty

#### Scenario: Skill file read with the rules handler installed
- **WHEN** the same repo receives a `PostToolUse` for `Read` of `skills/agent-harness-verify-gate/SKILL.md`
- **THEN** the handlers are loaded and hooked-rules receives the event with `skill: "agent-harness-verify-gate"`

## ADDED Requirements

### Requirement: Skill fields on tool events
A tool event of kind `skill` SHALL carry `skill`, the invoked skill's name, and `skillVia: "call"`. On Claude Code the name SHALL be `tool_input.skill`. On OpenCode it SHALL be the tool arguments' `id`, else their `name`, and never the call id. A call without a string name SHALL carry no `skill`.

#### Scenario: Claude Code Skill call
- **WHEN** `claude.mjs` receives a `PostToolUse` for `Skill` with `tool_input.skill: "openspec-apply-change"`
- **THEN** handlers receive `skill: "openspec-apply-change"` and `skillVia: "call"`

#### Scenario: OpenCode skill call
- **WHEN** the OpenCode plugin's `execute.after` runs for tool `skill` with input `{id: "openspec-apply-change"}`
- **THEN** handlers receive `skill: "openspec-apply-change"` and `skillVia: "call"`

### Requirement: Skill file reads
A call of the `Read` tool (Claude Code) or the `read` tool (OpenCode) SHALL carry `skill: "<name>"` and `skillVia: "read"` when its path, resolved against the payload's `cwd` (else the repo root) with backslashes read as slashes, has a real path ending in `/skills/<name>/SKILL.md`. Only a path whose text ends in `SKILL.md` SHALL be resolved. A path that cannot be resolved (including a missing file) or resolves elsewhere, and any other `read`-kind tool, SHALL carry no `skill`.

#### Scenario: Read of a skill file through a symlink
- **WHEN** a read names `.claude/skills/x/SKILL.md`, which is a symlink to `skills/x/SKILL.md`
- **THEN** the event carries `skill: "x"` and `skillVia: "read"`

#### Scenario: Lookalike path
- **WHEN** a read names `docs/skills/x/SKILL.md.bak`, or a `SKILL.md` symlink whose target is `notes/x.md`
- **THEN** the event carries no `skill`

#### Scenario: Grep of a skill file
- **WHEN** OpenCode's `grep` tool runs with `path: "skills/x/SKILL.md"`
- **THEN** the event carries no `skill`

### Requirement: Tool call outcome
Every `tool.after` SHALL carry `ok`. On Claude Code `ok` SHALL be `true` for `PostToolUse` and `false` for `PostToolUseFailure`. On OpenCode `ok` SHALL be `true` exactly when the call's `status` is `completed` and, for a shell call, its `result.metadata.exit` is `0`.

#### Scenario: Failed Bash call on Claude Code
- **WHEN** `claude.mjs` receives a `PostToolUseFailure` for `Bash`
- **THEN** handlers receive `tool.after` with `ok: false`

#### Scenario: Non-zero exit on OpenCode
- **WHEN** `execute.after` runs for `shell` with status `completed` and `result.metadata.exit: 1`
- **THEN** handlers receive `tool.after` with `ok: false`
