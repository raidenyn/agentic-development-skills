# Deliver Hooked Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hooked rule is delivered at a skill, after a successful command and as a one-time denial before a gated command, by a Node handler on the hook runtime, on OpenCode and Claude Code, in this repository.

**Architecture:** The hook runtime normalizes three additive fields on tool events: kind `skill`, `skill`/`skillVia`, and `ok`. A handler that declares `skill` also receives skill-file reads. A new tool, `hooked-rules`, ports veles's grammar, moments, gates and pointer block as pure modules, wraps them in a handler with a per-context ledger file, and installs like the verify gate.

**Tech Stack:** strict TypeScript under `src/`, built by `pnpm run build` into `skills/*/assets/`. Tests are `node:test` `.mjs` in `tests/agent-harness/`, run against built assets on Node 22.0.0 and 26.

**Spec:** `openspec/changes/deliver-hooked-rules/` — `brainstorm.md`, `proposal.md`, `design.md` (D1–D10), `specs/agent-hook-runtime/spec.md`, `specs/hooked-rules-delivery/spec.md`. Port source: veles-android `scripts/agent_rules.py` at `a86633dc` (`~/repos/veles-android`).

## Global Constraints

- Edit only `src/`, tests, docs and repo config. Never edit `skills/*/assets/` or `.agents/harness/` by hand; `pnpm run build` / `pnpm run harness:update` write them.
- Erasable TypeScript only. Type-only declarations go in `*.types.mts`.
- Tests import only built `.mjs` (via `ASSETS` in `tests/agent-harness/helpers.mjs`; add `ASSETS.hookedRules`), never `.mts`.
- No npm dependencies in shipped code. Node ≥ 22.0.0.
- The interface changes are additive only. Existing assertions on the adapter, runtime and handler contract stay unchanged; only add tests there. Lists that enumerate tools or checks are extended: `FULL_CHECKS` in `scripts/test-verify.mts`, `TOOLS` in `tests/agent-harness/vendored.test.mjs`, and the skill tuple in `scripts/test_skills.py` `test_real_repo_publishes_harness_assets`.
- Versions, bumped once: hook-runtime `0.2.0`, hooked-rules `0.1.0`. The verify gate stays `0.2.4`, with byte-identical built output.
- The rule format is veles's unchanged. Limits: body ≤ 4096 bytes, file ≤ 65,536 bytes, context cap 9000 UTF-8 bytes, rule separator `"\n\n"`.
- Markers: `<!-- hooked-rules:begin -->`, `<!-- hooked-rules:end -->`, heading `## Hook-delivered rules`, line `- <pointer> — .agents/hooked-rules/<file>` (U+2014).
- `requires`, `exempt` and `stops` are errors: `` `<key>` is not supported by hooked-rules 0.1.0 ``.
- Commits follow Conventional Commits.

## Review Focus

1. **A `/skill` prompt with leading whitespace or a newline after the name** (`"  /x\nmore"`): it should still match `x`, because veles splits on any whitespace. Test in Task 3.
2. **A command that matches both a `commands` and a `gates` pattern of the same rule:** the gate denies first. After the retry passes and the command succeeds, the rule is not delivered a second time for the gate, but is for the new `command:` trigger. Test in Task 3.
3. **A read of a `SKILL.md` whose real path cannot be resolved** (deleted between the read and the hook, or a permission error): no `skill`, no throw, and a Read still skipped on Claude Code. Test in Task 1.
4. **A rule file deleted or renamed mid-session:** its ledger entry is ignored, not an error. A re-added file with the same text counts as delivered, and one with new text delivers again. Test in Task 3.
5. **`AGENTS.md` with CRLF endings and an existing block:** `pointers` keeps CRLF throughout and leaves the text outside the block byte-identical. Test in Task 4.
6. **Two gated calls in one turn** (parallel `git commit` calls, separate processes on Claude Code): the first denies and records `pending`; the second then finds the pending pattern and passes. This is veles's behavior and is accepted: the rule text came with the sibling's denial in the same turn. Test in Task 3.
7. **A read of a plugin skill's `SKILL.md`** (`…/skills/brainstorming/SKILL.md` for a rule listing `superpowers:brainstorming`): it delivers, as veles's `_skill_dirs` does. Test in Task 3.
8. **A result dropped after the ledger was written** (the handler passes its deadline, OpenCode disposes, the host hook times out): the rule would count as delivered unseen. The handler checks `context.signal.aborted` and `context.deadline` right before writing and skips the write, returning nothing, when either is past. Test in Task 3.
9. **A lock that cannot be won:** `tool.before` passes (no deny); a moment returns its context without recording. Test in Task 3.

