# Follow-up task on GitHub

The commands of the rule "Work that does not fit becomes a follow-up task" of `SKILL.md`, for a GitHub Project board. They are copied and adapted from the `task-publishing` skill, so `task-run` needs no other skill installed. Run them in order. After each write, run its read-back and compare. A write that fails, or a read-back that differs, stops the task: tell the owner in this thread and open no pull request.

`<repo>` is the issue's `owner/name`. `<current>` is the current task's issue number and `<current url>` its URL, both from `Issue`. `<board owner>` and `<board n>` come from the `Board` line: `https://github.com/orgs/<board owner>/projects/<board n>` or `https://github.com/users/<board owner>/projects/<board n>`.

## 1. Read the keys

The current task's key is the first line of its body, `<!-- task: <rfc-slug>/<milestone-slug>/<number> -->`. Its prefix is `<rfc-slug>/<milestone-slug>`. Read the first line of every issue of the repository, open and closed, every page, pull requests skipped:

```bash
gh api --paginate "repos/<repo>/issues?state=all&per_page=100" \
  --jq '.[] | select(.pull_request | not)
        | "\(.number)\t\((.body // "") | (split("\n")[0] // "") | rtrimstr("\r"))"' > keys.tsv

# the highest number under the prefix: the follow-up is one above it
grep -oE '<!-- task: <prefix>/[0-9]+ -->' keys.tsv | grep -oE '[0-9]+ -->' | grep -oE '[0-9]+' | sort -n | tail -1
```

`<next>` is that number plus one. Read the current task's milestone, its plan issue and the issues it blocks:

```bash
gh issue view <current> --repo <repo> --json milestone --jq '.milestone.title'
gh api --paginate "repos/<repo>/issues/<current>/dependencies/blocking?per_page=100" --jq '.[] | "\(.number)\t\(.html_url)"'
```

The milestone's plan issue (first line `<!-- plan: <rfc-slug>/<milestone-slug> -->`) is among the blocked issues. If it is not, add it: find it in `keys.tsv` by that first line.

## 2. Create the issue

Write the body to a file: first line `<!-- task: <prefix>/<next> -->`, then the task format, written from the remaining work, with the current design constraints.

```bash
gh issue create --repo <repo> --title "<title>" --milestone "<milestone title>" --body-file <body file>
```

It prints the issue URL: `<follow-up url>`, number `<follow-up>`. Read it back:

```bash
gh issue view <follow-up> --repo <repo> --json milestone,body --jq '[.milestone.title, (.body | split("\n")[0])]'
```

## 3. Put it on the board

```bash
gh project item-add <board n> --owner <board owner> --url <follow-up url> --format json --jq .id    # <follow-up item>
gh project field-list <board n> --owner <board owner> --format json --jq '.fields[] | {name, id, options}'
gh project view <board n> --owner <board owner> --format json --jq .id                              # <project id>
gh project item-list <board n> --owner <board owner> --limit 1000 --format json \
  --jq '.items[] | select(.content.number == <current> and .content.repository == "<repo>")'
```

`item-add` may answer "Content already exists in this project". That is not an error: take the item id from `item-list`.

Set Status to Backlog on the follow-up. Copy Phase and Area only when the board has that field in `field-list` and the current item holds a value in it (`item-list` prints each field under its lowercase name). Take the option id of the same option name from the field's `options`. One call per field:

```bash
gh project item-edit --project-id <project id> --id <follow-up item> \
  --field-id <field id> --single-select-option-id <option id>
```

Read it back with the `item-list` read above for `<follow-up>`: the fields hold the values you set, and no other.

## 4. Links

The follow-up is blocked by the current task:

```bash
gh issue edit <follow-up> --repo <repo> --add-blocked-by <current url>
gh api --paginate "repos/<repo>/issues/<follow-up>/dependencies/blocked_by?per_page=100" --jq '.[].number'
```

The output must hold `<current>`. Every issue the current task blocks, the plan issue included, is also blocked by the follow-up. One call per issue, each followed by its read-back, which must hold `<follow-up>`:

```bash
gh issue edit <blocked number> --repo <repo> --add-blocked-by <follow-up url>
gh api --paginate "repos/<repo>/issues/<blocked number>/dependencies/blocked_by?per_page=100" --jq '.[].number'
```

Read the blocking list of the current task again (step 1). It must still hold every issue it held, and the follow-up must be blocked by the current task only.

## 5. Check the key

Read the keys again as in step 1. If any issue other than `<follow-up>` now holds the key `<prefix>/<next>`, renumber once: take the new `<next>` (the highest number now, plus one) and rewrite the first line of the follow-up:

```bash
gh issue view <follow-up> --repo <repo> --json body --jq .body > <body file>
# replace the first line with <!-- task: <prefix>/<new next> -->
gh issue edit <follow-up> --repo <repo> --body-file <body file>
```

Read the keys once more. A second collision stops the task: ask the owner in this thread.

The pull request then names `#<follow-up>` under "Work discovered" and marks each unmet criterion "moved to #<follow-up>".
