# Run 6: missing settings file and a partial PR

Brief step 6. Before the run: commit 5aa65c4 on `chore/project-conductor-onboarding` of `task-run-scratch-bare` holding only the planned `.agents/harness.json`, and PR #1 opened from it. Then the procedure ran for `task-run-scratch-bare` with board 5, without the wait.

One transient GitHub error (HTTP 500 "diff temporarily unavailable") on the read-back compare; repeated, it answered. Not a procedure defect.

| Expected | Actual |
|---|---|
| the same PR gains one commit adding `repo-run-models.md` | PR #1: 5aa65c4 → 8b48807, one commit adding `repo-run-models.md` |
| no second PR | `gh pr list --state all` shows only #1 |
| `.agents/harness.json` holds only the `project-conductor` key | `jq keys` = `["project-conductor"]` |
| `repo-run-models.md` with no presets section | `grep -c "Reviewer presets"` = 0 |

#### Report

````markdown
## Onboarding: raidenyn-shadow/task-run-scratch-bare, board https://github.com/users/raidenyn-shadow/projects/5

Mode: written without asking

### Created
- `PROJECT_URL` = https://github.com/users/raidenyn-shadow/projects/5
- `.agents/hooked-rules/repo-run-models.md` (role table only: plan Opus-5.5, review GPT-6.2-Sol, implement DeepSeek, effort medium), commit 8b48807 on branch `chore/project-conductor-onboarding`

### Changed
- none

### Reused
- Field "Run phase" (SINGLE_SELECT, all four options)
- Field "Attempt" (NUMBER)
- Field "Run thread" (TEXT)
- `.agents/harness.json` (added, only the key `project-conductor`), already on the branch at 5aa65c4 with the planned content
- Branch `chore/project-conductor-onboarding`, completed with one commit (5aa65c4 → 8b48807)
- Pull request https://github.com/raidenyn-shadow/task-run-scratch-bare/pull/1

### Pending
- Webhook: pending. Created by the task "Repair claims, settle merged work and wake on events".
- Merge https://github.com/raidenyn-shadow/task-run-scratch-bare/pull/1

### Could not do (owner step)
- Approval rule: `main` requires no approving review. Require a pull request with at least 1 approving review on `main`: add a branch ruleset at https://github.com/raidenyn-shadow/task-run-scratch-bare/settings/rules

Approval rule: no
Keys: 0 identified, 0 keyed in this run, 0 without a key (listed above with the reason)
````

#### Survey

````text
## Preflight
raidenyn-shadow
raidenyn-shadow/task-run-scratch-bare
raidenyn-shadow
main
true
true
PVT_kwHOD4ARxs4BtKTK https://github.com/users/raidenyn-shadow/projects/5 task-run scratch
## Variable
PROJECT_URL: []
## Fields
all three reused
## Settings
main .agents/harness.json absent
main .agents/hooked-rules/repo-run-models.md absent
main .agents/hooked-rules/repo-review-models.md absent
branch: 5aa65c49bc90b5eeefa1fcebc9ba739ff3bd3d41
[{"baseRefName":"main","headRefOid":"5aa65c49bc90b5eeefa1fcebc9ba739ff3bd3d41","headRepository":{"id":"R_kgDOV7nCvQ","name":"task-run-scratch-bare","nameWithOwner":"raidenyn-shadow/task-run-scratch-bare"},"isCrossRepository":false,"number":1,"url":"https://github.com/raidenyn-shadow/task-run-scratch-bare/pull/1"}]
harness.json absent: create with only the key
models: neither file exists -> role table only
expected: added .agents/harness.json; added .agents/hooked-rules/repo-run-models.md
compare at sha=5aa65c49bc90b5eeefa1fcebc9ba739ff3bd3d41
added .agents/harness.json 
5aa65c49bc90b5eeefa1fcebc9ba739ff3bd3d41 .agents/harness.json present
5aa65c49bc90b5eeefa1fcebc9ba739ff3bd3d41 .agents/hooked-rules/repo-run-models.md absent
5aa65c49bc90b5eeefa1fcebc9ba739ff3bd3d41 .agents/hooked-rules/repo-review-models.md absent
harness.json at sha == planned
=> strict subset {added harness.json}, equal content, no roster swap: complete with one commit
## Keys
## items
## keys
duplicates:
## slugs
["scratch-rfc"]
## Approval
rulesets: 0
read: 0
````

