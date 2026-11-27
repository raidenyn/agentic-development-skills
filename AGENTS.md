# AGENTS.md

This repo publishes Agent Skills. Each skill lives in `skills/<name>/` and is listed once in `.claude-plugin/marketplace.json`.

If `repo-search` exists, use it for where/why questions; fall back to grep.

## Conventions (enforced by `scripts/skills.py validate` in CI)

- Folder name, frontmatter `name` and marketplace plugin `name` are identical: lowercase `a-z`, `0-9` and single hyphens, at most 64 characters, not starting with `claude-` or `anthropic-`.
- Marketplace entry `source` is `./skills/<name>`. Every skill has exactly one entry, and every entry has a skill.
- `description` is required, at most 1024 characters, no `<` or `>`. Start it with "Use when" and name the triggers, because it decides when an agent loads the skill.
- Keep frontmatter to spec keys (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`). Claude Code-only keys work there but are rejected by claude.ai and the Skills API; the validator warns about them.
- Keep `SKILL.md` under about 500 lines. Move long material to `references/` and link it.
- Never add `version` to `.claude-plugin/marketplace.json`; release versions exist only in the generated Pages marketplace.

## Workflow

0. Run `python3 scripts/skills.py install-hooks` once per clone; commits and PR titles must follow Conventional Commits (`feat:`, `fix:`, `docs:` …).
1. `python3 scripts/skills.py new <name> "<description>"`
2. Write the skill. Add it to the Skills table in `README.md`.
3. `python3 scripts/skills.py validate`, `claude plugin validate .`, `python3 -m unittest discover -s scripts -p 'test_*.py'` and `pnpm run check` must all pass (`pnpm install --frozen-lockfile` and `pip install -r requirements-dev.txt` first; pnpm is the only package manager).

## Node code

- **Shipped tools** are strict TypeScript in `src/<tool>/` (files in `src/shared/` go into every tool that lists them in `src/build.json`). `pnpm run build` writes the committed `.mjs` under `skills/<skill>/assets/<tool>/`. Never edit `skills/*/assets/` or `.agents/harness/` by hand.
- After changing a tool: bump `version` in `src/<tool>/tool.json` once per pull request, then `pnpm run harness:update`, which rebuilds and refreshes this repo's installed copy and lock.
- Source uses erasable syntax only. Put type-only declarations in `*.types.mts` or inside a type; a comment above a type ships orphaned.
- **Repo scripts** are `.mts` in `scripts/`, run by Node 26 without a build. **Tests of shipped tools** stay `.mjs` in `tests/agent-harness/` and must not import `.mts`: CI also runs them on Node 22.0.0.
- Biome lints and formats; `noNonNullAssertion` is off because `!` keeps the typed build byte-identical, and `noExplicitAny` is off because `any` marks host and JSON boundaries on purpose (strict `tsc` still rejects implicit `any`). Use `any` only there.

Agent hooks run `node scripts/verify.mts` on edits, ticked tasks and turn end (`.agents/harness/`); run it by hand with `node .agents/harness/verify-gate/cli.mjs run`.

## Hook-delivered rules
<!-- hooked-rules:begin -->
- Conventional Commits for commits and PR titles — .agents/hooked-rules/repo-commit-types.md
- Harness tools: bump tool.json, never edit assets, run harness:update — .agents/hooked-rules/repo-harness-tools.md
<!-- hooked-rules:end -->
