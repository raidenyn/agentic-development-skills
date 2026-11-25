# Onboard a board: GitHub commands

The commands of the procedure in [SKILL.md](../SKILL.md), one section per step. Everything goes through the `gh` command line tool, `git` and `jq`. The commands below were checked against GitHub with `gh` 2.105. If a flag is missing in your version, check `gh <command> --help` before changing the approach.

Each section gives the read command first, then the condition for writing, then the write command. A dry run runs only the reads.

Placeholders:

| Placeholder | Meaning |
|---|---|
| `<repo>` | The repository as `owner/name`, spelled as `gh api repos/<repo> --jq .full_name` returns it. Board items are compared with this spelling. |
| `<owner>`, `<name>` | The two halves of `<repo>`. `<owner>` is the repository owner's login. |
| `<board owner>`, `<n>` | The board's owner and number, from its URL: `https://github.com/users/<board owner>/projects/<n>` or `.../orgs/<board owner>/projects/<n>`. |
| `<project id>` | The board's node id, from Preflight. |
| `<board URL>` | The board's URL as `gh project view` returns it. |
| `<agent>` | The agent's login, from Preflight. |
| `<default>` | The repository's default branch. |
| `<work>` | A folder of this run in the scratchpad, such as `<scratchpad>/onboard-<name>`. Every saved file and the local clone go here. |

Always pass `--repo <repo>` to `gh issue`, `gh pr` and `gh variable`. Without it, `gh` resolves a bare number against the current checkout, which may be another repository.

## Preflight

Check all of these, and stop the run on the first that fails:

```bash
gh auth status                      # logged in, and the token scopes include "project"
gh auth refresh -s project          # the fix when the scope is missing; the person runs it
gh api user --jq .login             # <agent>
gh api repos/<repo> --jq '.full_name, .owner.login, .default_branch, .permissions.admin, .permissions.push'
gh project view <n> --owner <board owner> --format json --jq '"\(.id) \(.url) \(.title)"'
```

- `.full_name` is `<repo>` from here on, and `.owner.login` is `<owner>`. Take the owner from the repository, never from the token: the token belongs to the agent account.
- Read the board by its explicit number and owner. Do not use `@me`: it names the token's account, not the board's owner.
- `.permissions.push` false: the settings pull request (step 4) and the keys (step 5) are cannot do. Report it as an owner step: give the agent account write access.
- `.permissions.admin` false: the variable (step 2) is an owner step. Without admin, classic branch protection cannot be read (step 6).

## Repository variable

Read:

```bash
gh variable list --repo <repo> --json name,value \
  --jq '.[] | select(.name == "PROJECT_URL") | .value'
```

A writer can read the variables, as checked on `line-mcp`. If the command fails, the value is "unknown, owner checks": put that in the plan and the report.

| Value | Plan |
|---|---|
| equal to `<board URL>` | reuse |
| empty output | create |
| another value | change: show the old value and `<board URL>` |

Write only when `.permissions.admin` is true. Read the variable again first; if it changed since the survey, do not write: report it. Then:

```bash
gh variable set PROJECT_URL --repo <repo> --body "<board URL>"
```

Read it back with the read command above.

When `.permissions.admin` is false, or the write fails, do not retry another way. Print this command for the owner, with the real board URL in place of `<board URL>`, under "Could not do (owner step)":

```bash
gh variable set PROJECT_URL --repo <repo> --body "<board URL>"
```

## Fields

Read every field with its type. Use GraphQL: `gh project field-list` shows no `dataType` for number and text fields, and no option colors.

```bash
gh api graphql -f query='
query($project: ID!) {
  node(id: $project) { ... on ProjectV2 {
    fields(first: 100) { nodes {
      ... on ProjectV2FieldCommon { id name dataType }
      ... on ProjectV2SingleSelectField { options { id name color description } }
    } }
  } }
}' -f project=<project id> --jq '.data.node.fields.nodes[]' > <work>/fields.json
```

| Field | `dataType` | Options |
|---|---|---|
| Run phase | `SINGLE_SELECT` | `plan`, `implement`, `closeout`, `care` |
| Attempt | `NUMBER` | |
| Run thread | `TEXT` | |

