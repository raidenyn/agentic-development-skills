# Run a wake: GitHub commands

The commands of one wake of the conductor, one section per step. Everything goes through the `gh` command line tool, `jq` and the T3 MCP tools. The commands below were checked against GitHub with `gh` 2.105. If a flag is missing in your version, check `gh <command> --help` before changing the approach.

A wake is a message to the conductor thread that ends with "Run one wake of the project-conductor skill for this repository." The served repository is the repository of the conductor thread's own project checkout.

Placeholders:

| Placeholder | Meaning |
|---|---|
| `<repo>` | The served repository as `owner/name`, from Preflight. |
| `<default>` | The repository's default branch, from Preflight. |
| `<board owner>`, `<n>` | The board's owner and number, from `PROJECT_URL`: `https://github.com/users/<board owner>/projects/<n>` or `.../orgs/<board owner>/projects/<n>`. |
| `<agent>` | The agent's login, from Preflight. |
| `<owner>`, `<name>` | The two halves of `<repo>`. `<owner>` is the repository owner's login. |
| `<project id>` | The board's node id, from Preflight. |
| `<conductor id>` | The conductor thread's own id, from Preflight. |
| `<conductor project>` | The T3 project of the conductor thread: the `projectId` that `t3_thread_read` returns for `<conductor id>`. |
| `<issue>` | The number of one issue on the board. |
| `maxParallel`, `maxAttempts` | The numbers of the `project-conductor` key of `.agents/harness.json`. |
| `<plan model>`, `<implement model>` | A `modelSelection` object `{instanceId, model, options}`, from Models. |
| `<work>` | A folder of this wake in the scratchpad, such as `<scratchpad>/wake`. Every saved file goes here. |

Always pass `--repo <repo>` to `gh issue`, `gh pr`, `gh label` and `gh variable`. Without it, `gh` resolves against the current checkout, which may be another repository.

## Preflight

Read all of this before Advance and Start. A gap in any item below means Advance and Start write nothing in this wake, and the report names the gap and its owner step. Run every read anyway, so one report lists all gaps. Anchor: `#preflight`.

### The repository and the conductor

```bash
gh auth status                                   # logged in, and the token scopes include "project"
gh api user --jq .login                          # <agent>
gh repo view --json nameWithOwner,defaultBranchRef --jq '.nameWithOwner, .defaultBranchRef.name'   # <repo>, <default>
```

Run `gh repo view` in the conductor's own checkout: that checkout's repository is the served repository. Then read the conductor's own thread id with the T3 tool `t3_thread_configure` called with no arguments: its `threadId` is `<conductor id>`.

| Result | Gap, owner step |
|---|---|
| `gh auth status` fails, or lacks the `project` scope | "Log the agent account in to `gh` with the `project` scope (`gh auth refresh -s project`)." |
| `gh repo view` fails | "Start the conductor thread in a checkout of the served repository." |

### `PROJECT_URL`

```bash
gh variable get PROJECT_URL --repo <repo>
```

```bash
# <board owner> and <n>; no output: the value is not a board URL
gh variable get PROJECT_URL --repo <repo> \
  | sed -nE 's#^https://github.com/(users|orgs)/([^/]+)/projects/([0-9]+)/?$#\2 \3#p'
```

| Result | Gap, owner step |
|---|---|
| the command fails, or prints nothing | "Set the repository variable `PROJECT_URL` to the board's URL: run the onboarding procedure of project-conductor." |
| the `sed` prints nothing | "`PROJECT_URL` is not a GitHub Projects URL: set it to `https://github.com/users/<owner>/projects/<n>` or `https://github.com/orgs/<owner>/projects/<n>`." |

### The two settings files

Read both from the default branch, never from a local checkout. The raw media type returns the file's exact bytes. On a 404, `gh` writes the error body to stdout, so test the exit status, not the output:

```bash
mkdir -p <work>
for f in .agents/harness.json .agents/hooked-rules/repo-run-models.md; do
  if gh api -H 'Accept: application/vnd.github.raw+json' \
       "repos/<repo>/contents/$f?ref=<default>" > "<work>/$(basename "$f")" 2> <work>/err; then
    echo "present $f"
  elif grep -q 'HTTP 404' <work>/err; then
    rm -f "<work>/$(basename "$f")"; echo "absent $f"
  else
    cat <work>/err; echo "unreadable $f"
  fi
done
```

Check `harness.json`. The command prints `true` only for a key with whole numbers of 1 or more in `maxParallel` and `maxAttempts`:

```bash
jq -e '.["project-conductor"] | (.maxParallel | type == "number" and . >= 1 and . == floor)
                                and (.maxAttempts | type == "number" and . >= 1 and . == floor)' <work>/harness.json
jq -r '.["project-conductor"] | "maxParallel=\(.maxParallel) maxAttempts=\(.maxAttempts)"' <work>/harness.json
```

Read the roles of the model file from the table under `# Run models`, one `role<TAB>model<TAB>effort` line each:

```bash
awk -F'|' '
  /^# Run models/ { s = 1; next }
  /^## /          { s = 0 }
  s && $2 ~ /^ *(plan|implement) *$/ {
    for (i = 2; i <= 4; i++) gsub(/^ +| +$/, "", $i)
    print $2 "\t" $3 "\t" $4 }' <work>/repo-run-models.md
```

