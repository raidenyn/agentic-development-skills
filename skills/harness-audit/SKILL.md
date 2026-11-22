---
name: harness-audit
description: Use when auditing a repository's agentic-coding harness (AGENTS.md, specs, verify command, hooks, permissions, sandbox, evals) to produce a prioritized TODO list of harness improvements for that repo.
---

# Harness audit

Audit the current repository against a validated checklist of agentic-coding harness features and produce a prioritized TODO list. The checklist was merged from four AI research reports (Claude, Gemini, DeepSeek, GPT; Nov 2026) and checked against primary sources.

**This is a read-only audit.** Do not change code, config, or git state. Only inspect files and run read-only commands (`ls`, `find`, `rg`, `wc`, `git log`, `--help`, dry runs). Do not run builds or test suites unless the user asks; read CI config instead.

## Procedure

1. **Profile the repo.** Record at the top of the report:
   - **Repo size:** `S` = few packages, full build/test under ~5 min · `M` = ~10–50 packages or several languages · `L` = 50+ packages, multi-language, or full CI over ~10–15 min.
   - **Team:** `Solo` · `Team` (2–5) · `Org` (>5 or multiple teams). Infer from `git shortlog -sn --since=6.months`, CODEOWNERS; ask if unclear.
   - **Languages and build tools** (e.g. Kotlin+Gradle, TS+pnpm, Rust+Cargo, Python+uv), **agent hosts** (look for `.claude/`, `AGENTS.md`, `.codex/`, `.opencode/`, T3 Code, Pi config), **CI system**, **non-Linux targets** (Windows, macOS, iOS, watchOS).
2. **Walk every item below in order (A1 → I7).** For each one:
   - Check `Applies when`. If it does not apply, mark `N/A` with a one-line reason.
   - Run the `Detect` checks. Mark `Present`, `Partial` or `Missing`, and cite evidence (file path, line, command output).
   - If `Partial` or `Missing`, write a TODO from `Add`, using this repo's real paths and commands.
3. **Set priority** = the item's base priority, adjusted by its `Applies when` notes (e.g. "P2 for S, P1 for L"). Do not invent items not grounded in the repo.
4. **Respect confidence.** `High` = confirmed in official docs or the original source. `Med` = sound practice, but a named tool is young or numbers are vendor-reported. `Low` = unconfirmed; treat as an idea to evaluate, never a requirement. Carry confidence into each TODO. Before recommending exact config for a `Med`/`Low` tool, check its current docs.
5. **Report.** Use this format:

   ```
   # Harness audit: <repo> (<date>)
   Profile: size=<S|M|L>, team=<Solo|Team|Org>, languages=..., hosts=..., CI=..., non-Linux targets=...

   ## TODO
   | ID | Item | Status | Evidence | TODO (concrete) | Priority | Effort (S/M/L) | Confidence |

   ## Phases
   Phase 1 (P0) · Phase 2 (P1) · Phase 3 (P2/P3) — item IDs in suggested order

   ## Already good
   ## Not applicable
   ```

   Sort TODOs by priority, then effort. Show the report in chat. Write it to a file only if the user asks (suggested path `docs/harness-audit-<date>.md`).

**Legend.** Priority: P0 = do first, every repo · P1 = high value soon · P2 = conditional, when scale demands · P3 = advanced, only at large scale or after foundations. "Backed by": C = Claude, G = Gemini, D = DeepSeek, O = GPT report.

---

## A. Context and instructions

### A1. Short root instruction file (AGENTS.md) that acts as a map
- **What:** One root `AGENTS.md` (~100–200 lines max) with repo layout, canonical build/test/verify commands, key invariants, and links into deeper docs. Not an encyclopedia.
- **Detect:** `AGENTS.md` and/or `CLAUDE.md` at root; `wc -l`; does it list the real verify command; does it contain style rules a linter could enforce (bad); stale paths (`grep` referenced paths, check they exist).
- **Add:** Trim to a table of contents; move details to `docs/`; list exact commands.
- **CLAUDE.md wiring (important):** Claude Code reads `AGENTS.md` natively **only when no `CLAUDE.md` exists** in the working directory or above (v2.1.277+). If the repo has both, Claude reads only `CLAUDE.md`. So either delete `CLAUDE.md`, or make it a thin file that imports `@AGENTS.md` plus Claude-only notes.
- **Applies when:** all. P0.
- **Backed by:** C, G, D, O · **Confidence:** High (Claude Code memory docs: "target under 200 lines per CLAUDE.md"; OpenAI harness post: AGENTS.md "roughly 100 lines" as table of contents).

### A2. Nested per-package instruction files
- **What:** `AGENTS.md` (or `CLAUDE.md`) inside each package/service with that package's commands and conventions. Nearer file wins.
- **Detect:** `find . -name AGENTS.md -o -name CLAUDE.md -not -path '*/node_modules/*'`; compare against list of top-level packages.
- **Add:** One short file per package that has its own toolchain or non-obvious rules.
- **Applies when:** M/L, or any polyglot repo. P1 (P2 for S single-language).
- **Backed by:** C, G, D, O · **Confidence:** High (Claude Code loads subdirectory files on demand; AGENTS.md spec supports nesting).

