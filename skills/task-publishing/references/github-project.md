# Target: GitHub Project

Publishes to a GitHub Project (the current Projects, not classic boards) with issues in one repository. Everything goes through the `gh` command line tool. The commands below were run against GitHub with `gh` 2.105. If a flag is missing in your version, check `gh <command> --help` before changing the approach.

Placeholders: `<owner>` is the login of the user or organization that owns the project, which is the owner of the repository, `<repo>` is `owner/name`, `<n>` is the project's number, `<rfc-slug>` is the slug in the task keys.

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
gh api repos/<repo> --jq '.owner.login, .default_branch'    # the owner is <owner>; "@me" does not work for every command
gh project list --owner <owner> --limit 1 >/dev/null        # the token can read that owner's projects
gh api "repos/<repo>/contents/<path of the RFC file>?ref=<default branch>" --jq .path   # the RFC is on the default branch
```

`<owner>` is the repository's owner, because a project can only be linked to a repository of the same owner. Do not take it from the login of the token: a token often belongs to another account, such as a bot or a collaborator. If the person names an existing project of another owner, stop and say that it cannot be linked to this repository.

Run the last command for the RFC and for every follow-up RFC that an item to be published links to. If it answers 404, that RFC is not on the default branch at that path. Stop: every link in the issues would be dead. The person merges the RFC first.

Ask the person:

- a new project, or an existing one (its URL). A project they name by URL or number is confirmed by that;
- the project's title, when it is new. Default: the RFC's title;
- whether the board has automation that moves Status (see "Status" in SKILL.md).

## Markers

A marker is an HTML comment. It is invisible on GitHub and is how a later run recognizes what this skill created.

| On | Marker |
|---|---|
| Project readme | `<!-- rfc: <rfc-slug> -->` |
| Repository milestone, in its description | `<!-- rfc: <rfc-slug>/<milestone-slug> -->` |
| Plan issue, first line of the body | `<!-- plan: <rfc-slug>/<milestone-slug> -->` |
| Task, outline or planning issue, first line of the body | `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->` |

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

# Every plan, task, outline and planning issue of this RFC: all states, every page, pull requests skipped
gh api --paginate "repos/<repo>/issues?state=all&per_page=100" \
  --jq '.[] | select(.pull_request | not)
        | select(.body // "" | test("^<!-- (task|plan): <rfc-slug>/"))
        | "\(.number)\t\(.state)\t\(.state_reason)\t\(.body | capture("^<!-- (?<kind>task|plan): (?<key>[^ ]+) -->") | "\(.kind)\t\(.key)")"'
```

How to read the results:

- A project found by its marker is reused. A project found only by its title is shown to the person, who says whether to use it. It may be a project that a stopped run created and did not mark yet, or someone else's. Never create a second project with the same title without asking.
- A milestone with the same title and no marker is used only when the person confirms.
- The marker counts only as the first line of the body, which is what `^` checks. An issue that quotes a marker further down is not one of ours.
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
- **Phase.** The kind of work: Spike, Refactor, Foundation, Feature, Migration, Hardening. Outline marks a placeholder for a milestone that is not broken down yet. Planning marks the one item per such milestone that says "break this milestone down". When it is Ready, the milestones before it are closed and the breakdown is due. An outline is never implemented.
- **Plan issues.** Each milestone has one issue named "Plan: <milestone>". Its sub-issues are the milestone's tasks. It becomes Ready when all of them are closed, which means the milestone is due to be checked and closed. It is closed when that check is done, and only then does the next milestone's planning item become Ready.
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
  --single-select-options "Spike,Refactor,Foundation,Feature,Migration,Hardening,Outline,Planning"
```

`--single-select-options` splits its value at every comma, and an Area value may contain one ("Tags, sub-accounts"). So create Area through the API, where the options are a list:

```bash
jq -n --arg project <project id> --argjson options '[
  {"name": "<Area value>", "color": "GRAY", "description": ""},
  {"name": "<Area value, with a comma>", "color": "GRAY", "description": ""}
]' '{
  query: "mutation($project: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]) { createProjectV2Field(input: {projectId: $project, dataType: SINGLE_SELECT, name: \"Area\", singleSelectOptions: $options}) { projectV2Field { ... on ProjectV2SingleSelectField { id options { id name } } } } }",
  variables: {project: $project, options: $options}
}' | gh api graphql --input -
```

Each option needs all three of `name`, `color` and `description`. Read the options back and compare the names with the Area list, character by character.

To add an Area value later, or the Planning option to a Phase field that an earlier run created without it, use the `updateProjectV2Field` call above with the field's id and the complete list, existing ids included.

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

### 5. Task, outline and planning issues

A planning issue is created like an outline issue: same command, same parent, same fields.

In dependency order, so that every blocker has a number before the issue it blocks is created.

```bash
gh issue create --repo <repo> --title "<title>" --milestone "<milestone name>" \
  --body-file <body file> --parent <plan issue number> \
  --blocked-by <blocker issue URL>,<blocker issue URL>
