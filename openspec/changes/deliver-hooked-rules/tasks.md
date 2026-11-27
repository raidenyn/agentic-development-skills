## 1. Normalized skill fields in the hook runtime

- [ ] 1.1 Add `'skill'` to `ToolKind` in `src/shared/lib/handler.types.mts`. Add optional `skill?: string`, `skillVia?: 'call' | 'read'` and `ok?: boolean` to `EventPayload`, each with a comment. Add `'skill'` to `TOOL_KINDS` in `src/hook-runtime/lib/runtime.mts`.
- [ ] 1.2 Add a shared helper in `src/hook-runtime/lib/` that maps a read path and a base folder to a skill name (`skillFromPath(path, base)`). It realpaths only paths whose text ends in `SKILL.md`, reads backslashes as slashes, and returns `<name>` when the real path ends in `/skills/<name>/SKILL.md`, else `null`. It never throws.
- [ ] 1.3 Claude adapter (`claude-adapter.mts`): map `Skill` to kind `skill`, with `skill` from `tool_input.skill` and `skillVia: 'call'`. For the `Read` tool only, set `skill`/`skillVia: 'read'` from `tool_input.file_path` against `cwd`. Set `ok` on `tool.after`: `true` for `PostToolUse`, `false` for `PostToolUseFailure`.
- [ ] 1.4 OpenCode adapter (`opencode-adapter.mts`): map `skill` to kind `skill`, with `skill` from the tool arguments (`toolInput = input.input`): `toolInput.id`, else `toolInput.name`, never the hook input's call id. For the `read` tool only (not `grep` or `glob`), set `skill` from `toolInput.path ?? toolInput.filePath` against the repo root. Set `ok` on `tool.after`: `status === 'completed'`, and for a shell call also `result.metadata.exit === 0`.
- [ ] 1.5 Dispatch filter (`runtime.mts`) and `anyHandlerWants`: a handler whose kinds include `skill` also matches an event that carries `skill`. Change `anyHandlerWants` to take the event, and update its call in `src/hook-runtime/claude.mts`.
- [ ] 1.6 Add tests covering each delta scenario of `specs/agent-hook-runtime/spec.md`. Put them in `claude-adapter.test.mjs`, `opencode-adapter.test.mjs` and `runtime.test.mjs`, and in `verify-hosts.test.mjs` for the spawned skip cases: a plain Read is skipped, and a `SKILL.md` Read loads with the rules handler installed. Existing tests stay unchanged.
- [ ] 1.7 Bump `src/hook-runtime/tool.json` to `0.2.0` and run `pnpm run harness:update`, so the installed copy and lock match the build (otherwise `vendored.test.mjs` and the verify gate fail until group 6). Confirm the verify gate's built and installed files are unchanged.

## 2. Rule grammar

- [ ] 2.1 First run `python3 scripts/skills.py new agent-harness-hooked-rules "<description>"` to scaffold the skill and its marketplace entry (the README Skills row is added in 5.1); it refuses an existing folder, and the edit hook builds `skills/agent-harness-hooked-rules/assets/` once the tool exists. Then scaffold the tool, writing `tool.json` and the `build.json` entry in one shell command so no edit-time build sees one without the other: `src/hooked-rules/tool.json` (`0.1.0`, `"handler": true`, `"tools": ["shell", "skill"]`), its `src/build.json` entry (shared `lib/config.mts`, `lib/state.mts`, `lib/install.mts`), and `src/hooked-rules` in `tsconfig.json` `rootDirs`.
- [ ] 2.2 Write `src/hooked-rules/lib/rules.mts`, porting `_split`, `_quoted`, `_flow`, `_scalar`, `parse_rule`, `_read_rule_file`, `load_rules` and `rule_text` from veles `scripts/agent_rules.py` at `a86633dc`. Apply design D3's limits (the body size on the raw body, the sha256 on the raw bytes), compile regexes with the `u` flag, and reject `requires`, `exempt` and `stops` as not supported yet.
- [ ] 2.3 Write `tests/agent-harness/hooked-rules-grammar.test.mjs`, porting the grammar cases from veles `test_agent_rules.py` that this version covers. Cover every scenario of "Rule files", "Rule file format" and "Keys not supported yet".

## 3. Delivery

