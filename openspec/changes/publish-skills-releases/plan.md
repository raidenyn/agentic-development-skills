# Publish Skills Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual semantic-release pipeline on `main` that tags a release, publishes a GitHub release and deploys versioned OpenCode and Claude Code catalogs to GitHub Pages, plus enforcement of Conventional Commits (local hook and PR title).

**Architecture:**
- **Python (`scripts/skills.py`, stdlib plus lazy PyYAML)** owns validation, the catalog builder (`build-pages`), the commit checker (`check-commit-msg`) and `install-hooks`.
- **`scripts/pages_release.py`** (stdlib) chooses which release Pages deploys.
- **semantic-release 26.0.1** owns the bump, notes, tag and GitHub release, and calls Python through `@semantic-release/exec`.
- **`release.yml`** has two jobs: `release` (semantic-release), then `pages` (rebuild from the newest published release, then deploy).

**Tech Stack:**
- Python 3.15 with `unittest`, PyYAML 6.0.4;
- Node 26.13.1 with `node:test`, semantic-release 26.0.1, `@semantic-release/exec` 7.1.0, `@semantic-release/github` 12.0.11, `conventional-changelog-conventionalcommits` 10.4.1;
- GitHub Actions (checkout v7.0.1, setup-python v7.1.0, setup-node v7.1.0, upload-pages-artifact v5.0.0, deploy-pages v5.0.1);
- Claude Code CLI 2.1.330.

**Spec:**
- `openspec/changes/publish-skills-releases/design.md`;
- `specs/skill-release-pipeline/spec.md`, `specs/skill-distribution-catalogs/spec.md` and `specs/commit-message-convention/spec.md` in the same change directory.

## Global Constraints

- **Branch:** `feat/publish-skills-releases`. Every commit in this plan uses a Conventional Commits header (the hook from Task 3 enforces this from then on).
- **Repo:** `raidenyn/agentic-development-skills` is public. Pages URL: `https://raidenyn.github.io/agentic-development-skills/`. Seed tag `v0.0.0` is on `9dbab5b`.
- **Tag format:** `v${version}`. There is one version for the whole repo.
- **Allowed types:** `feat|fix|perf|docs|chore|ci|build|refactor|test|style|revert`.
- **Header regex:** `^(feat|fix|perf|docs|chore|ci|build|refactor|test|style|revert)(\([a-z0-9-]+\))?!?: \S.*`. Limits: 100 characters in file mode, 92 in title mode.
- **Bump rules:** `[{"breaking": true, "release": "major"}, {"type": "feat", "release": "minor"}, {"release": "patch"}]`.
- **Exact pins:**
  - Node `26.13.1` (`.nvmrc`), `engines.node` `>=26.13`;
  - `semantic-release@26.0.1`, `@semantic-release/exec@7.1.0`, `@semantic-release/github@12.0.11`, `conventional-changelog-conventionalcommits@10.4.1`;
  - Python `3.15`, `pyyaml==6.0.4`;
  - `npx -y @anthropic-ai/claude-code@2.1.330`.
  - the workflow linter `npx -y @action-validator/cli@0.6.0`, never `action-validator@latest`, which is an unrelated package.
- **Tests:** every git or `skills.py` subprocess in the tests uses the `git_env()` helper from Task 1, and every temp path comes from `mktemp -d` or `tempfile`.
- **Action SHAs** (with the version in a trailing comment):
  - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`
  - `actions/setup-python@6d4fd22b20465ccc0f7354476588e8df7c9ca0e0 # v7.1.0`
  - `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0`
  - `actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0`
  - `actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1`

  Re-check them with `gh api repos/<action>/releases/latest` before committing the workflows.
- **Hard rules:**
  - no `@semantic-release/git`, no `@semantic-release/changelog`, no npm publish, no commit-back;
  - the committed `.claude-plugin/marketplace.json` keeps relative `./skills/<name>` sources and no `version`.
- `check-commit-msg` and `install-hooks` must run without PyYAML installed.

## Review Focus

1. **Skill file names OpenCode would reject.** OpenCode refuses paths containing `?`, `#`, `\`, NUL, or `.`/`..` segments, and drops the *whole* skill. `build-pages` must fail and name the file, not publish a skill that silently never loads. The test goes in Task 5.
2. **CRLF and leading blank lines in commit message files** (editors on Windows, `git commit -F`). The header is the first non-blank, non-comment line with `\r` stripped. A valid message must pass. The test goes in Task 2.
3. **Tags that aren't stable releases** (`v1.2.0-beta.1`, `vfoo`, `v0.0.0`) on `main`. Both choosing a release and the orphan check must ignore them. The test goes in Task 7.
4. **A repo with zero skills.** `build-pages` must exit non-zero with "no skills found", not deploy an empty catalog that makes OpenCode drop everything. The test goes in Task 5.
5. **`install-hooks` run outside a git checkout, or with `git` missing.** It must give a clear error and exit non-zero, not print a traceback. The test goes in Task 3.

---

### Task 1: Lazy PyYAML, a root-aware `validate`, and the test harness

**Files:**
- Modify: `scripts/skills.py` (module docstring; lines 25-33 import block and path constants; `validate()`, `new()` and `main()`)
- Create: `requirements-dev.txt`, `scripts/test_skills.py`

**Interfaces:**
- Produces:
  - `load_yaml() -> module`, which imports `yaml` on first call, or exits with `"PyYAML is required: pip install -r requirements-dev.txt"`;
  - `validate(root: Path = ROOT) -> int` and `new(name, description, category, root: Path = ROOT) -> int`, which derive `skills/`, `template/SKILL.md` and `.claude-plugin/marketplace.json` from `root`;
  - the test helper `make_repo(tmp: Path, skills: dict[str, dict[str, str]]) -> Path`, which writes `skills/<name>/<file>` contents and a matching marketplace, and returns the root;
  - the test helper `git_env(extra: dict | None = None) -> dict`: `os.environ` plus `GIT_AUTHOR_NAME=Test`, `GIT_AUTHOR_EMAIL=test@example.invalid`, `GIT_COMMITTER_NAME=Test`, `GIT_COMMITTER_EMAIL=test@example.invalid`, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1` and `GIT_TERMINAL_PROMPT=0`. **Every** `subprocess.run` in the tests that runs `git`, `skills.py`, or a hook passes `env=git_env()`. CI runners and this server have no git identity, and a developer's global `core.hooksPath` or `commit.gpgsign` must not leak in;
  - the test helper `tmpdir()`, which uses `tempfile.TemporaryDirectory()`. Never use fixed `/tmp` paths.

