# verify-gate-triggers Specification

## Purpose

A verify gate that runs a repository's one configured verify command when a file is edited, when a task is ticked and at turn end. It hands the command what changed, returns at once when the content already passed, bounds how often a turn end is blocked, and registers the `verify-pass` proof.

## Requirements

### Requirement: One configured command
The verify gate SHALL run exactly one command: the argv in `.agents/harness.json` `verify-gate.command`, without a shell, with the repo root as working directory.

#### Scenario: Argv without a shell
- **WHEN** `command` is `["node", "scripts/verify.mjs"]`
- **THEN** that program runs with those arguments in the repo root, and no shell interprets them

#### Scenario: Missing program
- **WHEN** the program does not exist
- **THEN** the run counts as failed with a text naming the command

### Requirement: Handover to the command
Every run SHALL set `VERIFY_TRIGGER` (`edit`, `task` or `turn-end`), `VERIFY_BASE` (the merge-base of HEAD and `verify-gate.base`, else HEAD, else empty when there is no HEAD) and `VERIFY_CHANGED_FILES` (the path of `changed.txt` in the gate's state folder, a plain text file listing changed paths, one per line). For `edit` it SHALL also set `VERIFY_FILE`, the edited path relative to the repo root, and for other triggers it SHALL unset an inherited `VERIFY_FILE`.

#### Scenario: Turn-end handover
- **WHEN** a turn end fires with one tracked file modified against the base
- **THEN** the command gets `VERIFY_TRIGGER=turn-end`, `VERIFY_BASE` set to the merge-base sha, no `VERIFY_FILE`, and a changed list containing the modified path

#### Scenario: Line-ending-only change is listed
- **WHEN** after a full pass a file changes only from LF to CRLF and git's attributes normalize it to the same blob
- **THEN** that path is in the changed list

#### Scenario: Flagged file is listed
- **WHEN** a file marked `assume-unchanged` in the real index is edited
- **THEN** that path is in the changed list

### Requirement: Changed-file list
The changed list SHALL include every path whose content differs from the base, every untracked non-ignored file of the real index, and every path whose stat entry changed since the last full pass or that has gone since then.

#### Scenario: Untracked with git rm --cached
- **WHEN** an unchanged file is untracked with `git rm --cached` and another edit triggers a run
- **THEN** that file is in the changed list

### Requirement: Bounded run
A run SHALL be bounded by `timeoutSeconds` (default 900) and by the hook's deadline, whichever comes first. At the bound, the command's whole process group SHALL get SIGTERM and then SIGKILL, and the gate SHALL return only after the command has exited. The model SHALL see the last 60 lines of a failed run's output.

#### Scenario: Timeout
- **WHEN** the command runs longer than `timeoutSeconds`
- **THEN** its process group is terminated and the failure text says the run timed out

#### Scenario: A descendant ignores SIGTERM
- **WHEN** the command starts a child that traps SIGTERM, and the bound is reached
- **THEN** the child is killed with SIGKILL before the gate returns

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

### Requirement: Call-scoped before-images
At each shell or edit `tool.before`, the gate SHALL record the checkbox counts of the matching task files for that call, without waiting for any lock. At the call's `tool.after`, including after a failed call, it SHALL compare against that record. A verify run SHALL NOT refresh the task snapshot, so no tick is absorbed before its call is compared.

#### Scenario: Tick by sed
- **WHEN** a shell command such as `sed -i` ticks a box in a matching tasks file
- **THEN** a full run with `VERIFY_TRIGGER=task` runs after that shell call

#### Scenario: Tick during another run
- **WHEN** a shell command ticks a box while another process holds the gate lock
- **THEN** the tick is still detected after that shell call

#### Scenario: Untick between sessions, then a whole-file write
- **WHEN** a user unticks item A between sessions, and the next session ticks A again with a whole-file `Write`
- **THEN** the tick is detected from that call's before-image, recorded at its `tool.before`

#### Scenario: Another agent's tick is not seen twice
- **WHEN** a subagent ticks a box and the root agent then edits that file without ticking anything
- **THEN** only the subagent's edit starts a task run

### Requirement: Every turn end runs the gate
At every turn end, the root agent's and each subagent's, the gate SHALL start a full run with `VERIFY_TRIGGER=turn-end`. A failure SHALL block the turn end with a text that starts `verify:` and names the attempt number. When a root turn end reports running subagents (`background > 0`), a failure SHALL instead be a notice, which SHALL NOT count toward any block limit.

#### Scenario: Subagents still running
- **WHEN** the root agent's turn end arrives with `background: 1` and the run fails
- **THEN** the command runs, and the turn end passes with a notice containing the failure

#### Scenario: Subagent turn end
- **WHEN** a subagent's turn end arrives and the run fails
- **THEN** the subagent's turn end is blocked

#### Scenario: Turn end after a passing edit still verifies
- **WHEN** an edit's run passes and a turn end follows on the same content, whose full run fails
- **THEN** the turn-end run happens, the failure blocks the turn end, and `verify-pass` does not hold

### Requirement: Bounded turn-end blocks
For the same session and failure, counting the root agent and all its subagents together, the gate SHALL block at most `min(maxBlocks, 3)` times (default 3), and `check` SHALL reject `maxBlocks` outside 1–3. It SHALL also block at most 10 times in total per session. After a limit, the turn end SHALL pass with a notice saying verification still fails and how to run it by hand.

#### Scenario: Fourth turn end on the same failure
- **WHEN** a turn end with the same failure has already been blocked three times in this session
- **THEN** the command still runs, and the turn end passes with a notice instead of a block

#### Scenario: Root and subagent share the limit
- **WHEN** a subagent was blocked twice and the root once by the same failure in one session
- **THEN** the next turn end with that failure, by either agent, passes with a notice

#### Scenario: Cosmetic edits do not reset the limit
- **WHEN** three turn ends were blocked by the same failure and the agent edited an unrelated file before each
- **THEN** the fourth turn end with that failure passes with a notice

#### Scenario: A superseded block does not count
- **WHEN** an OpenCode turn-end result is superseded because a newer turn started
- **THEN** its charge is refunded and the counter for that failure is unchanged, whether or not its stale notice is shown

#### Scenario: Simultaneous failures at count two
- **WHEN** the root and a subagent of one session fail with the same failure at the same moment, with two blocks already counted
- **THEN** exactly one of them is blocked, and the other gets the notice

### Requirement: Charge before delivery
A block SHALL be charged to the session's count before it is delivered, as a charge `{id, key, confirmed}` in the session's `blocks.json` ledger. The acknowledgement SHALL mark the charge confirmed. The charge SHALL be removed only when the block is known not to have been delivered (superseded, rejected, or the write failed). A charge whose acknowledgement never arrives SHALL stay charged. If the ledger cannot be charged, the turn end SHALL NOT be blocked.

#### Scenario: Acknowledgement lost
- **WHEN** a block was delivered and its acknowledgement cannot finish before the deadline
- **THEN** the block still counts toward the limit

#### Scenario: Ledger busy
- **WHEN** a turn end fails and the ledger's own lock is not free within 2 seconds
- **THEN** the turn end is not blocked and gets a notice that the block counter was busy

### Requirement: Failure identity
Two failures SHALL be the same when their exact argv, their exit status (with the signal name, if any) and their output tail match after normalizing only volatile fields: the repo root, temp paths, timestamps, durations, and hex values that cannot be decimal codes. Any other difference in the tail SHALL make a new failure with its own count, bounded only by the session's 10-block backstop. A pass SHALL NOT reset the count of a failure.

#### Scenario: Diagnostic codes stay distinct
- **WHEN** one failure prints `E101` and a later one prints `E202`, with otherwise equal output
- **THEN** they count as two failures

#### Scenario: Different signals stay distinct
- **WHEN** identical output ends once with SIGSEGV and once with SIGABRT
- **THEN** they count as two failures

#### Scenario: Node test durations
- **WHEN** the same failing Node test fails four turn ends in a row with different `duration_ms` values
- **THEN** it counts as one failure, so the fourth turn end passes with the notice

#### Scenario: A changing temp path is the same failure
- **WHEN** two runs fail with output that differs only in a path under the OS temp directory
- **THEN** they count as one failure

#### Scenario: A changed count in the tail is a new failure
- **WHEN** a failure printing `3 failed` was blocked three times and the next run prints `2 failed`
- **THEN** that run is blocked as attempt 1 of a new failure

#### Scenario: A pass does not reset the count
- **WHEN** a failure was blocked three times, a turn end then passed, and the same failure returns
- **THEN** the turn end passes with the limit notice

### Requirement: Stale text of a failing turn end
Every failing turn-end result of the gate (a block, a limit notice or a busy-ledger notice) SHALL carry `stale` set to `verify: the check at the end of the previous turn failed and was not counted; the next turn end checks again. <command> failed: <body>`. That text SHALL contain no attempt count and no instruction to fix anything. The background notice, given while subagents still run, and a passing, skipped or contended turn end SHALL carry no `stale`.

#### Scenario: A failing turn end carries stale text
- **WHEN** a turn end fails and is blocked
- **THEN** the result's `stale` is exactly the fixed text with the command and the failure body

#### Scenario: A passing turn end carries none
- **WHEN** a turn end passes
- **THEN** the result has no `stale`

#### Scenario: The background notice carries none
- **WHEN** a root turn end fails while a subagent still runs
- **THEN** the background notice has no `stale`

### Requirement: Content key
The gate SHALL compute a content key from a private index kept in its state folder and built with `git read-tree HEAD`, so the real index is never changed and its flags are not inherited. The key SHALL be a git tree id over tracked and untracked non-ignored files, plus a digest of their filesystem stat data from `lstat` (path, mode, ctime, mtime, inode, size), plus a hash of the `verify-gate` config section with its defaults filled in.

#### Scenario: Unchanged commit
- **WHEN** a full run passed and that content is committed unchanged
- **THEN** the key is unchanged

#### Scenario: Same-size edit with restored mtime
- **WHEN** a file is rewritten with the same size and its mtime is then restored
- **THEN** the key changes

#### Scenario: Repo with core.trustctime=false
- **WHEN** the repo sets `core.trustctime=false` and a file is rewritten with the same size and its old mtime restored
- **THEN** the key changes

#### Scenario: Linked worktree
- **WHEN** the gate runs in a linked git worktree
- **THEN** membership is read from that worktree's own index (`git rev-parse --git-path index`), and the real index is unchanged

#### Scenario: Force-tracked ignored file
- **WHEN** an ignored file is force-added to the real index and later edited
- **THEN** the key changes

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

### Requirement: One run at a time
Two runs SHALL NOT overlap in one worktree. A full run that finds the gate lock held by a live process SHALL wait for it until its deadline. A lock SHALL be taken over only from a dead owner, never because of its age, and a stale contender SHALL NOT displace a live owner.

#### Scenario: Two processes at once
- **WHEN** two hook processes trigger full runs at the same moment
- **THEN** one runs, the other waits and then takes the shortcut or runs, and no record is left partial

#### Scenario: Stale contender wakes up late
- **WHEN** a process pauses after seeing a dead owner, others claim and release the lock, and a live owner holds it
- **THEN** the paused process does not obtain the lock and the live owner keeps it

### Requirement: verify-pass proof
The verify gate SHALL register a proof named `verify-pass`. It SHALL hold, returning null, exactly when the pass record matches the current content key. Otherwise it SHALL return a failure text that says why: no full pass yet, content changed since the pass, config changed, or verification running.

#### Scenario: Commit of unchanged content
- **WHEN** a full run passed and that content is committed unchanged
- **THEN** `verify-pass` still holds

#### Scenario: Edit after the pass
- **WHEN** any file is edited after the full pass, including an LF-to-CRLF-only edit
- **THEN** `verify-pass` fails with a text saying the content changed since the last pass

### Requirement: Manual run
`node .agents/harness/verify-gate/cli.mjs run` SHALL run a full check outside any host, with `VERIFY_TRIGGER=turn-end` and the same shortcut and pass record rules. It SHALL print the result, exit 0 on a pass or when nothing changed since the last full pass, and exit non-zero on failure or when another run held the lock until its deadline. Hook failure notices SHALL point to this command.

#### Scenario: Manual full run
- **WHEN** `cli.mjs run` is executed on a tree whose command passes
- **THEN** it exits 0 and `verify-pass` holds afterwards

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

### Requirement: Block ledger shared across worktrees
The session's `blocks.json` ledger SHALL be kept in `<git common dir>/agent-harness/verify-gate/sessions/<host>-<session>/`, so every worktree of one repository charges the same ledger for a session. All other gate state SHALL stay under the checkout's own git dir.

#### Scenario: Limit follows a move between worktrees
- **WHEN** a session was blocked twice by one failure in one worktree, then hits the same failure in another linked worktree of the same repository, with `maxBlocks` 2
- **THEN** the turn end in the second worktree passes with the limit notice instead of a block

#### Scenario: Main checkout path unchanged
- **WHEN** the gate runs in a main checkout
- **THEN** the ledger is at the same path as before, `<git dir>/agent-harness/verify-gate/sessions/<host>-<session>/blocks.json`

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
