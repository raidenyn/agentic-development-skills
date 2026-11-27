## Context

See `brainstorm.md`. The evidence is the conductor thread of board 4, `mcp:launch:165177550fb7692a21b880e8729f18ea07763408a1b4f4a9b432f8c741a732ae`: the first onboarding report at position 58, the owner's "done" message at 84, the improvised register report at 98, and the second onboarding report at 236.

## Goals / Non-Goals

**Goals:** make the reference match what the host accepts, make the scans readable in a long thread, and define the owner-done result.

**Non-Goals:** persisting the scan state on the board; the wake inbox read, which stops at the claim time and stays on `activity`.

## Decisions

- The hook is matched by the `/scheduled-task%3A<uuid>/` part of its URL, without case, because the URL itself is returned only at creation.
- The onboarding carry may stop early, because older pages can change neither the newest list nor the set of repositories already named.

## Risks / Trade-offs

- Coalescing is per hook, not per board. Two wakes for one event across two repositories are harmless.
- The owner's word without admin is unchecked. The automatic check covers a hook that does not deliver.
