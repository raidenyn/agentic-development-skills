## ADDED Requirements

### Requirement: pnpm is the package manager
The repository SHALL declare its package manager as an exact pnpm version in the `packageManager` field of `package.json`, SHALL commit `pnpm-lock.yaml`, and SHALL NOT contain `package-lock.json`. Every dev dependency SHALL be pinned to an exact version.

#### Scenario: A fresh worktree
- **WHEN** `pnpm install --frozen-lockfile` runs in a new worktree
- **THEN** it exits 0 without changing `pnpm-lock.yaml`

#### Scenario: The lockfile is out of date
- **WHEN** a dependency is added to `package.json` without updating `pnpm-lock.yaml`
- **THEN** `pnpm install --frozen-lockfile` exits non-zero

#### Scenario: No npm lockfile
- **WHEN** the repository root is listed
- **THEN** `package-lock.json` is absent

### Requirement: Imported packages are direct dependencies
Every package that a script or test in this repository imports by name SHALL be listed in `package.json`.

#### Scenario: Release rule tests
- **WHEN** `pnpm test` runs after `pnpm install --frozen-lockfile` with pnpm's default `node_modules` layout
- **THEN** `scripts/test-release-rules` resolves `@semantic-release/commit-analyzer` and `@semantic-release/release-notes-generator` and passes

### Requirement: CI installs with pnpm
Workflow jobs that install Node dependencies SHALL set up pnpm with an action pinned by commit, at the version in `packageManager`, and SHALL install with `pnpm install --frozen-lockfile`. They SHALL run installed tools with `pnpm exec` or `pnpm run` and one-off packages with `pnpm dlx`. The Node 22.0.0 job SHALL install nothing.

#### Scenario: Validate job
- **WHEN** the `validate` job runs
- **THEN** it installs with `pnpm install --frozen-lockfile` and no step calls `npm` or `npx`

#### Scenario: Release job
- **WHEN** the `release` job runs
- **THEN** semantic-release is started with `pnpm exec semantic-release`

#### Scenario: Oldest supported Node
- **WHEN** the Node 22.0.0 job runs
- **THEN** it has no pnpm setup step and no install step

### Requirement: The verify gate uses pnpm
This repository's verify command SHALL start the Node checks through pnpm.

#### Scenario: Turn end
- **WHEN** the verify command runs its full checks
- **THEN** none of the commands it starts is `npm`