- [ ] **Step 1: Write the failing tests** in `scripts/test_skills.py`. Use `sys.path.insert(0, str(Path(__file__).parent))` and then `import skills`.
  - `test_validate_ok_on_fixture_repo`: `make_repo(tmp, {"demo-skill": {"SKILL.md": "---\nname: demo-skill\ndescription: Use when testing.\n---\n# Demo\n"}})`, then assert `skills.validate(root) == 0`.
  - `test_module_imports_without_yaml`: run `python3 -c "import sys; sys.modules['yaml']=None; sys.path.insert(0,'scripts'); import skills"` with `subprocess.run(..., cwd=ROOT, env=git_env())`, and assert return code 0. Tasks 2 and 3 add CLI tests that block yaml the same way.
- [ ] **Step 2: Run and see it fail.** Run `python3 -m unittest scripts/test_skills.py -v`. Expected: FAIL (`validate()` takes no `root`, and the import exits without yaml).
- [ ] **Step 3: Implement.**
  - Replace the top-level `try: import yaml` with `load_yaml()`, called inside `read_frontmatter`.
  - Thread `root` through `validate` and `new`. Messages use `relative_to(root)`.
  - Add `requirements-dev.txt` containing `pyyaml==6.0.4`.
  - Update the docstring's "Requires" line.
- [ ] **Step 4: Run and see it pass.** Run `python3 -m unittest scripts/test_skills.py -v && python3 scripts/skills.py validate`. Expected: OK, and `1 skill(s), 0 error(s)`.
- [ ] **Step 5: Commit.** `git add scripts/skills.py scripts/test_skills.py requirements-dev.txt && git commit -m "refactor: make skills.py root-aware with lazy PyYAML import"`

### Task 2: `check-commit-msg` (title mode and file mode)

**Files:**
- Modify: `scripts/skills.py` (new functions, plus a subparser in `main()`)
- Test: `scripts/test_skills.py` (class `CommitMsgTests`)

**Interfaces:**
- Produces:
  - `HEADER_RE` (the Global Constraints regex);
  - `check_header(header: str, limit: int) -> str | None`, which returns an error string or `None`;
  - `check_commit_msg(text: str, mode: str, comment_char: str = "#") -> str | None`, where `mode` is `"file"` or `"title"`;
  - `git_comment_char(cwd: Path) -> str`, which reads `git config core.commentString` first, then `core.commentChar`; unset or `auto` gives `"#"`;
  - CLI `check-commit-msg [PATH] [--text TITLE]`: exactly one of the two is required. Exit 0 if ok, 1 with the error on stderr otherwise.
- Error text (exact): `invalid commit header: '<header>'\nexpected '<type>(<scope>)!: <subject>', e.g. 'feat: add sandbox checks'\ntypes: feat, fix, perf, docs, chore, ci, build, refactor, test, style, revert`. Over the limit: `header is <n> characters (max <limit>)`.

- [ ] **Step 1: Write the failing tests.** Each one asserts `None` for pass and non-`None` for fail.
  - Title mode:
    - `feat(harness-audit): add sandbox checks` passes;
    - `Added sandbox checks` fails, and the error contains `feat: add sandbox checks`;
    - `Merge branch 'feature'` fails;
    - `fixup! feat: x` fails;
    - a valid 92-character title passes; 93 characters fails;
    - `Revert "feat: x"` fails (title mode has no pass-throughs);
    - `test_title_via_shell_is_data`: run the workflow's exact line, `subprocess.run(["sh", "-c", 'python3 scripts/skills.py check-commit-msg --text="$TITLE"'], cwd=tmp_copy, env=git_env({"TITLE": "feat: $(touch pwned)"}))`. Assert exit 0, that no `pwned` file exists in `tmp_copy`, and, with a patched checker that echoes its input in the copy, that the title arrived unchanged;
    - a title starting with `-` (e.g. `--help`) reaches the checker through `--text=` and fails as an invalid header, not as an argparse option;
    - the CLI with yaml blocked: `python3 -c "import sys,runpy; sys.modules['yaml']=None; sys.argv=['skills.py','check-commit-msg','--text','feat: x']; runpy.run_path('scripts/skills.py', run_name='__main__')"` with `cwd=ROOT` exits 0.
  - File mode:
    - `feat: x\n\n# comment\n` passes;
    - `Merge branch 'b2'\n` passes;
    - `Revert "feat: x"\n\nThis reverts commit abc.\n` passes;
    - `Reapply "feat: x"\n\nThis reverts commit def.\n` passes (git 2.53 writes this when you revert a revert);
    - `fixup! feat: x`, `squash! feat: x` and `amend! feat: x` pass;
    - a 101-character valid header fails;
    - `""` and `"# only comments\n"` pass (git aborts empty messages itself);
    - `\r\n\r\nfeat: x\r\n` passes (Review Focus 2);
    - `update stuff` fails.
  - Real git output (temp repo via `subprocess`):
    - (a) `git -c core.commentChar=';' commit -v` with `GIT_EDITOR` set to a script that writes a valid header above the template. Capture the message file with a capturing `commit-msg` hook, and assert that `check_commit_msg(captured, "file", ";")` returns `None`. The `;` scissors line and the diff are ignored.
    - (b) the same with the default `#`;
    - (c) a real `git merge --no-ff` message file passes;
    - (d) `test_scissors_truncates`: the header is `feat: x`, and below the scissors line there's `not a header` with no comment prefix (diff-like text). It passes. A message with `not a header` *above* a valid header fails. This proves the cut actually happens.

    All real-git calls use `env=git_env()`.
