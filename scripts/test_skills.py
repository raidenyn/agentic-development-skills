#!/usr/bin/env python3
"""Tests for scripts/skills.py.

Run with: python3 -m unittest scripts/test_skills.py -v
"""
from __future__ import annotations

import json
import os
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


if __name__ == "__main__":
    unittest.main()
