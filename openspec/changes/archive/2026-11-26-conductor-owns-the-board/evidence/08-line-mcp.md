# Task 8.7: register the webhook on a repository where the agent is not admin

The conductor thread received:

```text
register the webhook for raidenyn/line-mcp with URL
https://relay.t3.codes/v1/hooks/8e65538a31c6ba7b/scheduled-task%3A5e9f87cb-f877-44fb-8b7d-9c5d15e39ca8/PpOpjAeZDNr9G7TkBhXU-DQT5GMc33-gHX134IVMQ4A
```

It read the agent's permission first: `raidenyn-shadow` has `push` but not `admin` on
`raidenyn/line-mcp`. It asked for no secret, read no hook and wrote nothing. Its report:

```text
## Register the webhook: raidenyn/line-mcp

Result: owner step, not an admin — the agent account `raidenyn-shadow` has `push` but not
`admin` on raidenyn/line-mcp, so no secret was requested and no hook was read or written.

Webhook for raidenyn/line-mcp (owner step):
1. Open https://github.com/raidenyn/line-mcp/settings/hooks. If a webhook with the payload URL
   below exists, edit it; otherwise choose "Add webhook".
2. Payload URL: https://relay.t3.codes/v1/hooks/8e65538a31c6ba7b/scheduled-task%3A5e9f87cb-f877-44fb-8b7d-9c5d15e39ca8/PpOpjAeZDNr9G7TkBhXU-DQT5GMc33-gHX134IVMQ4A
3. Content type: application/json
4. Secret: the secret you gave at onboarding
5. Which events: "Let me select individual events", then tick "Issues" and "Pull requests"
   and nothing else.
6. Active: ticked. Save.

Webhook owner steps: raidenyn/line-mcp
```

`gh api repos/raidenyn/line-mcp/hooks` was not called; no hook was created or changed.
