## MODIFIED Requirements

### Requirement: Webhook secret from the owner
The procedure SHALL ask the owner for the webhook secret with `request_secret` only when it creates something that needs the secret:
- with a `secretRef` when it creates the webhook trigger;
- with file delivery when it creates or updates a hook in a repository where the agent is an admin.

It MUST NOT generate, print or store the secret. When the webhook trigger is created in this run, the procedure SHALL run Register the webhook for each repository of the board with the new URL.

On a repeat run that reuses the webhook trigger, the URL is not known, because only creation returns it. The run then MUST NOT ask for a secret and MUST NOT register hooks. It MUST carry the `Webhook owner steps:` list from the newest onboarding, check or register report in this thread, and add every repository of the board that none of those reports covered. It MUST read the thread's messages (`view` `"messages"`), newest first, and MAY stop once it has the newest such report and every repository of the board is named by a report read.

#### Scenario: Onboarding the scratch board
- **WHEN** onboarding runs on the scratch board, where the agent is an admin of the repository
- **THEN** both triggers exist, bound to the conductor thread, and the repository has one hook with the trigger's URL

#### Scenario: Repeat run
- **WHEN** onboarding runs again in the conductor thread of an onboarded board
- **THEN** no `request_secret` card appears, no hook is written, and the report repeats the `Webhook owner steps:` list