Compare names exactly, case included:

```bash
# exact match: reuse, or report a wrong type
jq -c 'select(.name == "Run phase" or .name == "Attempt" or .name == "Run thread") | {id, name, dataType}' <work>/fields.json
# case-only collision: an owner step, nothing is created
jq -c 'select((.name | ascii_downcase) as $l | ["run phase", "attempt", "run thread"] | index($l))
       | select(.name != "Run phase" and .name != "Attempt" and .name != "Run thread") | {id, name}' <work>/fields.json
```

- An exact match of the right type is reused.
- An exact match of another type is reported and left unchanged. Nothing is created beside it.
- A name that differs only in case, such as "Run Phase", is an owner step: "Rename the field `<name>` to `Run phase` on the board, or remove it". Do not reuse it and do not create the field.
- No match in any case: create the field.

Write. Read the fields again first; create only what is still missing.

```bash
gh project field-create <n> --owner <board owner> --name "Run phase" --data-type SINGLE_SELECT \
  --single-select-options "plan,implement,closeout,care"
gh project field-create <n> --owner <board owner> --name "Attempt" --data-type NUMBER
gh project field-create <n> --owner <board owner> --name "Run thread" --data-type TEXT
```

If a create fails, report it with the same command as the owner's step, and go on.

### Missing options of "Run phase"

Compare option names exactly. An option whose name differs from a planned one only in case is an owner step, and no option is added beside it: drop that name from the list of names to add below.

```bash
jq -r 'select(.name == "Run phase") | .options[].name
       | select((ascii_downcase | IN("plan", "implement", "closeout", "care")) and (IN("plan", "implement", "closeout", "care") | not))' \
  <work>/fields.json      # any output: a case-only option collision
```

**An option sent without its `id` is created anew, and every item that had the old option loses its value.** So always send the complete list, with the `id`, `color` and `description` of every option that already exists, options this procedure does not use included. Build the list from the field you read. A planned name is added only when no existing option has it in any case, so a case-only collision such as "Plan" adds nothing beside it:

```bash
jq -c 'select(.name == "Run phase") | .id as $field
       | [.options[] | {id, name, color, description}] as $old
       | ($old | map(.name | ascii_downcase)) as $names
       | {field: $field, options: ($old + [("plan", "implement", "closeout", "care")
           | select(. as $o | $names | index($o) | not)
           | {name: ., color: "GRAY", description: ""}])}' <work>/fields.json > <work>/run-phase.json

jq '{
  query: "mutation($field: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]) { updateProjectV2Field(input: {fieldId: $field, singleSelectOptions: $options}) { projectV2Field { ... on ProjectV2SingleSelectField { options { id name } } } } }",
  variables: .
}' <work>/run-phase.json | gh api graphql --input -
```

Read the field back: every old option keeps its id, and the four names are there.

## Settings pull request

### Read

Read each file from a ref: the default branch, or a commit SHA. The raw media type returns the file's exact bytes. Create the folders of the run first, and `<work>/<sha>` once the SHA is known (below). `mkdir -p` also makes the nested folders of a default branch name with a `/`:

```bash
mkdir -p <work>/<default> <work>/planned <work>/keys
# <path> is .agents/harness.json, .agents/hooked-rules/repo-run-models.md or .agents/hooked-rules/repo-review-models.md
if gh api -H 'Accept: application/vnd.github.raw+json' \
     "repos/<repo>/contents/<path>?ref=<ref>" > <work>/<ref>/<file> 2> <work>/err; then
  echo present
elif grep -q 'HTTP 404' <work>/err; then
  rm <work>/<ref>/<file>; echo absent      # on a 404, gh writes the error body to stdout
else
  cat <work>/err; echo unreadable          # this step stops
fi
```

Read all three from `ref=<default>`, and from the onboarding branch when it exists. Read the branch by its head SHA, never by its name (the name holds a `/`, and the head may move between reads):

```bash
gh api repos/<repo>/git/ref/heads/chore/project-conductor-onboarding --jq .object.sha   # 404: no branch
```

Which SHA to use is decided in "Compare with the branch and its pull request" below; then `mkdir -p <work>/<sha>` and read the three files with `ref=<sha>`.

