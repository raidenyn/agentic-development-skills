## ADDED Requirements

### Requirement: Declared tool kinds
The verify gate's `tool.json` SHALL declare `"tools": ["shell", "edit"]`. These are the only tool kinds its `tool.before` and `tool.after` handling acts on. Edits, shell calls and ticked tasks SHALL reach the gate as before.

#### Scenario: Read does not reach the gate
- **WHEN** a `tool.after` with kind `read` is dispatched in a repo with the verify gate installed
- **THEN** the verify gate is not called

#### Scenario: A tick through a shell call still runs the gate
- **WHEN** a `Bash` call ticks a task in a configured task file
- **THEN** the gate runs with the `task` trigger, as before
