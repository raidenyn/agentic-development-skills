# conductor-wake Specification

## Purpose
The "Run one wake" procedure of the `project-conductor` skill moves an onboarded board forward without a person. One wake reads the whole board once and runs Repair, Settle, Advance and Start in order: Repair releases half-made claims and records a matching thread; Settle settles the thread of a merged pull request, including one that leaves its issue open; Advance answers phase reports by switching a matching thread once to the implement model; Start claims Ready tasks into free slots and launches one worktree thread per task on the plan model. It then runs the automatic trigger check when a delivery was missed, disables the triggers at the end of the board, and ends with a report. Every write is read back, nothing is started or switched twice.

## Requirements

### Requirement: Wake procedure exists
The skill `project-conductor` SHALL hold a procedure "Run one wake" with one section per step, in this order: Repair, Settle, Advance, Start.
- The commands MUST be in `skills/project-conductor/references/run-github.md`.
- The skill's description MUST name the wake triggers: the webhook, the timer, a phase report and a manual wake.

#### Scenario: Validators accept the skill
- **WHEN** `python3 scripts/skills.py validate`, `claude plugin validate .`, the Python unit tests and `pnpm run check` run
- **THEN** all pass, and `SKILL.md` has the sections Repair, Settle, Advance and Start in that order

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

### Requirement: Stop label exists
The conductor SHALL create the label `blocked` in a repository of the board the first time a stop in that repository needs it. When the label cannot be created, that stop MUST be reported instead of written.

#### Scenario: Label missing
- **WHEN** a Repair stop is needed in a repository that has no label `blocked`
- **THEN** the label is created before the stop is written

### Requirement: Models are resolved, never substituted
The conductor SHALL resolve only the roles a step uses: plan for Start, implement for Advance.
- A model line MUST be `<providerInstanceId>/<model id>#<effort>`, split at the first `/` and at the last `#`. All three parts MUST be non-empty.
- It MUST match one model of that provider exactly in `orchestrator_capabilities`, searched by the model id.

A bare name, no match, or an effort that no option of that model offers MUST stop that step and be reported. A model MUST NOT be substituted.

#### Scenario: Provider-qualified implement model
- **WHEN** `model.implement` is `opencode/ollama-cloud/deepseek-v4.1-flash:1017#high`
- **THEN** the switch uses instance `opencode`, model `ollama-cloud/deepseek-v4.1-flash:1017`, and the option whose values include `high`

#### Scenario: Bare model name
- **WHEN** `model.plan` is `Opus-5.5`
- **THEN** no thread is started, and the report names the line and asks for `<provider>/<model>#<effort>`

### Requirement: Board read in one query
Every wake SHALL read every page of the board in one paginated query that returns the project's readme and, per item:
- the repository;
- Status, Phase and the three run fields;
- assignees and labels;
- the milestone with its state;
- the issue state and its `closedAt`;
- blockers, with state and state reason;
- linked branches;
- closing pull requests, with head repository, author and `mergedAt`;
- the body and the body edit history.

When any nested list holds more entries than it returned, the item MUST NOT be started and MUST be reported.

#### Scenario: Board larger than one page
- **WHEN** the board holds more items than one page returns
- **THEN** every page is read before any claim, and items on later pages are judged like the first

### Requirement: Ready rule
An item SHALL be Ready when, and only when, all three of these hold:
- it is a task in the monitored project: an open issue of any repository, on the conductor's board, whose whole first line is a task key `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->` and whose Phase is not Planning or Outline;
- it has no blockers: no issue it is blocked by is open;
- its Status is "Ready".

Readiness MUST NOT depend on any other fact. Every file and verdict of the wake MUST be keyed by `<repo>#<n>`.

#### Scenario: Closed blocker
- **WHEN** a keyed task with Status "Ready" is blocked only by issues that are closed, whatever their close reason
- **THEN** it is Ready

#### Scenario: Open blocker
- **WHEN** a keyed task with Status "Ready" is blocked by an open issue
- **THEN** it is not Ready, and the report names the blocker

