# Triggers and webhooks: commands

The conductor wakes from two T3 scheduled tasks bound to its own thread: a webhook trigger that GitHub calls when an issue or a pull request closes, and a timer that covers lost deliveries. This file holds the two trigger calls, the procedures "Register the webhook" and "Check the triggers", the automatic check of a timer wake, and the end of the board. Everything goes through `gh`, `jq` and the T3 MCP tools.

The placeholders are those of [run-github.md](run-github.md#preflight): `<work>`, `<conductor id>`, `<repo>`, `<board URL>`, and the files `<work>/settings.json`, `<work>/repos.json` and `<work>/board.json`. Two more:

| Placeholder | Meaning |
|---|---|
| `<conductor project>` | The conductor thread's T3 project: `thread.projectId` of the `t3_thread_read` answer in [Identity](run-github.md#identity). |
| `<reconcile>` | `reconcileMinutes` of `<work>/settings.json`: a whole number from 1 to 1440. |

Every procedure here runs in the conductor thread itself, after the identity check of [Preflight](run-github.md#preflight). An identity failure stops it before any trigger call. Inside onboarding, which runs before the block has its `conductor`, onboarding's own [Preflight](onboarding-github.md#preflight) and [Conductor thread](onboarding-github.md#conductor-thread) step replace the identity check. A `null` `reconcileMinutes` (a settings gap) stops every trigger write except the `enabled: false` writes of [End of the board](#end-of-the-board), which need no setting: the report names the gap.

Nothing here keeps state. Which repositories have a hook, and which are an owner step, is read again each time from GitHub and from this thread's own reports.

## Triggers

The conductor has exactly two triggers, both made with `bindToCurrentThread: true` and `freshSession: true` (Spec: Two triggers bound to the conductor). Their titles are frozen: `project-conductor webhook` and `project-conductor timer`. Anchor: `#triggers`.

**The webhook trigger.** Call `schedule_task` with exactly this object. `<secretRef>` is the one-use `secretRef` of a `request_secret` call (see [Check the triggers](#check-the-triggers)); it is spent by this save and never written down. `<reconcile>` is a number, not a string:

```json
{
  "title": "project-conductor webhook",
  "prompt": "Trigger: webhook.\nRun one wake of the project-conductor skill for this board.",
  "bindToCurrentThread": true,
  "freshSession": true,
  "enabled": true,
  "schedule": {
    "type": "webhook",
    "filters": [
      { "path": "headers.x-github-event", "op": "in", "value": ["issues", "pull_request"] },
      { "path": "body.action", "op": "equals", "value": "closed" }
    ],
    "signature": {
      "header": "x-hub-signature-256",
      "encoding": "hex",
      "prefix": "sha256=",
      "secretRef": "<secretRef>"
    },
    "dedupe": {
      "replayKey": "{{headers.x-github-delivery}}",
      "coalesceKey": "{{headers.x-github-hook-id}}",
      "coalesceWindowSeconds": 120
    },
    "maxDeliveryAgeMinutes": <reconcile>
  }
}
```

**The timer.** Call `schedule_task` with exactly this object, where `<reconcile × 60000>` is `<reconcile>` times 60000 (30 minutes: 1800000; 20 minutes: 1200000):

```json
{
  "title": "project-conductor timer",
  "prompt": "Trigger: timer.\nRun one wake of the project-conductor skill for this board.",
  "bindToCurrentThread": true,
  "freshSession": true,
  "enabled": true,
  "schedule": { "type": "interval", "everyMs": <reconcile × 60000> }
}
```

Rules for both:

- **The prompt** is two lines: the `Trigger:` line, then the wake sentence. It never carries the board URL: a wake takes the board from its conductor thread's launch line ([Identity](run-github.md#identity)).
- **No merged filter.** A filter on `body.pull_request.merged` drops every `issues` delivery, because the path is missing there (`evidence/00-trigger-syntax.md`). So a pull request closed without a merge also starts a run, which finds nothing to do.
- **`replayKey` `{{headers.x-github-delivery}}`** drops a repeated delivery of the same event. **`coalesceKey` `{{headers.x-github-hook-id}}`** is the same for every delivery of one repository's hook, so a merge that closes its issue, which sends two deliveries, becomes one wake. The host accepts only a template here: a literal key such as `project-conductor` is rejected with `Expected <filter>` (live proofs of 2026-11-26 and 2026-11-27). Deliveries of two repositories' hooks are not coalesced; both wakes read the same board and are harmless.
- **`maxDeliveryAgeMinutes`** equals `<reconcile>`: a delivery held longer than that is skipped, because the timer has already run by then.
- **The payload is only a hint.** A webhook wake runs the same steps as a timer wake and reads everything again from GitHub and T3. It takes no fact from the request. (Spec: Webhook payload is only a hint.)
- **The URL.** Only the call that creates the webhook trigger returns its `webhookUrl`, once. Print it in that run's report, since the owner needs it for the hooks. Later it is in T3's Settings; an update by `scheduledTaskId` keeps it.
- **Creating** needs this thread (`bindToCurrentThread`). An update by `scheduledTaskId` changes only the fields it names, and works from any thread.

## Register the webhook

Registers the webhook trigger's URL as a GitHub webhook of one repository. Onboarding runs it for each repository of the board; the owner runs it alone with "register the webhook for `<repo>`", for example for a repository added to the board later. (Spec: Register the webhook for one repository.) Anchor: `#register-the-webhook`.

**Inputs:**

- `<repo>`;
- `<url>`: the `webhookUrl` of the trigger just created, or, when the owner runs it later, the URL the owner pastes from T3's Settings;
- the secret, as a file: `<secret file>` is the path that `request_secret` returns with `delivery: "file"`. Onboarding asks for it once and uses it for every repository of the run.

**The secret is never printed or stored.** Read it only inside the command that sends it, as `$(cat <secret file>)`. Never `cat` it alone, never copy it into `<work>`, a comment, a report or a thread message, and never print a hook's answer as a whole: reduce it with `--jq` first.

### Steps to register

1. **Read the permission first.** Use `admin` of `<repo>` in `<work>/repos.json` when this run has it, or read it:

   ```bash
   gh api repos/<repo> --jq .permissions.admin
   ```

   Anything but `true`, an error included: go to step 4. Ask for no secret.
2. **The secret.** When this run has no `<secret file>` yet, call `request_secret` with `label` "GitHub webhook secret", `reason` "The webhook secret of the project-conductor trigger, to add the webhook to `<repo>`." and `delivery` `"file"`.
3. **List the hooks, then reuse or create.**

   ```bash
   set -o pipefail
   gh api repos/<repo>/hooks --paginate --jq '.[] | {id, url: .config.url, events, active}' | jq -s . > <work>/hooks.json
   jq -r --arg u '<url>' '[.[] | select(.url == $u) | .id] | first // empty' <work>/hooks.json    # <id>, or nothing
   ```

   A failed list is a refusal: go to step 4.

   - **A hook whose `config.url` equals `<url>`:** reuse it, and set its events. No second hook is created:

     ```bash
     gh api -X PATCH repos/<repo>/hooks/<id> -f 'events[]=issues' -f 'events[]=pull_request' -F active=true --jq '{id, events, active}'
     ```

   - **No such hook:** create one:

     ```bash
     gh api -X POST repos/<repo>/hooks -f name=web -F active=true -f 'events[]=issues' -f 'events[]=pull_request' -f 'config[url]=<url>' -f 'config[content_type]=json' -f "config[secret]=$(cat <secret file>)" --jq '{id, events, active}'
     ```

   Read back: list the hooks again, as above. The hook with `<url>` must have `active` true and exactly the events `issues` and `pull_request`. Then the result is `registered <id>` (created) or `reused <id>`. A non-zero exit or a failed read-back is a refusal: go to step 4.
4. **Without admin, or on a refusal:** nothing else is tried: no other API, no other account, no retry. The result is `owner step`, and the report gives the owner's steps, as below.

### Done by the owner

When the owner says in this thread that they added the webhook of an owner step, for example "Add the GitHub webhook for `<repo>` - done", run Register the webhook for `<repo>` again without a URL and without a secret:

1. **With admin,** list the hooks as in step 3 and look for one whose URL is the trigger's. The URL is not known in this run, so match, without case, the part `/scheduled-task%3A<uuid>/` or `/scheduled-task:<uuid>/` of `config.url`, where `<uuid>` is the webhook trigger's `scheduledTaskId` from `list_scheduled_tasks` without its `scheduled-task:` prefix. Found, active and with exactly `issues` and `pull_request`: the result is `reused <id>`. Otherwise the result stays `owner step`, and the report says what differs.
2. **Without admin,** the agent cannot read the hooks. Take the owner's word: the result is `done by the owner, not checked: not an admin`. Nothing is written.

Both end with the standalone report below. A `done by the owner` repository leaves the `Webhook owner steps:` list, so a missed delivery from it counts for the [automatic check](#automatic-check), which then tells the owner to check that hook.

### Owner steps

Print this block for `<repo>`, with the URL filled in:

```text
Webhook for <repo> (owner step):
1. Open https://github.com/<repo>/settings/hooks. If a webhook with the payload URL below exists, edit it; otherwise choose "Add webhook".
2. Payload URL: <url>
3. Content type: application/json
4. Secret: the secret you gave at onboarding
5. Which events: "Let me select individual events", then tick "Issues" and "Pull requests" and nothing else.
6. Active: ticked. Save.
```

When the URL is not known in this run, write `the URL of the trigger "project-conductor webhook" in T3's Settings` in its place.

### Webhook owner steps

Every report that runs Register the webhook, every onboarding report and every trigger check report holds one line with the full list of repositories whose registration is an owner step, compared without case and sorted:

```text
Webhook owner steps: <repo>, <repo>
```

`Webhook owner steps: none` when the list is empty. The [automatic check](#automatic-check) reads the newest such line, so the line always repeats the whole list, never only this run's changes:

1. **When this run created the webhook trigger, or no webhook trigger exists after the run,** start from every repository of the board, `<work>/repos.json`: a new URL leaves every hook registered before pointing at a dead URL, and without a trigger no hook delivers. Otherwise take the list of the newest message of this thread that holds a line starting with `Webhook owner steps:`. Find it with the [backward scan](#the-backward-scan); none found is the empty list.
2. Remove every repository this run registered, reused or recorded as done by the owner, and add every repository whose result in this run is `owner step`.

**A standalone run** ("register the webhook for `<repo>`") ends with this report:

```markdown
## Register the webhook: <repo>

Result: <registered <id> | reused <id> | done by the owner, not checked: not an admin | owner step>, <reason when an owner step: not an admin, or the refused command and its error>

<the owner steps block, when an owner step>

Webhook owner steps: <repo>, <repo>
```

## Check the triggers

Checks the two triggers against [Triggers](#triggers) and the current `reconcileMinutes`, and fixes them in place. It runs on the owner's command "check the triggers", and in the unattended form of the [automatic check](#automatic-check). It never runs as part of every wake. (Spec: Trigger check.) Anchor: `#check-the-triggers`.

First run [Identity](run-github.md#identity), [Board](run-github.md#board), the [Settings block](run-github.md#settings-block) and [Repositories](run-github.md#repositories) as a wake does, and the condition of [End of the board](#end-of-the-board). Nothing else of a wake runs.

### Steps of the check

1. **List.** Call `list_scheduled_tasks` with `projectId` `<conductor project>`. Write its list of tasks, as an array, to `<work>/scheduled.json`. A failed call stops the check: report the error.
2. **Select** this thread's triggers by `boundThreadId` and title:

   ```bash
   jq --arg me <conductor id> '[.[] | select(.boundThreadId == $me and (.title | IN("project-conductor webhook", "project-conductor timer")))]
     | group_by(.title) | map({key: .[0].title, value: .}) | from_entries' <work>/scheduled.json > <work>/triggers.json
   ```

   A title with more than one task is not fixed: report "several triggers titled `<title>`: <scheduledTaskIds>. Delete all but one with `delete_scheduled_task`." as an owner step.
3. **Compare.** Write the two objects of [Triggers](#triggers) for the current `<reconcile>` to `<work>/expected-webhook.json` and `<work>/expected-timer.json`, without `signature.secretRef`. Then list what differs, for each title that has one task:

   ```bash
   cat > <work>/compare.jq <<'EOF'
   def sig: {header, encoding, prefix};
   def filters: (. // []) | map(if .op == "in" then .value |= sort else . end) | sort_by(.path, .op);
   def view: {prompt, freshSession,
              type: .schedule.type, everyMs: .schedule.everyMs,
              filters: (.schedule.filters | filters), signature: (.schedule.signature // {} | sig),
              dedupe: (.schedule.dedupe // {} | {replayKey, coalesceKey, coalesceWindowSeconds}),
              maxDeliveryAgeMinutes: .schedule.maxDeliveryAgeMinutes};
   ($expected[0] | view) as $e | (.[0] | view) as $a
   | {differs: [$e | keys[] | select($e[.] != $a[.])], enabled: (.[0].enabled == true), id: .[0].scheduledTaskId}
   EOF
   jq --slurpfile expected <work>/expected-timer.json -f <work>/compare.jq <(jq '.["project-conductor timer"] // []' <work>/triggers.json)
   jq --slurpfile expected <work>/expected-webhook.json -f <work>/compare.jq <(jq '.["project-conductor webhook"] // []' <work>/triggers.json)
   ```

   An answer with `id` null means that trigger is missing.
4. **Fix**, one trigger at a time, reading each fix back with `list_scheduled_tasks` and the compare:
   - **The webhook trigger's `schedule` is never updated here.** On this host, an update that passes `schedule` clears the stored signature secret, even when `secret` or `secretRef` is omitted; the live proof on 2026-11-26 lost the secret this way. Only `enabled: true` may be set on the webhook trigger. A differing webhook schedule, such as `dedupe` or `maxDeliveryAgeMinutes`, is reported as an owner step: recreate the trigger with a new secret and register every repository's hook again. The timer may be updated normally.
   - **A trigger that differs** is updated in place, so the webhook trigger keeps its URL: `schedule_task` with `scheduledTaskId` `<id>` and only the differing fields. This rule applies to the timer; the webhook trigger follows the rule above. For example, `reconcileMinutes` 20 updates the timer to `"schedule": {"type": "interval", "everyMs": 1200000}`.
   - **A disabled trigger** is re-enabled with `schedule_task` `scheduledTaskId` `<id>`, `enabled: true`, unless the board has ended ([End of the board](#end-of-the-board)). At the end of the board it stays disabled, and the report says why.
   - **A missing timer** is created with the timer object of [Triggers](#triggers). This needs no secret.
   - **A missing webhook trigger** is created only on the owner's command, because it needs a new secret from the owner. In the owner's check, report it and ask: "The trigger `project-conductor webhook` is missing. Create a new one? Every repository's webhook must then be registered again with the new URL." Only on a yes:
     1. call `request_secret` with `label` "GitHub webhook secret", `reason` "A new secret for the project-conductor webhook trigger. Keep it: every repository's GitHub webhook needs it." and `delivery` `"secretRef"`, and create the webhook trigger with it. Print the `webhookUrl` it returns;
     2. ask for no file secret here. Step 5 registers only the repositories the owner names, and step 2 of [Register the webhook](#steps-to-register) asks for the `<secret file>` once, only when a repository with `admin` is registered;
     3. say in the report that every repository's hook must be registered again with the new URL, and list the repositories of the board.
5. **Register the webhook** for each repository the owner names in the command, such as "check the triggers and register the webhook for `a/x`", with `<url>` from step 4 or pasted by the owner. Without a URL in this run, ask the owner to paste it from T3's Settings.

### Report

The check ends with this report. In a wake it is a section of its own, printed before the wake report, whose Triggers section then says "automatic check: see Trigger check":

```markdown
## Trigger check

Run: <owner's command | automatic, unattended>

- Timer: <ok | updated <fields> | re-enabled | created <scheduledTaskId> | disabled, the board has ended | several | failed <error>>
- Webhook trigger: <ok | updated <fields> | re-enabled | created <scheduledTaskId>, URL <webhookUrl> | disabled, the board has ended | missing | several | failed <error>>
- Webhooks: <repo>: <registered <id> | reused <id> | owner step>; … or "none run"

### Owner steps
- <each owner step: the owner steps block of each repository, "run: check the triggers", "deliveries missing for <repo>: check its GitHub webhook", "register every repository's webhook again with the new URL", or "none">

Webhook owner steps: <repo>, <repo>
```

The `## Trigger check` heading is a line of its own: the [automatic check](#automatic-check) finds the last check by it.

## Automatic check

A timer wake runs the trigger check by itself when the board shows an event that the webhook should have delivered and did not. It runs after Start, in the unattended form, and only then. (Spec: Automatic trigger check on a missed event.) Anchor: `#automatic-check`.

**It runs only in a timer wake:** the wake's triggering message starts with the line `Trigger: timer.`. Never in a webhook wake, a manual wake or a wake started by a phase report. It is also skipped when the board read failed, when `reconcileMinutes` is a gap, and in a wake that found the [end of the board](#end-of-the-board), which disables both triggers itself. The wake report's Triggers section then says "automatic check: not run, <reason>"; in a timer wake whose condition does not hold, "automatic check: no missed event".

### The candidate events

The events are the board's issue closes (`closedAt`) and the merges of their closing pull requests (`mergedAt`), from `<work>/board.json`, each with its issue's repository. Only those more than `reconcileMinutes` ago are candidates:

```bash
jq --argjson r "$(jq .reconcileMinutes <work>/settings.json)" '
  def t: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
  (now - $r * 60) as $cut
  | [ .[] | select(.content.__typename == "Issue") | .content as $c | $c.repository.nameWithOwner as $repo
      | ( (select($c.state == "CLOSED" and $c.closedAt != null)
            | {repo: $repo, event: "\($repo)#\($c.number) closed", at: ($c.closedAt | t)}),
          ($c.closedByPullRequestsReferences.nodes[]? | select(.mergedAt != null)
            | {repo: $repo, event: "pull request #\(.number) merged for \($repo)#\($c.number)", at: (.mergedAt | t)}) ) ]
  | map(select(.at < $cut)) | unique_by(.event)' <work>/board.json > <work>/events.json
```

No candidate: the condition does not hold, and no thread is read.

### The backward scan

The bounds come from this thread's own messages. Read them newest first: call `t3_thread_read` with `threadId` `<conductor id>`, `view` `"messages"`, `limit` 100, `runLimit` 50 and `maxCharsPerItem` 20000, and write each answer's `items` to `<work>/scan-<k>.json`, with `<k>` 1, 2, …. For the next page, call again with `beforePosition` set to the answer's `earlierPosition`. **`view` `"messages"`** returns only the user and assistant messages, the only items the scan reads; `"activity"` also returns every tool call and its output, which made one page of a long conductor thread too large to read (live proof of 2026-11-27). **`runLimit` 50 is required:** without it the tool returns only the current run, and the scan silently misses the earlier onboarding, trigger-check and register reports. It is the host's maximum; a report older than 50 runs is out of the scan's reach, and the report says so. Join the text of an item with `textTruncated` true as [Collect](run-github.md#collect) does. After each page, run:

```bash
cat > <work>/missed.jq <<'EOF'
def t: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
def at: .updatedAt | t;
def lines: (.text // "") | split("\n") | map(rtrimstr("\r") | gsub("^\\s+|\\s+$"; ""));
def own: .type == "assistant_message";
(map(select(.position != null)) | sort_by(.position) | reverse) as $all
| ([$all[] | select(.type == "user_message" and (.senderThreadId // "") == "" and ((lines | first) == "Trigger: webhook.")) | at] | max) as $hook
| ([$all[] | select(own and (lines | any(startswith("## Onboarding:")))) | at] | max) as $onboard
| ([$all[] | select(own and (lines | any(. == "## Trigger check"))) | at] | max) as $check
| (first($all[] | select(own) | lines | map(select(startswith("Webhook owner steps:"))) | select(length > 0) | last) // null) as $steps
| (if $steps == null then null
   else $steps | ltrimstr("Webhook owner steps:") | gsub("^\\s+|\\s+$"; "")
        | if . == "none" or . == "" then [] else split(",") | map(gsub("^\\s+|\\s+$"; "") | ascii_downcase) end end) as $skip
| ([$all[] | at] | min) as $oldest
| ([($hook // empty) + 120, ($onboard // empty), ($check // empty)] | max) as $lower
| [$events[0][] | select($lower == null or .at > $lower)
                | select($skip == null or ((.repo | ascii_downcase) | IN($skip[]) | not))] as $left
| {lastWebhookRun: $hook, lastCheck: $check, onboarding: $onboard, ownerSteps: $skip,
   done: (($left | length) == 0 or $start or ($steps != null and $oldest != null and $oldest < ($left | map(.at) | min))),
   counted: (if $onboard == null and $start then [] else $left end)}
EOF
jq -s 'add | unique_by(.position)' <work>/scan-*.json \
  | jq --slurpfile events <work>/events.json --argjson start <true when earlierPosition is null, else false> -f <work>/missed.jq
```

- **The bounds.** An event counts only when it is later than all three: the last run of this thread whose message starts with `Trigger: webhook.`, plus the 120 s coalesce window (so an event within 120 s of a webhook run never counts); the last report headed `## Trigger check`; and the newest onboarding report (a heading starting `## Onboarding:`), which is when the triggers were created.
- **The owner-steps exclusion.** An event in a repository listed on the newest `Webhook owner steps:` line never counts: that repository has no hook to deliver it.
- **Which items.** A webhook run is a `user_message` without `senderThreadId` whose first line is `Trigger: webhook.`. A report is an `assistant_message` of this thread; other items, such as command output that prints this file, never count. An item's time is its `updatedAt`.
- **When to stop.** Read the next page while `done` is false. The scan stops at the older of the oldest candidate event still left and the newest report with a `Webhook owner steps:` line, or at the start of the thread. A page that holds a check or an onboarding report drops every older event, so the scan rarely goes past the last check.
- **No onboarding report** in the whole thread: no event counts.

The condition holds when `counted` of the last run is not empty. Each counted event names its repository.

### The unattended form

When the condition holds, run [Check the triggers](#check-the-triggers), steps 1 to 4, after Start, with these limits:

- It only updates, re-enables or creates the timer, and updates or re-enables the webhook trigger. It never calls `request_secret`, never creates the webhook trigger and never runs Register the webhook.
- **A missing webhook trigger** becomes the owner step "run: check the triggers".
- **When both triggers were fine** (every compare had no difference and both were enabled), add one owner step per repository of the counted events: "deliveries missing for `<repo>`: check its GitHub webhook".
- The report is the `## Trigger check` report, with `Run: automatic, unattended`, the counted events listed under Owner steps with their times, and the `Webhook owner steps:` line repeated from the newest one, unchanged. When the webhook trigger is missing, the line is every repository of the board instead, as [Webhook owner steps](#webhook-owner-steps) step 1 says.

Because the bounds include the last check, one missed event runs the check once, not on every timer wake.

## End of the board

The board has ended when its milestones are all closed and no run is in flight. Then the wake stops starting work, disables both triggers and settles its own thread. (Spec: End of the board.) Anchor: `#end-of-the-board`.

### The condition

It is judged on the board read again after Repair and Settle ([Read again](run-github.md#read-again)). A failed board read means the board has not ended. All three must hold:

1. every milestone that holds an item of the board, open or closed, is closed;
2. at least one such milestone exists;
3. no open board issue is assigned to the agent or has a "Run thread" whose thread is not settled.

```bash
jq -r --arg agent <agent> '
  [.[] | select(.content.__typename == "Issue")] as $issues
  | [$issues[] | select(.content.milestone != null)
      | {key: "\(.content.repository.nameWithOwner)/\(.content.milestone.number)", state: .content.milestone.state}]
    | unique_by(.key) as $ms
  | ($ms | map(select(.state != "CLOSED") | "open milestone \(.key)")[]),
    (select(($ms | length) == 0) | "no milestone"),
    ($issues[] | select(.content.state == "OPEN") | .content as $c
      | select(any($c.assignees.nodes[]?; .login == $agent)) | "in flight \($c.repository.nameWithOwner)#\($c.number): assigned to the agent"),
    ($issues[] | select(.content.state == "OPEN" and ((.runThread.text // "") != ""))
      | "thread \(.content.repository.nameWithOwner)#\(.content.number) \(.runThread.text)")' <work>/board.json > <work>/end.txt
```

A milestone is named by its repository and number, since two repositories may both have a milestone 1. Then for each `thread <repo>#<issue> <id>` line, call `t3_thread_read` with `threadId` `<id>` and `limit` 1. `thread.settled` true removes the line. A settled-false thread, an error or `thread_not_found` keeps it: such a line means the board has not ended. The board has ended exactly when no line is left.

While any such milestone is open, the triggers stay enabled, even with no open item. A closed milestone sends no subscribed event, so the timer wake usually finds the end.

### When it holds

1. **Start does not run.** Advance still runs, so a report from a last thread is answered.
2. **After Advance, disable both triggers.** Call `list_scheduled_tasks` and select them as in [Check the triggers](#check-the-triggers), steps 1 and 2. For each one that is enabled, call `schedule_task` with `scheduledTaskId` `<id>` and `enabled: false`, and nothing else. Never delete a trigger. Read back with `list_scheduled_tasks`: `enabled` is false. A missing trigger is reported as such.
3. **Report it.** The wake report's Triggers section says: "End of the board: every milestone is closed and no run is in flight. Both triggers are disabled. To resume after reopening a milestone, tell this thread: check the triggers." Under Not started, say that Start did not run.
4. **Settle this thread.** As the last tool call of the wake, call `t3_thread_organize` with `action` `settle` and no `threadId`. Settling this thread applies at turn end, after the report. Never archive this thread.

A failed disable or a failed read-back is reported, and this thread is not settled, so the next wake tries again. "Check the triggers" re-enables the triggers only after a milestone of the board has been reopened, because a disabled trigger stays disabled while the board has ended.
