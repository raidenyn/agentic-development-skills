## MODIFIED Requirements

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

## ADDED Requirements

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