#### Scenario: Same number in two repositories
- **WHEN** the board holds `A#5` Ready and `B#5` in Backlog
- **THEN** `A#5` is judged Ready and `B#5` is not, each by its own facts

### Requirement: Items that are not tasks
These SHALL be reported as not handled and MUST be left alone:
- plan items (`<!-- plan: … -->`);
- items with Phase Planning or Outline;
- keyless issues;
- pull requests;
- draft items.

A Ready item whose repository has no T3 project SHALL be reported as `no-project:<repo>` and MUST NOT be started. A repository with several T3 projects SHALL be a gap for that repository, naming the project ids, and its items MUST NOT be started.

#### Scenario: Planning item
- **WHEN** a keyed issue with Status "Ready" has Phase "Planning"
- **THEN** it is not started, and the report says planning items are not handled yet

#### Scenario: Repository without a project
- **WHEN** a Ready task belongs to a repository that no T3 project has
- **THEN** it is not started, and the report names `no-project:<repo>`

### Requirement: Waiting for Ready is reported
An item in Backlog whose body has a "Ready to start when" condition SHALL be reported as waiting for a person to set Ready. The "Ready to start when" text MUST be used only for this report wording.

#### Scenario: Open start condition
- **WHEN** an issue's body names a "Ready to start when" condition and its Status is Backlog
- **THEN** it is not started, and the report says it is waiting for a person to set Ready

### Requirement: Trusted issues only
As a start guard, not part of Ready, the conductor SHALL start a Ready issue only when its author and every editor of its body are the agent account or the owner of that issue's repository. The issue MUST NOT be started, and MUST be reported as untrusted, when the edit history:
- cannot be read completely;
- has more pages;
- holds a deleted edit;
- holds an editor that cannot be identified.

#### Scenario: Body edited by a second account
- **WHEN** a Ready keyed issue's body was edited by an account that is neither the agent nor the repository owner
- **THEN** it is not started, and the report names it as untrusted

### Requirement: Taken items are left alone
As a start guard, not part of Ready, an item SHALL count as taken when it has any of these:
- an assignee;
- a non-empty "Run thread", "Attempt" or "Run phase";
- a linked branch;
- a closing pull request that is not cross-repository, or whose author association is `OWNER`, `MEMBER` or `COLLABORATOR`;
- a T3 thread in its repository's T3 project whose title is exactly its launch key `<owner>/<repo>#<n> attempt <n>`.

A taken item MUST NOT be started and MUST be reported. A pull request from a fork by an account without write access MUST NOT make an item taken.

#### Scenario: Linked branch present
- **WHEN** a Ready keyed issue already has a linked branch
- **THEN** it is not started, and the report names the branch

### Requirement: Parallel limit
The conductor SHALL count as in use every open board issue that is assigned to the agent account or has a non-empty "Run thread", whatever its Status and repository. It SHALL start Ready items that pass both start guards only while in use is below `maxParallel`. Items are taken in ascending order of repository `nameWithOwner`, compared without case, then issue number. The items not started MUST stay Ready and be reported.

#### Scenario: Three Ready tasks, limit two
- **WHEN** three Ready issues pass both guards, none is in use, and `maxParallel` is 2
- **THEN** one wake starts exactly two threads, and the third issue stays Ready and is reported

#### Scenario: Two repositories
- **WHEN** `b/y#1` and `a/x#7` are Ready, and one slot is free
- **THEN** `a/x#7` is started and `b/y#1` stays Ready

### Requirement: Look before claiming
Just before the first claim write, the conductor SHALL read the item again (Status, assignees, run fields, blockers, linked branches and pull requests, task key, body edit history), run the Ready filter on it, and search for a thread titled exactly with its launch key. Labels are not re-read, because they do not decide readiness. It MUST skip and report the item when anything changed, the filter does not print `start`, or such a thread exists, so a new untrusted edit still blocks the claim.

#### Scenario: Status changed during the wake
- **WHEN** an item's Status moves from Ready to Backlog between the board read and the claim
- **THEN** it is not claimed, and the report names it

