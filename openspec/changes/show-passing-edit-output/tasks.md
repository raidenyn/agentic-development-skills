Tick a group's boxes in one edit, only after the matching plan Task's last step passes. Every tick here starts a full verify run, which fails while a test is red on purpose or while the installed copy is behind the skill's assets.

## 1. This repo's verify command is silent on a passing edit (first, so the refreshed gate adds no noise here)

- [ ] 1.1 `scripts/verify.mts`: give `run(argv)` a `quiet` flag used on `VERIFY_TRIGGER=edit`. With it, spawn with `stdio: ['ignore', 'pipe', 'pipe']`, `encoding: 'utf8'` and `maxBuffer: Infinity`. On a non-zero exit, a signal or a spawn error, write the captured stdout and then stderr to stderr, each only when it is a non-empty string, before the existing `verify: failed (…)` line. Full runs keep `stdio: 'inherit'`.
- [ ] 1.2 `scripts/test-verify.mts`: in a temp dir with a stub `node_modules/.bin/biome`:
  - a passing edit check that prints a summary leaves stdout and stderr empty and exits 0;
  - a passing one that prints 2 MB does the same;
  - a failing one prints the stub's diagnostic on stderr and the `verify: failed (exit 1)` line, and exits 1;
  - with no stub, the run exits 1 with `verify: failed (spawnSync node_modules/.bin/biome ENOENT)`.

## 2. Gate: show the output of a passing edit run (tests first)

- [ ] 2.1 Write the tests before the code. In `tests/agent-harness/verify-handler.test.mjs`:
  - an edit pass printing a line returns the passed note naming the file and writes no pass record;
  - edit passes with no output and with whitespace only return `null`;
  - an edit pass printing 100 lines carries only lines 41–100;
  - a pass printing only to stderr is shown;
  - in a two-file edit, the pass note comes before the failure;
  - a passing tick run and then a passing turn end, each printing output, return `null`, and the log shows `['task', 'turn-end']`.
- [ ] 2.2 More tests before the code:
  - `tests/agent-harness/cli-verify.test.mjs`: a passing `cli.mjs run` that prints prints only `verify: passed in N ms.`;
  - `tests/agent-harness/verify-hosts.test.mjs`: the pass note reaches `additionalContext` through spawned `claude.mjs` (with `CLAUDE_PROJECT_DIR`), and `result.content` through the OpenCode `execute.before` and `execute.after` hooks (patch fixtures, `sessionID: ROOT`).
- [ ] 2.3 `src/verify-gate/lib/gate.mts` `runGate` returns `tail: run.tail` with `{ status: 'passed', text: '' }`. `src/verify-gate/handler.mts` `afterTool`, edit branch, pushes `verify: ${cmd} passed after the edit of ${file}:\n\n${r.tail}` when the tail is not blank, in file order with failures. Bump `src/verify-gate/tool.json` to `0.1.3`, run `pnpm run harness:update`, and check that every test passes, the existing ones unchanged.

## 3. Docs

- [ ] 3.1 `skills/agent-harness-verify-gate/SKILL.md`, "The one command" **Output** and "Triggers" **Edit**: the pass note on an edit, silence when the command prints nothing, and no note on task and turn-end passes.
- [ ] 3.2 Same file, "Making it fast": the `edit)` branch captures the checks, prints their output only on failure, and prints the `eslint --fix rewrote …; re-read it` hint whenever the file changed, even when errors remain. One line says whatever an edit pass prints reaches the model.
- [ ] 3.3 Same file, "Onboard" step 3 and "Update": check that the command prints nothing on a passing edit unless it means to hand the model a note.

## 4. Checks and evidence

- [ ] 4.1 `python3 scripts/skills.py validate`, `claude plugin validate .`, `python3 -m unittest discover -s scripts -p 'test_*.py'` and `pnpm run check` pass.
- [ ] 4.2 Live run on OpenCode first, then Claude Code: in a scratch repo with the gate installed from this branch and a command that prints a note and exits 0 on `edit`, an edit puts the note in the tool result. Record the raw tool result or hook context from each host's transcript for the pull request.
