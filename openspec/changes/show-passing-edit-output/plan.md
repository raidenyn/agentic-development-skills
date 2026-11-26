# Show the output of a passing edit run: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A passing edit run that prints something hands that output to the model after the tool call on both hosts, and this repo's own verify command stays silent on a passing edit.

**Architecture:** `runGate` already captures the output tail (`lib/run.mts` `tailOf`, 60 lines, 1 MiB) but drops it on a pass. It starts returning it, and the edit branch of `afterTool` in `handler.mts` turns a non-blank tail into a `context` note. The hosts need no change: `{ context }` at `tool.after` already becomes `additionalContext` on Claude Code and a text part in `result.content` on OpenCode. First, `scripts/verify.mts` starts capturing each edit check's output and printing it only on failure, so the refreshed gate adds no noise in this repo.

**Tech Stack:** strict TypeScript under `src/`, built by `scripts/build.mts` into committed `.mjs`; `node:test`; Biome (`--error-on-warnings`); pnpm.

**Spec:** `openspec/changes/show-passing-edit-output/specs/verify-gate-triggers/spec.md`, `openspec/changes/show-passing-edit-output/specs/code-quality-checks/spec.md`, and `brainstorm.md` in the same folder. Task list: `tasks.md`.

## Global Constraints

- The note's wording is exactly `verify: ${cmd} passed after the edit of ${file}:\n\n${tail}`, where `cmd = cfg.command.join(' ')`.
- Blank means the captured tail is whitespace only (`tail.trim() === ''`). A blank pass returns nothing (`null`), as today.
- Task and turn-end passes add nothing. A failing edit run's text is unchanged byte for byte. No existing test is edited or deleted.
- The hook handler interface, the config keys (`CONFIG_KEYS`) and the pass record stay unchanged. Add no setting.
- Edit `src/` only, never `skills/*/assets/` or `.agents/harness/`.
  - Bump `src/verify-gate/tool.json` once, to `0.1.3`, and run `pnpm run harness:update` in the same task as the source change, so `vendored.test.mjs` never sees the installed copy behind the assets.
  - If `main` already carries `verify-gate` 0.1.3 when you rebase, take the next version in `tool.json` and in the SKILL sentence, then run `pnpm run harness:update` again.
- `tests/agent-harness/*.mjs` must not import `.mts`: CI runs them on Node 22.0.0.
- In test strings that hold shell, write `$VERIFY_FILE` without braces. Biome's `noTemplateCurlyInString` warns on `${…}` in a plain string.
- Tick a `tasks.md` group in one edit, only after the matching plan Task's last step passes. Each tick starts a full verify run here.
- **Flaky tests.** `pnpm run check` has two flaky tests under heavy load: `verify-handler.test.mjs` "a timed-out handler (signal aborted) writes no pass record", and the `opencode-adapter.test.mjs` budget test "run 1 had its full budget". If one fails, rerun that file alone before treating it as a regression, and list both as a proposed task in the PR.
- Commits use Conventional Commits.

## Review Focus

1. **One edit of several files, mixing pass notes and failures.** Expect each file's text in file order. Texts are joined with `\n\n`, and a tail that ends in `\n` leaves three newlines between them. Pinned in Task 2 (`two edited files…`).
2. **A pass printing more than 60 lines.** Expect only the last 60. Pinned in Task 2 (`long pass output…`).
3. **A pass that prints only to stderr.** Pinned in Task 2 (`stderr-only pass is shown`).
4. **A ticked task file, then a turn end, both passing with output.** Both must stay silent, and both must really run rather than take the no-change shortcut. Pinned in Task 2 (`passing tick and turn end…`, which asserts the log).
5. **This repo's verify command when a check cannot start or prints a lot.** Expect today's `verify: failed (spawnSync … ENOENT)` line, not a crash, and no `ENOBUFS` on large passing output. Pinned in Task 1.

---

### Task 1: This repo's verify command is silent on a passing edit

**Files:**
- Modify: `scripts/verify.mts` (`run(argv)` and `main()`)
- Test: `scripts/test-verify.mts`

**Interfaces:**
- Produces: `run(argv: string[], quiet = false): boolean`.
  - With `quiet` it calls `spawnSync(argv[0], argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: Infinity })`.
  - On failure (a non-zero status, a signal or `result.error`) it writes `result.stdout`, then `result.stderr`, to `process.stderr`, each only `if (typeof x === 'string' && x)`. Then it writes the existing `verify: failed (${why}): …` line.
  - `main()` passes `trigger === 'edit'`.

