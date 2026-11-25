## ADDED Requirements

### Requirement: Strict type check of TypeScript source
`pnpm run typecheck` SHALL type-check every `.mts` file under `src/` and `scripts/` in strict mode without emitting files, and SHALL type-check `tests/**/*.mjs` in non-strict mode. It SHALL exit non-zero on any type error. Node's own types SHALL come from `@types/node` pinned to major 22.

#### Scenario: A type error in shipped source
- **WHEN** a function in `src/hook-runtime/lib/runtime.mts` is called with a number where its parameter is typed `string`
- **THEN** `pnpm run typecheck` exits non-zero and names the file and line

#### Scenario: An untyped parameter
- **WHEN** a function under `src/` has a parameter with no type and no default
- **THEN** `pnpm run typecheck` exits non-zero

#### Scenario: Generated files are not checked
- **WHEN** `pnpm run typecheck` runs
- **THEN** no file under `skills/*/assets/` or `.agents/harness/` is part of the check

### Requirement: Lint and format with one tool
`pnpm run lint` SHALL run Biome's lint and format check over `src/`, `scripts/` and `tests/` and exit non-zero on any finding. `pnpm run format` SHALL apply the fixes. Neither SHALL read or write files under `skills/*/assets/`, `.agents/harness/` or `tests/**/fixtures/`.

#### Scenario: A badly formatted file
- **WHEN** a file under `src/` uses double quotes and four-space indentation
- **THEN** `pnpm run lint` exits non-zero, and after `pnpm run format` it exits 0

#### Scenario: Generated files are left alone
- **WHEN** `pnpm run format` runs
- **THEN** no file under `skills/*/assets/` or `.agents/harness/` changes

### Requirement: One command runs every Node check
`pnpm run check` SHALL run, in order, the build check, the type check, lint and the tests, and SHALL stop at the first failure. `pnpm test` SHALL NOT build.

#### Scenario: Stale build output
- **WHEN** a file under `src/` was edited and the build was not run
- **THEN** `pnpm run check` fails at the build check, before the tests

#### Scenario: Everything is clean
- **WHEN** the tree is freshly built and has no findings
- **THEN** `pnpm run check` exits 0

### Requirement: Repo scripts are TypeScript run without a build
Node scripts that run only in this repository SHALL be `.mts` files under `scripts/`, run directly with the Node version in `.nvmrc`. Every reference to them (package scripts, workflows, `.agents/harness.json`, documentation) SHALL use the `.mts` path.

#### Scenario: The board workflow
- **WHEN** the `Project ready` workflow runs
- **THEN** it runs `node scripts/project-ready.mts`

#### Scenario: Tests that run on Node 22.0.0 import no TypeScript
- **WHEN** the files under `tests/agent-harness/` are searched for `.mts`
- **THEN** nothing is found

#### Scenario: No stale references
- **WHEN** the repository is searched for `scripts/` paths ending in `.mjs` outside `openspec/` and `pnpm-lock.yaml`
- **THEN** nothing is found

### Requirement: The verify gate runs the checks
`scripts/verify.mts` SHALL run `pnpm run check` as part of its full checks. On an edit trigger it SHALL run Biome on an edited `.mts` or `.mjs` file that is not generated, and SHALL run the build when the edited file is under `src/`.

#### Scenario: Edit of a shipped source file
- **WHEN** the verify command runs with `VERIFY_TRIGGER=edit` and `VERIFY_FILE=src/verify-gate/lib/run.mts`
- **THEN** it runs Biome on that file and then `node scripts/build.mts`

#### Scenario: Edit of a generated file
- **WHEN** the verify command runs with `VERIFY_TRIGGER=edit` and `VERIFY_FILE` under `skills/agent-harness-verify-gate/assets/`
- **THEN** it runs `node scripts/build.mts --check`, which fails and names the file

#### Scenario: Turn end
- **WHEN** the verify command runs with `VERIFY_TRIGGER=turn-end`
- **THEN** the checks it runs include `pnpm run check`

### Requirement: CI runs the checks
The `Validate skills` workflow SHALL run the build check, the type check and lint after `pnpm install --frozen-lockfile` and before the tests. The Node 22.0.0 job SHALL keep running the harness tests without `pnpm install --frozen-lockfile`.

#### Scenario: A pull request with stale build output
- **WHEN** a pull request changes `src/` without the matching change under `skills/*/assets/`
- **THEN** the `validate` job fails at the build check step
