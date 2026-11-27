## Design Summary

The owner asked to title the conductor thread `<board title> Conductor`, for example `Bank MCP Conductor`, instead of `project-conductor <board URL>`. Until now the title was the only place a wake read the board from, so the board needs a new source. The owner chose the thread's first message: onboarding always starts with `/project-conductor <board URL>`, and T3 returns that message at position 0 with `t3_thread_read` (`view` `"messages"`, `afterPosition` -1, `limit` 1). That first line is the **launch line**. The title becomes a label: a wrong title is a gap that the wake reports and goes past.

## Alternatives Considered

### Alternative A: Board URL in the trigger prompts
- **Approach**: the timer and webhook prompts carry the board URL.
- **Pros**: no thread read.
- **Cons**: it drops the rule that a prompt never carries the board URL. The live triggers would have to be recreated, which needs a new secret and the owner re-adding every webhook. A manual wake would have no board.
- **Why not chosen**: the owner chose the launch line.

### Alternative B: Search the owner's boards for the thread id
- **Approach**: each wake looks for the board whose readme block names this thread.
- **Pros**: no new name.
- **Cons**: the owner is unknown without the URL, and every wake makes more calls.
- **Why not chosen**: cost, and no owner to search.

## Agreed Approach

The launch line is the board's source. The block's `conductor` still guards against a second conductor. The title is `<board title> Conductor`: onboarding writes it, and a wake reports it as a gap when it differs, for example after a board rename or on a conductor that still has the old title.

## Key Decisions

- The launch line accepts `/project-conductor` and the plugin form `/project-conductor:project-conductor`, then the URL, optionally followed by more text.
- Onboarding stops in a thread without a launch line for this board, because later wakes could not find the board.
- The one-conductor search looks for the new and the old title. A match whose launch line names another board that happens to have the same title is not a conflict.
- Conductors titled before this change keep working, because their first message is the launch line. The next onboarding renames them.

## Open Questions

- none
