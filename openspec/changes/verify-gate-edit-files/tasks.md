## 1. Config key

Tick a group's boxes only after its tests pass, because every tick starts this repo's full check.

- [ ] 1.0 Bump `src/verify-gate/tool.json` to `0.2.0` first. Run `pnpm run harness:update`, never `pnpm run build` alone, before tests and commits, and commit the regenerated assets and `.agents/harness` with each change. This repo's own gate runs `pnpm run check`, which includes `vendored.test.mjs`
- [ ] 1.1 Add `editFiles` to `CONFIG_KEYS`, an `editFiles: string[] | null` field to `GateConfig` and `normalizeConfig`, and the `configErrors` check ("must be a non-empty list of glob strings") in `src/verify-gate/lib/gate.mts`
- [ ] 1.2 Make `configHash` append `editFiles` only when it is set, so a section without it keeps its current hash
- [ ] 1.3 Tests:
  - `check` rejects `editFiles` given as `"**/*.ts"`, `[]` or `[""]` and accepts a valid list (`cli-verify.test.mjs`).
  - Update the `CONFIG_KEYS` assertion.
  - A hash test shows that a section without the key keeps the `0.1.2` hash (a hex literal from the 0.1.2 build), and that setting or changing the key changes it.

## 2. Edit filter

- [ ] 2.1 Add `matchesPathGlob(pattern, relPath)` to `src/verify-gate/lib/triggers.mts`. It matches segment by segment like the task-file walker: `.` and empty segments are dropped, `**` as a whole segment matches zero or more segments, and any other segment matches one segment through a local segment regex (`*` → `[^/]*`, `?` → `[^/]`, the rest escaped), not `matchesGlob`, which rewrites `\` in the path. Only the pattern has `\` turned into `/`; the path is split on `/` only, as the adapters deliver it. Unit tests in `triggers.test.mjs` cover `src/**.ts`, `src/**`, `./src/**/*.ts`, a backslash in a pattern, a backslash in a file name, a newline in a file name, a root file, `?`, and a fast `false` for twelve `**/x/` segments against 50 nested `x/` directories. The recursion is memoized by pattern and path index
- [ ] 2.2 In `afterTool` (`src/verify-gate/handler.mts`), after the tick branch, keep only the edited files that match `editFiles`. Keep all of them when the key is absent. When `event.files` is non-empty and none are left, trace `edit-skipped` and return `null` before any `runGate`
- [ ] 2.3 Handler tests in `verify-handler.test.mjs`. Count calls to the injected `spawn`, and count `r.log()` lines too:
  - outside the scope: zero spawns, `null`, and `edit-skipped`;
  - `src/a.ts` and `root.ts` run;
  - a mixed call runs only the `.ts` file;
  - a root file named `src\a.ts` with `src/*.ts` is skipped;
  - a tick in `openspec/changes/x/tasks.md` still runs `task`;
  - a `tool.after` with empty `files`, a valid command and no tick returns `null` with no trace;
  - an unset command still throws;
  - a shell call with a tick still runs `task`;
  - without the key, a Markdown edit runs as before;
  - in `verify-proof.test.mjs`, a sequence test with a constant injected content key: after adding the key, the proof reports a config change, a Markdown edit is still skipped, the next turn end runs and `verify-pass` then holds, and the turn end after it skips
- [ ] 2.4 Host test in `verify-hosts.test.mjs`. With `AGENT_HARNESS_TRACE=1` and `editFiles: ["**/*.ts"]`, a Claude `PostToolUse` Edit of a Markdown file exits 0, prints no output and adds no `verify.log` line. Its trace line has `outcomes['verify-gate'] === 'edit-skipped'`

## 3. Docs and checks

- [ ] 3.1 Update `skills/agent-harness-verify-gate/SKILL.md`:
  - an `editFiles` row in "Config keys";
  - the "Edit" bullet says only files in `editFiles` run;
  - a "Making it fast" step to set `editFiles`, which notes that the hook process still starts;
  - "Every trigger first compares", "Every other trigger runs" and "Any change to the section" reworded to "every trigger that reaches the gate";
  - the two warnings that the command runs "on the first edit" say "on the first edit in scope" (the warning about untrusted hooks stays as strong);
  - Onboard step 3 names `editFiles`, and "Verify live" says to break the command with an edit of a file in `editFiles` when it is set;
  - `edit-skipped` in the trace outcomes of "Verify live"
- [ ] 3.2 Run `pnpm run harness:update`, and check that `lock.json` already has `verify-gate` at `0.2.0`
- [ ] 3.3 `pnpm run check`, `python3 scripts/skills.py validate`, `claude plugin validate .` and `python3 -m unittest discover -s scripts -p 'test_*.py'` pass

## After the merge (not tracked here)

The Pages release is the manual `release.yml` run on `main`. Only the owner runs it, or someone they give the go-ahead. Issue #60 keeps its criterion "released in the Pages catalog" open until the release link is posted there, together with a check that the published `agent-harness-verify-gate` skill contains `assets/verify-gate/tool.json` at `0.2.0`. The catalog shows the repo release version, not the tool version. The PR reports it as "not done: waits for the release after the merge".

Size: #60 says S (about 120 lines, 6 files). This change edits about 10 files, mostly tests. The PR reports the overrun under "Anything that differs from this task".

Discovered on the way: the task-file walker does not enumerate files beneath a directory for a trailing `**` (for example `taskFiles: ["openspec/**"]`). Propose it as a new task.
