# AGENTS.md

This repo publishes Agent Skills. Each skill lives in `skills/<name>/` and is listed once in `.claude-plugin/marketplace.json`.

## Conventions (enforced by `scripts/skills.py validate` in CI)

- Folder name, frontmatter `name` and marketplace plugin `name` are identical: lowercase `a-z`, `0-9` and single hyphens, at most 64 characters, not starting with `claude-` or `anthropic-`.
- Marketplace entry `source` is `./skills/<name>`. Every skill has exactly one entry, and every entry has a skill.
- `description` is required, at most 1024 characters, no `<` or `>`. Start it with "Use when" and name the triggers, because it decides when an agent loads the skill.
- Keep frontmatter to spec keys (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`). Claude Code-only keys work there but are rejected by claude.ai and the Skills API; the validator warns about them.
- Keep `SKILL.md` under about 500 lines. Move long material to `references/` and link it.
- Do not add a `version` to marketplace entries unless you intend to release with tags.

## Workflow

1. `python3 scripts/skills.py new <name> "<description>"`
2. Write the skill. Add it to the Skills table in `README.md`.
3. `python3 scripts/skills.py validate` and `claude plugin validate .` must both pass.
