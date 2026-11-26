# Onboard a board: GitHub commands

The commands of the procedure in [SKILL.md](../SKILL.md), one section per step. Everything goes through the `gh` command line tool, `jq` and the T3 MCP tools. The commands below were checked against GitHub with `gh` 2.105. If a flag is missing in your version, check `gh <command> --help` before changing the approach.

Each section gives the read command first, then the condition for writing, then the write command. A dry run runs only the reads. Several reads are those of a wake: this file links them in [run-github.md](run-github.md) and [triggers-github.md](triggers-github.md) instead of repeating them.

Onboarding no longer sets the repository variable `PROJECT_URL`, writes `.agents/harness.json` or `.agents/hooked-rules/repo-run-models.md`, or opens a `chore/project-conductor-onboarding` pull request. What an earlier onboarding left there is not read and not changed; the owner closes an open onboarding pull request by hand. `repo-review-models.md` is left alone for sessions started by hand.

Placeholders:

| Placeholder | Meaning |
|---|---|
| `<board owner>`, `<n>` | The board's owner and number, from its URL: `https://github.com/users/<board owner>/projects/<n>` or `.../orgs/<board owner>/projects/<n>`. |
| `<board URL>` | The board's URL as `gh project view` returns it. |
| `<project id>` | The board's node id, from Preflight. |
| `<title>` | The conductor title, `project-conductor <board URL>`. |
| `<conductor id>` | This thread's id, from Preflight. The thread that runs onboarding becomes the conductor. |
| `<conductor project>` | This thread's T3 project, `thread.projectId` of its `t3_thread_read`. |
| `<agent>` | The agent's login, from Preflight. |
| `<repo>` | **One** repository of the board, as `owner/name`, spelled as the board item's `repository.nameWithOwner`. A board may hold issues of several repositories: every per-repository command runs once for each, with its own `<repo>`. |
| `<owner>`, `<name>` | The two halves of `<repo>`. `<owner>` is the repository owner's login, from `<work>/repos.json`. |
| `<default>` | `<repo>`'s default branch, from `<work>/repos.json`. |
| `<work>` | A folder of this run in the scratchpad, such as `<scratchpad>/onboard-<n>`. Every saved file goes here. A file of one repository is named with `<owner>-<name>`. |

Always pass `--repo <repo>` to `gh issue` and `gh pr`. Without it, `gh` resolves a bare number against the current checkout, which may be another repository, or none.

## Preflight

Check all of these, and stop the run on the first that fails:

```bash
mkdir -p <work>/keys
gh auth status                      # logged in, and the token scopes include "project"
gh auth refresh -s project          # the fix when the scope is missing; the person runs it
gh api user --jq .login             # <agent>
gh project view <n> --owner <board owner> --format json > <work>/project.json
jq -r '"\(.id) \(.url) \(.title)"' <work>/project.json        # <project id> <board URL> <board title>
jq '{readme}' <work>/project.json > <work>/readme.json          # the input of the settings parser
jq -j '.readme // ""' <work>/project.json > <work>/readme.survey  # the readme's exact bytes
```

- Read the board by its explicit number and owner. Do not use `@me`: it names the token's account, not the board's owner.
- `jq -j` writes the readme without adding a newline, so `readme.survey` holds its bytes.

Then read this thread, the one that becomes the conductor:

1. Call `t3_thread_configure` with no arguments. Its `threadId` is `<conductor id>`.
2. Call `t3_thread_read` with `threadId` `<conductor id>` and `limit` 1. Keep `thread.title` and `thread.projectId` (`<conductor project>`).

A failed call stops the run: "The onboarding could not read its own thread: <error>."

## Conductor thread

Two checks for another conductor of this board, then the rename. Both checks run before any write, in every run, a dry run included. (Spec: One conductor per board; The onboarding thread becomes the conductor.) Anchor: `#conductor-thread`.

### The block's `conductor`

