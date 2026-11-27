# Task 6 report: live checks and evidence

Status: DONE

- Worktree: `/home/dev/.t3/worktrees/agentic-development-skills/t3-ebb73c1f-4bfeaeef6834c54f`
- Branch: `feat/openspec-ff-change-issue-16`
- Baseline HEAD before the runs: `b8a255605b99ec682ee42235b75eb2c605de851c`
- Final HEAD: `b8a255605b99ec682ee42235b75eb2c605de851c`
- Final `git status --porcelain`: empty (no symlinks, no `src/a.mts`, no test commit)
- Commits made by this task: none (no adapter field differed from what the code expects)
- **Authoritative live evidence: "Rerun — authoritative: full ordered sequence in one session per host" below.**
  The four earlier runs are retained as supplementary evidence: they established the host field names,
  the denial text and the skip behaviour, but they did not keep the ordered sequence in one session.

## Environment

```
node --version            v26.13.1
pnpm --version            12.18.0
opencode --version        opencode v2.4.1
claude --version          2.1.332 (Claude Code)
git rev-parse --absolute-git-dir
  /home/dev/repos/agentic-development-skills/.git/worktrees/t3-ebb73c1f-4bfeaeef6834c54f
```

Trace path used for every run:

```
<git dir>/agent-harness/hook-runtime/trace.jsonl
  /home/dev/repos/agentic-development-skills/.git/worktrees/t3-ebb73c1f-4bfeaeef6834c54f/agent-harness/hook-runtime/trace.jsonl
```

Ledger path pattern:

```
<git dir>/agent-harness/hooked-rules/sessions/<host>-<session>/main/ledger.json
```

The trace file did not exist before the first runs. The four supplementary invocations below produced
lines 1-77; the later authoritative rerun produced lines 78-139. Both sets are quoted in place.

## Step 0: temporary skill links (not committed)

Before the runs, `.claude/skills/` and `.opencode/skills/` did not exist. I created them and
symlinked the two harness skills:

```
mkdir -p .claude/skills .opencode/skills
for host in .claude .opencode; do
  for skill in agent-harness-hooked-rules agent-harness-verify-gate; do
    ln -sfn "../../skills/$skill" "$host/skills/$skill"
  done
done
```

`git status --porcelain` then showed only `?? .claude/skills/` and `?? .opencode/`. Both were
removed at the end (see "Cleanup").

## Rerun — authoritative: full ordered sequence in one session per host

This rerun answers review finding 1. The sequence was sent as separate messages to one host session
on each host, in the required order: skill call, `/agent-harness-verify-gate`, `pnpm run build`
and the two identical `git commit` attempts, then the second skill call. Each host has one ledger
holding all three `repo-harness-tools` triggers.

The temporary setup from Step 0 was recreated (the same two symlinks in `.claude/skills/` and
`.opencode/skills/`, plus a temporary untracked `src/a.mts` for the Claude plain Read). It was
removed again at the end. `AGENT_HARNESS_TRACE=1` was set for every invocation; no file was edited
by either agent.

### OpenCode 2.4.1: one session, four `opencode run` messages

Each message was a fresh `opencode run` process (so the plugin reloads) but the same host session,
`ses_de2d4e274ffeqike0q4wB0xnJv`, passed with `--session`. Every one of the four JSON outputs
contains exactly that `sessionID`. The multiple `session.start` trace lines are the plugin's
per-process `ensureStarted` for that one session, not new sessions; the single ledger below is
the decisive proof.

Commands (run from the worktree, all `--standalone --auto --format json --title "hooked-rules live sequence"`):

```bash
# 1. skill call
AGENT_HARNESS_TRACE=1 timeout 300 opencode run --standalone --auto --format json \
  --title "hooked-rules live sequence" \
  'Call the Skill tool exactly once for the skill `agent-harness-hooked-rules`. Report the tool name you used and any extra context the call returned. Do not edit any file.'
# -> sessionID ses_de2d4e274ffeqike0q4wB0xnJv, exit 0, 13:21:33-13:21:55

# 2. the slash prompt
AGENT_HARNESS_TRACE=1 timeout 180 opencode run --standalone --auto --format json \
  --session ses_de2d4e274ffeqike0q4wB0xnJv --print-logs --log-level debug \
  --title "hooked-rules live sequence" \
  '/agent-harness-verify-gate'
# -> same sessionID, exit 0, 13:22:00-13:22:22

# 3. build, then commit and the identical retry
AGENT_HARNESS_TRACE=1 timeout 300 opencode run --standalone --auto --format json \
  --session ses_de2d4e274ffeqike0q4wB0xnJv \
  --title "hooked-rules live sequence" \
  'Run exactly `pnpm run build` in the repository root and report its exit status. Then run exactly `git commit --allow-empty -m "test: live gate"`. If it fails with a message about hooked rules, run exactly the same command one more time and report both results. Do not edit any file.'
# -> same sessionID, exit 0, 13:22:27-13:23:56

# 4. second skill call
AGENT_HARNESS_TRACE=1 timeout 180 opencode run --standalone --auto --format json \
  --session ses_de2d4e274ffeqike0q4wB0xnJv \
  --title "hooked-rules live sequence" \
  'Call the Skill tool for `agent-harness-hooked-rules` a second time and report any extra context the call returned. Do not edit any file.'
# -> same sessionID, exit 0, 13:24:00-13:24:20
```

