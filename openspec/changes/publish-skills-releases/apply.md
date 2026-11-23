# Apply Receipt

**Change**: `publish-skills-releases`
**Iteration**: `1`
**Applied at**: `2026-11-22 17:01`
**Executor**: `subagent-driven-development` (fresh implementer per plan task; Opus 5.5 task reviews)

---

## Workspace

- **Worktree**: `/home/dev/.t3/worktrees/agentic-development-skills/t3-ae5871db-403d1234c76b594d`
- **Branch**: `feat/publish-skills-releases`

---

## Commits

- **Range**: `9dbab5b..520a868`
- **Count**: `14`

Implementation commits (after the planning scaffold):

- `b6c5179` refactor: make skills.py root-aware with lazy PyYAML import
- `e0550bb` feat: add check-commit-msg with title and file modes
- `20ebfd8` test: run the shell title check against the real CLI
- `4435fa7` feat: add commit-msg hook and install-hooks command
- `4e23c5d` test: isolate install-hooks tests from global git config
- `7523055` ci: check PR titles against Conventional Commits
- `880d49e` feat: add build-pages with OpenCode skill catalog
- `24853a3` fix: make the Pages build directory world-readable
- `8ae9fea` feat: generate Claude URL marketplace and Pages index in build-pages
- `fa74892` feat: select the newest published release for Pages
- `f8cc01d` build: configure semantic-release with pinned toolchain and tests
- `babd255` ci: add release workflow and move validate to current pinned toolchain
- `520a868` docs: document auto-updating installs and the release process

---

## Tasks

- **Completed**: `24 of 27` checkboxes in tasks.md flipped to `- [x]`
- **Remaining**: `7.3`, `7.4`, `7.5` — owner-gated after merge: require the PR-title check, run the first release, configure the dev server and publish/verify a second release.

---

## Verification evidence

### Local checks

- `python3 scripts/skills.py validate` → 1 skill, 0 errors, 0 warnings.
- `python3 -m unittest discover -s scripts -p 'test_*.py'` → 64 tests, OK.
- `npm test` → 8 tests, 8 pass (rules + lifecycle; lifecycle measures ~10.7 s).
- `npx -y @anthropic-ai/claude-code@2.1.330 plugin validate .` → Validation passed.
- `scripts/test-release-lifecycle.mjs` records the exact extra ref semantic-release pushes: `refs/notes/semantic-release-v0.1.0` (plus `refs/tags/v0.1.0`); `refs/heads/*` are unchanged.
- semantic-release dry run was skipped: the branch is not on the remote and no push-capable `GITHUB_TOKEN` was available. A dry run also skips `prepare`, so the real `prepareCmd` string is first exercised on the first real release.

### Local end-to-end check (Task 11)

Verified on Claude Code 2.1.330 and OpenCode 2.3.2 with an isolated HOME and a locally served catalog (`build-pages --version 0.0.0`, Claude `ref v0.0.0` = seed tag `9dbab5b`). Nothing was installed into the user's real config.

- Claude: URL marketplace `add` → `install harness-audit@agentic-development-skills` → details showed `harness-audit 0.0.0`, `Skills (1) harness-audit`; the installed `SKILL.md` is byte-identical to `git show v0.0.0:skills/harness-audit/SKILL.md` (37955 bytes) and `gitCommitSha` is `9dbab5b`, proving the `ref` pin works.
- Claude update: bumping only `version` to `0.0.1` in the served marketplace, then `marketplace update` + `plugin update`, moved the install 0.0.0 → 0.0.1 (`details` and `installed_plugins.json`). `gitCommitSha` correctly stayed at the tag.
- `autoUpdate`: not written by `marketplace add` or the later update; the isolated `settings.json` only gains `extraKnownMarketplaces` + `enabledPlugins`, and `grep -rn autoUpdate` under the isolated `.claude` finds nothing. The README note is accurate.
- OpenCode: `{"skills":["http://127.0.0.1:8765/opencode/"]}` → `opencode --standalone run` populated `$XDG_CACHE_HOME/opencode/skills/ab316a7c…/harness-audit/SKILL.md`, byte-identical to the served file (37955 bytes) with `.opencode-version` = `0.0.0`, and ran without any provider sign-in. After appending a marker to the served `SKILL.md` and bumping `index.json` to `0.0.1`, a second run refreshed the same cache dir (37983 bytes, marker present, `cmp` clean) and `.opencode-version` = `0.0.1`.
- Cleanup: server killed, port closed, temp dir removed; real `~/.claude` and `~/.config/opencode` untouched.

### Environment notes

- Local Python is 3.14.4; CI pins 3.15. All Python code is 3.9+ compatible.
- The isolated-HOME run used `PYTHONPATH=/home/dev/.local/lib/python3.14/site-packages` for PyYAML (installed only in the real user site); this affects only `build-pages`, not the Claude/OpenCode configs.
- `@action-validator/cli@0.6.0` takes exactly one path; the three workflows were linted one file at a time, all exit 0. The plan command was corrected to a loop.

---

## Next step

Run `openspec-verify-change`, then finalize. Tasks 7.3–7.5 need the owner: merge the PR, make the PR-title check required, run the first release on `main`, and (with the owner's go-ahead) configure the dev server and publish a second release.
