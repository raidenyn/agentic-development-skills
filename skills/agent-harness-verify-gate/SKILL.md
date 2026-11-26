---
name: agent-harness-verify-gate
description: "Use when a repo's verify command should run automatically on agent edits, on ticked tasks and at every turn end, blocking the agent while it fails; when onboarding, configuring, updating or removing the agent harness verify gate; when choosing or speeding up the verify command (VERIFY_TRIGGER, VERIFY_FILE, VERIFY_CHANGED_FILES); or when a verify block, notice or the verify-pass proof needs explaining."
---

# Agent harness verify gate

A handler for the agent harness hook runtime (skill `agent-harness-hook-runtime`). It runs one command, the repo's verify command, when an agent edits a file, when it ticks a task, and at every turn end. A failing turn end blocks the agent until the command passes, at most three times for the same failure. When nothing changed since the last full pass, nothing runs.

Before starting an agent in a clone you do not trust, read its `.claude/settings.json`, `opencode.json`, `.agents/harness.json` and `.agents/harness/`, and the scripts the `verify-gate.command` in `.agents/harness.json` runs: these hooks run code on every tool call, and that command runs on the first edit and at every turn end.

## When to use

- A repo has, or should get, a single command that says whether the work is done, and agents should not end a turn while it fails.
- You are onboarding the gate, choosing its command or making that command fast.
- An agent got a `verify: ...` block or notice and you need to know why, or the gate should be updated or removed.

The hook runtime must be installed first. The gate's `install` refuses without it.

## The one command

`verify-gate.command` in `.agents/harness.json` is an argv list, not a shell string, for example `["node", "scripts/verify.js"]` or `["make", "verify"]`. It runs from the repo root, in its own process group, with these variables:

| Variable | Value |
|---|---|
| `VERIFY_TRIGGER` | `edit`, `task` or `turn-end` |
| `VERIFY_FILE` | the edited file, repo-relative; set only for `edit` |
| `VERIFY_BASE` | `git merge-base HEAD <base>`, else `HEAD`, else empty |
| `VERIFY_CHANGED_FILES` | path of a file listing one changed path per line |

The changed list is the union of three sets: files that differ from `VERIFY_BASE` in the working tree, untracked files that are not ignored, and files whose bytes or stat data changed since the last full pass.

- **Pass and fail.** Exit 0 is a pass; anything else is a failure. A signal, a timeout (`timeoutSeconds`) and a command that cannot start count as failures too.
- **Output.** Output is capped at 1 MiB, and the last 60 lines go to the model.
- **Timeout.** On timeout the process group gets SIGTERM, then SIGKILL after 5 s.
- **Leftovers.** Processes the command leaves behind in its group are killed too, so do not start daemons from it.

Run the same command by hand with `node .agents/harness/verify-gate/cli.mjs run`. It is a full run with `VERIFY_TRIGGER=turn-end`. It exits 0 on a pass or when nothing changed since the last full pass, and 1 otherwise, and a pass is recorded like any other full pass.

## Triggers

Every trigger first compares the working-tree content key (a git tree id from a private index plus a stat digest, both under `<git dir>/agent-harness/verify-gate/`) and the config with the last full pass. If both are unchanged, nothing runs.

- **Edit.** After an edit-kind tool call, the gate runs once per edited file with `VERIFY_TRIGGER=edit` and `VERIFY_FILE`. A failure is added to the tool result as `verify: <command> failed after the edit of <file>: ...`. An edit run never records or clears a pass.
- **Ticked task.** A tick is a checkbox in a file matching `taskFiles` changing from `- [ ]` to `- [x]`. The gate catches ticks made by edits and by shell commands alike.
  - At each shell or edit `tool.before`, it counts the boxes per item text.
  - At the matching `tool.after`, it compares the counts, so moved and reordered items do not matter.
  - Adding an item that is already ticked is not a tick.
  - A tick starts a full run with `VERIFY_TRIGGER=task`. A failure is added to the tool result as `verify: a task was ticked while verification fails. Ticked: ...`.
  - A tick seen by two overlapping calls, such as a subagent's edit during a long root shell call, is reported once.
