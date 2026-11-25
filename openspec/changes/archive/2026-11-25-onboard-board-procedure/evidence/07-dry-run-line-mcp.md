# Run 7: dry run on raidenyn/line-mcp

Brief step 7. Board `https://github.com/users/raidenyn/projects/4`. Agent `raidenyn-shadow`: push, not admin. Dry-run form: only reads, plus a local clone in the scratchpad.

| Expected | Actual |
|---|---|
| all snapshots identical (`diff` prints nothing) | `diff -r before after` printed nothing |
| the plan marks plan issues #127–130 as identified | identified |
| the report holds `gh variable set PROJECT_URL --repo raidenyn/line-mcp --body "https://github.com/users/raidenyn/projects/4"` | present under "Could not do (owner step)" |

The implement model id was not given for line-mcp and no `repo-run-models.md` exists there, so the model file is "cannot do" in this plan (the "DeepSeek" id was confirmed only for the scratch runs).

Snapshots (before and after): `gh variable list --repo raidenyn/line-mcp --json name,value`, the GraphQL field read, every board item with its Status and issue body (paged), the default branch SHA, `matching-refs/heads/chore/project-conductor-onboarding`, and `gh pr list --head chore/project-conductor-onboarding --state all --json number,state`. The item bodies are kept out of this file; their hashes are below, along with the other snapshots.

#### Plan

````markdown
## Plan: raidenyn/line-mcp, board https://github.com/users/raidenyn/projects/4 (dry run)

Agent: raidenyn-shadow (push, not admin). Owner: raidenyn. Default branch: main.
Models: plan Opus-5.5, review GPT-6.2-Sol (defaults), implement: not given for this repository and no `repo-run-models.md` exists, so not confirmed. Effort medium.

| Step | Item | Plan | Reason |
|---|---|---|---|
| 2 | `PROJECT_URL` | cannot do: owner step | absent; agent is not admin |
| 3 | Run phase (SINGLE_SELECT) | create | no field of that name in any case |
| 3 | Attempt (NUMBER) | create | no field of that name in any case |
| 3 | Run thread (TEXT) | create | no field of that name in any case |
| 4 | `.agents/harness.json` | create (added), only key `project-conductor` | absent on `main` |
| 4 | `.agents/hooked-rules/repo-run-models.md` | cannot do | implement model id not confirmed |
| 4 | branch `chore/project-conductor-onboarding` + PR | create | no branch, no PR |
| 5 | plan issues #127, #128, #129, #130 | identified | plan markers `expense-ledger/m1-ledger`, `m2-classification`, `m3-analytics`, `m4-agent-skills` |
| 5 | task issues #132–#160 (29) | identified | task keys; no duplicates (30 keys in the repo incl. closed #131) |
| 6 | Approval rule | yes | the `pull_request` rule of ruleset 18411140 has `required_approving_review_count` 1 (see the approval reads below; classic protection not readable without admin) |
| 7 | Webhook | pending | |

Planned `.agents/harness.json` (new file):
{
  "project-conductor": {
    "maxParallel": 2,
    "reviewRounds": 5,
    "reconcileMinutes": 30,
    "maxAttempts": 2
  }
}
````

#### Report

````markdown
## Onboarding: raidenyn/line-mcp, board https://github.com/users/raidenyn/projects/4

Mode: dry run

### Created
- none

### Changed
- none

### Reused
- none

### Pending
- Webhook: pending. Created by the task "Repair claims, settle merged work and wake on events".
- Would create field "Run phase" (SINGLE_SELECT, options plan, implement, closeout, care): `gh project field-create 4 --owner raidenyn --name "Run phase" --data-type SINGLE_SELECT --single-select-options "plan,implement,closeout,care"`
- Would create field "Attempt" (NUMBER): `gh project field-create 4 --owner raidenyn --name "Attempt" --data-type NUMBER`
- Would create field "Run thread" (TEXT): `gh project field-create 4 --owner raidenyn --name "Run thread" --data-type TEXT`
- Would create `.agents/harness.json` holding only the key `project-conductor` = `{"maxParallel": 2, "reviewRounds": 5, "reconcileMinutes": 30, "maxAttempts": 2}`
- Would create branch `chore/project-conductor-onboarding` with one commit `chore: onboard project-conductor settings`, and its pull request to `main`

