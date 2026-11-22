#!/usr/bin/env python3
"""Tests for scripts/skills.py.

Run with: python3 -m unittest scripts/test_skills.py -v
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

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


if __name__ == "__main__":
    unittest.main()
