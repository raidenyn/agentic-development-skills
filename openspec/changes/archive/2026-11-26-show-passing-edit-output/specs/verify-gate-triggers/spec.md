## ADDED Requirements

### Requirement: Output of a passing edit run
When an edit run passes and the last 60 lines of its output (read from at most the last 1 MiB) are not blank, the gate SHALL add those lines to the tool result as context after the tool call, as `verify: <command> passed after the edit of <file>:` followed by the lines. An edit pass whose last 60 lines are empty or only whitespace, and any passing task or turn-end run, SHALL add nothing.

#### Scenario: Edit pass with output
- **WHEN** the agent edits a file and the command exits 0 for `VERIFY_TRIGGER=edit` after printing `eslint --fix rewrote src/a.js`
- **THEN** the model receives, after the edit, `verify: <command> passed after the edit of src/a.js:` followed by that line, on Claude Code and on OpenCode

#### Scenario: Silent edit pass
- **WHEN** an edit run exits 0 and prints nothing, or only spaces and newlines
- **THEN** nothing is added to the tool result

#### Scenario: Full-run pass with output
- **WHEN** a task run or a turn-end run exits 0 after printing a line
- **THEN** nothing reaches the model

#### Scenario: Several files in one edit
- **WHEN** one edit changes two files, the run for the first passes after printing a line and the run for the second fails
- **THEN** the model receives the first file's passed note followed by the second file's failure, in file order

#### Scenario: Long passing output
- **WHEN** an edit run exits 0 after printing 100 lines
- **THEN** the context carries only the last 60 of them
