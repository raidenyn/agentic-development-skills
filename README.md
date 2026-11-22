# Agentic development skills

[Agent Skills](https://agentskills.io) for agentic software development. Every skill is a plain `skills/<name>/SKILL.md` folder, so it works with any agent that reads the open Agent Skills format. The repo is also a [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugins/create-marketplace), where each skill installs as its own plugin.

## Skills

| Skill | What it does |
| --- | --- |
| [`harness-audit`](skills/harness-audit/SKILL.md) | Read-only audit of a repo's agentic-coding harness (AGENTS.md, specs, verify command, hooks, permissions, sandbox, evals). Walks a 57-item checklist and returns a prioritized TODO table in phases. |

## Install

### Claude Code (plugin marketplace)

```text
/plugin marketplace add raidenyn/agentic-development-skills
/plugin install harness-audit@agentic-development-skills
```

From a shell: `claude plugin marketplace add raidenyn/agentic-development-skills` and `claude plugin install harness-audit@agentic-development-skills`. Add `--scope project` to record it in the project's `.claude/settings.json` for the whole team. Pull new versions with `/plugin marketplace update agentic-development-skills`. Pin a branch or tag with `raidenyn/agentic-development-skills#<ref>`.

While this repository is private, Claude Code clones it with your machine's git credentials. Run `gh auth login` and then `gh auth setup-git` once.

### Any agent (Codex, OpenCode, Cursor, Claude Code, ...)

With the [`skills`](https://github.com/vercel-labs/skills) CLI:

```bash
npx skills add raidenyn/agentic-development-skills --skill harness-audit
npx skills add raidenyn/agentic-development-skills --skill harness-audit -a codex -g   # one agent, global
```

### Manually

Copy `skills/<name>/` into the folder your agent reads:

| Agent | Project | User |
| --- | --- | --- |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Codex | `.agents/skills/` | `~/.agents/skills/` |
| OpenCode | `.agents/skills/` | `~/.config/opencode/skills/` |

For claude.ai, zip the skill folder and upload it under Settings, Capabilities, Skills.

## Repository layout

```text
.claude-plugin/marketplace.json   # Claude Code marketplace: one plugin entry per skill
skills/<name>/SKILL.md            # one folder per skill (name == folder name)
skills/<name>/references/         # optional: long reference docs, loaded on demand
skills/<name>/scripts/            # optional: helper scripts the skill runs
template/SKILL.md                 # starting point for new skills
scripts/skills.py                 # `new` scaffolds a skill, `validate` checks everything
.github/workflows/validate.yml    # CI: runs both validators on every push and PR
```

## Adding a skill

```bash
python3 scripts/skills.py new my-skill "Use when ... (what triggers it, what it produces)."
# edit skills/my-skill/SKILL.md, add a row to the Skills table above
python3 scripts/skills.py validate
claude plugin validate .
```

`new` creates the folder from the template and adds the marketplace entry. See [AGENTS.md](AGENTS.md) for the conventions that CI enforces.

## Publishing

Merging to `main` publishes. Plugin entries carry no `version`, so Claude Code tracks the latest commit and users get changes with `/plugin marketplace update`. If you later want explicit releases, tag them and add a `version` to the entry you are releasing.

## License

[AGPL-3.0](LICENSE)