### Requirement: Claim order
The conductor SHALL write the claim in this order, reading each write back:
1. assign the agent account;
2. set Status "In progress";
3. set "Attempt" to 1;
4. set "Run phase" to plan;
5. create and link the branch `<type>/<n>-<slug>` with `gh issue develop`. `<type>` is `feat` for Feature, Foundation, Migration or an empty Phase, `refactor` for Refactor, `fix` for Hardening and `chore` for Spike;
6. launch one worktree thread on that branch, in the T3 project of the issue's repository. The thread is titled with the launch key, uses the launch key as `clientRequestId`, runs on the plan role's model and effort, and gets the start instruction;
7. write the thread id to "Run thread".

A failed step MUST stop that item's claim and be reported. Completed writes stay.

#### Scenario: Claimed issue on the board
- **WHEN** a Ready issue that passes both guards is claimed
- **THEN** it shows the agent as assignee, Status "In progress", "Run phase" plan, "Attempt" 1, the thread id and a linked branch. The thread's title is the launch key, and its project is the repository's T3 project

### Requirement: Start instruction
The start instruction SHALL name:
- the skill `task-run`;
- the issue URL, the launch key, the attempt and the branch;
- the board URL, on a line `Board:`;
- the conductor thread id;
- the exact phase report line to send, with `head` left for the thread to fill, followed by the new wake sentence.

#### Scenario: Thread receives the start instruction
- **WHEN** a thread is launched by a claim
- **THEN** its first message names `task-run`, the issue, the launch key, the branch, the board, the conductor thread id and the report line

### Requirement: Which reports are judged
Advance SHALL treat as reports only incoming messages from another thread, with the sender id from host metadata, holding a line `phase-done <owner>/<repo>#<n> attempt=<n> phase=<phase> seq=<n> head=<sha>`. It SHALL collect the triggering message and the reports since the claim of every open item with a "Run thread", drop those whose stop an agent comment already records (message id, line, sender), keep per item only the newest from the recorded thread for the current attempt, and judge the rest one at a time.

#### Scenario: Superseded report
- **WHEN** the recorded thread sent two plan reports for attempt 1, with different heads
- **THEN** only the newer one is judged, and the older one is reported as superseded and does not stop the task

### Requirement: Blocked items are not advanced
Advance SHALL NOT act on a report for an item labelled `blocked`. It MUST report the item as waiting for the owner, and act on a kept matching report at the first wake after the label is gone.

#### Scenario: Owner removes the label
- **WHEN** a stopped item's `blocked` label is removed and its newest report matches the record
- **THEN** the next wake acts on that report

### Requirement: Answer order
Advance SHALL answer each judged report with the first that applies, in this order: finish a half-done switch; stop for a foreign sender or a wrong attempt; already handled; act; not idle yet; stop for another mismatch; report only.

#### Scenario: Half-done switch
- **WHEN** the recorded thread's report for the current attempt is judged, the thread holds the apply message for this launch key and head, and "Run phase" is plan
- **THEN** "Run phase" is set to implement, and nothing is sent or switched

### Requirement: Stop for a foreign sender or a wrong attempt
A report for a complete claim whose sender is not "Run thread" or whose attempt is not "Attempt" SHALL stop the task, whatever its phase: the label `blocked` and an agent comment quoting the message id, the line and the sender, with the reason and the phase to resume in.

#### Scenario: Report from another thread
- **WHEN** R2's "Run phase" is implement and a `phase=plan` report for R2 comes from a thread other than its "Run thread"
- **THEN** R2 gets `blocked` and the agent comment, and a later wake does not stop it again for the same message

#### Scenario: Wrong attempt
- **WHEN** R1's "Run phase" is implement and "Attempt" is 1, and R1's recorded thread sends a `phase=plan attempt=2` report
- **THEN** R1 is stopped and reported

### Requirement: Already handled
A report from the recorded thread for the current attempt whose phase is earlier than "Run phase" SHALL be acknowledged as a line in the wake's report. Nothing MUST be written or sent to the task thread.