---

### Task 1: Normalized skill fields in the hook runtime

**Files:**
- Modify: `src/shared/lib/handler.types.mts`, `src/hook-runtime/lib/claude-adapter.mts`, `src/hook-runtime/lib/opencode-adapter.mts`, `src/hook-runtime/lib/runtime.mts`, `src/hook-runtime/claude.mts`, `src/hook-runtime/tool.json` (→ `0.2.0`); regenerated by `harness:update`: `skills/agent-harness-hook-runtime/assets/`, `.agents/harness/hook-runtime/`, `.agents/harness/lock.json`
- Create: `src/hook-runtime/lib/skill-path.mts`
- Test: `tests/agent-harness/claude-adapter.test.mjs`, `opencode-adapter.test.mjs`, `runtime.test.mjs`, `verify-hosts.test.mjs`

**Interfaces:**
- Produces: `ToolKind = 'shell' | 'edit' | 'read' | 'skill' | 'other'`. `EventPayload.skill?: string`, `skillVia?: 'call' | 'read'`, `ok?: boolean`.
- Produces: `skillFromPath(path: unknown, base: string): string | null` in `skill-path.mts` (no repo-root parameter).
- Produces: `wantsEvent(kinds: readonly ToolKind[] | null, event: EventPayload): boolean` in `runtime.mts`, which is true when `kinds` is null, includes the event's kind, or includes `'skill'` and `event.skill` is set. `anyHandlerWants(repoRoot: string, event: EventPayload): boolean` replaces the kind parameter.

