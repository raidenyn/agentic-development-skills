## 1. Python tooling groundwork

- [x] 1.1 Make the PyYAML import in `scripts/skills.py` lazy, so that commands needing only the stdlib run without it, and add `requirements-dev.txt` with `pyyaml==6.0.4`
- [x] 1.2 Create `scripts/test_skills.py` (stdlib `unittest`) with a temp-repo fixture helper, and cover the existing `validate` happy path

## 2. Commit-message convention

- [x] 2.1 Add `check-commit-msg` in title mode (`--text`): header regex, 92-character limit, no pass-throughs, error message with an example (TDD)
- [x] 2.2 Add file mode (`<path>`): comment lines using `core.commentChar` (`auto` treated as `#`), the scissors line with the configured character, 100-character limit, pass-throughs for Merge/Revert/fixup!/squash!/amend!, and empty messages left to git (TDD, against real git output)
- [x] 2.3 Add `.githooks/commit-msg` (executable) and `install-hooks`: sets `core.hooksPath`, harmless to run again, refuses a different existing path unless `--force` is given (TDD in a temp git repo, including a second worktree)
- [x] 2.4 Add `.github/workflows/pr-title.yml`: `pull_request_target`, base-branch checkout with `persist-credentials: false`, the title passed through an env var, `contents: read`, runner `python3`, SHA-pinned checkout

## 3. Catalog builder

- [x] 3.1 Add `build-pages --version --out`, writing `opencode/index.json` and the copied skill files (sorted POSIX paths, no dotfiles or `__pycache__`, symlinks refused) (TDD)
- [x] 3.2 Generate `claude/marketplace.json`: the same name, owner and description, plus `version` and a `git-subdir` HTTPS source with ref `v<version>`, with the slug taken from `GITHUB_REPOSITORY` (TDD)
- [x] 3.3 Generate `index.html` (skills table and install snippets, no hidden files)
- [x] 3.4 Add the consistency failures: unlisted skill, entry without a folder, missing `SKILL.md`, output directory not empty (TDD)
- [x] 3.5 Validate the generated Claude marketplace with `claude plugin validate` in a scratch copy (a test that's skipped when `claude`/`npx` isn't available)

## 4. semantic-release configuration

- [x] 4.1 Add `.nvmrc` (26.13.1) and `package.json` (private, `engines.node >=26.13`, exact devDependencies: semantic-release 26.0.1, @semantic-release/exec 7.1.0, @semantic-release/github 12.0.11, conventional-changelog-conventionalcommits 10.4.1, plus a `test` script). Generate `package-lock.json` with `npm install`, and add `node_modules/` to `.gitignore`
- [x] 4.2 Add `.releaserc.json`: `branches`, `tagFormat`, an explicit `plugins` array (analyzer, notes, exec, github), `releaseRules` (breaking→major, feat→minor, catch-all patch), notes `presetConfig.types`, exec `verifyReleaseCmd` and `prepareCmd`, github comment and label switches off
- [x] 4.3 Add `scripts/test-release-rules.mjs`, which feeds fixture commits through the installed analyzer and notes generator using `.releaserc.json`, and asserts the bump and notes cases from the spec (TDD: write the tests first and watch them fail against a valid config that uses the defaults)
- [x] 4.4 Add `scripts/test-release-lifecycle.mjs`: semantic-release against a scratch bare remote, without the github plugin. It covers the first tag `v0.1.0`, a run with nothing to release, no tag when verify or prepare fails, and that only the tag and the notes ref are added

## 5. Workflows

- [x] 5.1 Update `validate.yml` to the newest SHA-pinned actions, Python 3.15 with `requirements-dev.txt`, Node from `.nvmrc` with `npm ci`, and to run the Python unit tests and `npm test` next to the existing validators
- [x] 5.2 Add the `release` job in `release.yml`: `workflow_dispatch`, main-only guard, concurrency group, `contents: write`, checkout with fetch-depth 0, Python, Node, `claude plugin validate .`, `npx semantic-release`
- [x] 5.3 Add `scripts/pages_release.py` (stdlib), which picks the deploy tag: the orphan check first (ignoring `v0.0.0`), then the highest-semver published stable release that's an ancestor of `main`. Unit-test it with fake `gh` and `git` outputs (TDD)
- [x] 5.4 Add the `pages` job in `release.yml`: `needs: release`, Pages permissions, the `github-pages` environment, `GH_TOKEN`, checkout of main with full history, run `pages_release.py`, check out the tag, `build-pages`, upload and deploy

## 6. Documentation

- [x] 6.1 Rewrite the README Install section: remove the private note; Claude URL marketplace with the `settings.json` `autoUpdate` form and the note about the CLI's limitation; switching away from the git marketplace; OpenCode `skills` URL; fallbacks labelled "no auto-update"
- [x] 6.2 Add a README Releasing section (convention and bump table, PR body and `BREAKING CHANGE`, title limit, `install-hooks`, running a release, dry-run and its limits, recovery, repo settings for forks), and update the layout block
- [x] 6.3 Update AGENTS.md: the versioning rule, the `install-hooks` step, the commit convention

## 7. Verification and rollout

- [x] 7.1 Run all local checks: `scripts/skills.py validate`, the Python unit tests, `npm test`, `claude plugin validate .`, `build-pages` into a temp dir, and a semantic-release dry run if a token is available
- [x] 7.2 In an isolated scratch HOME, serve a `build-pages` output locally and check that a Claude install, a version-bump update and OpenCode catalog loading all work
- [ ] 7.3 After merge, make the PR-title check required on `main`, and start the first Release run (owner)
- [ ] 7.4 With the owner's go-ahead, set up the dev server: Claude `extraKnownMarketplaces` + `autoUpdate` + `enabledPlugins`, and the OpenCode `skills` URL. Check the skill inventory in both tools
- [ ] 7.5 Publish a second (patch) release, confirm both tools update without any manual command, and record the timing in the README