- [ ] **Step 2: Run and see it fail.** Run `python3 -m unittest scripts.test_skills.CommitMsgTests -v` from the repo root. Expected: FAIL with `AttributeError: check_commit_msg`.
- [ ] **Step 3: Implement** `check_header`, `check_commit_msg` and `git_comment_char`, and add the subparser.
  - File mode:
    - normalise `\r\n` to `\n`;
    - cut at the first line equal to `f"{c} ------------------------ >8 ------------------------"`;
    - drop lines starting with `c`;
    - the header is the first non-blank line, and none means pass;
    - pass the header if it starts with `Merge `, `Revert "`, `Reapply "`, `fixup! `, `squash! ` or `amend! `;
    - otherwise `check_header(h, 100)`.
  - Title mode: `check_header(text.rstrip("\n"), 92)`.
  - The CLI file mode uses `git_comment_char(Path.cwd())`.
- [ ] **Step 4: Run and see it pass.** Run the same command. Expected: OK.
- [ ] **Step 5: Commit.** `git add scripts && git commit -m "feat: add check-commit-msg with title and file modes"`

### Task 3: `commit-msg` hook and `install-hooks`

**Files:**
- Create: `.githooks/commit-msg` (mode 755)
- Modify: `scripts/skills.py` (`install_hooks`, subparser)
- Test: `scripts/test_skills.py` (class `InstallHooksTests`)

**Interfaces:**
- Consumes: the `check-commit-msg` CLI (Task 2).
- Produces:
  - `install_hooks(repo: Path, force: bool) -> int`;
  - CLI `install-hooks [--force]`, which runs against `git rev-parse --show-toplevel` of the current directory.
  - Messages:
    - `core.hooksPath set to .githooks`;
    - `core.hooksPath already .githooks` when it's already set;
    - when another path is set: `core.hooksPath is '<value>'; refusing to replace it (use --force)`, exit 1;
    - outside a repo, or without git: `not a git checkout (or git not found)`, exit 1.
- The hook body (exact):

```sh
#!/bin/sh
exec python3 "$(git rev-parse --show-toplevel)/scripts/skills.py" check-commit-msg "$1"
```

- [ ] **Step 1: Write the failing tests.** Fixture: a temp repo (`git init` with `env=git_env()`). Copy `scripts/skills.py` and `.githooks/commit-msg` in, `chmod 0o755` the hook **on disk**, then `git add` and **commit them** (with `--no-verify`) before anything else. A linked worktree only contains committed files, so without the commit its hook would be missing and the test would pass for the wrong reason.
  - after `install_hooks`, `git config core.hooksPath` is `.githooks`, and a second call returns 0 with no change;
  - `git commit --allow-empty -m "update stuff"` fails and stderr contains `invalid commit header`;
  - `git commit --allow-empty -m "chore: ok"` succeeds;
  - `git worktree add ../wt` followed by a bad commit in `wt` fails (worktree coverage);
  - with `core.hooksPath=/somewhere/else`, the call returns 1, prints the value, and the config is unchanged. With `force=True` it returns 0;
  - a non-repo temp dir returns 1 with `not a git checkout`, and no traceback (Review Focus 5);
  - the `install-hooks` CLI with yaml blocked (the same `runpy` pattern as Task 2) exits 0 in the fixture repo;
  - `npm ci` never changing git config is covered in Task 8, which asserts `package.json` has no lifecycle scripts.
- [ ] **Step 2: Run and see it fail.** Run `python3 -m unittest scripts.test_skills.InstallHooksTests -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `install_hooks` with `subprocess.run(["git", "config", ...])`, catching `FileNotFoundError` and `CalledProcessError`. Create the hook and run `git update-index --chmod=+x .githooks/commit-msg` after adding it.
- [ ] **Step 4: Run and see it pass.** Run the same command. Expected: OK. Then run `python3 scripts/skills.py install-hooks` in this worktree. Expected: `core.hooksPath set to .githooks`.
  - This writes to the shared `.git/config`, so every checkout of this repo, including the main one, now looks in `.githooks`.
  - Until this branch merges, other checkouts have no `.githooks/`, so they run no hook. Nothing breaks, because no hooks or `hooksPath` exist today.
- [ ] **Step 5: Commit.** `git add .githooks scripts && git commit -m "feat: add commit-msg hook and install-hooks command"` (this commit already goes through the hook).

### Task 4: PR-title workflow

**Files:**
- Create: `.github/workflows/pr-title.yml`

**Interfaces:**
- Consumes: `check-commit-msg --text` (Task 2).

- [ ] **Step 1: Write the workflow.**
  - Name: `PR title`.
  - Trigger: `on: pull_request_target: types: [opened, edited, synchronize, reopened]`, with `permissions: contents: read`.
  - One job, `check` (`runs-on: ubuntu-latest`), with these steps:
    1. the pinned checkout with `persist-credentials: false` and no `ref` (the base branch by default);
    2. `run: python3 scripts/skills.py check-commit-msg --text="$TITLE"` with `env: TITLE: ${{ github.event.pull_request.title }}`. The `=` form makes sure a title starting with `-` is read as the value. This must be the exact string tested in Task 2's `test_title_via_shell_is_data`.
  - No setup-python.
- [ ] **Step 2: Lint it.** Run `npx -y @action-validator/cli@0.6.0 .github/workflows/pr-title.yml`, with that version pinned. Never use `action-validator@latest`: it resolves to an unrelated npm package. Expected: exit 0. Also, `grep -n 'github.event.pull_request.title' .github/workflows/pr-title.yml` must show it only on the `env:` line.
- [ ] **Step 3: Commit.** `git add .github/workflows/pr-title.yml && git commit -m "ci: check PR titles against Conventional Commits"`

### Task 5: `build-pages`: the OpenCode catalog and consistency checks

**Files:**
- Modify: `scripts/skills.py` (`skill_files`, `build_pages`, subparser)
- Test: `scripts/test_skills.py` (class `BuildPagesTests`)

**Interfaces:**
- Consumes: `make_repo` and `validate(root)` (Task 1).
- Produces:
  - `skill_files(skill_dir: Path) -> list[str]`: sorted POSIX relative paths, skipping dotfiles, dot-directories and `__pycache__`. It raises `BuildError` on a symlink, or on a path with a segment that is empty, `.` or `..`, or that contains `?`, `#`, `\` or NUL;
  - `class BuildError(Exception)`;
  - `build_pages(version: str, out: Path, slug: str, root: Path = ROOT) -> int`;
  - CLI `build-pages --version X.Y.Z --out DIR`, where the slug is `os.environ.get("GITHUB_REPOSITORY", "raidenyn/agentic-development-skills")`.