gh project item-add <n> --owner <owner> --url <issue URL> --format json --jq .id
```

Give blockers as full issue URLs, never as bare numbers. A blocker written as `plan: <rfc-slug>/<milestone-slug>` is the URL of that milestone's plan issue. That is how a planning item waits for the milestones before it.

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
- Make the plan issue blocked by every task, outline and planning issue of its milestone:

```bash
gh issue edit <plan issue number> --repo <repo> --add-blocked-by <URL>,<URL>
```

### 7. Project values

One call per field and item. The option ids come from `gh project field-list`, the project id from `gh project view <n> --owner <owner> --format json --jq .id`.

```bash
gh project item-edit --project-id <project id> --id <item id> \
  --field-id <field id> --single-select-option-id <option id>
```

Set Status, Phase and Area on every task, outline and planning issue. Set only Status on a plan issue: Backlog while any of its sub-issues is open.

For Status, read the blockers, not a count:

```bash
gh api --paginate "repos/<repo>/issues/<number>/dependencies/blocked_by?per_page=100" \
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
gh api --paginate "repos/<repo>/issues/<blocked issue number>/dependencies/blocked_by?per_page=100" --jq '.[].number'
#    and write every body that the replacement table changed: the blocked items, and plans of other
#    milestones that named the outline, closed ones included
gh issue edit <issue number> --repo <repo> --body-file <body file>

# 3. remove the links from the outline to what it blocked; its own blockers stay
gh api --paginate "repos/<repo>/issues/<outline number>/dependencies/blocking?per_page=100" --jq '.[].html_url'
gh issue edit <blocked issue number> --repo <repo> --remove-blocked-by <outline URL>

# 4. detach the outline from the plan issue
gh issue edit <plan issue number> --repo <repo> --remove-sub-issue <outline number>

# 5. close it
gh issue close <outline number> --repo <repo> --reason "not planned" \
  --comment "Replaced by <task URLs> when the milestone was broken down."

# 6. update the plan issue
gh issue edit <plan issue number> --repo <repo> --body-file <file with the marker and the new plan>

# 7. close the milestone's planning issue, last
gh issue close <planning issue number> --repo <repo> --reason completed \
  --comment "Broken down. The tasks are under <plan issue URL>."
```

GitHub may set a closed issue's Status to Done on the board. For a retired outline that is expected: it is out of the way.

The plan issue is blocked by its outlines too. Step 3 removes those links, and step 6 of "Order of writes" adds the links to the new tasks. The outline keeps its own blockers, the planning issue among them, so it never looks ready while it is open.

## Closing a milestone

The steps in SKILL.md, with these commands:

```bash
# 1. every sub-issue of the plan issue is closed as completed: this prints nothing
gh api --paginate "repos/<repo>/issues/<plan issue number>/sub_issues?per_page=100" \
  --jq '.[] | select(.state != "closed" or .state_reason != "completed") | "\(.number) \(.state) \(.state_reason) \(.title)"'
```

Run this check alone and read its output before anything else. If it prints a line, or the command fails, stop: nothing below is run.

```bash
# 2. and 3. the plan with its closing entry, then close the plan issue
#    each write runs only if the one before it succeeded
gh issue edit <plan issue number> --repo <repo> --body-file <file with the marker and the plan> &&
gh issue close <plan issue number> --repo <repo> --reason completed &&
# 4. close the repository milestone
gh api -X PATCH repos/<repo>/milestones/<milestone number> -f state=closed --jq .state

# 5. what the plan issue was blocking: candidates only. Read each one's blockers (step 7 of "Order of writes") before calling it ready
gh api --paginate "repos/<repo>/issues/<plan issue number>/dependencies/blocking?per_page=100" --jq '.[] | "\(.number) \(.title)"'
```

If one of the three writes fails, stop there, report which ones went through, and run the step again later: each can be repeated. An open sub-issue is unfinished work, and one closed for a reason other than "completed" delivered nothing: report it and do not close the plan issue. Retired outlines are not among the sub-issues, because replacing them detached them.

## Restore

```bash
gh api --paginate "repos/<repo>/issues?state=all&per_page=100" \
  --jq '.[] | select(.pull_request | not) | select(.body // "" | test("^<!-- (task|plan): <rfc-slug>/")) | {number, title, state, state_reason, body}'
```

Write each body back to its file as SKILL.md describes. Phase, Area and the milestone are in the body's summary line, so the project's field values are not needed.
