# Run 2: first run on task-run-scratch

Brief step 2. Procedure run without the wait ("proceed without asking", pre-agreed on the scratch ground). Models: plan Opus-5.5, review GPT-6.2-Sol, implement DeepSeek (given), effort medium.

Defect found and fixed: the settings commit failed with "Author identity unknown" (no git identity on the machine). Fixed in the reference (`fix: set a git identity in the onboarding clone when none is configured`) and the write was rerun from a clean branch; nothing had been pushed before the fix.

| Expected | Actual |
|---|---|
| `PROJECT_URL` created | created, read back = board URL |
| three fields reused | reused, no write (field read below) |
| settings PR with exactly three effects after normalizing a rename | PR #6: `modified .agents/harness.json`, `renamed repo-run-models.md ← repo-review-models.md` (= added + removed) |
| both keys in `harness.json` | `agent-harness-verify-gate` {"x":1} and `project-conductor` |
| `repo-review-models.md` deleted, presets `sol`, `opus`, `both` in `repo-run-models.md` | 404 on the PR head; presets at lines 44–46 |
| B and C get `/8` and `/9` in issue-number order | #4 → `/8`, #5 → `/9` |
| rest of each body equals the original (`cmp`) | identical (B and C, C with its CRLF and no final newline) |
| A, P, Z bodies equal originals (`cmp`) | identical |
| draft item not mentioned | not in the plan or the report (dropped by the items filter) |
| approval "no" with the owner step | no, owner step with the rules page |
| webhook pending | listed |

#### Plan

````markdown
## Plan: raidenyn-shadow/task-run-scratch, board https://github.com/users/raidenyn-shadow/projects/5

Agent: raidenyn-shadow (admin, push). Owner: raidenyn-shadow. Default branch: main.
Mode: proceed without asking (pre-agreed scratch run). Models: plan Opus-5.5, review GPT-6.2-Sol, implement DeepSeek (given), effort medium.

| Step | Item | Plan | Reason |
|---|---|---|---|
| 2 | `PROJECT_URL` | create | absent; agent is admin |
| 3 | Run phase (SINGLE_SELECT, plan/implement/closeout/care) | reuse | exact name and type, all four options |
| 3 | Attempt (NUMBER) | reuse | exact name and type |
| 3 | Run thread (TEXT) | reuse | exact name and type |
| 4 | `.agents/harness.json` | change (modified) | add key `project-conductor`; `agent-harness-verify-gate` kept |
| 4 | `.agents/hooked-rules/repo-run-models.md` | create (added) | replaces the roster; triggers and presets copied unchanged |
| 4 | `.agents/hooked-rules/repo-review-models.md` | removed | replaced; no other file refers to it (`git grep` empty) |
| 4 | branch `chore/project-conductor-onboarding` + PR | create | no branch, no PR |
| 5 | #1 `scratch-rfc/m1-scratch/1` | identified | |
| 5 | #2 plan `scratch-rfc/m1-scratch` | identified | |
| 5 | #4 | create key `<!-- task: scratch-rfc/m1-scratch/8 -->` | keyless, trusted, milestone 1 marked; highest under prefix is 7 (#3, closed) |
| 5 | #5 | create key `<!-- task: scratch-rfc/m1-scratch/9 -->` | keyless, trusted, milestone 1 marked |
| 6 | Approval rule | no | rulesets 0, classic "Branch not protected" with admin |
| 7 | Webhook | pending | |

Diffs: plan-harness.diff, plan-models.diff (full content of the new file).
````

#### Planned harness.json diff

````diff
--- main/harness.json	2026-11-25 13:08:31.829432332 +0000
+++ planned/harness.json	2026-11-25 13:08:43.134452873 +0000
@@ -1 +1,11 @@
-{"agent-harness-verify-gate": {"x": 1}}
+{
+  "agent-harness-verify-gate": {
+    "x": 1
+  },
+  "project-conductor": {
+    "maxParallel": 2,
+    "reviewRounds": 5,
+    "reconcileMinutes": 30,
+    "maxAttempts": 2
+  }
+}
````

#### Report

````markdown
## Onboarding: raidenyn-shadow/task-run-scratch, board https://github.com/users/raidenyn-shadow/projects/5

Mode: written without asking

### Created
- `PROJECT_URL` = https://github.com/users/raidenyn-shadow/projects/5
- `.agents/hooked-rules/repo-run-models.md` (plan Opus-5.5, review GPT-6.2-Sol, implement DeepSeek, effort medium; reviewer presets moved unchanged), on branch `chore/project-conductor-onboarding`
- Removal of `.agents/hooked-rules/repo-review-models.md`, in the same commit
- Branch `chore/project-conductor-onboarding` (74530ed)
- Pull request https://github.com/raidenyn-shadow/task-run-scratch/pull/6
- Key `<!-- task: scratch-rfc/m1-scratch/8 -->` on #4
- Key `<!-- task: scratch-rfc/m1-scratch/9 -->` on #5

