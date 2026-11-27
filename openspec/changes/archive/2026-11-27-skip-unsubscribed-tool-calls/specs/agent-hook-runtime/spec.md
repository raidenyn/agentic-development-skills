## MODIFIED Requirements

### Requirement: Handler loading and dispatch
The runtime SHALL load `handler.mjs` from `.agents/harness/<tool>/` for each tool in `.agents/harness/lock.json` whose `tool.json` declares `"handler": true`. When it loads handlers, it SHALL skip, with a reported failure, a handler whose copied files do not match the lock. It SHALL call handlers in process, in name order, only for the events they list, and on `tool.before` and `tool.after` only for the tool kinds they declare.

#### Scenario: Tampered handler is not loaded
- **WHEN** an installed handler file differs from its lock hash
- **THEN** the runtime does not import it and reports that the tool's copy differs from the lock

#### Scenario: Declared kinds filter tool events
- **WHEN** a handler whose `tool.json` declares `"tools": ["shell", "edit"]` subscribes to `tool.after`, and a `tool.after` with kind `read` is dispatched
- **THEN** that handler is not called, and its outcome is absent from the dispatch result

## ADDED Requirements

### Requirement: Declared tool kinds
A handler tool's `tool.json` MAY declare `"tools"`, a non-empty list of tool kinds (`shell`, `edit`, `read`, `other`). The runtime SHALL attach it to the loaded handler as `tools`. A missing `tools` key, or a value that is not a non-empty list of known kinds, SHALL mean every kind. `tools` SHALL NOT affect events other than `tool.before` and `tool.after`.

#### Scenario: No declaration means every kind
- **WHEN** a handler's `tool.json` has no `tools` key, and a `tool.before` with kind `other` is dispatched
- **THEN** the handler is called as before

#### Scenario: Invalid declaration fails open
- **WHEN** a handler's `tool.json` declares `"tools": "edit"` or `"tools": ["write"]`
- **THEN** the handler is called for every tool kind

#### Scenario: Other events are not filtered
- **WHEN** a handler declares `"tools": ["shell"]` and subscribes to `prompt`
- **THEN** it is called on every `prompt`

### Requirement: Claude Code skips tool calls no handler needs
On a `PreToolUse`, `PostToolUse` or `PostToolUseFailure`, once the checkout is resolved and before any handler is loaded, `claude.mjs` SHALL read the lock and each locked tool's `tool.json`. When every tool with `"handler": true` has valid `tools` that exclude the call's kind, it SHALL load no handler, print nothing and exit 0. On any read or parse error it SHALL load handlers as before.

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

### Requirement: Trace of a skipped tool call
With `AGENT_HARNESS_TRACE=1`, a tool call that `claude.mjs` skips SHALL append a trace record with `skipped: "no-subscriber"`, empty `outcomes` and no `handlersLoadedAt`.

#### Scenario: Skip is traced
- **WHEN** a `PostToolUse` for `Read` is skipped with `AGENT_HARNESS_TRACE=1`
- **THEN** the last line of `trace.jsonl` has `skipped: "no-subscriber"` and `outcomes: {}`