### Could not do (owner step)
- `PROJECT_URL`: the agent account raidenyn-shadow is not an admin of raidenyn/line-mcp. The owner runs:
  `gh variable set PROJECT_URL --repo raidenyn/line-mcp --body "https://github.com/users/raidenyn/projects/4"`
- `.agents/hooked-rules/repo-run-models.md`: the implement model id is not confirmed (not given, no existing `repo-run-models.md`). Give the exact implement model id, then run the onboarding again; the harness key goes ahead without it.

Approval rule: yes
Keys: 33 identified, 0 keyed in this run, 0 without a key (listed above with the reason)

Nothing changed.
````

#### Survey: preflight, variable, fields, settings

````text
## Preflight
  - Token scopes: 'admin:public_key', 'gist', 'project', 'read:org', 'repo'
raidenyn-shadow
raidenyn/line-mcp
raidenyn
main
false
true
PVT_kwHOAETbkc4BtBEy https://github.com/users/raidenyn/projects/4 Bank MCP
## Variable
PROJECT_URL: [] exit=0
## Fields
case:
{"name":"Title","dataType":"TITLE"} {"name":"Assignees","dataType":"ASSIGNEES"} {"name":"Status","dataType":"SINGLE_SELECT"} {"name":"Labels","dataType":"LABELS"} {"name":"Linked pull requests","dataType":"LINKED_PULL_REQUESTS"} {"name":"Milestone","dataType":"MILESTONE"} {"name":"Repository","dataType":"REPOSITORY"} {"name":"Reviewers","dataType":"REVIEWERS"} {"name":"Parent issue","dataType":"PARENT_ISSUE"} {"name":"Sub-issues progress","dataType":"SUB_ISSUES_PROGRESS"} {"name":"Created","dataType":"CREATED"} {"name":"Updated","dataType":"UPDATED"} {"name":"Closed","dataType":"CLOSED"} {"name":"Priority","dataType":"SINGLE_SELECT"} {"name":"Size","dataType":"SINGLE_SELECT"} {"name":"Estimate","dataType":"NUMBER"} {"name":"Iteration","dataType":"ITERATION"} {"name":"Start date","dataType":"DATE"} {"name":"Target date","dataType":"DATE"} {"name":"Phase","dataType":"SINGLE_SELECT"} {"name":"Area","dataType":"SINGLE_SELECT"} 
## Settings
main .agents/harness.json absent
main .agents/hooked-rules/repo-run-models.md absent
main .agents/hooked-rules/repo-review-models.md absent
branch: {"message":"Not Found","documentation_url":"https://docs.github.com/rest/git/refs#get-a-reference","status":"404"}gh: Not Found (HTTP 404)

open PRs: []
````

#### Survey: roster references, keys, approval

