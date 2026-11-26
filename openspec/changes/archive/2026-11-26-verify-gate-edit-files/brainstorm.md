## Design Summary

Task: [#60 Skip the edit trigger for files the command does not check](https://github.com/raidenyn/agentic-development-skills/issues/60) (M1 Verify on three triggers, Size S).

Today every edit runs the verify command with `VERIFY_TRIGGER=edit`, even for a file the command then ignores (Markdown in a TypeScript repo, Kotlin in veles). That costs about 0.45 s per edit in veles (raidenyn/veles-android#197) and buys nothing. A repo should be able to say which files the edit run is for.

The gate gets a new optional key `editFiles` in the `verify-gate` section: a non-empty list of globs with the `taskFiles` syntax (`*` within one segment, `**` across segments, `?` one character). They are matched against the repo-relative paths in `event.files` with a small `matchesPathGlob` that matches segment by segment, as the task-file walker does. It drops `.` and empty segments, treats `**` as recursive only when it is a whole segment, and matches every other segment against exactly one path segment. So `./src/**/*.ts` and `src/**.ts` mean the same in both keys.

- Absent: every edited file runs the edit check, as today.
- Set: in `afterTool`, after tick detection and before any `runGate` call, edited files that match no glob are dropped. If the call reported files and none are left, the handler returns `null` and traces `edit-skipped`. The verify gate spawns no process: neither the command nor the git calls for the content key (the hook process and the runtime's own state lookup still run). A call with no files at all, and a config with no command, behave as today. If some files match, only those run, and the trace keeps its current outcomes (`ran`, `no-change`, `contended`).
- Tick detection runs first and is untouched. A tick in a file outside `editFiles` still starts the full `task` run, because the before-image and `detect` do not look at `editFiles`.
- Shell calls and turn end are untouched: `editFiles` only narrows the edit trigger.
- `check` (`configErrors`) accepts the key and rejects a value that is not a non-empty list of non-empty strings, with the same wording as `taskFiles`. Unknown keys are still rejected; `CONFIG_KEYS` gains `editFiles`.
- `configHash` covers `editFiles` only when it is set. Adding the key changes the hash, so the next trigger that reaches the gate runs the command (an excluded edit does not reach it). This is how the task's assumption reads under the filter. Configs without the key keep their current hash, so upgrading invalidates no pass record.
- The skill's "Config keys" table gets a row, the "Edit" bullet and "Making it fast" mention the key, the config-change line says "the next trigger that reaches the gate", and the trace line gains `edit-skipped`.
- `src/verify-gate/tool.json` goes from `0.1.2` to `0.2.0` (a new, additive config key), then `pnpm run harness:update`.

## Alternatives Considered

### Alternative A: Filter inside `runGate` (gate.mts)
- **Approach**: pass `editFiles` through `runGate` and return a new status such as `filtered` before the content key is taken.
- **Pros**: the gate library owns all "should I run" decisions, and the CLI could reuse it.
- **Cons**: adds a status to `GateResult` that every caller must handle. The CLI never runs `edit`, so nothing reuses it. The handler still loops per file.
- **Why not chosen**: more surface for no gain. The handler already decides which trigger runs, so the file filter belongs there.

### Alternative B: Leave it to the command (status quo plus docs)
- **Approach**: document an early `case` on `VERIFY_FILE` in the verify script.
- **Pros**: no code change.
- **Cons**: still spawns a process and takes the content key on every edit, which is the 0.45 s cost the task removes.
- **Why not chosen**: it does not meet the outcome ("starts no process").

### Alternative C: Exclusion globs (`editIgnore`)
- **Approach**: list the files to skip instead of the files to check.
- **Pros**: a short list in repos where most files are checked.
- **Cons**: a new file type (a new doc format, a generated file) runs by default, and the list grows without end. Its meaning is the inverse of `taskFiles`.
- **Why not chosen**: the command checks a known set of types, so an allow list says what the repo means. The task text also asks for a list of globs the edit trigger runs for.

## Agreed Approach

Alternative-free main path: an `editFiles` allow list, applied in the handler's `afterTool` after tick detection and before `runGate`, as in the Design Summary. It is the smallest change that meets every acceptance criterion: no spawn for files outside the list, ticks still caught, behaviour unchanged without the key. It also stays inside the frozen Vendored tool layout contract, since it adds a key to the tool's own section of `.agents/harness.json`.

The approach and the key name are my calls, made from the task text. The plan goes to the owner for review before anyone implements it.

## Key Decisions

- **Key name `editFiles`.** It mirrors `taskFiles` (same syntax, same shape), and it is the name the task suggests. This was the task's only open choice.
- **Trace outcome `edit-skipped`.** It is traced only when every edited file was filtered out. Mixed calls keep the current outcomes, so existing traces read the same.
- **Filter before any spawn.** The filter runs before `runGate`, so the content key's git calls are skipped too, not just the command.
- **Ticks first.** The filter sits after the tick branch, so a tick in any task file still starts the `task` run.
- **Hash only when set.** `configHash` appends `editFiles` only when it is present, so upgrading the tool does not invalidate existing pass records. Adding or changing the key does change the hash.
- **Same glob meaning as `taskFiles`.** A new `matchesPathGlob` matches segment by segment like the task-file walker (`.` dropped, `**` recursive only as a whole segment), so the two keys read the same. Tick detection is unchanged. A trailing `**` matches the files under it. The walker does not list them, which is a separate bug, proposed as a follow-up.
- **Spec deltas.** "Edit trigger", "Ticked task trigger", "Tick detection by item identity" and "No-change shortcut" are MODIFIED to refer to the edit scope. "Edit trigger scope", "editFiles glob matching" and "editFiles config key" are ADDED.
- **Version `0.2.0`.** This is a new config key and a minor feature for the tool. The repo release itself (semantic-release, `release.yml` on `main`) runs by hand after the merge. It is a post-merge handoff, not an implementation task.

## Open Questions

- The Pages release is a manual workflow run on `main` after the merge. The criterion "released in the Pages catalog" stays open on #60 until the release link is posted. The owner runs it, or gives the agent the go-ahead.
