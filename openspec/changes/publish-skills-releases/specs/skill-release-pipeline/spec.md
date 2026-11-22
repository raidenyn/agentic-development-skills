## ADDED Requirements

### Requirement: Manual release on main
The release workflow SHALL run only when triggered manually (`workflow_dispatch`) on the `main` branch. Release runs SHALL NOT run at the same time as each other or cancel each other.

#### Scenario: Run from main
- **WHEN** the owner starts the Release workflow on `main`
- **THEN** the release job runs semantic-release against `main`

#### Scenario: Run from another branch
- **WHEN** the Release workflow is started on any branch other than `main`
- **THEN** no job publishes anything, and no tag, release or Pages deploy is created

#### Scenario: Overlapping runs
- **WHEN** a second Release run starts while one is in progress
- **THEN** the second run waits for the first to finish and does not cancel it. A newer dispatch may replace a run that is still pending, which is GitHub's default; the run that goes ahead releases every unreleased commit on `main` as of the start of its release job, including ones merged while it waited. A merge after that checkout makes semantic-release skip the release with "behind the remote one" and exit successfully; start a new run in that case

### Requirement: Semantic version bump from Conventional Commits
The release SHALL compute the next version from the commits since the last release tag (`v*`, starting from the `v0.0.0` seed tag). A breaking change on any type (`!` or a `BREAKING CHANGE:` footer) SHALL give a major bump. `feat` SHALL give a minor bump. Every other commit, including headers that don't parse, SHALL give a patch bump. The highest bump SHALL win.

#### Scenario: First feature release
- **WHEN** the only tag is `v0.0.0` and a `feat:` commit is on `main`
- **THEN** the release version is `0.1.0` and the tag is `v0.1.0`

#### Scenario: Breaking change on a non-feat type
- **WHEN** the commits since the last release include `docs!: drop old install path`
- **THEN** the bump is major

#### Scenario: Breaking change in the body
- **WHEN** a commit body contains a `BREAKING CHANGE:` footer
- **THEN** the bump is major

#### Scenario: Only maintenance commits
- **WHEN** the commits since the last release are only `chore:`, `docs:` or `ci:` commits
- **THEN** the bump is patch

#### Scenario: Header that doesn't parse
- **WHEN** a commit header is `Update README`
- **THEN** it gives a patch bump and appears in no release-notes section

#### Scenario: Nothing to release
- **WHEN** there are no commits since the last release tag
- **THEN** the run succeeds, and no tag or GitHub release is created

### Requirement: Generated release notes
Each release SHALL publish a GitHub release whose notes group commits into sections: breaking changes first, then Features, Bug Fixes, Performance, Documentation and Other. Squash-merged PR numbers SHALL be linked.

#### Scenario: Grouped notes
- **WHEN** a release contains a `feat`, a `fix` and a `chore` commit
- **THEN** the GitHub release notes list them under Features, Bug Fixes and Other

#### Scenario: PR link
- **WHEN** a commit subject ends with `(#12)`
- **THEN** the notes link that entry to PR 12

### Requirement: Tag only after validation and catalog build
The release SHALL validate the skills and build the Pages catalogs successfully **before** the tag is pushed. A failure in either SHALL stop the release with no tag created.

#### Scenario: Invalid skill
- **WHEN** `scripts/skills.py validate` fails during a release run
- **THEN** the run fails and no tag is pushed

#### Scenario: Catalog build fails
- **WHEN** `build-pages` fails during the prepare step
- **THEN** the run fails and no tag is pushed

### Requirement: No commit-back and no other publish targets
The release MUST NOT push commits or change any branch, and MUST NOT publish to npm. Its remote writes SHALL be limited to the release tag, the GitHub release, and semantic-release's own git notes ref (`refs/notes/semantic-release*`).

#### Scenario: After a release
- **WHEN** a release completes
- **THEN** every branch on the remote, `main` included, points at the same commit as before the run, and the only new remote refs are the release tag and semantic-release's notes ref

#### Scenario: Default npm plugin
- **WHEN** semantic-release loads its plugins
- **THEN** only the commit analyzer, the notes generator, exec and github run, as listed explicitly in `.releaserc.json`

### Requirement: Pinned, current toolchain
The release and validate workflows SHALL use exact pins: Node 26.13.1 (from `.nvmrc`), semantic-release 26.0.1 with a committed lockfile, Python 3.15, PyYAML 6.0.4 and Claude Code CLI 2.1.330. Every GitHub Action SHALL be pinned to a full commit SHA of its newest release.

#### Scenario: Reproducible install
- **WHEN** CI runs `npm ci` and `pip install -r requirements-dev.txt`
- **THEN** the exact versions from the lockfile and requirements are installed

#### Scenario: Action pinning
- **WHEN** any workflow file is inspected
- **THEN** every `uses:` refers to a 40-character commit SHA, with the version in a comment

### Requirement: Tested bump rules
The repository SHALL include an automated test that runs fixture commits through the installed analyzer and notes generator, using the committed `.releaserc.json`, and checks the bump and the notes sections.

#### Scenario: Rule regression
- **WHEN** a dependency update changes how the analyzer treats `docs!:`
- **THEN** `npm test` fails in `validate.yml`
