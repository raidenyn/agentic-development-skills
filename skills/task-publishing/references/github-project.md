# Target: GitHub Project

Publishes to a GitHub Project (the current Projects, not classic boards) with issues in one repository. Everything goes through the `gh` command line tool. The commands below were run against GitHub with `gh` 2.105. If a flag is missing in your version, check `gh <command> --help` before changing the approach.

Placeholders: `<owner>` is the login of the user or organization that owns the project, `<repo>` is `owner/name`, `<n>` is the project's number, `<rfc-slug>` is the slug in the task keys.

## Limits

- **One repository.** All tasks become issues in one repository. If the tasks belong to more than one, stop before the first write and tell the person. The task files are still theirs to use.
- **Same owner.** A project can only be linked to a repository of the same owner.
- **Body size.** GitHub rejects an issue body over 65,536 characters. Treat 65,000 as the limit in the dry run.

## Before the first write

Check all of these, and stop on the first that fails:

```bash
gh auth status                      # logged in, and the token scopes include "project"
gh auth refresh -s project          # the fix when the scope is missing; the person runs it
gh api repos/<repo> --jq '.permissions.push, .has_issues'   # both must be true
gh api user --jq .login             # use the login as <owner>; "@me" does not work for every command
```

Ask the person:

- the owner of the project: themselves or an organization;
- a new project, or an existing one (its URL);
- the project's title, when it is new. Default: the RFC's title;
- whether the board has automation that moves Status (see "Status" in SKILL.md).

## Markers

A marker is an HTML comment. It is invisible on GitHub and is how a later run recognizes what this skill created.

| On | Marker |
|---|---|
| Project readme | `<!-- rfc: <rfc-slug> -->` |
| Repository milestone, in its description | `<!-- rfc: <rfc-slug>/<milestone-slug> -->` |
| Plan issue, first line of the body | `<!-- plan: <rfc-slug>/<milestone-slug> -->` |
| Task or outline issue, first line of the body | `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->` |

## Find what exists

Run all of this before the dry run.

```bash
# The project: by marker in the readme, then by title
gh project list --owner <owner> --format json --limit 1000 \
  --jq '.projects[] | select(.readme | contains("<!-- rfc: <rfc-slug> -->")) | "\(.number) \(.title) \(.url)"'
gh project list --owner <owner> --format json --limit 1000 \
  --jq '.projects[] | select(.title == "<title>") | "\(.number) \(.url)"'

# Milestones: all states, with their descriptions
gh api --paginate "repos/<repo>/milestones?state=all&per_page=100" \
  --jq '.[] | "\(.number)\t\(.title)\t\(.description // "" | contains("<!-- rfc: <rfc-slug>/"))"'

# Every plan, task and outline issue of this RFC: all states, every page, pull requests skipped
gh api --paginate "repos/<repo>/issues?state=all&per_page=100" \
  --jq '.[] | select(.pull_request | not)
        | select(.body // "" | test("<!-- (task|plan): <rfc-slug>/"))
        | "\(.number)\t\(.state)\t\(.body | capture("<!-- (?<kind>task|plan): (?<key>[^ ]+) -->") | "\(.kind)\t\(.key)")"'
```

How to read the results:

- A project found by its marker is reused. A project found only by its title is shown to the person, who says whether to use it. It may be a project that a stopped run created and did not mark yet, or someone else's. Never create a second project with the same title without asking.
- A milestone with the same title and no marker is used only when the person confirms.
- A key that appears on two issues is a conflict. Stop and report both.
- Search the repository's issues as above. `gh project item-list` returns 30 items unless told otherwise and sees only issues that are already on the board.

## Order of writes

Each step first uses what "Find what exists" returned, and creates only what is missing.

### 1. Project

```bash
gh project create --owner <owner> --title "<title>" --format json --jq '"\(.number) \(.id)"'
gh project edit <n> --owner <owner> --description "<one line>" --readme "$(cat <readme file>)"
gh project link <n> --owner <owner> --repo <repo>
```

`gh project create` cannot set the readme, so the marker is only there after `gh project edit`. Run the two together.

The readme:

