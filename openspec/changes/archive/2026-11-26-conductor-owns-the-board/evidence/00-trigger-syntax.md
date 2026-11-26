# Task 0: webhook trigger syntax (2026-11-26, T3 Code 0.1.11)

A throwaway thread in "No project" ("Proof: trigger syntax") created the webhook trigger bound to itself. Deliveries were sent with `curl`, each with its own `x-github-delivery` header. Each got HTTP 202. Results come from the thread's run list.

## Result

- **`replayKey`:** `{{headers.x-github-delivery}}` is accepted and works. A second delivery with the same id does not start a run.
- **Merged filter:** dropped. `body.pull_request.merged notEquals false` also drops every `issues` delivery, because the path is missing there. Without it, a pull request closed unmerged starts one run, which finds nothing to do.
- **Updates from another thread:** another thread can change a trigger with `schedule_task` and its `scheduledTaskId`. Only creating one needs the bound thread.

## Round 1: filters with the merged filter, replayKey `{{headers.x-github-delivery}}`

| Delivery | Event | Body | Run |
|---|---|---|---|
| d1 | issues | closed | no |
| d1 again | issues | closed | no |
| d2 | issues | closed | no |
| d3 | pull_request | closed, merged false | no |
| d4 | pull_request | closed, merged true | yes (run 2, 12:02:08) |

## Round 2: merged filter kept, no dedupe

| Delivery | Event | Body | Run |
|---|---|---|---|
| d5 | issues | closed | no |
| d6 | pull_request | closed, merged false | no |
| d7 | pull_request | closed, merged true | yes (run 3, 12:05:20) |
| d5 again | issues | closed | no |

This shows that the merged filter, not the dedupe, dropped the issue deliveries.

## Round 3: no merged filter, replayKey `{{headers.x-github-delivery}}`

| Delivery | Event | Body | Run |
|---|---|---|---|
| e1 | issues | closed | yes (run 4, 12:06:57) |
| e1 again | issues | closed | no, a replay |
| e2 | issues | closed | yes (run 5, 12:07:39) |
| e3 | pull_request | closed, merged false | yes (run 6, 12:07:59) |

## Cleanup

The trigger was deleted with `delete_scheduled_task`, and the thread was archived.