### A3. Path-scoped language rules
- **What:** `.claude/rules/*.md` with `paths:` glob frontmatter (e.g. `**/*.kt`, `crates/**/*.rs`) so language rules load only when matching files are touched.
- **Detect:** `ls .claude/rules/`; check frontmatter has `paths:`.
- **Add:** Move language-specific guidance out of root files into rules.
- **Applies when:** Claude Code is a host and ≥2 languages. P1.
- **Backed by:** G · **Confidence:** High (Claude Code docs). Note: other hosts ignore these files, so keep host-neutral essentials in AGENTS.md.

### A4. Repo docs as system of record
- **What:** Architecture, decision records (ADRs), runbooks, ownership, quality bar live in versioned `docs/`. Anything only in chat/Docs/heads is invisible to agents.
- **Detect:** `docs/` exists with ARCHITECTURE / ADR / runbook content; AGENTS.md links into it; CI link checker on docs.
- **Add:** `docs/architecture.md`, `docs/adr/`, `docs/runbooks/`; add a markdown link check to CI.
- **Applies when:** M/L or Team/Org. P1 (P2 for S+Solo).
- **Backed by:** G, D, O · **Confidence:** High (OpenAI harness engineering post, Feb 2026).

### A5. Instruction hygiene and periodic audit
- **What:** No style rules in prose (delegate to formatters/linters); prefer pointers over pasted snippets; audit instruction files after each model upgrade.
- **Detect:** Prose rules duplicating linter config; last audit date; broken references.
- **Add:** Run `/doctor prompt-audit` in Claude Code (official, v2.1.283+; checks CLAUDE.md, AGENTS.md, rules, skills, commands, subagents for stale or contradictory instructions). Schedule it after model upgrades.
- **Applies when:** all. P1.
- **Backed by:** G, D · **Confidence:** High for the audit command. Do not cite instruction-count limits (e.g. "~150–200 instructions"); no source confirms them.

### A6. Skills for repeatable procedures
- **What:** Recurring procedures (release, migration, review, verify-change, prepare-PR) as Agent Skills (`.claude/skills/<name>/SKILL.md` + scripts), loaded on demand instead of living in always-loaded instructions.
- **Detect:** `ls .claude/skills/` (or host equivalent); recurring procedures described in AGENTS.md prose.
- **Add:** 2–5 skills for the most common multi-step tasks; keep each self-contained.
- **Applies when:** M/L or Team/Org. P1 (P2 for S+Solo).
- **Backed by:** C, G, D, O · **Confidence:** High.

### A7. Vendored references for fast-moving dependencies
- **What:** Pinned, read-only API references for key libraries (`docs/references/*-llms.txt`, or `.repos/<lib>/`), so agents don't use stale APIs.
- **Detect:** Presence of such a folder; libraries with frequent breaking changes in lockfiles.
- **Add:** Add `llms.txt`/doc snapshots for the 2–5 most churned dependencies, with a refresh script.
- **Applies when:** fast-moving SDKs in use. P2.
- **Backed by:** G · **Confidence:** Med (pattern cited from OpenAI post and T3 Code repo; not independently checked here).

### A8. Session-start context pre-hydration
- **What:** A `SessionStart` (or `UserPromptSubmit`) hook that prints short, useful state: active OpenSpec changes, current branch/diff summary, recent CI status, linked issue.
- **Detect:** `.claude/settings.json` → `hooks.SessionStart`.
- **Add:** Hook script with bounded output (< ~50 lines). No secrets in output.
- **Applies when:** all; most value for M/L. P2.
- **Backed by:** G · **Confidence:** High for the hook; the Stripe "deterministic pre-hydration" pattern is confirmed in Stripe's Minions post (Feb 2026).

---

## B. Specification and process (OpenSpec)

### B1. One spec system, validated in CI
- **What:** OpenSpec (`openspec/specs/`, `openspec/changes/`) as the single source of behavioral truth. If SuperSpec/Superpowers skills are used, they run over the same `openspec/` tree, not a second spec tree.
- **Detect:** `openspec/` exists; only one spec tree; CI runs `openspec validate`.
- **Add:** CI step `openspec validate --all --strict --json`; optional pre-commit `openspec validate --archived` (checks archived changes have all tasks ticked).
- **Applies when:** any repo doing non-trivial behavior changes with agents. P0 for M/L or Team; P1 for S+Solo.
- **Backed by:** C, G, D, O · **Confidence:** High (OpenSpec CLI docs; Thoughtworks Radar moved OpenSpec to **Trial** on 2026-11-04).