```markdown
<!-- rfc: <rfc-slug> -->
# <RFC title>

RFC: <full URL of the RFC file in the repository>

## Milestones

| Milestone | Outcome | Depends on |
|---|---|---|
| <name, linked to the repository milestone> | <outcome from the RFC> | <milestones> |

## How to read the board

- **Status.** Ready: nothing blocks the task, it can be started. Backlog: something still blocks it.
- **Phase.** The kind of work: Spike, Refactor, Foundation, Feature, Migration, Hardening. Outline marks a placeholder for a milestone that is not broken down yet. A Ready outline is ready to be broken down, not to be implemented.
- **Plan issues.** Each milestone has one issue named "Plan: <milestone>". Its sub-issues are the milestone's tasks. It becomes Ready when all of them are closed, which means the milestone is due to be checked and closed.
```

### 2. Fields

Read the fields first:

```bash
gh project field-list <n> --owner <owner> --format json --jq '.fields[] | {name, id, options}'
```

**Status** exists on every project, with the options Todo, In Progress and Done on a new one. The board needs at least Backlog and Ready. On a new project, set the options to Backlog, Ready, In Progress, In Review, Done. On an existing project, add only the missing ones.

**An option sent without its `id` is created anew, and every item that had the old option loses its value.** So always send the complete list, with the `id` of every option that already exists:

```bash
gh api graphql -f query='
mutation($field: ID!) {
  updateProjectV2Field(input: {fieldId: $field, singleSelectOptions: [
    {name: "Backlog",     color: GRAY,   description: "Something still blocks it"},
    {name: "Ready",       color: GREEN,  description: "Nothing blocks it"},
    {id: "<existing id>", name: "In Progress", color: YELLOW, description: ""},
    {name: "In Review",   color: PURPLE, description: ""},
    {id: "<existing id>", name: "Done",  color: BLUE,   description: ""}
  ]}) { projectV2Field { ... on ProjectV2SingleSelectField { options { id name } } } }
}' -f field=<Status field id>
```

Match existing options by name without regard to case, and keep their spelling. On an existing project, leave out nothing that is there, including options this skill does not use.

**Phase** and **Area** are single-select fields:

```bash
gh project field-create <n> --owner <owner> --name Phase --data-type SINGLE_SELECT \
  --single-select-options "Spike,Refactor,Foundation,Feature,Migration,Hardening,Outline"
gh project field-create <n> --owner <owner> --name Area --data-type SINGLE_SELECT \
  --single-select-options "<the Area values, comma-separated>"
```

To add an Area value later, use the `updateProjectV2Field` call above with the Area field's id and the complete list, existing ids included.

### 3. Milestones

```bash
gh api repos/<repo>/milestones -f title="<milestone name>" \
  -f description="<outcome from the RFC>

RFC: <full URL>
<!-- rfc: <rfc-slug>/<milestone-slug> -->" --jq '"\(.number) \(.html_url)"'
```

There is no `gh milestone` command. An existing milestone is updated with `gh api -X PATCH repos/<repo>/milestones/<number>`.

### 4. Plan issues

One per milestone. The body is the marker line followed by `00-plan.md`.

```bash
gh issue create --repo <repo> --title "Plan: <milestone name>" --milestone "<milestone name>" \
  --body-file <file with the marker and the plan>
gh project item-add <n> --owner <owner> --url <issue URL> --format json --jq .id
```

`gh issue create` prints the issue's URL. Do not use its `--project` flag: it takes a project title, which is ambiguous. Add the issue by project number as shown.

### 5. Task and outline issues

In dependency order, so that every blocker has a number before the issue it blocks is created.

```bash
gh issue create --repo <repo> --title "<title>" --milestone "<milestone name>" \
  --body-file <body file> --parent <plan issue number> \
  --blocked-by <blocker issue URL>,<blocker issue URL>
gh project item-add <n> --owner <owner> --url <issue URL> --format json --jq .id
```

Give blockers as full issue URLs, never as bare numbers.

A project adds the sub-issues of an issue that is on the board by itself, a few seconds later (the built-in workflow "Auto-add sub-issues to project" is on by default). So `item-add` may answer "Content already exists in this project". That is not an error. Run `item-add` for every issue anyway, because the workflow may be off, and take the item ids for step 7 from the board:

```bash
gh project item-list <n> --owner <owner> --format json --limit 1000 \
  --jq '.items[] | "\(.content.number)\t\(.id)"'
```

For an issue that exists already:

```bash
gh issue edit <number> --repo <repo> --title "<title>" --body-file <body file> --milestone "<milestone name>"
gh issue edit <number> --repo <repo> --add-blocked-by <URL> --remove-blocked-by <URL>
gh issue edit <plan issue number> --repo <repo> --add-sub-issue <number>
```