#### Scenario: Repeated report
- **WHEN** R1's plan report arrives again from its recorded thread after "Run phase" became implement
- **THEN** the wake's report acknowledges it, and nothing is written or sent

### Requirement: Act on a matching plan report
When a report has phase plan, "Run phase" is plan, the sender is "Run thread", the attempt is "Attempt", `seq` is 1, `head` equals the remote head of the claimed branch (the linked branch, or the head branch of the issue's own closing pull request), and the thread is idle within a wait of 5 minutes, the conductor SHALL find the one change folder the branch adds at `head`, switch the thread to the implement model, send the apply instruction in queue mode with a fresh context, and write "Run phase" implement, in that order. No change folder, or several, MUST stop the task before any switch.

#### Scenario: Matching report on an idle thread
- **WHEN** the recorded thread sends a plan report for attempt 1 with seq 1 and the branch's head, and then ends its turn
- **THEN** the thread is switched to the implement model, receives the apply instruction with a fresh context, and "Run phase" reads implement

### Requirement: Not idle yet
A report that meets every condition of Act except idleness SHALL get "not idle yet" when the thread still runs after 5 minutes or the switch is refused. Nothing MUST be written, and the report is judged again at the next wake.

#### Scenario: Report while the thread is busy
- **WHEN** R2's thread sends its matching plan report and keeps its turn running for 6 more minutes
- **THEN** nothing is written, and a manual wake after the turn ends acts on the kept report

### Requirement: Other mismatches and report only
A report from the recorded thread for the current attempt whose `seq` or head does not match, or whose phase is later than "Run phase", SHALL stop the task as above. A malformed report, a report for an issue that is not a task on this board or whose claim is incomplete, and a matching report for a phase other than plan SHALL be reported only, as not handled in M1.

#### Scenario: Head moved
- **WHEN** the recorded thread's newest plan report names a head that is not the remote head of the claimed branch (the linked branch, or the head branch of the issue's own closing pull request)
- **THEN** the task is stopped and reported

### Requirement: Apply instruction
The apply instruction SHALL name:
- the skill `task-run` and the phase implement;
- the issue URL, the launch key, the branch and the head sha;
- the board URL, on a line `Board:`;
- the conductor thread id;
- the change folder found at that head.

It MUST be sent with a fresh context.

#### Scenario: Fresh coding session
- **WHEN** the coding turn after the switch is asked for a codeword given only in the planning turns and written to no file
- **THEN** it cannot give the codeword, and it reads the named change folder

### Requirement: Wake report
Every wake SHALL end with a report that lists:
- the trigger;
- the items repaired, with each action;
- the threads settled, and every issue labelled for a merge that left it open;
- the items started, with their thread ids;
- the items not started, each with its reason;
- the answer given to each report;
- half-made claims;
- the state of the triggers when this wake changed them or checked them;
- gaps with their owner steps.

#### Scenario: Wake with nothing to do
- **WHEN** nothing needs repair or settling, no item is startable, and no report is pending
- **THEN** the report says so and lists every skipped item with its reason

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

### Requirement: Repair half-made claims
Repair SHALL run first in every wake that passes the identity check, even when the settings block has a gap. It covers each open board issue that:
- has a task key as its whole first line;
- is assigned to the agent, or has a non-empty "Run thread";
- is not labelled `blocked`.

Labelled issues MUST be skipped and listed.

The launch key is `<repo>#<n> attempt <Attempt, or 1 when empty>`.
- **When "Run thread" is set,** `t3_thread_read` on that id MUST decide.
- **When it is empty,** the issue MUST be decided by `t3_thread_search` in the repository's T3 project with the launch key and limit 50, with titles compared exactly.

Results:
- A read error, a search error or 50 matches MUST be treated as unknown: skip and report.
- Only an explicit "not found" counts as missing.
- **"Run thread" set:** a thread that exists, is not archived and has the launch key as its title needs nothing. A missing or archived thread, or a different title, MUST stop the item.
- **"Run thread" empty, one exact match:** MUST be recorded in "Run thread" and read back.
- **"Run thread" empty, no match:** the claim MUST be released only when there is no claimed branch, or the claimed branch has no commits beyond its base and no pull request. A branch with work MUST stop the item with the reason "work without a thread".
- **More than one match, or more than one linked branch,** MUST stop the item.
- **No T3 project, or several, for the issue's repository:** the item MUST be reported only. It MUST NOT be searched without a `projectId`, released or stopped.

