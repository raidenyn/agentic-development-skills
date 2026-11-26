## MODIFIED Requirements

### Requirement: The verify gate runs the checks
`scripts/verify.mts` SHALL run `pnpm run check` as part of its full checks. On an edit trigger it SHALL run Biome on an edited `.mts` or `.mjs` file that is not generated, and SHALL run the build when the edited file is under `src/`. On an edit trigger it SHALL capture each check's output and print it only when that check fails, so a passing edit run prints nothing.

#### Scenario: Edit of a shipped source file
- **WHEN** the verify command runs with `VERIFY_TRIGGER=edit` and `VERIFY_FILE=src/verify-gate/lib/run.mts`
- **THEN** it runs Biome on that file and then `node scripts/build.mts`

#### Scenario: Edit of a generated file
- **WHEN** the verify command runs with `VERIFY_TRIGGER=edit` and `VERIFY_FILE` under `skills/agent-harness-verify-gate/assets/`
- **THEN** it runs `node scripts/build.mts --check`, which fails and names the file

#### Scenario: Passing edit prints nothing
- **WHEN** the verify command runs with `VERIFY_TRIGGER=edit` and every check for `VERIFY_FILE` passes after printing a summary
- **THEN** it exits 0 and prints nothing to stdout or stderr

#### Scenario: Failing edit check prints its output
- **WHEN** a check for `VERIFY_FILE` exits non-zero after printing a diagnostic
- **THEN** the verify command prints that check's output and the `verify: failed` line, and exits 1

#### Scenario: Turn end
- **WHEN** the verify command runs with `VERIFY_TRIGGER=turn-end`
- **THEN** the checks it runs include `pnpm run check`