Read only the table under `# Run models`, never the table of reviewers under `## Reviewer presets`. The cell of a role is resolved in [Models](#models), only for the role the step uses.

| Result | Gap, owner step |
|---|---|
| `harness.json` absent, or unreadable | "Add `.agents/harness.json` to `<default>`: run the onboarding procedure of project-conductor." |
| `harness.json` is not JSON, has no `project-conductor` key, or the check above does not print `true` | "Fix the `project-conductor` key of `.agents/harness.json` on `<default>`: `maxParallel` and `maxAttempts` must be whole numbers of 1 or more." |
| `repo-run-models.md` absent, or unreadable | "Add `.agents/hooked-rules/repo-run-models.md` to `<default>`: run the onboarding procedure of project-conductor." |
| the `awk` prints no line for `plan` or for `implement`, or a cell is empty | "Fill the `plan` and `implement` rows of `.agents/hooked-rules/repo-run-models.md` on `<default>`." |

An edit that is not merged into `<default>` is not read. Say so in the report when the owner is likely to have edited a branch.

### The board

Read the board's fields with their options, then check the names exactly, case included:

```bash
gh project view <n> --owner <board owner> --format json --jq .id      # <project id>
gh project field-list <n> --owner <board owner> --format json > <work>/fields.json
```

```bash
# any output line is a gap; no output: the board passes
jq -r '
  .fields as $f
  | ( [["Status","Ready"], ["Status","In progress"], ["Run phase","plan"], ["Run phase","implement"]][]
      | . as [$n, $o]
      | select(([$f[] | select(.name == $n) | .options[]?.name] | index($o)) == null)
      | "missing option \($n) / \($o)" ),
    ( ["Phase", "Attempt", "Run thread"][] | . as $n
      | select(([$f[].name] | index($n)) == null) | "missing field \($n)" )' <work>/fields.json
```

`index` compares strings exactly, so "ready", "Run Phase" and "In Progress" do not match. The check does not look at other options: a board with more options than these passes.

| Output line | Gap, owner step |
|---|---|
| `missing option Status / Ready` or `Status / In progress` | "Add the option `<name>` to the board's Status field, spelled exactly so." |
| `missing option Run phase / plan` or `/ implement` | "Add the option to the board's field `Run phase`, or run the onboarding procedure of project-conductor." |
| `missing field Phase` | "Add the single select field `Phase` to the board." |
| `missing field Attempt` or `Run thread` | "Add the field to the board, or run the onboarding procedure of project-conductor." |

When `gh project field-list` fails, the whole board is a gap: "Give the agent account access to the board, with the `project` token scope." A field that exists under another case is reported the same way, as a missing one.

### The label `blocked`

A stop that needs the owner puts the label `blocked` on the issue. Read the labels, and create the label only when it is missing:

```bash
gh label list --repo <repo> --limit 200 --json name --jq '.[] | select(.name == "blocked") | .name'
```

No output: the label is missing. Create it:

```bash
gh label create blocked --repo <repo> --color B60205 --description "Waiting for the owner"
```

Read the list again: the label must now be there. When the create fails, report it as a gap: "Create the label `blocked` in `<repo>`, or give the agent account write access." Then every stop that needs the label is reported in place of the label, never written.

This is the only write of Preflight. It is not a write of Advance or Start, so it is made even when another item is a gap.

## Models

Resolve a Model cell of `repo-run-models.md` into the `modelSelection` that `t3_thread_launch` and `t3_thread_configure` take. Resolve only the roles the step uses: plan for Start, implement for Advance. Never resolve review in a wake. Anchor: `#models`.

A cell is `<providerInstanceId>/<model id>`. The Effort cell is a value of one option of that model.

1. **Split.** Split the cell at the first `/`: before it `<providerInstanceId>`, after it `<model id>`. A model id may hold more `/`. `opencode/ollama-cloud/deepseek-v4.1-flash:1017` is instance `opencode`, model `ollama-cloud/deepseek-v4.1-flash:1017`. A cell with no `/`, or with an empty half, is a bare name: do not call the host. The onboarding default `Opus-5.5` is bare.
2. **Search.** Call the T3 tool `orchestrator_capabilities` with `search` set to `<model id>`. Without `search`, every provider lists no models. The search is a substring search: the answer for `gpt-6.2-sol` also holds `gpt-6.2-sol-fast`.
3. **Match exactly.** In the answer, take the provider whose `providerInstanceId` equals the cell's, and in its `models` the one whose `id` equals `<model id>`, character for character. A label is never compared. No such provider, or no such model: no match.
4. **Pick the effort option.** Of the model's `options`, take the one option whose `values` include the Effort string. The id of that option differs by provider: `effort` (Claude), `variant` (OpenCode), `thought_level` (Antigravity). Take the id from the answer, never from this list. Options with boolean values, such as `fastMode`, never include an Effort string. No option includes it, or more than one does: unsupported effort.
5. **Build.** The result is:

   ```json
   {"instanceId": "<providerInstanceId>", "model": "<model id>", "options": [{"id": "<option id>", "value": "<Effort>"}]}
   ```

   Nothing else is put in `options`.

The three cells of the scratch model file resolve like this:

| Cell | Effort | `modelSelection` |
|---|---|---|
| `claudeAgent/claude-opus-5-5` | medium | `{"instanceId": "claudeAgent", "model": "claude-opus-5-5", "options": [{"id": "effort", "value": "medium"}]}` |
| `opencode/openai/gpt-6.2-sol` | medium | `{"instanceId": "opencode", "model": "openai/gpt-6.2-sol", "options": [{"id": "variant", "value": "medium"}]}` |
| `opencode/ollama-cloud/deepseek-v4.1-flash:1017` | high | `{"instanceId": "opencode", "model": "ollama-cloud/deepseek-v4.1-flash:1017", "options": [{"id": "variant", "value": "high"}]}` |

The model `ollama-cloud/deepseek-v4.1-flash:1017` offers `variant` with `low`, `high` and `max`, so its Effort `xhigh` would be an unsupported effort.

When a step is not taken, the report has one line for it, with the role and the cell as written in the file. A model is never substituted: no other model of the provider, no model of the conductor's own thread, no other effort.

| Case | Report line, owner step |
|---|---|
| bare name | "`<role>` model `<cell>` is not provider-qualified: edit `.agents/hooked-rules/repo-run-models.md` on `<default>` to `<providerInstanceId>/<model id>`." |
| no match | "`<role>` model `<cell>` is not offered by instance `<providerInstanceId>`: edit `.agents/hooked-rules/repo-run-models.md` on `<default>` to a model the host lists." |
| unsupported effort | "`<role>` model `<cell>` does not offer the effort `<Effort>`; it offers `<values of its options>`: edit `.agents/hooked-rules/repo-run-models.md` on `<default>`." |

A role that is not resolved stops its step: a plan model gap stops Start, an implement model gap stops Advance. The other step goes on.

## Board

Read every page of the board once, before Advance and Start. Every later step judges this read; Claim reads one issue again just before its first write. Anchor: `#board`.

Save the shared fragments. The Claim re-read uses the same ones, so both reads return an item in the same shape:

```bash
cat > <work>/fragments.graphql <<'EOF'
fragment Value on ProjectV2ItemFieldValue {
  ... on ProjectV2ItemFieldSingleSelectValue { name }
  ... on ProjectV2ItemFieldTextValue { text }
  ... on ProjectV2ItemFieldNumberValue { number }
}
fragment RunFields on ProjectV2Item {
  id type isArchived
  status: fieldValueByName(name: "Status") { ...Value }
  phase: fieldValueByName(name: "Phase") { ...Value }
  runPhase: fieldValueByName(name: "Run phase") { ...Value }
  attempt: fieldValueByName(name: "Attempt") { ...Value }
  runThread: fieldValueByName(name: "Run thread") { ...Value }
}
fragment IssueFacts on Issue {
  number title state body
  repository { nameWithOwner }
  author { login }
  assignees(first: 10) { totalCount nodes { login } }
  labels(first: 20) { totalCount nodes { name } }
  blockedBy(first: 50) { totalCount nodes { number state stateReason } }
  linkedBranches(first: 10) { totalCount nodes { ref { name } } }
  closedByPullRequestsReferences(first: 10, includeClosedPrs: true) {
    totalCount nodes { number isCrossRepository authorAssociation author { login } } }
  userContentEdits(first: 100) { totalCount nodes { editor { login } deletedAt } }
}
EOF
```

Save the board query. Replace `<root>` with `user` when `PROJECT_URL` has `/users/`, and with `organization` when it has `/orgs/`. The alias `owner` keeps the path of the answer the same for both:

```bash
cat > <work>/board.graphql <<'EOF'
query($login: String!, $number: Int!, $cursor: String) {
  owner: <root>(login: $login) { projectV2(number: $number) {
    items(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { ...RunFields
        content { __typename
          ... on Issue { ...IssueFacts }
          ... on PullRequest { number repository { nameWithOwner } } } }
    } } }
}
EOF
```

Read page by page while `hasNextPage` is true, then join the pages into `<work>/board.json`, an array of items:

```bash
set -o pipefail
: > <work>/board.jsonl; cursor=""; ok=1
while :; do
  gh api graphql -f query="$(cat <work>/board.graphql <work>/fragments.graphql)" \
    -f login=<board owner> -F number=<n> ${cursor:+-f cursor="$cursor"} > <work>/page.json \
    && jq -e '.errors == null and .data.owner.projectV2 != null' <work>/page.json > /dev/null \
    || { ok=0; cat <work>/page.json; break; }
  jq -c '.data.owner.projectV2.items.nodes[]' <work>/page.json >> <work>/board.jsonl
  cursor=$(jq -r '.data.owner.projectV2.items.pageInfo | if .hasNextPage then .endCursor else "" end' <work>/page.json)
  [ -n "$cursor" ] || break
done
[ "$ok" = 1 ] && jq -s . <work>/board.jsonl > <work>/board.json && echo "board read"
```

No `board read` line: the read failed. Start writes nothing in this wake, and the report names the error. A partial board is never judged.

Each item holds its `id` (the item id that `gh project item-edit --id` takes), its `type`, `isArchived` (true for an item archived on the board; a missing value counts as false), the five field values (`status`, `phase`, `runPhase`, `attempt`, `runThread`; `null` when unset) and its `content`. A draft item has `content.__typename` `DraftIssue` and no number. Every nested list has `totalCount` beside its `nodes`, so a list longer than its page is seen.

Blockers are read with their `stateReason`, but the reason is not used: a blocker closed as not planned counts as closed, like one closed as completed.

## Ready filter

The filter prints one line per board item: `<issue> start` or `<issue> skip <reason>`. An item without a number (a draft item) prints its item id in place of `<issue>`. Anchor: `#ready-filter`.

It decides **Ready** first, from exactly three conditions: the item is a task in the monitored project, it has no open blocker, and its Status is "Ready". Only on a Ready item does it apply the start guards, in this order: overflow, taken, trust. Nothing else decides readiness. The filter never reads the label `blocked`, a blocker's close reason or the "Ready to start when" text; that text is read only to word the reason `waiting-for-ready`, on an item that is not Ready anyway.

```bash
cat > <work>/filter.jq <<'EOF'
def val: if . == null then null else .name // .text // .number end;
def set: val | . != null and tostring != "";
def firstline: (.body // "") | (split("\n")[0] // "") | rtrimstr("\r");
def condition:
  [(.body // "") | match("\\*\\*Ready to start when:\\*\\*([^\\n]*(?:\\n(?!\\n)[^\\n]*)*)")]
  | if length == 0 then false
    else .[0].captures[0].string | gsub("^\\s+|\\s+$"; "") | ascii_downcase | sub("[.\\s]+$"; "")
         | . != "" and . != "no conditions" and . != "none" end;
def not_ready($repo):
  .content as $c
  | if .isArchived == true then "not-task"
    elif $c == null or $c.__typename != "Issue" then "not-task"
    elif $c.repository.nameWithOwner != $repo then "other-repo"
    elif $c.state != "OPEN" then "closed"
    elif ($c | firstline | test("^<!-- plan: [a-z0-9-]+/[a-z0-9-]+ -->$")) then "plan-item"
    elif ($c | firstline | test("^<!-- task: [a-z0-9-]+/[a-z0-9-]+/[0-9]+ -->$") | not) then "not-task"
    elif (.phase | val) == "Planning" then "planning"
    elif (.phase | val) == "Outline" then "outline"
    elif any($c.blockedBy.nodes[]; .state == "OPEN") then "blocker-open"
    elif (.status | val) == "Ready" then null
    elif (.status | val) == "Backlog" and ($c | condition) then "waiting-for-ready"
    else "not-ready" end;
def overflow:
  .content as $c
  | [ "assignees", "labels", "blockedBy", "linkedBranches", "closedByPullRequestsReferences"
      | select($c[.].totalCount > ($c[.].nodes | length)) ];
def taken:
  [ (select(.content.assignees.totalCount > 0) | "assignee"),
    (select(.runThread | set) | "run-thread"),
    (select(.attempt | set) | "attempt"),
    (select(.runPhase | set) | "run-phase"),
    (select(.content.linkedBranches.totalCount > 0) | "branch"),
    (select(any(.content.closedByPullRequestsReferences.nodes[];
                .isCrossRepository == false
                or (.authorAssociation | IN("OWNER", "MEMBER", "COLLABORATOR")))) | "pr") ];
def trusted($agent; $owner):
  .content | ([.author.login] + [.userContentEdits.nodes[].editor.login]) as $logins
  | .userContentEdits.totalCount == (.userContentEdits.nodes | length)
    and all(.userContentEdits.nodes[]; .deletedAt == null)
    and all($logins[]; . != null and (. == $agent or . == $owner));
.[] | "\(.content.number // .id) " + (
  if not_ready($repo) != null then "skip \(not_ready($repo))"
  elif (overflow | length) > 0 then "skip overflow:\(overflow | join(","))"
  elif (taken | length) > 0 then "skip taken:\(taken | join(","))"
  elif trusted($agent; $repo | split("/")[0]) | not then "skip untrusted"
  else "start" end)
EOF
jq -r --arg repo <repo> --arg agent <agent> -f <work>/filter.jq <work>/board.json > <work>/filter.txt
```

- **Task key.** The first line is the body up to the first `\n`, with one `\r` at its end removed, matched whole, as in [onboarding, Markers](onboarding-github.md#markers). A malformed key line is `not-task`, like a missing one.
- **Start condition.** `condition` is the `hasStartCondition` pattern of `scripts/project-ready.mts`: a `**Ready to start when:**` paragraph whose text, trimmed, lower-cased and without trailing dots, is not empty, `no conditions` or `none`.
- **Overflow.** A nested list whose `totalCount` is larger than its `nodes` holds facts the read did not return, so the item is not started. Its reason lists the lists, such as `overflow:blockedBy`. An edit history longer than its page is `untrusted` instead, by the trust rule.
- **Taken by a pull request.** A closing pull request makes the item taken when `isCrossRepository` is false, or its `authorAssociation` is `OWNER`, `MEMBER` or `COLLABORATOR`. A fork pull request by anyone else is ignored. A thread titled with the launch key also makes an item taken; the filter cannot see threads, so [Claim](#claim) checks it.
- **Trust** is the rule of [onboarding, Trust](onboarding-github.md#trust): the author and every editor of the body are `<agent>` or `<owner>`, and the edit history is complete, with no deleted edit and no editor that cannot be identified. The board read gives `totalCount` in place of `hasNextPage`: a history with more edits than it returned is untrusted.

Reasons, and what the report says for each:

| Reason | Report |
|---|---|
| `not-task` | Not a task: an item archived on the board (`isArchived` true; say "archived"), a pull request, a draft item, or an issue without a task key. Not handled. |
| `plan-item` | A plan item. Not handled yet. |
| `planning`, `outline` | Phase Planning or Outline. Planning items are not handled yet. |
| `other-repo` | An issue of another repository. Not handled. |
| `closed` | The issue is closed. |
| `blocker-open` | Blocked by the open issues the details command below names. |
| `not-ready` | Status is not "Ready". |
| `waiting-for-ready` | In Backlog with a "Ready to start when" condition: waiting for a person to set Ready. |
| `overflow:<list>` | Ready, but these lists have more entries than the read returned. Not started. |
| `taken:<what>` | Ready, but taken: `assignee`, `run-thread`, `attempt`, `run-phase`, `branch` or `pr`, or `thread` from [Claim](#claim). Name them with the details command, or the thread id. |
| `untrusted` | Ready, but untrusted. Name the reason with the wording of [onboarding, Trust](onboarding-github.md#trust), from the author and editors the details command prints. |

The details of one item, for the report:

```bash
jq -r --argjson n <issue> '.[] | select(.content.number == $n) | .content
  | "open blockers: \([.blockedBy.nodes[] | select(.state == "OPEN") | "#\(.number)"] | join(" "))",
    "assignees: \([.assignees.nodes[].login] | join(" "))",
    "branches: \([.linkedBranches.nodes[].ref.name] | join(" "))",
    "pull requests: \([.closedByPullRequestsReferences.nodes[] | "#\(.number) \(.author.login // "?") \(.authorAssociation) cross=\(.isCrossRepository)"] | join(", "))",
    "author: \(.author.login // "unknown"); editors: \([.userContentEdits.nodes[] | (.editor.login // "unknown") + (if .deletedAt then " (deleted)" else "" end)] | join(" ")); edits \(.userContentEdits.totalCount)"' <work>/board.json
```

A Ready task whose only blocker was closed as not planned prints `start`, when nothing else stops it. On the scratch board (project 5 of `raidenyn-shadow`), #17 is such a task.

## Claim

Claim the `start` lines of the filter in ascending issue number, while a slot is free. Before the first write of each item, read it again and search for its thread. Anchor: `#claim`.

### Slots

In use is every open board issue that is not archived on the board and is assigned to `<agent>` or has a non-empty "Run thread", whatever its Status and repository. An issue whose assignees overflow their page counts as in use:

```bash
jq -r --arg agent <agent> '[.[] | select(.isArchived != true and .content.__typename == "Issue" and .content.state == "OPEN")
  | select(any(.content.assignees.nodes[]; .login == $agent)
           or .content.assignees.totalCount > (.content.assignees.nodes | length)
           or ((.runThread.text // "") != ""))] | length' <work>/board.json      # <in use>
grep ' start$' <work>/filter.txt | sort -n | cut -d' ' -f1                    # the candidates, in order
```

Free slots are `maxParallel` minus `<in use>`. Claim the candidates in order until no slot is free. An item uses a slot from its first claim write, even when a later write fails. An item skipped before any write uses none. Each candidate left over stays Ready and is reported: "Ready, not started: no free slot (`<in use>` of `maxParallel` in use)."

### Look before claiming

Save the re-read query. It is the board's fragments for one issue, plus the edit ids and the issue's board items:

```bash
cat > <work>/reread.graphql <<'EOF'
query($owner: String!, $name: String!, $n: Int!) {
  repository(owner: $owner, name: $name) { issue(number: $n) {
    __typename ...IssueFacts
    userContentEdits(first: 100) { nodes { id } }
    projectItems(first: 20) { totalCount nodes { project { id } ...RunFields } }
  } }
}
EOF

reread() {   # reread <issue> <out>: the issue's item on this board, in the shape of board.json
  gh api graphql -f query="$(cat <work>/reread.graphql <work>/fragments.graphql)" \
    -f owner=<owner> -f name=<name> -F n="$1" > "$2.raw" \
  && jq -e '.errors == null and (.data.repository.issue.projectItems | .totalCount == (.nodes | length))' "$2.raw" > /dev/null \
  && jq --arg p <project id> '.data.repository.issue as $i
       | [$i.projectItems.nodes[] | select(.project.id == $p) | del(.project) + {content: ($i | del(.projectItems))}]' \
       "$2.raw" > "$2"
}
```

Read the item again and compare it with the board read, leaving out the labels (they do not decide readiness) and the edit ids (the board read has none). Then run the filter on it:

```bash
reread <issue> <work>/claim-<issue>.json
diff <(jq -S --argjson n <issue> '[.[] | select(.content.number == $n) | del(.content.labels)]' <work>/board.json) \
     <(jq -S 'map(del(.content.labels) | del(.content.userContentEdits.nodes[].id))' <work>/claim-<issue>.json)   # must print nothing
jq -r --arg repo <repo> --arg agent <agent> -f <work>/filter.jq <work>/claim-<issue>.json                      # must print "<issue> start"
```

The comparison covers Status, the run fields, assignees, blockers, linked branches, closing pull requests, the body with its task key, and the edit history. A failed read, any difference, or a line other than `start` skips the item: "changed during the wake", with the difference. Keep the edit ids of `claim-<issue>.json`: they name the body that was claimed.

Then search for the item's thread. The launch key is `<repo>#<issue> attempt 1`, such as `raidenyn-shadow/task-run-scratch#15 attempt 1`. Call the T3 tool `t3_thread_search` with `query` set to the launch key and `projectId` set to `<conductor project>`. The search matches titles by word prefix, so `#1 attempt 1` also finds `#15 attempt 1`, and a longer title holding the key is found too: compare every `matches[].title` with the launch key exactly. A match whose title equals the launch key makes the item taken: skip it as `taken:thread`, with the thread id. The search skips archived threads.

### Writes

Write in this order, and read each write back before the next. A failed write or read-back stops this item's claim. Report it as a half-made claim, with the writes that completed; they stay for Repair. Then go on with the next candidate.

The field and option ids come from `<work>/fields.json` of Preflight:

```bash
jq -r '.fields[] | select(.name == "Status") | .id, (.options[] | select(.name == "In progress") | .id)' <work>/fields.json   # <status field>, <in progress>
jq -r '.fields[] | select(.name == "Run phase") | .id, (.options[] | select(.name == "plan") | .id)' <work>/fields.json      # <run phase field>, <plan>
jq -r '.fields[] | select(.name == "Attempt" or .name == "Run thread") | "\(.name)\t\(.id)"' <work>/fields.json             # <attempt field>, <run thread field>
```

The branch is `<type>/<issue>-<slug>`. `<type>` is `feat` for Phase Feature, Foundation, Migration or an empty Phase, `refactor` for Refactor, `fix` for Hardening and `chore` for Spike. The slug is the issue title lower-cased, every run of characters outside `a-z0-9` replaced by `-`, cut to 40 characters, with `-` trimmed at both ends. An empty slug gives `<type>/<issue>`:

```bash
jq -r '.[0] | ((.phase.name // "") as $p
    | if $p == "Refactor" then "refactor" elif $p == "Hardening" then "fix" elif $p == "Spike" then "chore"
      elif $p == "" or $p == "Feature" or $p == "Foundation" or $p == "Migration" then "feat" else null end) as $type
  | (.content.title | ascii_downcase | gsub("[^a-z0-9]+"; "-") | .[0:40] | gsub("^-+|-+$"; "")) as $slug
  | if $type == null then error("no branch type for Phase \(.phase.name)") else
    "\($type)/\(.content.number)" + (if $slug == "" then "" else "-\($slug)" end) end' <work>/claim-<issue>.json   # <branch>
```

`R1: add a greeting function` (#15, Phase Feature) gives `feat/15-r1-add-a-greeting-function`. A title made only of symbols or non-Latin text gives `feat/15`.

Each read-back runs `reread <issue> <work>/after-<issue>.json` and prints the claim's state:

```bash
jq -r '.[0] | "assignees=\([.content.assignees.nodes[].login] | join(",")) status=\(.status.name)",
  "attempt=\(.attempt.number) run-phase=\(.runPhase.name) run-thread=\(.runThread.text)",
  "branches=\([.content.linkedBranches.nodes[].ref.name] | join(","))"' <work>/after-<issue>.json
```

1. Assign the agent. Read back: `assignees` holds `<agent>`.

   ```bash
   gh issue edit <issue> --repo <repo> --add-assignee <agent>
   ```

2. Status "In progress". Read back: `status=In progress`.

   ```bash
   gh project item-edit --id <item id> --project-id <project id> --field-id <status field> --single-select-option-id <in progress>
   ```

3. "Attempt" 1. Read back: `attempt=1`.

   ```bash
   gh project item-edit --id <item id> --project-id <project id> --field-id <attempt field> --number 1
   ```

4. "Run phase" plan. Read back: `run-phase=plan`.

   ```bash
   gh project item-edit --id <item id> --project-id <project id> --field-id <run phase field> --single-select-option-id <plan>
   ```

5. Create and link the branch from the default branch. Read back: `branches` holds `<branch>`, and the remote branch has a head.

   ```bash
   gh issue develop <issue> --repo <repo> --name <branch> --base <default>
   gh api repos/<repo>/git/ref/heads/<branch> --jq .object.sha
   ```

6. Launch the thread with the T3 tool `t3_thread_launch`, on the branch just created:

   ```json
   {"title": "<repo>#<issue> attempt 1",
    "message": "<the start instruction>",
    "projectId": "<conductor project>",
    "modelSelection": <plan model>,
    "workspaceStrategy": {"type": "worktree", "baseRef": "origin/<branch>", "branch": "<branch>", "startFromOrigin": true},
    "clientRequestId": "<repo>#<issue> attempt 1"}
   ```

   The start instruction is in [Instructions](#instructions). `clientRequestId` is the launch key as is: a repeated launch with the same key returns the same thread, so after an error or a lost answer, launch again with the same arguments. The answer holds `threadId`. Read back with `t3_thread_read` on that id: `title` is the launch key and `branch` is `<branch>`.

7. "Run thread". Read back: `run-thread=<threadId>`.

   ```bash
   gh project item-edit --id <item id> --project-id <project id> --field-id <run thread field> --text <threadId>
   ```

`<item id>` is the item's `id` in `claim-<issue>.json`. A claimed item ends with the agent as assignee, Status "In progress", "Attempt" 1, "Run phase" plan, a linked branch, and the thread id in "Run thread". The report lists it with its thread id.

## Reports

Advance judges phase reports. Collect them, drop the ones already stopped, keep the newest per item, then answer each one by [Switch](#switch). Anchor: `#reports`.

Advance runs only when Preflight has no gap and the implement model resolves by [Models](#models). Otherwise it answers no report and writes and sends nothing: its report line names the gap, and every report is judged again at the next wake.

### What a report is

A report is a line of an incoming message from another thread. In `t3_thread_read` with `view: "activity"`, such a message is an item with `type` `user_message` and a `senderThreadId`. `senderThreadId` is the sender. `sourceThreadId` is the thread that holds the item, not the sender, and is never used. A message without `senderThreadId` (typed by a person) holds no report, and neither does a message whose `senderThreadId` is `<conductor id>`.

Each line of the text is trimmed of white space at both ends, then matched whole against:

```text
^phase-done ([^/ ]+/[^# ]+)#([0-9]+) attempt=([0-9]+) phase=(plan|implement|closeout|care) seq=([0-9]+) head=([0-9a-f]{40})\r?$
```

The groups are the repository, the issue, the attempt, the phase, `seq` and `head`. Any other line that contains `phase-done` is malformed: it is answered `report-only`, with the reason malformed, and is never matched in part. So a `head` of 7 characters, two spaces between fields, or the fields in another order is malformed; a line with a trailing CR, or with spaces around it, matches.

A report is named by its message id and its line. One message may hold more than one report line.

### The items in a run

An item in a run is an open board issue that is not archived on the board and has a non-empty "Run thread". Its claim time is the latest `assigned` event by `<agent>` that assigned `<agent>`, from the issue's timeline. Write the claim times to `<work>/claims.json`; an issue whose timeline holds no such event gets an empty time:

```bash
set -o pipefail
: > <work>/unreadable.txt
jq -r '.[] | select(.isArchived != true and .content.__typename == "Issue" and .content.state == "OPEN"
  and ((.runThread.text // "") != "")) | .content.number' <work>/board.json > <work>/running.txt
for i in $(cat <work>/running.txt); do
  gh api repos/<repo>/issues/$i/timeline --paginate \
    --jq '.[] | select(.event == "assigned" and .actor.login == "<agent>" and .assignee.login == "<agent>") | .created_at' \
    > <work>/timeline-$i.txt || { echo "unreadable timeline #$i" >&2; echo "$i" >> <work>/unreadable.txt; continue; }
  jq -n --arg i "$i" --arg t "$(sort <work>/timeline-$i.txt | tail -n 1)" '{($i): $t}'
done | jq -s 'add // {}' > <work>/claims.json
```

An issue with an empty time has no kept reports in this wake; only the triggering message can still name it. An `unreadable timeline` line also puts the issue in `<work>/unreadable.txt`: none of its reports is judged in this wake (see [Judge](#judge)). Say both in the report.

### Collect

Read the conductor's own incoming messages: call `t3_thread_read` with `threadId` `<conductor id>`, `view` `"activity"`, `limit` 100 and `maxCharsPerItem` 20000. Write each answer's `items` to `<work>/inbox-<k>.json`, with `<k>` 1, 2, …. The answer is newest first: for the next page, call again with `beforePosition` set to the answer's `earlierPosition`. Stop when `earlierPosition` is null, or when the oldest item of the page has an `updatedAt` earlier than the earliest time in `claims.json`. With no time in `claims.json`, read only the first page. An item with `textTruncated` true is read on with `itemId` and `textOffset` set to its `nextTextOffset`, and its text is joined before the parse.

The triggering message is the `user_message` that started this wake, normally the newest one. Note its `messageId` as `<trigger>`. Then parse every report line:

```bash
cat > <work>/reports.jq <<'EOF'
def report_re: "^phase-done ([^/ ]+/[^# ]+)#([0-9]+) attempt=([0-9]+) phase=(plan|implement|closeout|care) seq=([0-9]+) head=([0-9a-f]{40})\r?$";
[ .[] | select(.type == "user_message" and (.senderThreadId // "") != "" and .senderThreadId != $me)
  | . as $m | (.text // "") | split("\n") | to_entries[]
  | (.value | gsub("^\\s+|\\s+$"; "")) as $line
  | select($line | contains("phase-done"))
  | {messageId: $m.messageId, position: $m.position, at: $m.updatedAt, sender: $m.senderThreadId,
     index: .key, line: $line, trigger: ($m.messageId == $trigger)}
    + ([$line | match(report_re)]
       | if length == 0 then {malformed: true}
         else .[0].captures | map(.string) as [$r, $n, $a, $p, $s, $h]
           | {malformed: false, repo: $r, issue: ($n | tonumber), attempt: ($a | tonumber),
              phase: $p, seq: ($s | tonumber), head: $h} end) ]
EOF
jq -s 'add | unique_by(.position)' <work>/inbox-*.json > <work>/inbox.json
jq --arg me <conductor id> --arg trigger <trigger> -f <work>/reports.jq <work>/inbox.json > <work>/reports.json
```

A `phase-done` line typed by a person in the triggering message is not a report: the wake's report says so, and nothing else is done with it.

### Recorded stops

A stop is recorded by its comment (see [Stop](#stop)). Read the agent's comments on every issue the reports name:

```bash
set -o pipefail
for i in $(jq -r '[.[] | select(.malformed == false and .repo == "<repo>") | .issue] | unique[]' <work>/reports.json); do
  gh api repos/<repo>/issues/$i/comments --paginate --jq '.[] | select(.user.login == "<agent>") | {body}' \
    | jq -s --argjson i "$i" 'map({issue: $i, body: (.body | gsub("\r"; ""))})' \
    || { echo "unreadable comments #$i" >&2; echo "$i" >> <work>/unreadable.txt; }
done | jq -s 'add // []' > <work>/stops.json
```

An `unreadable comments` line puts the issue in `<work>/unreadable.txt`. No report of that issue is judged in this wake, because a second stop comment could follow: the judge script routes them `report-only unreadable`. Say so in the report.

### Judge

The script keeps, drops and routes the reports, in this order:

1. **Collect.** It keeps the reports of the triggering message, and every well-formed report that names an item in a run and is not older than that item's claim time. Every other report is left out, without a line.
2. **Drop recorded stops.** A report whose stop an agent comment records, by its message id, sender and line, is `recorded`, whether or not the label is still there. It is not judged again.
3. **Newest per item.** Of the reports from an item's "Run thread" whose attempt equals its "Attempt", only the newest (the highest `position`, then the latest line) is judged. The others are `superseded`: reported, never stopped. This holds for the triggering message too. When the newest is `recorded`, the next older one becomes the newest and is judged; this is intended: the stop comment names only the report it stopped, and the owner removing `blocked` is the decision to resume, so that report may act at the next wake.
4. **Judge the rest, one at a time.** That includes the reports from other senders, and the reports from the "Run thread" with another attempt.

```bash
cat > <work>/judge.jq <<'EOF'
def val: if . == null then null else .name // .text // .number end;
def rank: {"plan": 1, "implement": 2, "closeout": 3, "care": 4}[. // ""];
def epoch: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
($board[0]) as $items
| ($filter | split("\n") | map(select(. != "") | split(" ") | {key: .[0], value: (.[2] // .[1])}) | from_entries) as $verdict
| def item: . as $r | first($items[] | select(.isArchived != true and .content.__typename == "Issue"
      and .content.repository.nameWithOwner == $r.repo and .content.number == $r.issue)) // null;
  def complete: any(.content.assignees.nodes[]; .login == $agent)
      and (.runThread | val | . != null and . != "") and (.attempt | val) != null
      and (.runPhase | val | rank) != null and .content.linkedBranches.totalCount == 1;
  def recorded: . as $r | any($stops[0][] | select(.issue == $r.issue);
      .body | contains("Report: \($r.messageId) from \($r.sender)\n> \($r.line)\n"));
  def route($i):
    if .malformed then "report-only malformed"
    elif IN($skip[]; .issue) then "report-only unreadable"
    elif .repo != $repo or $i == null
      or ($verdict["\(.issue)"] // "not-task" | IN("not-task", "other-repo", "closed", "plan-item", "planning", "outline"))
      then "report-only not-a-task"
    elif ($i | complete | not) then "report-only incomplete-claim"
    elif $i.content.labels.totalCount > ($i.content.labels.nodes | length) then "blocked overflow:labels"
    elif any($i.content.labels.nodes[]; .name == "blocked") then "blocked"
    elif .sender != ($i.runThread | val) then "stop foreign-sender"
    elif .attempt != ($i.attempt | val) then "stop wrong-attempt"
    elif (.phase | rank) < ($i.runPhase | val | rank) then "handled"
    else "check" end;
  [ .[] | . as $r | (if .malformed then null else item end) as $i
    | ($claims[0]["\(.issue)"] // "") as $since
    | select(.trigger or ($i != null and $since != "" and (.at | epoch) >= ($since | epoch)))
    | . + {own: ($i != null and .sender == ($i.runThread | val) and .attempt == ($i.attempt | val)),
           answer: (if $i != null and recorded then "recorded" else route($i) end)} ]
  | (map(select(.own and .answer != "recorded")) | group_by(.issue) | map(max_by([.position, .index]) | [.messageId, .index])) as $newest
  | .[] | if .own and .answer != "recorded" and (. as $r | any($newest[]; . == [$r.messageId, $r.index]) | not)
          then .answer = "superseded" else . end
  | [.answer, (.issue // "-"), .messageId, .sender, .line] | @tsv
EOF
jq -r --arg repo <repo> --arg agent <agent> --slurpfile board <work>/board.json --slurpfile stops <work>/stops.json \
  --slurpfile claims <work>/claims.json --slurpfile skip <work>/unreadable.txt --rawfile filter <work>/filter.txt -f <work>/judge.jq <work>/reports.json > <work>/judged.tsv
```

Each line is the route, the issue, the message id, the sender id and the line. A task is an item the filter does not call `not-task`, `other-repo`, `closed`, `plan-item`, `planning` or `outline`. A complete claim is an item assigned to `<agent>`, with "Run thread" and "Attempt" set, a "Run phase" of plan, implement, closeout or care, and exactly one linked branch. The routes:

| Route | Next |
|---|---|
| `recorded` | Its stop is already recorded. One report line, nothing else. |
| `superseded` | A newer report from the "Run thread" for this attempt exists. One report line, nothing else. |
| `report-only malformed`, `report-only unreadable`, `report-only not-a-task`, `report-only incomplete-claim` | Answer `report-only`, with that reason. `unreadable`: the issue's timeline or comments could not be read; the report is judged again at the next wake. |
| `blocked`, `blocked overflow:labels` | The item is labelled `blocked`, or its labels overflow their page. Advance does not act on it: "blocked, waiting for the owner". The report stays kept, and is judged at the first wake after the label is gone. |
| `stop foreign-sender`, `stop wrong-attempt` | Answer `stop` by [Stop](#stop). |
| `handled` | Answer `handled`. |
| `check` | Go on in [Switch](#switch). |

Answer the lines one at a time, in the order of `judged.tsv`. An item that an answer of this wake stopped is not advanced by a later line of the same wake.

## Switch

Answer each judged report with the first answer that applies, in this order. Anchor: `#switch`.

| # | Answer | Applies when |
|---|---|---|
| 1 | `finish-switch` | The report is from the "Run thread" for the current "Attempt", "Run phase" is plan, and the thread already holds the apply message for this launch key and the report's `head`. |
| 2 | `stop` | The report names a complete claim, and its sender is not the "Run thread", or its attempt is not "Attempt", whatever the phase. |
| 3 | `handled` | The report is from the "Run thread" for the current "Attempt", and its phase is earlier than "Run phase". |
| 4 | `act` | Only a plan report while "Run phase" is plan, from the "Run thread" for the current "Attempt", with `seq` 1 and `head` equal to the remote head of the linked branch, on a thread that is idle within 5 minutes. |
| 5 | `not-idle` | Everything for `act` matches, but the thread still runs after 5 minutes, or the switch is refused. |
| 6 | `stop` | The report is from the "Run thread" for the current "Attempt", and its `seq` or `head` does not match, or its phase is later than "Run phase". |
| 7 | `report-only` | The line is malformed; it names an issue that is not a task on this board, or whose claim is incomplete; or it matches but its phase is not plan: "not handled in M1". |

`judged.tsv` already gives answers 2, 3 and 7 where the board read decides them. Answer 1 cannot apply to those routes: it needs the "Run thread", the current "Attempt" and a "Run phase" of plan, so no report is earlier than "Run phase". A `check` report is from the "Run thread" for the current "Attempt", and its phase is not earlier than "Run phase". For it, take these steps in order. `<run thread>`, `<attempt>`, `<branch>` (the one linked branch) and `<item id>` come from the item in `<work>/board.json`; `<head>`, `<phase>` and `<seq>` from the report. The launch key is `<repo>#<issue> attempt <attempt>`.

### 1. A half-done switch

Only when "Run phase" is plan. Read the run thread's activity, as in [Collect](#collect) but with `threadId` `<run thread>`, back to the item's claim time, into `<work>/thread-<issue>-<k>.json`. Then:

```bash
jq -s 'add' <work>/thread-<issue>-*.json > <work>/thread-<issue>.json
jq -e --arg me <conductor id> --arg key "<repo>#<issue> attempt <attempt>" --arg head <head> '
  any(.[]; .type == "user_message" and .senderThreadId == $me
      and ((.text // "") | split("\n") | map(rtrimstr("\r"))
           | index("Launch key: \($key)") != null and index("Head: \($head)") != null))' <work>/thread-<issue>.json
```

`true`: an earlier wake sent the apply message and stopped before its last write. Answer `finish-switch`: write "Run phase" implement and read it back, as in [Act](#5-act), step 4. Nothing is waited for, switched or sent.

### 2. The phase and `seq`

- The phase is later than "Run phase": answer `stop`, with the reason "phase <phase> is later than Run phase <Run phase>".
- The phase equals "Run phase", and `seq` is not the phase's place in `plan, implement, closeout, care` (plan 1, implement 2, closeout 3, care 4): answer `stop`, with the reason "seq=<seq>, but phase <phase> expects seq=<place>".

### 3. The head

Read the remote head of the linked branch:

```bash
gh api repos/<repo>/git/ref/heads/<branch> --jq .object.sha 2> <work>/err      # <remote head>
```

`gh api` exits 1 for a 404 and for every other failure alike, so tell them apart by its error output. Exit 0: the output must equal `<head>`; otherwise answer `stop`, with the reason "head <head> is not the remote head <remote head> of <branch>". A failure whose `<work>/err` holds `HTTP 404` (`grep -q 'HTTP 404' <work>/err`): answer `stop`, with the reason "<branch> has no remote head". Any other failure (a 5xx, a rate limit, the network) is never a stop: answer `report-only`, with the reason "the head could not be read", write nothing, and judge the report again at the next wake.

Then, when the phase is not plan (it equals a "Run phase" of implement or later), answer `report-only`, "not handled in M1". Nothing is written.

### 4. Wait for the thread

The report is sent from inside the reporting thread's own turn, so wait up to 5 minutes for the turn to end. Note the start:

```bash
date +%s%3N      # <t0>, in milliseconds
```

Then loop:

1. Call `t3_thread_read` with `threadId` `<run thread>` and `limit` 1. The thread is idle when `thread.activeRunId` is null, `thread.pendingBackgroundTasks` is empty and `thread.pendingRequestCount` is 0. Idle: leave the loop.
2. The remaining wait is 300000 minus (`date +%s%3N` minus `<t0>`). When it is 0 or less, answer `not-idle`.
3. Call `t3_thread_wait` with `threadId` `<run thread>` and `timeoutMs` set to the remaining wait. It may return early, with or without `timedOut`, so go back to 1 until 300000 ms have passed in total.

`not-idle` writes nothing and sends nothing. The report stays kept and is judged again at the next wake.

When the thread is idle, read the remote head again as in step 3. A moved head answers `stop`, with the reason of step 3.

### 5. Act

Do these in order. A failure stops the item here: report it with the steps that completed. The order leaves every state for a later wake to finish: before the send, it acts again; after the send, it finishes the switch.

1. **The change folder.** List the folders under `openspec/changes/` that the branch adds at `<head>`, leaving out `archive`:

   ```bash
   gh api repos/<repo>/compare/<default>...<head> --paginate --jq '.files[] | select(.status=="added") | .filename' \
     > <work>/added-<issue>.txt; echo "exit $?"
   ```

   First the read alone. An exit other than 0 is a failed read (a 404, a 5xx, a rate limit, the network): report it, write nothing, answer `report-only` with the reason "the compare could not be read", and judge the report again at the next wake. It is never a stop. Only after `exit 0`, filter the saved list:

   ```bash
   sed -nE 's#^openspec/changes/([^/]+)/.+#\1#p' <work>/added-<issue>.txt | grep -vx archive | sort -u
   ```

   It must print exactly one `<name>`. No line: answer `stop`, with the reason "the branch adds no change folder under openspec/changes/ at <head>". Several: answer `stop`, with the reason "the branch adds several change folders at <head>: <names>". Either stop comes before any switch.

2. **Switch the model.** Call `t3_thread_configure` with `threadId` `<run thread>` and `modelSelection` `<implement model>`. T3 refuses while a turn is active or a background command runs: a refusal answers `not-idle`, and nothing is written. Read back with `t3_thread_configure` with only `threadId`: its `modelSelection` has the `instanceId`, `model` and `options` of `<implement model>`.

3. **Send the apply instruction.** Call `t3_thread_send`:

   ```json
   {"threadId": "<run thread>", "message": "<the apply instruction>", "mode": "queue", "freshContext": true}
   ```

   The apply instruction is in [Instructions](#instructions), with the change folder `openspec/changes/<name>/`. Read back with the check of [step 1](#1-a-half-done-switch), which must print `true`.

4. **"Run phase" implement.** The ids come from `<work>/fields.json`:

   ```bash
   jq -r '.fields[] | select(.name == "Run phase") | .id, (.options[] | select(.name == "implement") | .id)' <work>/fields.json   # <run phase field>, <implement>
   gh project item-edit --id <item id> --project-id <project id> --field-id <run phase field> --single-select-option-id <implement>
   ```

   Read back with `reread <issue> <work>/after-<issue>.json` and the state print of [Claim](#claim): `run-phase=implement`.

Answer `act`. The report lists the item with its thread id and the change folder.

## Stop

A stop puts the label `blocked` on the issue and an agent comment that records the report. Anchor: `#stop`.

`<message id>`, `<sender id>` and `<report line>` are the report's message id, sender and trimmed line, as in `judged.tsv`. `<Run phase>` is the item's "Run phase": the phase to resume in. `<reason>` is the answer's reason, with no full stop at its end:

| Case | Reason |
|---|---|
| foreign sender | sent by thread <sender id>, not by the Run thread <run thread> |
| wrong attempt | attempt=<attempt of the report>, but Attempt is <Attempt> |
| later phase | phase <phase> is later than Run phase <Run phase> |
| `seq` | seq=<seq>, but phase <phase> expects seq=<place> |
| head | head <head> is not the remote head <remote head> of <branch>; or <branch> has no remote head |
| change folder | the branch adds no change folder under openspec/changes/ at <head>; or the branch adds several change folders at <head>: <names> |

Add the label first, then the comment:

```bash
gh issue edit <issue> --repo <repo> --add-label blocked
printf 'Run stopped by the conductor.\nReport: %s from %s\n> %s\nReason: %s. Resume in phase: %s.\n' \
  '<message id>' '<sender id>' '<report line>' '<reason>' '<Run phase>' > <work>/stop-<issue>.md
gh issue comment <issue> --repo <repo> --body-file <work>/stop-<issue>.md
```

The comment reads:

```text
Run stopped by the conductor.
Report: <message id> from <sender id>
> <report line>
Reason: <reason>. Resume in phase: <Run phase>.
```

Read both back: the labels hold `blocked` (`gh issue view <issue> --repo <repo> --json labels --jq '.labels[].name'`), and the comments read of [Recorded stops](#recorded-stops), run again for this issue, makes the judge script print the report as `recorded`. The comment is the record: a later wake drops this report, whether or not the label is still there. When only the label was written, a later wake sees the item as blocked; after the owner removes the label, it judges the report again and writes the comment.

When Preflight could not create the label `blocked`, write neither: report the stop with its comment text, for the owner.

The report lists every stop with the issue, the reason and the phase to resume in.

## Instructions

The texts sent to a task thread, verbatim. Replace only the placeholders. `<sha of your pushed commit>` in the start instruction is not a placeholder of the conductor: leave it as written, for the thread to fill. Anchor: `#instructions`.

### Start

Sent as the `message` of the launch in [Claim](#claim):

```text
Use the task-run skill to run this task.

Issue: https://github.com/<repo>/issues/<issue>
Launch key: <repo>#<issue> attempt 1
Attempt: 1
Branch: <branch>
Conductor thread: <conductor id>

This worktree is on the branch <branch>. Work only on it, and push with `git push -u origin HEAD`. When the planning files are pushed, send these two lines to the conductor thread, in queue mode with a fresh context, with head set to the sha of your pushed commit:

phase-done <repo>#<issue> attempt=1 phase=plan seq=1 head=<sha of your pushed commit>
Run one wake of the project-conductor skill for this repository.
```

### Apply

Sent with `t3_thread_send` in [Switch](#switch), in queue mode with a fresh context. `<attempt>` is the item's "Attempt", `<head>` the report's `head`, and `<name>` the change folder found at that head:

```text
Use the task-run skill to run the phase implement of this task.

Issue: https://github.com/<repo>/issues/<issue>
Launch key: <repo>#<issue> attempt <attempt>
Phase: implement
Branch: <branch>
Head: <head>
Conductor thread: <conductor id>
Change folder: openspec/changes/<name>/

Start from these files; nothing from earlier turns is available.
This worktree is on the branch <branch>, at <head> or later. Read the change folder, implement it by the repository's own process through to its pull request, and push with `git push -u origin HEAD`.
```

[Switch](#switch) finds this message again by its lines `Launch key:` and `Head:`, so send them exactly as written.
