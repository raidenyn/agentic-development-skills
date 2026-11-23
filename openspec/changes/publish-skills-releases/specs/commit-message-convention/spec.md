## ADDED Requirements

### Requirement: Conventional Commits header rule
`scripts/skills.py check-commit-msg` SHALL accept a header only if it matches `^(feat|fix|perf|docs|chore|ci|build|refactor|test|style|revert)(\([a-z0-9-]+\))?!?: \S.*`. On rejection it SHALL exit non-zero with a short message that includes an example of a valid header. It SHALL run with the Python standard library only.

#### Scenario: Valid header
- **WHEN** the header is `feat(harness-audit): add sandbox checks`
- **THEN** the checker exits 0

#### Scenario: Invalid header
- **WHEN** the header is `Added sandbox checks`
- **THEN** the checker exits non-zero and prints an example such as `feat: add sandbox checks`

#### Scenario: Without PyYAML
- **WHEN** PyYAML is not installed
- **THEN** `check-commit-msg` and `install-hooks` still run

### Requirement: File mode for git hooks
In file mode (`check-commit-msg <path>`), the checker SHALL:
- ignore comment lines, using `core.commentChar` (default `#`, with `auto` treated as `#`);
- ignore everything from git's scissors line to the end;
- allow at most 100 characters in the header;
- pass git-generated headers (`Merge …`, `Revert "…"`) and autosquash prefixes (`fixup! `, `squash! `, `amend! `).

An empty message SHALL be left to git.

#### Scenario: Verbose commit
- **WHEN** the message file contains a valid header followed by a `git commit -v` scissors block with a diff
- **THEN** the checker exits 0

#### Scenario: Custom comment character
- **WHEN** `core.commentChar` is `;` and the file contains `;`-prefixed lines and a `;`-style scissors line after a valid header
- **THEN** the checker ignores those lines and exits 0

#### Scenario: Merge commit
- **WHEN** git writes `Merge branch 'feature'` for a local merge
- **THEN** the checker exits 0

#### Scenario: Fixup commit
- **WHEN** the header is `fixup! feat: add sandbox checks`
- **THEN** the checker exits 0

### Requirement: Strict title mode for PR titles
In title mode (`check-commit-msg --text "<title>"`), the checker SHALL apply the header rule with a 92-character limit and none of the pass-throughs.

#### Scenario: Merge-style PR title
- **WHEN** a PR title is `Merge branch 'feature'`
- **THEN** the checker exits non-zero

#### Scenario: Title too long
- **WHEN** a valid PR title is 93 characters long
- **THEN** the checker exits non-zero

### Requirement: Local commit-msg hook
The repository SHALL include an executable `.githooks/commit-msg` that runs the checker in file mode. `scripts/skills.py install-hooks` SHALL set `core.hooksPath` to `.githooks`, and running it again SHALL change nothing. It SHALL refuse to replace a different existing `core.hooksPath` unless `--force` is given. No package-manager lifecycle script SHALL change git config.

#### Scenario: Commit rejected locally
- **WHEN** hooks are installed and a user or agent runs `git commit -m "update stuff"`
- **THEN** the commit isn't created, and the checker's error is shown

#### Scenario: Worktree coverage
- **WHEN** hooks are installed in the main checkout and a commit is made in another worktree of the same repo
- **THEN** the hook runs in that worktree too

#### Scenario: Existing hooks path
- **WHEN** `core.hooksPath` is already set to `/somewhere/else`
- **THEN** `install-hooks` exits non-zero and reports the current value, and doesn't change it

#### Scenario: npm install
- **WHEN** `npm ci` runs
- **THEN** git config is not changed

### Requirement: PR-title CI check runs the checker from main
`.github/workflows/pr-title.yml` SHALL run on `pull_request_target` (opened, edited, synchronize, reopened) with read-only contents permission. It SHALL check out only the base branch, without persisted credentials, and pass the title to the checker in title mode through an environment variable. It MUST NOT check out or run code from the PR.

#### Scenario: Bad PR title
- **WHEN** a PR is opened with the title `Update stuff`
- **THEN** the check fails

#### Scenario: Re-titled PR
- **WHEN** the PR title is edited to `docs: update install steps`
- **THEN** the check re-runs and passes

#### Scenario: PR changes the checker
- **WHEN** a PR changes `scripts/skills.py` to accept any title
- **THEN** the check still runs the checker from `main`

#### Scenario: Shell metacharacters in a title
- **WHEN** a PR title contains `$(touch pwned)`
- **THEN** the title is passed only as data, and no command runs
