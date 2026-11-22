## Why

The repo's skills are public, but nobody receives updates. Claude Code installs track unreleased `main`, OpenCode installs are hand copies that never change, there are no versions or release notes, and the README still says the repo is private. A manual, tag-based release that publishes catalogs to GitHub Pages lets both Claude Code and OpenCode update on their own, and only when a release is actually published.

## What Changes

- **Releasing**
  - From: no tags, releases or notes. Installs follow `main` or never update.
  - To: a manual "Run workflow" on `main` runs semantic-release. It reads the Conventional Commits since the last release, picks the semver bump, generates grouped notes, tags the commit and publishes a GitHub release. Nothing is committed back.
  - Reason: users should receive only versioned, released work.
  - Impact: non-breaking. A new `release.yml` workflow and new Node tooling (`package.json`, lockfile, `.releaserc.json`, `.nvmrc`).
- **Distribution catalogs on GitHub Pages**
  - From: none.
  - To: each release deploys `opencode/index.json` plus the skill files (versioned), and `claude/marketplace.json`, with `version` and `git-subdir` sources pinned to the tag over HTTPS. Pages always serves the newest *published* release, fails loudly on an orphan tag, and is rebuilt when a new run starts.
  - Impact: new install URLs. Existing Claude installs of the git marketplace must be removed and re-added from the URL.
- **Commit convention enforcement**
  - From: free-form commit messages.
  - To: a `check-commit-msg` checker in `scripts/skills.py`, used by a local `commit-msg` hook (turned on with `install-hooks`) and by a `pull_request_target` PR-title check that runs the checker from `main`.
  - Impact: contributors and agents must write `type(scope)!: subject` messages.
- **Tooling versions**: `validate.yml` moves to the newest actions (pinned to SHAs), Python 3.15, Node 26.13.1 and pinned PyYAML. It also runs the new unit and release-rule tests.
- **Docs**: the README drops the private-repo note and documents installing with auto-update for both tools, releasing, and recovery. AGENTS.md gets the hook step, the commit convention and the corrected versioning rule.
- **Dev-server rollout** after the first release, with the owner's go-ahead: Claude (`extraKnownMarketplaces` + `autoUpdate`) and OpenCode (`skills` URL), proven first in an isolated HOME.

## Capabilities

### New Capabilities
- `skill-release-pipeline`: the manual release on `main`. It covers bump rules, release notes, tagging, the GitHub release, the pre-tag validation and catalog build check, and the pinned toolchain.
- `skill-distribution-catalogs`: the catalogs on GitHub Pages for OpenCode and Claude Code. It covers the catalog formats, versioning, how a release is selected, orphan-tag handling, recovery, and the install and auto-update instructions.
- `commit-message-convention`: the Conventional Commits checker, its file and title modes, the local `commit-msg` hook and its installer, and the PR-title CI check.

### Modified Capabilities
<!-- None: openspec/specs/ has no existing specs. -->

## Impact

- **New files:**
  - `.github/workflows/release.yml` and `.github/workflows/pr-title.yml`;
  - `.githooks/commit-msg`;
  - `package.json`, `package-lock.json`, `.releaserc.json`, `.nvmrc`, `requirements-dev.txt`;
  - `scripts/test_skills.py` and `scripts/test-release-rules.mjs`.
- **Changed files:**
  - `scripts/skills.py`: new `build-pages`, `check-commit-msg` and `install-hooks` commands, and a lazy PyYAML import;
  - `.github/workflows/validate.yml`, `.gitignore`, `README.md`, `AGENTS.md`.
- **External:**
  - the GitHub Pages site at `https://raidenyn.github.io/agentic-development-skills/`;
  - GitHub releases and tags;
  - after rollout, `~/.claude/settings.json` and `~/.config/opencode/opencode.jsonc` on the dev server.
- **Dependencies:**
  - Node 26.13.1, semantic-release 26.0.1 (with its beta analyzer and notes plugins), `@semantic-release/exec` 7.1.0, `@semantic-release/github` 12.0.11, `conventional-changelog-conventionalcommits` 10.4.1;
  - Python 3.15, PyYAML 6.0.4, Claude Code CLI 2.1.330.