### B2. Every task carries its own verification command
- **What:** Each line in `tasks.md` names how it is verified, e.g. `Verify: ./h test services/payments --case PaymentRetry`.
- **Detect:** `grep -c "Verify:"` vs task count across `openspec/changes/*/tasks.md`.
- **Add:** Repo convention in AGENTS.md + a CI/lint check that open tasks have a `Verify:` line.
- **Applies when:** B1 applies. P0.
- **Backed by:** D, G, O · **Confidence:** Med. OpenSpec itself only uses checkboxes; this is a convention you add, not a built-in rule.

### B3. TDD gate during apply
- **What:** Tasks can't be ticked without a failing-then-passing test tied to the spec scenario (Superpowers TDD skill or equivalent).
- **Detect:** Instructions/skills enforcing red→green; recent changes where code landed without tests (`git log --stat` on archived changes).
- **Add:** Require the TDD skill in `/opsx:apply`; a Stop/TaskCompleted hook that blocks finishing when changed source has no changed tests (heuristic).
- **Applies when:** codebases with unit tests. P1.
- **Backed by:** C, G · **Confidence:** Med (mechanism sound; the "300 lines of logic with zero tests" anecdote is a practitioner blog, not verified).

### B4. Archive and sync before merge
- **What:** Completed changes are synced into `openspec/specs/` and archived before or at merge, so specs match shipped behavior.
- **Detect:** Old unarchived dirs in `openspec/changes/`; CI rule.
- **Add:** PR check: a merged change must be archived (`openspec archive -y <change>` in a post-merge job or required before merge). `/opsx:sync`, `/opsx:verify`, `/opsx:bulk-archive` exist (verify and bulk-archive need the expanded profile: `openspec config profile`).
- **Applies when:** B1 applies; Team/Org especially. P1.
- **Backed by:** G, O · **Confidence:** High (OpenSpec docs).

### B5. Spec→task→PR traceability
- **What:** PR body/trailer names the change (e.g. `OpenSpec-Change: payment-retry`); optional per-change metadata (owners, risk, required checks).
- **Detect:** PR template; recent PR bodies.
- **Add:** PR template field + CI check that behavior-touching PRs reference a change (or declare `skip_specs`).
- **Applies when:** Team/Org. P2 (P1 for Org).
- **Backed by:** O · **Confidence:** Med (custom convention; `skip_specs: true` in `.openspec.yaml` is real).

### B6. Ceremony scaled to risk
- **What:** Quick path for small fixes (`/opsx:propose`), full path (`/opsx:new` → `/opsx:continue`) for cross-language features; documented in AGENTS.md.
- **Detect:** Whether AGENTS.md says when a spec is required.
- **Add:** A 3-row table "change type → required process".
- **Applies when:** B1 applies. P2.
- **Backed by:** G, D · **Confidence:** High for OpenSpec commands. Low for SuperSpec-specific features (intensity tiers, typed blockers, spec-size caps): check the actual SuperSpec package in use, since several unrelated projects share the name.

### B7. Golden principles + scheduled cleanup
- **What:** A short list of named invariants (`docs/golden-principles.md`) and recurring "garbage collection" / doc-gardening runs that open small PRs.
- **Detect:** Such a doc; scheduled workflows that run agents for cleanup.
- **Add:** Write 5–10 principles; weekly scheduled agent job (see I2) for dead code, stale docs, duplicate helpers.
- **Applies when:** M/L with high agent PR volume. P2 (P1 for L+Org).
- **Backed by:** D, G, O · **Confidence:** High (OpenAI post: replaced "every Friday (20% of the week)" cleanup with golden-principle background tasks).

---

## C. Verification and feedback loops

### C1. One verify entrypoint used everywhere
- **What:** A single repo command (e.g. `./h check`, `mise run verify`, `just verify`, `make verify`) with modes `--changed` (seconds), `--affected` (minutes), `--all` (authoritative). The **same** command is called by agent hooks, pre-commit, and CI.
- **Detect:** Look for such a script; compare what CI runs vs what pre-commit runs vs what hooks run. Any divergence = Partial.
- **Add:** Thin wrapper that maps intents to native tools (Gradle, pnpm, Cargo, uv). Don't reimplement build tools. Document it first in AGENTS.md.
- **Applies when:** all. P0.
- **Backed by:** C, G, D, O · **Confidence:** High as a practice. `harness-scaffold` (PyPI, v0.4.0, beta, generates verify.sh + GitLab CI + per-agent adapters) exists but is young; optional.

### C2. Fast, strict per-language checks
- **What:** Deterministic checkers the agent runs in its inner loop.
  - **Kotlin/JVM:** Gradle compile + detekt + ktlint/spotless; Gradle build cache and configuration cache (preferred mode since Gradle 9).
  - **TypeScript:** `tsc --noEmit` with `strict: true`; consider TypeScript 7.0 native compiler (released 2026-07-08, 8–12× faster full builds per Microsoft) for CLI/CI. 7.0 ships no compiler API, and Vue/Svelte/Astro/MDX/Angular template tooling still needs TS 6.x. ESLint flat config.
  - **Rust:** `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo nextest`.
  - **Python:** Ruff (lint+format) + a type checker (Pyrefly, ty, Pyright or mypy).