#### Writes

````text
## Variable write
re-read: []
read back: https://github.com/users/raidenyn-shadow/projects/5
## Complete the partial branch
head still: 5aa65c49bc90b5eeefa1fcebc9ba739ff3bd3d41
commit exit=0
To github.com:raidenyn-shadow/task-run-scratch-bare.git
   5aa65c4..8b48807  HEAD -> chore/project-conductor-onboarding
push exit=0
open PRs: [{"headRefOid":"5aa65c49bc90b5eeefa1fcebc9ba739ff3bd3d41","number":1}]
new head 8b48807470beecc27dd0ff4075d99f7f2b02d8a6
{"message":"Server Error: Sorry, this diff is temporarily unavailable due to heavy server load.","errors":[{"resource":"Comparison","field":"diff","code":"not_available"}],"documentation_url":"https://docs.github.com/rest/commits/commits#compare-two-commits","status":"500"}gh: Server Error: Sorry, this diff is temporarily unavailable due to heavy server load. (HTTP 500)
8b48807470beecc27dd0ff4075d99f7f2b02d8a6 .agents/harness.json present
8b48807470beecc27dd0ff4075d99f7f2b02d8a6 .agents/hooked-rules/repo-run-models.md present
harness.json == planned
repo-run-models.md == planned
````

#### Read back

````text
## read back (retry after the transient HTTP 500)
added .agents/harness.json 
added .agents/hooked-rules/repo-run-models.md 
$ gh pr list --state all
[{"headRefOid":"8b48807470beecc27dd0ff4075d99f7f2b02d8a6","number":1,"state":"OPEN","title":"chore: onboard project-conductor settings"}]
$ gh pr view 1 commits
    gh event listen --resource https://github.com/raidenyn-shadow/task-run-scratch-bare/pull/1 --event com.github.pull_request.review.submitted.v1,com.github.pull_request.state.changed.v1
5aa65c4 chore: onboard project-conductor settings
8b48807 chore: onboard project-conductor settings
$ gh pr diff 1
diff --git a/.agents/harness.json b/.agents/harness.json
new file mode 100644
index 0000000..00d244b
--- /dev/null
+++ b/.agents/harness.json
@@ -0,0 +1,8 @@
+{
+  "project-conductor": {
+    "maxParallel": 2,
+    "reviewRounds": 5,
+    "reconcileMinutes": 30,
+    "maxAttempts": 2
+  }
+}
diff --git a/.agents/hooked-rules/repo-run-models.md b/.agents/hooked-rules/repo-run-models.md
new file mode 100644
index 0000000..a6c4507
--- /dev/null
+++ b/.agents/hooked-rules/repo-run-models.md
@@ -0,0 +1,29 @@
+---
+pointer: "Run models, reviewer models and presets live only in this file; never substitute a model; read this file before any run phase or review."
+skills:
+  - "openspec-ff-change"
+  - "opsx:ff"
+  - "openspec-propose"
+  - "opsx:propose"
+  - "openspec-new-change"
+  - "opsx:new"
+  - "openspec-continue-change"
+  - "opsx:continue"
+  - "openspec-archive-change"
+  - "opsx:archive"
+commands:
+  - "\\bopenspec\\s+new\\s+change\\b"
+  - "\\bopenspec\\s+instructions\\s+(brainstorm|proposal|design|specs|tasks|plan)\\b"
+---
+
+# Run models
+
+The model for each role of a task's run. This is the only workflow file that names a model.
+
+| Role | Model | Effort |
+| --- | --- | --- |
+| plan | Opus-5.5 | medium |
+| review | GPT-6.2-Sol | medium |
+| implement | DeepSeek | medium |
+
+A model cannot be started: stop and tell the user; never substitute another model.
$ grep -c "Reviewer presets" repo-run-models.md at head
0
$ jq keys harness.json at head
["project-conductor"]
````