````text
old roster refs: grep exit=1
## Keys
## items
127	identified	<!-- plan: expense-ledger/m1-ledger -->
128	identified	<!-- plan: expense-ledger/m2-classification -->
129	identified	<!-- plan: expense-ledger/m3-analytics -->
130	identified	<!-- plan: expense-ledger/m4-agent-skills -->
132	identified	<!-- task: expense-ledger/m1-ledger/2 -->
133	identified	<!-- task: expense-ledger/m1-ledger/3 -->
134	identified	<!-- task: expense-ledger/m1-ledger/4 -->
135	identified	<!-- task: expense-ledger/m1-ledger/5 -->
136	identified	<!-- task: expense-ledger/m1-ledger/6 -->
137	identified	<!-- task: expense-ledger/m1-ledger/7 -->
138	identified	<!-- task: expense-ledger/m1-ledger/8 -->
139	identified	<!-- task: expense-ledger/m1-ledger/9 -->
140	identified	<!-- task: expense-ledger/m1-ledger/10 -->
141	identified	<!-- task: expense-ledger/m1-ledger/11 -->
142	identified	<!-- task: expense-ledger/m1-ledger/12 -->
143	identified	<!-- task: expense-ledger/m1-ledger/14 -->
144	identified	<!-- task: expense-ledger/m1-ledger/13 -->
145	identified	<!-- task: expense-ledger/m2-classification/9 -->
146	identified	<!-- task: expense-ledger/m2-classification/1 -->
147	identified	<!-- task: expense-ledger/m2-classification/2 -->
148	identified	<!-- task: expense-ledger/m2-classification/3 -->
149	identified	<!-- task: expense-ledger/m2-classification/4 -->
150	identified	<!-- task: expense-ledger/m2-classification/5 -->
151	identified	<!-- task: expense-ledger/m2-classification/6 -->
152	identified	<!-- task: expense-ledger/m2-classification/7 -->
153	identified	<!-- task: expense-ledger/m2-classification/8 -->
154	identified	<!-- task: expense-ledger/m3-analytics/2 -->
155	identified	<!-- task: expense-ledger/m3-analytics/1 -->
156	identified	<!-- task: expense-ledger/m4-agent-skills/5 -->
157	identified	<!-- task: expense-ledger/m4-agent-skills/1 -->
158	identified	<!-- task: expense-ledger/m4-agent-skills/2 -->
159	identified	<!-- task: expense-ledger/m4-agent-skills/3 -->
160	identified	<!-- task: expense-ledger/m4-agent-skills/4 -->
## keys
160	open	expense-ledger/m4-agent-skills/4
159	open	expense-ledger/m4-agent-skills/3
158	open	expense-ledger/m4-agent-skills/2
157	open	expense-ledger/m4-agent-skills/1
156	open	expense-ledger/m4-agent-skills/5
155	open	expense-ledger/m3-analytics/1
154	open	expense-ledger/m3-analytics/2
153	open	expense-ledger/m2-classification/8
152	open	expense-ledger/m2-classification/7
151	open	expense-ledger/m2-classification/6
150	open	expense-ledger/m2-classification/5
149	open	expense-ledger/m2-classification/4
148	open	expense-ledger/m2-classification/3
147	open	expense-ledger/m2-classification/2
146	open	expense-ledger/m2-classification/1
145	open	expense-ledger/m2-classification/9
144	open	expense-ledger/m1-ledger/13
143	open	expense-ledger/m1-ledger/14
142	open	expense-ledger/m1-ledger/12
141	open	expense-ledger/m1-ledger/11
140	open	expense-ledger/m1-ledger/10
139	open	expense-ledger/m1-ledger/9
138	open	expense-ledger/m1-ledger/8
137	open	expense-ledger/m1-ledger/7
136	open	expense-ledger/m1-ledger/6
135	open	expense-ledger/m1-ledger/5
134	open	expense-ledger/m1-ledger/4
133	open	expense-ledger/m1-ledger/3
132	open	expense-ledger/m1-ledger/2
131	closed	expense-ledger/m1-ledger/1
duplicates:
## slugs
["expense-ledger"]
1	expense-ledger/m1-ledger
2	expense-ledger/m2-classification
3	expense-ledger/m3-analytics
4	expense-ledger/m4-agent-skills
## Approval
rulesets: 1
$ gh api repos/raidenyn/line-mcp/rules/branches/main --jq '.[] | select(.type == "pull_request") | {type, ruleset_id, ruleset_source, parameters: {required_approving_review_count: .parameters.required_approving_review_count}}'
{"parameters":{"required_approving_review_count":1},"ruleset_id":18411140,"ruleset_source":"raidenyn/line-mcp","type":"pull_request"}
exit=0
not read: {"message":"Not Found","documentation_url":"https://docs.github.com/rest/branches/branch-protection#get-branch-protection","status":"404"}gh: Not Found (HTTP 404)
````

#### Snapshot diff

```text
$ diff -r before after
(exit 0)
```

#### Snapshot hashes (before = after)