- **Detect:** Config files (`detekt.yml`, `tsconfig.json` strict, `clippy.toml`/CI flags, `ruff.toml`/`pyproject.toml`), and whether they run in `--changed` mode.
- **Add:** Missing checkers; narrow to changed files/projects.
- **Applies when:** per language present. P0.
- **Backed by:** C, G, O, D · **Confidence:** High for tools. Speed figures are **vendor-reported** (Pyrefly blog: numpy 4.8 s vs Pyright 70.9 s; PkgPulse aggregate: ty faster on incremental, conformance ~58% Pyrefly vs ~15% ty). Pick by measuring on your code.

### C3. Compact, machine-readable check output
- **What:** Checks emit short summaries (failures only, `--json` where possible); full logs saved to disk.
- **Detect:** Inspect the verify script and CI logs: are there quiet/`--json` modes? Do failing runs print hundreds of lines or ANSI noise?
- **Add:** `--json`/quiet flags in the wrapper; or an output compressor hook such as `squeez` (Rust crate, hooks for Claude Code/Codex/OpenCode/Gemini/Copilot/Pi; its 90.7% token reduction is self-reported).
- **Applies when:** all; most value M/L. P1.
- **Backed by:** G, O · **Confidence:** Med (practice High; tool young).

### C4. Error messages that tell the agent how to fix
- **What:** Custom lint/test failures include remediation instructions ("use X instead; see docs/…").
- **Detect:** Custom lint rules/scripts and their messages.
- **Add:** Rewrite messages of custom rules and harness scripts to include the fix and a doc link.
- **Applies when:** repo has custom rules. P2.
- **Backed by:** G, D, O · **Confidence:** High (OpenAI post; Böckeler/Fowler "Harness engineering", Apr 2026).

### C5. Progressive verification ladder
- **What:** Explicit order: format → changed-file lint/types → targeted unit tests → affected tests → contract/integration → security → full CI. AGENTS.md says which rung a task must clear.
- **Detect:** Whether the ladder exists and is documented; time per rung.
- **Add:** Map ladder onto C1 modes; record p50 timings.
- **Applies when:** all. P1.
- **Backed by:** C, D, O · **Confidence:** High.

### C6. Deterministic, model-free merge gate
- **What:** "Done" is decided by tests/lint/types/coverage, not by an LLM. AI review is advisory.
- **Detect:** Branch protection required checks; any LLM-judged required check.
- **Add:** Required status checks = C1 `--all`.
- **Applies when:** all. P0.
- **Backed by:** D, O · **Confidence:** High.

### C7. Affected/change-impact computation (merge-base)
- **What:** Compute affected projects across languages from the diff against the **merge base with main**, not the previous commit.
- **Detect:** Nx/moon/Bazel/Pants/Turborepo config or a custom graph script; CI uses it.
- **Add:** S: skip. M: Nx or moon, or a custom script reading Gradle/Cargo/pnpm/uv metadata. L: graph tool is mandatory; track false negatives as bugs.
- **Applies when:** M/L. P1 (P0 for L; N/A for S).
- **Backed by:** C, G, O · **Confidence:** High for tools. Nx 24 (2026-10-29) "9.2× faster CI, 52% less compute" is a **vendor benchmark** on its 511-project test repo.

### C8. Build caches, read-only for untrusted jobs
- **What:** Shared caches (Gradle build/config cache, sccache or shared `CARGO_TARGET_DIR`, Nx/moon cache) so fresh worktrees aren't cold. PR/agent jobs get **read-only** remote cache credentials; only main-branch CI writes.
- **Detect:** Cache config; CI secrets scoping for cache write.
- **Add:** Enable caches; split cache credentials by trust level.
- **Applies when:** M/L or parallel worktrees; read-only rule whenever a shared remote cache exists. P1.
- **Backed by:** G, O · **Confidence:** High (Nx docs on cache poisoning / CREEP; standard practice).

### C9. Cross-language contracts with breaking-change gates
- **What:** OpenAPI / Protobuf (Buf) / JSON Schema / TypeSpec at service and package boundaries; generated clients; CI fails on breaking changes (`buf breaking`, `oasdiff`).
- **Detect:** `contracts/`, `*.proto`, `openapi.*`, `buf.yaml`; hand-duplicated DTOs across languages.
- **Add:** Start with the busiest boundary; add breaking check; expand affected graph to consumers.
- **Applies when:** ≥2 languages talk over an API/IPC. P1 (P2 for S).
- **Backed by:** G, O · **Confidence:** High (established tools).

### C10. Architectural boundary sensors
- **What:** Machine-enforced layering and module boundaries.
  - Python: `tach` (Rust-based; `tach.toml`, `tach check`) or import-linter.
  - TS: dependency-cruiser and/or ESLint boundary rules.
  - Kotlin/JVM: ArchUnit tests; Gradle module visibility.
  - Rust: crate boundaries / `cargo deny` for deps.
