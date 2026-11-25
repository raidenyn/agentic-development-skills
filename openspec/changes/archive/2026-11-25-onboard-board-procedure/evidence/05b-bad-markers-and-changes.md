# Run 5b: bad markers and changes after the survey

Brief step 5b. Created milestone 2 "M1 other" (`<!-- rfc: other-rfc/m1-other -->`), and on board 5: #9 M (first line `<!-- task: scratch-rfc/m1-scratch -->`), #10 X (keyless, milestone 2), #11 W (keyless, milestone 1), #12 V (keyless, milestone 1). Run with the wait. While the plan waited: W's body edited as `raidenyn-shadow`; #13 Y created off the board holding V's proposed key `scratch-rfc/m1-scratch/12`. Then the implementing agent, playing the person, agreed (D's key again left out, as in run 5).

> **Who agreed.** No human took part in this run. On the scratch ground the implementing agent played the person, under the coordinator's pre-agreement for the scratch runs. Agreeing, and leaving D's key out again, was the implementing agent's own decision, not a human approval. At the time of this run, agreeing to a plan except one item was not covered by the procedure. SKILL.md has since added the rule "Agreeing to part of the plan": a dropped item is not written and is listed under Pending as "dropped by the person". The report below was written before that rule; under it, the #7 line would read "#7 (D): key `scratch-rfc/m1-scratch/10`: dropped by the person".


| Expected | Actual |
|---|---|
| M reported malformed and unchanged | reported malformed; body `cmp` equal |
| X reported for the RFC slug mismatch | "milestone's RFC slug `other-rfc` differs from the board's `scratch-rfc`" |
| W skipped as changed after the survey | re-check `cmp` failed: skipped, "changed during the run"; body equals the hand edit, no key |
| V skipped and named with its key now held by Y; body equal (`cmp`) | "key `scratch-rfc/m1-scratch/12` was taken by #13 during the run"; body equal |
| nothing keyed | nothing keyed; "Nothing changed." |

#### Plan

````markdown
## Plan: raidenyn-shadow/task-run-scratch, board https://github.com/users/raidenyn-shadow/projects/5

Mode: with the wait. Steps 2-4: reuse (`PROJECT_URL`, the three fields, `harness.json` key and `repo-run-models.md` on `main`, no branch or PR). Approval rule: no. Webhook: pending.

| Issue | Plan | Reason |
|---|---|---|
| #1, #4, #5 | identified | task keys |
| #2 | identified | plan marker |
| #7 (D) | create key `<!-- task: scratch-rfc/m1-scratch/10 -->` | keyless, trusted, milestone 1 marked |
| #8 (E) | no key | no milestone |
| #9 (M) | no key, malformed | first line `<!-- task: scratch-rfc/m1-scratch -->` |
| #10 (X) | no key | milestone's RFC slug `other-rfc` differs from the board's `scratch-rfc` |
| #11 (W) | create key `<!-- task: scratch-rfc/m1-scratch/11 -->` | keyless, trusted, milestone 1 marked |
| #12 (V) | create key `<!-- task: scratch-rfc/m1-scratch/12 -->` | keyless, trusted, milestone 1 marked |

