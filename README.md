# Agentic development skills

[Agent Skills](https://agentskills.io) for agentic software development. Every skill is a plain `skills/<name>/SKILL.md` folder, so it works with any agent that reads the open Agent Skills format. The repo is also a [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugins/create-marketplace), where each skill installs as its own plugin.

Each release publishes versioned catalogs to [GitHub Pages](https://raidenyn.github.io/agentic-development-skills/): a URL-based Claude Code marketplace and an OpenCode skill catalog. Install from there and both tools pick up new releases on their own.

## Skills

| Skill | What it does |
| --- | --- |
| [`harness-audit`](skills/harness-audit/SKILL.md) | Read-only audit of a repo's agentic-coding harness (AGENTS.md, specs, verify command, hooks, permissions, sandbox, evals). Walks a 57-item checklist and returns a prioritized TODO table in phases. |

## Install

### Claude Code (updates automatically)

Add this to `~/.claude/settings.json`, merging it into what is already there (for the whole team, use `.claude/settings.json` in the project):

```json
{
  "extraKnownMarketplaces": {
    "agentic-development-skills": {
      "source": {
        "source": "url",
        "url": "https://raidenyn.github.io/agentic-development-skills/claude/marketplace.json"
      },
      "autoUpdate": true
    }
  },
  "enabledPlugins": {
    "harness-audit@agentic-development-skills": true
  }
}
```

`autoUpdate` makes Claude Code check the marketplace for a new release on its own. The check runs after the first message of a session, and the new version loads on `/reload-plugins` or the next launch.

From a shell, without the file:

```bash
claude plugin marketplace add https://raidenyn.github.io/agentic-development-skills/claude/marketplace.json
claude plugin install harness-audit@agentic-development-skills
```

**The CLI does not turn on auto-update.** `marketplace add` writes the entry without `autoUpdate` and has no flag for it, so turn it on in `/plugin` under Marketplaces, or add `"autoUpdate": true` to the entry in `settings.json`.

**Switching from the old install.** Earlier instructions added `agentic-development-skills` as a git marketplace from GitHub, which tracks unreleased `main` and has the same name. Remove it first:

```bash
claude plugin marketplace remove agentic-development-skills
```

### OpenCode (updates automatically)

Add this to `opencode.jsonc`:

```json
{
  "skills": ["https://raidenyn.github.io/agentic-development-skills/opencode/"]
}
```

Every skill in the catalog loads, and a new release is picked up at the next start or config reload.

### Any agent (Codex, OpenCode, Cursor, Claude Code, ...) (no auto-update)

With the [`skills`](https://github.com/vercel-labs/skills) CLI:

```bash
npx skills add raidenyn/agentic-development-skills --skill harness-audit
npx skills add raidenyn/agentic-development-skills --skill harness-audit -a codex -g   # one agent, global
```

This copies the skill from `main`; it does not follow releases and never updates itself. Run it again to pick up changes.

### Manually (no auto-update)

Copy `skills/<name>/` into the folder your agent reads:

| Agent | Project | User |
| --- | --- | --- |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Codex | `.agents/skills/` | `~/.agents/skills/` |
| OpenCode | `.agents/skills/` | `~/.config/opencode/skills/` |

Copies do not update themselves. For claude.ai, zip the skill folder and upload it under Settings, Capabilities, Skills.

## Repository layout

```text
.claude-plugin/marketplace.json    # Claude Code marketplace: one plugin entry per skill
skills/<name>/SKILL.md             # one folder per skill (name == folder name)
skills/<name>/references/          # optional: long reference docs, loaded on demand
skills/<name>/scripts/             # optional: helper scripts the skill runs
template/SKILL.md                  # starting point for new skills
scripts/skills.py                  # `new` scaffolds; `validate`, `build-pages`, `check-commit-msg`, `install-hooks`
scripts/pages_release.py           # picks the published release the Pages job deploys
scripts/test_pages_release.py      # tests for pages_release.py
scripts/test_skills.py             # Python tests for skills.py and this repo's docs
scripts/test-release-rules.mjs     # Node tests: bump rules and release notes
scripts/test-release-lifecycle.mjs # Node tests: package.json and workflow wiring
.githooks/commit-msg               # local commit-msg hook (`install-hooks` enables it)
.releaserc.json                    # semantic-release: bump rules, notes sections, catalog check
.nvmrc                             # Node version for the release toolchain
package.json                       # pinned semantic-release toolchain; `npm test`
requirements-dev.txt               # pinned PyYAML, needed by `validate` and `build-pages`
.github/workflows/validate.yml     # CI: validators, Python and Node tests on every push and PR
.github/workflows/pr-title.yml     # CI: PR titles must follow Conventional Commits
.github/workflows/release.yml      # manual release: tag, GitHub release, Pages deploy
_release-check/                    # generated by the release's catalog check; ignored
```

## Adding a skill

```bash
python3 scripts/skills.py new my-skill "Use when ... (what triggers it, what it produces)."
# edit skills/my-skill/SKILL.md, add a row to the Skills table above
python3 scripts/skills.py validate
claude plugin validate .
```

`new` creates the folder from the template and adds the marketplace entry. See [AGENTS.md](AGENTS.md) for the conventions that CI enforces.

## Releasing

Releases are made by hand from `main`. A release run works out the version from the commits since the last release, tags it, publishes a GitHub release with generated notes, and deploys the versioned catalogs to GitHub Pages. Installed users see a new version only when that GitHub release is published; merges to `main` and stray tags change nothing for them.

### Commit and PR titles

Every commit and PR title follows [Conventional Commits](https://www.conventionalcommits.org/): `type(optional scope): summary`, at most 92 characters in a PR title.

| Change | Bump |
| --- | --- |
| a `BREAKING CHANGE:` line in the description, or `!` after the type | major |
| `feat` | minor |
| anything else | patch |

Allowed types: `feat`, `fix`, `perf`, `docs`, `chore`, `ci`, `build`, `refactor`, `test`, `style`, `revert`.

GitHub squashes with the PR title as the commit subject and the PR body as the commit body, so the title picks the bump, and a `BREAKING CHANGE:` line in the description makes it major. Keep GitHub's default squash message (`<PR title> (#<number>)`) rather than writing your own.

A commit whose header does not parse still gets a patch bump, but it appears in no notes section, so a release made only of such commits has empty notes.

A local hook rejects a bad commit header before the commit exists, and the "PR title" check does the same for PR titles in CI. Set the hook up once per clone:

```bash
python3 scripts/skills.py install-hooks
```

### Running a release

1. Merge your PRs to `main` and wait for the Validate workflow to pass.
2. In GitHub, go to Actions → Release → Run workflow, on `main`.
3. The release job works out the version and the notes, validates the skills, builds the catalog, then pushes the tag and creates the GitHub release.
4. The Pages job then checks out the newest published release, builds the catalogs for its version and deploys them.

The Release workflow runs one at a time. A newer dispatch replaces a pending one, and a dispatch never interrupts a run already in progress. The run that goes ahead releases every unreleased commit, including ones merged while it waited.

### Previewing locally

```bash
GITHUB_TOKEN=<token with push access> npx semantic-release --dry-run --no-ci
python3 scripts/skills.py build-pages --version 0.0.0-dev --out /tmp/site
```

The dry run prints the next version and the notes. It still needs a `GITHUB_TOKEN` with push access, because semantic-release checks that it can push the tag, and it skips the `prepare` step, so it does not test the catalog build; the `build-pages` command does that.

### Recovery

- **The Pages deploy failed.** Start a new release run (Actions → Release → Run workflow on `main`); do not re-run the old run's job, which can reuse an old artifact. No new commits means no new release, and the Pages job redeploys the latest published release.
- **The tag exists but the GitHub release does not.** The run failed between pushing the tag and creating the release, and the Pages job leaves the previous deployment in place, printing `See README → Releasing → Recovery`. Delete the orphan tag and start a new run:

  ```bash
  git push origin :refs/tags/vX.Y.Z
  ```

  semantic-release then makes the same version again, with properly generated notes. Never fill the gap with `gh release create --notes-from-tag`: semantic-release pushes lightweight tags, so `gh` would use the squash commit message as the notes.

### Settings for forks

- The repository is public.
- Settings → Pages → Source is **GitHub Actions**.
- Settings → General → Pull Requests allows **squash merging only**, with the PR title as the squash commit title and the PR body as the squash commit message.
- Branch protection requires the **PR title** check.
- The **`v0.0.0` seed tag** exists on `main`, so the first release has a starting point; the catalogs and the Pages job ignore it.

## License

[AGPL-3.0](LICENSE)
