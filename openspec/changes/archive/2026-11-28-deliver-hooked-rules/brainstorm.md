## Design Summary

Issue raidenyn/agentic-development-skills#16 (`agent-harness/m2-rule-delivery/1`): the first part of M2 of the
[harness RFC](../../design/archive/2026-11-agent-harness/rfc-split-agent-harness-into-node-skills.md#milestones). A hooked
rule is delivered at a skill, after a command and as a denial before a gated command, by a Node handler that the hook
runtime runs on OpenCode and Claude Code, in this repository.

The new skill `agent-harness-hooked-rules` ships the tool `hooked-rules`: strict TypeScript in `src/hooked-rules/`,
built into `skills/agent-harness-hooked-rules/assets/hooked-rules/` and copied into `.agents/harness/hooked-rules/`
by its own `install` and `update`, like the verify gate. It reads `.agents/hooked-rules/*.md` in veles's format,
which the RFC keeps UNCHANGED (`pointer`, `skills`, `commands`, `gates`, `stops`, `requires`, `exempt`).

- **At a skill.** A Skill tool call, a `/<skill>` prompt, or a read of `.../skills/<name>/SKILL.md` delivers the
  rules whose `skills` list the name, as context, once per agent context, until the rule file changes or the
  context is compacted.
- **After a command.** A shell call that succeeded and matches a rule's `commands` regex delivers that rule as
  context, with the same once-only bookkeeping.
- **Before a gated command.** A shell call that matches a rule's `gates` regex is denied once with the rule text
  when the rule was not delivered in this agent context. The denied rule is recorded as pending, and the retry of a
  command matching the same gate passes and marks it delivered.

The hook runtime gains three additive fields so that the handler never reads host input (owner's pick, approach A):
a tool kind `skill` for the Skill tool, a `skill` name on Skill calls and on reads of a `SKILL.md`, and `ok` on
`tool.after`. A handler that declares the kind `skill` also receives reads that carry `skill`, so the rules handler
declares `["shell", "skill"]` and plain Read, Glob, Grep and MCP calls stay skipped on Claude Code.

The tool also writes and checks the generated pointer block in the root `AGENTS.md` (`pointers`,
`pointers --check`), which is the fallback the failure notice points to. This repository is onboarded with two
rules in the same pull request, and the hook runtime is brought up to date with `update`.

## Alternatives Considered

### Alternative A: Normalized skill fields in the runtime (chosen)
- **Approach**: the adapters set kind `skill`, `skill` and `ok`; the dispatch filter and the Claude Code skip let a
  `skill` declaration match a read that carries `skill`.
- **Pros**: no host knowledge in the handler, as the Hook handler interface asks; hook cost of plain reads stays at
  zero; the contract change is additive.
- **Cons**: touches the hook runtime, so it needs a version bump and `update` here (the issue already plans that).
- **Why chosen**: it is the only option that keeps both the interface's intent and the cost cut of #61.

### Alternative B: The handler reads raw host input
- **Approach**: the handler reads `tool_input.skill`, `args.id`, `file_path` and `path` itself, declaring `read` and
  `other`.
- **Pros**: no runtime change.
- **Cons**: the interface rejected it ("puts host knowledge in every handler"); every read and MCP call loads
  handlers again on Claude Code (about 0.1 s each).
- **Why not chosen**: it reverses two settled decisions.

### Alternative C: Normalized fields without a filter change
- **Approach**: as A, but the handler declares `read` to see `SKILL.md` reads.
- **Pros**: smaller runtime change.
- **Cons**: the cost of every Read, Glob and Grep comes back.
- **Why not chosen**: the issue asks to state or avoid that cost, and A avoids it for little more code.

## Agreed Approach

Alternative A, picked by the owner on 2026-11-27, with the scope split below, also picked by the owner.

## Key Decisions

- **Scope split inside M2's one pull request (owner, 2026-11-27).** This change parses all seven keys. It rejects
  a rule that uses `requires` or `exempt` (task `agent-harness/m2-rule-delivery/2`, #17) or `stops`
  (`agent-harness/m2-rule-delivery/3`, #18) with an error that names the key as not supported yet. `opsx:` aliases
  and the apply-skill arming are #18's. Those tasks lift the rejections.
- **Pointer block in this change (owner, 2026-11-27).** `pointers` and `pointers --check` port veles's
  `render_pointer_block` and block placement, because the failure notice tells the agent to read the rules listed
  in `AGENTS.md`.
- **Port, not redesign (my call).** Grammar, size limits (4096-byte body, 64 KiB file, 9000-byte context cap), rule
  order by file name, the one-blank-line separator, deny-once with pending patterns, and per-context bookkeeping
  follow `scripts/agent_rules.py` at veles `a86633dc`. Where the runtime already gives something (agent context,
  state folder, compaction events), the handler uses it instead of veles's own store.
- **Regexes in JavaScript (my call).** Patterns are compiled with the `u` flag. Python and JavaScript differ on
  Unicode `\b` and a few escapes; this change states the dialect in the skill, and the check of veles's six rules
  stays with #23, as the RFC's open question says.
- **Onboarding here (my call).** Two rules: `repo-commit-types.md` (gates `git commit` and `gh pr create|edit`,
  skill `openspec-apply-change`) and `repo-harness-tools.md` (command `pnpm run harness:update` and
  `pnpm run build`, skills `agent-harness-hook-runtime`, `agent-harness-verify-gate`, `agent-harness-hooked-rules`).
  Together they show all three moments in this repo.

## Open Questions

- The OpenCode 2.4.1 Skill tool name and input field (`skill` with `id`, per veles's plugin against 2.3.2) and how
  OpenCode passes a `/<skill>` prompt to the `prompt` hook are checked live in this change; the adapter follows what
  the live run shows.
