## Context

See `brainstorm.md`. The first message of the Bank MCP conductor reads `/project-conductor https://github.com/users/raidenyn/projects/4`, at position 0.

## Decisions

- The read is `t3_thread_read` with `view` `"messages"`, `afterPosition` -1, `limit` 1 and `maxCharsPerItem` 2000. Its one item must have `position` 0.
- The parser is a single `sed -nE` on the first line. It was checked on four lines: the plain form, the plugin form with a trailing slash and extra text, a number with a suffix (rejected), and free text (rejected).

## Risks / Trade-offs

- A thread started some other way cannot become a conductor. Onboarding says so and tells the owner to start a new thread.
- Two boards with the same title give two conductors with the same title. The launch line tells them apart.
