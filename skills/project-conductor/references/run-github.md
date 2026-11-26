# Run a wake: GitHub commands

The commands of one wake of the conductor, one section per step. Everything goes through the `gh` command line tool, `jq` and the T3 MCP tools. The commands below were checked against GitHub with `gh` 2.105. If a flag is missing in your version, check `gh <command> --help` before changing the approach.

A wake is a message to the conductor thread that ends with "Run one wake of the project-conductor skill for this board." The old sentence "Run one wake of the project-conductor skill for this repository." is accepted the same way, so threads started before the change keep reporting. The message may start with one `Trigger: webhook.` or `Trigger: timer.` line, or with one phase report line. The board is never taken from the message: it comes from the conductor thread's own title (see [Identity](#identity)).

A wake has no served repository. The conductor serves one board, and the board's issues may belong to several repositories. Each item names its own repository, and every command for that item uses it.

Placeholders:

| Placeholder | Meaning |
|---|---|
| `<board URL>` | The board's URL, from the conductor thread's own title: `https://github.com/users/<board owner>/projects/<n>` or `https://github.com/orgs/<board owner>/projects/<n>`. |
| `<board owner>`, `<n>` | The board's owner and number, from `<board URL>`. |
| `<root>` | `user` when `<board URL>` has `/users/`, `organization` when it has `/orgs/`. |
| `<agent>` | The agent's login, from Preflight. |
| `<conductor id>` | The conductor thread's own id, from Preflight. |
| `<project id>` | The board's node id, from Preflight. |
| `<repo>` | **This item's** repository as `owner/name`: its `content.repository.nameWithOwner` in `<work>/board.json`. Never the conductor's checkout. |
| `<owner>`, `<name>` | The two halves of `<repo>`. `<owner>` is the repository owner's login. |
| `<default>` | `<repo>`'s default branch, from `<work>/repos.json`. |
| `<project of repo>` | The T3 `projectId` for `<repo>`, from `<work>/repos.json`. |
| `<issue>` | The number of one issue on the board. An issue is named by `<repo>#<issue>`, never by its number alone: two repositories of the board may both have an issue 5. |
| `maxParallel`, `maxAttempts` | The numbers of `<work>/settings.json`, from the [settings block](#settings-block). |
| `<plan model>`, `<implement model>` | A `modelSelection` object `{instanceId, model, options}`, from Models. |
| `<work>` | A folder of this wake in the scratchpad, such as `<scratchpad>/wake`. Every saved file goes here. A file of one item is named with `<owner>-<name>-<issue>`, such as `claim-<owner>-<name>-<issue>.json`. |

Always pass `--repo <repo>` to `gh issue`, `gh pr` and `gh label`, with the item's own `<repo>`. Without it, `gh` resolves against the current checkout, which may be another repository, or none.

## Preflight

Read all of this before Repair, Settle, Advance and Start. Run the parts in this order: [Identity](#identity), [The board](#the-board) (its fields), the [Board](#board) read, the [Settings block](#settings-block) with the second half of the identity check, then [Repositories](#repositories). The [Ready filter](#ready-filter) runs last, on the board read and `<work>/repos.json`. Anchor: `#preflight`.

- **An identity failure** means the wake writes nothing at all: no Repair, no Settle, no Advance, no Start. The report names the fix.
- **A wake-wide gap** means Advance and Start write nothing in this wake, and the report names the gap and its owner step. The wake-wide gaps are: `gh` not logged in or without the `project` scope, a missing or misnamed board field or option, a failed board read, and any `gap` line of the [settings block](#settings-block).
- **A repository finding** of [Repositories](#repositories) (a repository that cannot be read, no push permission, no T3 project or several) is not wake-wide. It stops only the starts of that repository's items: they are reported, and the items of other repositories go on. Advance, Repair and Settle follow their own rules for them.
- **A failed `t3_project_list`** is a gap for Start only: no task can be launched without a project, so Start writes nothing in this wake. Advance needs no project and goes on.

Run every read anyway, so one report lists all gaps. Preflight writes nothing.

### Identity

The conductor is named by its own title, `project-conductor <board URL>`, and by the `conductor` key of the board readme's [settings block](#settings-block). This part reads the title and takes the board from it. Anchor: `#identity`.

```bash
gh auth status                                   # logged in, and the token scopes include "project"
gh api user --jq .login                          # <agent>
```

Then read the conductor's own thread:

1. Call the T3 tool `t3_thread_configure` with no arguments. Its `threadId` is `<conductor id>`.
2. Call `t3_thread_read` with `threadId` `<conductor id>` and `limit` 1. Write its `thread.title` to `<work>/title.txt`, as is.

Check the title against the exact form and take the board from it:

```bash
mkdir -p <work>
# "<root> <board owner> <n>"; no output: the title does not have the exact form
sed -nE 's#^project-conductor https://github\.com/(users|orgs)/([^/ ]+)/projects/([0-9]+)$#\1 \2 \3#p' <work>/title.txt \
  | sed -e 's/^users /user /' -e 's/^orgs /organization /'
```

The whole title must match: one space after `project-conductor`, no trailing slash, nothing before or after. `<board URL>` is the title with `project-conductor ` removed.

| Result | Owner step |
|---|---|
| `gh auth status` fails, or lacks the `project` scope | Gap: "Log the agent account in to `gh` with the `project` scope (`gh auth refresh -s project`)." |
| `t3_thread_configure` or `t3_thread_read` fails | Identity failure: "The conductor could not read its own thread: <error>." |
| the `sed` prints nothing | Identity failure: "Rename this thread to `project-conductor <board URL>`, exactly, with `t3_thread_update`, or run the onboarding procedure of project-conductor in it." Name the title as read. |

An identity failure stops the wake here, except for the report. The other half of the check, the readme block's `conductor`, is in [Settings block](#settings-block).

### The board

Read the board's fields with their options, then check the names exactly, case included:

```bash
gh project view <n> --owner <board owner> --format json --jq .id      # <project id>
gh project field-list <n> --owner <board owner> --limit 100 --format json > <work>/fields.json
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

### Settings block

The conductor's settings are one fenced `text` block after the line `<!-- project-conductor -->` in the board readme, as onboarding writes it. The [Board](#board) read saves the readme to `<work>/readme.json`. Anchor: `#settings-block`.

````markdown
<!-- project-conductor -->
```text
conductor: <conductor thread id>
maxParallel: 2
reviewRounds: 5
reconcileMinutes: 30
maxAttempts: 2
model.plan: claudeAgent/claude-opus-5-5#medium
model.review: opencode/openai/gpt-6.2-sol#medium
model.implement: opencode/ollama-cloud/deepseek-v4.1-flash:1017#high
```
````

The parser splits the readme on `\n`, with one `\r` at each line's end removed. It finds the line that is the marker, trimmed. After it, it takes the first line that starts with ```` ``` ```` as the opening fence, and the next line that is ```` ``` ```` alone as the closing one. Every non-empty line between them, trimmed, is split at its first `: `: before it the key, after it the value. A line that ends in `:` has an empty value. Text before the marker and after the block is never read.

````bash
cat > <work>/settings.jq <<'EOF'
def strip: gsub("^\\s+|\\s+$"; "");
def defaults: {"maxParallel": 2, "reviewRounds": 5, "reconcileMinutes": 30, "maxAttempts": 2};
def known: ["conductor", "model.plan", "model.review", "model.implement"] + (defaults | keys_unsorted);
((.readme // "") | split("\n") | map(rtrimstr("\r"))) as $lines
| [range(0; $lines | length) | select($lines[.] | strip == "<!-- project-conductor -->")] as $marks
| (if ($marks | length) == 1 then $marks[0] else null end) as $m
| (if $m == null then null
   else first(range($m + 1; $lines | length) | select($lines[.] | strip | startswith("```"))) // null end) as $open
| (if $open == null then null
   else first(range($open + 1; $lines | length) | select($lines[.] | strip == "```")) // null end) as $close
| (if $close == null then []
   else $lines[$open + 1:$close] | map(strip | select(. != "") | (. + " ") as $l | ($l | index(": ")) as $i
     | if $i == null then {key: ., value: null} else {key: ($l[:$i] | strip), value: ($l[$i + 2:] | strip)} end) end) as $e
| def values($k): [$e[] | select(.key == $k) | .value];
  def one($k): values($k) | if length == 1 and .[0] != "" then .[0] else null end;
  def num($k): values($k)
    | if length == 0 then defaults[$k]
      elif length == 1 and (.[0] | test("^[1-9][0-9]*$"))
           and ($k != "reconcileMinutes" or (.[0] | tonumber) <= 1440) then .[0] | tonumber
      else null end;
  { settings: {conductor: one("conductor"),
               maxParallel: num("maxParallel"), reviewRounds: num("reviewRounds"),
               reconcileMinutes: num("reconcileMinutes"), maxAttempts: num("maxAttempts"),
               model: {plan: one("model.plan"), review: one("model.review"), implement: one("model.implement")}},
    gaps: [ (select(($marks | length) == 0) | "missing-marker"),
            (select(($marks | length) > 1) | "two-markers"),
            (select($m != null and $close == null) | "missing-block"),
            ($e[] | select(.key | IN(known[]) | not) | "unknown-key:\(.key)"),
            ($e | group_by(.key)[] | select(length > 1 and (.[0].key | IN(known[]))) | "repeated-key:\(.[0].key)"),
            ($e[] | select(.key | IN(defaults | keys_unsorted[])) | (.value // "") as $v
              | if .key == "reconcileMinutes" and ($v | test("^[0-9]+$")) then
                  select(($v | tonumber) < 1 or ($v | tonumber) > 1440) | "out-of-range:reconcileMinutes=\($v) (1 to 1440)"
                else select($v | test("^[1-9][0-9]*$") | not) | "not-a-positive-integer:\(.key)=\($v)" end),
            (select($close != null and one("conductor") == null and (values("conductor") | length) < 2) | "missing-conductor") ] }
EOF
jq -f <work>/settings.jq <work>/readme.json > <work>/settings-parsed.json
jq .settings <work>/settings-parsed.json > <work>/settings.json
jq -r '.gaps[] | "gap \(.)"' <work>/settings-parsed.json            # any line is a gap; no output: the block passes
````

`<work>/settings.json` holds `{conductor, maxParallel, reviewRounds, reconcileMinutes, maxAttempts, model: {plan, review, implement}}`:

- **A missing number** takes its default: `maxParallel` 2, `reviewRounds` 5, `reconcileMinutes` 30, `maxAttempts` 2.
- **A repeated or invalid key** is `null`, never its default. A malformed block is never read as defaults.
- **A missing model line** is `null`. It is resolved, or reported, in [Models](#models), only for the role a step uses.
- **`conductor`** is written whenever it appears exactly once with a value, even when the block has other gaps, so that the identity check, Repair and Settle can run. With two markers no block is read, and `conductor` is `null`.

| Output line | Gap, owner step |
|---|---|
| `gap missing-marker` | "Add the line `<!-- project-conductor -->` and its settings block to the board readme: run the onboarding procedure of project-conductor." |
| `gap missing-block` | "Add a fenced `text` block after `<!-- project-conductor -->` in the board readme, opened with ```` ```text ```` and closed with ```` ``` ````." |
| `gap two-markers` | "The board readme holds `<!-- project-conductor -->` more than once: keep one marker and its block." |
| `gap unknown-key:<key>` | "Remove or correct the line `<key>` in the board readme block. The keys are `conductor`, `maxParallel`, `reviewRounds`, `reconcileMinutes`, `maxAttempts`, `model.plan`, `model.review` and `model.implement`." |
| `gap repeated-key:<key>` | "The board readme block holds `<key>` more than once: keep one line." |
| `gap not-a-positive-integer:<key>=<value>` | "Set `<key>` in the board readme block to a whole number of 1 or more." |
| `gap out-of-range:reconcileMinutes=<value> (1 to 1440)` | "Set `reconcileMinutes` in the board readme block to a whole number from 1 to 1440." |
| `gap missing-conductor` | "Add `conductor: <conductor id>` to the board readme block, or run the onboarding procedure of project-conductor in this thread." |

Every `gap` line is a settings gap: Advance and Start write nothing in this wake.

**The second half of the identity check.** The block's `conductor` must equal this thread's own id:

```bash
jq -r --arg me <conductor id> 'if .conductor == $me then "identity ok" else "identity: conductor is \(.conductor // "missing")" end' <work>/settings.json
```

Any line other than `identity ok` is an identity failure: the wake writes nothing, and Repair and Settle do not run either, because another thread may own the board. When `conductor` names another thread, the report names that thread and gives the fix: correct the block to `conductor: <conductor id>`, or wake the thread it names instead. When it is missing, the report gives the owner step of `gap missing-conductor`, or of the block's own gap.

### Repositories

The board's items may belong to several repositories. For each repository of an issue on the board, read its default branch, the agent's permission and its T3 project, once per wake, into `<work>/repos.json`. Anchor: `#repositories`.

```bash
set -o pipefail
jq -r '[.[] | select(.content.__typename == "Issue") | .content.repository.nameWithOwner] | unique[]' \
  <work>/board.json > <work>/repos.txt
for r in $(cat <work>/repos.txt); do
  gh api "repos/$r" --jq '{default: .default_branch, admin: .permissions.admin, push: .permissions.push, owner: .owner.login}' \
    | jq -c --arg r "$r" '{repo: $r} + .' \
    || { echo "unreadable repository $r" >&2; jq -nc --arg r "$r" '{repo: $r, default: null, admin: null, push: null, owner: null}'; }
done | jq -s . > <work>/repos-gh.json
```

Then list every T3 project: call the T3 tool `t3_project_list` with `limit` 100, and again with `cursor` set to the answer's `nextCursor` while it is not null. Write each answer to `<work>/t3-projects-<k>.json`, with `<k>` 1, 2, …, as is. A failed call, on any page, is a gap for Start only: "The T3 projects could not be listed: <error>." Start writes nothing in this wake; Advance goes on. Then replace the saved pages with one empty list (`echo '{"projects": []}' > <work>/t3-projects-1.json`, after removing the other pages), so that a partial list is never matched and the filter still runs. Then build `<work>/repos.json`:

```bash
jq -s '[.[].projects[] | select(.deletedAt == null)]' <work>/t3-projects-*.json > <work>/t3-projects.json
jq -n --slurpfile gh <work>/repos-gh.json --slurpfile p <work>/t3-projects.json '
  [ $gh[0][] | .repo as $r | ("github.com/" + $r | ascii_downcase) as $k
    | [$p[0][] | select((.repositoryIdentity.canonicalKey // "" | ascii_downcase) == $k) | .id] as $ids
    | {key: $r, value: (del(.repo) + {projectId: (if ($ids | length) == 1 then $ids[0] else null end), projectIds: $ids})} ]
  | from_entries' > <work>/repos.json
```

`<work>/repos.json` is `{"<repo>": {default, admin, push, owner, projectId, projectIds}}`. `<project of repo>` is its `projectId`, and `<default>` its `default`.

- **The T3 project** of `<repo>` is the one whose `repositoryIdentity.canonicalKey` equals `github.com/<repo>`, compared after `ascii_downcase`, because GitHub names ignore case. A project with no `repositoryIdentity`, or a deleted one, never matches.
- **No such project:** `projectId` is `null` and `projectIds` is empty. The Ready filter prints `skip no-project:<repo>` for the repository's Ready items. Repair and Settle still cover them, because they need no checkout.
- **Several such projects:** `projectId` is `null`, and `projectIds` lists them. This is a gap for that repository only: the Ready filter prints `skip gap:projects:<repo>` for its Ready items.

These findings are per repository, never wake-wide: each stops only the starts of that repository's items, which are reported with the owner step below, while the items of other repositories go on.

| Result | Repository finding, owner step |
|---|---|
| `unreadable repository <repo>` | "Give the agent account read access to `<repo>`." Its items are not started: [Claim](#look-before-claiming) skips them before any write. |
| `push` is not `true` | "Give the agent account write access to `<repo>`." Its items are not started: Claim skips them before any write. |
| `projectIds` is empty | Not a gap of the wake. Report each `no-project:<repo>` item with: "Add a T3 project for a checkout of `<repo>`." |
| `projectIds` has more than one id | "`<repo>` has several T3 projects: <ids>. Keep one." Its Ready items print `skip gap:projects:<repo>`. |

The label `blocked` is not read here. It is created per repository, the first time a stop there needs it: see [The label `blocked`](#the-label-blocked).

## Models

Resolve a model line of the [settings block](#settings-block) into the `modelSelection` that `t3_thread_launch` and `t3_thread_configure` take. Resolve only the roles the step uses: plan for Start, implement for Advance. Never resolve review in a wake. Anchor: `#models`.

The cell of a role is `.model.<role>` in `<work>/settings.json`: the value of the line `model.<role>` of the board readme block. It is `<providerInstanceId>/<model id>#<effort>`.

1. **Split.** Split the cell at the first `/` and at the last `#`: before the `/` `<providerInstanceId>`, between them `<model id>`, after the `#` `<effort>`. A model id may hold more `/`, and more `#`. `opencode/ollama-cloud/deepseek-v4.1-flash:1017#high` is instance `opencode`, model `ollama-cloud/deepseek-v4.1-flash:1017`, effort `high`. A cell with no `/`, no `#` after the `/`, or an empty part is a bare name: do not call the host. `Opus-5.5` is bare.

   ```bash
   # "<providerInstanceId><TAB><model id><TAB><effort>", or "missing" or "bare <cell>"
   jq -r --arg role plan '.model[$role] as $c
     | if $c == null then "missing"
       else ($c | index("/")) as $s | ($c | rindex("#")) as $h
       | if $s == null or $h == null or $h < $s then "bare \($c)"
         else [$c[:$s], $c[$s + 1:$h], $c[$h + 1:]]
         | if any(.[]; . == "") then "bare \($c)" else join("\t") end end end' <work>/settings.json
   ```

2. **Search.** Call the T3 tool `orchestrator_capabilities` with `search` set to `<model id>`. Without `search`, every provider lists no models. The search is a substring search: the answer for `gpt-6.2-sol` also holds `gpt-6.2-sol-fast`.
3. **Match exactly.** In the answer, take the provider whose `providerInstanceId` equals the cell's, and in its `models` the one whose `id` equals `<model id>`, character for character. A label is never compared. No such provider, or no such model: no match.
4. **Pick the effort option.** Of the model's `options`, take the one option whose `values` include `<effort>`. The id of that option differs by provider: `effort` (Claude), `variant` (OpenCode), `thought_level` (Antigravity). Take the id from the answer, never from this list. Options with boolean values, such as `fastMode`, never include an effort string. No option includes it, or more than one does: unsupported effort.
5. **Build.** The result is:

   ```json
   {"instanceId": "<providerInstanceId>", "model": "<model id>", "options": [{"id": "<option id>", "value": "<effort>"}]}
   ```

   Nothing else is put in `options`.

The three model lines of the scratch board resolve like this:

| Cell | `modelSelection` |
|---|---|
| `claudeAgent/claude-opus-5-5#medium` | `{"instanceId": "claudeAgent", "model": "claude-opus-5-5", "options": [{"id": "effort", "value": "medium"}]}` |
| `opencode/openai/gpt-6.2-sol#medium` | `{"instanceId": "opencode", "model": "openai/gpt-6.2-sol", "options": [{"id": "variant", "value": "medium"}]}` |
| `opencode/ollama-cloud/deepseek-v4.1-flash:1017#high` | `{"instanceId": "opencode", "model": "ollama-cloud/deepseek-v4.1-flash:1017", "options": [{"id": "variant", "value": "high"}]}` |

The model `ollama-cloud/deepseek-v4.1-flash:1017` offers `variant` with `low`, `high` and `max`, so the effort `xhigh` would be an unsupported effort.

When a step is not taken, the report has one line for it, with the role and the cell as written in the block. A model is never substituted: no other model of the provider, no model of the conductor's own thread, no other effort.

| Case | Report line, owner step |
|---|---|
| missing | "The `model.<role>` line of the board readme block is missing: add `model.<role>: <providerInstanceId>/<model id>#<effort>`." |
| bare name | "The `model.<role>` line of the board readme block, `<cell>`, is not provider-qualified: write it as `<providerInstanceId>/<model id>#<effort>`." |
| no match | "The `model.<role>` line of the board readme block, `<cell>`, names a model that instance `<providerInstanceId>` does not offer: change it to a model the host lists." |
| unsupported effort | "The `model.<role>` line of the board readme block, `<cell>`, asks for the effort `<effort>`; the model offers `<values of its options>`: change the effort." |

A role that is not resolved stops its step: a plan model gap stops Start, an implement model gap stops Advance. The other step goes on. A model gap is not a settings gap: it stops only its step.

## Board

Read every page of the board once, before the steps. The read gives the board readme to the [Settings block](#settings-block) and the repositories to [Repositories](#repositories). Then run the [Ready filter](#ready-filter) on it once, before Advance: the [Judge](#judge) script reads `<work>/filter.txt` and `<work>/board.json`. Every later step judges this read; Claim reads one issue again just before its first write. Anchor: `#board`.

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
  number title state closedAt body
  repository { nameWithOwner owner { login } }
  milestone { number state }
  author { login }
  assignees(first: 10) { totalCount nodes { login } }
  labels(first: 20) { totalCount nodes { name } }
  blockedBy(first: 50) { totalCount nodes { number state stateReason } }
  linkedBranches(first: 10) { totalCount nodes { ref { name } } }
  closedByPullRequestsReferences(first: 10, includeClosedPrs: true) {
    totalCount nodes { number isCrossRepository headRefName headRepository { nameWithOwner } authorAssociation author { login } mergedAt } }
  userContentEdits(first: 100) { totalCount nodes { editor { login } deletedAt } }
}
EOF
```

Save the board query. Replace `<root>` with `user` when `<board URL>` has `/users/`, and with `organization` when it has `/orgs/`, as [Identity](#identity) prints it. The alias `owner` keeps the path of the answer the same for both:

```bash
cat > <work>/board.graphql <<'EOF'
query($login: String!, $number: Int!, $cursor: String) {
  owner: <root>(login: $login) { projectV2(number: $number) {
    readme
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

Read page by page while `hasNextPage` is true, then join the pages into `<work>/board.json`, an array of items. The readme of the first page goes to `<work>/readme.json`:

```bash
set -o pipefail
: > <work>/board.jsonl; : > <work>/readme.json; cursor=""; ok=1
while :; do
  gh api graphql -f query="$(cat <work>/board.graphql <work>/fragments.graphql)" \
    -f login=<board owner> -F number=<n> ${cursor:+-f cursor="$cursor"} > <work>/page.json \
    && jq -e '.errors == null and .data.owner.projectV2 != null' <work>/page.json > /dev/null \
    || { ok=0; cat <work>/page.json; break; }
  [ -s <work>/readme.json ] || jq '{readme: .data.owner.projectV2.readme}' <work>/page.json > <work>/readme.json
  jq -c '.data.owner.projectV2.items.nodes[]' <work>/page.json >> <work>/board.jsonl
  cursor=$(jq -r '.data.owner.projectV2.items.pageInfo | if .hasNextPage then .endCursor else "" end' <work>/page.json)
  [ -n "$cursor" ] || break
done
[ "$ok" = 1 ] && jq -s . <work>/board.jsonl > <work>/board.json && echo "board read"
```

No `board read` line: the read failed. Advance and Start write nothing in this wake, and the report names the error as a gap. A partial board is never judged. Without the readme there is no `conductor` either, so the identity check fails and the wake writes nothing.

Each item holds its `id` (the item id that `gh project item-edit --id` takes), its `type`, `isArchived` (true for an item archived on the board; a missing value counts as false), the five field values (`status`, `phase`, `runPhase`, `attempt`, `runThread`; `null` when unset) and its `content`. An issue's `content.repository.nameWithOwner` is its `<repo>`, and `content.repository.owner.login` its `<owner>`. A draft item has `content.__typename` `DraftIssue` and no number. Every nested list has `totalCount` beside its `nodes`, so a list longer than its page is seen.

Blockers are read with their `stateReason`, but the reason is not used: a blocker closed as not planned counts as closed, like one closed as completed.

## Ready filter

The filter prints one line per board item: `<repo>#<issue> start` or `<repo>#<issue> skip <reason>`, such as `a/x#5 start`. An item is always named with its repository, because two repositories of the board may both have an issue 5. An item without a repository and number (a draft item) prints its item id in place of `<repo>#<issue>`. Anchor: `#ready-filter`.

It decides **Ready** first, from exactly three conditions: the item is a task in the monitored project, it has no open blocker, and its Status is "Ready". Only on a Ready item does it check the item's repository in `<work>/repos.json` (`no-project`, `gap:projects`) and then apply the start guards, in this order: overflow, taken, trust. Nothing else decides readiness. The filter never reads the label `blocked`, a blocker's close reason or the "Ready to start when" text; that text is read only to word the reason `waiting-for-ready`, on an item that is not Ready anyway.

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
def not_ready:
  .content as $c
  | if .isArchived == true then "not-task"
    elif $c == null or $c.__typename != "Issue" then "not-task"
    elif $c.state != "OPEN" then "closed"
    elif ($c | firstline | test("^<!-- plan: [a-z0-9-]+/[a-z0-9-]+ -->$")) then "plan-item"
    elif ($c | firstline | test("^<!-- task: [a-z0-9-]+/[a-z0-9-]+/[0-9]+ -->$") | not) then "not-task"
    elif (.phase | val) == "Planning" then "planning"
    elif (.phase | val) == "Outline" then "outline"
    elif any($c.blockedBy.nodes[]; .state == "OPEN") then "blocker-open"
    elif (.status | val) == "Ready" then null
    elif (.status | val) == "Backlog" and ($c | condition) then "waiting-for-ready"
    else "not-ready" end;
def project:
  .content.repository.nameWithOwner as $r | ($repos[0][$r].projectIds // []) as $ids
  | if ($ids | length) == 0 then "no-project:\($r)" elif ($ids | length) > 1 then "gap:projects:\($r)" else null end;
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
def trusted($agent):
  .content.repository.owner.login as $owner
  | .content | ([.author.login] + [.userContentEdits.nodes[].editor.login]) as $logins
  | .userContentEdits.totalCount == (.userContentEdits.nodes | length)
    and all(.userContentEdits.nodes[]; .deletedAt == null)
    and all($logins[]; . != null and (. == $agent or . == $owner));
.[] | (if .content.repository.nameWithOwner != null and .content.number != null
         then "\(.content.repository.nameWithOwner)#\(.content.number)" else .id end) + " " + (
  if not_ready != null then "skip \(not_ready)"
  elif project != null then "skip \(project)"
  elif (overflow | length) > 0 then "skip overflow:\(overflow | join(","))"
  elif (taken | length) > 0 then "skip taken:\(taken | join(","))"
  elif trusted($agent) | not then "skip untrusted"
  else "start" end)
EOF
jq -r --arg agent <agent> --slurpfile repos <work>/repos.json -f <work>/filter.jq <work>/board.json > <work>/filter.txt
```

- **Task key.** The first line is the body up to the first `\n`, with one `\r` at its end removed, matched whole, as in [onboarding, Markers](onboarding-github.md#markers). A malformed key line is `not-task`, like a missing one.
- **Start condition.** `condition` is the `hasStartCondition` pattern of `scripts/project-ready.mts`: a `**Ready to start when:**` paragraph whose text, trimmed, lower-cased and without trailing dots, is not empty, `no conditions` or `none`.
- **Overflow.** A nested list whose `totalCount` is larger than its `nodes` holds facts the read did not return, so the item is not started. Its reason lists the lists, such as `overflow:blockedBy`. An edit history longer than its page is `untrusted` instead, by the trust rule.
- **Taken by a pull request.** A closing pull request makes the item taken when `isCrossRepository` is false, or its `authorAssociation` is `OWNER`, `MEMBER` or `COLLABORATOR`. A fork pull request by anyone else is ignored. A thread titled with the launch key also makes an item taken; the filter cannot see threads, so [Claim](#claim) checks it.
- **Repository.** The filter reads `<work>/repos.json` of [Repositories](#repositories). A Ready item whose repository has no T3 project is `no-project:<repo>`; one whose repository has several is `gap:projects:<repo>`. Both are printed even when no slot is free, so the report names them. A repository missing from `repos.json` counts as one with no project.
- **Trust** is the rule of [onboarding, Trust](onboarding-github.md#trust): the author and every editor of the body are `<agent>` or `<owner>`, the owner of **that issue's** repository (`content.repository.owner.login`), and the edit history is complete, with no deleted edit and no editor that cannot be identified. The board read gives `totalCount` in place of `hasNextPage`: a history with more edits than it returned is untrusted.

Reasons, and what the report says for each:

| Reason | Report |
|---|---|
| `not-task` | Not a task: an item archived on the board (`isArchived` true; say "archived"), a pull request, a draft item, or an issue without a task key. Not handled. |
| `plan-item` | A plan item. Not handled yet. |
| `planning`, `outline` | Phase Planning or Outline. Planning items are not handled yet. |
| `closed` | The issue is closed. |
| `blocker-open` | Blocked by the open issues the details command below names. |
| `not-ready` | Status is not "Ready". |
| `waiting-for-ready` | In Backlog with a "Ready to start when" condition: waiting for a person to set Ready. |
| `no-project:<repo>` | Ready, but `<repo>` has no T3 project. Not started: "Add a T3 project for a checkout of `<repo>`." |
| `gap:projects:<repo>` | Ready, but `<repo>` has several T3 projects; name their ids from `<work>/repos.json`. Not started until one is kept. |
| `overflow:<list>` | Ready, but these lists have more entries than the read returned. Not started. |
| `taken:<what>` | Ready, but taken: `assignee`, `run-thread`, `attempt`, `run-phase`, `branch` or `pr`, or `thread` from [Claim](#claim). Name them with the details command, or the thread id. |
| `untrusted` | Ready, but untrusted. Name the reason with the wording of [onboarding, Trust](onboarding-github.md#trust), from the author and editors the details command prints. |

The details of one item, for the report:

```bash
jq -r --arg r <repo> --argjson n <issue> '.[] | select(.content.repository.nameWithOwner == $r and .content.number == $n) | .content
  | "open blockers: \([.blockedBy.nodes[] | select(.state == "OPEN") | "#\(.number)"] | join(" "))",
    "assignees: \([.assignees.nodes[].login] | join(" "))",
    "branches: \([.linkedBranches.nodes[].ref.name] | join(" "))",
    "pull requests: \([.closedByPullRequestsReferences.nodes[] | "#\(.number) \(.author.login // "?") \(.authorAssociation) cross=\(.isCrossRepository)"] | join(", "))",
    "author: \(.author.login // "unknown"); editors: \([.userContentEdits.nodes[] | (.editor.login // "unknown") + (if .deletedAt then " (deleted)" else "" end)] | join(" ")); edits \(.userContentEdits.totalCount)"' <work>/board.json
```

A Ready task whose only blocker was closed as not planned prints `start`, when nothing else stops it. On the scratch board (project 5 of `raidenyn-shadow`), `raidenyn-shadow/task-run-scratch#17` is such a task.

The fixtures in `openspec/changes/conductor-owns-the-board/evidence/fixtures/` pin the per-repository keys: on `board-two-repos.json` with `repos-two.json`, the filter prints exactly `a/x#5 start` and `b/y#5 skip not-ready`.

## Repair

Repair finds claims that a wake left half-made, and finishes or undoes them. It runs first, in every wake that passes the identity check of [Preflight](#preflight), also when the [settings block](#settings-block) has a gap: it needs no setting. It needs the board read whole. Anchor: `#repair`.

Every line of Repair goes to `<work>/repair.tsv`, one per item, as `<repo>#<issue>\t<action>\t<detail>`. Every write that succeeds also runs `touch <work>/wrote`. Save the re-read query and `reread` of [Look before claiming](#look-before-claiming) first: Repair uses them too.

### Repair scope

Repair covers each open board issue that is not archived on the board, whose whole first line is a task key, and that is assigned to `<agent>` or has a non-empty "Run thread". An issue without a key is never touched. An issue labelled `blocked` is not repaired, but it is listed:

```bash
cat > <work>/repair-scope.jq <<'EOF'
def firstline: (.body // "") | (split("\n")[0] // "") | rtrimstr("\r");
.[] | select(.isArchived != true and .content.__typename == "Issue" and .content.state == "OPEN")
| select(.content | firstline | test("^<!-- task: [a-z0-9-]+/[a-z0-9-]+/[0-9]+ -->$"))
| (any(.content.assignees.nodes[]; .login == $agent)) as $mine
| ((.runThread.text // "") != "") as $run
| select($mine or $run or .content.assignees.totalCount > (.content.assignees.nodes | length))
| "\(.content.repository.nameWithOwner)#\(.content.number) " + (
    if .content.labels.totalCount > (.content.labels.nodes | length) then "skip overflow:labels"
    elif any(.content.labels.nodes[]; (.name | ascii_downcase) == "blocked") then "skip blocked"
    elif ($mine or $run) | not then "skip overflow:assignees"
    else "repair" end)
EOF
jq -r --arg agent <agent> -f <work>/repair-scope.jq <work>/board.json > <work>/repair-scope.txt
```

Only the `repair` lines are repaired. A `skip blocked` item gets no record, no release and no stop: write `<repo>#<issue>\tskip\tblocked, waiting for the owner` to `repair.tsv`. A `skip overflow:<list>` item is unknown: its labels or assignees have more entries than the read returned, so it is skipped and reported.

The fixture `openspec/changes/conductor-owns-the-board/evidence/fixtures/board-repair.json` holds four items. With `--arg agent raidenyn-shadow`, the scope prints exactly `a/x#1 repair`, `a/x#3 skip blocked` and `a/x#4 repair`: `a/x#1` is keyed and assigned, `a/x#2` is assigned without a key, `a/x#3` is keyed, assigned and `blocked`, and `a/x#4` is keyed with a "Run thread" and no assignee.

### The facts of one item

```bash
jq -r --arg r <repo> --argjson n <issue> '.[] | select(.content.repository.nameWithOwner == $r and .content.number == $n)
  | "item=\(.id) run-thread=\(.runThread.text // "") attempt=\(.attempt.number // "") status=\(.status.name // "")",
    "launch-key=\($r)#\($n) attempt \(.attempt.number // 1)",
    "branches=\(.content.linkedBranches.totalCount) \([.content.linkedBranches.nodes[].ref.name] | join(" "))",
    "pull-requests=\([.content.closedByPullRequestsReferences.nodes[] | select(.isCrossRepository == false) | "#\(.number)"] | join(" "))"' <work>/board.json
```

The launch key is `<repo>#<issue> attempt <Attempt, or 1 when empty>`, as the second line prints it.

### Decide

Take the first row that applies. The thread lookups:

- **"Run thread" set.** Call `t3_thread_read` with `threadId` the "Run thread" and `limit` 1. Only the error code `thread_not_found` means the thread is missing. Any other error is unknown. On an answer, read `thread.archived` and `thread.title`.
- **"Run thread" empty.** Call `t3_thread_search` with `query` the launch key, `projectId` `<project of repo>` and `limit` 50. An error is unknown. An answer with 50 `matches` is unknown too, because more may exist. The exact matches are the `matches[]` whose `title` equals the launch key, character for character.

| # | Found | Action in `repair.tsv` |
|---|---|---|
| 1 | `<project of repo>` is `null`: the repository has no T3 project, or several | `report-only`, "no T3 project for `<repo>`" or "several T3 projects for `<repo>`: <ids>". Never searched without a `projectId`, never released, never stopped. When `t3_project_list` failed, the detail is "the T3 projects could not be listed". A repository whose `default` is `null` (it cannot be read) is `report-only` too |
| 2 | linked branches overflow their page, whatever "Run thread" holds | `unknown`, "linked branches overflow" |
| 3 | more than one linked branch, whatever "Run thread" holds | `stopped`, reason "several linked branches: <names>" |
| 4 | "Run thread" set; the read fails with another error than `thread_not_found` | `unknown`, with the error |
| 5 | "Run thread" set; the thread exists, `archived` is false, and its title is the launch key | `ok`: nothing is written. A live thread whose branch has no commit yet is left alone |
| 6 | "Run thread" set; `thread_not_found`, `archived` true, or another title | `stopped`: [Stop without a report](#stop-without-a-report), reason "Run thread <id> is missing", "Run thread <id> is archived" or "Run thread <id> is titled <title>, not <launch key>" |
| 7 | "Run thread" empty; the search fails or returns 50 matches | `unknown`, with the error or "50 matches" |
| 8 | "Run thread" empty; more than one exact match | `stopped`, reason "several threads have the launch key <launch key>: <ids>" |
| 9 | "Run thread" empty; one exact match | `recorded`: [Record the thread](#record-the-thread) |
| 10 | "Run thread" empty; no exact match; no linked branch, and a closing pull request that is not cross-repository | `stopped`, reason "work without a thread" |
| 11 | "Run thread" empty; no exact match; no linked branch and no such pull request | `released`: [Release](#release), without its first write |
| 12 | "Run thread" empty; no exact match; one linked branch | run the two [branch checks](#release). Both print `0`: `released`. Either prints more: `stopped`, reason "work without a thread". Either fails: `unknown`, with the error |

"No match" can still be wrong, because the search is not exhaustive. A release is safe anyway: Start launches with `clientRequestId` set to the launch key, which returns the existing thread instead of a second one, and the launch's read-back then records it.

**Look before the first write.** Before the first write of a `recorded`, `released` or `stopped` item, read it again with `reread <owner> <name> <issue> <work>/repair-<owner>-<name>-<issue>.json`. The scope must still print `repair` for it, and these facts must equal the board read: "Run thread", "Attempt", "Run phase", Status, the assignees and the linked branches:

```bash
facts='map({runThread, attempt, runPhase, status, a: [.content.assignees.nodes[].login], b: [.content.linkedBranches.nodes[].ref.name]})'
diff <(jq -S --arg r <repo> --argjson n <issue> "[.[] | select(.content.repository.nameWithOwner == \$r and .content.number == \$n)] | $facts" <work>/board.json) \
     <(jq -S "$facts" <work>/repair-<owner>-<name>-<issue>.json)                    # must print nothing
jq -r --arg agent <agent> -f <work>/repair-scope.jq <work>/repair-<owner>-<name>-<issue>.json   # must print "<repo>#<issue> repair"
```

A failed read, a difference, or another line: `unknown`, "changed during the wake". Nothing is written.

A failed write or read-back stops that item, never the wake: write `failed` with the writes that completed and the one that failed, and go on with the next item. The writes that completed stay, and the next wake's Repair continues from them.

### Record the thread

Write the one exact match's `threadId` into "Run thread", with the field id of [Writes](#writes):

```bash
gh project item-edit --id <item id> --project-id <project id> --field-id <run thread field> --text <threadId>
```

Read back with `reread` and the state print of [Writes](#writes): `run-thread=<threadId>`. No thread is launched.

### Release

A release undoes a claim that has no thread. Anchor: `#release`.

**The branch checks** come first, for the one linked branch `<branch>`. Both must print `0`:

```bash
gh api repos/<repo>/compare/<default>...<branch> --jq .ahead_by                  # commits beyond its base
gh api "repos/<repo>/pulls?state=all&head=<owner>:<branch>" --jq length          # pull requests from it
```

Then make the six writes in this order. Read each one back before the next; the read-back runs `reread <owner> <name> <issue> <work>/after-<owner>-<name>-<issue>.json` and the state print of [Writes](#writes). A write whose field already holds its target is skipped, so a release that a wake left part-way is finished by the next one. The ids come from `<work>/fields.json`, as in [Writes](#writes), and `<ready>` is:

```bash
jq -r '.fields[] | select(.name == "Status") | .options[] | select(.name == "Ready") | .id' <work>/fields.json   # <ready>
```

1. Delete the empty branch, which drops its link. Only after both branch checks printed `0`, and only when the item has a linked branch. Read back: `gh api repos/<repo>/git/ref/heads/<branch>` fails with `HTTP 404`, and `branches=` no longer holds `<branch>`.

   ```bash
   gh api -X DELETE repos/<repo>/git/refs/heads/<branch>
   ```

2. Clear "Run phase". Read back: `run-phase=null`.

   ```bash
   gh project item-edit --id <item id> --project-id <project id> --field-id <run phase field> --clear
   ```

3. Clear "Attempt". Read back: `attempt=null`.

   ```bash
   gh project item-edit --id <item id> --project-id <project id> --field-id <attempt field> --clear
   ```

4. Status "Ready", only when it is "In progress". Read back: `status=Ready`.

   ```bash
   gh project item-edit --id <item id> --project-id <project id> --field-id <status field> --single-select-option-id <ready>
   ```

5. Clear "Run thread". Read back: `run-thread=null`.

   ```bash
   gh project item-edit --id <item id> --project-id <project id> --field-id <run thread field> --clear
   ```

6. Remove the agent from the assignees, last. Read back: `assignees=` no longer holds `<agent>`.

   ```bash
   gh issue edit <issue> --repo <repo> --remove-assignee <agent>
   ```

A wake that dies part-way leaves the agent assigned, so the issue stays in the scope, and the next wake's Repair finishes the release. A released item that is Ready is judged by Start in the same wake, on the [board read again](#read-again).

When the board has a gap of [The board](#the-board), such as a missing Status option "Ready" or a missing run field, a write that needs it is not made: the item is `failed`, with that gap.

## Settle

Settle finds a task whose pull request has merged, and settles its thread. It runs after Repair, under the same identity check, also when the settings block has a gap. Anchor: `#settle`.

Every line of Settle goes to `<work>/settle.tsv`, one per item, as `<repo>#<issue>\t<action>\t<detail>`. Every write that succeeds also runs `touch <work>/wrote`.

### Settle scope

Settle covers each board issue with a non-empty "Run thread" that is open, or that was closed in the last 7 days:

```bash
jq -r '(now - 7 * 86400) as $since
  | .[] | select(.content.__typename == "Issue" and ((.runThread.text // "") != ""))
  | select(.content.state == "OPEN"
           or (.content.closedAt != null and (.content.closedAt | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) >= $since))
  | "\(.content.repository.nameWithOwner) \(.content.number) \(.runThread.text)"' <work>/board.json > <work>/settle-scope.txt
```

### Per item

Take the items one at a time. `<run thread>` is the third column.

1. **The thread.** Call `t3_thread_read` with `threadId` `<run thread>` and `limit` 1. An error is `unknown`, with the error; `thread_not_found` is `skip`, "Run thread <id> is missing" (Repair stops an open item for it). `<branch>` is `thread.branch`, and `<settled>` is `thread.settled`. An empty or missing `branch` is `skip`, "the thread has no branch": the API ignores an empty `head` filter, so it would return every pull request.
2. **The merged pull request.** Look on GitHub, by the branch:

   ```bash
   f=<owner>-<name>-<issue>
   gh api "repos/<repo>/pulls?state=closed&head=<owner>:<branch>" --jq '[.[] | select(.merged_at != null and .head.repo.full_name == "<repo>" and .head.ref == "<branch>")]' \
     > <work>/merged-$f.json; echo "exit $?"
   ```

   Then look at the thread's `pullRequests`: for each entry that names a pull request of `<repo>`, read it with `gh api repos/<repo>/pulls/<number> --jq '[.] | map(select(.merged_at != null and .head.repo.full_name == "<repo>" and .head.ref == "<branch>"))'`, and add the answer to the same file (`jq -s add`). An exit other than 0, on any lookup, is `unknown`, "the pull requests could not be read": skip the item, never read it as none. Keep only the pull requests whose author is the agent or has the association `OWNER`, `MEMBER` or `COLLABORATOR`:

   ```bash
   jq -r --arg agent <agent> '[.[] | select(.user.login == $agent or (.author_association | IN("OWNER", "MEMBER", "COLLABORATOR")))]
     | unique_by(.number) | if length == 0 then "none" else "merged \(map(.merged_at) | max) \(map("#\(.number)") | join(" "))" end' <work>/merged-$f.json
   ```

   `none`: write `none` to `settle.tsv`. Nothing is written. A pull request without `Closes` is found too.
3. **Read the issue again,** and decide by its state:

   ```bash
   gh issue view <issue> --repo <repo> --json state,labels \
     --jq '"state=\(.state) blocked=\(any(.labels[]; (.name | ascii_downcase) == "blocked"))"'
   ```

   A failed read is `unknown`. Then:
   - **Closed:** go on to step 4.
   - **Open, merged less than 5 minutes ago** (the newest `merged_at` against `date -u +%s`): `wait`. Nothing is written; the next wake looks again, since GitHub may not have closed the issue yet.
   - **Open, merged earlier:** one task, one issue, one pull request was broken. Unless `blocked=true`, write [Stop without a report](#stop-without-a-report) with `Step: Settle.` and the reason "merged without closing its issue". A failed stop write ends the item here: the thread is not settled, so the next wake tries again. Then go on to step 4.
4. **Settle the thread,** unless `<settled>` is already true: call `t3_thread_organize` with `action` `settle` and `threadId` `<run thread>`. Read back with `t3_thread_read`: `thread.settled` is true.

Step 3 runs whatever the thread's state, so a wake that died between settling and labelling is finished by the next one. Nothing else on the board changes. The actions are `settled`, `already-settled`, `labelled` (with the settle that followed), `wait`, `none`, `skip`, `unknown` and `failed`.

## Read again

When `<work>/wrote` exists, Repair or Settle changed the board. Read the board again, as in [Board](#board), into the same `<work>/board.json`, and run the [Ready filter](#ready-filter) again into `<work>/filter.txt`, before the end-of-board check, Advance and Start. `<work>/repos.json` is kept. A failed read again is a failed board read: Advance and Start write nothing in this wake. Without `<work>/wrote`, the first read stands. Anchor: `#read-again`.

## Claim

Claim the `start` lines of the filter in the order of [Slots](#slots), while a slot is free. Before the first write of each item, check its repository, read it again and search for its thread. Every command of one item uses that item's `<repo>`, `<owner>`, `<name>`, `<default>` and `<project of repo>`. Anchor: `#claim`.

### Slots

In use is every open board issue that is not archived on the board and is assigned to `<agent>` or has a non-empty "Run thread", whatever its Status and repository. An issue whose assignees overflow their page counts as in use:

```bash
jq -r --arg agent <agent> '[.[] | select(.isArchived != true and .content.__typename == "Issue" and .content.state == "OPEN")
  | select(any(.content.assignees.nodes[]; .login == $agent)
           or .content.assignees.totalCount > (.content.assignees.nodes | length)
           or ((.runThread.text // "") != ""))] | length' <work>/board.json      # <in use>
grep ' start$' <work>/filter.txt | cut -d' ' -f1 | LC_ALL=C sort -t'#' -k1,1f -k2,2n   # the candidates, in order
```

The candidates are taken in ascending order of repository `nameWithOwner`, compared without case, then issue number: `a/x#7` comes before `b/y#1`, and `a/x#7` before `a/x#12`.

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

reread() {   # reread <owner> <name> <issue> <out>: the issue's item on this board, in the shape of board.json
  gh api graphql -f query="$(cat <work>/reread.graphql <work>/fragments.graphql)" \
    -f owner="$1" -f name="$2" -F n="$3" > "$4.raw" \
  && jq -e '.errors == null and (.data.repository.issue.projectItems | .totalCount == (.nodes | length))' "$4.raw" > /dev/null \
  && jq --arg p <project id> '.data.repository.issue as $i
       | [$i.projectItems.nodes[] | select(.project.id == $p) | del(.project) + {content: ($i | del(.projectItems))}]' \
       "$4.raw" > "$4"
}
```

First check the item's repository, the one guard Claim keeps from [Repositories](#repositories). Its entry in `<work>/repos.json` must have a `default` and `push` `true`, and its `projectId` must still exist: call the T3 tool `t3_project_read` with `projectId` `<project of repo>`. A `null` `projectId`, or an answer that says the project is not found or is deleted, skips the item as `no-project:<repo>`, before any write. A missing `default` or `push` skips it with the gap of [Repositories](#repositories). Any other error of `t3_project_read` skips it too, as "the T3 project of `<repo>` could not be read", with the error.

Then read the item again and compare it with the board read, leaving out the labels (they do not decide readiness) and the edit ids (the board read has none). Then run the filter on it:

```bash
reread <owner> <name> <issue> <work>/claim-<owner>-<name>-<issue>.json
diff <(jq -S --arg r <repo> --argjson n <issue> '[.[] | select(.content.repository.nameWithOwner == $r and .content.number == $n)
                                                   | del(.content.labels)]' <work>/board.json) \
     <(jq -S 'map(del(.content.labels) | del(.content.userContentEdits.nodes[].id))' <work>/claim-<owner>-<name>-<issue>.json)   # must print nothing
jq -r --arg agent <agent> --slurpfile repos <work>/repos.json -f <work>/filter.jq \
  <work>/claim-<owner>-<name>-<issue>.json                                    # must print "<repo>#<issue> start"
```

The comparison covers Status, the run fields, assignees, blockers, linked branches, closing pull requests, the body with its task key, and the edit history. A failed read, any difference, or a line other than `start` skips the item: "changed during the wake", with the difference. Keep the edit ids of `claim-<owner>-<name>-<issue>.json`: they name the body that was claimed.

Then search for the item's thread. The launch key is `<repo>#<issue> attempt 1`, such as `raidenyn-shadow/task-run-scratch#15 attempt 1`. Call the T3 tool `t3_thread_search` with `query` set to the launch key and `projectId` set to `<project of repo>`, the T3 project of the item's own repository. The search matches titles by word prefix, so `#1 attempt 1` also finds `#15 attempt 1`, and a longer title holding the key is found too: compare every `matches[].title` with the launch key exactly. A match whose title equals the launch key makes the item taken: skip it as `taken:thread`, with the thread id. The search skips archived threads.

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
    "\($type)/\(.content.number)" + (if $slug == "" then "" else "-\($slug)" end) end' <work>/claim-<owner>-<name>-<issue>.json   # <branch>
```

`R1: add a greeting function` (#15, Phase Feature) gives `feat/15-r1-add-a-greeting-function`. A title made only of symbols or non-Latin text gives `feat/15`.

Each read-back runs `reread <owner> <name> <issue> <work>/after-<owner>-<name>-<issue>.json` and prints the claim's state:

```bash
jq -r '.[0] | "assignees=\([.content.assignees.nodes[].login] | join(",")) status=\(.status.name)",
  "attempt=\(.attempt.number) run-phase=\(.runPhase.name) run-thread=\(.runThread.text)",
  "branches=\([.content.linkedBranches.nodes[].ref.name] | join(","))"' <work>/after-<owner>-<name>-<issue>.json
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

5. Create and link the branch from `<repo>`'s default branch, `<default>` from `<work>/repos.json`. Read back: `branches` holds `<branch>`, and the remote branch has a head.

   ```bash
   gh issue develop <issue> --repo <repo> --name <branch> --base <default>
   gh api repos/<repo>/git/ref/heads/<branch> --jq .object.sha
   ```

6. Launch the thread with the T3 tool `t3_thread_launch`, on the branch just created, in `<project of repo>`, the T3 project of the item's repository:

   ```json
   {"title": "<repo>#<issue> attempt 1",
    "message": "<the start instruction>",
    "projectId": "<project of repo>",
    "modelSelection": <plan model>,
    "workspaceStrategy": {"type": "worktree", "baseRef": "origin/<branch>", "branch": "<branch>", "startFromOrigin": true},
    "clientRequestId": "<repo>#<issue> attempt 1"}
   ```

   The start instruction is in [Instructions](#instructions). `clientRequestId` is the launch key as is: a repeated launch with the same key returns the same thread, so after an error or a lost answer, launch again with the same arguments. The answer holds `threadId`. Read back with `t3_thread_read` on that id: `title` is the launch key and `branch` is `<branch>`.

7. "Run thread". Read back: `run-thread=<threadId>`.

   ```bash
   gh project item-edit --id <item id> --project-id <project id> --field-id <run thread field> --text <threadId>
   ```

`<item id>` is the item's `id` in `claim-<owner>-<name>-<issue>.json`. A claimed item ends with the agent as assignee, Status "In progress", "Attempt" 1, "Run phase" plan, a linked branch, and the thread id in "Run thread". Its thread's title is the launch key, and its project is the repository's T3 project. The report lists it with its thread id.

## Reports

Advance judges phase reports. Collect them, drop the ones already stopped, keep the newest per item, then answer each one by [Switch](#switch). Anchor: `#reports`.

Advance runs only when Preflight has no [wake-wide gap](#preflight), the board was read whole by [Board](#board), and the implement model resolves by [Models](#models). Otherwise it answers no report and writes and sends nothing: its report line names the gap, and every report is judged again at the next wake.

### What a report is

A report is a line of an incoming message from another thread. In `t3_thread_read` with `view: "activity"`, such a message is an item with `type` `user_message` and a `senderThreadId`. `senderThreadId` is the sender. `sourceThreadId` is the thread that holds the item, not the sender, and is never used. A message without `senderThreadId` (typed by a person) holds no report, and neither does a message whose `senderThreadId` is `<conductor id>`.

Each line of the text is trimmed of white space at both ends, then matched whole against:

```text
^phase-done ([^/ ]+/[^# ]+)#([0-9]+) attempt=([0-9]+) phase=(plan|implement|closeout|care) seq=([0-9]+) head=([0-9a-f]{40})\r?$
```

The groups are the repository, the issue, the attempt, the phase, `seq` and `head`. Any other line that contains `phase-done` is malformed: it is answered `report-only`, with the reason malformed, and is never matched in part. So a `head` of 7 characters, two spaces between fields, or the fields in another order is malformed; a line with a trailing CR, or with spaces around it, matches.

A report is named by its message id and its line. One message may hold more than one report line.

### The items in a run

An item in a run is an open board issue that is not archived on the board and has a non-empty "Run thread". Its claim time is the latest `assigned` event by `<agent>` that assigned `<agent>`, from the issue's timeline. Write the claim times to `<work>/claims.json`, keyed by `<repo>#<issue>`; an issue whose timeline holds no such event gets an empty time:

```bash
set -o pipefail
: > <work>/unreadable.txt
jq -r '.[] | select(.isArchived != true and .content.__typename == "Issue" and .content.state == "OPEN"
  and ((.runThread.text // "") != "")) | "\(.content.repository.nameWithOwner) \(.content.number)"' <work>/board.json > <work>/running.txt
while read -r r i; do
  f="$(echo "$r" | tr / -)-$i"
  gh api "repos/$r/issues/$i/timeline" --paginate \
    --jq '.[] | select(.event == "assigned" and .actor.login == "<agent>" and .assignee.login == "<agent>") | .created_at' \
    > "<work>/timeline-$f.txt" || { echo "unreadable timeline $r#$i" >&2; echo "$r#$i" >> <work>/unreadable.txt; continue; }
  jq -n --arg k "$r#$i" --arg t "$(sort "<work>/timeline-$f.txt" | tail -n 1)" '{($k): $t}'
done < <work>/running.txt | jq -s 'add // {}' > <work>/claims.json
```

An issue with an empty time has no kept reports in this wake; only the triggering message can still name it. An `unreadable timeline` line also puts the issue in `<work>/unreadable.txt`, one `<repo>#<issue>` per line: none of its reports is judged in this wake (see [Judge](#judge)). Say both in the report.

### Collect

Read the conductor's own incoming messages: call `t3_thread_read` with `threadId` `<conductor id>`, `view` `"activity"`, `limit` 100 and `maxCharsPerItem` 20000. Write each answer's `items` to `<work>/inbox-<k>.json`, with `<k>` 1, 2, …. The answer is newest first: for the next page, call again with `beforePosition` set to the answer's `earlierPosition`. Stop when `earlierPosition` is null, or when the oldest item of the page has an `updatedAt` earlier than the earliest time in `claims.json`. With no time in `claims.json`, read only the first page. An item with `textTruncated` true is read on with `itemId` and `textOffset` set to its `nextTextOffset`, and its text is joined before the parse.

A message that ends with the old sentence "Run one wake of the project-conductor skill for this repository." counts the same as one that ends with the new sentence: its report lines are collected and judged alike.

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

A stop is recorded by its comment (see [Stop](#stop)). Read the agent's comments on every issue of the board that the reports name, each in its own repository:

```bash
set -o pipefail
jq -r --slurpfile board <work>/board.json '[.[] | select(.malformed == false) | . as $r
    | select(any($board[0][]; .content.__typename == "Issue"
                 and .content.repository.nameWithOwner == $r.repo and .content.number == $r.issue))
    | "\(.repo) \(.issue)"] | unique[]' <work>/reports.json > <work>/named.txt
while read -r r i; do
  gh api "repos/$r/issues/$i/comments" --paginate --jq '.[] | select(.user.login == "<agent>") | {body}' \
    | jq -s --arg r "$r" --argjson i "$i" 'map({repo: $r, issue: $i, body: (.body | gsub("\r"; ""))})' \
    || { echo "unreadable comments $r#$i" >&2; echo "$r#$i" >> <work>/unreadable.txt; }
done < <work>/named.txt | jq -s 'add // []' > <work>/stops.json
```

A report that names an issue not on the board reads no comments: the judge routes it `report-only not-a-task`.

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
| ($skip | split("\n") | map(select(. != ""))) as $unreadable
| def item: . as $r | first($items[] | select(.isArchived != true and .content.__typename == "Issue"
      and .content.repository.nameWithOwner == $r.repo and .content.number == $r.issue)) // null;
  def branch: .content as $c
    | if $c.linkedBranches.totalCount == 1 then $c.linkedBranches.nodes[0].ref.name
      elif $c.linkedBranches.totalCount == 0
           and $c.closedByPullRequestsReferences.totalCount == ($c.closedByPullRequestsReferences.nodes | length) then
        [$c.closedByPullRequestsReferences.nodes[]
         | select(.isCrossRepository == false and .headRepository.nameWithOwner == $c.repository.nameWithOwner) | .headRefName]
        | unique | if length == 1 then .[0] else null end
      else null end;
  def complete: any(.content.assignees.nodes[]; .login == $agent)
      and (.runThread | val | . != null and . != "") and (.attempt | val) != null
      and (.runPhase | val | rank) != null and branch != null;
  def recorded: . as $r | any($stops[0][] | select(.repo == $r.repo and .issue == $r.issue);
      .body | contains("Report: \($r.messageId) from \($r.sender)\n> \($r.line)\n"));
  def route($i):
    if .malformed then "report-only malformed"
    elif IN($unreadable[]; "\(.repo)#\(.issue)") then "report-only unreadable"
    elif $i == null
      or ($verdict["\(.repo)#\(.issue)"] // "not-task" | IN("not-task", "closed", "plan-item", "planning", "outline"))
      then "report-only not-a-task"
    elif ($i | complete | not) then "report-only incomplete-claim"
    elif $i.content.labels.totalCount > ($i.content.labels.nodes | length) then "blocked overflow:labels"
    elif any($i.content.labels.nodes[]; (.name | ascii_downcase) == "blocked") then "blocked"
    elif .sender != ($i.runThread | val) then "stop foreign-sender"
    elif .attempt != ($i.attempt | val) then "stop wrong-attempt"
    elif (.phase | rank) < ($i.runPhase | val | rank) then "handled"
    else "check" end;
  [ .[] | . as $r | (if .malformed then null else item end) as $i
    | ($claims[0]["\(.repo)#\(.issue)"] // "") as $since
    | select(.trigger or ($i != null and $since != "" and (.at | epoch) >= ($since | epoch)))
    | . + {own: ($i != null and .sender == ($i.runThread | val) and .attempt == ($i.attempt | val)),
           branch: (if $i == null then null else $i | branch end),
           answer: (if $i != null and recorded then "recorded" else route($i) end)} ]
  | (map(select(.own and .answer != "recorded")) | group_by([.repo, .issue]) | map(max_by([.position, .index]) | [.messageId, .index])) as $newest
  | .[] | if .own and .answer != "recorded" and (. as $r | any($newest[]; . == [$r.messageId, $r.index]) | not)
          then .answer = "superseded" else . end
  | [.answer, (if .malformed then "-" else "\(.repo)#\(.issue)" end), .messageId, .sender, .line, (.branch // "-")] | @tsv
EOF
jq -r --arg agent <agent> --slurpfile board <work>/board.json --slurpfile stops <work>/stops.json \
  --slurpfile claims <work>/claims.json --rawfile skip <work>/unreadable.txt --rawfile filter <work>/filter.txt -f <work>/judge.jq <work>/reports.json > <work>/judged.tsv
```

Each line is the route, the issue as `<repo>#<issue>` (`-` for a malformed line), the message id, the sender id, the line and the claimed branch (`-` when there is none). Every verdict is looked up by `<repo>#<issue>`, so a report for `b/y#5` is never judged by the facts of `a/x#5`. A task is an item the filter does not call `not-task`, `closed`, `plan-item`, `planning` or `outline`. A complete claim is an item assigned to `<agent>`, with "Run thread" and "Attempt" set, a "Run phase" of plan, implement, closeout or care, and a claimed branch.

The claimed branch is the item's one linked branch. GitHub unlinks that branch as soon as a pull request from it names the issue with a closing keyword, so when no branch is linked, the claimed branch is the `headRefName` of the closing pull requests that are not cross-repository and whose head repository is the issue's own `<repo>`, when they all name the same one. More than one linked branch, two such pull requests on different branches, none of either, or a list of closing pull requests that overflows its page leaves no claimed branch: the claim is incomplete. The start guard `taken` is unchanged: a linked branch or a trusted closing pull request already makes an item taken. The routes:

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
| 4 | `act` | Only a plan report while "Run phase" is plan, from the "Run thread" for the current "Attempt", with `seq` 1 and `head` equal to the remote head of the claimed branch, on a thread that is idle within 5 minutes. |
| 5 | `not-idle` | Everything for `act` matches, but the thread still runs after 5 minutes, or the switch is refused. |
| 6 | `stop` | The report is from the "Run thread" for the current "Attempt", and its `seq` or `head` does not match, or its phase is later than "Run phase". |
| 7 | `report-only` | The line is malformed; it names an issue that is not a task on this board, or whose claim is incomplete; or it matches but its phase is not plan: "not handled in M1". |

`judged.tsv` already gives answers 2, 3 and 7 where the board read decides them. Answer 1 cannot apply to those routes: it needs the "Run thread", the current "Attempt" and a "Run phase" of plan, so no report is earlier than "Run phase". A `check` report is from the "Run thread" for the current "Attempt", and its phase is not earlier than "Run phase". For it, take these steps in order. `<run thread>`, `<attempt>`, `<item id>` come from the item in `<work>/board.json`, and `<branch>` is the claimed branch, the last column of `judged.tsv`; `<head>`, `<phase>` and `<seq>` from the report. The launch key is `<repo>#<issue> attempt <attempt>`.

### 1. A half-done switch

Only when "Run phase" is plan. Read the run thread's activity, as in [Collect](#collect) but with `threadId` `<run thread>`, back to the item's claim time, into `<work>/thread-<owner>-<name>-<issue>-<k>.json`. Then:

```bash
jq -s 'add' <work>/thread-<owner>-<name>-<issue>-*.json > <work>/thread-<owner>-<name>-<issue>.json
jq -e --arg me <conductor id> --arg key "<repo>#<issue> attempt <attempt>" --arg head <head> '
  any(.[]; .type == "user_message" and .senderThreadId == $me
      and ((.text // "") | split("\n") | map(rtrimstr("\r"))
           | index("Launch key: \($key)") != null and index("Head: \($head)") != null))' <work>/thread-<owner>-<name>-<issue>.json
```

`true`: an earlier wake sent the apply message and stopped before its last write. Answer `finish-switch`: write "Run phase" implement and read it back, as in [Act](#5-act), step 4. Nothing is waited for, switched or sent.

### 2. The phase and `seq`

- The phase is later than "Run phase": answer `stop`, with the reason "phase <phase> is later than Run phase <Run phase>".
- The phase equals "Run phase", and `seq` is not the phase's place in `plan, implement, closeout, care` (plan 1, implement 2, closeout 3, care 4): answer `stop`, with the reason "seq=<seq>, but phase <phase> expects seq=<place>".

### 3. The head

Read the remote head of the claimed branch:

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
   gh api repos/<repo>/compare/<default>...<head> --paginate --jq '.files[]? | select(.status=="added") | .filename' \
     > <work>/added-<owner>-<name>-<issue>.txt; echo "exit $?"
   ```

   First the read alone. An exit other than 0 is a failed read (a 404, a 5xx, a rate limit, the network): report it, write nothing, answer `report-only` with the reason "the compare could not be read", and judge the report again at the next wake. It is never a stop. Only after `exit 0`, filter the saved list:

   ```bash
   sed -nE 's#^openspec/changes/([^/]+)/.+#\1#p' <work>/added-<owner>-<name>-<issue>.txt | grep -vx archive | sort -u
   ```

   It must print exactly one `<change>`. No line: answer `stop`, with the reason "the branch adds no change folder under openspec/changes/ at <head>". Several: answer `stop`, with the reason "the branch adds several change folders at <head>: <names>". Either stop comes before any switch.

2. **Switch the model.** Call `t3_thread_configure` with `threadId` `<run thread>` and `modelSelection` `<implement model>`. T3 refuses while a turn is active or a background command runs: a refusal answers `not-idle`, and nothing is written. Read back with `t3_thread_configure` with only `threadId`: its `modelSelection` has the `instanceId`, `model` and `options` of `<implement model>`.

3. **Send the apply instruction.** Call `t3_thread_send`:

   ```json
   {"threadId": "<run thread>", "message": "<the apply instruction>", "mode": "queue", "freshContext": true}
   ```

   The apply instruction is in [Instructions](#instructions), with the change folder `openspec/changes/<change>/`. Read back with the check of [step 1](#1-a-half-done-switch), which must print `true`.

4. **"Run phase" implement.** The ids come from `<work>/fields.json`:

   ```bash
   jq -r '.fields[] | select(.name == "Run phase") | .id, (.options[] | select(.name == "implement") | .id)' <work>/fields.json   # <run phase field>, <implement>
   gh project item-edit --id <item id> --project-id <project id> --field-id <run phase field> --single-select-option-id <implement>
   ```

   Read back with `reread <owner> <name> <issue> <work>/after-<owner>-<name>-<issue>.json` and the state print of [Claim](#claim): `run-phase=implement`.

Answer `act`. The report lists the item with its thread id and the change folder.

## Stop

A stop puts the label `blocked` on the issue and an agent comment that records the report. A stop of Repair or Settle has no report: it uses [Stop without a report](#stop-without-a-report). Anchor: `#stop`.

`<message id>`, `<sender id>` and `<report line>` are the report's message id, sender and trimmed line, as in `judged.tsv`. `<Run phase>` is the item's "Run phase": the phase to resume in. `<reason>` is the answer's reason, with no full stop at its end:

| Case | Reason |
|---|---|
| foreign sender | sent by thread <sender id>, not by the Run thread <run thread> |
| wrong attempt | attempt=<attempt of the report>, but Attempt is <Attempt> |
| later phase | phase <phase> is later than Run phase <Run phase> |
| `seq` | seq=<seq>, but phase <phase> expects seq=<place> |
| head | head <head> is not the remote head <remote head> of <branch>; or <branch> has no remote head |
| change folder | the branch adds no change folder under openspec/changes/ at <head>; or the branch adds several change folders at <head>: <names> |

Make sure the label exists in `<repo>`, as in [The label `blocked`](#the-label-blocked). Then add the label first, then the comment:

```bash
gh issue edit <issue> --repo <repo> --add-label blocked
printf 'Run stopped by the conductor.\nReport: %s from %s\n> %s\nReason: %s. Resume in phase: %s.\n' \
  '<message id>' '<sender id>' '<report line>' '<reason>' '<Run phase>' > <work>/stop-<owner>-<name>-<issue>.md
gh issue comment <issue> --repo <repo> --body-file <work>/stop-<owner>-<name>-<issue>.md
```

The comment reads:

```text
Run stopped by the conductor.
Report: <message id> from <sender id>
> <report line>
Reason: <reason>. Resume in phase: <Run phase>.
```

Read both back: the labels hold `blocked` (`gh issue view <issue> --repo <repo> --json labels --jq '.labels[].name | ascii_downcase'`), and the comments read of [Recorded stops](#recorded-stops), run again for this issue, makes the judge script print the report as `recorded`. The comment is the record: a later wake drops this report, whether or not the label is still there. When only the label was written, a later wake sees the item as blocked; after the owner removes the label, it judges the report again and writes the comment.

When the label `blocked` could not be read or created in `<repo>`, write neither: report the stop with its comment text, for the owner.

The report lists every stop with the issue, the reason and the phase to resume in.

### Stop without a report

Repair and Settle stop an item that needs the owner, but they answer no report, so their comment names the step instead. Anchor: `#stop-without-a-report`.

`<Step>` is `Repair` or `Settle`, and `<reason>` is the reason of [Repair](#decide) or [Settle](#per-item), with no full stop at its end. Make sure the label exists in `<repo>`, as in [The label `blocked`](#the-label-blocked). Then add the label first, then the comment:

```bash
gh issue edit <issue> --repo <repo> --add-label blocked
printf 'Run stopped by the conductor.\nStep: %s.\nReason: %s.\n' '<Step>' '<reason>' > <work>/stop-<owner>-<name>-<issue>.md
gh issue comment <issue> --repo <repo> --body-file <work>/stop-<owner>-<name>-<issue>.md
```

The comment reads:

```text
Run stopped by the conductor.
Step: <Repair | Settle>.
Reason: <reason>.
```

Read both back. The labels hold `blocked`, as in [Stop](#stop). The agent's comments hold one whose body starts with `Run stopped by the conductor.\nStep: ` with its `Step:` and `Reason:` lines:

```bash
gh api repos/<repo>/issues/<issue>/comments --paginate \
  --jq '.[] | select(.user.login == "<agent>") | .body | gsub("\r"; "") | select(startswith("Run stopped by the conductor.\nStep: "))' \
  > <work>/stops-<owner>-<name>-<issue>.txt
grep -qxF 'Reason: <reason>.' <work>/stops-<owner>-<name>-<issue>.txt && grep -qxF 'Step: <Step>.' <work>/stops-<owner>-<name>-<issue>.txt && echo "stop recorded"
```

Only the label suppresses a repeat: Repair skips an item labelled `blocked`, and Settle does not label it again. A failed write or read-back stops that item, never the wake. When the label `blocked` could not be read or created in `<repo>`, write neither: report the stop with its comment text, for the owner.

### The label `blocked`

A stop that needs the owner puts the label `blocked` on the issue, in the issue's own repository. The label is not read in Preflight. Before the first stop in a repository in this wake, read the label there, and create it only when it is missing. Remember the answer per repository for the rest of the wake. Anchor: `#the-label-blocked`.

```bash
f="$(echo <repo> | tr / -)"
gh api repos/<repo>/labels/blocked --jq .name > "<work>/label-$f.txt" 2> "<work>/label-$f.err"; echo "exit $?"
```

The lookup ignores case, so a label `Blocked` is found too. `exit 0`: the label exists. Another exit with `HTTP 404` in `<work>/label-<owner>-<name>.err`: the label is missing. Any other failure leaves it unknown: do not create it, and report it as a gap with the error, like a failed create below. Wherever this reference checks an issue for the label `blocked`, it compares the names lower-cased.

Missing: create it:

```bash
gh label create blocked --repo <repo> --color B60205 --description "Waiting for the owner"
```

Read the label again: the lookup must now print `exit 0`. When the create fails, report it as a gap: "Create the label `blocked` in `<repo>`, or give the agent account write access." Then every stop in `<repo>` in this wake is reported in place of being written, with its comment text, for the owner. Stops in other repositories go on.

## Instructions

The texts sent to a task thread, verbatim. Replace only the placeholders; `<repo>` is the item's own repository and `<board URL>` the board of [Identity](#identity). `<sha of your pushed commit>` in the start instruction is not a placeholder of the conductor: leave it as written, for the thread to fill. Anchor: `#instructions`.

### Start

Sent as the `message` of the launch in [Claim](#claim):

```text
Use the task-run skill to run this task.

Issue: https://github.com/<repo>/issues/<issue>
Launch key: <repo>#<issue> attempt 1
Attempt: 1
Branch: <branch>
Board: <board URL>
Conductor thread: <conductor id>

This worktree is on the branch <branch>. Work only on it, and push with `git push -u origin HEAD`. When the planning files are pushed, send these two lines to the conductor thread, in queue mode with a fresh context, with head set to the sha of your pushed commit:

phase-done <repo>#<issue> attempt=1 phase=plan seq=1 head=<sha of your pushed commit>
Run one wake of the project-conductor skill for this board.
```

### Apply

Sent with `t3_thread_send` in [Switch](#switch), in queue mode with a fresh context. `<branch>` is the claimed branch of [Judge](#judge), `<attempt>` the item's "Attempt", `<head>` the report's `head`, and `<change>` the change folder found at that head:

```text
Use the task-run skill to run the phase implement of this task.

Issue: https://github.com/<repo>/issues/<issue>
Launch key: <repo>#<issue> attempt <attempt>
Phase: implement
Branch: <branch>
Head: <head>
Board: <board URL>
Conductor thread: <conductor id>
Change folder: openspec/changes/<change>/

Start from these files; nothing from earlier turns is available.
This worktree is on the branch <branch>, at <head> or later. Read the change folder, implement it by the repository's own process through to its pull request, and push with `git push -u origin HEAD`.
```

[Switch](#switch) finds this message again by its lines `Launch key:` and `Head:`, so send them exactly as written.