- [ ] 3.1 Write `src/hooked-rules/lib/deliver.mts`, a pure module. It holds the moments (skill via `skill`, `/<name>` prompt, command with `ok: true`), the trigger sets, the gate with pending patterns, and the 9000-byte cap with the one-blank-line join in name order (design D4).
- [ ] 3.2 Write `src/hooked-rules/lib/ledger.mts`: the per-context `ledger.json` with generation, sha256-bound entries, atomic writes, and the exclusive-create lock (20 ms retry, 1 s wait, 10 s takeover). On timeout it fails open: no deny, and moment context without recording. It skips the write when the signal is aborted or the deadline has passed (design D5).
- [ ] 3.3 Write `src/hooked-rules/handler.mts` with the events `tool.before`, `tool.after`, `prompt`, `compact` and `session.start`. On `compact`, and on `session.start` with `afterCompact`, it bumps the generation. On a non-compaction `session.start` it reports invalid rule files once per session (`ledger.reported`), only in the main agent context (`agentId` `'main'` or missing). It sets the `manual` text and writes the ledger only after deciding.
- [ ] 3.4 Write `tests/agent-harness/hooked-rules-delivery.test.mjs` covering every delivery, once-per-context, re-delivery, gate, cap and fail-open scenario of `specs/hooked-rules-delivery/spec.md`. Include veles's gate patterns for `git commit` and `gh pr create|edit`, two concurrent dispatches in one context, two gated calls in one turn, a lock held by another holder, and an aborted signal.

## 4. Pointer block and CLI

- [ ] 4.1 Write `src/hooked-rules/lib/pointers.mts`, porting `render_pointer_block`, `_locate_block`, `_apply_block`, the line-ending handling and the `_pointers` check from veles, including the refusal on invalid rules and the heading check and rewrite.
- [ ] 4.2 Write `src/hooked-rules/cli.mts` with `install`, `update`, `check`, `pointers` and `pointers --check`, each taking `[--repo DIR]`. Base it on `src/verify-gate/cli.mts`, adding the hook-runtime ≥ 0.2.0 refusal, the empty config section with unknown-key rejection, and creating `.agents/hooked-rules/` (design D8).
- [ ] 4.3 Write `tests/agent-harness/hooked-rules-cli.test.mjs` against throwaway git repos: a fresh install, a repeated install, refusal with an old runtime, an edited copy, a foreign host config left unchanged, an added and then stale pointer block, duplicate markers, `pointers` refusing with an invalid rule, and a missing or misplaced heading.

## 5. Skill, versions and build

- [ ] 5.1 Add the README Skills row by hand. Write `skills/agent-harness-hooked-rules/SKILL.md` (under 500 lines). Cover when to use it, the rule format with an example, the three moments, once per context and re-delivery, the regex dialect, the keys not supported yet, the pointer block, the Onboard and Update sections with the untrusted-checkout warning, and Remove. Make the description start with "Use when".
- [ ] 5.2 Update `skills/agent-harness-hook-runtime/SKILL.md` for the `skill` kind, `skill`, `skillVia` and `ok` fields, and the `skill` declaration rule.
- [ ] 5.3 Add the hooked-rules `update` to `harness:update` in `package.json`, after the hook-runtime update. Run `pnpm run build` and confirm that the verify gate's built files are unchanged.

## 6. Onboard this repository

- [ ] 6.1 Run `pnpm run harness:update`. The lock should gain hooked-rules 0.1.0 next to hook-runtime 0.2.0. Then add `agent-harness-hooked-rules` to `tests/agent-harness/vendored.test.mjs` `TOOLS` and to the skill tuple in `scripts/test_skills.py`.
- [ ] 6.2 Add `.agents/hooked-rules/repo-commit-types.md` and `.agents/hooked-rules/repo-harness-tools.md` (design D9), then run `pointers` to write the `AGENTS.md` block. Once `repo-commit-types.md` exists, the commit gate is live in the implementing session: the first `git commit` is denied once, as expected.
- [ ] 6.3 Add `hooked-rules/cli.mjs check` and `pointers --check` to `FULL_CHECKS` in `scripts/verify.mts` (and `pointers --check` to `editChecks` for `.agents/hooked-rules/*.md` and `AGENTS.md`), update `scripts/test-verify.mts` to match, and add both to `.github/workflows/validate.yml`.

## 7. Live checks and evidence

- [ ] 7.1 For the live runs only, symlink the harness skills into `.claude/skills/` and `.opencode/skills/` (not committed). Run live on OpenCode 2.4.1 in this repo, first per Host order. Confirm the Skill tool's name and input field and that a `/<skill>` prompt reaches the `prompt` hook as text. Then confirm: a skill call, a `/<skill>` prompt and a successful `pnpm run build` each deliver `repo-harness-tools` (three triggers), a repeated skill call does not, and a first `git commit` is denied once and the retry passes. If the field differs, fix the adapter and its test.
- [ ] 7.2 Run the same three moments live on Claude Code, and confirm a plain `Read` is still skipped (`AGENT_HARNESS_TRACE=1`, `skipped: "no-subscriber"`).
- [ ] 7.3 Run `pnpm run check`, `python3 scripts/skills.py validate`, `claude plugin validate .`, `python3 -m unittest discover -s scripts -p 'test_*.py'`, `node .agents/harness/hooked-rules/cli.mjs check` and `pointers --check`.
- [ ] 7.4 In the PR, report each goal of #16 with its evidence. State what is left to #17 (`requires`, `exempt`), #18 (`stops`, `opsx:`) and #23 (veles's rule cases).
