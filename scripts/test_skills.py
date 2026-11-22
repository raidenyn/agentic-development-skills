#!/usr/bin/env python3
"""Tests for scripts/skills.py.

Run with: python3 -m unittest scripts/test_skills.py -v
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).parent))

import skills  # noqa: E402

# Keep the TemporaryDirectory objects alive: their cleanup runs when the object
# is garbage collected, so dropping them early would delete the directory.
_TEMP_DIRS: list[tempfile.TemporaryDirectory] = []


def tmpdir() -> Path:
    """Return a fresh temporary directory that is removed when the test run ends."""
    tmp = tempfile.TemporaryDirectory()
    _TEMP_DIRS.append(tmp)
    return Path(tmp.name)


def git_env(extra: dict | None = None) -> dict:
    """Return an environment for git and skills.py subprocesses.

    CI runners and servers have no git identity, and a developer's global
    core.hooksPath or commit.gpgsign must not leak into the tests.
    """
    env = dict(os.environ)
    env.update(
        {
            "GIT_AUTHOR_NAME": "Test",
            "GIT_AUTHOR_EMAIL": "test@example.invalid",
            "GIT_COMMITTER_NAME": "Test",
            "GIT_COMMITTER_EMAIL": "test@example.invalid",
            "GIT_CONFIG_GLOBAL": "/dev/null",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_TERMINAL_PROMPT": "0",
        }
    )
    if extra:
        env.update(extra)
    return env


def run_git(
    *args: str, cwd: Path, env: dict | None = None, check: bool = True
) -> subprocess.CompletedProcess:
    """Run git in cwd with the test environment."""
    return subprocess.run(
        ["git", *args],
        cwd=cwd,
        env=git_env(env),
        capture_output=True,
        text=True,
        check=check,
    )


def make_repo(tmp: Path, skills: dict[str, dict[str, str]]) -> Path:
    """Write a minimal skills repository under tmp and return its root."""
    root = tmp / "repo"
    for name, files in skills.items():
        for filename, content in files.items():
            path = root / "skills" / name / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
    market = {
        "name": "test-marketplace",
        "owner": {"name": "Test"},
        "plugins": [
            {
                "name": name,
                "source": f"./skills/{name}",
                "description": f"{name} test skill.",
                "category": "development",
            }
            for name in sorted(skills)
        ],
    }
    plugin_dir = root / ".claude-plugin"
    plugin_dir.mkdir(parents=True, exist_ok=True)
    (plugin_dir / "marketplace.json").write_text(
        json.dumps(market, indent=2) + "\n", encoding="utf-8"
    )
    return root


class ValidateTest(unittest.TestCase):
    def test_validate_ok_on_fixture_repo(self):
        root = make_repo(
            tmpdir(),
            {
                "demo-skill": {
                    "SKILL.md": (
                        "---\nname: demo-skill\ndescription: Use when testing.\n---\n# Demo\n"
                    )
                }
            },
        )
        self.assertEqual(skills.validate(root), 0)


class ImportTest(unittest.TestCase):
    def test_module_imports_without_yaml(self):
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "import sys; sys.modules['yaml']=None; sys.path.insert(0,'scripts'); import skills",
            ],
            cwd=ROOT,
            env=git_env(),
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)


class CommitMsgTests(unittest.TestCase):
    """`check-commit-msg`: the header rule, file mode, title mode and the CLI."""

    # -- helpers ---------------------------------------------------------

    def check_title(self, title: str) -> str | None:
        return skills.check_commit_msg(title, "title")

    def check_file(self, text: str, comment_char: str = "#") -> str | None:
        return skills.check_commit_msg(text, "file", comment_char)

    def run_cli(
        self, *args: str, cwd: Path = ROOT, env: dict | None = None
    ) -> subprocess.CompletedProcess:
        """Run scripts/skills.py relative to cwd, so a copy is used when given."""
        return subprocess.run(
            [sys.executable, "scripts/skills.py", *args],
            cwd=cwd,
            env=git_env(env),
            capture_output=True,
            text=True,
        )

    def commit_repo(self, tmp: Path) -> tuple[Path, Path, Path]:
        """A repo with a capturing commit-msg hook and an editor that adds a header.

        Returns (repo, capture path, editor path). One file is staged, so a
        `git commit` with GIT_EDITOR writes the message.
        """
        repo = tmp / "repo"
        repo.mkdir()
        run_git("init", "-q", "-b", "main", cwd=repo)
        (repo / "a.txt").write_text("a\n", encoding="utf-8")
        run_git("add", "a.txt", cwd=repo)
        capture = tmp / "captured-msg"
        hook = repo / ".git" / "hooks" / "commit-msg"
        hook.write_text('#!/bin/sh\ncat "$1" > "$CAPTURE"\n', encoding="utf-8")
        hook.chmod(0o755)
        editor = tmp / "editor.sh"
        editor.write_text(
            '#!/bin/sh\n{ printf "feat: x\\n\\n"; cat "$1"; } > "$1.tmp"\nmv "$1.tmp" "$1"\n',
            encoding="utf-8",
        )
        editor.chmod(0o755)
        return repo, capture, editor

    def verbose_commit_message(self, *git_args: str) -> str:
        """Run `git commit -v` with git's own template and return the hook's file."""
        repo, capture, editor = self.commit_repo(tmpdir())
        result = run_git(
            *git_args,
            "commit",
            "-v",
            cwd=repo,
            env={"CAPTURE": str(capture), "GIT_EDITOR": str(editor)},
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(capture.is_file(), "the commit-msg hook did not run")
        return capture.read_text(encoding="utf-8")

    # -- title mode ------------------------------------------------------

    def test_title_mode_accepts_conventional_header(self):
        self.assertIsNone(self.check_title("feat(harness-audit): add sandbox checks"))

    def test_title_mode_rejects_plain_sentence(self):
        error = self.check_title("Added sandbox checks")
        self.assertIsNotNone(error)
        self.assertIn("invalid commit header: 'Added sandbox checks'", error)
        self.assertIn("feat: add sandbox checks", error)

    def test_title_mode_rejects_git_headers(self):
        # No pass-throughs in title mode, unlike file mode.
        for title in ("Merge branch 'feature'", "fixup! feat: x", 'Revert "feat: x"'):
            with self.subTest(title=title):
                self.assertIsNotNone(self.check_title(title))

    def test_title_mode_limits(self):
        at_limit = "feat: " + "a" * 86
        over_limit = "feat: " + "a" * 87
        self.assertEqual(len(at_limit), 92)
        self.assertEqual(len(over_limit), 93)
        self.assertIsNone(self.check_title(at_limit))
        error = self.check_title(over_limit)
        self.assertIn("header is 93 characters (max 92)", error)

    def test_title_via_shell_is_data(self):
        # The workflow runs exactly this line, with the PR title in $TITLE.
        tmp = tmpdir()
        script = tmp / "scripts" / "skills.py"
        script.parent.mkdir()
        title = "feat: $(touch pwned)"

        def run_workflow_line() -> subprocess.CompletedProcess:
            return subprocess.run(
                ["sh", "-c", 'python3 scripts/skills.py check-commit-msg --text="$TITLE"'],
                cwd=tmp,
                env=git_env({"TITLE": title}),
                capture_output=True,
                text=True,
            )

        # 1. The real checker: the title is data, so nothing runs and it's accepted.
        shutil.copyfile(ROOT / "scripts" / "skills.py", script)
        result = run_workflow_line()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((tmp / "pwned").exists(), "the title was executed as shell code")

        # 2. A recording checker, so the test can see the exact bytes argv received.
        script.write_text(
            "import sys\n"
            "values = [a for a in sys.argv[1:] if a.startswith('--text=')]\n"
            "assert len(values) == 1, sys.argv\n"
            "print(values[0][len('--text='):], end='')\n",
            encoding="utf-8",
        )
        result = run_workflow_line()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((tmp / "pwned").exists(), "the title was executed as shell code")
        self.assertEqual(result.stdout, title)

    def test_title_starting_with_dash_reaches_the_checker(self):
        result = self.run_cli("check-commit-msg", "--text=--help")
        self.assertEqual(result.returncode, 1)
        self.assertIn("invalid commit header: '--help'", result.stderr)

    def test_cli_runs_without_yaml(self):
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "import sys,runpy; sys.modules['yaml']=None; "
                "sys.argv=['skills.py','check-commit-msg','--text','feat: x']; "
                "runpy.run_path('scripts/skills.py', run_name='__main__')",
            ],
            cwd=ROOT,
            env=git_env(),
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    # -- file mode -------------------------------------------------------

    def test_file_mode_accepts_valid_message(self):
        self.assertIsNone(self.check_file("feat: x\n\n# comment\n"))

    def test_file_mode_accepts_git_and_autosquash_headers(self):
        messages = (
            "Merge branch 'b2'\n",
            'Revert "feat: x"\n\nThis reverts commit abc.\n',
            # git 2.53 writes this when you revert a revert.
            'Reapply "feat: x"\n\nThis reverts commit def.\n',
            "fixup! feat: x\n",
            "squash! feat: x\n",
            "amend! feat: x\n",
        )
        for message in messages:
            with self.subTest(message=message):
                self.assertIsNone(self.check_file(message))

    def test_file_mode_accepts_empty_message(self):
        # git aborts an empty message itself; the hook must not add noise.
        for message in ("", "\n\n", "# only comments\n"):
            with self.subTest(message=message):
                self.assertIsNone(self.check_file(message))

    def test_file_mode_accepts_crlf_and_leading_blank_lines(self):
        self.assertIsNone(self.check_file("\r\n\r\nfeat: x\r\n"))

    def test_file_mode_rejects_invalid_header(self):
        error = self.check_file("update stuff\n")
        self.assertEqual(
            error,
            "invalid commit header: 'update stuff'\n"
            "expected '<type>(<scope>)!: <subject>', e.g. 'feat: add sandbox checks'\n"
            "types: feat, fix, perf, docs, chore, ci, build, refactor, test, style, revert",
        )

    def test_unknown_mode_is_rejected(self):
        with self.assertRaises(ValueError):
            skills.check_commit_msg("feat: x", "body")

    def test_file_mode_limits(self):
        header = "feat: " + "a" * 95
        self.assertEqual(len(header), 101)
        self.assertIn("header is 101 characters (max 100)", self.check_file(header + "\n"))

    def test_file_mode_ignores_comments_with_custom_char(self):
        self.assertIsNone(self.check_file("feat: x\n\n; comment\n", ";"))

    def test_scissors_truncates(self):
        scissors = "# ------------------------ >8 ------------------------"
        # Below the scissors line, a diff can contain lines that aren't headers.
        self.assertIsNone(self.check_file(f"feat: x\n\n{scissors}\nnot a header\n"))
        # Above the header, the same text is the header and fails.
        self.assertIsNotNone(self.check_file("not a header\nfeat: x\n"))
        # With the scissors line first, only the cut keeps `not a header` out.
        self.assertIsNone(self.check_file(f"{scissors}\nnot a header\n"))

    # -- git config ------------------------------------------------------

    def test_git_comment_char(self):
        repo = tmpdir() / "repo"
        repo.mkdir()
        run_git("init", "-q", cwd=repo)
        self.assertEqual(skills.git_comment_char(repo), "#")
        run_git("config", "core.commentChar", ";", cwd=repo)
        self.assertEqual(skills.git_comment_char(repo), ";")
        run_git("config", "core.commentChar", "auto", cwd=repo)
        self.assertEqual(skills.git_comment_char(repo), "#")
        run_git("config", "core.commentChar", ";", cwd=repo)
        run_git("config", "core.commentString", "%", cwd=repo)
        self.assertEqual(skills.git_comment_char(repo), "%")
        run_git("config", "core.commentString", "auto", cwd=repo)
        self.assertEqual(skills.git_comment_char(repo), "#")

    # -- real git output -------------------------------------------------

    def test_real_verbose_commit_with_default_comment_char(self):
        message = self.verbose_commit_message()
        self.assertIn("# ------------------------ >8 ------------------------", message)
        self.assertIn("diff --git", message)
        self.assertIsNone(self.check_file(message))

    def test_real_verbose_commit_with_semicolon_comment_char(self):
        message = self.verbose_commit_message("-c", "core.commentChar=;")
        self.assertIn("; ------------------------ >8 ------------------------", message)
        self.assertIn("diff --git", message)
        self.assertIsNone(self.check_file(message, ";"))

    def test_real_merge_message(self):
        repo, capture, _ = self.commit_repo(tmpdir())
        run_git("commit", "-q", "-m", "feat: a", cwd=repo, env={"CAPTURE": str(capture)})
        run_git("checkout", "-q", "-b", "feature", cwd=repo)
        (repo / "b.txt").write_text("b\n", encoding="utf-8")
        run_git("add", "b.txt", cwd=repo)
        run_git("commit", "-q", "-m", "feat: b", cwd=repo, env={"CAPTURE": str(capture)})
        run_git("checkout", "-q", "main", cwd=repo)
        (repo / "c.txt").write_text("c\n", encoding="utf-8")
        run_git("add", "c.txt", cwd=repo)
        run_git("commit", "-q", "-m", "feat: c", cwd=repo, env={"CAPTURE": str(capture)})
        result = run_git(
            "merge", "--no-ff", "--no-edit", "feature",
            cwd=repo, env={"CAPTURE": str(capture)}, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        message = capture.read_text(encoding="utf-8")
        self.assertTrue(message.startswith("Merge branch 'feature'"), message)
        self.assertIsNone(self.check_file(message))

    # -- CLI -------------------------------------------------------------

    def test_cli_title_and_file_modes(self):
        ok = self.run_cli("check-commit-msg", "--text=feat(harness-audit): add sandbox checks")
        self.assertEqual(ok.returncode, 0, ok.stderr)
        self.assertEqual(ok.stderr, "")
        bad = self.run_cli("check-commit-msg", "--text=Added sandbox checks")
        self.assertEqual(bad.returncode, 1)
        self.assertIn("invalid commit header: 'Added sandbox checks'", bad.stderr)

        path = tmpdir() / "COMMIT_EDITMSG"
        path.write_text("feat: x\n\n# comment\n", encoding="utf-8")
        ok = self.run_cli("check-commit-msg", str(path))
        self.assertEqual(ok.returncode, 0, ok.stderr)
        self.assertEqual(ok.stdout, "")
        path.write_text("update stuff\n", encoding="utf-8")
        bad = self.run_cli("check-commit-msg", str(path))
        self.assertEqual(bad.returncode, 1)
        self.assertIn("invalid commit header: 'update stuff'", bad.stderr)

    def test_cli_requires_exactly_one_of_path_and_text(self):
        for args in ([], ["--text=feat: x", "some/path"]):
            with self.subTest(args=args):
                result = self.run_cli("check-commit-msg", *args)
                self.assertEqual(result.returncode, 1)
                self.assertIn("exactly one of PATH or --text", result.stderr)


class InstallHooksTests(unittest.TestCase):
    """`install-hooks` and the committed `commit-msg` hook."""

    # -- helpers ---------------------------------------------------------

    def make_hook_repo(self) -> Path:
        """A repo with skills.py and the hook committed, as a clone has them.

        The hook must be committed before a linked worktree is added: a
        worktree only contains committed files, so an uncommitted hook would
        be missing there and the worktree test could pass for the wrong reason.
        """
        repo = tmpdir() / "repo"
        repo.mkdir()
        run_git("init", "-q", "-b", "main", cwd=repo)
        (repo / "scripts").mkdir()
        shutil.copyfile(ROOT / "scripts" / "skills.py", repo / "scripts" / "skills.py")
        hook = repo / ".githooks" / "commit-msg"
        hook.parent.mkdir()
        shutil.copyfile(ROOT / ".githooks" / "commit-msg", hook)
        hook.chmod(0o755)
        run_git("add", ".", cwd=repo)
        run_git("commit", "-q", "--no-verify", "-m", "chore: fixture", cwd=repo)
        return repo

    def install(self, repo: Path, force: bool = False) -> tuple[int, str]:
        """Call install_hooks under the same isolated git environment as git itself."""
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, git_env()):
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = skills.install_hooks(repo, force=force)
        return code, out.getvalue() + err.getvalue()

    def run_cli(self, *args: str, cwd: Path) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, "scripts/skills.py", *args],
            cwd=cwd,
            env=git_env(),
            capture_output=True,
            text=True,
        )

    def hooks_path(self, repo: Path) -> str:
        return run_git("config", "core.hooksPath", cwd=repo).stdout.strip()

    # -- tests -----------------------------------------------------------

    def test_install_sets_hooks_path_and_is_idempotent(self):
        repo = self.make_hook_repo()
        code, output = self.install(repo)
        self.assertEqual(code, 0)
        self.assertIn("core.hooksPath set to .githooks", output)
        self.assertEqual(self.hooks_path(repo), ".githooks")

        code, output = self.install(repo)
        self.assertEqual(code, 0)
        self.assertIn("core.hooksPath already .githooks", output)
        self.assertEqual(self.hooks_path(repo), ".githooks")

    def test_hook_rejects_non_conventional_header(self):
        repo = self.make_hook_repo()
        self.assertEqual(self.install(repo)[0], 0)
        result = run_git(
            "commit", "--allow-empty", "-m", "update stuff", cwd=repo, check=False
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid commit header", result.stderr)

    def test_hook_accepts_conventional_header(self):
        repo = self.make_hook_repo()
        self.assertEqual(self.install(repo)[0], 0)
        result = run_git(
            "commit", "--allow-empty", "-m", "chore: ok", cwd=repo, check=False
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_hook_applies_in_linked_worktree(self):
        repo = self.make_hook_repo()
        self.assertEqual(self.install(repo)[0], 0)
        wt = repo.parent / "wt"
        run_git("worktree", "add", "-q", str(wt), cwd=repo)
        result = run_git(
            "commit", "--allow-empty", "-m", "update stuff", cwd=wt, check=False
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid commit header", result.stderr)

    def test_refuses_to_replace_another_hooks_path(self):
        repo = self.make_hook_repo()
        run_git("config", "core.hooksPath", "/somewhere/else", cwd=repo)

        refused = self.run_cli("install-hooks", cwd=repo)
        self.assertEqual(refused.returncode, 1)
        self.assertIn(
            "core.hooksPath is '/somewhere/else'; refusing to replace it (use --force)",
            refused.stderr,
        )
        self.assertEqual(self.hooks_path(repo), "/somewhere/else")

        forced = self.run_cli("install-hooks", "--force", cwd=repo)
        self.assertEqual(forced.returncode, 0, forced.stderr)
        self.assertIn("core.hooksPath set to .githooks", forced.stdout)
        self.assertEqual(self.hooks_path(repo), ".githooks")

    def test_not_a_checkout_is_reported_without_traceback(self):
        code, output = self.install(tmpdir())
        self.assertEqual(code, 1)
        self.assertIn("not a git checkout (or git not found)", output)
        self.assertNotIn("Traceback", output)

        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "skills.py"), "install-hooks"],
            cwd=tmpdir(),
            env=git_env(),
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("not a git checkout (or git not found)", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_cli_runs_without_yaml(self):
        repo = self.make_hook_repo()
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "import sys,runpy; sys.modules['yaml']=None; "
                "sys.argv=['skills.py','install-hooks']; "
                "runpy.run_path('scripts/skills.py', run_name='__main__')",
            ],
            cwd=repo,
            env=git_env(),
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("core.hooksPath set to .githooks", result.stdout)
        self.assertEqual(self.hooks_path(repo), ".githooks")


DEMO_SKILL_MD = """---
name: demo-skill
description: Use when testing build-pages.
---
# Demo
"""


class BuildPagesTests(unittest.TestCase):
    """`build-pages`: the OpenCode catalog, the copies and the consistency checks."""

    # -- helpers ---------------------------------------------------------

    def build(self, *args, **kwargs) -> tuple[int, str]:
        """Run build_pages, keeping its and validate's output out of the test log."""
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = skills.build_pages(*args, **kwargs)
        return code, out.getvalue() + err.getvalue()

    def demo_repo(self, extra: dict | None = None) -> Path:
        """A valid one-skill repo with SKILL.md and references/a.md."""
        files = {"SKILL.md": DEMO_SKILL_MD, "references/a.md": "reference\n"}
        files.update(extra or {})
        return make_repo(tmpdir(), {"demo-skill": files})

    def set_plugins(self, root: Path, plugins: list) -> None:
        path = root / ".claude-plugin" / "marketplace.json"
        market = json.loads(path.read_text(encoding="utf-8"))
        market["plugins"] = plugins
        path.write_text(json.dumps(market, indent=2) + "\n", encoding="utf-8")

    def out_dir(self) -> Path:
        """An output path that does not exist yet, next to nothing else."""
        return tmpdir() / "site"

    # -- the catalog -----------------------------------------------------

    def test_writes_opencode_catalog(self):
        root = self.demo_repo()
        out = self.out_dir()
        code, output = self.build("0.2.0", out, "o/r", root)
        self.assertEqual(code, 0, output)
        expected = {
            "skills": [
                {
                    "name": "demo-skill",
                    "version": "0.2.0",
                    "files": ["SKILL.md", "references/a.md"],
                }
            ]
        }
        index = out / "opencode" / "index.json"
        text = index.read_text(encoding="utf-8")
        self.assertEqual(json.loads(text), expected)
        # Stable bytes for git: two-space indent and a trailing newline.
        self.assertEqual(text, json.dumps(expected, indent=2) + "\n")

    def test_copies_files_byte_for_byte(self):
        root = self.demo_repo()
        out = self.out_dir()
        self.assertEqual(self.build("0.2.0", out, "o/r", root)[0], 0)
        for rel in ("SKILL.md", "references/a.md"):
            source = root / "skills" / "demo-skill" / rel
            copy = out / "opencode" / "demo-skill" / rel
            self.assertEqual(copy.read_bytes(), source.read_bytes(), rel)

    def test_skips_hidden_files_and_pycache(self):
        root = self.demo_repo({".hidden": "x\n", "__pycache__/x.pyc": "x\n"})
        out = self.out_dir()
        code, output = self.build("0.2.0", out, "o/r", root)
        self.assertEqual(code, 0, output)
        index = json.loads((out / "opencode" / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(index["skills"][0]["files"], ["SKILL.md", "references/a.md"])
        self.assertFalse((out / "opencode" / "demo-skill" / ".hidden").exists())
        self.assertFalse((out / "opencode" / "demo-skill" / "__pycache__").exists())

    def test_symlink_fails(self):
        root = self.demo_repo()
        (root / "skills" / "demo-skill" / "link.md").symlink_to("SKILL.md")
        code, output = self.build("0.2.0", self.out_dir(), "o/r", root)
        self.assertEqual(code, 1)
        self.assertIn("symlink", output)

    def test_hash_in_filename_fails_naming_the_file(self):
        # OpenCode silently drops a whole skill with such a file, so the build
        # must fail and name it.
        root = self.demo_repo({"a#b.md": "x\n"})
        code, output = self.build("0.2.0", self.out_dir(), "o/r", root)
        self.assertEqual(code, 1)
        self.assertIn("a#b.md", output)

    # -- consistency checks ----------------------------------------------

    def test_no_skills_fails(self):
        root = make_repo(tmpdir(), {})
        code, output = self.build("0.2.0", self.out_dir(), "o/r", root)
        self.assertEqual(code, 1)
        self.assertIn("no skills found", output)

    def test_unlisted_skill_fails_naming_it(self):
        root = self.demo_repo()
        self.set_plugins(root, [])
        code, output = self.build("0.2.0", self.out_dir(), "o/r", root)
        self.assertEqual(code, 1)
        self.assertIn("demo-skill", output)

    def test_entry_without_a_skill_folder_fails_naming_it(self):
        root = make_repo(tmpdir(), {})
        self.set_plugins(
            root,
            [{"name": "ghost-skill", "source": "./skills/ghost-skill", "description": "Ghost."}],
        )
        code, output = self.build("0.2.0", self.out_dir(), "o/r", root)
        self.assertEqual(code, 1)
        self.assertIn("ghost-skill", output)

    def test_skill_without_skill_md_fails_naming_it(self):
        root = make_repo(tmpdir(), {"demo-skill": {"references/a.md": "reference\n"}})
        code, output = self.build("0.2.0", self.out_dir(), "o/r", root)
        self.assertEqual(code, 1)
        self.assertIn("demo-skill", output)

    def test_existing_empty_out_is_used(self):
        root = self.demo_repo()
        out = self.out_dir()
        out.mkdir()
        code, output = self.build("0.2.0", out, "o/r", root)
        self.assertEqual(code, 0, output)
        self.assertTrue((out / "opencode" / "index.json").is_file())

    def test_output_directory_is_world_readable(self):
        # mkdtemp creates 0700. The Pages artifact needs other-read and
        # other-traverse, whether out is missing or already an empty directory.
        for label, precreate in (("missing", False), ("empty", True)):
            with self.subTest(out=label):
                root = self.demo_repo()
                out = self.out_dir()
                if precreate:
                    out.mkdir()
                code, output = self.build("0.2.0", out, "o/r", root)
                self.assertEqual(code, 0, output)
                self.assertEqual(out.stat().st_mode & 0o005, 0o005)

    def test_non_empty_out_fails(self):
        root = self.demo_repo()
        out = self.out_dir()
        out.mkdir()
        (out / "keep.txt").write_text("keep\n", encoding="utf-8")
        code, output = self.build("0.2.0", out, "o/r", root)
        self.assertEqual(code, 1)
        self.assertIn("not empty", output)
        self.assertEqual((out / "keep.txt").read_text(encoding="utf-8"), "keep\n")

    def test_non_directory_out_fails(self):
        # A file is neither missing nor an empty directory, so it is invalid.
        root = self.demo_repo()
        out = self.out_dir()
        out.write_text("a file\n", encoding="utf-8")
        code, output = self.build("0.2.0", out, "o/r", root)
        self.assertEqual(code, 1)
        self.assertIn("not empty", output)
        self.assertEqual(out.read_text(encoding="utf-8"), "a file\n")

    def test_invalid_version_fails(self):
        root = self.demo_repo()
        out = self.out_dir()
        code, output = self.build("1.2", out, "o/r", root)
        self.assertEqual(code, 1)
        self.assertIn("invalid version", output)
        self.assertFalse(out.exists())

    def test_failure_leaves_no_catalog(self):
        def add_symlink(skill: Path) -> None:
            (skill / "link.md").symlink_to("SKILL.md")

        def add_hash_file(skill: Path) -> None:
            (skill / "a#b.md").write_text("x\n", encoding="utf-8")

        for label, make_bad in (("symlink", add_symlink), ("hash", add_hash_file)):
            with self.subTest(case=label):
                root = self.demo_repo()
                make_bad(root / "skills" / "demo-skill")
                out = self.out_dir()
                code, output = self.build("0.2.0", out, "o/r", root)
                self.assertEqual(code, 1, output)
                self.assertFalse(out.exists(), "the failed build left an output directory")
                leftovers = sorted(
                    p.name for p in out.parent.iterdir() if p.name.startswith(".build-")
                )
                self.assertEqual(leftovers, [], "the failed build left a temporary directory")

    # -- CLI -------------------------------------------------------------

    def test_cli_builds_catalog(self):
        out = self.out_dir()
        result = subprocess.run(
            [
                sys.executable,
                "scripts/skills.py",
                "build-pages",
                "--version",
                "0.1.0",
                "--out",
                str(out),
            ],
            cwd=ROOT,
            env=git_env({"GITHUB_REPOSITORY": "o/r"}),
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        index = json.loads((out / "opencode" / "index.json").read_text(encoding="utf-8"))
        names = [entry["name"] for entry in index["skills"]]
        self.assertIn("harness-audit", names)
        harness = index["skills"][names.index("harness-audit")]
        self.assertEqual(harness["version"], "0.1.0")
        copied = out / "opencode" / "harness-audit" / "SKILL.md"
        installed = ROOT / "skills" / "harness-audit" / "SKILL.md"
        self.assertEqual(copied.read_bytes(), installed.read_bytes())


if __name__ == "__main__":
    unittest.main()