- `build_pages` runs these checks in order, prints `error: …` and returns 1:
  1. `version` must match `^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$`;
  2. `out` must be missing or empty;
  3. `validate(root)` must return 0;
  4. there must be at least one skill (`no skills found`);
  5. every skill folder must have an entry, and every entry a folder;
  6. every skill must have `SKILL.md`;
  7. `skill_files` must not raise.

- [ ] **Step 1: Write the failing tests:**
  - with one skill containing `SKILL.md` and `references/a.md`, `build_pages("0.2.0", out, "o/r", root)` returns 0, and `json.load(out/"opencode/index.json") == {"skills":[{"name":"demo-skill","version":"0.2.0","files":["SKILL.md","references/a.md"]}]}`;
  - both files are byte-identical under `out/opencode/demo-skill/`;
  - `.hidden` and `__pycache__/x.pyc` are excluded;
  - a symlink returns 1;
  - a file named `a#b.md` returns 1, naming the file (Review Focus 1);
  - zero skills returns 1 with `no skills found` (Review Focus 4);
  - an unlisted skill returns 1, naming it;
  - a marketplace entry with no `skills/<name>/` folder returns 1, naming it;
  - a skill folder with no `SKILL.md` returns 1, naming it;
  - a non-empty `out` returns 1;
  - `version="1.2"` returns 1;
  - `test_failure_leaves_no_catalog`: for the symlink and `a#b.md` cases, `out` doesn't exist afterwards, and no `.build-*` temp directory is left next to it.
- [ ] **Step 2: Run and see it fail.** Run `python3 -m unittest scripts.test_skills.BuildPagesTests -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `skill_files` and `build_pages` (the OpenCode part).
  - Build into `tempfile.mkdtemp(prefix=".build-", dir=out.parent)`, and `os.replace` it to `out` only on success. On any failure, `shutil.rmtree` the temp directory, so no partial catalog is left behind.
  - Write JSON with `indent=2` and a trailing newline. Copy with `shutil.copyfile`.
- [ ] **Step 4: Run and see it pass.** Run the same command. Expected: OK.
- [ ] **Step 5: Commit.** `git commit -am "feat: add build-pages with OpenCode skill catalog"`

### Task 6: `build-pages`: the Claude marketplace and `index.html`

**Files:**
- Modify: `scripts/skills.py` (`build_pages`)
- Test: `scripts/test_skills.py`

**Interfaces:**
- Consumes: `build_pages` (Task 5).
- Produces:
  - `out/claude/marketplace.json`;
  - `out/index.html`;
  - the JSON source shape `{"source":"git-subdir","url":f"https://github.com/{slug}.git","path":f"skills/{name}","ref":f"v{version}"}`.

- [ ] **Step 1: Write the failing tests:**
  - the marketplace `name`, `owner` and `description` equal the repo marketplace's, and each entry keeps `description`, `category` and `tags`, has `version == "0.2.0"`, and has the source above with slug `o/r`;
  - the committed `.claude-plugin/marketplace.json` is unchanged afterwards (compare the bytes);
  - `index.html` contains `demo-skill`, `0.2.0`, `https://o.github.io/r/opencode/` and `https://o.github.io/r/claude/marketplace.json`. The base is `https://{owner.lower()}.github.io/{repo}/`: only the owner is lowercased, and the repo keeps its case. A second case, slug `Raidenyn/agentic-development-skills`, gives `https://raidenyn.github.io/agentic-development-skills/`;
  - no file under `out` starts with `.`;
  - `test_claude_validates_generated_marketplace`: skip unless `shutil.which("npx")`. Copy `out/claude/marketplace.json` to `scratch/.claude-plugin/marketplace.json`, run `npx -y @anthropic-ai/claude-code@2.1.330 plugin validate scratch` with `env=git_env({"HOME": str(tmp_home)})`, and expect exit 0.
- [ ] **Step 2: Run and see it fail.** Run `python3 -m unittest scripts.test_skills.BuildPagesTests -v`. Expected: the new tests fail.
- [ ] **Step 3: Implement.** Escape the HTML with `html.escape`. The page has:
  - an `<h1>` with the marketplace name;
  - a table of name, description and version;
  - two `<pre>` snippets: the OpenCode `"skills": ["<base>opencode/"]`, and the Claude `settings.json` with `extraKnownMarketplaces` (url `<base>claude/marketplace.json`, `autoUpdate: true`) and `enabledPlugins`.