### 6. Self-links and the plan's blockers

When all issues of a milestone exist:

- Fill each issue's own URL into the "Task:" line of its Design constraints block and update the body.
- Make the plan issue blocked by every task and outline of its milestone:

```bash
gh issue edit <plan issue number> --repo <repo> --add-blocked-by <URL>,<URL>
```

### 7. Project values

One call per field and item. The option ids come from `gh project field-list`, the project id from `gh project view <n> --owner <owner> --format json --jq .id`.

```bash
gh project item-edit --project-id <project id> --id <item id> \
  --field-id <field id> --single-select-option-id <option id>
```

Set Status, Phase and Area on every task and outline issue. Set only Status on a plan issue: Backlog while any of its sub-issues is open.

For Status, read the blockers, not a count:

```bash
gh api repos/<repo>/issues/<number>/dependencies/blocked_by \
  --jq '.[] | "\(.number) \(.state) \(.state_reason)"'
```

A blocker is done when its `state` is `closed` and its `state_reason` is `completed`. A blocker closed for another reason did not deliver anything: keep the task in Backlog and report it. Read this list at least a few seconds after the links were written.

### 8. The view

A new project has one table view. Rename it and set its columns to Title, Milestone, Status, Linked pull requests, Phase, Area and Sub-issues progress:

```bash
gh api graphql -f query='query($id: ID!) { node(id: $id) { ... on ProjectV2 {
  views(first: 20) { nodes { id name number layout } } } } }' -f id=<project id>

jq -n --arg view <view id> --argjson ids '["<Title field id>","<Milestone field id>","<Status field id>","<Linked pull requests field id>","<Phase field id>","<Area field id>","<Sub-issues progress field id>"]' '{
  query: "mutation($view: ID!, $ids: [ID!]) { updateProjectV2View(input: {viewId: $view, name: \"Tasks\", configuration: {visibleFieldIds: $ids}}) { projectV2View { name } } }",
  variables: {view: $view, ids: $ids}
}' | gh api graphql --input -
```

The list of ids is passed through `--input`, because `gh api graphql -f` cannot send a list. The API reads the columns back in the order the fields were created, whatever order was sent, so the order cannot be verified from here. Ask the person to look at the view once.

On an existing project, do not change a view. Tell the person which columns to add.

### 9. Read back and report

```bash
gh project item-list <n> --owner <owner> --format json --limit 1000 \
  --jq '.items[] | "\(.content.number)\t\(.status)\t\(.phase)\t\(.area)\t\(.milestone.title)\t\(.title)"'
```

Compare with what was planned. Report the project's URL, the counts, and every difference.

## Replacing outlines

The steps in SKILL.md, with these commands:

```bash
# 2. add the new blocker to each item the outline used to block, then read it back
gh issue edit <blocked issue number> --repo <repo> --add-blocked-by <replacing task URL>
gh api repos/<repo>/issues/<blocked issue number>/dependencies/blocked_by --jq '.[].number'

# 3. remove the outline's links, in both directions
gh api repos/<repo>/issues/<outline number>/dependencies/blocking --jq '.[].html_url'
gh issue edit <blocked issue number> --repo <repo> --remove-blocked-by <outline URL>
gh issue edit <outline number> --repo <repo> --remove-blocked-by <URL>,<URL>

# 4. detach the outline from the plan issue
gh issue edit <plan issue number> --repo <repo> --remove-sub-issue <outline number>

# 5. close it
gh issue close <outline number> --repo <repo> --reason "not planned" \
  --comment "Replaced by <task URLs> when the milestone was broken down."

# 6. update the plan issue
gh issue edit <plan issue number> --repo <repo> --body-file <file with the marker and the new plan>
```

GitHub may set a closed issue's Status to Done on the board. For a retired outline that is expected: it is out of the way.

The plan issue is blocked by its outlines too. Step 3 removes those links, and step 6 of "Order of writes" adds the links to the new tasks.

## Restore

```bash
gh api --paginate "repos/<repo>/issues?state=all&per_page=100" \
  --jq '.[] | select(.pull_request | not) | select(.body // "" | test("<!-- (task|plan): <rfc-slug>/")) | {number, title, state, body}'
```

Write each body back to its file as SKILL.md describes. Phase, Area and the milestone are in the body's summary line, so the project's field values are not needed.