```text
a5026131b3a04a9c79124059fc34e4b67d81041ca6e6772ef95b8143775d3d35  before/default-sha.txt
6403203dd5a0867eb14d104ee8a73730bd72dd9ad92e78d996a6dba0a5dcfc01  before/default.txt
0887ef4d821a6cfc6042d1b71e687b7245df8842cf7903b79d215fa324557841  before/fields.json
fd1e65fccecce9b7bf0d7d7f4a46d5959b1caefa1ef9c02e993fdcd52a6f9a05  before/items.jsonl
4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945  before/matching-refs.json
37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570  before/prs.json
37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570  before/variables.json
a5026131b3a04a9c79124059fc34e4b67d81041ca6e6772ef95b8143775d3d35  after/default-sha.txt
6403203dd5a0867eb14d104ee8a73730bd72dd9ad92e78d996a6dba0a5dcfc01  after/default.txt
0887ef4d821a6cfc6042d1b71e687b7245df8842cf7903b79d215fa324557841  after/fields.json
fd1e65fccecce9b7bf0d7d7f4a46d5959b1caefa1ef9c02e993fdcd52a6f9a05  after/items.jsonl
4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945  after/matching-refs.json
37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570  after/prs.json
37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570  after/variables.json
```

#### Snapshot contents (before)