- [ ] **Step 4: Run and see it pass.** Run the same command. Expected: OK. Then run `D=$(mktemp -d) && python3 scripts/skills.py build-pages --version 0.0.0-dev --out "$D/site" && ls -R "$D/site"`. Expected: `index.html`, `claude/marketplace.json`, `opencode/index.json` and `opencode/harness-audit/SKILL.md`.
- [ ] **Step 5: Commit.** `git commit -am "feat: generate Claude URL marketplace and Pages index in build-pages"`

### Task 7: Choosing the release Pages deploys (`scripts/pages_release.py`)

**Files:**
- Create: `scripts/pages_release.py`, `scripts/test_pages_release.py`

**Interfaces:**
- Produces:
  - `STABLE_RE = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")`;
  - `select_release(tags_on_main: list[str], published: list[str]) -> tuple[str | None, str | None]`, which returns `(tag_to_deploy, orphan_error)`;
  - CLI `python3 scripts/pages_release.py`. It gets tags with `git tag --merged origin/main --list 'v*'` (that `--merged` is the design's ancestor check) and releases with `gh release list --exclude-drafts --exclude-pre-releases --limit 1000 --json tagName -q '.[].tagName'`. It then:
    - on an orphan, prints the error to stderr with `See README → Releasing → Recovery` and exits 1;
    - with no release, prints `no published release; nothing to deploy` and writes `tag=` to `$GITHUB_OUTPUT`;
    - otherwise writes `tag=<tag>` and `version=<tag without v>` to `$GITHUB_OUTPUT`.
- Algorithm (exact):

```python
def _key(t): return tuple(int(x) for x in STABLE_RE.match(t).groups())
stable = sorted({t for t in tags_on_main if STABLE_RE.match(t) and t != "v0.0.0"}, key=_key)
pub = {t for t in published if STABLE_RE.match(t)}
if stable and stable[-1] not in pub:
    return None, f"tag {stable[-1]} on main has no published GitHub release"
candidates = [t for t in stable if t in pub]
return (candidates[-1] if candidates else None), None
```

- [ ] **Step 1: Write the failing tests:**
  - `(["v0.0.0"], []) -> (None, None)`;
  - `(["v0.0.0","v0.1.0"], ["v0.1.0"]) -> ("v0.1.0", None)`;
  - `(["v0.0.0","v0.1.0"], []) -> (None, error naming v0.1.0)` (the first release failed);
  - `(["v0.9.0","v0.10.0"], ["v0.10.0","v0.9.0"]) -> ("v0.10.0", None)`, so ordering is by semver, not by list order;
  - `(["v0.1.0","v1.0.0-beta.1","vfoo"], ["v0.1.0","v1.0.0-beta.1"]) -> ("v0.1.0", None)` (Review Focus 3);
  - off-main: `(["v0.1.0"], ["v0.1.0","v0.2.0"]) -> ("v0.1.0", None)`. `v0.2.0` was published from a commit not on `main`, so it isn't among `tags_on_main`, and it's ignored;
  - CLI tests with fake `git` and `gh` executables on `PATH`, and `GITHUB_OUTPUT` set to a temp file:
    - (a) `v0.0.0` and `v0.1.0`, both published: the file contains `tag=v0.1.0\nversion=0.1.0\n`;
    - (b) seed only: exit 0, and the file contains `tag=\n`;
    - (c) orphan: exit 1, stderr names the tag and contains `README`, and the file contains **no** `tag=` line;
    - (d) the fake `gh` returns `v0.9.0` *after* `v0.10.0` (newest-created first): the output is `v0.10.0`.
  - In Task 9, `pages` never reads outputs from the `release` job. It works the version out again from GitHub every time, and a comment in `release.yml` says so.
- [ ] **Step 2: Run and see it fail.** Run `python3 -m unittest scripts/test_pages_release.py -v`. Expected: FAIL (`ModuleNotFoundError`).
- [ ] **Step 3: Implement** `select_release` and `main()` (stdlib `subprocess`).
- [ ] **Step 4: Run and see it pass.** Run the same command. Expected: OK.
- [ ] **Step 5: Commit.** `git add scripts/pages_release.py scripts/test_pages_release.py && git commit -m "feat: select the newest published release for Pages"`

### Task 8: semantic-release config and rule tests

**Files:**
- Create: `.nvmrc`, `package.json`, `package-lock.json`, `.releaserc.json`, `scripts/test-release-rules.mjs`
- Modify: `.gitignore` (add `node_modules/` and `_release-check/`)

**Interfaces:**
- Consumes: the `validate` and `build-pages` CLIs (Tasks 1, 5 and 6).
- Produces: `npm test`, which runs `node --test scripts/test-release-rules.mjs`.
- `package.json`:
  - `{"name":"agentic-development-skills-release","private":true,"type":"module","engines":{"node":">=26.13"},"scripts":{"test":"node --test scripts/test-release-rules.mjs"}}`;
  - `devDependencies` with the exact pins from Global Constraints;
  - **no `prepare` script**.
- `.releaserc.json`:
  - `"branches":["main"]` and `"tagFormat":"v${version}"`;
  - a `"plugins"` array in this order:
    1. `["@semantic-release/commit-analyzer", {"preset":"conventionalcommits","releaseRules":<Global rules>}]`;
    2. `["@semantic-release/release-notes-generator", {"preset":"conventionalcommits","presetConfig":{"types":[{"type":"feat","section":"Features"},{"type":"fix","section":"Bug Fixes"},{"type":"perf","section":"Performance"},{"type":"docs","section":"Documentation"},{"type":"chore","section":"Other"},{"type":"ci","section":"Other"},{"type":"build","section":"Other"},{"type":"refactor","section":"Other"},{"type":"test","section":"Other"},{"type":"style","section":"Other"},{"type":"revert","section":"Other"}]}}]`;
    3. `["@semantic-release/exec", {"verifyReleaseCmd":"python3 scripts/skills.py validate","prepareCmd":"rm -rf _release-check && python3 scripts/skills.py build-pages --version ${nextRelease.version} --out _release-check"}]`;
    4. `["@semantic-release/github", {"successCommentCondition":false,"failCommentCondition":false,"releasedLabels":false}]`.

- [ ] **Step 1: Write `.nvmrc`** (`26.13.1`) and `package.json`. Confirm that `node --version` prints `v26.13.1` (switch with `nvm use` if it doesn't), then run `npm install`. Expected: `package-lock.json` exists, `npm ci` succeeds on a clean `node_modules`, and `npm ls @semantic-release/commit-analyzer` shows `14.0.0-beta.x` deduplicated under semantic-release. A lockfile generated with another Node or npm makes `npm ci` in CI fail.
- [ ] **Step 2: Write the failing test** in `scripts/test-release-rules.mjs` (`node:test`, `node:assert/strict`). Load `.releaserc.json` and take each plugin's config. Import `analyzeCommits` from `@semantic-release/commit-analyzer` and `generateNotes` from `@semantic-release/release-notes-generator`. Confirm the export names against `node_modules/*/package.json` `exports` before writing this.
  - Context: `{cwd: process.cwd(), env: {}, logger: {log(){}, error(){}}, options: {repositoryUrl: "https://github.com/raidenyn/agentic-development-skills.git"}, lastRelease: {gitTag: "v0.0.0", version: "0.0.0"}, nextRelease: {gitTag: "v0.1.0", version: "0.1.0"}, commits: [{hash, message}]}`.
  - Analyzer cases:
    - `["docs!: drop old path"] -> "major"`;
    - `["fix: a\n\nBREAKING CHANGE: b"] -> "major"`;
    - `["feat: a","fix: b"] -> "minor"`;
    - `["chore: a"] -> "patch"`;
    - `["Update README"] -> "patch"`;
    - `[""] -> null`.
  - Notes cases:
    - for `feat!: z`, `feat: a (#12)`, `fix: b`, `perf: p`, `docs: d` and `chore: c`, the notes contain `### ⚠ BREAKING CHANGES`, `### Features`, `### Bug Fixes`, `### Performance`, `### Documentation` and `### Other`, **in that order**, and a link `[#12](https://github.com/raidenyn/agentic-development-skills/issues/12)`;
    - for `Update README` alone, the notes contain no `* Update README` line.
  - `test_no_lifecycle_scripts`: `package.json` `scripts` has no `prepare`, `preinstall`, `install` or `postinstall`, so `npm ci` can't change git config. Also, `.nvmrc` equals `26.13.1`.
- [ ] **Step 2b: Write the lifecycle test** in `scripts/test-release-lifecycle.mjs` (`node:test`, run by `npm test` next to the rules test, and so also in CI; it needs no network). Setup:
  - a temp **bare** repo and a clone of it, using `git_env`-equivalent env vars: author and committer identity, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`;
  - `GITHUB_TOKEN`, `GH_TOKEN` and `CI` unset;
  - a test-only config, the committed `.releaserc.json` with `@semantic-release/github` removed and `repositoryUrl: "file://<bare>"`. `verifyReleaseCmd` and `prepareCmd` point at small scripts in the temp dir that the test can make fail;
  - semantic-release run from `node_modules/.bin/semantic-release --no-ci`, with `cwd` in the clone.

  Cases:
  - (a) seed `v0.0.0` + `feat: a`: the tag `v0.1.0` is on the bare remote; the remote's `refs/heads/*` are unchanged; the only new refs are `refs/tags/v0.1.0` and `refs/notes/semantic-release*`. Record the exact notes ref name in `apply.md`;
  - (b) run again with no new commits: exit 0, and no new refs;
  - (c) `verifyReleaseCmd` exits 1: no new tag;
  - (d) `prepareCmd` exits 1: no new tag.

  If the file takes more than about 15 seconds, give it its own script, `npm run test:lifecycle`, which `validate.yml` also runs.
- [ ] **Step 3: Run and see it fail.** Write a valid `.releaserc.json` with `branches`, `tagFormat` and the explicit `plugins` array, but **without** `releaseRules` and `presetConfig`, so it uses the defaults. Run `npm test`. Expected: the config loads, and the test fails because `docs!:` isn't major and the notes have no `### Other`.
- [ ] **Step 4: Complete `.releaserc.json`** exactly as above, and update `.gitignore`.
- [ ] **Step 5: Run and see it pass.** Run `npm test`. Expected: all pass. A real dry run (`npx semantic-release --dry-run --no-ci --branches feat/publish-skills-releases`) works only if that branch exists on the remote and a push-capable `GITHUB_TOKEN` is set. Run it only if the owner has allowed pushing the branch. Otherwise skip it and record in `apply.md` that it was skipped, and that a dry run skips `prepare` anyway.
- [ ] **Step 6: Commit.** `git add .nvmrc package.json package-lock.json .releaserc.json scripts/test-release-rules.mjs scripts/test-release-lifecycle.mjs .gitignore && git commit -m "build: configure semantic-release with pinned toolchain and tests"`

### Task 9: Workflows: update `validate.yml`, add `release.yml`

**Files:**
- Modify: `.github/workflows/validate.yml`
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `requirements-dev.txt`, `.nvmrc`, `npm test`, `build-pages` and `pages_release.py` (Tasks 1–8).

- [ ] **Step 1: Update `validate.yml`.**
  - Use the pinned SHAs.
  - Use `python-version: "3.15"` and `pip install -r requirements-dev.txt`.
  - Use `node-version-file: .nvmrc` and `npm ci`.
  - Steps:
    1. `python3 scripts/skills.py validate`;
    2. `python3 -m unittest discover -s scripts -p 'test_*.py' -v`;
    3. `npm test`;
    4. `npx -y @anthropic-ai/claude-code@2.1.330 plugin validate .`.
- [ ] **Step 2: Write `release.yml`.**
  - `on: workflow_dispatch`, with `concurrency: {group: release, cancel-in-progress: false}`. No `queue:` key: the pinned linter rejects it. A comment says a newer dispatch replaces a pending one.
  - Both jobs: `runs-on: ubuntu-latest` and `if: github.ref_type == 'branch' && github.ref == 'refs/heads/main'`.
  - Job `release`:
    - `permissions: contents: write`. This checkout keeps its default credentials, because semantic-release pushes the tag and notes;
    - steps: checkout `fetch-depth: 0`, then setup-python 3.15 and `pip install -r requirements-dev.txt`, then setup-node (`.nvmrc`) and `npm ci`, then `npx -y @anthropic-ai/claude-code@2.1.330 plugin validate .`, then `npx semantic-release` with `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
  - Job `pages`:
    - `needs: release`;
    - `permissions: {pages: write, id-token: write, contents: read}`, `environment: {name: github-pages, url: ${{ steps.deploy.outputs.page_url }}}`, `env: GH_TOKEN: ${{ github.token }}`;
    - a comment that this job never reads `release` job outputs and always works the version out again from GitHub releases;
    - steps:
      1. checkout `ref: main`, `fetch-depth: 0`, `persist-credentials: false` (`gh` uses `GH_TOKEN`);
      2. `id: pick`, `run: python3 scripts/pages_release.py`;
      3. `if: steps.pick.outputs.tag != ''` for every later step;
      4. `git checkout --detach "refs/tags/$TAG"` with `env: TAG: ${{ steps.pick.outputs.tag }}`. The full ref keeps a branch with the same name from being picked;
      5. setup-python 3.15 and `pip install -r requirements-dev.txt`;
      6. `python3 scripts/skills.py build-pages --version "$VERSION" --out _site` with `env: VERSION: ${{ steps.pick.outputs.version }}`;
      7. upload-pages-artifact with `path: _site`;
      8. `id: deploy` with deploy-pages.
- [ ] **Step 3: Lint.** Run `npx -y @action-validator/cli@0.6.0 .github/workflows/*.yml`. Expected: exit 0 for all three files. Then run `grep -c '@[0-9a-f]\{40\}' .github/workflows/*.yml`. Expected: every `uses:` line is SHA-pinned (`grep -n 'uses:' … | grep -v '@[0-9a-f]\{40\}'` prints nothing).
- [ ] **Step 4: Commit.** `git add .github/workflows && git commit -m "ci: add release workflow and move validate to current pinned toolchain"`

### Task 10: README and AGENTS.md

**Files:**
- Modify: `README.md`, `AGENTS.md`

- [ ] **Step 0: Write the failing test** `test_readme_snippets_are_valid_json` in `scripts/test_skills.py`. It takes the README's fenced ```json blocks under `## Install`, parses each one, and asserts:
  - the Claude block has `extraKnownMarketplaces.agentic-development-skills.autoUpdate == true`, its source url ends with `/claude/marketplace.json`, and `enabledPlugins["harness-audit@agentic-development-skills"] == true`;
  - the OpenCode block's `skills` is `["https://raidenyn.github.io/agentic-development-skills/opencode/"]`.

  Run it. Expected: FAIL (no blocks yet).
- [ ] **Step 1: README Install section.**
  - **Replace the existing Publishing / Install text** (including the "While this repository is private…" paragraph and the old git-marketplace instructions), rather than only deleting the private-repo note. Put the two JSON snippets in fenced ```json blocks.
  - **Claude Code:**
    - (a) the recommended `~/.claude/settings.json` snippet: `extraKnownMarketplaces.agentic-development-skills = {"source":{"source":"url","url":"https://raidenyn.github.io/agentic-development-skills/claude/marketplace.json"},"autoUpdate":true}` plus `enabledPlugins["harness-audit@agentic-development-skills"]: true`;
    - (b) the CLI path (`claude plugin marketplace add <url>`, then `claude plugin install …`), with the bold note that it doesn't turn on auto-update, plus the `/plugin` → Marketplaces toggle;
    - (c) switching: `claude plugin marketplace remove agentic-development-skills` first if it was added from GitHub;
    - (d) timing: checked after the first message of a session, applied on `/reload-plugins` or the next launch.
  - **OpenCode:** `"skills": ["https://raidenyn.github.io/agentic-development-skills/opencode/"]`, picked up at the next start or config reload.
  - The `npx skills` and manual sections get the heading suffix "(no auto-update)".
- [ ] **Step 2: README Releasing section.** Cover:
  - the bump table;
  - the type list;
  - that the PR title is the commit subject (max 92) and the PR body the commit body (`BREAKING CHANGE:` gives major), and to keep the default squash message;
  - `python3 scripts/skills.py install-hooks`;
  - Actions → Release → Run workflow on `main`;
  - the dry run (`npx semantic-release --dry-run --no-ci` needs a push-capable `GITHUB_TOKEN` and skips `prepare`; run `build-pages --version 0.0.0-dev --out /tmp/site` to check the catalog);
  - commits that don't parse give a patch bump with no notes entry;
  - recovery (a failed deploy: start a new run; an orphan tag: `git push origin :refs/tags/vX.Y.Z`, then a new run; never `gh release create --notes-from-tag`);
  - overlapping runs: a newer dispatch replaces a pending one, and the run that goes ahead releases everything;
  - settings for forks;
  - the new files in the Repository layout block.
- [ ] **Step 3: AGENTS.md.**
  - Replace the version bullet with: "Never add `version` to `.claude-plugin/marketplace.json`; release versions exist only in the generated Pages marketplace."
  - Add Workflow step 0: "Run `python3 scripts/skills.py install-hooks` once per clone; commits and PR titles must follow Conventional Commits (`feat:`, `fix:`, `docs:` …)."
  - Add to step 3: `python3 -m unittest discover -s scripts -p 'test_*.py'` and `npm test`.
- [ ] **Step 4: Check.**
  - Run `python3 -m unittest scripts.test_skills -k readme -v`. Expected: PASS.
  - Run `grep -n -i 'private' README.md`. Expected: no line about the repo being private.
  - Run `python3 scripts/skills.py validate`. Expected: 0 errors.
- [ ] **Step 5: Commit.** `git commit -am "docs: document auto-updating installs and the release process"`

### Task 11: Local end-to-end check in an isolated HOME

**Files:** none committed (scratch only).

- [ ] **Step 1: Run the full checks.** Run `python3 scripts/skills.py validate && python3 -m unittest discover -s scripts -p 'test_*.py' && npm test && npx -y @anthropic-ai/claude-code@2.1.330 plugin validate .`. Expected: all pass.
- [ ] **Step 2: Set up the isolated environment and serve a catalog** pinned to the real seed tag:

```bash
S=$(mktemp -d); export HOME=$S/home XDG_CONFIG_HOME=$S/home/.config XDG_CACHE_HOME=$S/home/.cache XDG_DATA_HOME=$S/home/.local/share XDG_STATE_HOME=$S/home/.local/state
mkdir -p "$XDG_CONFIG_HOME/opencode"
python3 scripts/skills.py build-pages --version 0.0.0 --out "$S/site"
python3 -m http.server 8765 --bind 127.0.0.1 --directory "$S/site" & SRV=$!; trap 'kill $SRV' EXIT
until curl -sf http://127.0.0.1:8765/claude/marketplace.json >/dev/null; do sleep 0.2; done
```

- [ ] **Step 3: Claude.** Run `claude plugin marketplace add http://127.0.0.1:8765/claude/marketplace.json && claude plugin install harness-audit@agentic-development-skills && claude plugin details harness-audit@agentic-development-skills`. Expected: version `0.0.0`, and `Skills (1) harness-audit`.
- [ ] **Step 4: Claude update smoke test.** Edit `version` to `0.0.1` in the served file (keep ref `v0.0.0`), then run `marketplace update` and `plugin update`. Expected: installed `0.0.1`. This only checks that a version bump triggers an update. Task 12 checks the content against a new tag.
- [ ] **Step 5: OpenCode.** Write `$XDG_CONFIG_HOME/opencode/opencode.json` with `{"skills":["http://127.0.0.1:8765/opencode/"]}` and run `opencode --standalone run "list your skills"`.
  - Expected: `$XDG_CACHE_HOME/opencode/skills/*/harness-audit/SKILL.md` is **byte-identical** to `skills/harness-audit/SKILL.md` (`cmp`), and `.opencode-version` is `0.0.0`.
  - Then append a marker line to `$S/site/opencode/harness-audit/SKILL.md`, bump `opencode/index.json` `version` to `0.0.1`, and run again. Expected: the cached `SKILL.md` contains the marker (`cmp` against the served file), and `.opencode-version` is `0.0.1`.
  - If OpenCode needs a signed-in provider to run, record that and check only the cache population.
- [ ] **Step 6: Record the results** in `apply.md` (the outcome of each check). The `trap` stops the server; `rm -rf "$S"`.

### Task 12: Merge, first release and dev-server rollout (owner-gated)

**Files:** outside the repo (`~/.claude/settings.json`, `~/.config/opencode/opencode.jsonc`), plus a README timing note.

- [ ] **Step 1: Owner.** Merge the PR (its title must pass the convention, e.g. `feat: publish skills via releases and Pages catalogs`). Then make `PR title / check` a required status check on `main`.
- [ ] **Step 1b: Check the PR-title gate on GitHub.** Open a throwaway PR titled `Update stuff`. Expected: `PR title / check` fails. Rename it to `docs: probe title check`. Expected: the check re-runs and passes. Close the PR without merging.
- [ ] **Step 2: Owner, or with the owner's OK.** Run Actions → Release on `main`. Expected:
  - tag `v0.1.0`, and a GitHub release with a Features section;
  - `curl -s https://raidenyn.github.io/agentic-development-skills/claude/marketplace.json` shows `"version": "0.1.0"` and `"ref": "v0.1.0"`;
  - `curl -s https://raidenyn.github.io/agentic-development-skills/opencode/index.json` shows `harness-audit` at `"version": "0.1.0"`.
- [ ] **Step 3: Ask the owner before editing the dev-server settings.** Then add the Claude `extraKnownMarketplaces` entry with `autoUpdate: true` and the `enabledPlugins` entry, and run `claude plugin marketplace update agentic-development-skills`. Add the OpenCode `skills` URL to `opencode.jsonc`. Expected: both tools list `harness-audit` at `0.1.0`.
- [ ] **Step 4: Release a patch.** Merge a `docs:` PR and run Release again. Expected: `v0.1.1`. Start a new Claude session, send one message, wait up to 10 minutes and `/reload-plugins`. Restart OpenCode. Both should show `0.1.1` without any manual update command. Then compare the content against the tag:
  - Claude's cached `SKILL.md` for the active plugin is identical to `git show v0.1.1:skills/harness-audit/SKILL.md`;
  - OpenCode's cached copy is identical to the same file.
- [ ] **Step 5: Record the timing you saw** in the README Install section, and commit with `docs: record observed auto-update timing`.
