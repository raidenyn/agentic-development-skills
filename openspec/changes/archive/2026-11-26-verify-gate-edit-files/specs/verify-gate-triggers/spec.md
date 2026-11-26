## MODIFIED Requirements

### Requirement: Edit trigger
After an edit tool changes files, the gate SHALL run the command once per edited file in the edit scope (see "Edit trigger scope") with `VERIFY_TRIGGER=edit`. A failure SHALL reach the model as context after the tool call. An edit run SHALL NOT write, refresh or delete the pass record.

#### Scenario: Edit that fails lint
- **WHEN** the agent edits a file and the command exits non-zero for `VERIFY_TRIGGER=edit`
- **THEN** the model receives, after the edit, the failure output naming the file

#### Scenario: Edit during another run
- **WHEN** an edit's check finds the gate lock held by another run and the lock is released before the edit's deadline
- **THEN** the edit's check runs and its failure reaches the model after the tool call

#### Scenario: Edit pass does not count as a full pass
- **WHEN** an edit run passes and the tree has not passed a full run
- **THEN** no pass record exists and `verify-pass` fails

### Requirement: Ticked task trigger
When an item in a file matching `verify-gate.taskFiles` (default `openspec/changes/*/tasks.md`) changes from an unticked checkbox `- [ ]` to a ticked one (`- [x]` or `- [X]`), the gate SHALL start a full run with `VERIFY_TRIGGER=task` instead of the edit run. A failure SHALL reach the model as context after the tool call, saying that a task was ticked while verification fails.

#### Scenario: Tick while a check fails
- **WHEN** the agent ticks `- [ ] 1.1` in `openspec/changes/x/tasks.md` and the command fails
- **THEN** a full run with `VERIFY_TRIGGER=task` runs and its failure reaches the model after the edit

#### Scenario: Non-matching file
- **WHEN** a checkbox is ticked in `docs/notes.md`
- **THEN** no task run starts, and `docs/notes.md` gets the edit run only if it is in the edit scope

### Requirement: Tick detection by item identity
The gate SHALL match checkbox items by their text after the box, not by line position. A tick SHALL be an item whose unticked count fell and whose ticked count rose between the call's before-image and the file afterwards. Adding an item that is already ticked SHALL NOT be a tick. Ticks of an item already recorded after the call's before-image SHALL be subtracted from what the call detected.

#### Scenario: Other ticked items unchanged
- **WHEN** an edit ticks `1.2` in a file where `1.1` and `1.4` are already ticked
- **THEN** exactly one tick is detected

#### Scenario: Moved and ticked
- **WHEN** an edit moves `- [ ] A` elsewhere in the file and ticks it
- **THEN** one tick is detected

#### Scenario: Added done item
- **WHEN** an edit adds a new line `- [x] 9.9 New`
- **THEN** no tick is detected, and the edit run happens if the file is in the edit scope

#### Scenario: New tasks file created ticked
- **WHEN** an edit creates `openspec/changes/y/tasks.md` that already contains `- [x] 1.1 Done`
- **THEN** no tick is detected, and the edit run happens if the file is in the edit scope

#### Scenario: Re-tick after an untick between sessions
- **WHEN** a tick of A was recorded, the user unticks A between sessions, and the next session ticks A again
- **THEN** the new tick is detected

#### Scenario: Two real ticks of one label
- **WHEN** a child ticks one item `A` and an overlapping shell call ticks a second item `A`
- **THEN** the shell call still reports one tick

#### Scenario: Overlapping calls report once
- **WHEN** a child's edit ticks A while a longer root shell call that began earlier is running
- **THEN** A is reported once

### Requirement: No-change shortcut
When the content key equals the pass record's, the gate SHALL return at once without running the command, for every trigger that reaches the gate. A full run that passes SHALL write the pass record only if the key is the same before and after the run. A full run that fails SHALL delete the pass record.

#### Scenario: Unchanged tree
- **WHEN** a full run has passed and a turn end fires with no file changed since
- **THEN** the command is not run and the turn end passes

#### Scenario: Changed tree
- **WHEN** any tracked or untracked non-ignored file changes after a full pass
- **THEN** the next trigger that reaches the gate runs the command; an edit outside the edit scope does not reach it

#### Scenario: Tree changes during the run
- **WHEN** a file changes while a passing full run is in progress
- **THEN** no pass record is written

## ADDED Requirements

### Requirement: Edit trigger scope
Without `verify-gate.editFiles`, every edited file SHALL be in the edit scope. With it, a file SHALL be in scope only if its repo-relative path matches one of its globs (see "editFiles glob matching"). When an edit call reports files and none is in scope, the verify gate SHALL spawn no process, add nothing to the tool result and trace `edit-skipped`. A tick, an empty file list and an unset command SHALL behave as without the key.

