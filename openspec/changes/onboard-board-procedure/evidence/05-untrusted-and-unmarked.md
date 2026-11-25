# Run 5: untrusted edit and missing marker

Brief step 5. Created #7 D (keyless, milestone 1) and #8 E (keyless, no milestone), both on board 5.

**Not done: the second-account edit of D.** No account other than `raidenyn-shadow` and `raidenyn` is available here, so D's body was not edited by a second account; its `userContentEdits` is empty and D is trusted. The run therefore planned a key for D (`scratch-rfc/m1-scratch/10`). To keep D usable as the fixture for that edit, the person (this run was made with the wait) left D's key out of the plan, and nothing was written. The sub-criterion "D named as untrusted (editor login)" is **not proved**.

| Expected | Actual |
|---|---|
| bodies equal before and after (`cmp`) | all of #1–#5, #7, #8 equal |
| D named as untrusted (editor login) | **not proved**: no second account; D trusted, key left out by the person |
| E named as missing a milestone marker | named: "no key, no milestone" |
| neither keyed | neither keyed |
| nothing else changes | no write; "Nothing changed." |

#### Plan (keys part) and the person's answer

````markdown
## Plan (keys part): raidenyn-shadow/task-run-scratch

| Issue | Plan | Reason |
|---|---|---|
| #1, #4, #5 | identified | task keys |
| #2 | identified | plan marker |
| #7 (D) | create key `<!-- task: scratch-rfc/m1-scratch/10 -->` | keyless, trusted (author raidenyn-shadow, 0 edits), milestone 1 marked |
| #8 (E) | no key | no milestone |

Everything else: reuse. Approval rule: no. Webhook: pending.

Person's answer (this run was made with the wait): agree, except the key of #7. D is the fixture for the
second-account edit, which no second account here can make; its key is left out of this run.
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
- #7: key `scratch-rfc/m1-scratch/10` planned, left out of this run by the person in the plan

### Could not do (owner step)
- #8: no key, no milestone. Put it in a milestone whose description holds `<!-- rfc: scratch-rfc/<milestone-slug> -->`, then run the onboarding again
- Approval rule: `main` requires no approving review. Require a pull request with at least 1 approving review on `main`: add a branch ruleset at https://github.com/raidenyn-shadow/task-run-scratch/settings/rules

Approval rule: no
Keys: 4 identified, 0 keyed in this run, 2 without a key (listed above with the reason)

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
## keys
5	open	scratch-rfc/m1-scratch/9
4	open	scratch-rfc/m1-scratch/8
3	closed	scratch-rfc/m1-scratch/7
1	open	scratch-rfc/m1-scratch/1
duplicates:
## slugs
["scratch-rfc"]
1	scratch-rfc/m1-scratch
#7 trusted
#7 milestone: 1
#8 trusted
#8 milestone: none
rulesets: 0
read: 0
````

#### D userContentEdits before

````json
{"data":{"repository":{"issue":{"author":{"login":"raidenyn-shadow"},"userContentEdits":{"totalCount":0,"nodes":[]}}}}}
````

#### D userContentEdits after

````json
{"data":{"repository":{"issue":{"author":{"login":"raidenyn-shadow"},"userContentEdits":{"totalCount":0,"nodes":[]}}}}}
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
````
