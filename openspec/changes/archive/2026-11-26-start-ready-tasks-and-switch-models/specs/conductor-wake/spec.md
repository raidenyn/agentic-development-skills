## ADDED Requirements

### Requirement: Wake procedure exists
The skill `project-conductor` SHALL hold a procedure "Run one wake" with one section per step in this order: Repair, Advance, Start.
- Repair MUST be present as a named step that does nothing yet, and MUST say so.
- The commands MUST be in `skills/project-conductor/references/run-github.md`.
- The skill's description MUST name the wake triggers.

#### Scenario: Validators accept the skill
- **WHEN** `python3 scripts/skills.py validate`, `claude plugin validate .`, the Python unit tests and `pnpm run check` run
- **THEN** all pass, and `SKILL.md` has the sections Repair, Advance and Start in that order

### Requirement: Wake message
A wake SHALL be a message to the conductor thread that ends with the sentence "Run one wake of the project-conductor skill for this repository.", optionally preceded by one phase report line. The served repository MUST be the repository of the conductor thread's own project checkout.

#### Scenario: Manual wake
- **WHEN** the owner sends only the wake sentence to the conductor thread
- **THEN** the conductor runs Repair, Advance and Start once and ends with its report

### Requirement: Settings and board preflight
Before Advance and Start, every wake SHALL read `PROJECT_URL`, the `project-conductor` key of `.agents/harness.json` and `.agents/hooked-rules/repo-run-models.md` from the default branch, and the board's fields. Field and option names MUST match exactly, case included: Status with "Ready" and "In progress", "Phase", "Run phase" with plan and implement, "Attempt", "Run thread". When any of these is missing or invalid, Advance and Start MUST write nothing, and the report MUST name the gap with the owner's step.

#### Scenario: Board without a Ready option
- **WHEN** the board's Status field has no option named exactly "Ready"
- **THEN** no issue is claimed, no thread is started, and the report names the missing option

### Requirement: Stop label exists
The conductor SHALL create the label `blocked` in the served repository when it is missing. When the label cannot be created, the wake MUST report it, and every stop that needs the label MUST be reported instead of written.

#### Scenario: Label missing
- **WHEN** the repository has no label `blocked`
- **THEN** the wake creates it before Advance

### Requirement: Models are resolved, never substituted
The conductor SHALL resolve only the roles a step uses (plan for Start, implement for Advance). A Model cell MUST be `<providerInstanceId>/<model id>`, split at the first `/`, and MUST match one model of that provider exactly in `orchestrator_capabilities` searched by the model id. A bare name, no match, or an effort that no option of that model offers MUST stop that step and be reported. A model MUST NOT be substituted.

#### Scenario: Provider-qualified implement model
- **WHEN** the implement cell is `opencode/ollama-cloud/deepseek-v4.1-flash:1017` with effort `high`
- **THEN** the switch uses instance `opencode`, model `ollama-cloud/deepseek-v4.1-flash:1017` and the option whose values include `high`

#### Scenario: Bare model name
- **WHEN** the plan cell is `Opus-5.5`
- **THEN** no thread is started, and the report names the cell and asks for a provider-qualified id

### Requirement: Board read in one query
Every wake SHALL read every page of the board once, before Advance and Start, in one paginated query that returns, per item:
- Status, Phase and the three run fields;
- assignees and labels;
- blockers, with state and state reason;
- linked branches;
- closing pull requests, with head repository and author;
- the body and the body edit history.

When any nested list holds more entries than it returned, the item MUST NOT be started and MUST be reported.

#### Scenario: Board larger than one page
- **WHEN** the board holds more items than one page returns
- **THEN** every page is read before any claim, and items on later pages are judged like the first

### Requirement: Ready rule
An item SHALL be Ready when, and only when, all three hold: it is a task in the monitored project (an open issue of the served repository on the `PROJECT_URL` board whose whole first line is a task key `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->` and whose Phase is not Planning or Outline); it has no blockers (no issue it is blocked by is open); and its Status is "Ready". Readiness MUST NOT depend on any other fact.

#### Scenario: Closed blocker
- **WHEN** a keyed task with Status "Ready" is blocked only by issues that are closed, whatever their close reason
- **THEN** it is Ready

#### Scenario: Open blocker
- **WHEN** a keyed task with Status "Ready" is blocked by an open issue
- **THEN** it is not Ready, and the report names the blocker