### The harness key

Check in this order. First whether the file exists: when the read above answered `absent`, skip both checks and create the file as shown below. Only a file that is present is checked for valid JSON:

```bash
test -f <work>/<default>/harness.json                                 # fails: absent, create it (below)
jq -e 'type == "object"' <work>/<default>/harness.json > /dev/null   # fails: not valid JSON, this step stops
jq -e '.["project-conductor"] == {"maxParallel": 2, "reviewRounds": 5, "reconcileMinutes": 30, "maxAttempts": 2}' \
  <work>/<default>/harness.json                                       # true: the key is reused
```

The planned file, keeping the other keys, their order and the file's indentation:

```bash
indent=$(grep -m1 -o '^ \+' <work>/<default>/harness.json | awk '{print length}')   # empty when the file is not indented
jq --indent "${indent:-2}" \
  '.["project-conductor"] = {"maxParallel": 2, "reviewRounds": 5, "reconcileMinutes": 30, "maxAttempts": 2}' \
  <work>/<default>/harness.json > <work>/planned/harness.json
```

If the file is indented with tabs, use `jq --tab` instead of `--indent`. When the file is absent, create it with 2 spaces:

```bash
jq -n --indent 2 '{"project-conductor": {"maxParallel": 2, "reviewRounds": 5, "reconcileMinutes": 30, "maxAttempts": 2}}' \
  > <work>/planned/harness.json
```

`jq` keeps every key and value, but writes nested values in its own layout. Show the diff in the plan.

### References to the old roster

Clone the repository into the scratchpad. A clone is local and allowed in a dry run.

```bash
gh repo clone <repo> <work>/clone -- --quiet
git -C <work>/clone grep -n 'repo-review-models' -- ':!.agents/hooked-rules/repo-review-models.md'
```

Any hit is a reference outside the file. Without the person's agreement in the plan, the roster migration is deferred: `repo-run-models.md` is not proposed, the old file stays, and each hit (`<path>:<line>: <text>`) is reported as an owner step: "Point these references at `.agents/hooked-rules/repo-run-models.md`, then run the onboarding again". With the agreement, edit each reference in the clone to name `repo-run-models.md`, show the diff in the plan, and make it part of the same commit.

### Expected changes

From the approved plan, against `<default>`:

| Path | Status |
|---|---|
| `.agents/harness.json` | `modified` when it exists on `<default>`, `added` when not. Left out when the key is reused |
| `.agents/hooked-rules/repo-run-models.md` | `added`, or `modified` when the person chose to change an existing file. Left out when reused or deferred |
| `.agents/hooked-rules/repo-review-models.md` | `removed`, when it is replaced. Left out when deferred or absent |
| each agreed reference edit | `modified` |

With "proceed without asking", a model file, roster removal or reference edit that this run would leave out only because it needs the person's choice stays in the list when the onboarding branch already holds it (see "Unattended carry-over" in SKILL.md). Build its planned content from the branch: the model ids of the branch's `repo-run-models.md`, and the same path replacement in each referring file. A run that left it out would otherwise call the earlier run's approved work a conflict.

The roster swap is one unit: `repo-run-models.md` `added` and `repo-review-models.md` `removed` are both in the list or both out.

When the list is empty, everything is on the default branch: reuse, no branch and no pull request. If an open onboarding pull request is left over, report it for the owner to close.

### Compare with the branch and its pull request

Before writing to an existing branch or reusing a pull request, list every open pull request from the branch, without a base filter:

```bash
gh pr list --repo <repo> --head chore/project-conductor-onboarding --state open \
  --json number,url,baseRefName,headRefOid,isCrossRepository,headRepository
```

A pull request with a `baseRefName` other than `<default>`, or with `isCrossRepository` true, is a conflict: report it and stop this step.

Take one head SHA: the pull request's `headRefOid`, or the branch's SHA when no pull request is open. Use that SHA for every read below.

```bash
gh api "repos/<repo>/compare/<default>...<sha>" \
  --jq '.files[] | "\(.status) \(.filename) \(.previous_filename // "")"'
```