- **Detect:** These configs; documented layer order.
- **Add:** Encode the main layering rule (e.g. Types → Config → Repo → Service → Runtime → UI) for the core packages. Don't over-tighten (file-length caps can backfire).
- **Applies when:** M/L or Team/Org. P2 (P1 for L).
- **Backed by:** G, D · **Confidence:** High (tools exist; layering example confirmed in OpenAI post).

### C11. Security sensors
- **What:** Secret scanning (gitleaks or GitHub secret scanning) and SAST (Semgrep/CodeQL) in pre-commit and CI; dependency audit (`cargo audit`/`cargo deny`, `pnpm audit`, `pip-audit`, OWASP/Gradle).
- **Detect:** Configs and CI jobs.
- **Add:** gitleaks pre-commit at minimum; SAST in CI.
- **Applies when:** all (secrets scan); SAST for Team/Org. P0 secrets, P1 SAST.
- **Backed by:** G, O · **Confidence:** High.

### C12. Trustworthy agent-written tests
- **What:** Property-based tests for pure logic, fuzzing for parsers/protocols, periodic/incremental mutation testing on core modules; optionally approved-fixture (snapshot) tests that humans can scan.
- **Detect:** proptest/Hypothesis/fast-check/Kotest property, cargo-fuzz, PIT/mutmut/Stryker/cargo-mutants.
- **Add:** One property-test lib per language; nightly mutation run on core packages.
- **Applies when:** M/L with core business logic. P2.
- **Backed by:** G, O · **Confidence:** High (established tools).

### C13. Independent evaluator in a fresh context
- **What:** Non-trivial diffs get a review by a separate agent/session that sees spec + diff + evidence, not the implementer's narrative. Optionally a different model.
- **Detect:** Review skill/subagent; CI agent review; documented step.
- **Add:** A `review-change` skill/subagent; required step before human review for medium+ risk changes.
- **Applies when:** all except trivial fixes. P1.
- **Backed by:** C, G, O · **Confidence:** High (Anthropic "Harness design for long-running apps", 2026-03-24: agents "reliably skew positive when grading their own work").

### C14. Edit-time diagnostics and read-before-edit guards
- **What:** Run formatter/linter/type diagnostics on each edited file right after the edit; block edits to files the agent hasn't read.
- **Detect:** `PostToolUse` hook on `Edit|Write`; LSP integration; host extension.
- **Add:** Claude Code: `PostToolUse` hook calling the per-language formatter/linter on `tool_input.file_path`. Pi host: `pi-lens` (verified: diagnostics on every edit, importer cascade, read-before-edit guard, opt-in commit guard; MCP mode experimental).
- **Applies when:** all. P1.
- **Backed by:** D, G · **Confidence:** High for the hook pattern; Med for pi-lens outside Pi.

---

## D. Policy: permissions and hooks

### D1. Committed permission rules
- **What:** `.claude/settings.json` (and equivalent for other hosts) with `allow` for safe check/test commands, `ask` for network/pushes, `deny` for `.env*`, keys, force-push, prod tooling.
- **Detect:** File exists and is committed; `deny` covers secrets; `.claude/settings.local.json` is gitignored.
- **Add:** Baseline policy; personal overrides only in `settings.local.json`.
- **Applies when:** all. P0.
- **Backed by:** C, G, O · **Confidence:** High (Claude Code docs; PreToolUse hook decisions never override deny/ask rules).

### D2. Lifecycle hooks as enforced policy
- **What:** `PreToolUse` guard (block `rm -rf`, force-push to main, pipe-to-shell, writes to `.env`/`.git/`); `PostToolUse` format/lint (C14); `Stop` (or `TaskCompleted`) gate running `verify --changed`. Scripts in `.claude/hooks/`.
- **Detect:** `hooks` section in `.claude/settings.json`; Stop hook checks `stop_hook_active` to avoid loops.
- **Add:** The three hooks above. Exit code 2 blocks and returns stderr to the agent.
- **Applies when:** Claude Code host. P0.
- **Backed by:** C, G · **Confidence:** High (hooks reference lists 33 events incl. WorktreeCreate, CwdChanged, FileChanged, InstructionsLoaded, TaskCompleted). Whether a hook `deny` still holds under `--dangerously-skip-permissions` is not documented; test it before relying on it.

### D3. Org-level managed settings
- **What:** For company machines: `managed-settings.json` with `permissions.disableBypassPermissionsMode`, enforced sandbox (`sandbox.enabled`, `failIfUnavailable`), `allowedHttpHookUrls`, `httpHookAllowedEnvVars`.
- **Detect:** Org IT/MDM config (usually outside the repo; ask).
- **Add:** Recommend to org admins.
- **Applies when:** Org. P1 for Org, N/A for Solo.
- **Backed by:** G · **Confidence:** High (settings reference).

