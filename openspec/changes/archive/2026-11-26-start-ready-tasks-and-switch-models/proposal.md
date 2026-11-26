## Why

An onboarded board still needs the owner to start every task and to switch each session to the coding model. Task #34 (`unattended-task-runs/m1-loop/2`) builds the thinnest end-to-end path of the RFC's loop: the board read, the claim, the run record, the thread, the phase report and the switch. It also tests the RFC's riskiest assumption inside a real task: that a coding model starting a fresh session from the reviewed files is enough to implement. Building this now gives the later M1 tasks (repair, settling, webhook and timer) a working loop to extend.

## What Changes

**`project-conductor` runs one wake**
- From: the skill holds only "Onboard a board", and its description says it is "Not for … running them".
- To: the skill also holds "Run one wake", with one section per step in the order Repair, Advance, Start.
  - Repair is a named empty step.
  - Advance judges phase reports against the run record. When a report matches, it switches the thread once to the implement model and sends the apply instruction with a fresh context.
  - Start claims Ready tasks into free slots and launches one worktree thread per task.
  - The commands go in a new reference file, `references/run-github.md`: one paginated board query, a `jq` filter that prints each item with `start` or the reason it is skipped, and the claim, switch and report commands.
- Reason: task #34's scope, and the "Conductor wake steps" contract.
- Impact: non-breaking. Onboarding is unchanged. Nothing runs until a conductor thread is woken on an onboarded board.

**Ready, as the owner defined it**
- From: the RFC's Board reading requires that "Ready to start when" conditions are "confirmed", without saying how.
- To: Ready is exactly three things: the issue is a task in the monitored project, it has no blockers (none open), and its Status is Ready. A Ready item is started only when two guards also pass:
  - not taken: no assignee, no run field set, no linked branch, no trusted linked pull request, and no thread with its launch key;
  - a trusted body (Trusted input).

  A person setting Status to Ready is the confirmation of "Ready to start when".
- Reason: the owner's decision in the brainstorm. `project-ready` and `task-publishing` already keep items with open conditions out of Ready.
- Impact: this refines the RFC's wording. The pull request reports it.

**New skill `task-run`**
- What a thread started by the conductor does:
  1. reconcile by the task's Start section;
  2. plan by the repository's own process, with today's owner stops;
  3. push, send the phase report, and end the turn;
  4. after the switch, implement from the named change folder in a fresh session, through to the pull request, by the repository's own process.
- It is created with `python3 scripts/skills.py new task-run "<description>"`. It gets a marketplace entry and a row in the README.

**Start and apply instructions**
- The exact wording of the two messages a task thread receives. Both name `task-run`, the issue, the launch key, the branch and the conductor thread. The apply message also names the head and the change folder.

**Proof ground**
- The scratch board (project 5 of `raidenyn-shadow`) and its repository get what the proofs need: Status options, the Phase field, an OpenSpec setup, an exact implement model id, and the prepared test issues.

## Capabilities

### New Capabilities
- `conductor-wake`: one wake of the conductor. It covers the settings and board preflight, Board reading, the Ready rule, Trusted input for issues, the parallel limit, the claim and its order, the launch key, and the Advance answers to a phase report (act, not idle yet, already handled, stop, report only) with the model switch and the apply instruction.
- `task-run-thread`: what a thread started by the conductor does. It covers reconciling, planning with today's stops, sending the phase report with no background command running, and implementing from the saved files after the switch.

### Modified Capabilities

None. The `board-onboarding` requirements are unchanged. Only the skill's description gains the wake triggers.

## Impact

- **Files:**
  - `skills/project-conductor/SKILL.md`: the new procedure and the description;
  - `skills/project-conductor/references/run-github.md`: new;
  - `skills/task-run/SKILL.md`: new;
  - `.claude-plugin/marketplace.json` and `README.md`.
- **Unchanged:** `task-publishing`, `milestone-breakdown`, the `superspec` schema and the harness tools. No new dependency.
- **Contracts:**
  - Run record (provisional): produced. The claim, Status, the linked branch, the launch key, and the writes to the three fields.
  - Phase report (provisional): produced. `seq` is derived from the phase, a weakening recorded for M3.
  - Settings (frozen): consumed. The skill name `task-run` is used as frozen.
- **External state, scratch only:** the board, issues, labels and threads under `raidenyn-shadow`. Live proofs run only there.
- **Owner actions needed for the proofs:** accept the collaborator invite on `raidenyn-shadow/task-run-scratch` (today `raidenyn` has only `read`), and edit one issue body for the second-author case.