- **Turn end.** Every turn end runs a full run with `VERIFY_TRIGGER=turn-end`: the root agent's and each subagent's.
  - **Failure.** A failure returns a block: `verify: <command> failed (attempt n of m). Fix the failure before ending the turn: ...`. The agent continues and fixes it.
  - **The background notice.** When the root agent's turn ends while its subagents still run, a failure is only a notice: `verify: <command> fails while <n> subagent(s) still run; verification runs again at the next turn end.` A subagent may still be changing the tree, so it does not block and is not counted. Both hosts start a new root turn when a subagent finishes, and that turn's end verifies again.
  - **OpenCode one-shot.** `opencode run --standalone` does not get turn-end checks or blocks: the process exits when the session goes idle and kills the detached check. Use the long-lived server (`opencode serve` or the TUI), or run `node .agents/harness/verify-gate/cli.mjs run` afterwards.
  - **The limit.** At most `maxBlocks` blocks (3 at most) are given per failure and per session. The count is shared by the root agent and its subagents. A failure is identified by the exact argv, the exit status and the output tail, with paths, times, durations and hex ids normalized. A different failure gets its own count. The count is kept per session in `<git common dir>/agent-harness/verify-gate/`, so it carries over when the agent moves into another worktree of the same repository.
  - **The backstop.** No session gets more than 10 turn-end blocks in total.
  - **After a limit.** Each later turn end passes with `verify: still failing after <n> blocks; continuing. Run node .agents/harness/verify-gate/cli.mjs run by hand.` and the tail. `<n>` is the limit that was reached: `maxBlocks` for one failure, or 10 at the backstop.
  - **Where notices go.** On Claude Code, a notice at the root `Stop` is a `systemMessage`, which the user sees and the model does not. On OpenCode it is a message that does not resume the agent.
- **Full-run pass.** A pass of a task or turn-end run records `pass.json`, but only if the content key is the same before and after the run. A failed full run deletes it.
- **Contention.** A run that finds another run holding the gate lock waits for it until its own deadline, and then usually finds nothing changed. Only if the deadline passes does it report `verify: verification already running; nothing was checked.`.
- **Gate failures.** If the gate itself fails, for example with no command set or at a hook deadline, the host call goes ahead and the model is told `hook verify-gate failed on <event>: <reason>. Run node .agents/harness/verify-gate/cli.mjs run by hand.`.

## Limits

- **A→B→A during a run.** Equal keys before and after a run cannot show that the content changed and changed back while the command ran. The guarantee is that the content at the start of the run equals the content at its end.
- **The stat digest is conservative.** It covers size, mode, inode, mtime and ctime of every file, so an edit that a clean filter hides (LF to CRLF) or that restores the mtime is still seen. The cost: a `touch`, `chmod`, checkout or rebase that rewrites identical bytes forces a rerun. It never causes a wrong pass.
- **Ignore build output.** Untracked files that are not ignored are part of the content key. Build output, caches and logs that the command writes make every run look like a change and slow down each key. Put them in `.gitignore`.
- **Synchronous handlers.** Every handler runs in a worker, so one that loops synchronously cannot freeze the host. At the deadline the worker is terminated, and the process groups the runtime started for it are killed: the verify command and its git calls. A process a handler starts on its own is not tracked.
- **Subagents on OpenCode.** A blocked subagent's pre-fix result can reach the parent before the fix, because OpenCode hands the parent every round of a subagent's work. The parent may act once on the failing result. It is then handed the fixed result, and its own turn end verifies the final tree. On Claude Code, the parent gets the result after the fix.
- **Identical labels.** Swapping which of two items with the same text is ticked leaves the counts unchanged, and is not detected as a tick.
- **Loose objects.** The private index writes loose git objects for untracked files. `git gc` prunes them.

## Making it fast

The no-change shortcut covers turns that changed nothing. Every other trigger runs the command, so its speed is the command's job.

1. **Use the test runner's related-test support first.** Examples: `vitest related --run <files>`, `jest --findRelatedTests <files>`, or the Go packages that contain the changed files.
   - Feed it `VERIFY_FILE` on `edit`. Checking one file (lint, type check, its related tests) is usually enough there, because the next full run covers the rest.
   - Only when the full suite is too slow for every turn end, feed it the paths in `VERIFY_CHANGED_FILES` on `task` and `turn-end` too, and keep the full suite in CI.
2. **Build a mapping by hand only where the stack has no such support.** For example, map source folders to test folders in the verify script, and fall back to the full suite for any path it does not know.
3. **Keep the full checks for `task` and `turn-end`**, and keep `timeoutSeconds` above the slowest honest run.

A small repo-owned script that branches on `VERIFY_TRIGGER` is the usual shape:

```sh
#!/bin/sh
set -e
case "$VERIFY_TRIGGER" in
  edit) npx eslint "$VERIFY_FILE" && npx vitest related --run "$VERIFY_FILE" ;;
  *)    npx eslint . && npx vitest run ;;
esac
```

## Config keys

The section is `verify-gate` in `.agents/harness.json`. `check` rejects unknown keys.