### D4. Capability tiers and credential separation
- **What:** Tiers: read → run checks → edit worktree → network → PR/comment → deploy/secrets. Implementation agents hold **no** production credentials; PR agents hold only scoped tokens.
- **Detect:** Which tokens are in agent environments/CI agent jobs.
- **Add:** Document tiers; scope tokens; remove prod creds from agent envs.
- **Applies when:** Team/Org, or any unattended runs. P1.
- **Backed by:** O, G · **Confidence:** High (OWASP agentic guidance; GitHub Agentic Workflows model).

### D5. Untrusted-input handling (prompt injection)
- **What:** Treat issue/PR text, dependency docs, web and MCP content as data. Use a read-only "quarantined" step to summarize untrusted content before a write-capable agent acts. Avoid tool combos that can read private data **and** publish externally.
- **Detect:** Automations that feed external text straight into a write-capable agent.
- **Add:** Policy line in AGENTS.md; split read-only triage from write jobs.
- **Applies when:** any automation triggered by external input. P1.
- **Backed by:** O · **Confidence:** High (OWASP prompt-injection guidance).

---

## E. Isolation and environment

### E1. One task, one worktree (sparse in big repos)
- **What:** Each agent task runs in its own git worktree/branch (T3 Code "New worktree", `claude --worktree`). In big monorepos, set `worktree.sparsePaths` so only relevant directories are checked out.
- **Detect:** Team practice / T3 Code config; `worktree.sparsePaths` in `.claude/settings.json`.
- **Add:** Default to worktrees for parallel work; sparse paths per area for L.
- **Applies when:** parallel agents or L repos. P1 (P0 if running parallel agents).
- **Backed by:** C, G, D, O · **Confidence:** High (Claude Code settings; T3 Code).

### E2. Worktree bootstrap
- **What:** New worktrees get caches, env, unique ports and ephemeral DB automatically (script or `WorktreeCreate` hook).
- **Detect:** Setup script; hook.
- **Add:** `scripts/worktree-init` called by T3/Claude. Caution: a `WorktreeCreate` hook **replaces** default git worktree creation and any non-zero exit fails it; prefer a post-create script unless you need full control.
- **Applies when:** E1 applies and builds/services need setup. P2.
- **Backed by:** G, O · **Confidence:** High.

### E3. Sandbox the agent
- **What:** Minimum: Claude Code sandbox (`/sandbox`; Seatbelt on macOS, bubblewrap+socat on Linux/WSL2) with `sandbox.failIfUnavailable: true` and `allowUnsandboxedCommands: false`, network allowlist. The built-in sandbox covers **shell commands only**; file tools, MCP servers and hooks run outside it. For unattended runs use a full-process boundary: `@anthropic-ai/sandbox-runtime` (beta), dev container with egress firewall, Docker Sandboxes (microVM) or a VM/cloud sandbox.
- **Detect:** `sandbox` block in settings; devcontainer; how unattended runs are launched.
- **Add:** Interactive: strict sandbox. Unattended: container/VM; never `--dangerously-skip-permissions` on a host with real credentials. Native Windows has no sandbox; use WSL2.
- **Applies when:** all (interactive P0); unattended runs P0 for that mode.
- **Backed by:** C, G, D, O · **Confidence:** High (Claude Code sandboxing and sandbox-environments docs).

### E4. Reproducible, CI-identical environment
- **What:** Pinned toolchains (JDK, Node, pnpm, Rust, Python, uv, linters) via dev container (+lockfile), Nix flake, or mise/asdf; same environment in CI.
- **Detect:** `.devcontainer/`, `flake.nix`, `mise.toml`/`.tool-versions`, `rust-toolchain.toml`, `.nvmrc`; CI uses them.
- **Add:** Pick one primitive; don't maintain two dependency truths.
- **Applies when:** Team/Org, or any unattended runs. P0 for Team/Org, P1 Solo.
- **Backed by:** O, G · **Confidence:** High.

### E5. Bootable app per worktree + runtime visibility
- **What:** One command boots the app on isolated ports; agents can drive it (Playwright MCP / Chrome DevTools) and, for services, query logs/metrics from an ephemeral per-worktree stack.
- **Detect:** `init.sh`/`dev` script; Playwright MCP configured; local observability compose file.
- **Add:** Start with boot script + Playwright for UI/API repos; add ephemeral LogQL/PromQL stack only for multi-service M/L.
- **Applies when:** apps with UI or services. P2 (observability stack P3).
- **Backed by:** G, D, O · **Confidence:** High (OpenAI post; Anthropic effective-harnesses post).

### E6. Path for non-Linux builds
- **What:** Windows, macOS, iOS/watchOS builds can't run in a Linux sandbox. Give agents a command that triggers those builds/tests on CI or a remote runner and returns compact results.
- **Detect:** Non-Linux targets in repo; whether agents can verify them.
- **Add:** `./h ci run <target>` + `./h ci logs --failed` (via `gh` or CI API).
- **Applies when:** repo has native desktop/mobile/watch targets. P1.
- **Backed by:** C · **Confidence:** Med (single report; logically sound).

