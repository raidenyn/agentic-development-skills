# harness-source-build Specification

## Purpose

How the TypeScript source of the shipped agent-harness tools under `src/` becomes the plain, dependency-free `.mjs` files committed under each skill's `assets/`: the output mapping, shared files, what the emitted files may import, their generated header and layout, and the build check that reports drift.

## Requirements

### Requirement: Source location and output mapping
Shipped harness code SHALL be written as `.mts` files under `src/<tool>/`. `node scripts/build.mts` SHALL emit each `src/<tool>/<rel>.mts` to `skills/<skill>/assets/<tool>/<rel>.mjs`, where `<skill>` is the tool's `skill` value in `src/build.json`. A `.json` file under `src/<tool>/` SHALL be copied to the same relative path byte for byte.

#### Scenario: A module is emitted
- **WHEN** `src/hook-runtime/lib/runtime.mts` exists and `src/build.json` maps `hook-runtime` to `agent-harness-hook-runtime`
- **THEN** the build writes `skills/agent-harness-hook-runtime/assets/hook-runtime/lib/runtime.mjs`

#### Scenario: A data file is copied
- **WHEN** `src/hook-runtime/tool.json` exists
- **THEN** the build writes `skills/agent-harness-hook-runtime/assets/hook-runtime/tool.json` with identical bytes

#### Scenario: A tool is missing from the manifest
- **WHEN** a folder `src/new-tool/` exists and `src/build.json` has no entry for `new-tool`
- **THEN** the build exits non-zero and names the folder

### Requirement: Only modules and data are built
A file under `src/<tool>/` or listed as shared that is neither `.mts` nor `.json` (for example `.ts`, `.mjs` or a `.d.mts` declaration file) SHALL fail the build with its path, because it would ship without the type check and the specifier check.

#### Scenario: A file that cannot be built
- **WHEN** `src/hook-runtime/lib/extra.ts` exists
- **THEN** the build exits non-zero and names `src/hook-runtime/lib/extra.ts`

### Requirement: Shared files have one source
A file listed in a tool's `shared` array in `src/build.json` SHALL be read from `src/shared/<rel>` and emitted to `<rel>` (with `.mjs`) inside every tool that lists it. The build SHALL fail when a shared file and a tool's own file map to the same output path.

#### Scenario: One source, two outputs
- **WHEN** both tools list `lib/config.mts` as shared
- **THEN** both `assets/hook-runtime/lib/config.mjs` and `assets/verify-gate/lib/config.mjs` are written and are byte-identical

#### Scenario: Path collision
- **WHEN** `src/verify-gate/lib/config.mts` exists and `verify-gate` also lists `lib/config.mts` as shared
- **THEN** the build exits non-zero and names the colliding output path

### Requirement: Emitted files are plain JavaScript without dependencies
An emitted `.mjs` file SHALL contain no TypeScript syntax, SHALL import only Node built-ins (written with the `node:` prefix) and emitted files of the same tool, and SHALL run on Node 22.0.0. Relative specifiers that end in `.mts` in the source SHALL end in `.mjs` in the output. The build SHALL fail when a relative specifier in an emitted file does not name an emitted file.

#### Scenario: Import specifiers are rewritten
- **WHEN** a source file contains `import { readLock } from './install.mts';`
- **THEN** the emitted file contains `import { readLock } from './install.mjs';`

#### Scenario: A string that is not a specifier is left alone
- **WHEN** a source file contains the string literal `'run scripts/build.mts'` outside an import
- **THEN** the emitted file contains that literal unchanged

#### Scenario: A value import of a type-only file
- **WHEN** an emitted file would import `./handler.types.mjs`, which is not emitted
- **THEN** the build exits non-zero and names the importing file and the specifier

#### Scenario: An npm package is imported
- **WHEN** a source file under `src/` imports `typescript`
- **THEN** the build exits non-zero and names the file and the specifier

#### Scenario: One tool imports the other's file
- **WHEN** `src/verify-gate/handler.mts` imports `./lib/runtime.mts`, which exists only in `src/hook-runtime/lib/`
- **THEN** the build exits non-zero, because `lib/runtime.mjs` is not emitted into `verify-gate`

#### Scenario: Harness tests on the oldest supported Node
- **WHEN** `node --test "tests/agent-harness/*.test.mjs"` runs on Node 22.0.0 with no `pnpm install --frozen-lockfile`
- **THEN** every test passes against the emitted files

### Requirement: Type-only files are not emitted
A source file named `*.types.mts` SHALL NOT produce an output file.

#### Scenario: Contract types
- **WHEN** `src/shared/lib/handler.types.mts` exists
- **THEN** no `handler.types.mjs` exists under any `skills/*/assets/` folder

### Requirement: Emitted files keep the source's readability
An emitted file SHALL keep the comments and the blank lines between statements of its source, SHALL be formatted with the repository's Biome configuration, and SHALL start with one line stating that it is generated, naming its source path and telling the reader not to edit it.

#### Scenario: Header
- **WHEN** `src/verify-gate/lib/gate.mts` is built
- **THEN** the first line of `assets/verify-gate/lib/gate.mjs` is `// Generated from src/verify-gate/lib/gate.mts by scripts/build.mts. Do not edit.`

#### Scenario: Layout survives
- **WHEN** a source function has a comment and a blank line between two statements
- **THEN** the emitted function has the same comment and a blank line in the same place

### Requirement: Built output is committed and drift is detected
The emitted files SHALL be committed. `node scripts/build.mts --check` SHALL write nothing and SHALL exit non-zero when any output file differs from a fresh build, is missing, or exists under a tool's assets folder without being produced by the build. It SHALL list each such file with one of the words `differs`, `missing` or `stale`. Without `--check`, the build SHALL delete stale files under each tool's assets folder.

#### Scenario: Clean tree
- **WHEN** the build has just been run and nothing changed since
- **THEN** `node scripts/build.mts --check` exits 0

#### Scenario: A generated file was edited by hand
- **WHEN** a line is changed in `skills/agent-harness-verify-gate/assets/verify-gate/cli.mjs`
- **THEN** `--check` exits non-zero and prints that path with `differs`

#### Scenario: A source file was removed
- **WHEN** `src/verify-gate/lib/run.mts` is deleted and the build has not run
- **THEN** `--check` exits non-zero and prints `assets/verify-gate/lib/run.mjs` with `stale`

#### Scenario: Deterministic output
- **WHEN** the build runs twice on the same tree
- **THEN** the second run changes no file

### Requirement: Source uses only erasable TypeScript syntax
Source under `src/` and `scripts/` SHALL use only syntax that can be removed without generating code. The type check SHALL fail on enums, namespaces with values and constructor parameter properties.

#### Scenario: An enum is added
- **WHEN** a file under `src/` declares an `enum`
- **THEN** `pnpm run typecheck` exits non-zero
