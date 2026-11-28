## MODIFIED Requirements

### Requirement: Wake message
A wake SHALL be a message to the conductor thread that ends with the sentence "Run one wake of the project-conductor skill for this board." The message MAY start with one of:
- one `Trigger: webhook.` or `Trigger: timer.` line;
- one phase report line.

The old sentence "Run one wake of the project-conductor skill for this repository." MUST be accepted the same way. The board MUST come from the conductor thread's launch line, the first line of its first message, `/project-conductor <board URL>`, never from the wake message.

#### Scenario: Manual wake
- **WHEN** the owner sends only the wake sentence to the conductor thread
- **THEN** the conductor runs one wake and ends with its report

#### Scenario: Old sentence from a thread in flight
- **WHEN** a task thread started before this change sends its report followed by "…for this repository."
- **THEN** the report is judged like one followed by the new sentence

### Requirement: Settings and board preflight
Before the steps, every wake SHALL read:
- its own title and its first message;
- the board's fields;
- the settings block from the board readme;
- for each repository of the board, its default branch and the agent's permission.

Field and option names MUST match exactly, case included: Status with "Ready" and "In progress", "Phase", "Run phase" with plan and implement, "Attempt" and "Run thread". The block is defined in `board-onboarding`'s "Settings block in the board readme".

The block is invalid when any of these holds:
- a key is unknown;
- a key is repeated;
- a number is not a positive integer;
- `reconcileMinutes` is outside 1 to 1440;
- `conductor` is missing;
- the fenced block is missing;
- the marker appears twice.

The parser MUST still yield `conductor` when that key appears exactly once in a block with other gaps, so that the identity check, Repair and Settle can run. When a field or the block is missing or invalid, Advance and Start MUST write nothing, and the report MUST name the gap with the owner's step. A missing number MUST take its default.

#### Scenario: Board without a Ready option
- **WHEN** the board's Status field has no option named exactly "Ready"
- **THEN** no issue is claimed, no thread is started, and the report names the missing option

#### Scenario: Repeated key in the block
- **WHEN** the readme block holds `maxParallel` twice
- **THEN** Advance and Start write nothing, and the report names the block as invalid

### Requirement: The wake checks its own identity
Every wake SHALL write nothing, and SHALL report the fix, when either of these fails:
- the first line of its own first message is the launch line `/project-conductor <board URL>`;
- the settings block's `conductor` equals its own thread id.

In that case Repair and Settle MUST NOT run either.

A title other than `<board title> Conductor` SHALL be reported as a gap with the rename as the owner step, and the wake SHALL go on.

#### Scenario: Thread renamed by hand
- **WHEN** the conductor thread's title is changed to "my conductor"
- **THEN** the next wake runs as usual, and its report lists the gap "Rename this thread to `<board title> Conductor`"

#### Scenario: Thread without a launch line
- **WHEN** a thread whose first message is "please conduct my board" holds the wake sentence and is named in the block's `conductor`
- **THEN** the wake writes nothing, and the report asks to archive this thread, delete its two triggers and onboard the board in a new thread that starts with `/project-conductor <board URL>`, then register every webhook again

#### Scenario: Block names another thread
- **WHEN** the settings block's `conductor` holds another thread's id
- **THEN** the wake writes nothing and names that thread
