# Task 8.4: webhook and timer proofs (in progress)

## Webhook start: B1 → T1 (pass)

- B1 `raidenyn-shadow/task-run-scratch#26` was closed at 16:06:29Z.
- The webhook delivered at 16:06:32Z: a wake with `Trigger: webhook.`.
- The wake started T1 `#27` at 16:07:59Z on branch
  `feat/27-t1-webhook-started-greeting`, thread
  `mcp:launch:1657b7a22266f589c34e34dea110aef5f53f0dc9c11ea5adbd91caa4de9b9e1d`.
- T1's plan thread sent its plan report at 16:12:24Z; the next wake switched it to
  `implement` and sent the apply instruction.
- T1 opened PR #31. The PR was marked ready and merged at 16:16:42Z; it closed #27 at
  16:16:43Z. The conductor settled T1's thread.

## Lost-delivery attempt: B2 → T2 (did not lose the delivery)

- B2 `#28` was closed at 16:09:20Z, with hook `717162700` set `active: false` immediately
  before and `active: true` again at 16:09:22Z.
- The close was nevertheless delivered by the webhook at 16:09:23Z. A webhook wake started
  T2 `#29` on branch `feat/29-t2-intentionally-oversized-task`, thread
  `mcp:launch:3f032e9b909ae7b706cbef318a5828471803feec3f5ae40076f933a669592119`.
- The timer wake at 16:14:18Z reported:

  ```text
  ### Triggers
  - automatic check: no missed event. The only closed issues (#26 at 16:06:29Z, #28 at
    16:09:20Z) both predate the last webhook run (16:09:23Z) plus its 120 s coalesce window.
  ```

This attempt did not prove timer recovery: the hook was disabled for only ~2 seconds, and
the delivery was queued until it was re-enabled. The plan's sequence (disable, close,
re-enable) is not enough on this host. The corrected attempt keeps the hook disabled until
after the timer has started the task.

## Corrected attempt: B3 → T3 (pass)

- B3 `#32` and T3 `#33` were created in milestone `M1 scratch`, keyed
  `scratch-rfc/m1-scratch/36` and `/37`; T3 is blocked by B3.
- An earlier B3 close at 16:18:16Z was reopened because queued report and webhook wakes could
  still start T3 before a timer wake; the timer was paused and the queue cleared.
- The final attempt: the hook was disabled at 16:32:22Z, B3 was closed at 16:32:22Z, and the
  timer was enabled at 16:32:24Z (next run 16:34:26Z). No webhook message existed for the
  close.
- Timer wake run 25 at 16:34:30Z started T3:
  `mcp:launch:e98dc47e0da81a297c07639c03b94fee4b59883b01c628236a85a705605a4966`,
  branch `feat/33-t3-timer-recovered-task`.
- The same timer wake ran the automatic trigger check once:

  ```text
  ## Trigger check
  Run: automatic, unattended
  - Timer: ok
  - Webhook trigger: failed — the host rejects schedule.dedupe.coalesceKey ...
  - Webhooks: none run
  ### Owner steps
  - Missed delivery: task-run-scratch#32 closed at 2026-11-26T16:32:22Z, later than the last
    webhook run (16:22:01Z, plus the 120 s coalesce window) ...
  Webhook owner steps: raidenyn-shadow/task-run-scratch-2
  ```

  This is the lost-delivery recovery: the close event was never delivered by the webhook,
  and the timer wake both started the unblocked task and ran the check.
- The timer run after that (run 26) was queued when the checkpoint was taken; no second
  automatic check had been produced. The check's own report is the newest `## Trigger check`,
  so the next wake's condition excludes the same event.
- The hook was re-enabled at 16:37:58Z; the B3 close was already older than
  `maxDeliveryAgeMinutes: 2`, so the late delivery is skipped. T3 was closed at 16:39:57Z and
  its thread archived for cleanup; the timer was paused.
- T2's plan report was answered by a queued wake; T2 moved to `implement`, created its
  follow-up `#34`, opened PR #35 and merged it (see 8.8).