GitHub may report the roster swap as one `renamed` entry. Read it as `removed <previous_filename>` plus `added <filename>`. Then read every expected path at `ref=<sha>` with the read command above: an added or modified path must be present with exactly the planned bytes (`cmp <work>/planned/<file> <work>/<sha>/<file>`), a removed path must be absent.

| What the branch holds | Then |
|---|---|
| exactly the expected set of (status, path), each with its planned content | reuse as is |
| a strict subset of the expected set, each present file equal to its planned content, holding both halves of the roster swap or neither | partial work of an earlier run: complete it with one commit |
| only one half of the roster swap: `added repo-run-models.md` without `removed repo-review-models.md`, or the other way round | conflict: the spec requires both in one commit. Report it, do not push |
| anything else: another path, another status, other content | conflict: report it, do not push |

Before reusing as is, check that the head has not moved:

```bash
gh pr view <number> --repo <repo> --json headRefOid --jq .headRefOid   # still <sha>
```

When the branch is reused and no pull request is open, open one as below.

### Write

Work in the clone. Never force-push.

A commit needs a git identity. When the machine has none, commit as the agent account, in the clone only:

```bash
git -C <work>/clone config user.email > /dev/null || {
  git -C <work>/clone config user.name "<agent>"
  git -C <work>/clone config user.email "$(gh api user --jq .id)+<agent>@users.noreply.github.com"; }
```

No branch yet:

```bash
git -C <work>/clone switch -q -c chore/project-conductor-onboarding origin/<default>
mkdir -p <work>/clone/.agents/hooked-rules
cp <work>/planned/harness.json <work>/clone/.agents/harness.json
cp <work>/planned/repo-run-models.md <work>/clone/.agents/hooked-rules/repo-run-models.md
git -C <work>/clone rm -q .agents/hooked-rules/repo-review-models.md      # only when it is replaced
git -C <work>/clone add .agents/harness.json .agents/hooked-rules/repo-run-models.md <agreed reference edits>
git -C <work>/clone commit -q -m "chore: onboard project-conductor settings"
git -C <work>/clone push origin HEAD:refs/heads/chore/project-conductor-onboarding
```

Copy and add only the planned files. If the push is rejected, the branch appeared meanwhile: report the conflict.

Completing a partial branch, on the SHA you compared:

```bash
git -C <work>/clone fetch -q origin <sha>
git -C <work>/clone switch -q --detach <sha>
# copy, remove and add only the expected changes the branch does not hold yet
git -C <work>/clone commit -q -m "chore: onboard project-conductor settings"
git -C <work>/clone push origin HEAD:refs/heads/chore/project-conductor-onboarding   # HEAD is the new commit
```

The push is not forced, so it is rejected if the remote head moved after the compare. Then report the conflict and push nothing else.

The pull request, when none is open:

```bash
gh pr create --repo <repo> --base <default> --head chore/project-conductor-onboarding \
  --title "chore: onboard project-conductor settings" --body-file <work>/pr-body.md
```

The body:

```markdown
Settings for the project-conductor loop on <board URL>, written by the onboarding procedure.

- `.agents/harness.json`: key `project-conductor` with maxParallel 2, reviewRounds 5, reconcileMinutes 30, maxAttempts 2. Other keys unchanged.
- `.agents/hooked-rules/repo-run-models.md`: models for plan, review and implement<, with the reviewer presets moved unchanged from `repo-review-models.md`, which this PR removes>.
<- References to the old roster updated: <paths>.>

Nothing reads these settings until the loop exists.
```

Read the pull request's files back with the compare command, at its new head.

## The model file

`.agents/hooked-rules/repo-run-models.md`. Fill in the confirmed models and efforts.

The `skills:` and `commands:` triggers below are veles's (`raidenyn/veles-android`, `.agents/hooked-rules/repo-review-models.md`). When the file replaces a `repo-review-models.md`, copy that file's `skills:` and `commands:` lists instead, unchanged, so the rule still loads where it loaded before. When a `repo-run-models.md` already exists and the old file is gone, take its triggers and its models from it, so a later run builds the same file.

