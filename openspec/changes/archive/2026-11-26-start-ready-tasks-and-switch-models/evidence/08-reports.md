# Criterion 4: prepared reports get their contract answers (2026-11-25)

Conductor thread: `mcp:launch:542ee5f8587270275e12dd5e5f957a9d1e40ba34221cc17793da25ca0ac25753`. Controller thread, which sent the foreign report: `808d7ed4-2ae6-4042-8b7b-953cdef32c7d`.

## How the reports were prepared

- **The conductor-started task threads refuse outside instructions.** R2's thread (#16) declined twice to hold its turn busy when the controller asked. It said the request came from a thread that is "not from you or the conductor". This is the trusted-input rule working, but it means a conductor-started thread cannot be made to send a crafted report.
- **The fixture.** The not-idle and wrong-attempt reports were therefore made on #17 (R3) with a hand-made claim:
  - assignee `raidenyn-shadow`, Status In progress, Attempt 1, Run phase plan;
  - branch `feat/17-r3-add-a-reverser`, linked with `gh issue develop`, holding a hand-written change folder `openspec/changes/add-reverser/` at `8fea6e6`;
  - Run thread = a probe thread `mcp:launch:a7a310a3…d9d9`, which the controller launched on `claude-haiku-5-5` with the launch key as its title.

  The conductor treated it as a complete claim and noted, correctly, that the thread was a test fixture.

## The answers

| # | Prepared report | Board before | Conductor's answer (wake) | Board after |
|---|---|---|---|---|
| 1 | **Repeat**: the plan reports of #15, #16 and #17, judged again after each switch | Run phase implement | "handled. The report's phase is plan, which is earlier than its Run phase implement" (wakes 3, 6 and 7). Nothing written, nothing sent | unchanged |
| 2 | **Busy**: #17's own thread sent `phase-done …#17 attempt=1 phase=plan seq=1 head=8fea6e6…`, then ran `sleep 480` in the same turn | #17 plan | wake 4: "The thread was still running after 5 minutes, so #17 is answered `not-idle`." Nothing written | #17 still plan |
| 2b | the same report, kept and judged again at the next wake (triggered by report 3) | #17 plan, thread idle | wake 5: "act. This is the report the last wake left as `not-idle` … The model was switched to `opencode/ollama-cloud/deepseek-v4.1-flash:1017` (variant high) … the apply instruction was sent … "Run phase" is implement." | #17 implement; its thread implemented and opened draft PR #25 |
| 3 | **Another thread**: the controller sent `phase-done …#16 attempt=1 phase=plan seq=1 head=e9fc330…` | #16 implement, Run thread `mcp:launch:89eac8d2…` | wake 6: "**stop**. It was sent by thread 808d7ed4-…, not by the Run thread mcp:launch:89eac8d2…. Resume in phase implement." | #16 has label `blocked` and the comment "Run stopped by the conductor. Report: message:mcp:…:db71b30e-… from 808d7ed4-… > phase-done …" |
| 4 | **Wrong attempt**: #17's own Run thread sent `phase-done …#17 attempt=2 phase=plan seq=1 head=8fea6e6…` | #17 implement, Attempt 1 | wake 7: "stop, attempt=2, but Attempt is 1. Resume in phase implement. Label `blocked` added" | #17 has label `blocked` and a stop comment |

The answers are distinct: handled, not-idle then act, stop (foreign sender) and stop (wrong attempt). Each stop is recorded once. On later wakes the stopped messages read back as `recorded`, and no second comment was added for the same message.

## Defect found and fixed during the proof

Report 3 was first sent before the fix, in wake 5. It was answered `report-only, incomplete claim (#16 has no linked branch)`, which is wrong.

- **Cause.** GitHub removes an issue's linked branch once a pull request from that branch references the issue with a closing keyword. #15, #16 and #17 all lost theirs when their threads opened PRs #23, #24 and #25.
- **Fix.** Commit `8bde300` defines the *claimed branch* as the one linked branch or, when none is linked, the head branch of the issue's own closing pull request. With the fix synced to the scratch repository (`833a960`), wake 6 judged both foreign reports as `stop`: the one sent again and the one kept from wake 5.

## Result

**Done.** Each prepared report got the answer the contract names, and the answers differ.

One limit: the busy and wrong-attempt reports came from a fixture thread recorded as Run thread, not from a thread the conductor started.

## Left on the scratch ground

Kept for later proofs:
- the conductor thread;
- #15, #16 and #17 with their draft PRs #23, #24 and #25 and their run fields (#16 and #17 labelled `blocked`);
- the test issues #18 to #22;
- the `blocked` label.

The probe threads have done their job.
