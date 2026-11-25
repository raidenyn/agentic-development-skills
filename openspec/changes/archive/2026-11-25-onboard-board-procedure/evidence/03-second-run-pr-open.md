# Run 3: second run, settings PR open

Brief step 3. Same inputs as run 2.

Defect found and fixed: reading the files "from the onboarding branch" by name wrote to `<work>/chore/project-conductor-onboarding/<file>`, a folder that did not exist, so the read came out as "unreadable"; the reference also listed `<work>/<sha>` in the first `mkdir` before the SHA was known. Fixed (`fix: read the onboarding branch by its head SHA into a folder made once it is known`) and the settings survey rerun at the PR's head SHA.

| Expected | Actual |
|---|---|
| no write | no write |
| "Nothing changed." | stated |
| open PR and pending webhook still listed | PR #6 under Reused and "Merge …" under Pending; webhook pending |
| bodies unchanged | #1–#5 `cmp` equal to run 2's after-bodies |
| PR head SHA unchanged | 74530ed… before and after |

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
- `.agents/harness.json` with key `project-conductor`, on branch `chore/project-conductor-onboarding` at 74530ed
- `.agents/hooked-rules/repo-run-models.md` and the removal of `repo-review-models.md`, on the same branch
- Branch `chore/project-conductor-onboarding` (head 74530ed, unchanged since the compare)
- Pull request https://github.com/raidenyn-shadow/task-run-scratch/pull/6
- Keys: #1 `scratch-rfc/m1-scratch/1`, #4 `scratch-rfc/m1-scratch/8`, #5 `scratch-rfc/m1-scratch/9`; plan #2 `scratch-rfc/m1-scratch`

### Pending
- Webhook: pending. Created by the task "Repair claims, settle merged work and wake on events".
- Merge https://github.com/raidenyn-shadow/task-run-scratch/pull/6

### Could not do (owner step)
- Approval rule: `main` requires no approving review. Require a pull request with at least 1 approving review on `main`: add a branch ruleset at https://github.com/raidenyn-shadow/task-run-scratch/settings/rules

Approval rule: no
Keys: 4 identified, 0 keyed in this run, 0 without a key (listed above with the reason)

Nothing changed.
````

#### Preflight, variable, fields, first (failing) branch read

The lines from `fields:` on were copied from the terminal output of the same command: the saved `preflight.out` held only its first part.

````text
raidenyn-shadow
raidenyn-shadow/task-run-scratch
raidenyn-shadow
main
true
true
PVT_kwHOD4ARxs4BtKTK https://github.com/users/raidenyn-shadow/projects/5 task-run scratch
PROJECT_URL: https://github.com/users/raidenyn-shadow/projects/5
fields: same as run 2 (all three reused, no option missing)
main .agents/harness.json present
main .agents/hooked-rules/repo-run-models.md absent
main .agents/hooked-rules/repo-review-models.md present
branch sha=74530ed18f651a5873f9d7ac898fcc7ad5df1423
-- read from the onboarding branch by name, as 'from the onboarding branch when it exists' reads:
<scratchpad>/bin/rd.sh: line 5: <scratchpad>/run3/chore/project-conductor-onboarding/harness.json: No such file or directory
chore/project-conductor-onboarding .agents/harness.json unreadable
````

#### Settings survey at the PR head (after the fix)

````text
[{"baseRefName":"main","headRefOid":"74530ed18f651a5873f9d7ac898fcc7ad5df1423","headRepository":{"id":"R_kgDOV7nCMQ","name":"task-run-scratch","nameWithOwner":"raidenyn-shadow/task-run-scratch"},"isCrossRepository":false,"number":6,"url":"https://github.com/raidenyn-shadow/task-run-scratch/pull/6"}]
sha=74530ed18f651a5873f9d7ac898fcc7ad5df1423
74530ed18f651a5873f9d7ac898fcc7ad5df1423 .agents/harness.json present
74530ed18f651a5873f9d7ac898fcc7ad5df1423 .agents/hooked-rules/repo-run-models.md present
74530ed18f651a5873f9d7ac898fcc7ad5df1423 .agents/hooked-rules/repo-review-models.md absent
modified .agents/harness.json 
renamed .agents/hooked-rules/repo-run-models.md .agents/hooked-rules/repo-review-models.md
valid
false
refs: grep exit=1
expected: modified .agents/harness.json; added .agents/hooked-rules/repo-run-models.md; removed .agents/hooked-rules/repo-review-models.md
branch (rename read as removed+added): same set
harness.json at 74530ed18f651a5873f9d7ac898fcc7ad5df1423 == planned
repo-run-models.md at 74530ed18f651a5873f9d7ac898fcc7ad5df1423 == planned
repo-review-models.md absent at 74530ed18f651a5873f9d7ac898fcc7ad5df1423
=> reuse branch and PR #6 as is
````

#### Keys survey

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
````

#### Approval rule reads

````text
rulesets: 0
read: 0
````

#### Checks after the run

````text
#1: unchanged since run 2
#2: unchanged since run 2
#3: unchanged since run 2
#4: unchanged since run 2
#5: unchanged since run 2
PR #6 head: 74530ed18f651a5873f9d7ac898fcc7ad5df1423 OPEN
PROJECT_URL: https://github.com/users/raidenyn-shadow/projects/5
fields unchanged
PRs from branch (all states): #6 OPEN
````