Parse the readme with the parser of [Settings block](run-github.md#settings-block): save its `settings.jq` and run it on `<work>/readme.json`, into `<work>/settings-parsed.json` and `<work>/settings.json`.

```bash
jq -r --arg me <conductor id> '.conductor // "none"
  | if . == "none" then "none" elif . == $me then "this thread" else "other \(.)" end' <work>/settings.json
```

- `none` or `this thread`: go on.
- `other <id>`: call `t3_thread_read` with `threadId` `<id>` and `limit` 1.
  - The answer has `thread.archived` false: **stop the run.** Nothing is written. The report names the thread: "The board's conductor is thread `<id>`, `<its title>`. Run the onboarding there, or archive that thread first."
  - `thread.archived` true, or the error `thread_not_found`: that conductor is gone. Go on; the [settings block](#settings-block) plans `conductor` as change.
  - Any other error: stop the run, "The conductor named in the board readme, `<id>`, could not be read: <error>."

### Every T3 project

List every T3 project: call `t3_project_list` with `limit` 100, and again with `cursor` set to `nextCursor` while it is not null. Write each answer to `<work>/t3-projects-<k>.json`, with `<k>` 1, 2, …, as is: [Repositories](#repositories) matches the repositories against the same files. "No project" is one of the listed projects, with its own id. A failed call stops the run.

For each project whose `deletedAt` is null, call `t3_thread_search` with `query` `<title>`, `projectId` the project's id and `limit` 50. The search matches by word prefix and also message text, so compare every `matches[].title` with `<title>` exactly, character for character:

- An exact match whose thread id is not `<conductor id>`: **stop the run.** Nothing is written. The report names the thread and its project: "Thread `<id>` in project `<project title>` is already titled `<title>`. Run the onboarding there, or archive that thread first."
- A failed search, or 50 matches with no such exact match: that project could not be checked, because more may exist. Stop the run and name the project and the error. A second conductor is worse than a stopped onboarding.

The search skips archived threads, so an archived conductor never stops the run.

### The rename

| This thread's title | Plan |
|---|---|
| exactly `<title>` | reuse |
| `project-conductor <another board URL>` | cannot do: this thread conducts another board. Stop the run: "Run the onboarding of this board in a new thread." |
| anything else | change: show the old title and `<title>` |

Write, only in this thread: call `t3_thread_update` with `action` `"rename"`, `title` `<title>` and no `threadId`. Read it back with `t3_thread_read`: `thread.title` must equal `<title>`. A refused rename is not tried another way: the owner step is "Rename this thread to `<title>`, exactly." Without the title the wakes fail their identity check, so the report puts this step first.

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


## Settings block

The conductor's settings are one fenced `text` block after the line `<!-- project-conductor -->` in the board readme. Its format, its keys and their defaults are those of [Settings block](run-github.md#settings-block), and onboarding reads it with that parser, already run in [The block's `conductor`](#the-blocks-conductor). (Spec: Settings block in the board readme.) Anchor: `#settings-block`.

### Plan the block

```bash
jq -r '.gaps[]' <work>/settings-parsed.json     # the gaps of the block as it is
```

| Gaps | Plan |
|---|---|
| none, and the planned readme below equals `readme.survey` | reuse |
| `missing-marker` | create: the marker and the block are added after the readme's text |
| none, or only `missing-conductor` | change: the planned block, shown as a diff |
| any other gap: `two-markers`, `missing-block`, `unknown-key`, `repeated-key`, `not-a-positive-integer`, `out-of-range` | cannot do: the block is not rewritten. The owner step is the gap's step in [Settings block](run-github.md#settings-block), and the report shows the planned block for the owner to compare |

Build two objects of `<key>: <value>`:

- **`set`**, the lines onboarding writes over what is there: `conductor` = `<conductor id>`, and each `model.<role>` for which the owner gave, in the plan, a cell other than the block's.
- **`add`**, the values of keys the block lacks: `maxParallel` 2, `reviewRounds` 5, `reconcileMinutes` 30, `maxAttempts` 2, and the confirmed cell of each role, `<providerInstanceId>/<model id>#<effort>`. Leave out `model.implement` when its model is not confirmed: neither given by the owner nor in the block.

Every line of the block that `set` does not name is kept as written, in its place, with its value: `reconcileMinutes: 2` stays 2. A model line in the block counts as confirmed and stays unless the owner gives another cell in the plan. Missing keys are added after the existing lines, in the order `conductor`, `maxParallel`, `reviewRounds`, `reconcileMinutes`, `maxAttempts`, `model.plan`, `model.review`, `model.implement`. Text before the marker and after the block is kept byte for byte.

````bash
cat > <work>/readme-new.jq <<'EOF'
def strip: gsub("^\\s+|\\s+$"; "");
def keyof: (rtrimstr("\r") | strip + " ") as $l | ($l | index(": ")) as $i | if $i == null then ($l | strip) else ($l[:$i] | strip) end;
def order: ["conductor", "maxParallel", "reviewRounds", "reconcileMinutes", "maxAttempts", "model.plan", "model.review", "model.implement"];
def missing($have): [order[] | select(IN($have[]) | not) | . as $k | ($set[0][$k] // $add[0][$k]) | select(. != null) | "\($k): \(.)"];
(.readme // "") as $r | ($r | split("\n")) as $lines
| [range(0; $lines | length) | select($lines[.] | rtrimstr("\r") | strip == "<!-- project-conductor -->")] as $marks
| if ($marks | length) == 0 then
    (["<!-- project-conductor -->", "```text"] + missing([]) + ["```"] | join("\n")) as $b
    | if $r == "" then $b + "\n" elif ($r | endswith("\n")) then $r + "\n" + $b + "\n" else $r + "\n\n" + $b + "\n" end
  else
    $marks[0] as $m
    | first(range($m + 1; $lines | length) | select($lines[.] | rtrimstr("\r") | strip | startswith("```"))) as $open
    | first(range($open + 1; $lines | length) | select($lines[.] | rtrimstr("\r") | strip == "```")) as $close
    | $lines[$open + 1:$close] as $body
    | [$body[] | select(rtrimstr("\r") | strip != "") | keyof] as $have
    | ($body | map(if (rtrimstr("\r") | strip) != "" and (keyof as $k | $set[0] | has($k))
                   then keyof as $k | "\($k): \($set[0][$k])" else . end)) as $kept
    | $lines[:$open + 1] + $kept + missing($have) + $lines[$close:] | join("\n")
  end
EOF
jq -n --arg me <conductor id> '{conductor: $me} + <the owner'"'"'s other cells, such as {"model.plan": "…"}>' > <work>/set.json
jq -n '{maxParallel: 2, reviewRounds: 5, reconcileMinutes: 30, maxAttempts: 2,
        "model.plan": "<plan cell>", "model.review": "<review cell>"} + <{"model.implement": "<implement cell>"} when confirmed, else {}>' > <work>/add.json
jq -j --slurpfile set <work>/set.json --slurpfile add <work>/add.json -f <work>/readme-new.jq <work>/readme.json > <work>/readme.new
cmp -s <work>/readme.survey <work>/readme.new && echo reuse || diff <work>/readme.survey <work>/readme.new
````

Run this only when the gaps allow a rewrite (the table above). Show the diff, or for a create the whole block, in the plan. Then check the planned block with the parser: put `readme.new` into `{readme}`, run `settings.jq` on it, and expect no gap and `conductor` equal to `<conductor id>`; any gap means the plan is wrong, so do not write.

**Models.** Resolve each model line of the planned block as [Models](run-github.md#models) does, read-only. A line that does not resolve is still written as planned, because the owner chose it, and the report names it with the Models owner step. In a dry run outside the conductor thread, the block's `conductor` is this thread's id and the report says it becomes the id of the thread that runs the onboarding.

### Write the block

Look first: read the readme again and compare it with the survey. A difference means someone edited it: do not write, report it.

```bash
set -o pipefail
gh project view <n> --owner <board owner> --format json | jq -j '.readme // ""' > <work>/readme.now
cmp <work>/readme.survey <work>/readme.now          # must print nothing
gh project edit <n> --owner <board owner> --readme "$(cat <work>/readme.new)"
```

Read it back. `$(…)` strips the newlines at the end of the file, so compare without them; everything else, the text outside the block included, must be equal byte for byte:

```bash
gh project view <n> --owner <board owner> --format json | jq -j '.readme // ""' > <work>/readme.after
jq -n --rawfile a <work>/readme.after --rawfile b <work>/readme.new \
  '($a | sub("\n+$"; "")) == ($b | sub("\n+$"; ""))'                   # must print true
```

`false` is reported with both files: "The board readme reads back differently from what was written." A refused write, or a failed read, is not tried another way. The owner step shows the block to paste:

````text
Board readme (owner step): open <board URL>/settings, and in the README put these lines after the readme's text, or in place of the existing block after <!-- project-conductor -->:

<!-- project-conductor -->
```text
<the planned block's lines>
```
````

## Repositories

The board's issues may belong to several repositories. Read each repository of an **open** board issue as [Repositories](run-github.md#repositories) does, into `<work>/repos.json`: default branch, `admin`, `push`, owner and its T3 project. Build `<work>/repos.txt` from the open issues of the [board read](#read-the-boards-issues) in place of that section's first command, then run the rest of it as written; the T3 project list of [Every T3 project](#every-t3-project) is the same list, so it need not be read twice. (Spec: Repositories of the board.) Anchor: `#repositories`.

```bash
jq -r '.repo' <work>/items.jsonl | sort -u > <work>/repos.txt
```

Each repository then gets its own findings. None of them stops the other repositories:

| `<work>/repos.json` | Plan, owner step |
|---|---|
| `owner` is null: the repository could not be read | cannot do: "Give the agent account read access to `<repo>`." Its keys and approval rule are not checked |
| `projectIds` is empty | cannot do: "Add a T3 project for a checkout of `<repo>`." |
| `projectIds` has more than one id | cannot do: "`<repo>` has several T3 projects: <ids>. Keep one." |
| `push` is not `true` | cannot do: its keys. "Give the agent account write access to `<repo>`." |
| `admin` is not `true` | its classic branch protection cannot be read (approval rule), and its webhook is an owner step |

The keys and the approval rule below run once per repository, with that repository's `<repo>`, `<owner>` and `<default>`.

## Keys

Keys are allocated and checked per repository: each repository has its own numbers, and a duplicate key in one repository stops only that repository's keying. (Spec: Missing task keys are added; Which board items are keyed.) Anchor: `#keys`.

The board read and the board's RFC slug are shared. Everything else runs once for each repository of [Repositories](#repositories) that can be read and has `push`, in its own folder: below, `<work>/items.jsonl` and `<work>/readme.json` are the run's, and every other `<work>/…` path stands for `<work>/<owner>-<name>/…` (`mkdir -p <work>/<owner>-<name>/keys` first). "The keying step" is that repository's: when it stops, the other repositories go on. The trust owner `<owner>` is that repository's owner.

### Markers

| On | Marker | Form of the whole first line |
|---|---|---|
| Board readme | `<!-- rfc: <rfc-slug> -->` | (anywhere in the readme) |
| Milestone description | `<!-- rfc: <rfc-slug>/<milestone-slug> -->` | (anywhere in the description) |
| Plan issue | `<!-- plan: <rfc-slug>/<milestone-slug> -->` | `^<!-- plan: [a-z0-9-]+/[a-z0-9-]+ -->$` |
| Task issue | `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->` | `^<!-- task: [a-z0-9-]+/[a-z0-9-]+/[0-9]+ -->$` |

The first line is the body up to the first `\n`, with one `\r` at its end removed. It is matched whole.

### Read the board's issues

Every item, page by page, until `hasNextPage` is false. `--paginate` follows `endCursor`. If it fails, stop the keying step of every repository: the list would be incomplete. This read also gives the repositories of [Repositories](#repositories).

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
  | select(.content.__typename == "Issue" and .content.state == "OPEN")
  | .content | {repo: .repository.nameWithOwner, number, body}' > <work>/items.jsonl
```

Pull requests and draft items drop out here. Each issue is keyed only against its own repository's keys. Sort the issues of one repository by their first line:

```bash
jq -r --arg repo <repo> 'select(.repo == $repo) | ((.body // "") | (split("\n")[0] // "") | rtrimstr("\r")) as $l
  | (if ($l | test("^<!-- task: [a-z0-9-]+/[a-z0-9-]+/[0-9]+ -->$")) or ($l | test("^<!-- plan: [a-z0-9-]+/[a-z0-9-]+ -->$")) then "identified"
     elif ($l | test("^\\s*<!--\\s*(task|plan):")) then "malformed"
     else "keyless" end) as $class
  | "\(.number)\t\($class)\t\($l)"' <work>/items.jsonl
```

Any other first line that matches `^\s*<!--\s*(task|plan):`, such as `  <!-- task: a/b/1 -->` or `<!--task:a/b/1-->`, is malformed, not keyless, so no second key is put above it. A malformed issue is reported with its first line and left unchanged. An identified issue is counted and left unchanged.

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
# the board's RFC slug, once for the run: exactly one, else no issue gets a key
jq -c '[.readme // "" | match("<!-- rfc: ([a-z0-9-]+) -->"; "g") | .captures[0].string] | unique' <work>/readme.json

# each milestone's marker: exactly one per milestone, else its issues get no key
gh api --paginate "repos/<repo>/milestones?state=all&per_page=100" \
  --jq '.[] | "\(.number)\t\([.description // "" | match("<!-- rfc: ([a-z0-9-]+/[a-z0-9-]+) -->"; "g") | .captures[0].string] | unique | join(" "))"' \
  > <work>/milestones.tsv
```

Save this milestones read as `<work>/milestones.tsv`: the re-check before each write compares against it.

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

Any difference: skip the issue, and list it under Pending as "changed during the run".

Then read every key in the repository again, with the command above, into `keys.now.tsv`. A duplicate now stops the keying step. If another issue holds the planned key, skip this issue and report it as "key `<key>` was taken by <repo>#<other> during the run". Do not give it another number in this run.

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

Read once for each repository of [Repositories](#repositories) that can be read, with its `<default>` and its `admin` from `<work>/repos.json`. Each repository gets its own answer. A push permission is not needed: the step only reads. Anchor: `#approval-rule`.

Rulesets that apply to the default branch. A writer can read them, as checked on `line-mcp`:

```bash
gh api --paginate "repos/<repo>/rules/branches/<default>?per_page=100" \
  | jq -s '[.[][] | select(.type == "pull_request") | .parameters.required_approving_review_count] | max // 0'
```

Classic branch protection:

```bash
if out=$(gh api "repos/<repo>/branches/<default>/protection" \
           --jq '.required_pull_request_reviews.required_approving_review_count // 0' 2>&1); then
  echo "read: $out"                                    # the required count
elif printf '%s' "$out" | grep -q 'Branch not protected'; then
  echo "read: 0"                                       # counts as read only when admin is true
else
  echo "not read: $out"
fi
```

On a 404, `gh` prints the error body (with its `message`) and `gh: ... (HTTP 404)`; the capture holds both.

How to read them:

| Source | Read, requires an approval | Read, requires none | Not read |
|---|---|---|---|
| Rulesets | a number of 1 or more | 0 | the command failed |
| Classic | a number of 1 or more | 0, or a 404 with the message "Branch not protected" while `admin` is true | any other error. Without admin the endpoint answers 404 "Not Found", as on `line-mcp`, which says nothing |

- **yes:** either source requires an approval.
- **no:** both were read and neither requires one. Owner step: "Require a pull request with at least 1 approving review on `<default>`: add a branch ruleset at https://github.com/<repo>/settings/rules".
- **unknown:** anything else. Owner step: "Check that `<default>` requires at least 1 approving review: https://github.com/<repo>/settings/rules".

## Webhook

The secret, the two triggers and each repository's GitHub webhook. The trigger objects, the compare, Register the webhook and the owner steps are in [triggers-github.md](triggers-github.md); this section says what onboarding runs of them. Everything here needs the conductor thread: the triggers bind to the thread that creates them. (Spec: Webhook secret from the owner; Two triggers bound to the conductor; Register the webhook for one repository.) Anchor: `#webhook`.

`<reconcile>` is `reconcileMinutes` of the **planned** block: run the parser on `readme.new` into `<work>/settings.json` before the compare, so `reconcileMinutes: 2` gives the timer `everyMs` 120000.

### Survey the triggers

Run steps 1 to 3 of [Steps of the check](triggers-github.md#steps-of-the-check): list this thread's scheduled tasks with `list_scheduled_tasks` and `projectId` `<conductor project>`, select them by `boundThreadId` `<conductor id>` and the two titles, and compare each with its object of [Triggers](triggers-github.md#triggers).

| Found, per title | Plan |
|---|---|
| one task, no difference, enabled | reuse |
| one task that differs, or is disabled | change: update it in place by `scheduledTaskId`, only the differing fields, or `enabled: true`, as step 4 of the check says. The webhook trigger keeps its URL and its secret: no `request_secret` |
| several tasks with the title | cannot do: the owner step of step 2 of the check |
| no task: the timer | create, with the timer object |
| no task: the webhook trigger | create, with the webhook object and a new secret (below), then Register the webhook for every repository |

A failed `list_scheduled_tasks` is cannot do for both triggers, with the error; nothing is created, since a second trigger could be made beside an existing one.

In a dry run outside the conductor thread, no trigger is bound to this thread, so the list says nothing about the conductor. Plan both triggers as "in the conductor thread" and say so.

### The secret and the webhook trigger

Only when the webhook trigger is created in this run, and only after the plan was agreed:

1. Call `request_secret` with `label` "GitHub webhook secret", `reason` "A new secret for the project-conductor webhook trigger. Keep it: every repository's GitHub webhook needs it." and `delivery` `"secretRef"`. Create the webhook trigger with `schedule_task` and that `secretRef` in `schedule.signature.secretRef`. Keep its `webhookUrl` as `<url>`, and print it in the report: only this call returns it.
2. When at least one repository of `<work>/repos.json` has `admin` true, call `request_secret` again with the same label, `reason` "The same secret again, to add it to the repositories' GitHub webhooks." and `delivery` `"file"`. That path is the `<secret file>` of Register the webhook. Without an admin repository, ask nothing more.

The secret is never generated, printed or stored. A refused or cancelled `request_secret` leaves the webhook trigger uncreated: cannot do, owner step "run: check the triggers" in this thread, which creates it on the owner's command.

Read each trigger back with `list_scheduled_tasks` and the compare: no difference and `enabled` true.

### Register the webhook for each repository

When the webhook trigger was created in this run, run [Register the webhook](triggers-github.md#register-the-webhook) for each repository of `<work>/repos.txt`, in that order, with `<url>` and the `<secret file>`. Its step 1 decides by `admin`: a repository without it is an owner step and needs no secret. Print the [owner steps](triggers-github.md#owner-steps) block of each such repository, with `<url>`.

In the survey, the URL is not known yet. The plan lists each repository as "register after the trigger is created" when its `admin` is true, and as an owner step otherwise.

### A run that reuses the webhook trigger

The trigger exists, so its URL is not known in this run: only its creation returned it. Ask for no secret and register no hook. The `Webhook owner steps:` list is carried instead.

Read this thread's own messages, newest first, as [The backward scan](triggers-github.md#the-backward-scan) does (`t3_thread_read` with `view` `"activity"`), every page to the start of the thread, into `<work>/scan-<k>.json`. Then:

```bash
jq -s 'add | unique_by(.position)' <work>/scan-*.json | jq -r --rawfile repos <work>/repos.txt '
  def trim: gsub("^\\s+|\\s+$"; "");
  def lines: (.text // "") | split("\n") | map(rtrimstr("\r") | trim);
  def names($r): (.text // "") | ascii_downcase
    | test("(^|[^a-z0-9._-])" + ($r | ascii_downcase | gsub("\\."; "\\.")) + "($|[^a-z0-9._-])");
  [ .[] | select(.type == "assistant_message" and (lines | any(startswith("Webhook owner steps:")))) ]
  | sort_by(.position) as $reports
  | (if ($reports | length) == 0 then []
     else $reports[-1] | lines | map(select(startswith("Webhook owner steps:"))) | last
       | ltrimstr("Webhook owner steps:") | trim
       | if . == "none" or . == "" then [] else split(",") | map(trim) end end) as $carried
  | [$repos | split("\n")[] | select(. != "") | . as $r | select([$reports[] | names($r)] | any | not)] as $new
  | ($carried + $new) | unique_by(ascii_downcase) | sort_by(ascii_downcase)
  | "Webhook owner steps: " + (if length == 0 then "none" else join(", ") end)'
```

- **Carried:** the list of the newest report of this thread that holds a `Webhook owner steps:` line, an onboarding, trigger check or register report, unchanged.
- **Added:** every repository of the board that none of those reports names. No report ever registered its hook, so it is an owner step, with the owner steps block whose URL is `the URL of the trigger "project-conductor webhook" in T3's Settings`.
- No report at all: every repository of the board is an owner step.

The owner can then run "register the webhook for `<repo>`" with the URL pasted from T3's Settings.

### The report line

Every onboarding report ends its Triggers section with the full list, as [Webhook owner steps](triggers-github.md#webhook-owner-steps) defines it:

```text
Webhook owner steps: <repo>, <repo>
```

When the webhook trigger was created in this run, the list is every repository whose result is `owner step`, compared without case and sorted. When it was reused, it is the carried list above. `none` when empty. In a dry run, it is the list the run would leave: the repositories without `admin`, or the carried list.