### Requirement: Items that are not tasks
Plan items (`<!-- plan: … -->`), items with Phase Planning or Outline, keyless issues, pull requests, draft items and issues of other repositories SHALL be reported as not handled and MUST be left alone.

#### Scenario: Planning item
- **WHEN** a keyed issue with Status "Ready" has Phase "Planning"
- **THEN** it is not started, and the report says planning items are not handled yet

### Requirement: Waiting for Ready is reported
An item in Backlog whose body has a "Ready to start when" condition SHALL be reported as waiting for a person to set Ready. The "Ready to start when" text MUST be used only for this report wording.

#### Scenario: Open start condition
- **WHEN** an issue's body names a "Ready to start when" condition and its Status is Backlog
- **THEN** it is not started, and the report says it is waiting for a person to set Ready

### Requirement: Trusted issues only
As a start guard, not part of Ready, the conductor SHALL start a Ready issue only when its author and every editor of its body are the agent account or the repository owner. When the edit history cannot be read completely, has more pages, holds a deleted edit or an editor that cannot be identified, the issue MUST NOT be started and MUST be reported as untrusted.

#### Scenario: Body edited by a second account
- **WHEN** a Ready keyed issue's body was edited by an account that is neither the agent nor the repository owner
- **THEN** it is not started, and the report names it as untrusted

### Requirement: Taken items are left alone
As a start guard, not part of Ready, an item SHALL count as taken when it has any of the following:
- an assignee;
- a non-empty "Run thread", "Attempt" or "Run phase";
- a linked branch;
- a closing pull request that is not cross-repository, or whose author association is `OWNER`, `MEMBER` or `COLLABORATOR`;
- a T3 thread whose title is exactly its launch key `<owner>/<repo>#<n> attempt <n>`.

A taken item MUST NOT be started and MUST be reported. A pull request from a fork by an account without write access MUST NOT make an item taken.

#### Scenario: Linked branch present
- **WHEN** a Ready keyed issue already has a linked branch
- **THEN** it is not started, and the report names the branch

### Requirement: Parallel limit
The conductor SHALL count as in use every open board issue that is assigned to the agent account or has a non-empty "Run thread", whatever its Status. It SHALL start Ready items that pass both start guards in ascending issue number only while in use is below `maxParallel`. The items not started MUST stay Ready and be reported.

#### Scenario: Three Ready tasks, limit two
- **WHEN** three Ready issues pass both guards, none is in use, and `maxParallel` is 2
- **THEN** one wake starts exactly two threads, and the third issue stays Ready and is reported

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
5. create and link the branch `<type>/<n>-<slug>` with `gh issue develop`, where `<type>` is `feat` for Feature, Foundation, Migration or an empty Phase, `refactor` for Refactor, `fix` for Hardening and `chore` for Spike;
6. launch one worktree thread on that branch, titled with the launch key, with the launch key (or its sanitised form) as `clientRequestId`, on the plan role's model and effort, with the start instruction;
7. write the thread id to "Run thread".

A failed step MUST stop that item's claim and be reported. Completed writes stay.

#### Scenario: Claimed issue on the board
- **WHEN** a Ready issue that passes both guards is claimed
- **THEN** it shows the agent as assignee, Status "In progress", "Run phase" plan, "Attempt" 1, the thread id and a linked branch, and the thread's title is the launch key

### Requirement: Start instruction
The start instruction SHALL name:
- the skill `task-run`;
- the issue URL, the launch key, the attempt and the branch;
- the conductor thread id;
- the exact phase report line to send, with `head` left for the thread to fill.

#### Scenario: Thread receives the start instruction
- **WHEN** a thread is launched by a claim
- **THEN** its first message names `task-run`, the issue, the launch key, the branch, the conductor thread id and the report line

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
- the conductor thread id;
- the change folder found at that head.

It MUST be sent with a fresh context.

#### Scenario: Fresh coding session
- **WHEN** the coding turn after the switch is asked for a codeword given only in the planning turns and written to no file
- **THEN** it cannot give the codeword, and it reads the named change folder

### Requirement: Wake report
Every wake SHALL end with a report that lists:
- the items started, with their thread ids;
- the items not started, each with its reason;
- the answer given to each report;
- half-made claims;
- gaps with their owner steps.

#### Scenario: Wake with nothing to do
- **WHEN** no item is startable and no report is pending
- **THEN** the report says so and lists every skipped item with its reason