Highest number under `scratch-rfc/m1-scratch`: 9 (#5).
````

#### During the wait

````text
$ edit #11 (W) as raidenyn-shadow
https://github.com/raidenyn-shadow/task-run-scratch/issues/11
$ create Y off the board with V's proposed key
#13 https://github.com/raidenyn-shadow/task-run-scratch/issues/13
[{"editor":{"login":"raidenyn-shadow"},"id":"UCE_lAHOV7nCMc8AAAABibVmPc8AAAABOIrEgA","updatedAt":"2026-11-25T13:16:30Z"},{"editor":{"login":"raidenyn-shadow"},"id":"UCE_lAHOV7nCMc8AAAABibVmPc8AAAABOIrEfA","updatedAt":"2026-11-25T13:16:30Z"}]
````

#### Key writes after agreement

````text
Implementing agent, playing the person, agrees (except #7, left out as in run 5; partial agreement was not covered by the procedure at the time of this run).
cmp: EOF on ‘<scratchpad>/run5b/keys/11.survey.body’ after byte 22, line 1
#11 SKIP: body changed during the run
exit=2
#12 SKIP: key `scratch-rfc/m1-scratch/12` was taken by #13 during the run
exit=2
````

#### Report

````markdown
## Onboarding: raidenyn-shadow/task-run-scratch, board https://github.com/users/raidenyn-shadow/projects/5

Mode: written after agreement

### Created
- none

### Changed
- none

### Reused
- `PROJECT_URL` = https://github.com/users/raidenyn-shadow/projects/5
- Field "Run phase" (SINGLE_SELECT, all four options)
- Field "Attempt" (NUMBER)
- Field "Run thread" (TEXT)
- `.agents/harness.json` with key `project-conductor`, on `main`
- `.agents/hooked-rules/repo-run-models.md` on `main`; `repo-review-models.md` absent
- No branch and no pull request needed
- Keys: #1 `scratch-rfc/m1-scratch/1`, #4 `scratch-rfc/m1-scratch/8`, #5 `scratch-rfc/m1-scratch/9`; plan #2 `scratch-rfc/m1-scratch`

### Pending
- Webhook: pending. Created by the task "Repair claims, settle merged work and wake on events".
- #11 (W): changed during the run (body edited after the survey); keyed by the next run
- #12 (V): key `scratch-rfc/m1-scratch/12` was taken by #13 during the run; not renumbered, keyed by the next run
- #7 (D): key `scratch-rfc/m1-scratch/10` planned, left out of this run in the plan by the implementing agent playing the person (partial agreement: not covered by the procedure at the time of this run; see the note above)

### Could not do (owner step)
- #8 (E): no key, no milestone. Put it in a milestone whose description holds `<!-- rfc: scratch-rfc/<milestone-slug> -->`, then run the onboarding again
- #9 (M): malformed marker, first line `<!-- task: scratch-rfc/m1-scratch -->`; left unchanged. Fix the first line to a full key or remove it
- #10 (X): no key, milestone's RFC slug `other-rfc` differs from the board's `scratch-rfc`
- Approval rule: `main` requires no approving review. Require a pull request with at least 1 approving review on `main`: add a branch ruleset at https://github.com/raidenyn-shadow/task-run-scratch/settings/rules

Approval rule: no
Keys: 4 identified, 0 keyed in this run, 6 without a key (listed above with the reason)

Nothing changed.
````

#### Survey

````text
raidenyn-shadow
raidenyn-shadow/task-run-scratch
raidenyn-shadow
main
true
true
PROJECT_URL: https://github.com/users/raidenyn-shadow/projects/5
fields: all three reused
main .agents/harness.json present
main .agents/hooked-rules/repo-run-models.md present
main .agents/hooked-rules/repo-review-models.md absent
open PRs: []
key reused: true
repo-run-models.md reused
## items
1	identified	<!-- task: scratch-rfc/m1-scratch/1 -->
2	identified	<!-- plan: scratch-rfc/m1-scratch -->
4	identified	<!-- task: scratch-rfc/m1-scratch/8 -->
5	identified	<!-- task: scratch-rfc/m1-scratch/9 -->
7	keyless	Task D body, written by the agent account.
8	keyless	Task E body, no milestone.
9	malformed	<!-- task: scratch-rfc/m1-scratch -->
10	keyless	Task X in milestone of other-rfc.
11	keyless	Task W original body.
12	keyless	Task V body.
## keys
5	open	scratch-rfc/m1-scratch/9
4	open	scratch-rfc/m1-scratch/8
3	closed	scratch-rfc/m1-scratch/7
1	open	scratch-rfc/m1-scratch/1
duplicates:
## slugs
["scratch-rfc"]
1	scratch-rfc/m1-scratch
2	other-rfc/m1-other
#7 trusted
#7 milestone: 1
#8 trusted
#8 milestone: none
#10 trusted
#10 milestone: 2
#11 trusted
#11 milestone: 1
#12 trusted
#12 milestone: 1
rulesets: 0
read: 0
````

#### cmp before/after

````text
#1: equal before and after
#2: equal before and after
#3: equal before and after
#4: equal before and after
#5: equal before and after
#7: equal before and after
#8: equal before and after
#9: equal before and after
#10: equal before and after
#11: cmp: EOF on ‘before/11.body’ after byte 22, line 1
#12: equal before and after
#11 differs only by the edit made during the wait:
1a2
> Edited while the plan waited.
#11 after == the hand edit (no key written)
#13 on board? 0
keys now: 13	scratch-rfc/m1-scratch/12 5	scratch-rfc/m1-scratch/9 4	scratch-rfc/m1-scratch/8 3	scratch-rfc/m1-scratch/7 1	scratch-rfc/m1-scratch/1 
````