- [ ] **Step 1: Write the failing tests** in `scripts/test-verify.mts`. Each test uses a temp dir as cwd that holds `scripts/x.mts`, so `editChecks('scripts/x.mts')` is `[[BIOME, 'check', 'scripts/x.mts']]`. The env is `VERIFY_TRIGGER=edit` and `VERIFY_FILE=scripts/x.mts`.
  - `a passing edit check prints nothing`: an executable stub `node_modules/.bin/biome` runs `echo 'Checked 1 file in 3ms. No fixes applied.' >&2; echo ok; exit 0`. Expect `code === 0`, `stdout === ''` and `stderr === ''`.
  - `a passing edit check with large output prints nothing`: the stub runs `head -c 2000000 /dev/zero | tr '\0' a; exit 0`. Expect the same.
  - `a failing edit check prints its output on stderr`: the stub runs `echo 'x.mts:1 lint/bad'; exit 1`. Expect `code === 1` and `stdout === ''`. Expect stderr to match `/x\.mts:1 lint\/bad/` and then `/verify: failed \(exit 1\): node_modules\/\.bin\/biome check scripts\/x\.mts/`.
  - `an edit check that cannot start reports it`: no stub. Expect `code === 1`, and stderr to match `/verify: failed \(spawnSync node_modules\/\.bin\/biome ENOENT\)/`.
- [ ] **Step 2: Run them**
  - Run: `node --test scripts/test-verify.mts`
  - Expected: the first and third FAIL, because today the stub's output is inherited and `ok` and the diagnostic land on stdout. The large-output test and the ENOENT test pass today and must keep passing.
- [ ] **Step 3: Implement the `quiet` flag** as described under Interfaces. The PyYAML probe and the JSON check stay as they are.
- [ ] **Step 4: Run them again**
  - Run: `node --test scripts/test-verify.mts`
  - Expected: all PASS. Without `maxBuffer: Infinity`, the large-output test fails with `ENOBUFS`.
- [ ] **Step 5: Commit** with `git commit -m "fix: keep this repo's verify command silent on a passing edit"`.

### Task 2: Show the output of a passing edit run (tests first)

**Files:**
- Test: `tests/agent-harness/verify-handler.test.mjs`. Add `writeFileSync` to its `node:fs` import, and put the new tests under `// ---- edit trigger`.
- Test: `tests/agent-harness/cli-verify.test.mjs`
- Test: `tests/agent-harness/verify-hosts.test.mjs`
- Modify: `src/verify-gate/lib/gate.mts`. In `runGate`, change the `return { status: 'passed', text: '' }` after a zero exit, and the `// -> {status…}` comment above it.
- Modify: `src/verify-gate/handler.mts`. In `afterTool`, change the `for (const file of event.files ?? [])` loop.
- Modify: `src/verify-gate/tool.json` to `"version": "0.1.3"`.
- Regenerated: `skills/agent-harness-verify-gate/assets/verify-gate/**`, `.agents/harness/**` and the lock.

**Interfaces:**
- Produces: a `GateResult` with `status: 'passed'` carries `tail: string`, which may be `''`. `text` stays `''`. `cli.mts` reads neither on a pass.
- Consumes these `verifyRepo` helpers: `r.setOut(text)` (the exit code stays 0), `r.script`, `r.log()`, `r.passRecord()`, `fire`, `edit`, `tickCall` and `turnEnd`. In `verify-hosts.test.mjs` it uses `installed()` (no arguments; `tempRepo` already writes `README.md`), `runNode(CLAUDE_MJS, …)`, `opencode(r)` and `ROOT`.