| Key | Default | Meaning |
|---|---|---|
| `command` | none, required (`install` writes `[]`) | the verify argv, a non-empty list of strings |
| `base` | `"origin/main"` | the ref `VERIFY_BASE` is taken from |
| `taskFiles` | `["openspec/changes/*/tasks.md"]` | globs of the task files; `*` matches within one path segment, `**` across segments, `?` one character |
| `timeoutSeconds` | `900` | the command's timeout |
| `maxBlocks` | `3` | blocks per failure and session, from 1 to 3 |

The `tool.after` and `turn.end` deadline is `timeoutSeconds` plus 10 s. That value is read when the handler loads, so restart OpenCode after you change it.

On Claude Code the hook timeout is 1800 s and the runtime keeps 7 s of it, so keep `timeoutSeconds` at or below about 1780.

Any change to the section counts as a change, so the next trigger runs the command.

## `verify-pass`

The gate registers the proof `verify-pass`. Another handler calls `context.proof("verify-pass")`, for example before it allows a commit or a pull request. The proof waits up to 2 s for the gate lock and compares the current content key and config with `pass.json`.
- It returns null when they match.
- Otherwise it returns one of: `verify-pass: no full pass yet`, `verify-pass: the content changed since the last pass`, `verify-pass: the verify-gate config changed since the last pass`, or `verify-pass: verification is running`.

## Onboard

1. **Install the hook runtime first**, by its skill's Onboard.
2. **Install the gate.** From the installed skill folder, run `node <skill>/assets/verify-gate/cli.mjs install --repo <repo>`. It copies the tool to `.agents/harness/verify-gate/`, writes its lock entry and adds `"verify-gate": {"command": []}`. It does not touch the host configs.
3. **Set the config.** These values need judgement:
   - **`command`.** Find what the repo already uses to say the work is done: its CI steps, `AGENTS.md`, the `Makefile` or the `package.json` scripts. Prefer a repo-owned script that branches on `VERIFY_TRIGGER`, and make it fast as described above.
   - **`base`.** The default branch's remote ref.
   - **`taskFiles`.** Where the repo keeps its checkbox task lists.
   - **`timeoutSeconds`.** Above the slowest honest full run.
4. **Ignore build output.** Make sure everything the command and the build write is in `.gitignore`.
5. **Run it once by hand.** Run `node .agents/harness/verify-gate/cli.mjs run`. It must pass on a clean tree, and its pass seeds the no-change shortcut.
6. **CI.** Add `node .agents/harness/verify-gate/cli.mjs check` to CI, next to the runtime's `check`. It fails until `command` is set, and on lock or config errors. Name the verify command and `.agents/harness/` in one line of `AGENTS.md`.
7. **Commit** `.agents/`.
8. **Verify live.** Start a new session on each host the repo uses, then:
   - make one edit that breaks the command and check that the failure arrives after the tool call;
   - let one turn end and check that it is blocked;
   - fix the edit, and check that the next turn end passes and that a turn end with no change runs nothing.
   - For timings, set `AGENT_HARNESS_TRACE=1`: `<git dir>/agent-harness/hook-runtime/trace.jsonl` records `no-change`, `ran` or `contended` per event.

## Update

1. **Update.** From the newer skill folder, run `node <skill>/assets/verify-gate/cli.mjs update --repo <repo>`.
   - It replaces a copy whose files all match its lock, removes files the new version no longer has and rewrites the lock entry.
   - It refuses on an edited, missing or extra file, naming it. Restore the file with `git checkout -- .agents/harness/<tool>/<file>`, or delete the tool folder and its lock entry and install again. There is no override flag.
   - `install` refuses when a different version is installed, so use `update` for that.
2. **Review** the diff of `.agents/`.
3. **Check.** Run `node .agents/harness/verify-gate/cli.mjs check`.
4. **Restart OpenCode sessions**, which load handlers once per process.

In the skill's own source repo, `assets/verify-gate/` is generated from TypeScript under `src/verify-gate/`; edit the source, never the assets. When you change it, bump `version` in `src/verify-gate/tool.json` by hand and rebuild. Nothing enforces the bump yet.

## Remove

1. Delete `.agents/harness/verify-gate/`, the `verify-gate` entry in `.agents/harness/lock.json` and the `verify-gate` key in `.agents/harness.json`.
2. Delete its `check` step from CI and its line in `AGENTS.md`.
3. Optionally, delete `<git dir>/agent-harness/verify-gate/`.

The host configs belong to the hook runtime. Remove them with that skill if no handler is left.

Before starting an agent in a clone you do not trust, read its `.claude/settings.json`, `opencode.json`, `.agents/harness.json` and `.agents/harness/`, and the scripts the `verify-gate.command` in `.agents/harness.json` runs: these hooks run code on every tool call, and that command runs on the first edit and at every turn end.