Ordered trace excerpts, lines 78-100 (verbatim; line numbers are the trace file's):

```json
{"event":"session.start","processStart":1795785693559.77,"receivedAt":1795785698857,"handlersLoadedAt":1795785697794,"settledAt":1795785698915,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795785693559.77,"receivedAt":1795785698931,"handlersLoadedAt":1795785697794,"settledAt":1795785698946,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795785693559.77,"receivedAt":1795785703386,"handlersLoadedAt":1795785697794,"settledAt":1795785703393,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795785693559.77,"receivedAt":1795785703408,"handlersLoadedAt":1795785697794,"settledAt":1795785703417,"outcomes":{"hooked-rules":"result"}}
{"event":"turn.end","processStart":1795785693559.77,"receivedAt":1795785714795,"handlersLoadedAt":1795785697794,"settledAt":1795785715001,"outcomes":{"verify-gate":"failed"},"hostCreatedAt":1795785714787}
{"event":"session.start","processStart":1795785721288.7676,"receivedAt":1795785726313,"handlersLoadedAt":1795785725271,"settledAt":1795785726370,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795785721288.7676,"receivedAt":1795785726379,"handlersLoadedAt":1795785725271,"settledAt":1795785726400,"outcomes":{"hooked-rules":"result"}}
{"event":"tool.before","processStart":1795785721288.7676,"receivedAt":1795785732079,"handlersLoadedAt":1795785725271,"settledAt":1795785732085,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795785721288.7676,"receivedAt":1795785732108,"handlersLoadedAt":1795785725271,"settledAt":1795785732115,"outcomes":{"hooked-rules":"null"}}
{"event":"turn.end","processStart":1795785721288.7676,"receivedAt":1795785741717,"handlersLoadedAt":1795785725271,"settledAt":1795785741908,"outcomes":{"verify-gate":"failed"},"hostCreatedAt":1795785741706}
{"event":"session.start","processStart":1795785747764.2087,"receivedAt":1795785751536,"handlersLoadedAt":1795785750675,"settledAt":1795785751584,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795785747764.2087,"receivedAt":1795785751591,"handlersLoadedAt":1795785750675,"settledAt":1795785751603,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795785747764.2087,"receivedAt":1795785795988,"handlersLoadedAt":1795785750675,"settledAt":1795785796018,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795785747764.2087,"receivedAt":1795785801971,"handlersLoadedAt":1795785750675,"settledAt":1795785801990,"outcomes":{"hooked-rules":"result","verify-gate":"null"}}
{"event":"tool.before","processStart":1795785747764.2087,"receivedAt":1795785816525,"handlersLoadedAt":1795785750675,"settledAt":1795785816542,"outcomes":{"hooked-rules":"result","verify-gate":"null"}}
{"event":"tool.before","processStart":1795785747764.2087,"receivedAt":1795785825254,"handlersLoadedAt":1795785750675,"settledAt":1795785825274,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795785747764.2087,"receivedAt":1795785825497,"handlersLoadedAt":1795785750675,"settledAt":1795785825513,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"turn.end","processStart":1795785747764.2087,"receivedAt":1795785836217,"handlersLoadedAt":1795785750675,"settledAt":1795785836480,"outcomes":{"verify-gate":"failed"},"hostCreatedAt":1795785836208}
{"event":"session.start","processStart":1795785841256.6768,"receivedAt":1795785846174,"handlersLoadedAt":1795785845358,"settledAt":1795785846214,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795785841256.6768,"receivedAt":1795785846218,"handlersLoadedAt":1795785845358,"settledAt":1795785846241,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795785841256.6768,"receivedAt":1795785850067,"handlersLoadedAt":1795785845358,"settledAt":1795785850073,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795785841256.6768,"receivedAt":1795785850093,"handlersLoadedAt":1795785845358,"settledAt":1795785850104,"outcomes":{"hooked-rules":"null"}}
{"event":"turn.end","processStart":1795785841256.6768,"receivedAt":1795785859491,"handlersLoadedAt":1795785845358,"settledAt":1795785859857,"outcomes":{"verify-gate":"failed"},"hostCreatedAt":1795785859470}
```

Mapping (same session `ses_de2d4e274ffeqike0q4wB0xnJv` throughout):

| Trace lines | Message | Event | Outcome |
| --- | --- | --- | --- |
| 78-82 | 1, skill call | session.start, prompt, skill tool.before/after | `tool.after` = `result` (repo-harness-tools delivered) |
| 83-87 | 2, `/agent-harness-verify-gate` | session.start, **prompt**, skill call, turn.end | **`prompt` = `result`** (repo-harness-tools delivered); skill call = `null` (same trigger) |
| 88-95 | 3, build + commit | session.start, prompt, build before/after, commit before, retry before/after, turn.end | build `tool.after` = `result`; first commit `tool.before` = `result` (deny); retry `null` |
| 96-100 | 4, second skill call | session.start, prompt, skill before/after, turn.end | `tool.before` and `tool.after` = `null` |

Authoritative OpenCode ledger (verbatim) — one ledger for the one session, all three
`repo-harness-tools` triggers in one entry:

```json
{"version":1,"generation":0,"entries":{"repo-harness-tools.md":{"sha256":"037a22248342a6823942b6d983c92e0e06564e75ec00523cc3dc675e7633d9ab","generation":0,"state":"delivered","patterns":[],"triggers":["command:\\bpnpm\\s+(run\\s+)?(build|harness:update)(?=\\s|$)","skill:agent-harness-hooked-rules","skill:agent-harness-verify-gate"]},"repo-commit-types.md":{"sha256":"30516ed9c41b0f13fa7c76440caa695e1b136468420666de7f90077c42e9809c","generation":0,"state":"delivered","patterns":["\\bgit\\b[^;&|\\n]*?\\scommit\\b"],"triggers":[]}},"reported":[]}
```

The second skill call added no new key or trigger; the ledger is byte-identical before and after
message 4. The commit denial and retry in message 3:

```text
#3 tool="shell" status="error"
   input: {"command":"git commit --allow-empty -m \"test: live gate\"",...}
   error: "Commits and PR titles follow Conventional Commits: `type(optional scope): summary`.\n\n- Allowed types: `feat`, `fix`, `perf`, `docs`, `chore`, `ci`, `build`, `refactor`, `test`, `style`, `revert`.\n- `feat` bumps the minor version; `!` after the type or a `BREAKING CHANGE:` line bumps the major version; anything else bumps the patch version.\n- A PR title is at most 92 characters. GitHub squashes with the PR title as the commit subject, so the title picks the bump, and the parser matches `BREAKING CHANGE:` even inside a code fence."
#4 tool="shell" status="completed"
   input: {"command":"git commit --allow-empty -m \"test: live gate\"",...}
   output: "[feat/openspec-ff-change-issue-16 43d4bdc] test: live gate\n"
```

Model-context evidence for the OpenCode skill and build paths:

```text
message 1, skill call:   content blocks = 2; block1 len=645, "This repo ships its harness tools ..."
message 3, pnpm run build: content blocks = 2; block1 len=645, "This repo ships its harness tools ..."
message 4, second skill:  content blocks = 1; len=12461, no harness text
```

**OpenCode slash-prompt qualification (review finding 2).** The `prompt` event at trace line 84
returned `result`, and the ledger records `skill:agent-harness-verify-gate`, so the handler
delivered the rule. The adapter then queues the text (`queueSystem` in
`src/hook-runtime/lib/opencode-adapter.mts:478-495`) and injects it as `input.system` at the next
`context` hook. I could not capture that injection as model-visible text: `opencode session export
ses_de2d4e274ffeqike0q4wB0xnJv` contains no `This repo ships its harness tools` text in the slash
turn, and `--print-logs --log-level debug` stderr does not contain it either (the export does
contain it for the skill and build tool results). **For OpenCode's slash prompt the evidence is
therefore handler-level only**, not a quoted model-context line. Claude Code's equivalent is
model-level; see below.

Commit `43d4bdc` was created and then removed:

```bash
git log --oneline -2   # 43d4bdc test: live gate / b8a2556 docs(...)
git reset --hard b8a255605b99ec682ee42235b75eb2c605de851c
```

### Claude Code 2.1.332: one conversation, four `claude -p`/`--resume` messages

The conversation id is `dc4be8c6-5f0a-4acb-9c99-83d6d8d76333` (the first message's JSON
`session_id`; every `--resume` JSON output repeats it). Message 1 contained the plain `Read` of
`src/a.mts` before the first Skill call. Message 1 was killed by its 300 s shell timeout after it
had already written its JSON (`num_turns=9`, `is_error=false`), so it was resumed; the session and
its agent context persisted. Later messages finished normally. The long turns are the
trace-environment verify blocks described under Concerns.

Commands (run from the worktree; every command also had `--permission-mode bypassPermissions
--output-format json --debug hooks --debug-file <file>`):

```bash
# 1. plain Read + skill call
AGENT_HARNESS_TRACE=1 timeout 300 claude -p \
  'Use the Read tool exactly once on `src/a.mts` and report its first line. Then call the Skill tool exactly once for the skill `agent-harness-hooked-rules` and report the tool name and any extra context the call returned. Do not edit any file.' \
  ... > /tmp/opencode/claude-seq-1.json
# -> session dc4be8c6-5f0a-4acb-9c99-83d6d8d76333, killed at 300 s after writing JSON

# 2. the slash prompt
AGENT_HARNESS_TRACE=1 timeout 420 claude -p --resume dc4be8c6-5f0a-4acb-9c99-83d6d8d76333 \
  '/agent-harness-verify-gate' ... > /tmp/opencode/claude-seq-2.json
# -> same session, exit 0, 13:29:49-13:34:13

# 3. build + commit + identical retry
AGENT_HARNESS_TRACE=1 timeout 420 claude -p --resume dc4be8c6-5f0a-4acb-9c99-83d6d8d76333 \
  'Run exactly `pnpm run build` in the repository root and report its exit status. Then run exactly `git commit --allow-empty -m "test: live gate"`. If it fails with a message about hooked rules, run exactly the same command one more time and report both results. Do not edit any file.' \
  ... > /tmp/opencode/claude-seq-3.json
# -> same session, exit 0, 13:34:19-13:36:04

# 4. second skill call
AGENT_HARNESS_TRACE=1 timeout 420 claude -p --resume dc4be8c6-5f0a-4acb-9c99-83d6d8d76333 \
  'Call the Skill tool for `agent-harness-hooked-rules` a second time and report any extra context the call returned. Do not edit any file.' \
  ... > /tmp/opencode/claude-seq-4.json
# -> same session, exit 0, 13:36:10-13:40:49
```

Ordered trace excerpts, lines 101-139 (verbatim):

```json
{"event":"session.start","processStart":1795785875698.921,"receivedAt":1795785875823,"handlersLoadedAt":1795785875944,"settledAt":1795785875988,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795785878236.107,"receivedAt":1795785878367,"handlersLoadedAt":1795785878477,"settledAt":1795785878508,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795785880147.388,"receivedAt":1795785880249,"settledAt":1795785880252,"skipped":"no-subscriber","outcomes":{}}
{"event":"tool.after","processStart":1795785880398.051,"receivedAt":1795785880506,"settledAt":1795785880510,"skipped":"no-subscriber","outcomes":{}}
{"event":"tool.before","processStart":1795785880582.929,"receivedAt":1795785880669,"handlersLoadedAt":1795785880750,"settledAt":1795785880769,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795785880874.687,"receivedAt":1795785880981,"handlersLoadedAt":1795785881053,"settledAt":1795785881088,"outcomes":{"hooked-rules":"result"}}
{"event":"turn.end","processStart":1795785886480.131,"receivedAt":1795785886575,"handlersLoadedAt":1795785886671,"settledAt":1795785964196,"outcomes":{"verify-gate":"ran"}}
{"event":"tool.before","processStart":1795785968498.439,"receivedAt":1795785968582,"settledAt":1795785968585,"skipped":"no-subscriber","outcomes":{}}
{"event":"tool.after","processStart":1795785968660.109,"receivedAt":1795785968779,"settledAt":1795785968783,"skipped":"no-subscriber","outcomes":{}}
{"event":"tool.before","processStart":1795785970164.618,"receivedAt":1795785970271,"handlersLoadedAt":1795785970375,"settledAt":1795785970420,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795785991232.195,"receivedAt":1795785991324,"handlersLoadedAt":1795785991418,"settledAt":1795785991450,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.before","processStart":1795785996580.827,"receivedAt":1795785996657,"handlersLoadedAt":1795785996746,"settledAt":1795785996787,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795786017663.717,"receivedAt":1795786017777,"handlersLoadedAt":1795786017891,"settledAt":1795786017949,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"turn.end","processStart":1795786024113.84,"receivedAt":1795786024226,"handlersLoadedAt":1795786024312,"settledAt":1795786100627,"outcomes":{"verify-gate":"ran"}}
{"event":"turn.end","processStart":1795786104437.794,"receivedAt":1795786104520,"handlersLoadedAt":1795786104619,"settledAt":1795786174525,"outcomes":{"verify-gate":"failed"}}
{"event":"session.start","processStart":1795786191402.353,"receivedAt":1795786191505,"handlersLoadedAt":1795786191671,"settledAt":1795786191730,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795786194010.612,"receivedAt":1795786194116,"handlersLoadedAt":1795786194213,"settledAt":1795786194244,"outcomes":{"hooked-rules":"result"}}
{"event":"tool.before","processStart":1795786205835.775,"receivedAt":1795786205951,"handlersLoadedAt":1795786206069,"settledAt":1795786206116,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795786283955.906,"receivedAt":1795786284078,"handlersLoadedAt":1795786284181,"settledAt":1795786284228,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"turn.end","processStart":1795786293177.175,"receivedAt":1795786293306,"handlersLoadedAt":1795786293393,"settledAt":1795786370281,"outcomes":{"verify-gate":"ran"}}
{"event":"turn.end","processStart":1795786374332.377,"receivedAt":1795786374434,"handlersLoadedAt":1795786374518,"settledAt":1795786452955,"outcomes":{"verify-gate":"ran"}}
{"event":"session.start","processStart":1795786461460.889,"receivedAt":1795786461549,"handlersLoadedAt":1795786461684,"settledAt":1795786461725,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795786464147.866,"receivedAt":1795786464251,"handlersLoadedAt":1795786464337,"settledAt":1795786464368,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795786466938.422,"receivedAt":1795786467053,"handlersLoadedAt":1795786467142,"settledAt":1795786467183,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795786472508.286,"receivedAt":1795786472609,"handlersLoadedAt":1795786472677,"settledAt":1795786472715,"outcomes":{"hooked-rules":"result","verify-gate":"null"}}
{"event":"tool.before","processStart":1795786474890.784,"receivedAt":1795786474985,"handlersLoadedAt":1795786475075,"settledAt":1795786475115,"outcomes":{"hooked-rules":"result","verify-gate":"null"}}
{"event":"tool.before","processStart":1795786477291.59,"receivedAt":1795786477386,"handlersLoadedAt":1795786477464,"settledAt":1795786477505,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795786477802.502,"receivedAt":1795786477895,"handlersLoadedAt":1795786477977,"settledAt":1795786478015,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.before","processStart":1795786478077.85,"receivedAt":1795786478157,"handlersLoadedAt":1795786478236,"settledAt":1795786478274,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795786478381.128,"receivedAt":1795786478494,"handlersLoadedAt":1795786478587,"settledAt":1795786478625,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"turn.end","processStart":1795786483423.342,"receivedAt":1795786483532,"handlersLoadedAt":1795786483607,"settledAt":1795786563697,"outcomes":{"verify-gate":"ran"}}
{"event":"session.start","processStart":1795786571859.495,"receivedAt":1795786572021,"handlersLoadedAt":1795786572130,"settledAt":1795786572180,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795786574527.598,"receivedAt":1795786574644,"handlersLoadedAt":1795786574725,"settledAt":1795786574752,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795786576888.348,"receivedAt":1795786576968,"handlersLoadedAt":1795786577066,"settledAt":1795786577082,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795786577213.441,"receivedAt":1795786577322,"handlersLoadedAt":1795786577395,"settledAt":1795786577419,"outcomes":{"hooked-rules":"null"}}
{"event":"turn.end","processStart":1795786580337.232,"receivedAt":1795786580439,"handlersLoadedAt":1795786580542,"settledAt":1795786657390,"outcomes":{"verify-gate":"ran"}}
{"event":"tool.before","processStart":1795786663089.847,"receivedAt":1795786663207,"handlersLoadedAt":1795786663303,"settledAt":1795786663343,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795786767594.587,"receivedAt":1795786767689,"handlersLoadedAt":1795786767759,"settledAt":1795786767805,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"turn.end","processStart":1795786772341.051,"receivedAt":1795786772443,"handlersLoadedAt":1795786772526,"settledAt":1795786849181,"outcomes":{"verify-gate":"ran"}}
```

Mapping (same conversation `dc4be8c6-5f0a-4acb-9c99-83d6d8d76333` throughout):

| Trace lines | Message | Event | Outcome |
| --- | --- | --- | --- |
| 101-107 | 1, plain Read + skill call | session.start, prompt, Read before/after, Skill before/after, turn.end | Read both `skipped:"no-subscriber"`; Skill `tool.after` = `result` |
| 108-115 | 1 continued | model diagnostics after the verify block | no rule delivery |
| 116-121 | 2, `/agent-harness-verify-gate` | session.start, **prompt**, shell before/after, turn.end | **`prompt` = `result`**; shell = `null` |
| 122-131 | 3, build + commit | session.start, prompt, build before/after, commit before, retry before/after, shell, turn.end | build `tool.after` = `result`; first commit `tool.before` = `result`; retry `null` |
| 132-139 | 4, second skill call | session.start, prompt, Skill before/after, turn.end, shell, turn.end | `tool.before` and `tool.after` = `null` |

Authoritative Claude Code ledger (verbatim) — one ledger for the one conversation, all three
triggers in one entry:

```json
{"version":1,"generation":0,"entries":{"repo-harness-tools.md":{"sha256":"037a22248342a6823942b6d983c92e0e06564e75ec00523cc3dc675e7633d9ab","generation":0,"state":"delivered","patterns":[],"triggers":["command:\\bpnpm\\s+(run\\s+)?(build|harness:update)(?=\\s|$)","skill:agent-harness-hooked-rules","skill:agent-harness-verify-gate"]},"repo-commit-types.md":{"sha256":"30516ed9c41b0f13fa7c76440caa695e1b136468420666de7f90077c42e9809c","generation":0,"state":"delivered","patterns":["\\bgit\\b[^;&|\\n]*?\\scommit\\b"],"triggers":[]}},"reported":[]}
```

Model-context injection evidence (this is the direct line review finding 2 asked for). The session
transcript contains these `hook_additional_context` attachments, each with the full 645-byte
`repo-harness-tools` body:

```text
hook_additional_context PostToolUse:Skill   toolu_015yMQGh65of47bjN81CGVqV  contentlen=645
  "This repo ships its harness tools from `src/<tool>/` as committed `.mjs` under `skills/<skill>/assets/<tool>/`."
hook_additional_context UserPromptSubmit    (the /agent-harness-verify-gate message)  contentlen=645
  "This repo ships its harness tools from `src/<tool>/` as committed `.mjs` under `skills/<skill>/assets/<tool>/`."
hook_additional_context PostToolUse:Bash     toolu_014wjbXoWKaHA6hu4WbnLaMf (pnpm run build)  contentlen=645
  "This repo ships its harness tools from `src/<tool>/` as committed `.mjs` under `skills/<skill>/assets/<tool>/`."
```

The debug log corroborates it:

```text
[Hook UserPromptSubmit ... provided additionalContext (645 chars)]
[Hook PostToolUse:Skill ... additionalContext 645 chars]
[Hook PostToolUse:Bash ... additionalContext 645 chars]
```

There is no `PostToolUse:Skill` hook output for the second skill call; the step-4 debug log says
`PostToolUse:Skill ... produced no response payload — skipping attachment`, matching trace lines
134/135 `null`.

Denial and retry in message 3 (verbatim hook output from
`/tmp/opencode/claude-seq-3-debug.log`):

```text
Hook PreToolUse (node "$CLAUDE_PROJECT_DIR/.agents/harness/hook-runtime/claude.mjs") returned permissionDecision: deny (reason: Commits and PR titles follow Conventional Commits: `type(optional scope): summary`.

- Allowed types: `feat`, `fix`, `perf`, `docs`, `chore`, `ci`, `build`, `refactor`, `test`, `style`, `revert`.
- `feat` bumps the minor version; `!` after the type or a `BREAKING CHANGE:` line bumps the major version; anything else bumps the patch version.
- A PR title is at most 92 characters. GitHub squashes with the PR title as the commit subject, so the title picks the bump, and the parser matches `BREAKING CHANGE:` even inside a code fence.)
```

The identical retry succeeded: transcript result `[feat/openspec-ff-change-issue-16 a8d942a] test: live gate`
(the step-3 JSON `permission_denials` lists the denied first attempt). Commit `a8d942a` was then
removed:

```bash
git log --oneline -2   # a8d942a test: live gate / b8a2556 docs(...)
git reset --hard b8a255605b99ec682ee42235b75eb2c605de851c
```

### Rerun cleanup

```bash
rm -f src/a.mts \
  .claude/skills/agent-harness-hooked-rules .claude/skills/agent-harness-verify-gate \
  .opencode/skills/agent-harness-hooked-rules .opencode/skills/agent-harness-verify-gate
rmdir .claude/skills .opencode/skills .opencode
git status --porcelain    # empty
git rev-parse HEAD        # b8a255605b99ec682ee42235b75eb2c605de851c
```

## Run 1: OpenCode 2.4.1, main ordered sequence (supplementary, not one session)

Command (run from the worktree):

```bash
AGENT_HARNESS_TRACE=1 timeout 900 opencode run --standalone --auto --format json \
  --title "hooked-rules live" \
  "$(cat /tmp/opencode/hooked-rules-prompt.txt)" \
  > /tmp/opencode/oc-live.json 2> /tmp/opencode/oc-live.err
```

- `--standalone` was added to `opencode run --help`'s flags so this invocation started its own
  server and loaded the plugin fresh; the long-lived app that hosts this session is not restarted.
- Started `2026-11-27T12:56:53+00:00`, ended `2026-11-27T12:59:45+00:00`, exit `0`.
- `/tmp/opencode/oc-live.json` is 67,314 bytes of JSONL; stderr was empty.

Prompt sent (`/tmp/opencode/hooked-rules-prompt.txt`):

```text
Follow these steps in order. Do not edit any file anywhere.

1. Call the Skill tool exactly once for the skill `agent-harness-hooked-rules`. Report the tool name you used and any extra context the call returned.
2. Run exactly `pnpm run build` in the repository root and report its exit status.
3. Run exactly `git commit --allow-empty -m "test: live gate"`. If it fails with a message about hooked rules, run exactly the same command one more time and report both results.
4. Call the Skill tool for `agent-harness-hooked-rules` a second time and report any extra context the call returned.
5. Do not edit any file anywhere.

Then give a short report of each step.
```

Tool calls in `oc-live.json` (verbatim, trimmed to the relevant fields; the skill output is
truncated at 300 chars because it is the 13 KB skill text):

```text
#1 tool="skill" status="completed"
   input: {"id":"agent-harness-hooked-rules"}
   output: "<skill_content name=\"agent-harness-hooked-rules\">..."

#2 tool="shell" status="completed"
   input: {"command":"pnpm run build","workdir":"/home/dev/.t3/worktrees/agentic-development-skills/t3-ebb73c1f-4bfeaeef6834c54f"}
   output: "$ node scripts/build.mts\nbuild: 0 file(s) written or removed\n"

#3 tool="shell" status="error"
   input: {"command":"git commit --allow-empty -m \"test: live gate\"",...}
   error: "Commits and PR titles follow Conventional Commits: `type(optional scope): summary`.\n\n- Allowed types: `feat`, `fix`, `perf`, `docs`, `chore`, `ci`, `build`, `refactor`, `test`, `style`, `revert`.\n- `feat` bumps the minor version; `!` after the type or a `BREAKING CHANGE:` line bumps the major version; anything else bumps the patch version.\n- A PR title is at most 92 characters. GitHub squashes with the PR title as the commit subject, so the title picks the bump, and the parser matches `BREAKING CHANGE:` even inside a code fence."

#4 tool="shell" status="completed"
   input: {"command":"git commit --allow-empty -m \"test: live gate\"",...}
   output: "[feat/openspec-ff-change-issue-16 b4098ce] test: live gate\n"

#5 tool="skill" status="completed"
   input: {"id":"agent-harness-hooked-rules"}
   output: "<skill_content name=\"agent-harness-hooked-rules\">..."
```

The raw OpenCode result content blocks confirm delivery directly, without relying on the model's
report. `state.metadata.content` for each tool call is:

```text
tool#1 skill   content blocks: 2
  block0 len=12461  <skill_content name="agent-harness-hooked-rules">...
  block1 len=645    This repo ships its harness tools from `src/<tool>/` ...
tool#2 shell   content blocks: 2
  block0 len=61     "$ node scripts/build.mts\nbuild: 0 file(s) written or removed\n"
  block1 len=645    This repo ships its harness tools from `src/<tool>/` ...
tool#3 shell   status=error, output="" (first git commit denied)
tool#4 shell   content blocks: 1
  block0 len=59     "[feat/openspec-ff-change-issue-16 b4098ce] test: live gate\n"
tool#5 skill   content blocks: 1
  block0 len=12461  <skill_content name="agent-harness-hooked-rules">...
```

Block 1 on tool#1 and tool#2 is the full 645-byte `repo-harness-tools` body. The second skill
call (tool#5) has one block only and its length exactly equals tool#1's skill block, so no rule
text was appended. The trace and ledger below agree.

Trace lines 1-12 (verbatim; the only changes are the timestamps are the host's monotonic
`performance.timeOrigin` epoch, not wall clock):

```json
{"event":"session.start","processStart":1795784213796.8093,"receivedAt":1795784218227,"handlersLoadedAt":1795784217374,"settledAt":1795784218271,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795784213796.8093,"receivedAt":1795784218277,"handlersLoadedAt":1795784217374,"settledAt":1795784218288,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795784213796.8093,"receivedAt":1795784308754,"handlersLoadedAt":1795784217374,"settledAt":1795784308760,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795784213796.8093,"receivedAt":1795784308775,"handlersLoadedAt":1795784217374,"settledAt":1795784308784,"outcomes":{"hooked-rules":"result"}}
{"event":"tool.before","processStart":1795784213796.8093,"receivedAt":1795784312964,"handlersLoadedAt":1795784217374,"settledAt":1795784313001,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795784213796.8093,"receivedAt":1795784317844,"handlersLoadedAt":1795784217374,"settledAt":1795784317859,"outcomes":{"hooked-rules":"result","verify-gate":"null"}}
{"event":"tool.before","processStart":1795784213796.8093,"receivedAt":1795784347414,"handlersLoadedAt":1795784217374,"settledAt":1795784347429,"outcomes":{"hooked-rules":"result","verify-gate":"null"}}
{"event":"tool.before","processStart":1795784213796.8093,"receivedAt":1795784353278,"handlersLoadedAt":1795784217374,"settledAt":1795784353293,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795784213796.8093,"receivedAt":1795784353529,"handlersLoadedAt":1795784217374,"settledAt":1795784353544,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.before","processStart":1795784213796.8093,"receivedAt":1795784355797,"handlersLoadedAt":1795784217374,"settledAt":1795784355802,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795784213796.8093,"receivedAt":1795784355812,"handlersLoadedAt":1795784217374,"settledAt":1795784355820,"outcomes":{"hooked-rules":"null"}}
{"event":"turn.end","processStart":1795784213796.8093,"receivedAt":1795784385230,"handlersLoadedAt":1795784217374,"settledAt":1795784385557,"outcomes":{"verify-gate":"failed"},"hostCreatedAt":1795784385220}
```

Event mapping:

| Line | Event | Meaning |
| --- | --- | --- |
| 2 | `prompt` | the multi-step main prompt; first word is `Follow`, so nothing is delivered (`null`) |
| 3/4 | `tool.before`/`tool.after` | skill call #1; `after` delivered `repo-harness-tools` (`result`) |
| 5/6 | shell | `pnpm run build`; `after` delivered `repo-harness-tools` (`result`) |
| 7 | `tool.before` | first `git commit`; `repo-commit-types` denies (`result`) |
| 8/9 | shell | retry `git commit`; `before` passes (`null`), `after` has no matching rule (`null`) |
| 10/11 | skill | skill call #2; `before` and `after` return `null` (already delivered) |
| 12 | `turn.end` | verify gate "failed" only because of the trace-environment test issue described below |

Ledger `/home/dev/repos/agentic-development-skills/.git/worktrees/t3-ebb73c1f-4bfeaeef6834c54f/agent-harness/hooked-rules/sessions/opencode-ses_de2eb76f2ffepS4Kht9oYC47Ij/main/ledger.json`
(verbatim):

```json
{"version":1,"generation":0,"entries":{"repo-harness-tools.md":{"sha256":"037a22248342a6823942b6d983c92e0e06564e75ec00523cc3dc675e7633d9ab","generation":0,"state":"delivered","patterns":[],"triggers":["command:\\bpnpm\\s+(run\\s+)?(build|harness:update)(?=\\s|$)","skill:agent-harness-hooked-rules"]},"repo-commit-types.md":{"sha256":"30516ed9c41b0f13fa7c76440caa695e1b136468420666de7f90077c42e9809c","generation":0,"state":"delivered","patterns":["\\bgit\\b[^;&|\\n]*?\\scommit\\b"],"triggers":[]}},"reported":[]}
```

This is one entry for `repo-harness-tools` holding its two triggers (`skill:agent-harness-hooked-rules`
and the `pnpm run build` command pattern), and one `repo-commit-types` entry holding the matched
gate pattern after the deny-and-confirm pair. This is the expected "merge" behaviour.

Commit check:

```bash
git log --oneline -2
# b4098ce test: live gate
# b8a2556 docs(openspec): tick task 5 of deliver-hooked-rules
```

Working tree before reset contained only the two temporary symlink directories (clean tracked
tree). Reset:

```bash
git reset --hard b8a255605b99ec682ee42235b75eb2c605de851c
# HEAD is now at b8a2556 docs(openspec): tick task 5 of deliver-hooked-rules
```

## Run 2: OpenCode 2.4.1, `/agent-harness-verify-gate` prompt (supplementary, separate invocation)

Command:

```bash
AGENT_HARNESS_TRACE=1 timeout 300 opencode run --standalone --auto --format json \
  --title "hooked-rules slash" "/agent-harness-verify-gate" \
  > /tmp/opencode/oc-slash.json 2> /tmp/opencode/oc-slash.err
```

- Started `2026-11-27T13:00:19+00:00`; exit `124` at `13:05:19` (the 300 s shell timeout).
- The prompt/skill delivery happened within five seconds (trace line 14 at received
  `1795784424464`). The rest of the run went into the verify gate: OpenCode expanded the slash
  message into the `agent-harness-verify-gate` skill, the model ran
  `node .agents/harness/verify-gate/cli.mjs run`, hit the same trace-environment test failures,
  started investigating `verify-hosts.test.mjs`, and was killed at the outer timeout. It made no
  file edits. The child server reported by `timeout` was gone by the next `ps` check.

Trace line 13/14 (the run's first two lines after the 12 from Run 1):

```json
{"event":"session.start","processStart":1795784419323.2917,"receivedAt":1795784424359,"handlersLoadedAt":1795784423145,"settledAt":1795784424427,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795784419323.2917,"receivedAt":1795784424464,"handlersLoadedAt":1795784423145,"settledAt":1795784424486,"outcomes":{"hooked-rules":"result"}}
```

The `prompt` event returned `result` before the later `skill` tool call at line 15/16 returned
`hooked-rules: "null"`, so the `repo-harness-tools` delivery came from the prompt trigger, not the
command expansion.

`oc-slash.json` first tool call (verbatim excerpt):

```text
TOOL: skill status: completed input: {"id":"agent-harness-verify-gate"}
```

Ledger:

```json
{"version":1,"generation":0,"entries":{"repo-harness-tools.md":{"sha256":"037a22248342a6823942b6d983c92e0e06564e75ec00523cc3dc675e7633d9ab","generation":0,"state":"delivered","patterns":[],"triggers":["skill:agent-harness-verify-gate"]}},"reported":[]}
```

Finding: on OpenCode 2.4.1 the `/agent-harness-verify-gate` message reaches the `prompt` hook as
the raw text `/agent-harness-verify-gate` (it delivers), and the host also treats it as a command
that invokes the `skill` tool with `{"id":"agent-harness-verify-gate"}`. The second path produces
no second delivery because the prompt path already recorded the same `skill:` trigger.

## Run 3: Claude Code 2.1.332, main ordered sequence plus plain Read (supplementary, not one session)

I created `src/a.mts` (untracked, temporary) so the plain Read would succeed:

```bash
printf 'export const a = 1;\n' > src/a.mts
```

`src/a.mts` was deleted during cleanup.

Command:

```bash
AGENT_HARNESS_TRACE=1 timeout 900 claude -p "$(cat /tmp/opencode/claude-live-prompt.txt)" \
  --permission-mode bypassPermissions --output-format json \
  --name "hooked-rules claude live" \
  --debug hooks --debug-file /tmp/opencode/claude-live-debug.log \
  > /tmp/opencode/claude-live.json 2> /tmp/opencode/claude-live.err
```

- Started `2026-11-27T13:05:57+00:00`, ended `2026-11-27T13:12:45+00:00`, exit `0`.
- `claude-live.json`: `"is_error":false`, `"num_turns":15`, `"permission_denials"` lists the
  first `git commit` tool call. Full result text says the empty commit `1070ed4` exists and that
  the verify gate blocked three times on the trace-environment test issue (see Concerns).
- `claude-live.err` is empty.

Prompt sent (`/tmp/opencode/claude-live-prompt.txt`):

```text
Follow these steps in order. Do not edit any file anywhere.

1. Use the Read tool exactly once on `src/a.mts` and report the first line.
2. Call the Skill tool exactly once for the skill `agent-harness-hooked-rules`. Report the tool name you used and any extra context the call returned.
3. Run exactly `pnpm run build` in the repository root and report its exit status.
4. Run exactly `git commit --allow-empty -m "test: live gate"`. If it fails with a message about hooked rules, run exactly the same command one more time and report both results.
5. Call the Skill tool for `agent-harness-hooked-rules` a second time and report any extra context the call returned.
6. Do not edit any file anywhere.

Then give a short report of each step.
```

Session transcript at
`/home/dev/.claude/projects/-home-dev--t3-worktrees-agentic-development-skills-t3-ebb73c1f-4bfeaeef6834c54f/500c27b1-db82-475c-b4c0-65f1aa174d6f.jsonl`
shows this tool order (verbatim excerpts):

```text
TOOL_USE Read {"file_path":"/home/dev/.t3/worktrees/agentic-development-skills/t3-ebb73c1f-4bfeaeef6834c54f/src/a.mts"}
TOOL RESULT err=undefined text="1\texport const a = 1;\n2\t"

TOOL_USE Skill {"skill":"agent-harness-hooked-rules"}
TOOL RESULT err=undefined text="Launching skill: agent-harness-hooked-rules"

TOOL_USE Bash {"command":"pnpm run build","description":"Build the shipped tools"}
TOOL RESULT err=false text="$ node scripts/build.mts\nbuild: 0 file(s) written or removed"

TOOL_USE Bash {"command":"git commit --allow-empty -m \"test: live gate\"","description":"Create an empty test commit"}
TOOL RESULT id=toolu_01XBjKQEmWrkJq2jK1p2h5WD err=true text="PreToolUse:Bash hook error: Commits and PR titles follow Conventional Commits: `type(optional scope): summary`.\n\n- Allowed types: `feat`, `fix`, `perf`, `docs`, `chore`, `ci`, `build`, `refactor`, `test`, `style`, `revert`.\n- `feat` bumps the minor version; `!` after the type or a `BREAKING CHANGE:` line bumps the major version; anything else bumps the patch version.\n- A PR title is at most 92 characters. GitHub squashes with the PR title as the commit subject, so the title picks the bump, and the parser matches `BREAKING CHANGE:` even inside a code fence."

TOOL_USE Bash {"command":"git commit --allow-empty -m \"test: live gate\"","description":"Retry the empty test commit"}
TOOL_USE Skill {"skill":"agent-harness-hooked-rules"}
TOOL RESULT id=toolu_01TctnPeXDYDy5CpVaXDEvLw err=false text="[feat/openspec-ff-change-issue-16 1070ed4] test: live gate"
TOOL RESULT id=toolu_01FSZkNxLbj5omLY5j3hDRZZ err=undefined text="Launching skill: agent-harness-hooked-rules"
USER TEXT: "Skill /agent-harness-hooked-rules is already loaded above; instructions unchanged."
```

Trace lines 45-58 for this session (verbatim):

```json
{"event":"session.start","processStart":1795784759203.757,"receivedAt":1795784759306,"handlersLoadedAt":1795784759411,"settledAt":1795784759452,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795784761764.534,"receivedAt":1795784761933,"handlersLoadedAt":1795784762062,"settledAt":1795784762097,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795784763757.587,"receivedAt":1795784763865,"settledAt":1795784763869,"skipped":"no-subscriber","outcomes":{}}
{"event":"tool.after","processStart":1795784763993.508,"receivedAt":1795784764071,"settledAt":1795784764074,"skipped":"no-subscriber","outcomes":{}}
{"event":"tool.before","processStart":1795784765313.433,"receivedAt":1795784765413,"handlersLoadedAt":1795784765499,"settledAt":1795784765516,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795784765609.479,"receivedAt":1795784765696,"handlersLoadedAt":1795784765773,"settledAt":1795784765803,"outcomes":{"hooked-rules":"result"}}
{"event":"tool.before","processStart":1795784767070.701,"receivedAt":1795784767178,"handlersLoadedAt":1795784767269,"settledAt":1795784767309,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795784772623.134,"receivedAt":1795784772725,"handlersLoadedAt":1795784772805,"settledAt":1795784772846,"outcomes":{"hooked-rules":"result","verify-gate":"null"}}
{"event":"tool.before","processStart":1795784774548.593,"receivedAt":1795784774654,"handlersLoadedAt":1795784774748,"settledAt":1795784774792,"outcomes":{"hooked-rules":"result","verify-gate":"null"}}
{"event":"tool.before","processStart":1795784776121.874,"receivedAt":1795784776235,"handlersLoadedAt":1795784776327,"settledAt":1795784776375,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795784776746.569,"receivedAt":1795784776835,"handlersLoadedAt":1795784776927,"settledAt":1795784776970,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.before","processStart":1795784777033.149,"receivedAt":1795784777126,"handlersLoadedAt":1795784777209,"settledAt":1795784777227,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795784777311.041,"receivedAt":1795784777414,"handlersLoadedAt":1795784777507,"settledAt":1795784777532,"outcomes":{"hooked-rules":"null"}}
{"event":"turn.end","processStart":1795784784086.826,"receivedAt":1795784784183,"handlersLoadedAt":1795784784277,"settledAt":1795784861519,"outcomes":{"verify-gate":"ran"}}
```

Mapping:

| Line | Event | Meaning |
| --- | --- | --- |
| 46 | `prompt` | six-step prompt, first word `Follow`; no delivery (`null`) |
| 47/48 | Read | plain Read of `src/a.mts`; both PreToolUse and PostToolUse traced `skipped:"no-subscriber"` |
| 49/50 | Skill | skill call #1; `after` delivered `repo-harness-tools` (`result`) |
| 51/52 | Bash | `pnpm run build`; `after` delivered `repo-harness-tools` (`result`) |
| 53 | Bash before | first `git commit`; denied (`result`) |
| 54/55 | Bash | retry `git commit`; passes (`null`) and commits `1070ed4` |
| 56/57 | Skill | skill call #2; both `null` |
| 58+ | turn.end | verify gate runs; later blocks due to the trace-environment test issue |

Debug log `/tmp/opencode/claude-live-debug.log` shows the hook outputs verbatim. These are the
only two PostToolUse hook outputs that carry an `additionalContext` in this session:

```text
2026-11-27T13:06:05.815Z [DEBUG] "Hook PostToolUse:Skill (PostToolUse) success:
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"This repo ships its harness tools from `src/<tool>/` ..."}}

2026-11-27T13:06:12.857Z [DEBUG] "Hook PostToolUse:Bash (PostToolUse) success:
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"This repo ships its harness tools from `src/<tool>/` ..."}}
```

The full 645-byte `additionalContext` in both is the `repo-harness-tools` body:

```text
This repo ships its harness tools from `src/<tool>/` as committed `.mjs` under `skills/<skill>/assets/<tool>/`.

- Change a tool in `src/`, never by hand: bump `version` in `src/<tool>/tool.json` once per pull request, then run `pnpm run harness:update`. It rebuilds the assets and refreshes the installed copy in `.agents/harness/` and `.agents/harness/lock.json`.
- Never edit `skills/*/assets/` or `.agents/harness/` directly; the build and `harness:update` write them. Each tool's `check` compares its own installed copy with its lock entry, while `vendored.test.mjs` compares every installed tool folder with its skill assets byte for byte.
```

The transcript's attachment list contains exactly one `PostToolUse:Skill` hook success
(`toolu_01RZ7eMzyPiJBTzC8dLb96sX`, skill call #1) and one `PostToolUse:Bash` hook success
(`toolu_01HiHjq4oqVHNzmcGPuMXWnu`, the build). There is no hook success for the second Skill call
(`toolu_01FSZkNxLbj5omLY5j3hDRZZ`) — it returned no output, matching trace line 57's `null`.

Ledger
`/home/dev/repos/agentic-development-skills/.git/worktrees/t3-ebb73c1f-4bfeaeef6834c54f/agent-harness/hooked-rules/sessions/claude-code-500c27b1-db82-475c-b4c0-65f1aa174d6f/main/ledger.json`
(verbatim):

```json
{"version":1,"generation":0,"entries":{"repo-harness-tools.md":{"sha256":"037a22248342a6823942b6d983c92e0e06564e75ec00523cc3dc675e7633d9ab","generation":0,"state":"delivered","patterns":[],"triggers":["command:\\bpnpm\\s+(run\\s+)?(build|harness:update)(?=\\s|$)","skill:agent-harness-hooked-rules"]},"repo-commit-types.md":{"sha256":"30516ed9c41b0f13fa7c76440caa695e1b136468420666de7f90077c42e9809c","generation":0,"state":"delivered","patterns":["\\bgit\\b[^;&|\\n]*?\\scommit\\b"],"triggers":[]}},"reported":[]}
```

Commit check and reset:

```bash
git log --oneline -2
# 1070ed4 test: live gate
# b8a2556 docs(openspec): tick task 5 of deliver-hooked-rules
git reset --hard b8a255605b99ec682ee42235b75eb2c605de851c
# HEAD is now at b8a2556 docs(openspec): tick task 5 of deliver-hooked-rules
```

## Run 4: Claude Code 2.1.332, `/agent-harness-verify-gate` prompt (supplementary, separate invocation)

Command:

```bash
AGENT_HARNESS_TRACE=1 timeout 120 claude -p "/agent-harness-verify-gate" \
  --permission-mode bypassPermissions --output-format json \
  --name "hooked-rules claude slash" \
  --debug hooks --debug-file /tmp/opencode/claude-slash-debug.log \
  > /tmp/opencode/claude-slash.json 2> /tmp/opencode/claude-slash.err
```

- Started `2026-11-27T13:13:12+00:00`; exit `124` at `13:15:13` (120 s timeout). `claude-slash.json`
  was empty because `--output-format json` prints only at the end.
- The prompt delivery happened immediately; the model then expanded the command into the
  `agent-harness-verify-gate` skill and began investigating the same verify test failures, so it
  was killed. It made no edits.

Trace lines 68-72 (verbatim):

```json
{"event":"session.start","processStart":1795785193826.49,"receivedAt":1795785193956,"handlersLoadedAt":1795785194065,"settledAt":1795785194111,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795785196289.124,"receivedAt":1795785196440,"handlersLoadedAt":1795785196528,"settledAt":1795785196552,"outcomes":{"hooked-rules":"result"}}
{"event":"tool.before","processStart":1795785199751.214,"receivedAt":1795785199857,"handlersLoadedAt":1795785199951,"settledAt":1795785199989,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795785200330.716,"receivedAt":1795785200429,"handlersLoadedAt":1795785200514,"settledAt":1795785200551,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"turn.end","processStart":1795785204500.635,"receivedAt":1795785204606,"handlersLoadedAt":1795785204690,"settledAt":1795785281664,"outcomes":{"verify-gate":"ran"}}
```

Debug log excerpt proving the `UserPromptSubmit` hook produced the rule text:

```text
2026-11-27T13:13:16.563Z [DEBUG] Hooks: Checking first line for async: {"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"This repo ships its harness tools from `src/<tool>/` ..."}}
2026-11-27T13:13:16.576Z [DEBUG] Hooks: UserPromptSubmit [node "$CLAUDE_PROJECT_DIR/.agents/harness/hook-runtime/claude.mjs"] finished with status 0 (312ms)
2026-11-27T13:13:16.577Z [DEBUG] Hook UserPromptSubmit (...) provided additionalContext (645 chars)
```

The session transcript's first user message is
`<command-message>agent-harness-verify-gate</command-message>\n<command-name>/agent-harness-verify-gate</command-name>`.
`promptSkill` only matches a first whitespace-separated word beginning with `/`, so the `result`
outcome proves the hook itself received the raw text `/agent-harness-verify-gate`, not the
command wrapper text.

Ledger
`.../sessions/claude-code-b224b9e7-9e3c-4872-92c5-802d6e37dcc2/main/ledger.json` (verbatim):

```json
{"version":1,"generation":0,"entries":{"repo-harness-tools.md":{"sha256":"037a22248342a6823942b6d983c92e0e06564e75ec00523cc3dc675e7633d9ab","generation":0,"state":"delivered","patterns":[],"triggers":["skill:agent-harness-verify-gate"]}},"reported":[]}
```

## Host field findings vs. the adapter

| Host | Skill tool name | Field carrying the skill name | Observed value | Adapter expectation | Match |
| --- | --- | --- | --- | --- | --- |
| OpenCode 2.4.1 | `skill` | `input.input.id` (fallback `input.input.name`); the hook input's `id` is the call id | `agent-harness-hooked-rules`; also `agent-harness-verify-gate` | `KINDS.skill = 'skill'`, `toolInput.id` then `toolInput.name` in `toToolEvent` | yes |
| Claude Code 2.1.332 | `Skill` | `tool_input.skill` | `agent-harness-hooked-rules` | `KINDS.Skill = 'skill'`, `input.skill` in `toEvent` | yes |

No field differed, so no adapter or test change was made, `pnpm run build` was not needed for a
fix, and no commit was created.

Prompt text seen by the `prompt` hook (the trace does not store the event payload, so the text is
the invocation message plus the delivery outcome and, on Claude Code, the debug hook output):

| Run | Prompt text | Trace `prompt` outcome | Rule delivered |
| --- | --- | --- | --- |
| OpenCode main | the seven-step prompt quoted above, first word `Follow` | `null` | none |
| OpenCode slash | `/agent-harness-verify-gate` | `result` | `repo-harness-tools` |
| Claude main | the six-step prompt quoted above, first word `Follow` | `null` | none |
| Claude slash | `/agent-harness-verify-gate` (raw, before command expansion) | `result` | `repo-harness-tools` |

`promptSkill` returns a name only when the first whitespace-separated word is `/<name>`; a
`result` outcome therefore proves the hook saw the raw slash text in both slash runs, even though
the hosts later rendered the command wrapper form.

As a sanity check the existing adapter suites pass at this baseline:

```bash
node --test tests/agent-harness/opencode-adapter.test.mjs tests/agent-harness/claude-adapter.test.mjs
# ℹ tests 90
# ℹ pass 90
# ℹ fail 0
```

## Per-goal table (#16 goals, design.md "Goals")

| Goal | Authoritative live evidence (rerun unless stated) | Verdict |
| --- | --- | --- |
| Full ordered sequence in one host session per host (the Task 6 requirement) | OpenCode: one session `ses_de2d4e274ffeqike0q4wB0xnJv` across four `--session` messages, one ledger with all three triggers. Claude Code: one conversation `dc4be8c6-5f0a-4acb-9c99-83d6d8d76333` across four `--resume` messages, one ledger with all three triggers | PASS |
| Rule delivered at a skill on OpenCode | `skill`/`id=agent-harness-hooked-rules`; trace line 81 `tool.after` = `result`; content block 2 is the 645-byte rule; ledger trigger `skill:agent-harness-hooked-rules` | PASS |
| Rule delivered at a skill on Claude Code | `Skill`/`skill=agent-harness-hooked-rules`; trace line 106 `tool.after` = `result`; `hook_additional_context PostToolUse:Skill` is the 645-byte rule; ledger trigger | PASS |
| Rule delivered after a successful matching command on both | build `tool.after` = `result` (trace 91 OpenCode, 125 Claude); OpenCode content block 2 is the 645-byte rule; Claude `PostToolUse:Bash` additionalContext is 645 bytes; ledger trigger `command:\bpnpm\s+(run\s+)?(build|harness:update)(?=\s|$)` on both | PASS |
| Rule delivered at a `/<skill>` prompt on both | prompt = `result` (trace 84 OpenCode, 117 Claude); ledger trigger `skill:agent-harness-verify-gate` on both; Claude `UserPromptSubmit` additionalContext is 645 bytes. OpenCode is handler-level only (injection not captured) | PASS (OpenCode handler-level) |
| A repeated skill call does not deliver again | second `skill`/`Skill` call: trace `tool.before`/`tool.after` = `null` (OpenCode 98/99, Claude 134/135); no second `PostToolUse:Skill` output; ledger unchanged | PASS |
| One-time denial before a gated command, then retry allowed, on both | first `git commit`: `tool.before` = `result` (OpenCode 92, Claude 126) and the host error carries the repo-commit-types text; identical retry: `null` (OpenCode 93/94, Claude 127/128), commits `43d4bdc`/`a8d942a` created; ledger `repo-commit-types` delivered with the matched pattern | PASS |
| The handler holds no host knowledge; the runtime normalizes additively | both hosts supplied exactly the fields the adapters already expect (`skill`/`id`, `Skill`/`skill`); no handler-side host parsing | PASS |
| Plain Read still loads no handler on Claude Code | `Read` of `src/a.mts`: trace lines 103/104 `tool.before` and `tool.after` both `skipped:"no-subscriber"` | PASS |
| Rule file format stays veles's | not exercised by these live runs; covered by the task 2-4 grammar/delivery/CLI suites | PASS (prior tasks) |
| `install`/`update`/`check`/`pointers --check` work and this repo runs them | not part of this task's live-run scope; the installed copy and pointer block were already present and used by the runs | PASS (prior tasks) |

The per-goal verdicts are taken from the rerun session above. The earlier four runs are
supplementary and are not used to claim the same-session sequence.

## Differences / concerns

1. **No adapter field differed.** The only thing to fix would have been the Skill tool name or
   skill input field; both matched `skill`/`id` and `Skill`/`skill` exactly. Nothing was committed.

2. **`AGENT_HARNESS_TRACE=1` breaks two verify-host tests, and the trace-enabled runs therefore
   get verify blocks at turn end.** The two failing tests and their exact assumptions are:

   - `a no-change Stop prints nothing and its trace line says no-change`
     (`tests/agent-harness/verify-hosts.test.mjs:104-118`). It runs one Stop without the trace
     variable, asserts `r.log().length === 1`, then runs a second Stop with
     `AGENT_HARNESS_TRACE: '1'` and asserts the trace file has exactly one line. When the variable
     is already in the parent environment, both Stops are traced, so the count is 2, not 1
     (`2 !== 1`).
   - `OpenCode: a no-change turn end writes a trace line with hostCreatedAt`
     (`tests/agent-harness/verify-hosts.test.mjs:170-187`). It sets
     `process.env.AGENT_HARNESS_TRACE = '1'` itself for the second pass and then selects
     `.find((l) => l.event === 'turn.end')`. When the earlier pass was already traced because the
     variable was ambient, `.find` selects that earlier `ran` line instead of the new `no-change`
     line (a line-selection assumption, not a count of all lines).

   With the variable unset, `node --test tests/agent-harness/verify-hosts.test.mjs` passes 18/18.
   The mechanism is that `AGENT_HARNESS_TRACE` leaks into the child processes the tests spawn from
   the parent environment. This is pre-existing test fragility, not a hooked-rules defect; I left
   it untouched because Task 6 only allows an adapter fix if a live host field differs.

   **Correction to my earlier explanation:** Run 1's `trace.jsonl:12` outcome
   `{"verify-gate":"failed"}` was **not** a test result. It is the runtime's fail path for a
   handler that failed or timed out during shutdown (`src/hook-runtime/lib/runtime.mts:287-289`,
   `outcome: 'failed'`). On Claude Code, the turn ends that delivered actual verify blocks show
   `outcomes:{"verify-gate":"ran"}` and supply
   `Stop hook feedback: verify: node scripts/verify.mts failed (attempt N of 3)` to the model
   (for example trace lines 107, 120, 121, 131, 136 and 139 in this report). OpenCode's
   `turn.end` lines in the rerun show `failed` (runtime shutdown) and did not deliver a verify
   block in these runs. The distinction is: `failed` = handler failure/timeout in the runtime;
   `ran` = the handler ran the configured verify command, whether it passed or failed; it produces a
   block or context only when the command failed. The trace-enabled test failures explain the `ran`
   blocks, not Run 1's `failed` outcome.

3. **The `/agent-harness-verify-gate` message behaves as both a prompt and a command.** On both
   hosts the `prompt` hook received the raw slash text and delivered `repo-harness-tools`; the
   hosts also expanded the message into the verify-gate skill (OpenCode through a `skill` tool
   call with `{"id":"agent-harness-verify-gate"}`, Claude Code inline). The second path does not
   double-deliver because the ledger already holds the same `skill:` trigger. This is recorded as
   expected host behaviour, not a failure. As noted under the authoritative rerun, the OpenCode
   prompt delivery is handler-level evidence only; the Claude Code prompt delivery is model-level
   and is quoted from the transcript.

4. **The temporary `src/a.mts`.** `src/a.mts` does not exist in this repository; I created it for
   the plain-Read check, read it, and deleted it. It never affected the build (`build: 0 file(s)
   written or removed`).

## Cleanup and final state

```bash
rm -f src/a.mts \
  .claude/skills/agent-harness-hooked-rules .claude/skills/agent-harness-verify-gate \
  .opencode/skills/agent-harness-hooked-rules .opencode/skills/agent-harness-verify-gate
rmdir .claude/skills .opencode/skills .opencode
git status --porcelain    # empty
git log --oneline -2      # b8a2556 docs(openspec): tick task 5 of deliver-hooked-rules
                          # 3cd161a docs: correct hooked-rules onboarding and removal steps
git rev-parse HEAD        # b8a255605b99ec682ee42235b75eb2c605de851c
```

This cleanup was performed twice: after the four supplementary runs and again after the
authoritative rerun (both test commits were removed: `b4098ce`/`1070ed4` from the supplementary
runs, `43d4bdc`/`a8d942a` from the rerun). The final tracked and untracked state matches the
baseline: no symlinks, no `src/a.mts`, no test commit. The only residual artifacts are
hook-runtime trace and ledger files under the git directory (`.agents/harness` state, not the
working tree), which is expected for these runs.

Raw artifacts kept outside the repo:

```
/tmp/opencode/hooked-rules-prompt.txt
/tmp/opencode/oc-live.json /tmp/opencode/oc-live.err
/tmp/opencode/oc-slash.json /tmp/opencode/oc-slash.err
/tmp/opencode/claude-live-prompt.txt
/tmp/opencode/claude-live.json /tmp/opencode/claude-live.err
/tmp/opencode/claude-live-debug.log
/tmp/opencode/claude-slash.json /tmp/opencode/claude-slash.err
/tmp/opencode/claude-slash-debug.log
/tmp/opencode/trace-before-rerun.jsonl
/tmp/opencode/oc-seq-1.json /tmp/opencode/oc-seq-2.json
/tmp/opencode/oc-seq-3.json /tmp/opencode/oc-seq-4.json
/tmp/opencode/oc-seq-2.err /tmp/opencode/oc-seq-3.err
/tmp/opencode/export-seq.json
/tmp/opencode/claude-seq-1.json /tmp/opencode/claude-seq-1-debug.log
/tmp/opencode/claude-seq-2.json /tmp/opencode/claude-seq-2-debug.log
/tmp/opencode/claude-seq-3.json /tmp/opencode/claude-seq-3-debug.log
/tmp/opencode/claude-seq-4.json /tmp/opencode/claude-seq-4-debug.log
```

## What this task did not do

- Did not change the adapter, its tests, the rule files, the pointer block, or any installed
  `.agents/harness/` copy.
- Did not run task 7.3's check commands or write `apply.md`; the dispatched Task 6 instruction
  scoped this agent to the live runs, the report, and an adapter fix only if a host field differed.
- Did not touch #17 (`requires`, `exempt`), #18 (`stops`, `opsx:`) or #23 (veles's rule cases).

## Post-fix rerun — 2026-11-27, after `f2bc786`

This section supersedes every live run above. Commit
`f2bc7862a12b871c5ca1676ac603c1b507c3cb5e` ("fix: keep the hooked-rules gate under lock
contention") changed the ledger lock behaviour, so the earlier evidence no longer describes the
code under test. All runs below were made from the worktree at `f2bc786` with
`AGENT_HARNESS_TRACE=1` and with the temporary skill links in `.claude/skills/` and
`.opencode/skills/`.

Baseline and final HEAD: `f2bc7862a12b871c5ca1676ac603c1b507c3cb5e`. No code or rule file was
changed; the only commit made by this rerun is this evidence file.

Environment:

```
node --version            v26.13.1
pnpm --version            12.18.0
opencode --version        opencode v2.4.1
claude --version          2.1.332 (Claude Code)
git rev-parse --absolute-git-dir
  /home/dev/repos/agentic-development-skills/.git/worktrees/t3-ebb73c1f-4bfeaeef6834c54f
```

Trace and ledger locations are the same as above:

```
<git dir>/agent-harness/hook-runtime/trace.jsonl
<git dir>/agent-harness/hooked-rules/sessions/<host>-<session>/main/ledger.json
```

The trace had 139 lines before this rerun; the new runs append lines 140-259. They are quoted with
the trace file's own line numbers.

### A1. OpenCode 2.4.1: one session, four messages

Session `ses_de270de3dffeTWBQadBxe1jEkV`. Each message was a fresh `opencode run --standalone`
process (the plugin reloads) but the same host session via `--session`.

```bash
# 1. skill call
AGENT_HARNESS_TRACE=1 timeout 300 opencode run --standalone --auto --format json \
  --title "post-fix hooked-rules sequence" \
  'Call the Skill tool exactly once for the skill `agent-harness-hooked-rules`. Report the tool name you used and any extra context the call returned. Do not edit any file.'
# -> sessionID ses_de270de3dffeTWBQadBxe1jEkV, exit 0, 15:10:10-15:11:10Z

# 2. the slash prompt
AGENT_HARNESS_TRACE=1 timeout 300 opencode run --standalone --auto --format json \
  --session ses_de270de3dffeTWBQadBxe1jEkV --title "post-fix hooked-rules sequence" \
  '/agent-harness-verify-gate'
# -> same sessionID, exit 0, 15:11:11-15:11:41Z

# 3. build, then commit and the identical retry (prompt read from a file)
AGENT_HARNESS_TRACE=1 timeout 300 opencode run --standalone --auto --format json \
  --session ses_de270de3dffeTWBQadBxe1jEkV --title "post-fix hooked-rules sequence" \
  "$(cat /tmp/opencode/pf-seq-3-prompt.txt)"
# -> same sessionID, exit 0, 15:11:46-15:13:34Z

# 4. second skill call
AGENT_HARNESS_TRACE=1 timeout 300 opencode run --standalone --auto --format json \
  --session ses_de270de3dffeTWBQadBxe1jEkV --title "post-fix hooked-rules sequence" \
  "$(cat /tmp/opencode/pf-seq-4-prompt.txt)"
# -> same sessionID, exit 0, 15:13:35-15:14:15Z
```

Ordered trace excerpt, lines 140-164 (verbatim):

```json
{"event":"session.start","processStart":1795792247873.2673,"receivedAt":1795792253561,"handlersLoadedAt":1795792252244,"settledAt":1795792253765,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795792247873.2673,"receivedAt":1795792253779,"handlersLoadedAt":1795792252244,"settledAt":1795792253796,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795792247873.2673,"receivedAt":1795792261307,"handlersLoadedAt":1795792252244,"settledAt":1795792261316,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795792247873.2673,"receivedAt":1795792261332,"handlersLoadedAt":1795792252244,"settledAt":1795792261342,"outcomes":{"hooked-rules":"result"}}
{"event":"turn.end","processStart":1795792247873.2673,"receivedAt":1795792269993,"handlersLoadedAt":1795792252244,"settledAt":1795792270296,"outcomes":{"verify-gate":"failed"},"hostCreatedAt":1795792269983}
{"event":"session.start","processStart":1795792272705.841,"receivedAt":1795792277548,"handlersLoadedAt":1795792276411,"settledAt":1795792277669,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795792272705.841,"receivedAt":1795792277684,"handlersLoadedAt":1795792276411,"settledAt":1795792277805,"outcomes":{"hooked-rules":"result"}}
{"event":"tool.before","processStart":1795792272705.841,"receivedAt":1795792284783,"handlersLoadedAt":1795792276411,"settledAt":1795792284788,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795792272705.841,"receivedAt":1795792284809,"handlersLoadedAt":1795792276411,"settledAt":1795792284816,"outcomes":{"hooked-rules":"null"}}
{"event":"turn.end","processStart":1795792272705.841,"receivedAt":1795792300935,"handlersLoadedAt":1795792276411,"settledAt":1795792301168,"outcomes":{"verify-gate":"failed"},"hostCreatedAt":1795792300926}
{"event":"session.start","processStart":1795792312824.688,"receivedAt":1795792318639,"handlersLoadedAt":1795792317515,"settledAt":1795792318750,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795792312824.688,"receivedAt":1795792318758,"handlersLoadedAt":1795792317515,"settledAt":1795792318814,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795792312824.688,"receivedAt":1795792343155,"handlersLoadedAt":1795792317515,"settledAt":1795792343166,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795792312824.688,"receivedAt":1795792343207,"handlersLoadedAt":1795792317515,"settledAt":1795792343218,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795792312824.688,"receivedAt":1795792346116,"handlersLoadedAt":1795792317515,"settledAt":1795792346141,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795792312824.688,"receivedAt":1795792355330,"handlersLoadedAt":1795792317515,"settledAt":1795792355362,"outcomes":{"hooked-rules":"result","verify-gate":"null"}}
{"event":"tool.before","processStart":1795792312824.688,"receivedAt":1795792365742,"handlersLoadedAt":1795792317515,"settledAt":1795792365763,"outcomes":{"hooked-rules":"result","verify-gate":"null"}}
{"event":"tool.before","processStart":1795792312824.688,"receivedAt":1795792372979,"handlersLoadedAt":1795792317515,"settledAt":1795792372997,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795792312824.688,"receivedAt":1795792373184,"handlersLoadedAt":1795792317515,"settledAt":1795792373195,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"turn.end","processStart":1795792312824.688,"receivedAt":1795792413609,"handlersLoadedAt":1795792317515,"settledAt":1795792414015,"outcomes":{"verify-gate":"failed"},"hostCreatedAt":1795792413591}
{"event":"session.start","processStart":1795792416129.2778,"receivedAt":1795792421381,"handlersLoadedAt":1795792420111,"settledAt":1795792421551,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795792416129.2778,"receivedAt":1795792421555,"handlersLoadedAt":1795792420111,"settledAt":1795792421568,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795792416129.2778,"receivedAt":1795792444331,"handlersLoadedAt":1795792420111,"settledAt":1795792444338,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795792416129.2778,"receivedAt":1795792444352,"handlersLoadedAt":1795792420111,"settledAt":1795792444359,"outcomes":{"hooked-rules":"null"}}
{"event":"turn.end","processStart":1795792416129.2778,"receivedAt":1795792454862,"handlersLoadedAt":1795792420111,"settledAt":1795792455142,"outcomes":{"verify-gate":"failed"},"hostCreatedAt":1795792454850}
```

Mapping (same session throughout):

| Trace lines | Message | Events | Outcome |
| --- | --- | --- | --- |
| 140-144 | 1, skill call | session.start, prompt, skill before/after, turn.end | `tool.after` = `result` (repo-harness-tools delivered) |
| 145-149 | 2, `/agent-harness-verify-gate` | session.start, **prompt**, tool before/after, turn.end | **`prompt` = `result`**; tool pair = `null` (same trigger already recorded) |
| 150-159 | 3, build + commit | session.start, prompt, an unrelated `verification-before-completion` skill pair, build before/after, commit before, retry before/after, turn.end | build `tool.after` = `result`; first commit `tool.before` = `result` (deny); retry `null`/`null` |
| 160-164 | 4, second skill call | session.start, prompt, skill before/after, turn.end | `tool.before` and `tool.after` = `null` |

The unrelated skill call in message 3 is the model choosing to load `verification-before-completion`
before running the build; it matches no rule and delivery is `null`/`null`. It does not affect the
sequence.

Authoritative OpenCode ledger (verbatim) — one ledger for the session, all three
`repo-harness-tools` triggers in one entry:

```json
{"version":1,"generation":0,"entries":{"repo-harness-tools.md":{"sha256":"037a22248342a6823942b6d983c92e0e06564e75ec00523cc3dc675e7633d9ab","generation":0,"state":"delivered","patterns":[],"triggers":["command:\\bpnpm\\s+(run\\s+)?(build|harness:update)(?=\\s|$)","skill:agent-harness-hooked-rules","skill:agent-harness-verify-gate"]},"repo-commit-types.md":{"sha256":"30516ed9c41b0f13fa7c76440caa695e1b136468420666de7f90077c42e9809c","generation":0,"state":"delivered","patterns":["\\bgit\\b[^;&|\\n]*?\\scommit\\b"],"triggers":[]}},"reported":[]}
```

The denial and the retry in message 3 (verbatim from `pf-oc-seq-3.json`):

```text
#3 tool="shell" status="error"
   input: {"command":"git commit --allow-empty -m \"test: live gate\"",...}
   error: "Commits and PR titles follow Conventional Commits: `type(optional scope): summary`.\n\n- Allowed types: `feat`, `fix`, `perf`, `docs`, `chore`, `ci`, `build`, `refactor`, `test`, `style`, `revert`.\n- `feat` bumps the minor version; `!` after the type or a `BREAKING CHANGE:` line bumps the major version; anything else bumps the patch version.\n- A PR title is at most 92 characters. GitHub squashes with the PR title as the commit subject, so the title picks the bump, and the parser matches `BREAKING CHANGE:` even inside a code fence."
#4 tool="shell" status="completed"
   input: {"command":"git commit --allow-empty -m \"test: live gate\"",...}
   output: "[feat/openspec-ff-change-issue-16 72ebad0] test: live gate\n"
```

Model-context evidence (OpenCode `metadata.content` blocks):

```text
message 1, skill:        blocks = 2; lengths 12897, 645  -> block 1 is the repo-harness-tools rule
message 3, build:        blocks = 2; lengths 61, 645    -> block 1 is the repo-harness-tools rule
message 3, first commit: blocks = 0 (status error, denied)
message 4, second skill: blocks = 1; length 12897      -> no rule block
```

The repeat added nothing: the ledger's mtime is `2026-11-27 15:12:52.986` (the retry commit in
message 3), while message 4 ran to `15:14:15Z`; the file was never rewritten. Trace lines 162/163
are `null`/`null`, and the message-4 skill block has exactly the same length as the message-1 skill
block with no 645-byte tail. The ledger above is the same before and after message 4.

**OpenCode slash prompt remains handler-level.** The trace `prompt` event (line 146) returned
`result` and the ledger records `skill:agent-harness-verify-gate`. As in the earlier evidence, the
injected text could not be captured as a model-visible message in `opencode session export`; that
export contains the rule only in the skill/build turns. The OpenCode slash-prompt evidence is
therefore handler-level, not model-level.

### A2. Claude Code 2.1.332: one conversation, four `claude -p` messages

Conversation `71de436c-bfe7-4d14-bec1-917b961137d0`. Messages 2-4 used `--continue`; every output
repeats the same `session_id`.

```bash
# 1. skill call
AGENT_HARNESS_TRACE=1 timeout 600 claude -p \
  'Call the Skill tool exactly once for the skill `agent-harness-hooked-rules`. Report the tool name you used and any extra context the call returned. Do not edit any file.' \
  --permission-mode bypassPermissions --output-format json \
  --name "post-fix hooked-rules claude seq" \
  --debug hooks --debug-file /tmp/opencode/pf-claude-seq-1-debug.log
# -> session 71de436c-bfe7-4d14-bec1-917b961137d0, exit 0, 15:14:40-15:14:51Z

# 2. the slash prompt
AGENT_HARNESS_TRACE=1 timeout 600 claude -p --continue '/agent-harness-verify-gate' \
  --permission-mode bypassPermissions --output-format json \
  --debug hooks --debug-file /tmp/opencode/pf-claude-seq-2-debug.log
# -> same session, exit 0, 15:14:51-15:15:10Z

# 3. build, then commit and the identical retry (prompt read from a file)
AGENT_HARNESS_TRACE=1 timeout 900 claude -p --continue "$(cat /tmp/opencode/pf-seq-3-prompt.txt)" \
  --permission-mode bypassPermissions --output-format json \
  --debug hooks --debug-file /tmp/opencode/pf-claude-seq-3-debug.log
# -> same session, exit 0, 15:15:10-15:15:38Z

# 4. second skill call
AGENT_HARNESS_TRACE=1 timeout 600 claude -p --continue "$(cat /tmp/opencode/pf-seq-4-prompt.txt)" \
  --permission-mode bypassPermissions --output-format json \
  --debug hooks --debug-file /tmp/opencode/pf-claude-seq-4-debug.log
# -> same session, exit 0, 15:15:38-15:15:50Z
```

Ordered trace excerpt, lines 165-189 (verbatim):

```json
{"event":"session.start","processStart":1795792480076.289,"receivedAt":1795792480230,"handlersLoadedAt":1795792480359,"settledAt":1795792480423,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795792482764.712,"receivedAt":1795792482873,"handlersLoadedAt":1795792482997,"settledAt":1795792483023,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795792484388.837,"receivedAt":1795792484489,"handlersLoadedAt":1795792484583,"settledAt":1795792484598,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795792484701.399,"receivedAt":1795792484791,"handlersLoadedAt":1795792484899,"settledAt":1795792484936,"outcomes":{"hooked-rules":"result"}}
{"event":"turn.end","processStart":1795792490141.214,"receivedAt":1795792490236,"handlersLoadedAt":1795792490372,"settledAt":1795792490507,"outcomes":{"verify-gate":"no-change"}}
{"event":"session.start","processStart":1795792494676.628,"receivedAt":1795792494828,"handlersLoadedAt":1795792494985,"settledAt":1795792495142,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795792497651.159,"receivedAt":1795792497810,"handlersLoadedAt":1795792497963,"settledAt":1795792498044,"outcomes":{"hooked-rules":"result"}}
{"event":"tool.before","processStart":1795792504004.452,"receivedAt":1795792504242,"handlersLoadedAt":1795792504435,"settledAt":1795792504500,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795792505178.367,"receivedAt":1795792505347,"handlersLoadedAt":1795792505492,"settledAt":1795792505539,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"turn.end","processStart":1795792509813.817,"receivedAt":1795792509909,"handlersLoadedAt":1795792510074,"settledAt":1795792510241,"outcomes":{"verify-gate":"no-change"}}
{"event":"session.start","processStart":1795792515330.065,"receivedAt":1795792515503,"handlersLoadedAt":1795792515867,"settledAt":1795792516017,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795792518574.648,"receivedAt":1795792518739,"handlersLoadedAt":1795792518941,"settledAt":1795792519016,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795792520573.556,"receivedAt":1795792520713,"handlersLoadedAt":1795792520830,"settledAt":1795792520875,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795792526961.325,"receivedAt":1795792527062,"handlersLoadedAt":1795792527161,"settledAt":1795792527212,"outcomes":{"hooked-rules":"result","verify-gate":"null"}}
{"event":"tool.before","processStart":1795792528721.843,"receivedAt":1795792528833,"handlersLoadedAt":1795792528928,"settledAt":1795792528975,"outcomes":{"hooked-rules":"result","verify-gate":"null"}}
{"event":"tool.before","processStart":1795792531227.401,"receivedAt":1795792531335,"handlersLoadedAt":1795792531440,"settledAt":1795792531505,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795792531871.024,"receivedAt":1795792531998,"handlersLoadedAt":1795792532107,"settledAt":1795792532155,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.before","processStart":1795792532222.777,"receivedAt":1795792532357,"handlersLoadedAt":1795792532472,"settledAt":1795792532516,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795792532598.499,"receivedAt":1795792532716,"handlersLoadedAt":1795792532828,"settledAt":1795792532867,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"turn.end","processStart":1795792536823.891,"receivedAt":1795792536935,"handlersLoadedAt":1795792537049,"settledAt":1795792537188,"outcomes":{"verify-gate":"no-change"}}
{"event":"session.start","processStart":1795792541544.59,"receivedAt":1795792541680,"handlersLoadedAt":1795792541817,"settledAt":1795792541869,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"prompt","processStart":1795792544190.082,"receivedAt":1795792544280,"handlersLoadedAt":1795792544373,"settledAt":1795792544400,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.before","processStart":1795792546199.454,"receivedAt":1795792546315,"handlersLoadedAt":1795792546417,"settledAt":1795792546439,"outcomes":{"hooked-rules":"null"}}
{"event":"tool.after","processStart":1795792546618.425,"receivedAt":1795792546746,"handlersLoadedAt":1795792546865,"settledAt":1795792546890,"outcomes":{"hooked-rules":"null"}}
{"event":"turn.end","processStart":1795792549762.008,"receivedAt":1795792549869,"handlersLoadedAt":1795792549998,"settledAt":1795792550152,"outcomes":{"verify-gate":"no-change"}}
```

Mapping:

| Trace lines | Message | Events | Outcome |
| --- | --- | --- | --- |
| 165-169 | 1, skill call | session.start, prompt, Skill before/after, turn.end | `tool.after` = `result` |
| 170-174 | 2, `/agent-harness-verify-gate` | session.start, **prompt**, Bash before/after, turn.end | **`prompt` = `result`**; Bash `null`/`null` |
| 175-184 | 3, build + commit | session.start, prompt, build before/after, commit before, retry before/after, `git log` before/after, turn.end | build `tool.after` = `result`; first commit `tool.before` = `result`; retry `null`/`null` |
| 185-189 | 4, second skill call | session.start, prompt, Skill before/after, turn.end | both `null` |

Authoritative Claude Code ledger (verbatim) — one ledger for the conversation, all three triggers:

```json
{"version":1,"generation":0,"entries":{"repo-harness-tools.md":{"sha256":"037a22248342a6823942b6d983c92e0e06564e75ec00523cc3dc675e7633d9ab","generation":0,"state":"delivered","patterns":[],"triggers":["command:\\bpnpm\\s+(run\\s+)?(build|harness:update)(?=\\s|$)","skill:agent-harness-hooked-rules","skill:agent-harness-verify-gate"]},"repo-commit-types.md":{"sha256":"30516ed9c41b0f13fa7c76440caa695e1b136468420666de7f90077c42e9809c","generation":0,"state":"delivered","patterns":["\\bgit\\b[^;&|\\n]*?\\scommit\\b"],"triggers":[]}},"reported":[]}
```

Denial and retry (verbatim from `pf-claude-seq-3-debug.log` and the transcript):

```text
2026-11-27T15:15:29.001Z [DEBUG] "Hook PreToolUse (...) returned permissionDecision: deny (reason: Commits and PR titles follow Conventional Commits: `type(optional scope): summary`.

- Allowed types: `feat`, `fix`, `perf`, `docs`, `chore`, `ci`, `build`, `refactor`, `test`, `style`, `revert`.
- `feat` bumps the minor version; `!` after the type or a `BREAKING CHANGE:` line bumps the major version; anything else bumps the patch version.
- A PR title is at most 92 characters. GitHub squashes with the PR title as the commit subject, so the title picks the bump, and the parser matches `BREAKING CHANGE:` even inside a code fence.)
```

The transcript's Bash result for the first attempt is
`PreToolUse:Bash hook error: Commits and PR titles follow Conventional Commits: ...`, and the retry
result is `[feat/openspec-ff-change-issue-16 3acac9e] test: live gate`.

Model-context attachments in the transcript — exactly three `hook_additional_context` entries
carry the 645-byte rule, and none follows the second skill call:

```text
2026-11-27T15:14:44.961Z  645 bytes  PostToolUse:Skill   (message 1)
2026-11-27T15:14:58.100Z  645 bytes  UserPromptSubmit    (message 2, the slash prompt)
2026-11-27T15:15:27.238Z  645 bytes  PostToolUse:Bash    (message 3, the build)
```

The ledger's mtime is `2026-11-27 15:15:31.473`; message 4 ran `15:15:38-15:15:50Z` and did not
rewrite it. Trace lines 187/188 are `null`/`null`, and the debug log contains no
`PostToolUse:Skill` output for message 4.

Both test commits from A were removed with `git reset --hard f2bc786`: OpenCode `72ebad0`, Claude
Code `3acac9e`.

### B. C1 regression: gated commit as one of three parallel shell hooks

Prompt used for every fresh Claude Code trial (first action, one assistant message):

```text
Make exactly these three Bash tool calls in ONE assistant message, in parallel, with no tool call before them and no other tool call in that message:

1. `ls`
2. `ls -la`
3. `git commit --allow-empty -m "test: parallel gate"`

Then report each call's outcome. Do not edit any file.
```

Each trial was a new `claude -p` (no `--continue`), then a second `claude -p --continue` retry:

```bash
AGENT_HARNESS_TRACE=1 timeout 600 claude -p "$(cat /tmp/opencode/pf-parallel-prompt.txt)" \
  --permission-mode bypassPermissions --output-format json \
  --debug hooks --debug-file /tmp/opencode/pf-claude-par-N-debug.log
AGENT_HARNESS_TRACE=1 timeout 600 claude -p --continue "$(cat /tmp/opencode/pf-parallel-retry.txt)" \
  --permission-mode bypassPermissions --output-format json \
  --debug hooks --debug-file /tmp/opencode/pf-claude-par-Nb-debug.log
```

Outcomes:

| Trial | Fresh session | One-message proof | First message | Retry |
| --- | --- | --- | --- | --- |
| 1 | `96b36714-4cf9-45f1-b3b9-48c6c27b7fc8` | all three tool_use blocks carry message id `msg_011ChTerLuQLHYQkqEwfe6pX`; the consolidated transcript record also lists 3 Bash calls | `denials=1`, HEAD still `f2bc786` (no commit) | commit `514576c`, then reset |
| 2 | `949873e0-25f7-45c7-936b-0ded77b7d744` | message id `msg_011ChTethkbMaT`, 3 Bash calls | `denials=1`, HEAD still `f2bc786` | commit `871cbcf`, then reset |
| 3 | `748f54a6-c2e4-4021-a3ab-233529a65c0d` | message id `msg_011ChTew3326Kg` on all three tool_use records (three records, one call each) | `denials=1`, HEAD still `f2bc786` | commit `e6ad849`, then reset |

Every trial's `permission_denials` entry is the `git commit` tool call, and every denial reason in
the debug logs is the repo-commit-types text (`Commits and PR titles follow Conventional Commits:
...`). The trace for the three trials shows three near-simultaneous `tool.before` events, exactly
one of which returns `result` (the commit), for example trial 1 at lines 192-196:

```json
{"event":"tool.before","processStart":1795792566132.543,"receivedAt":1795792570974,"handlersLoadedAt":1795792571056,"settledAt":1795792571095,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795792566132.543,"receivedAt":1795792571364,"handlersLoadedAt":1795792571463,"settledAt":1795792571502,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.before","processStart":1795792566132.543,"receivedAt":1795792571470,"handlersLoadedAt":1795792571572,"settledAt":1795792571611,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.after","processStart":1795792566132.543,"receivedAt":1795792571848,"handlersLoadedAt":1795792571931,"settledAt":1795792571974,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
{"event":"tool.before","processStart":1795792566132.543,"receivedAt":1795792572109,"handlersLoadedAt":1795792572184,"settledAt":1795792572230,"outcomes":{"hooked-rules":"result","verify-gate":"null"}}
```

Trials 2 and 3 repeat the same shape at lines 205-209 (`result` on the third `tool.before`) and
lines 218-222 (`result` on the third `tool.before`). That is the regression fixed by `f2bc786`: the
gate waited for the sibling worker's lock instead of silently passing.

OpenCode trial, same prompt translated to its `shell` tool:

```bash
AGENT_HARNESS_TRACE=1 timeout 300 opencode run --standalone --auto --format json \
  --title "post-fix parallel gate" "$(cat /tmp/opencode/pf-parallel-oc-prompt.txt)"
```

Session `ses_de26a878bffe0yaKOmOFhqbUOc`; all three shell calls carry message id
`msg_21d959937001oPBU6YCS20TOHw` and their `state.time.start` values are within 125 ms
(`1795792715668`, `1795792715777`, `1795792715793`). The commit call is `status="error"` with the
repo-commit-types text, and `ls`/`ls -la` are `completed`. No commit was created. The ledger is:

```json
{"version":1,"generation":0,"entries":{"repo-commit-types.md":{"sha256":"30516ed9c41b0f13fa7c76440caa695e1b136468420666de7f90077c42e9809c","generation":0,"state":"pending","patterns":["\\bgit\\b[^;&|\\n]*?\\scommit\\b"],"triggers":[]}},"reported":[]}
```

The requested second-message OpenCode retry did not run: the host answered that no tool calls were
allowed for that message and nothing was executed. This is a host/agent behaviour, not a gate
result; the Claude Code retries above and the OpenCode A sequence cover the passing retry.

### C. Non-matching shell events do not need the lock

`ls` alone was run in fresh contexts on both hosts, then again on Claude Code while a scratch
process held the worker lock (the same staged lock used for D).

| Run | Context | `ledger.json` | `tool.before` settle time |
| --- | --- | --- | --- |
| OpenCode `ls` only | `opencode-ses_de268980effetC7hEgEAZuEGQj` | absent (state folder has only the supervisor's released `gate.lock.1`) | 29 ms (`receivedAt` 1795792801986 -> `settledAt` 1795792802015) |
| Claude Code `ls` only | `claude-code-d0a50a5e-0f80-48af-984a-edac6397dd22` | absent | 469 ms (includes hook process start; 1795792846736 -> 1795792847205) |
| Claude Code `ls` while the worker lock is held | same session, `gate.lock.2` live | still absent | 120 ms (1795792887787 -> 1795792887907) |

The third row is the decisive one: the same held lock made the gated commit wait 1179 ms (D), but
the `ls` event finished in 120 ms and wrote nothing. The trace line is:

```json
{"event":"tool.before","processStart":1795792882685.64,"receivedAt":1795792887787,"handlersLoadedAt":1795792887867,"settledAt":1795792887907,"outcomes":{"hooked-rules":"null","verify-gate":"null"}}
```

The `session.start` event in that run took 1168 ms (`1795792882835 -> 1795792884003`) because the
startup diagnostic deliberately waits for the lock; that is not the `ls` tool event. No
`ledger.json` existed before or after any of these runs.

The unit test covering the skip path is `a shell event that matches no rule skips the lock instead
of waiting for it` in `tests/agent-harness/hooked-rules-delivery.test.mjs` (it holds the lock and
asserts the call returns in under 500 ms and writes no ledger).

### D. A lock held past the wait raises the manual notice

Staged on Claude Code in the `d0a50a5e-0f80-48af-984a-edac6397dd22` session, whose context had no
commit-rule entry. A detached `sleep 90` (pid `3016312`) held the newest supervisor lock:

```text
<state dir>/gate.lock.2 = {"pid":3016312,"at":...,"pgids":[]}
```

Then:

```bash
AGENT_HARNESS_TRACE=1 timeout 600 claude -p --continue "$(cat /tmp/opencode/pf-hold-prompt.txt)" \
  --permission-mode bypassPermissions --output-format json \
  --debug hooks --debug-file /tmp/opencode/pf-claude-hold-debug.log
```

Result: `is_error=false`, `permission_denials=[]`, and the commit ran:

```text
[feat/openspec-ff-change-issue-16 3cd7847] test: hold gate
```

The manual notice was delivered as PreToolUse `additionalContext` (182 chars, not a denial):

```text
hook hooked-rules failed on tool.before: the ledger lock could not be won in time. Read the hooked rules listed in AGENTS.md (.agents/hooked-rules/) by hand at the moments they name.
```

It appears both in the transcript's `hook_additional_context` at `15:21:11.276Z` and in
`pf-claude-hold-debug.log`:

```text
2026-11-27T15:21:11.266Z [DEBUG] Hook PreToolUse (...) provided additionalContext (182 chars)
```

The trace line is the ~1 s retry then failure, with no ledger write:

```json
{"event":"tool.before","processStart":1795792869924.61,"receivedAt":1795792870058,"handlersLoadedAt":1795792870193,"settledAt":1795792871237,"outcomes":{"hooked-rules":"failed","verify-gate":"null"}}
```

`receivedAt -> settledAt` is 1179 ms; `outcomes["hooked-rules"]` is `failed`; `ledger.json` is
absent; and the host did not deny the call. The scratch holder and `gate.lock.2` were removed and
the test commit was reset.

The unit tests for this behaviour are `a held lock fails a gated command open with the manual
notice and records nothing` and `a contended supervisor lock is retried so the gate still denies
within the wait`, both in `tests/agent-harness/hooked-rules-delivery.test.mjs`.

### Post-fix verification

```bash
env -u AGENT_HARNESS_TRACE node --test tests/agent-harness/hooked-rules-delivery.test.mjs
# ℹ tests 61
# ℹ pass 61
# ℹ fail 0

env -u AGENT_HARNESS_TRACE node --test tests/agent-harness/hooked-rules-cli.test.mjs
# ℹ tests 23
# ℹ pass 23
# ℹ fail 0
```

### Cleanup and final state

Test commits removed (each with `git reset --hard f2bc786`):

```text
72ebad0  test: live gate        (A, OpenCode)
3acac9e  test: live gate        (A, Claude Code)
514576c  test: parallel gate    (B trial 1)
871cbcf  test: parallel gate    (B trial 2)
e6ad849  test: parallel gate    (B trial 3)
3cd7847  test: hold gate        (D)
```

The temporary skill links were removed:

```bash
rm -f .claude/skills/agent-harness-hooked-rules .claude/skills/agent-harness-verify-gate \
      .opencode/skills/agent-harness-hooked-rules .opencode/skills/agent-harness-verify-gate
rmdir .claude/skills .opencode/skills .opencode
```

Final state before committing this evidence section:

```text
git status --porcelain    empty
git rev-parse HEAD        f2bc7862a12b871c5ca1676ac603c1b507c3cb5e
```

Only the hook-runtime trace and ledger state under the git directory remain, as expected.

### Post-fix concerns

1. **OpenCode slash prompt is still handler-level only.** The `prompt` event returns `result` and
   the ledger records `skill:agent-harness-verify-gate`, but the injected text is not visible in
   `opencode session export`. Claude Code's equivalent is model-level (the 645-byte
   `UserPromptSubmit` attachment quoted above).
2. **The OpenCode B retry did not execute.** After the parallel denial the host refused to make
   tool calls in the next message, so only the denial is recorded for that trial. The Claude Code
   retries and the OpenCode A retry both show the identical retry passing.
3. **`AGENT_HARNESS_TRACE=1` still perturbs the verify-gate tests.** OpenCode turn ends show
   `verify-gate:"failed"` (runtime shutdown after the handler time budget) and Claude Code turn
   ends show `no-change`; no verify block interfered with the hook events above. This is the
   pre-existing test fragility described in the earlier report, not a hooked-rules result.
4. **The D lock was staged by hand** with a real live `sleep` process and a well-formed
   `gate.lock.2`; it was removed immediately after the run. The behaviour matches the unit test,
   but it is a staged condition, not an organic contention run.