- [ ] **Step 1: In-process tests** in `verify-handler.test.mjs`:
  - `edit pass with output returns a passed note naming the file`: call `r.setOut('eslint --fix rewrote src/a.js\n')`, write `src/a.js` and fire `edit(['src/a.js'])`. Expect `result.context` to match `/^verify: sh .*verify\.sh passed after the edit of src\/a\.js:\n\neslint --fix rewrote src\/a\.js\n$/`, `traced` to be `['ran']`, and `r.passRecord()` to be `null`.
  - `silent and whitespace-only edit passes return null`: run once with no output and once with `r.setOut('  \n\n')`. Both give `result === null`.
  - `long pass output keeps the last 60 lines`: `setOut` the lines `1` to `100`, each ending in `\n`. Expect the context to contain `:\n\n41\n`, to end with `\n100\n`, and not to match `/\n40\n/`.
  - `stderr-only pass is shown`: run `writeFileSync(r.script, "#!/bin/sh\necho 'note on stderr' >&2\n")`. Expect the context to match `/passed after the edit of src\/a\.js:\n\nnote on stderr/`.
  - `two edited files: pass note before the failure, in file order`: the script prints `E1 bad` and exits 1 when `$VERIFY_FILE` is `docs/notes.md`, and prints `ok a` otherwise. Change both files and fire `edit(['src/a.js', 'docs/notes.md'])`. Expect the context to match `/passed after the edit of src\/a\.js:\n\nok a\n[\s\S]*failed after the edit of docs\/notes\.md: [\s\S]*E1 bad/`.
  - `passing tick and turn end with output add nothing`: call `r.setOut('progress: all good\n')`. Expect `tickCall(r)` to give `result === null`. Then write `src/a.js` and run `fire(h, r, turnEnd())`, which gives `null`. Expect `r.log().map((l) => l.trigger)` to equal `['task', 'turn-end']`.
- [ ] **Step 2: CLI test** in `cli-verify.test.mjs`, modelled on the existing passing `run` test. Call `r.setOut('progress\n')`. Expect stdout to match `/^verify: passed in \d+ ms\.\n?$/`.
- [ ] **Step 3: Host tests** in `verify-hosts.test.mjs`:
  - `Claude Code: a passing edit run's output reaches additionalContext`:
    1. Call `installed()` and `r.setOut('note from lint\n')`.
    2. Load `PreToolUse-Edit.json` and `PostToolUse-Edit.json` with `/REPO` replaced by `r.dir`.
    3. Send PreToolUse, write `README.md`, then send PostToolUse through `runNode(CLAUDE_MJS, [], { cwd: r.dir, input, env: { CLAUDE_PROJECT_DIR: r.dir } })`.
    4. Expect `JSON.parse(stdout).hookSpecificOutput.additionalContext` to match `/passed after the edit of README\.md:\n\nnote from lint/`.
  - `OpenCode: a passing edit run's output is appended to result.content`:
    1. Run `const p = await opencode(r)` and `r.setOut('note from lint\n')`.
    2. Load `fixtures/opencode/execute.before-patch.json` and `execute.after-patch-completed.json` with `/REPO` replaced and `sessionID` set to `ROOT`.
    3. Call `p.hooks['execute.before']`, change the file the fixture names, then call `p.hooks['execute.after']`.
    4. Expect some text in `input.result.content` to match `/passed after the edit of .*:\n\nnote from lint/`.
- [ ] **Step 4: Run the new tests and see them fail**
  - Run: `node --test tests/agent-harness/verify-handler.test.mjs tests/agent-harness/cli-verify.test.mjs tests/agent-harness/verify-hosts.test.mjs`
  - Expected: these six FAIL:
    - pass note
    - long
    - stderr
    - two-file
    - both host tests
  - The three single-file in-process tests fail with `TypeError: Cannot read properties of null (reading 'context')`. The silent test, the tick-and-turn-end test and the CLI test pass already, and must keep passing.
- [ ] **Step 5: Implement.**
  - In `gate.mts`, return `{ status: 'passed', text: '', tail: run.tail }`, and say in the comment that `tail` is set on a pass too.
  - In the per-file loop of `handler.mts`, push `` `verify: ${cmd} passed after the edit of ${file}:\n\n${r.tail}` `` when `r.status === 'passed' && String(r.tail ?? '').trim()`. Put it next to the existing `failed` push, so the order is per file.
- [ ] **Step 6: Bump the version and refresh**
  - Set `tool.json` to `0.1.3`, then run `pnpm run harness:update`.
  - Expected: it exits 0, and the assets, `.agents/harness/verify-gate/` and the lock all show `0.1.3`.
- [ ] **Step 7: Run the whole check**
  - Run: `pnpm run check`
  - Expected: PASS, with no test edited, `vendored.test.mjs` included.