### Changed
- `.agents/harness.json`: key `project-conductor` added → `{"maxParallel": 2, "reviewRounds": 5, "reconcileMinutes": 30, "maxAttempts": 2}`; `agent-harness-verify-gate` unchanged (in PR #6)

### Reused
- Field "Run phase" (SINGLE_SELECT, options plan, implement, closeout, care; none added)
- Field "Attempt" (NUMBER)
- Field "Run thread" (TEXT)

### Pending
- Webhook: pending. Created by the task "Repair claims, settle merged work and wake on events".
- Merge https://github.com/raidenyn-shadow/task-run-scratch/pull/6

### Could not do (owner step)
- Approval rule: `main` requires no approving review. Require a pull request with at least 1 approving review on `main`: add a branch ruleset at https://github.com/raidenyn-shadow/task-run-scratch/settings/rules

Approval rule: no
Keys: 2 identified, 2 keyed in this run, 0 without a key (listed above with the reason)
````

#### Preflight and variable survey

````text
## Preflight
github.com
  ✓ Logged in to github.com account raidenyn-shadow (<gh config>)
  - Active account: true
  - Git operations protocol: ssh
  - Token scopes: 'admin:public_key', 'gist', 'project', 'read:org', 'repo'
raidenyn-shadow
raidenyn-shadow/task-run-scratch
raidenyn-shadow
main
true
true
PVT_kwHOD4ARxs4BtKTK https://github.com/users/raidenyn-shadow/projects/5 task-run scratch
## Variable
exit=0
````

#### Keys survey

````text
## items
1	identified	<!-- task: scratch-rfc/m1-scratch/1 -->
2	identified	<!-- plan: scratch-rfc/m1-scratch -->
4	keyless	Task B without a key.
5	keyless	Task C with CRLF line endings.
## keys
3	closed	scratch-rfc/m1-scratch/7
1	open	scratch-rfc/m1-scratch/1
duplicates:
## slugs
["scratch-rfc"]
1	scratch-rfc/m1-scratch
````

#### Trust

````text
#4 trusted
#4 milestone: 1
#5 trusted
#5 milestone: 1
````

#### Approval rule reads

````text
rulesets: 0
exit=0
read: 0
````

#### Variable write

````text
re-read: []
set exit=0
read back: https://github.com/users/raidenyn-shadow/projects/5
````

#### Branch write (after the fix)

````text
{"message":"Not Found","documentation_url":"https://docs.github.com/rest/git/refs#get-a-reference","status":"404"}gh: Not Found (HTTP 404)
commit exit=0
remote: 
remote: Create a pull request for 'chore/project-conductor-onboarding' on GitHub by visiting:        
remote:      https://github.com/raidenyn-shadow/task-run-scratch/pull/new/chore/project-conductor-onboarding        
remote: 
To github.com:raidenyn-shadow/task-run-scratch.git
 * [new branch]      HEAD -> chore/project-conductor-onboarding
push exit=0
````

#### PR files read back (compare)

````text
modified .agents/harness.json 
renamed .agents/hooked-rules/repo-run-models.md .agents/hooked-rules/repo-review-models.md
````

#### Key writes

````text
https://github.com/raidenyn-shadow/task-run-scratch/issues/4
#4 keyed scratch-rfc/m1-scratch/8
exit=0
https://github.com/raidenyn-shadow/task-run-scratch/issues/5
#5 keyed scratch-rfc/m1-scratch/9
exit=0
````

#### Edit histories of the keyed issues (read afterwards, read-only)

Read with the trust query of the reference ("Trust"), after the key writes, to prove the acceptance criterion from the edit histories as well as the bodies.

`gh api graphql -f query='<the trust query>' -f owner=raidenyn-shadow -f name=task-run-scratch -F n=4`:

````json
{
  "data": {
    "repository": {
      "issue": {
        "number": 4,
        "state": "OPEN",
        "author": {
          "login": "raidenyn-shadow"
        },
        "milestone": {
          "number": 1
        },
        "projectItems": {
          "nodes": [
            {
              "project": {
                "id": "PVT_kwHOD4ARxs4BtKTK"
              }
            }
          ]
        },
        "userContentEdits": {
          "totalCount": 2,
          "pageInfo": {
            "hasNextPage": false
          },
          "nodes": [
            {
              "id": "UCE_lAHOV7nCMc8AAAABibLmas8AAAABOIkoiQ",
              "updatedAt": "2026-11-25T13:11:09Z",
              "deletedAt": null,
              "editor": {
                "login": "raidenyn-shadow"
              }
            },
            {
              "id": "UCE_lAHOV7nCMc8AAAABibLmas8AAAABOIkogg",
              "updatedAt": "2026-11-25T13:11:09Z",
              "deletedAt": null,
              "editor": {
                "login": "raidenyn-shadow"
              }
            }
          ]
        }
      }
    }
  }
}
````

`gh api graphql -f query='<the trust query>' -f owner=raidenyn-shadow -f name=task-run-scratch -F n=5`:

````json
{
  "data": {
    "repository": {
      "issue": {
        "number": 5,
        "state": "OPEN",
        "author": {
          "login": "raidenyn-shadow"
        },
        "milestone": {
          "number": 1
        },
        "projectItems": {
          "nodes": [
            {
              "project": {
                "id": "PVT_kwHOD4ARxs4BtKTK"
              }
            }
          ]
        },
        "userContentEdits": {
          "totalCount": 2,
          "pageInfo": {
            "hasNextPage": false
          },
          "nodes": [
            {
              "id": "UCE_lAHOV7nCMc8AAAABibLoAs8AAAABOIkuTw",
              "updatedAt": "2026-11-25T13:11:14Z",
              "deletedAt": null,
              "editor": {
                "login": "raidenyn-shadow"
              }
            },
            {
              "id": "UCE_lAHOV7nCMc8AAAABibLoAs8AAAABOIkuTA",
              "updatedAt": "2026-11-25T13:11:14Z",
              "deletedAt": null,
              "editor": {
                "login": "raidenyn-shadow"
              }
            }
          ]
        }
      }
    }
  }
}
````

Edits made by: only `raidenyn-shadow` (the agent's `gh` login and the repository owner) on both #4 and #5; no other editor, no deleted edit, no further page.

#### Checks: cmp of bodies, gh pr diff, files on the PR head

````text
$ head -n1 after.4.body after.5.body
<!-- task: scratch-rfc/m1-scratch/8 -->
0000000   <   !   -   -       t   a   s   k   :       s   c   r   a   t
0000020   c   h   -   r   f   c   /   m   1   -   s   c   r   a   t   c
0000040   h   /   9       -   -   >  \n
$ cmp <(tail -n +2 after.4.body) orig/4.body
identical
$ cmp <(tail -n +2 after.5.body) orig/5.body
identical
$ cmp after.1.body orig/1.body
identical
$ cmp after.2.body orig/2.body
identical
$ cmp after.3.body orig/3.body
identical
$ gh pr diff 6 --repo raidenyn-shadow/task-run-scratch
diff --git a/.agents/harness.json b/.agents/harness.json
index 56f7fb5..eeb529a 100644
--- a/.agents/harness.json
+++ b/.agents/harness.json
@@ -1 +1,11 @@
-{"agent-harness-verify-gate": {"x": 1}}
+{
+  "agent-harness-verify-gate": {
+    "x": 1
+  },
+  "project-conductor": {
+    "maxParallel": 2,
+    "reviewRounds": 5,
+    "reconcileMinutes": 30,
+    "maxAttempts": 2
+  }
+}
diff --git a/.agents/hooked-rules/repo-review-models.md b/.agents/hooked-rules/repo-run-models.md
similarity index 71%
rename from .agents/hooked-rules/repo-review-models.md
rename to .agents/hooked-rules/repo-run-models.md
index dfa7f21..2201153 100644
--- a/.agents/hooked-rules/repo-review-models.md
+++ b/.agents/hooked-rules/repo-run-models.md
@@ -1,5 +1,5 @@
 ---
-pointer: "Reviewer models and presets live only in this file; never substitute a model; delivered with the review gate; read this file before any review."
+pointer: "Run models, reviewer models and presets live only in this file; never substitute a model; read this file before any run phase or review."
 skills:
   - "openspec-ff-change"
   - "opsx:ff"
@@ -16,7 +16,19 @@ commands:
   - "\\bopenspec\\s+instructions\\s+(brainstorm|proposal|design|specs|tasks|plan)\\b"
 ---
 
-# Reviewer roster
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
+
+## Reviewer presets
 
 The reviewers the superspec review gate can use and the presets over them. This is the only workflow
 file that names a model: the other rules, the schemas, the config, the specs and the procedure refer to

$ gh pr diff 6 --name-only
.agents/harness.json
.agents/hooked-rules/repo-run-models.md
$ jq keys of harness.json on PR head
{"agent-harness-verify-gate":{"x":1},"project-conductor":{"maxParallel":2,"reviewRounds":5,"reconcileMinutes":30,"maxAttempts":2}}
$ presets in repo-run-models.md on PR head
44:- `sol` = [Sol]
45:- `opus` = [Opus]
46:- `both` = [Sol, Opus] (first, then second)
$ repo-review-models.md on PR head
{"message":"Not Found","documentation_url":"https://docs.github.com/rest/repos/contents#get-repository-content","status":"404"}gh: Not Found (HTTP 404)
````

#### gh project field-list 5 --owner raidenyn-shadow --format json

````json
{"fields":[{"id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQA","name":"Title","type":"ProjectV2Field"},{"id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQE","name":"Assignees","type":"ProjectV2Field"},{"id":"PVTSSF_lAHOD4ARxs4BtKTKzhrVEQI","name":"Status","options":[{"id":"f75ad846","name":"Todo"},{"id":"47fc9ee4","name":"In Progress"},{"id":"98236657","name":"Done"}],"type":"ProjectV2SingleSelectField"},{"id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQM","name":"Labels","type":"ProjectV2Field"},{"id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQQ","name":"Linked pull requests","type":"ProjectV2Field"},{"id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQU","name":"Milestone","type":"ProjectV2Field"},{"id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQc","name":"Repository","type":"ProjectV2Field"},{"id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQk","name":"Reviewers","type":"ProjectV2Field"},{"id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQs","name":"Parent issue","type":"ProjectV2Field"},{"id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQw","name":"Sub-issues progress","type":"ProjectV2Field"},{"id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQ0","name":"Created","type":"ProjectV2Field"},{"id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQ4","name":"Updated","type":"ProjectV2Field"},{"id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQ8","name":"Closed","type":"ProjectV2Field"},{"id":"PVTSSF_lAHOD4ARxs4BtKTKzhrVES8","name":"Run phase","options":[{"id":"be77257a","name":"plan"},{"id":"7b5e29c9","name":"implement"},{"id":"cde67355","name":"closeout"},{"id":"90709d7a","name":"care"}],"type":"ProjectV2SingleSelectField"},{"id":"PVTF_lAHOD4ARxs4BtKTKzhrVET8","name":"Attempt","type":"ProjectV2Field"},{"id":"PVTF_lAHOD4ARxs4BtKTKzhrVEUE","name":"Run thread","type":"ProjectV2Field"}],"totalCount":16}
````

#### GraphQL field read (fields.json)

````json
{"dataType":"TITLE","id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQA","name":"Title"}
{"dataType":"ASSIGNEES","id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQE","name":"Assignees"}
{"dataType":"SINGLE_SELECT","id":"PVTSSF_lAHOD4ARxs4BtKTKzhrVEQI","name":"Status","options":[{"color":"GREEN","description":"This item hasn't been started","id":"f75ad846","name":"Todo"},{"color":"YELLOW","description":"This is actively being worked on","id":"47fc9ee4","name":"In Progress"},{"color":"PURPLE","description":"This has been completed","id":"98236657","name":"Done"}]}
{"dataType":"LABELS","id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQM","name":"Labels"}
{"dataType":"LINKED_PULL_REQUESTS","id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQQ","name":"Linked pull requests"}
{"dataType":"MILESTONE","id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQU","name":"Milestone"}
{"dataType":"REPOSITORY","id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQc","name":"Repository"}
{"dataType":"REVIEWERS","id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQk","name":"Reviewers"}
{"dataType":"PARENT_ISSUE","id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQs","name":"Parent issue"}
{"dataType":"SUB_ISSUES_PROGRESS","id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQw","name":"Sub-issues progress"}
{"dataType":"CREATED","id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQ0","name":"Created"}
{"dataType":"UPDATED","id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQ4","name":"Updated"}
{"dataType":"CLOSED","id":"PVTF_lAHOD4ARxs4BtKTKzhrVEQ8","name":"Closed"}
{"dataType":"SINGLE_SELECT","id":"PVTSSF_lAHOD4ARxs4BtKTKzhrVES8","name":"Run phase","options":[{"color":"GRAY","description":"","id":"be77257a","name":"plan"},{"color":"GRAY","description":"","id":"7b5e29c9","name":"implement"},{"color":"GRAY","description":"","id":"cde67355","name":"closeout"},{"color":"GRAY","description":"","id":"90709d7a","name":"care"}]}
{"dataType":"NUMBER","id":"PVTF_lAHOD4ARxs4BtKTKzhrVET8","name":"Attempt"}
{"dataType":"TEXT","id":"PVTF_lAHOD4ARxs4BtKTKzhrVEUE","name":"Run thread"}
````