````markdown
---
pointer: "Run models, reviewer models and presets live only in this file; never substitute a model; read this file before any run phase or review."
skills:
  - "openspec-ff-change"
  - "opsx:ff"
  - "openspec-propose"
  - "opsx:propose"
  - "openspec-new-change"
  - "opsx:new"
  - "openspec-continue-change"
  - "opsx:continue"
  - "openspec-archive-change"
  - "opsx:archive"
commands:
  - "\\bopenspec\\s+new\\s+change\\b"
  - "\\bopenspec\\s+instructions\\s+(brainstorm|proposal|design|specs|tasks|plan)\\b"
---

# Run models

The model for each role of a task's run. This is the only workflow file that names a model.

| Role | Model | Effort |
| --- | --- | --- |
| plan | <plan model> | <effort> |
| review | <review model> | <effort> |
| implement | <implement model id> | <effort> |

A model cannot be started: stop and tell the user; never substitute another model.

## Reviewer presets

<copied unchanged when replacing: see below>
````

**Reviewer presets.** When the file replaces `repo-review-models.md`, everything in the old file after its `# ` title line is copied below the heading `## Reviewer presets`, byte for byte: the reviewer table, the presets and the rules under them. Nothing is reworded. When nothing is replaced and no earlier `repo-run-models.md` exists, leave the section out.

The source of the reviewer rows and presets is the old file while it exists. Once it is gone, it is the text below `## Reviewer presets` in the existing `repo-run-models.md`, to the end of the file. So a run after the merge builds the same file and proposes nothing.

For veles, the section reads:

```markdown
## Reviewer presets

The reviewers the superspec review gate can use and the presets over them. This is the only workflow
file that names a model: the other rules, the schemas, the config, the specs and the procedure refer to
the roster's presets and to the first and second reviewer of a preset.

| Label | Model | Effort |
| --- | --- | --- |
| Sol | GPT-6.2-Sol | medium |
| Opus | Opus-5.5 | medium |

Presets, each an ordered list of labels:

- `sol` = [Sol]
- `opus` = [Opus]
- `both` = [Sol, Opus] (first, then second)

A reviewer is a read-only subagent on the named model at the named effort, the model resolved to the
agent tool's own id.

- **A model cannot be started:** stop and tell the user; never substitute another model.
- **A two-reviewer preset with one reviewer unavailable:** stop and ask; run the other reviewer alone
  only if the user says so.

Change a model by editing this table only.
```

## Keys

### Markers

| On | Marker | Form of the whole first line |
|---|---|---|
| Board readme | `<!-- rfc: <rfc-slug> -->` | (anywhere in the readme) |
| Milestone description | `<!-- rfc: <rfc-slug>/<milestone-slug> -->` | (anywhere in the description) |
| Plan issue | `<!-- plan: <rfc-slug>/<milestone-slug> -->` | `^<!-- plan: [a-z0-9-]+/[a-z0-9-]+ -->$` |
| Task issue | `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->` | `^<!-- task: [a-z0-9-]+/[a-z0-9-]+/[0-9]+ -->$` |

The first line is the body up to the first `\n`, with one `\r` at its end removed. It is matched whole.

### Read the board's issues

Every item, page by page, until `hasNextPage` is false. `--paginate` follows `endCursor`. If it fails, stop the keying step: the list would be incomplete.

```bash
gh api graphql --paginate -f query='
query($project: ID!, $endCursor: String) {
  node(id: $project) { ... on ProjectV2 {
    items(first: 100, after: $endCursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id type content { __typename
        ... on Issue { number state repository { nameWithOwner } body } } }
    } } }
}' -f project=<project id> --jq '.data.node.items.nodes[]
  | select(.content.__typename == "Issue" and .content.state == "OPEN"
           and .content.repository.nameWithOwner == "<repo>")
  | .content | {number, body}' > <work>/items.jsonl
```

Pull requests, draft items and issues of other repositories drop out here. Sort each issue by its first line:

```bash
jq -r '((.body // "") | (split("\n")[0] // "") | rtrimstr("\r")) as $l
  | (if ($l | test("^<!-- task: [a-z0-9-]+/[a-z0-9-]+/[0-9]+ -->$")) or ($l | test("^<!-- plan: [a-z0-9-]+/[a-z0-9-]+ -->$")) then "identified"
     elif ($l | startswith("<!-- task:")) or ($l | startswith("<!-- plan:")) then "malformed"
     else "keyless" end) as $class
  | "\(.number)\t\($class)\t\($l)"' <work>/items.jsonl
```