- [ ] **Step 8: Commit** with `git commit -m "feat: show the output of a passing edit run to the model"`. Include the sources, `tool.json`, the tests and the regenerated files.

### Task 3: Skill docs

**Files:**
- Modify: `skills/agent-harness-verify-gate/SKILL.md`: "The one command" **Output**, "Triggers" **Edit**, "Making it fast", "Onboard" step 3 and "Update".

- [ ] **Step 1: Edit the docs:**
  - **Output**: keep "capped at 1 MiB, and the last 60 lines go to the model". Add that on an edit pass the same tail goes to the model as `verify: <command> passed after the edit of <file>: ...`, which is how a command hands it a note. Add that a command which prints nothing on a pass stays silent.
  - **Edit** trigger: add the pass-note sentence, and say that task and turn-end passes add nothing, whatever they print.
  - **Making it fast**: replace the `edit)` line of the example with the block below. It is silent on a clean pass and prints the note after a rewrite. It prints the output on a failure, and both when errors remain after a rewrite. It exits early when the edit deleted the file.
    ```sh
    edit)
      [ -f "$VERIFY_FILE" ] || exit 0
      before=$(git hash-object "$VERIFY_FILE")
      status=0
      out=$(npx eslint --fix "$VERIFY_FILE" 2>&1 && npx vitest related --run "$VERIFY_FILE" 2>&1) || status=$?
      [ "$status" -eq 0 ] || printf '%s\n' "$out"
      [ "$before" = "$(git hash-object "$VERIFY_FILE")" ] || echo "eslint --fix rewrote $VERIFY_FILE; re-read it before editing it again."
      exit "$status"
      ;;
    ```
    Then add one line: whatever an edit pass prints reaches the model, so keep passing checks quiet there.
  - **Onboard** step 3 and **Update**: one sentence each. Check that the command prints nothing on a passing edit, unless it means to hand the model a note. A command that printed a progress line before 0.1.3 now sends it to the model.
- [ ] **Step 2: Validate**
  - Run: `python3 scripts/skills.py validate && claude plugin validate .`
  - Expected: both pass.
- [ ] **Step 3: Commit** with `git commit -m "docs: describe the passing-edit note in the verify gate skill"`.

### Task 4: Full checks, live runs and closing

- [ ] **Step 1: Run every check**
  - Run: `python3 scripts/skills.py validate && claude plugin validate . && python3 -m unittest discover -s scripts -p 'test_*.py' && pnpm run check && node .agents/harness/verify-gate/cli.mjs run`
  - Expected: every command exits 0.
- [ ] **Step 2: Live runs, OpenCode first.**
  1. In a scratch git repo, install both tools from this branch's assets with their `cli.mjs install`.
  2. Set `verify-gate.command` to a script that runs `echo "note: lint rewrote $VERIFY_FILE"` on `edit` and exits 0.
  3. Have OpenCode (`opencode serve` or the TUI) edit a file, then Claude Code.
  4. Copy the raw tool result from OpenCode and the PostToolUse hook context from the Claude Code transcript for the pull request.
- [ ] **Step 3: Verify, sync and archive** the change in the same pull request, before merge: run `openspec-verify-change`, then sync the delta specs and archive.
- [ ] **Step 4: Pull request.** Reference the issue with `Refs #58`, not `Closes`, because the release criterion is proved only after merge. The report covers:
  - Each acceptance criterion with its evidence. Mark criterion 5 (the release) "not done in this PR: the release is dispatched by hand after merge".
  - The changed areas: `verify-gate` 0.1.3 and `scripts/verify.mts`. No contract changed.
  - How the work differs from the task: the `scripts/verify.mts` change, and 9 hand-written files and the actual line count against the estimate of 6 files and 150 lines. That is at the issue's 1.5× limit, not past it.
  - Side effects after a failed edit call: the pass note on Claude Code `PostToolUseFailure`, and the OpenCode notice.
  - Effects on waiting tasks: veles's `scripts/verify_gate.py` must print nothing on a passing edit (#63, which #15 also waits on), and line-mcp keeps its lint note.
  - Work found along the way, as proposed tasks: the two flaky tests named under Global Constraints.
- [ ] **Step 5: Release criterion.** The owner dispatches the release (`release.yml`, `workflow_dispatch` on main). After it runs, post the link to the release that carries `verify-gate` 0.1.3 on issue #58, and close the issue.