```text
variables.json: []
default: main 1ea26d99f9d47c511bc15648a436a95bd5cb34b9
matching-refs.json: []
prs.json: []
fields:
{"name":"Title","dataType":"TITLE","options":[]}
{"name":"Assignees","dataType":"ASSIGNEES","options":[]}
{"name":"Status","dataType":"SINGLE_SELECT","options":["Backlog","Ready","In progress","In review","Done"]}
{"name":"Labels","dataType":"LABELS","options":[]}
{"name":"Linked pull requests","dataType":"LINKED_PULL_REQUESTS","options":[]}
{"name":"Milestone","dataType":"MILESTONE","options":[]}
{"name":"Repository","dataType":"REPOSITORY","options":[]}
{"name":"Reviewers","dataType":"REVIEWERS","options":[]}
{"name":"Parent issue","dataType":"PARENT_ISSUE","options":[]}
{"name":"Sub-issues progress","dataType":"SUB_ISSUES_PROGRESS","options":[]}
{"name":"Created","dataType":"CREATED","options":[]}
{"name":"Updated","dataType":"UPDATED","options":[]}
{"name":"Closed","dataType":"CLOSED","options":[]}
{"name":"Priority","dataType":"SINGLE_SELECT","options":["P0","P1","P2"]}
{"name":"Size","dataType":"SINGLE_SELECT","options":["XS","S","M","L","XL"]}
{"name":"Estimate","dataType":"NUMBER","options":[]}
{"name":"Iteration","dataType":"ITERATION","options":[]}
{"name":"Start date","dataType":"DATE","options":[]}
{"name":"Target date","dataType":"DATE","options":[]}
{"name":"Phase","dataType":"SINGLE_SELECT","options":["Spike","Refactor","Foundation","Feature","Migration","Hardening","Outline","Planning"]}
{"name":"Area","dataType":"SINGLE_SELECT","options":["Ledger","Source port","LINE read","Ingest record and freshness","Changed facts","Template writes","Currency conversion","Internal transfers, reversals","Analytics","Classification","Owner marks","Daily report","Tags, sub-accounts","Old tools","Tool results","Agent skills"]}
items (type, number, state, Status, first line, body sha256):
ISSUE	#127	OPEN	Backlog	<!-- plan: expense-ledger/m1-ledger -->	8b9cf9f16220
ISSUE	#128	OPEN	Backlog	<!-- plan: expense-ledger/m2-classification -->	e7cece4d088e
ISSUE	#129	OPEN	Backlog	<!-- plan: expense-ledger/m3-analytics -->	1d5c175c6b86
ISSUE	#130	OPEN	Backlog	<!-- plan: expense-ledger/m4-agent-skills -->	ca8cec15dbf2
ISSUE	#131	CLOSED	Done	<!-- task: expense-ledger/m1-ledger/1 -->	46c93362426a
ISSUE	#132	OPEN	Ready	<!-- task: expense-ledger/m1-ledger/2 -->	d5795963949e
ISSUE	#133	OPEN	Backlog	<!-- task: expense-ledger/m1-ledger/3 -->	838a39cac4ab
ISSUE	#134	OPEN	Backlog	<!-- task: expense-ledger/m1-ledger/4 -->	efaf25f59676
ISSUE	#135	OPEN	Backlog	<!-- task: expense-ledger/m1-ledger/5 -->	a1c71b8e5f34
ISSUE	#136	OPEN	Backlog	<!-- task: expense-ledger/m1-ledger/6 -->	c985b5e9b89b
ISSUE	#137	OPEN	Backlog	<!-- task: expense-ledger/m1-ledger/7 -->	0152c3c9af23
ISSUE	#138	OPEN	Backlog	<!-- task: expense-ledger/m1-ledger/8 -->	19e9d4ecbc8c
ISSUE	#139	OPEN	Backlog	<!-- task: expense-ledger/m1-ledger/9 -->	9a9a9d177059
ISSUE	#140	OPEN	Backlog	<!-- task: expense-ledger/m1-ledger/10 -->	9c98d396aef7
ISSUE	#141	OPEN	Backlog	<!-- task: expense-ledger/m1-ledger/11 -->	2855e8e2a843
ISSUE	#142	OPEN	Backlog	<!-- task: expense-ledger/m1-ledger/12 -->	8f06b24a8846
ISSUE	#143	OPEN	Backlog	<!-- task: expense-ledger/m1-ledger/14 -->	e96aa6ba7524
ISSUE	#144	OPEN	Backlog	<!-- task: expense-ledger/m1-ledger/13 -->	1821d8abfa7b
ISSUE	#145	OPEN	Backlog	<!-- task: expense-ledger/m2-classification/9 -->	cd7db7355a1d
ISSUE	#146	OPEN	Backlog	<!-- task: expense-ledger/m2-classification/1 -->	c4011769763c
ISSUE	#147	OPEN	Backlog	<!-- task: expense-ledger/m2-classification/2 -->	48d3128897b8
ISSUE	#148	OPEN	Backlog	<!-- task: expense-ledger/m2-classification/3 -->	eb30c6765a9e
ISSUE	#149	OPEN	Backlog	<!-- task: expense-ledger/m2-classification/4 -->	5ff4e2eea7e4
ISSUE	#150	OPEN	Backlog	<!-- task: expense-ledger/m2-classification/5 -->	9569e538cb0f
ISSUE	#151	OPEN	Backlog	<!-- task: expense-ledger/m2-classification/6 -->	3b5b99a5b08c
ISSUE	#152	OPEN	Backlog	<!-- task: expense-ledger/m2-classification/7 -->	fe8443a9afe4
ISSUE	#153	OPEN	Backlog	<!-- task: expense-ledger/m2-classification/8 -->	2ff52144d5ee
ISSUE	#154	OPEN	Backlog	<!-- task: expense-ledger/m3-analytics/2 -->	74b25d9adcbd
ISSUE	#155	OPEN	Backlog	<!-- task: expense-ledger/m3-analytics/1 -->	bfc4749cbcbc
ISSUE	#156	OPEN	Backlog	<!-- task: expense-ledger/m4-agent-skills/5 -->	59cfb8f7b2de
ISSUE	#157	OPEN	Backlog	<!-- task: expense-ledger/m4-agent-skills/1 -->	686912af2917
ISSUE	#158	OPEN	Backlog	<!-- task: expense-ledger/m4-agent-skills/2 -->	0972acfae878
ISSUE	#159	OPEN	Backlog	<!-- task: expense-ledger/m4-agent-skills/3 -->	435d9c9c859e
ISSUE	#160	OPEN	Backlog	<!-- task: expense-ledger/m4-agent-skills/4 -->	06c75a2d8cc0
PULL_REQUEST	#163	MERGED	Done		e3b0c44298fc
ISSUE	#165	CLOSED	Done	## Bug	b18bbc01d0ec
```