- [ ] **Step 1: Write failing tests.**
  - claude-adapter: `Skill` → `{tool:{kind:'skill'}, skill:'openspec-apply-change', skillVia:'call'}`. `Read` of `<tmp>/skills/x/SKILL.md` → `skill:'x', skillVia:'read'`. A `Read` through a symlink `.claude/skills/x/SKILL.md` → `skills/x/SKILL.md` gives `skill:'x'`. `docs/skills/x/SKILL.md.bak`, a symlink `SKILL.md` → `notes/x.md`, and a missing file give no `skill`. `PostToolUse` → `ok:true`, `PostToolUseFailure` → `ok:false`.
  - opencode-adapter (`toToolEvent`; the fields below are on the tool's arguments, `toolInput = input.input`, not on the hook input, whose `id` is the call id): `skill` with `toolInput {id:'a'}` → `skill:'a'`; with `{name:'b'}` → `'b'`; the call id never becomes `skill`. Tool `read` with `toolInput {path}` (or `filePath`) of a `SKILL.md` gives `skill`. Tools `grep` and `glob` (also kind `read`) with a `SKILL.md` `path` give no `skill`. Shell `status:'completed'`, `metadata.exit:1` → `ok:false`; `exit:0` → `ok:true`. Non-shell `status:'error'` → `ok:false`.
  - runtime: `declaredKinds({tools:['shell','skill']})` deep-equals `['shell','skill']`. A handler with `tools:['shell','skill']` is called for `{kind:'read', skill:'x'}` and not for `{kind:'read'}`.
  - verify-hosts (spawned `claude.mjs`, install a stub handler tool with `tools:['shell','skill']`): `PostToolUse` `Read` of `src/a.mts` is traced `skipped:'no-subscriber'`. A `Read` of `skills/agent-harness-verify-gate/SKILL.md` loads handlers, and the stub sees `skill:'agent-harness-verify-gate'`. Review Focus 3: a `Read` of a missing `skills/x/SKILL.md` is traced `skipped:'no-subscriber'`.
- [ ] **Step 2:** `pnpm run build && node --test tests/agent-harness/{claude-adapter,opencode-adapter,runtime,verify-hosts}.test.mjs`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - `skillFromPath`: return `null` unless the slash-normalized text ends with `SKILL.md`. Otherwise `realpathSync(resolve(base, p))` inside try/catch, and match `/\/skills\/([^/]+)\/SKILL\.md$/` on the slash-normalized real path.
  - Adapters: add the kinds and fields. A skill read is set only for the tool named `Read` (Claude Code) or `read` (OpenCode), never for other `read`-kind tools. Claude's base is `payload.cwd || repoRoot`; OpenCode's is `repoRoot`, and its fields come from `toolInput` (`input.input`).
  - `runtime.mts` dispatch and `anyHandlerWants`: use `wantsEvent`. `claude.mts` passes `mapped.event`.
- [ ] **Step 4:** Re-run the Step 2 command. Expected: PASS.
- [ ] **Step 5:** Bump `src/hook-runtime/tool.json` to `0.2.0` and run `pnpm run harness:update` (the script as it is today), so `.agents/harness/hook-runtime/` and `lock.json` match the new build. Without this, `vendored.test.mjs` fails and the verify gate's `pnpm run check` blocks every turn end until Task 5. Then `node --test "tests/agent-harness/*.test.mjs"` passes. `git diff --stat skills/agent-harness-verify-gate/assets .agents/harness/verify-gate` must be empty.
- [ ] **Step 6: Commit** `feat: normalize skill calls, skill reads and tool outcome in the hook runtime`, with the refreshed copy and lock.

### Task 2: Rule grammar

**Files:**
- Create: `src/hooked-rules/tool.json`, `src/hooked-rules/lib/rules.mts`, `src/hooked-rules/lib/rules.types.mts`; skill scaffold via `python3 scripts/skills.py new agent-harness-hooked-rules "Use when …"`
- Modify: `src/build.json`, `tsconfig.json` (`rootDirs` gains `src/hooked-rules`, or the shared `./lib/*.mts` imports do not resolve for `tsc`), `tests/agent-harness/helpers.mjs` (`ASSETS.hookedRules`)
- Test: `tests/agent-harness/hooked-rules-grammar.test.mjs`

**Interfaces:**
- Produces (`rules.types.mts`): `interface Pattern { source: string; regex: RegExp }` and `interface Rule { name: string; sha256: string; pointer: string; skills: string[]; commands: Pattern[]; gates: Pattern[]; body: string }`. `source` is the raw pattern string as written in the file (after unescaping); triggers (`command:<source>`) and pending `patterns` use it, never `RegExp.source`, which differs (`a/b` → `a\/b`).
- Produces (`rules.mts`):
  - `parseRule(name: string, text: string): Rule`, which throws `RuleError`
  - `loadRules(repoRoot: string): { rules: Rule[]; errors: { path: string; message: string }[] }`, sorted by name
  - `ruleText(body: string): string`
  - `RULES_DIR = '.agents/hooked-rules'`, `BODY_LIMIT = 4096`, `RULE_FILE_LIMIT = 65536`

- [ ] **Step 0: Scaffold the skill first**, before creating anything under `src/hooked-rules/` or editing `src/build.json`: `python3 scripts/skills.py new agent-harness-hooked-rules "Use when …"`. The edit hook builds `skills/agent-harness-hooked-rules/assets/` as soon as `tool.json` and the `build.json` entry exist, and `new` refuses an existing folder. Then create `src/hooked-rules/tool.json` and the `build.json` entry in one shell command (a heredoc for `tool.json` plus a scripted JSON edit of `build.json`), so no edit-time build sees one without the other (`src/hooked-rules is not listed in src/build.json`); then add `rootDirs`.
- [ ] **Step 1: Write failing tests**, one per scenario of "Rule files", "Rule file format" and "Keys not supported yet":
  - a rule with only `pointer` (no `skills`, `commands`, `gates` or `stops`) errors
  - `Pattern.source` of `"a/b"` is `a/b`
  - flow and block lists give equal `skills`
  - BOM and CRLF parse, with an LF body
  - `when:` errors and names `when`
  - a symlinked file is an error
  - a 4097-byte body errors and names `4096`. The size is counted on the raw body before line endings are normalized, as veles's `original_body`: a CRLF body of 4000 bytes after normalizing but 4200 raw errors
  - an empty body, `[]`, a tab, an indented line, a duplicate key, the `\n` escape and a missing closing `---` each error
  - `requires: ["verify-pass"]` errors with `` `requires` is not supported by hooked-rules 0.1.0 ``, and likewise `exempt` and `stops`
  - an invalid regex (`"("`) errors and names `commands`
  - veles's commit-types gate patterns compile, and match `git -C x commit -m y` but not `echo git; commit` (the pattern stops only at `;&|` and newlines). `git log --grep commit` does match: a known false positive kept from veles, asserted so a change of it is deliberate
  - `loadRules` returns valid rules next to the errors of invalid ones
  - `loadRules` on a repo without `.agents/hooked-rules/` returns `{rules: [], errors: []}` ("Missing folder")
- [ ] **Step 2:** `pnpm run build && node --test tests/agent-harness/hooked-rules-grammar.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** by porting `_split`/`_quoted`/`_flow`/`_scalar`/`parse_rule`/`_read_rule_file`/`load_rules`/`rule_text` line by line. Read with `openSync(path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)` after `lstatSync`, then `fstatSync` to confirm a regular file. Decode with `new TextDecoder('utf-8', {fatal: true, ignoreBOM: true})` and strip a leading U+FEFF in the parser, as veles's `_split` does. Compute `sha256` over the raw file bytes, BOM included, as veles does. Write `tool.json` as `{"name":"hooked-rules","version":"0.1.0","handler":true,"tools":["shell","skill"]}`.
- [ ] **Step 4:** Re-run. Expected: PASS. `python3 scripts/skills.py validate` passes.
- [ ] **Step 5: Commit** `feat: parse hooked rule files`.

### Task 3: Delivery, ledger and handler

**Files:**
- Create: `src/hooked-rules/lib/deliver.types.mts`, `src/hooked-rules/lib/deliver.mts`, `src/hooked-rules/lib/ledger.mts`, `src/hooked-rules/handler.mts`
- Test: `tests/agent-harness/hooked-rules-delivery.test.mjs`

**Interfaces:**
- Consumes: `Rule`, `loadRules`, `ruleText` (Task 2); `EventPayload.skill/ok` (Task 1); `writeJsonAtomic` (`lib/state.mts`).
- Produces (`deliver.types.mts`, type-only, per `AGENTS.md`):
  - `type Entry = { sha256: string; generation: number; state: 'delivered' | 'pending'; patterns: string[]; triggers: string[] }`
  - `type Ledger = { version: 1; generation: number; entries: Record<string, Entry>; reported: string[] }`. `reported` holds `path:message` keys of load errors already reported (`loadRules` errors carry no hash); a ledger read without it gets `[]`.
- Produces (`deliver.mts`), pure:
  - `decide(rules: Rule[], ledger: Ledger, event: EventPayload): { result: { context: string } | { deny: string } | null; ledger: Ledger }`
  - `promptSkill(prompt: string): string | null`
  - `capped(items: [Rule, string][]): { included: Rule[]; text: string }`
  - `CONTEXT_CAP = 9000`
- Produces (`ledger.mts`):
  - `readLedger(dir: string): Ledger`, which returns a fresh ledger on a missing or broken file
  - `withLedger<T>(dir: string, fn: (l: Ledger, locked: boolean) => { ledger: Ledger; value: T } | null): Promise<T | null>`, using lock file `ledger.lock` (exclusive create, 20 ms retry, 1 s wait, 10 s takeover). Takeover is atomic: rename the stale lock to a unique name (`ledger.lock.<pid>.<random>`), unlink that, then retry the exclusive create; a rename that fails with `ENOENT` means another dispatch took it over first, so retry. Look at `acquireGateLock` in `src/shared/lib/state.mts` for the link-based pattern; either is acceptable if the test of two takeovers racing holds. On a lock timeout it calls `fn` with `locked: false` on a read copy and does not write. `fn` returning `null` means "write nothing, return nothing" (used for the deadline check).
  - Lock timeout semantics (spec "Rules handler fails open"): with `locked: false`, `tool.before` returns null (never a deny), and a moment returns its context without recording.
  - `bump(dir: string): Promise<void>`; it writes the bumped generation even when the lock is not won (an extra delivery is the safe side)
- Produces (`handler.mts`): default export `Handler` named `hooked-rules`, with `events: ['tool.before','tool.after','prompt','compact','session.start']` and `manual: 'Read the hooked rules listed in AGENTS.md (.agents/hooked-rules/) by hand at the moments they name.'`.

- [ ] **Step 1: Write failing tests.**
  - Pure `decide` tests cover each scenario of "Delivery at a skill", "Delivery after a command", "Once per context", "Re-delivery…", "Denial before a gated command" and "Joined and capped texts", with the spec's values: three 4000-byte rules give two included, and the third is unrecorded.
  - Review Focus 1: `promptSkill('  /x\nmore') === 'x'`, `promptSkill('/') === null`, `promptSkill('a /x') === null`.
  - Review Focus 2: a rule with a `gates` and a `commands` pattern that both match `git commit`. The first `tool.before` denies, the second passes, then a `tool.after` `ok:true` delivers once as `command:`.
  - Entry merge (veles `put`): skill → command → the same skill gives exactly two deliveries; a gate denial, its confirmation, then a moment leaves one entry holding both the gate `patterns` and the moment `triggers`.
  - "Rule with requires": a rule with `gates` and `requires` is a load error, so a `tool.before` for `git push` returns null.
  - Review Focus 4: a ledger entry of a removed rule is ignored. A re-added rule with the same `sha256` is not delivered again, and one with a new `sha256` delivers again.
  - Review Focus 6: two `tool.before` for `git commit` in one context, the second after the first returned: the first denies, the second passes and marks the rule delivered.
  - Handler tests (in process, with `stateDir` per agent under a `tempRepo`):
    - the root agent and a subagent are separate
    - `compact` in a subagent leaves the root delivered
    - `session.start {afterCompact:true}` re-arms
    - `session.start` reports an invalid file by path; a second `session.start` in the same context does not; a `session.start` with `agentId: 'child'` returns no report
    - a read of `skills/brainstorming/SKILL.md` (`skill:'brainstorming', skillVia:'read'`) delivers a rule with `skills: ["superpowers:brainstorming"]`, with trigger `skill:brainstorming`; a Skill *call* `brainstorming` does not (veles `_skill_dirs` applies to reads)
    - a broken `ledger.json` denies once and is rewritten as valid JSON
    - two concurrent `handle` calls for one skill give exactly one context
    - any exception from matching returns null without a deny: matching goes through `regex.test`, so the test replaces `test` on one rule's `RegExp` instance (not the prototype) with a function that throws
    - an `edit`-kind `tool.before` never denies
    - Review Focus 8: with `context.signal` already aborted (or `deadline` in the past), a skill event returns null and `ledger.json` is unchanged
    - Review Focus 9: with a fresh `ledger.lock` held by another holder, a gated command passes (null) and a skill event returns context, and `ledger.json` is unchanged
- [ ] **Step 2:** `pnpm run build && node --test tests/agent-harness/hooked-rules-delivery.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** by porting `_moment_rules` (without `opsx:` handling), `_capped_texts`, `_gate` (without the `requires` branch) and `_live` per design D4/D5.
  - An entry is live when `sha256` matches and `generation >= ledger.generation`.
  - The handler loads rules on each event; files are small and the handler is called only for subscribed kinds. It calls `withLedger(context.stateDir, …)`.
  - On `compact`, or `session.start` with `afterCompact`, it calls `bump`. A non-compaction `session.start` returns `{context}` with the load errors not yet in `ledger.reported`, and records their `path:message` keys there. It reports only when `context.agentId` is `'main'` or missing: OpenCode emits `session.start` for each child session too (`ensureStarted` in `opencode-adapter.mts`), so a subagent would otherwise report again.
  - Inside the `withLedger` callback, just before returning the new ledger, it returns `null` when `context.signal.aborted` or `Date.now() >= context.deadline`.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5: Commit** `feat: deliver hooked rules at skills, commands and gates`.

### Task 4: Pointer block and CLI

**Files:**
- Create: `src/hooked-rules/lib/pointers.mts`, `src/hooked-rules/cli.mts`
- Test: `tests/agent-harness/hooked-rules-cli.test.mjs`

**Interfaces:**
- Consumes: `loadRules` (Task 2); `installTool`, `checkTool`, `ensureSection`, `readLock`, `requireNode22` (`lib/install.mts`); `readHarnessConfig` (`lib/config.mts`).
- Produces: `renderBlock(rules: Rule[]): string` and `applyBlock(text: string, block: string): string`. `applyBlock` throws on duplicate or unpaired markers.
- Produces CLI commands, each taking `--repo DIR` and exiting 0 on success:
  - `cli.mjs install|update|check|pointers [--check] [--repo DIR]`
  - `install`/`update` refuse when the lock's hook-runtime version is below `0.2.0`, with the message `hooked-rules needs agent-harness-hook-runtime 0.2.0 or newer; update it first.`
  - `pointers --check` failure prints `run: node .agents/harness/hooked-rules/cli.mjs pointers`

- [ ] **Step 1: Write failing tests** against `tempRepo` with the hook runtime installed from `ASSETS.hookRuntime`:
  - a fresh install creates the copy, the lock entry, `"hooked-rules": {}` and `.agents/hooked-rules/`, and leaves byte-identical a `.claude/settings.json` with a foreign hook and an `opencode.json`
  - a repeated install exits 0 and changes nothing
  - a lock with runtime `0.1.6` refuses and changes nothing; `check` also fails with it
  - an update from an older version (RFC install tests): a `hooked-rules` lock entry at `0.0.9` with matching file hashes makes `install` refuse ("use update") and `update` install `0.1.0`
  - an edited copied file fails `check` with its path, and `update` refuses
  - `pointers` and `pointers --check` without `AGENTS.md` exit 1 with "cannot be read"
  - `{"hooked-rules":{"x":1}}` refuses and names `x`; `check` also fails naming `x`
  - an invalid rule file fails `check`
  - `pointers` appends a heading and block for two rules in name order, and `pointers --check` passes; after a pointer change it fails and prints the fix line
  - duplicate markers fail
  - `pointers` with an invalid rule file exits 1, prints the file's error and leaves `AGENTS.md` unchanged (veles `_pointers`)
  - a block whose `## Hook-delivered rules` heading is missing, or separated from the begin marker by blank lines: `pointers --check` fails naming the heading; `pointers` writes the heading on the line right before the begin marker (veles `heading_ok`, `_apply_block`)
  - a current block right under its heading: `pointers` leaves the file byte-identical
  - Review Focus 5: a CRLF `AGENTS.md` with a block stays CRLF, and its bytes outside the block are unchanged
- [ ] **Step 2:** `pnpm run build && node --test tests/agent-harness/hooked-rules-cli.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** by porting `render_pointer_block`/`_locate_block`/`_apply_block`/`_line_ending`, and by shaping the CLI on `src/verify-gate/cli.mts`. Compare versions numerically on `major.minor.patch`.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add hooked-rules install, check and pointer block`.

### Task 5: Docs, versions and onboarding this repository

**Files:**
- Modify: `skills/agent-harness-hooked-rules/SKILL.md`, `skills/agent-harness-hook-runtime/SKILL.md`, `package.json` (`harness:update` appends `&& node skills/agent-harness-hooked-rules/assets/hooked-rules/cli.mjs update`), `README.md` (add the Skills table row by hand; `skills.py new` does not), `scripts/verify.mts` (add the `check` and `pointers --check` argv entries to `FULL_CHECKS`, and `pointers --check` to `editChecks` for `.agents/hooked-rules/*.md` and `AGENTS.md`), `scripts/test-verify.mts` (the `FULL_CHECKS` list and an `editChecks` case), `tests/agent-harness/vendored.test.mjs` (`TOOLS` gains `['hooked-rules', 'agent-harness-hooked-rules']`), `scripts/test_skills.py` (the skill tuple in `test_real_repo_publishes_harness_assets`), `.github/workflows/validate.yml` (two steps after the verify-gate check), `AGENTS.md` (generated block)
- Create: `.agents/hooked-rules/repo-commit-types.md`, `.agents/hooked-rules/repo-harness-tools.md` (frontmatter per design D9)

- [ ] **Step 1:** Write `SKILL.md` per tasks 5.1 (≤ 500 lines, description starting "Use when"), and update the hook-runtime `SKILL.md` per 5.2.
- [ ] **Step 2:** Run `pnpm run build`. `git diff --stat skills/agent-harness-verify-gate/assets` must be empty. (The runtime is already `0.2.0` and installed since Task 1.)
- [ ] **Step 3:** Append the hooked-rules `update` to `harness:update` and run `pnpm run harness:update`. The hooked-rules `update` finds no lock entry and installs (as `planTool` treats a missing entry). Expected: the lock shows hook-runtime `0.2.0` and hooked-rules `0.1.0`. Only after this run, add `['hooked-rules', 'agent-harness-hooked-rules']` to `vendored.test.mjs` `TOOLS` and the skill to the `test_skills.py` tuple (earlier, `vendored.test.mjs` fails and the verify gate blocks the turn).
- [ ] **Step 4:** Add the two rules and run `node .agents/harness/hooked-rules/cli.mjs pointers`. Then `check` and `pointers --check` both exit 0. Add a case to `hooked-rules-delivery.test.mjs` that loads this repo's `.agents/hooked-rules/` and asserts `repo-harness-tools`'s command matches `pnpm run build` and `pnpm harness:update` but not `pnpm run build:check`.
- [ ] **Step 4b:** Only now that the block exists, wire the checks together: add `hooked-rules/cli.mjs check` and `pointers --check` to `FULL_CHECKS` in `scripts/verify.mts` and `pointers --check` to `editChecks` for `.agents/hooked-rules/*.md` and `AGENTS.md`; update `scripts/test-verify.mts` (`FULL_CHECKS` list, an `editChecks` case) in the same edit; add the two steps to `.github/workflows/validate.yml` after "Check the verify gate install"; add the README Skills row. (Earlier, `pointers --check` in `FULL_CHECKS` fails every turn end.)
- [ ] **Step 5:** Run `pnpm run check`, `python3 scripts/skills.py validate`, `claude plugin validate .` and `python3 -m unittest discover -s scripts -p 'test_*.py'`. Expected: all pass.
- [ ] **Step 6: Commit** `feat: onboard hooked rules in this repository`. The commit gate is now live in this session, so the first `git commit` is denied once with `repo-commit-types`; that is expected, and it is the first live evidence of the gate. Retry the same command.

### Task 6: Live checks and evidence

- [ ] **Step 0: Make the skills callable.** `agent-harness-hooked-rules` is not published yet and OpenCode here has no harness skill. For the live runs only, symlink `skills/agent-harness-hooked-rules` and `skills/agent-harness-verify-gate` into `.claude/skills/` and `.opencode/skills/`; remove the links afterwards and never commit them. A `/agent-harness-verify-gate` prompt on OpenCode may be taken as a command and not reach the `prompt` hook as text; record what the trace shows either way.
- [ ] **Step 1: OpenCode 2.4.1.** In a scratch session in this repo, with `AGENT_HARNESS_TRACE=1`, invoke the skill `agent-harness-hooked-rules`, then the prompt `/agent-harness-verify-gate`, then `pnpm run build`, then `git commit --allow-empty -m "test: x"` twice. Then invoke the skill `agent-harness-hooked-rules` again. Record from `trace.jsonl` and the transcript: the skill tool name, input field and the skill name it carried, the prompt text the hook saw, `repo-harness-tools` delivered at each of the three new triggers (skill call, prompt, build) and not at the repeated skill call, and the first commit denied with `repo-commit-types` and the second allowed. Reset the test commit afterwards. If the skill field differs from `id`/`name`, fix the adapter, add a test and rebuild.
- [ ] **Step 2: Claude Code 2.1.332.** Run the same sequence, plus one plain `Read`, which must be traced `skipped:"no-subscriber"`.
- [ ] **Step 3:** Run all of tasks 7.3's commands. Write the evidence for each #16 goal into `apply.md`, including what is left to #17, #18 and #23.
- [ ] **Step 4: Commit** `docs: record live checks for hooked-rules`.