### E7. Secrets outside the sandbox
- **What:** Real API/git credentials held by a proxy or broker outside the agent sandbox; egress allowlist.
- **Detect:** Secrets mounted into agent containers (`-e`, mounted `~/.config`).
- **Add:** Credential proxy or scoped short-lived tokens.
- **Applies when:** unattended/cloud runs, Org. P2 (P1 for Org).
- **Backed by:** G, O · **Confidence:** Med (pattern confirmed in GitHub Agentic Workflows and Anthropic Managed Agents writing; specific vendor products not checked).

---

## F. Code intelligence and tools

### F1. Layered code retrieval
- **What:** `rg` → `ast-grep` (structural) → symbol-level navigation (LSP via an MCP server such as Serena, or SCIP indexes) for M/L polyglot repos.
- **Detect:** `ast-grep` config/rules; MCP servers configured (`.mcp.json`); LSP plugins.
- **Add:** S: rg + ast-grep is enough. M/L: add Serena or SCIP; document "search policy" in AGENTS.md.
- **Applies when:** M/L. P2 (P1 for L).
- **Backed by:** G, D, O · **Confidence:** High for Serena (v2; 40+ languages; symbol find/references/replace/rename; file and shell tools typically disabled under Claude Code). License: GPL-3.0-or-later (SolidLSP part MIT); check it fits the repo's policy.

### F2. Small, curated MCP/tool surface
- **What:** Few, typed, bounded tools; a committed registry (`.mcp.json` + notes on owner, version, permissions, network); prefer repo-specific tools over generic shells; lazy-load via tool search/skills.
- **Detect:** `.mcp.json` size; unknown community servers; duplicates.
- **Add:** Prune; document each server; mark read-only tools.
- **Applies when:** any MCP use. P1.
- **Backed by:** G, O · **Confidence:** High (MCP 2026-07-28 spec adds cacheable list results, stronger auth, formal extensions).

### F3. Context budget and compaction policy
- **What:** Deliberate context management: bounded tool output (C3), compaction thresholds, phase resets between planning and execution where the model needs it.
- **Detect:** Host compaction settings; long sessions hitting limits.
- **Add:** Guidance in AGENTS.md; handoff files (G1). Re-check after model upgrades (Anthropic dropped forced resets when Opus 4.5 removed "context anxiety").
- **Applies when:** long tasks. P2.
- **Backed by:** D, G, O · **Confidence:** Med. CliffCompaction **exists** (CMU/Bosch arXiv paper; "up to 50%" cost cut on Terminal-Bench) but is research plus a Pi package, not a drop-in for most hosts.

---

## G. State and memory

### G1. Durable progress and handoff artifacts
- **What:** Task state on disk, not in chat: `tasks.md` checkboxes, a progress/handoff file (JSON with change, task, head commit, verified, remaining, risks), decisions log, frequent clean commits as checkpoints.
- **Detect:** Such files in active changes; commit granularity of agent branches.
- **Add:** Handoff template in `openspec/changes/<id>/`; instruction to update it before ending a session.
- **Applies when:** multi-session tasks. P1.
- **Backed by:** O, G, D · **Confidence:** High (Anthropic "Effective harnesses for long-running agents", 2025-11-26: progress file, feature list JSON, init.sh, one feature at a time, git checkpoints).

### G2. Persistent project memory system
- **What:** Searchable store of decisions and dead-ends across sessions with health checks.
- **Detect:** Memory tooling in use.
- **Add:** Only after G1; start with plain `docs/decisions/` files.
- **Applies when:** L, long-running projects. P3.
- **Backed by:** D · **Confidence:** Low (single report; specific architecture not sourced).

---

## H. Evaluation and observability

### H1. Repo-local agent eval suite
- **What:** 5–100 sanitized historical tasks (bug fixes, features, refactors across your languages) with deterministic graders; re-run on every model, host or harness change; track pass@1, time, cost, diff size. Run each sample more than once.
- **Detect:** `agent-evals/` or similar.
- **Add:** Start with 5–10 tasks from recent PRs.
- **Applies when:** M/L, Team/Org, or choosing between models/hosts. P2 (P1 for Org).
- **Backed by:** C, G, D, O · **Confidence:** High (OpenAI stopped reporting SWE-bench Verified on 2026-02-23 over flawed tests and contamination; LangChain moved from outside Top 30 to Top 5 on Terminal Bench 2.0, 52.8% → 66.5%, by changing only the harness).