A stop MUST write the label `blocked` and the agent comment:

```
Run stopped by the conductor.
Step: Repair.
Reason: <reason>.
```

A failed write MUST stop that item, not the wake.

#### Scenario: Issue assigned by hand with no thread
- **WHEN** a keyed issue is assigned to the agent with an empty "Run thread", no thread has its launch key, and it has no branch
- **THEN** the wake releases the claim and does not launch a second thread for it in Repair

#### Scenario: Thread launched, Run thread empty
- **WHEN** a thread titled with the launch key exists and "Run thread" is empty
- **THEN** the wake writes that thread's id to "Run thread", and no second thread is started

#### Scenario: Repository without a T3 project
- **WHEN** a claimed issue's repository has no T3 project
- **THEN** Repair reports it and makes no write

#### Scenario: Planning thread that has not pushed
- **WHEN** "Run thread" holds the id of a live thread whose branch has no commits yet
- **THEN** Repair leaves the claim alone

### Requirement: Release order
A release SHALL write in this order, reading each write back:
1. delete the empty claimed branch;
2. clear "Run phase";
3. clear "Attempt";
4. set Status to "Ready" when it is "In progress";
5. clear "Run thread";
6. remove the agent from the assignees.

#### Scenario: Wake dies during a release
- **WHEN** a wake stops after clearing "Attempt"
- **THEN** the issue is still assigned to the agent, and the next wake's Repair finishes the release

### Requirement: Settle merged work
Settle SHALL run after Repair, under the same identity check, even when the settings block has a gap. It covers each board item with a non-empty "Run thread" that is open, or that was closed in the last 7 days.

1. The branch MUST be the thread's `branch` from `t3_thread_read`. A thread with no branch MUST be skipped and reported.
2. A merged pull request MUST be looked for with `gh api "repos/<repo>/pulls?state=closed&head=<owner>:<branch>"` and in the thread's `pullRequests`. It counts only when it merged, its head ref equals that branch and its head repository is `<repo>` itself, and its author is the agent or has the association `OWNER`, `MEMBER` or `COLLABORATOR`. A lookup error MUST be unknown: skip the item.
3. With such a pull request, the issue MUST be read again:
   - **Closed:** settle the thread.
   - **Open, merged less than 5 minutes ago:** leave the item to the next wake.
   - **Open, merged earlier:** unless the issue already has `blocked`, write the label and the agent comment with `Step: Settle.` and the reason "merged without closing its issue", and do this before settling the thread.
4. An already settled thread MUST NOT be settled again, but step 3 MUST still run.

#### Scenario: Normal merge
- **WHEN** a task's pull request merges with `Closes`, and its issue is closed
- **THEN** the next wake settles the task thread

#### Scenario: Merge that leaves the issue open
- **WHEN** a test pull request from the claimed branch merges without closing its issue, and 5 minutes have passed
- **THEN** the issue gets `blocked` with the agent comment, and the thread is settled

### Requirement: Board read again after Repair and Settle
When Repair or Settle wrote anything, the wake SHALL read the board again and run the Ready filter again before Advance and Start.

#### Scenario: Released item is Ready
- **WHEN** Repair releases a claim whose Status becomes "Ready"
- **THEN** Start judges it on the new read in the same wake

### Requirement: Wake order
A wake SHALL run in this order:
1. preflight;
2. the identity check;
3. Repair;
4. Settle;
5. the board read again;
6. the end-of-board check;
7. Advance;
8. Start, skipped at the end of the board;
9. the automatic trigger check when its condition holds;
10. the wake report.

#### Scenario: End found in a wake
- **WHEN** the end-of-board check holds
- **THEN** Start does not run, Advance does, and the triggers are disabled after Advance
