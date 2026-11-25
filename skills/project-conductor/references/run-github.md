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
| `<conductor id>` | The conductor thread's own id, from Preflight. |
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
