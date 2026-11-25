# Run 4: after the merge

Brief step 4. PR #6 merged by the agent (it administers the scratch repository; stands in for the owner's merge): merge commit b8f4af5. Branch left in place, no open PR.

| Expected | Actual |
|---|---|
| settings reused from the default branch | `harness.json` key equal (`jq -e` true); `repo-run-models.md` built from itself equals the file on `main` (`cmp`) |
| "Reviewer presets" section unchanged | `diff` of the section against run 2's planned file prints nothing |
| no branch or PR created | none: only PR #6 (MERGED) from the branch; branch head still 74530ed |
| "Nothing changed." | stated |

#### Report

````markdown
## Onboarding: raidenyn-shadow/task-run-scratch, board https://github.com/users/raidenyn-shadow/projects/5

Mode: written without asking

### Created
- none

### Changed
- none

### Reused
- `PROJECT_URL` = https://github.com/users/raidenyn-shadow/projects/5
- Field "Run phase" (SINGLE_SELECT, all four options)
- Field "Attempt" (NUMBER)
- Field "Run thread" (TEXT)
- `.agents/harness.json` with key `project-conductor`, on the default branch `main`
- `.agents/hooked-rules/repo-run-models.md` on `main` (models plan Opus-5.5, review GPT-6.2-Sol, implement DeepSeek; reviewer presets read from it)
- Removal of `repo-review-models.md`: absent on `main`
- No branch and no pull request needed: the default branch holds the planned content
- Keys: #1 `scratch-rfc/m1-scratch/1`, #4 `scratch-rfc/m1-scratch/8`, #5 `scratch-rfc/m1-scratch/9`; plan #2 `scratch-rfc/m1-scratch`

### Pending
- Webhook: pending. Created by the task "Repair claims, settle merged work and wake on events".

### Could not do (owner step)
- Approval rule: `main` requires no approving review. Require a pull request with at least 1 approving review on `main`: add a branch ruleset at https://github.com/raidenyn-shadow/task-run-scratch/settings/rules

Approval rule: no
Keys: 4 identified, 0 keyed in this run, 0 without a key (listed above with the reason)

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
PVT_kwHOD4ARxs4BtKTK https://github.com/users/raidenyn-shadow/projects/5 task-run scratch
PROJECT_URL: https://github.com/users/raidenyn-shadow/projects/5
fields: all three reused
main .agents/harness.json present
main .agents/hooked-rules/repo-run-models.md present
main .agents/hooked-rules/repo-review-models.md absent
branch: 74530ed18f651a5873f9d7ac898fcc7ad5df1423
open PRs: []
harness valid
key reused: true
models: only repo-run-models.md exists -> source of its own triggers, presets and models:
| plan | Opus-5.5 | medium |
| review | GPT-6.2-Sol | medium |
| implement | DeepSeek | medium |
planned repo-run-models.md == main: reused
presets section vs run 2 planned:
Reviewer presets unchanged
expected changes: none -> reuse, no branch or pull request
````

#### Keys, approval and checks after the run

````text
## items
1	identified	<!-- task: scratch-rfc/m1-scratch/1 -->
2	identified	<!-- plan: scratch-rfc/m1-scratch -->
4	identified	<!-- task: scratch-rfc/m1-scratch/8 -->
5	identified	<!-- task: scratch-rfc/m1-scratch/9 -->
## keys
5	open	scratch-rfc/m1-scratch/9
4	open	scratch-rfc/m1-scratch/8
3	closed	scratch-rfc/m1-scratch/7
1	open	scratch-rfc/m1-scratch/1
duplicates:
## slugs
["scratch-rfc"]
1	scratch-rfc/m1-scratch
rulesets: 0
read: 0
## after
#1: unchanged
#2: unchanged
#3: unchanged
#4: unchanged
#5: unchanged
PRs from branch (all states): #6 MERGED
branch head: 74530ed18f651a5873f9d7ac898fcc7ad5df1423
main head: b8f4af5e70984959368055a37d9f88ddd97198b0
````