### H2. Harness change log with expected effect
- **What:** Version harness config; for each change, write the expected effect and check it later against H1/H3.
- **Detect:** Changelog for `.claude/`, AGENTS.md, hooks.
- **Add:** `docs/harness-changelog.md`.
- **Applies when:** H1 exists. P3.
- **Backed by:** D · **Confidence:** Med (idea from the AHE paper, arXiv 2604.25850: 69.7% → 77.0% pass@1 on Terminal-Bench 2 over 10 harness iterations).

### H3. Agent telemetry
- **What:** Events for task start/end, tool calls, command durations, retries, permission denials, cost, outcome (OpenTelemetry or host analytics). No secrets or full prompts by default.
- **Detect:** Telemetry config; cost dashboards.
- **Add:** Host OTel export + a simple dashboard.
- **Applies when:** Team/Org with regular agent use. P2 (optional for Solo).
- **Backed by:** C, D, O · **Confidence:** Med (practice sound; GitHub Next "Central Agentic Ops" prototype not checked).

### H4. Scaffolding pruning after model upgrades
- **What:** After each model upgrade, remove instructions/hooks that compensated for old model weaknesses (use A5 audit + H1 evals).
- **Detect:** Instructions mentioning old model quirks or workarounds; no record of review after the last model change.
- **Add:** A post-upgrade review step in `docs/harness-changelog.md` or the team runbook.
- **Applies when:** all. P2.
- **Backed by:** G · **Confidence:** High (Anthropic dropped context resets and sprints as models improved).

---

## I. Automation and team flow

### I1. Dependency automation
- **What:** Renovate (one policy across npm, Gradle, Cargo, Python) or Dependabot with grouped updates; security updates immediately; auto-merge only for well-verified classes.
- **Detect:** `renovate.json` / `.github/dependabot.yml`.
- **Add:** Grouped weekly updates.
- **Applies when:** all. P1.
- **Backed by:** O · **Confidence:** High.

### I2. Guarded autonomous agent workflows
- **What:** Scheduled/event-driven agent jobs for low-ambiguity work (format drift, docs after schema change, CI failure triage, archiving OpenSpec changes) with read-only tokens, buffered "safe outputs", egress allowlist, and human merge. Example: GitHub Agentic Workflows (Markdown → Actions lock file; engines include Claude Code; read-only agent job; Squid egress allowlist).
- **Detect:** `.github/workflows/*agent*`, `.github/aw/` or similar.
- **Add:** Only after A–E foundations; start with one job.
- **Applies when:** M/L, Team/Org. P3 (P2 for Org).
- **Backed by:** O, G · **Confidence:** High.

### I3. CI retry cap for agent branches
- **What:** Unattended agent branches get at most ~2 CI fix rounds, then escalate to a human.
- **Detect:** Automation config.
- **Add:** Counter in the agent loop/workflow.
- **Applies when:** unattended CI-fixing agents. P2.
- **Backed by:** G · **Confidence:** High (Stripe Minions: "at most two rounds of CI").

### I4. Small slices: stacked PRs / merge queue
- **What:** Short-lived branches, stacked PRs for big features, merge queue once PR volume is high.
- **Detect:** Merge queue enabled; PR size distribution.
- **Add:** Enable merge queue; PR size guidance.
- **Applies when:** Team/Org with high PR volume. P2.
- **Backed by:** G · **Confidence:** Med (practice standard; OpenAI 3.5 PRs/engineer/day and Stripe ">1,000 PRs merged each week" are confirmed first-party figures, not benchmarks).

### I5. Multi-agent task DAG with ownership leases
- **What:** For big parallel work: tasks with dependencies and path leases; parallelize exploration and independent code, serialize contracts/migrations.
- **Detect:** Orchestration config with task dependencies or path ownership; frequent merge conflicts between agent branches.
- **Add:** Only after E1 and H1; a `tasks.json` DAG generated from `tasks.md` with expiring path leases.
- **Applies when:** L + Org running many parallel agents. P3.
- **Backed by:** O, D · **Confidence:** Med (Anthropic's parallel-Claudes compiler experiment shows both throughput and coordination cost).

### I6. Host-neutral harness
- **What:** Policy, specs, checks and skills live in the repo, not in T3 Code or one vendor's config. T3 Code is the orchestration UI; OpenSpec/SuperSpec are repo workflows, not T3 providers.
- **Detect:** Critical rules only in host-specific files or app settings.
- **Add:** Move essentials into AGENTS.md / scripts; host files point to them.
- **Applies when:** >1 agent host, or likely to switch. P1.
- **Backed by:** C, G, D, O · **Confidence:** High.

### I7. Route tasks to models by difficulty
- **What:** Frontier model for planning/hard debugging; cheaper/faster for mechanical edits; different model as reviewer (C13).
- **Detect:** Host config with per-task or per-subagent model settings.
- **Add:** Document a model per task type in AGENTS.md or host config; validate the choice with H1.
- **Applies when:** cost matters, multi-provider hosts. P3.
- **Backed by:** G · **Confidence:** Low for the cited numbers: Octomind's 25-PR benchmark is vendor-authored (its own agent wins). Decide with your own H1 evals.
