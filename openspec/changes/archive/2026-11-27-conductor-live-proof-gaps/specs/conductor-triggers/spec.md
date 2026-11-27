## MODIFIED Requirements

### Requirement: Two triggers bound to the conductor
The conductor SHALL have exactly two T3 scheduled tasks bound to its own thread (`bindToCurrentThread: true`), each with a fresh session (`freshSession: true`):
- `project-conductor webhook`:
  - a `webhook` schedule;
  - filters `headers.x-github-event` in `issues`, `pull_request`, and `body.action` equals `closed`, and no filter on `merged`. A merged filter would drop every issue delivery (evidence `00-trigger-syntax.md`), so an unmerged close wakes the conductor, which finds nothing to do;
  - an HMAC signature on header `x-hub-signature-256`, with prefix `sha256=` and hex encoding;
  - `replayKey` `{{headers.x-github-delivery}}`, and `coalesceKey` `{{headers.x-github-hook-id}}` with a 120 second window. The key is constant for one repository's hook; the host rejects a literal key;
  - `maxDeliveryAgeMinutes` equal to `reconcileMinutes`.
- `project-conductor timer`: an `interval` schedule of `reconcileMinutes` × 60000 ms.

Each prompt MUST be one line `Trigger: webhook.` or `Trigger: timer.`, followed by the wake sentence "Run one wake of the project-conductor skill for this board." A prompt MUST NOT carry the board URL.

#### Scenario: Issue closed in a repository of the board
- **WHEN** an issue closes in a repository whose GitHub webhook points at the trigger's URL with the right secret
- **THEN** one run starts in the conductor thread with a fresh session, and its message starts with `Trigger: webhook.`

#### Scenario: Event that does not match
- **WHEN** a delivery has `body.action` `opened`
- **THEN** no run starts

#### Scenario: Pull request closed without a merge
- **WHEN** a pull request of a repository of the board closes unmerged
- **THEN** one run starts and finds nothing to do

#### Scenario: Repeat onboarding compares the webhook trigger
- **WHEN** onboarding or a trigger check compares a webhook trigger created with `coalesceKey` `{{headers.x-github-hook-id}}`
- **THEN** the compare reports no difference in `dedupe`, and no owner step is reported for it

### Requirement: Register the webhook for one repository
The procedure "Register the webhook" SHALL take one repository, the trigger's URL, and the secret, which the owner gives through `request_secret` with file delivery. The steps are:
1. Read the agent's admin permission on the repository first. Without admin, ask for no secret.
2. With admin, list the repository's hooks. A hook whose `config.url` equals the URL MUST be reused, with its events set to `issues` and `pull_request`. Otherwise one hook MUST be created with that URL, the secret, `content_type` `json`, and those two events.
3. Without admin, or when a write is refused, nothing else MUST be tried. The report MUST give the owner's steps: the repository's webhook settings page, the payload URL, the content type `application/json`, "the secret you gave at onboarding", and the events "Issues" and "Pull requests".

When the owner says in the conductor thread that they added a hook that was an owner step, Register the webhook SHALL run again for that repository without a URL or a secret:
- With admin, it MUST find the hook whose URL holds the webhook trigger's id. Found, active and with the two events, the result is `reused <id>`; otherwise it stays an owner step.
- Without admin, it MUST NOT read or write hooks. The result is `done by the owner, not checked: not an admin`.

Either result removes the repository from the `Webhook owner steps:` list.

The secret MUST NOT be printed or stored by the conductor. A standalone run of Register the webhook MUST end with a report that holds the `Webhook owner steps:` line, listing every repository whose registration is an owner step after this run.

#### Scenario: Repository where the agent is not an admin
- **WHEN** the owner asks to register the webhook for `raidenyn/line-mcp`
- **THEN** nothing is written, no secret is asked for, and the report holds the owner's steps with the URL and the events

#### Scenario: Hook already present
- **WHEN** the agent is an admin and the repository already has a hook with the trigger's URL
- **THEN** that hook is reused and no second hook is created

#### Scenario: Owner added the hook by hand
- **WHEN** the agent is not an admin of `raidenyn/line-mcp` and the owner says "Add the GitHub webhook for raidenyn/line-mcp - done"
- **THEN** the report reads `Result: done by the owner, not checked: not an admin`, nothing is written, and its `Webhook owner steps:` line no longer names `raidenyn/line-mcp`

### Requirement: Automatic trigger check on a missed event
A timer wake SHALL run the trigger check, after its steps and in its unattended form, when the board shows an issue closed or a pull request merged that:
- happened more than `reconcileMinutes` ago;
- happened after the last run of this thread whose message starts with `Trigger: webhook.`;
- happened after the last report headed `## Trigger check`;
- happened after the newest onboarding report in this thread, which is when the triggers were created.

These events MUST NOT count:
- events within 120 seconds of a webhook run;
- events in a repository whose Register the webhook is an owner step in the newest onboarding or check report.

Every onboarding and check report MUST repeat the full list of such repositories. The unattended form MUST NOT ask for a secret:
- A missing webhook trigger is reported as the owner step "run: check the triggers".
- When the triggers are fine, the report adds "deliveries missing for `<repo>`: check its GitHub webhook".

The scan for these bounds MUST read the thread's messages (`view` `"messages"`), not its tool activity.

Webhook wakes and manual wakes MUST NOT run the check.

#### Scenario: Lost delivery
- **WHEN** a blocker closes while the repository's GitHub hook is inactive
- **THEN** the first timer wake after the close starts the unblocked task
- **AND** the first timer wake that comes more than `reconcileMinutes` after the close runs the automatic check
- **AND** no later timer wake runs the check again for that close

#### Scenario: Repository whose hook is an owner step
- **WHEN** the newest report's `Webhook owner steps:` line names `raidenyn/line-mcp` and an issue closes there
- **THEN** no timer wake runs the automatic check for that close

#### Scenario: Long conductor thread
- **WHEN** the conductor thread holds many wakes with large tool output
- **THEN** the scan reads only messages, and each page fits the tool's answer