A malformed issue is reported with its first line and left unchanged. An identified issue is counted and left unchanged.

### Read every key in the repository

Open and closed, on and off the board, every page; pull requests skipped:

```bash
gh api --paginate "repos/<repo>/issues?state=all&per_page=100" \
  --jq '.[] | select(.pull_request | not)
        | ((.body // "") | (split("\n")[0] // "") | rtrimstr("\r")) as $l
        | select($l | test("^<!-- task: [a-z0-9-]+/[a-z0-9-]+/[0-9]+ -->$"))
        | "\(.number)\t\(.state)\t\($l | capture("^<!-- task: (?<key>[^ ]+) -->$").key)"' > <work>/keys.tsv
cut -f3 <work>/keys.tsv | sort | uniq -d     # any output: a duplicate key, stop the keying step
```

If the command fails, stop the keying step. The highest number under a prefix is the largest `<number>` among keys `<prefix>/<number>` in `keys.tsv`; 0 when there is none.

### Slugs

```bash
# the board's RFC slug: exactly one, else no issue gets a key
gh project view <n> --owner <board owner> --format json \
  --jq '[.readme // "" | match("<!-- rfc: ([a-z0-9-]+) -->"; "g") | .captures[0].string] | unique'

# each milestone's marker: exactly one per milestone, else its issues get no key
gh api --paginate "repos/<repo>/milestones?state=all&per_page=100" \
  --jq '.[] | "\(.number)\t\([.description // "" | match("<!-- rfc: ([a-z0-9-]+/[a-z0-9-]+) -->"; "g") | .captures[0].string] | unique | join(" "))"'
```

The issue's milestone number comes from the trust query below. Reasons for no key: "no RFC marker in the board readme", "no milestone", "milestone has no RFC marker", "milestone's RFC slug `<x>` differs from the board's `<y>`".

### Trust

For each keyless issue, save its state and history, and its body bytes:

```bash
gh api graphql -f query='
query($owner: String!, $name: String!, $n: Int!) {
  repository(owner: $owner, name: $name) { issue(number: $n) {
    number state
    author { login }
    milestone { number }
    projectItems(first: 100) { nodes { project { id } } }
    userContentEdits(first: 100) {
      totalCount pageInfo { hasNextPage }
      nodes { id updatedAt deletedAt editor { login } }
    }
  } }
}' -f owner=<owner> -f name=<name> -F n=<issue> > <work>/keys/<issue>.survey.json

set -o pipefail
gh api "repos/<repo>/issues/<issue>" | jq -j '.body // ""' > <work>/keys/<issue>.survey.body
```

`jq -j` writes the body without adding a newline; `gh api --jq` has no such option. With `pipefail`, a failed read is not mistaken for an empty body.

The issue is trusted only when this prints `true`:

```bash
jq -e --arg agent <agent> --arg owner <owner> '
  (.errors == null) and (.data.repository.issue as $i
  | ([$i.author.login] + [$i.userContentEdits.nodes[].editor.login]) as $logins
  | $i.userContentEdits.pageInfo.hasNextPage == false
    and ([$i.userContentEdits.nodes[] | select(.deletedAt != null)] | length) == 0
    and ($logins | all(. != null and (. == $agent or . == $owner))))' <work>/keys/<issue>.survey.json
```

A failed query is untrusted too. Name the reason in the report: "edited by `<login>`", "author `<login>`", "deleted edit", "edit history has more pages", "editor or author unknown", "history could not be read".

### Allocate

Go through the trusted keyless issues that have both slugs, in ascending issue number. For each prefix `<rfc-slug>/<milestone-slug>`, start from its highest number in `keys.tsv` and give each issue the next number. Keep the counters in one place for the whole run, so two issues never get the same number.

### Re-check and write

For one issue at a time, just before its write:

```bash
# 1. the same reads as the survey, into .now files
gh api graphql -f query='<the trust query>' -f owner=<owner> -f name=<name> -F n=<issue> > <work>/keys/<issue>.now.json
set -o pipefail
gh api "repos/<repo>/issues/<issue>" | jq -j '.body // ""' > <work>/keys/<issue>.now.body

# 2. nothing changed: both print nothing and succeed
cmp <work>/keys/<issue>.survey.body <work>/keys/<issue>.now.body
diff <(jq -S --arg p <project id> '.data.repository.issue | {state, milestone: .milestone.number,
        onBoard: ([.projectItems.nodes[].project.id] | index($p) != null),
        edits: [.userContentEdits.nodes[] | {id, updatedAt}]}' <work>/keys/<issue>.survey.json) \
     <(jq -S --arg p <project id> '.data.repository.issue | {state, milestone: .milestone.number,
        onBoard: ([.projectItems.nodes[].project.id] | index($p) != null),
        edits: [.userContentEdits.nodes[] | {id, updatedAt}]}' <work>/keys/<issue>.now.json)
```

Also check that the issue is still open (the `state` above) and that its milestone's marker is unchanged: run the milestones read of "Slugs" again into `milestones.now.tsv` and compare the issue's milestone line:

```bash
grep "^<milestone number>"$'\t' <work>/milestones.tsv
grep "^<milestone number>"$'\t' <work>/milestones.now.tsv    # must print the same line
```

Save the survey's milestones read as `<work>/milestones.tsv` for this. Any difference: skip the issue, and list it under Pending as "changed during the run".

Then read every key in the repository again, with the command above, into `keys.now.tsv`. A duplicate now stops the keying step. If another issue holds the planned key, skip this issue and report it as "key `<key>` was taken by #<other> during the run". Do not give it another number in this run.

Write the key line, a newline, then the body exactly as read:

```bash
{ printf '%s\n' '<!-- task: <rfc-slug>/<milestone-slug>/<number> -->'; cat <work>/keys/<issue>.now.body; } \
  > <work>/keys/<issue>.new.body
gh issue edit <issue> --repo <repo> --body-file <work>/keys/<issue>.new.body

set -o pipefail
gh api "repos/<repo>/issues/<issue>" | jq -j '.body // ""' > <work>/keys/<issue>.after.body
cmp <work>/keys/<issue>.new.body <work>/keys/<issue>.after.body    # must print nothing
```

A difference after the write is reported with both files, and the keying step stops.

## Approval rule

Rulesets that apply to the default branch. A writer can read them, as checked on `line-mcp`:

```bash
gh api "repos/<repo>/rules/branches/<default>" \
  --jq '[.[] | select(.type == "pull_request") | .parameters.required_approving_review_count] | max // 0'
```

Classic branch protection:

```bash
if out=$(gh api "repos/<repo>/branches/<default>/protection" \
           --jq '.required_pull_request_reviews.required_approving_review_count // 0' 2>&1); then
  echo "read: $out"                                    # the required count
elif printf '%s' "$out" | grep -q 'Branch not protected'; then
  echo "read: 0"                                       # counts as read only when .permissions.admin is true
else
  echo "not read: $out"
fi
```

On a 404, `gh` prints the error body (with its `message`) and `gh: ... (HTTP 404)`; the capture holds both.

How to read them:

| Source | Read, requires an approval | Read, requires none | Not read |
|---|---|---|---|
| Rulesets | a number of 1 or more | 0 | the command failed |
| Classic | a number of 1 or more | 0, or a 404 with the message "Branch not protected" while `.permissions.admin` is true | any other error. Without admin the endpoint answers 404 "Not Found", as on `line-mcp`, which says nothing |

- **yes:** either source requires an approval.
- **no:** both were read and neither requires one. Owner step: "Require a pull request with at least 1 approving review on `<default>`: add a branch ruleset at https://github.com/<repo>/settings/rules".
- **unknown:** anything else. Owner step: "Check that `<default>` requires at least 1 approving review: https://github.com/<repo>/settings/rules".

## Webhook

No command. Never create a webhook in this procedure. List this line under Pending on every run, verbatim:

```text
Webhook: pending. Created by the task "Repair claims, settle merged work and wake on events".
```
