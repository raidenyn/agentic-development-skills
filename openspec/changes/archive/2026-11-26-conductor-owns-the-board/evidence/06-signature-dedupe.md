# Task 8.5: signature and dedupe (2026-11-26)

## Signature

The webhook trigger has `signature: {header: x-hub-signature-256, encoding: hex, prefix: sha256=}`
and `webhookSignature: set`. A GitHub-signed delivery (the B1 close) started a webhook wake,
so a valid signature works end to end.

A hand-made delivery with a wrong signature was rejected at the relay:

```text
POST <webhook URL>
x-github-event: issues
x-github-delivery: wrong-signature-proof-2026-11-26
x-hub-signature-256: sha256=0000…0000
body: {"action":"closed","issue":{"number":1}}

HTTP 401
{"error":"invalid_signature"}
```

No wake was created. This proves the wrong-signature half.

## Replay

Task 0 proved the replay key `{{headers.x-github-delivery}}` on the throwaway trigger: a
second delivery with the same `x-github-delivery` id did not start a second run
(`evidence/00-trigger-syntax.md`, rounds 1 and 3). The same `replayKey` is on the scratch
trigger.

A redelivery through GitHub's hook API was attempted, but the `gh` token lacks the
`admin:repo_hook` scope:

```text
POST repos/raidenyn-shadow/task-run-scratch/hooks/717162700/deliveries/3856257449747022000/attempts
gh: This API operation needs the "admin:repo_hook" scope.
```

So the redelivery test is reported as not runnable with this account, not as a failure of the
replay key. The Task 0 curl delivery remains the replay evidence.

## Coalesce

The host rejects `schedule.dedupe.coalesceKey`:

```text
Invalid parameters for tool 'schedule_task':
Expected <filter> at ["schedule"]["dedupe"]["coalesceKey"]
```

The trigger therefore carries `replayKey` and `coalesceWindowSeconds: 120`, but no
`coalesceKey`. A merge that closes its issue and its pull request sends two deliveries with
different delivery ids, so they are not replayed; the two events can start two wakes. Both
wakes read the same board and are harmless, but the coalesce behavior described by the task
is not available on this host. The onboarding and the automatic trigger check both report
this as an owner step.

## Answer for the pull request

- A delivery with a valid GitHub signature starts a wake; a wrong signature is rejected with
  HTTP 401.
- The replay key suppresses a repeated delivery id; the Task 0 curl test proves it, and the
  GitHub redelivery API needs a scope this account does not have.
- The constant coalesce key cannot be set because this host rejects the field. Two events
  inside one 120 s window are not merged; this is a host limitation, not a conductor choice.
