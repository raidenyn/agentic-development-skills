## ADDED Requirements

### Requirement: OpenCode URL catalog
`build-pages` SHALL write `opencode/index.json` as `{"skills":[{"name","version","files"}]}`. It SHALL include one entry for every skill, with `version` set to the release version and `files` listing every file under `skills/<name>/` (relative POSIX paths, sorted, no dotfiles, no `__pycache__`). It SHALL also copy those files to `opencode/<name>/<file>`, byte for byte. Symlinks SHALL make the build fail.

#### Scenario: Catalog content
- **WHEN** `build-pages --version 0.2.0 --out DIR` runs on a repo with skill `harness-audit`
- **THEN** `DIR/opencode/index.json` lists `harness-audit` with version `0.2.0` and `files` including `SKILL.md`, and every listed file exists under `DIR/opencode/harness-audit/`

#### Scenario: OpenCode update
- **WHEN** OpenCode is configured with `"skills": ["https://raidenyn.github.io/agentic-development-skills/opencode/"]`, and a new release changes `version`
- **THEN** at its next start or config reload, OpenCode replaces its cached copy of the skill with the new files

#### Scenario: Symlink in a skill
- **WHEN** a skill folder contains a symlink
- **THEN** `build-pages` exits non-zero

### Requirement: Claude Code URL marketplace pinned to the release tag
`build-pages` SHALL write `claude/marketplace.json` with the same `name`, `owner` and `description` as `.claude-plugin/marketplace.json`. In every plugin entry, `version` SHALL be the release version, and `source` SHALL be `{"source":"git-subdir","url":"https://github.com/<slug>.git","path":"skills/<name>","ref":"v<version>"}`. The committed `.claude-plugin/marketplace.json` SHALL keep relative sources and no `version`.

#### Scenario: Generated entry
- **WHEN** `build-pages --version 0.2.0` runs
- **THEN** the `harness-audit` entry has `version` `0.2.0`, and its source is `git-subdir` with an HTTPS URL, path `skills/harness-audit` and ref `v0.2.0`

#### Scenario: Claude update on release
- **WHEN** Claude Code has the URL marketplace with `autoUpdate: true`, and a new release changes `version`
- **THEN** Claude Code installs the plugin at the new tag on its next auto-update check, and the new version loads on reload or relaunch

#### Scenario: Merge without release
- **WHEN** commits are merged to `main` but no release is published
- **THEN** neither catalog changes, and installed users keep the released version

### Requirement: Catalog build consistency checks
`build-pages` SHALL exit non-zero, without writing a usable catalog, when:
- a skill folder has no marketplace entry;
- a marketplace entry has no skill folder;
- a skill has no `SKILL.md`;
- the output directory is not empty.

#### Scenario: Unlisted skill
- **WHEN** `skills/new-skill/` exists but isn't in `.claude-plugin/marketplace.json`
- **THEN** `build-pages` exits non-zero and names the skill

#### Scenario: Output directory not empty
- **WHEN** the `--out` directory already contains files
- **THEN** `build-pages` exits non-zero

### Requirement: Pages serves the newest published release
The Pages job SHALL deploy catalogs built from the highest-semver, published, non-draft, non-prerelease GitHub release whose tag matches `^v\d+\.\d+\.\d+$` and is an ancestor of `main`. It SHALL run after every successful release job, even when no new version was released. It SHALL NOT deploy anything built from `main` or from a tag that has no published release.

#### Scenario: New release
- **WHEN** a run publishes `v0.3.0`
- **THEN** Pages serves catalogs with version `0.3.0`

#### Scenario: Redeploy without a new release
- **WHEN** a new Release run finds no commits to release
- **THEN** the Pages job rebuilds and redeploys the latest published release

#### Scenario: Release order differs from version order
- **WHEN** `v0.10.0` and `v0.9.0` are both published and `v0.9.0` was created later
- **THEN** Pages deploys `v0.10.0`

#### Scenario: No release yet
- **WHEN** no published release exists and the only tag is `v0.0.0`
- **THEN** the Pages job ends without deploying and without failing

### Requirement: Orphan tag detection
Before choosing a release, the Pages job SHALL check whether the highest-semver stable tag reachable from `main`, ignoring `v0.0.0`, has a published GitHub release. If it doesn't, the job SHALL fail with an error that names the tag and points to the recovery steps.

#### Scenario: Release step failed after the tag was pushed
- **WHEN** tag `v0.1.0` exists on `main` but has no published GitHub release
- **THEN** the Pages job fails, names `v0.1.0`, and deploys nothing

### Requirement: Documented install, auto-update and recovery
The README SHALL document:
- the OpenCode `skills` URL;
- the Claude Code URL marketplace, including that auto-update needs `autoUpdate: true` in `settings.json` or the `/plugin` toggle, because `marketplace add` doesn't set it;
- when each tool picks up a release;
- removing the old git marketplace of the same name before switching;
- recovery from a failed Pages deploy (start a new run) and from an orphan tag (delete the tag, then start a new run).

The private-repo note SHALL be removed.

#### Scenario: Following the README for Claude
- **WHEN** a user follows the README's recommended Claude install
- **THEN** their settings contain the URL marketplace with `autoUpdate: true` and the enabled plugin

#### Scenario: Private-repo note
- **WHEN** the README is read after this change
- **THEN** it doesn't say the repository is private or require git credentials to install