#### Scenario: Edit of a file outside editFiles
- **WHEN** `editFiles` is `["**/*.ts"]` and the agent edits `docs/notes.md`
- **THEN** the gate spawns no process (neither the command nor git), the tool result gets no context, and with `AGENT_HARNESS_TRACE=1` the event's `verify-gate` outcome is `edit-skipped`

#### Scenario: Edit of a file inside editFiles
- **WHEN** `editFiles` is `["**/*.ts"]` and the agent edits `src/a.ts` and `root.ts`
- **THEN** the command runs once per file with `VERIFY_TRIGGER=edit` and `VERIFY_FILE` set to that file

#### Scenario: Matching and non-matching files in one call
- **WHEN** `editFiles` is `["**/*.ts"]` and one call edits `src/a.ts` and `README.md`
- **THEN** the command runs once, for `src/a.ts` only

#### Scenario: Tick in a file outside editFiles
- **WHEN** `editFiles` is `["**/*.ts"]` and the agent ticks an item in `openspec/changes/x/tasks.md`
- **THEN** a full run with `VERIFY_TRIGGER=task` runs, as without `editFiles`

#### Scenario: Call with no edited files
- **WHEN** `editFiles` is set, the command is set, and an edit `tool.after` without a tick reports no files (for example only paths outside the repo)
- **THEN** the gate returns nothing and traces nothing, as without `editFiles`

#### Scenario: Command not set
- **WHEN** `editFiles` is set, `command` is not, and the agent edits a file outside `editFiles`
- **THEN** the gate fails with the "set verify-gate.command" error, as without `editFiles`

#### Scenario: editFiles absent
- **WHEN** `editFiles` is not set and the agent edits `docs/notes.md`
- **THEN** the command runs once with `VERIFY_TRIGGER=edit` and `VERIFY_FILE=docs/notes.md`

### Requirement: editFiles glob matching
`editFiles` globs SHALL be matched against the repo-relative path segment by segment. In a pattern, `\` SHALL count as `/`. The path SHALL be split on `/` only, as the adapters deliver it, so a `\` in a POSIX file name stays part of that name. `.` and empty segments SHALL be ignored in both. `**` as a whole segment SHALL match zero or more segments. Any other segment SHALL match exactly one path segment, with `*` for any run of characters and `?` for one character.

#### Scenario: Dot segments in a pattern
- **WHEN** `editFiles` is `["./src/**/*.ts"]` and the agent edits `src/a.ts`
- **THEN** the command runs once for `src/a.ts`

#### Scenario: Backslash in a file name
- **WHEN** `editFiles` is `["src/*.ts"]` and the agent edits the root file named `src\a.ts`
- **THEN** the file is not in scope

#### Scenario: Globstar only as a whole segment
- **WHEN** `editFiles` is `["src/**.ts"]`
- **THEN** `src/a.ts` is in scope and `src/nested/a.ts` is not

#### Scenario: Trailing globstar
- **WHEN** `editFiles` is `["src/**"]`
- **THEN** `src/a.ts` and `src/x/y.ts` are in scope and `docs/a.md` is not

### Requirement: editFiles config key
The `verify-gate` section SHALL accept an optional `editFiles` key: a non-empty list of non-empty glob strings with the `taskFiles` glob syntax. `check` SHALL fail when `editFiles` is present and is not such a list, and SHALL keep rejecting unknown keys. Setting or changing `editFiles` SHALL change the config hash, so the next trigger that reaches the gate runs the command. A section without `editFiles` SHALL keep the hash it had before the key existed.

#### Scenario: Invalid editFiles
- **WHEN** `editFiles` is `"**/*.ts"`, `[]` or `[""]`
- **THEN** `check` exits non-zero and names `verify-gate.editFiles`

#### Scenario: Valid editFiles
- **WHEN** `editFiles` is `["**/*.ts", "src/**"]` and the rest of the section is valid
- **THEN** `check` passes

#### Scenario: Adding editFiles invalidates the pass
- **WHEN** a full pass is recorded and `editFiles: ["**/*.ts"]` is then added to the section
- **THEN** `verify-pass` reports that the config changed, a Markdown edit is still skipped, the next turn end runs the command, and a second turn end with nothing changed runs nothing

#### Scenario: Hash without editFiles is unchanged
- **WHEN** a section has no `editFiles`
- **THEN** its config hash equals the hash the previous tool version computed for it
