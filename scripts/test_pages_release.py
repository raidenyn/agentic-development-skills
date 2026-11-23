#!/usr/bin/env python3
"""Tests for scripts/pages_release.py.

Run with: python3 -m unittest scripts/test_pages_release.py -v
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).parent))

import pages_release  # noqa: E402

# The fake executables print the tags and release tags the test hands them, so
# the CLI runs its real commands without touching GitHub or the network.
FAKE_GIT = '#!/bin/sh\ncat "$FAKE_TAGS"\n'
FAKE_GH = '#!/bin/sh\ncat "$FAKE_RELEASES"\n'


def git_env(extra: dict | None = None) -> dict:
    """Return an environment for the CLI, isolated from the developer's git config."""
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


class SelectReleaseTests(unittest.TestCase):
    """The tags main carries plus the published releases pick the deploy tag."""

    def test_seed_only_deploys_nothing(self):
        self.assertEqual(pages_release.select_release(["v0.0.0"], []), (None, None))

    def test_seed_and_first_release(self):
        self.assertEqual(
            pages_release.select_release(["v0.0.0", "v0.1.0"], ["v0.1.0"]),
            ("v0.1.0", None),
        )

    def test_unpublished_tag_on_main_is_an_orphan(self):
        tag, error = pages_release.select_release(["v0.0.0", "v0.1.0"], [])
        self.assertIsNone(tag)
        self.assertIsNotNone(error)
        self.assertIn("v0.1.0", error)

    def test_semver_order_not_list_order(self):
        self.assertEqual(
            pages_release.select_release(
                ["v0.9.0", "v0.10.0"], ["v0.10.0", "v0.9.0"]
            ),
            ("v0.10.0", None),
        )

    def test_ignores_prereleases_and_unparsable_tags(self):
        self.assertEqual(
            pages_release.select_release(
                ["v0.1.0", "v1.0.0-beta.1", "vfoo"],
                ["v0.1.0", "v1.0.0-beta.1"],
            ),
            ("v0.1.0", None),
        )

    def test_ignores_releases_from_off_main_tags(self):
        self.assertEqual(
            pages_release.select_release(["v0.1.0"], ["v0.1.0", "v0.2.0"]),
            ("v0.1.0", None),
        )


class CliTests(unittest.TestCase):
    """`python3 scripts/pages_release.py` with fake git and gh on PATH."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="pages-release-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        for name, script in (("git", FAKE_GIT), ("gh", FAKE_GH)):
            path = self.bin / name
            path.write_text(script, encoding="utf-8")
            path.chmod(0o755)
        self.output = self.tmp / "github-output"
        self.output.write_text("", encoding="utf-8")

    def run_cli(
        self, tags: list[str], releases: list[str]
    ) -> subprocess.CompletedProcess:
        tags_file = self.tmp / "tags"
        tags_file.write_text("".join(f"{tag}\n" for tag in tags), encoding="utf-8")
        releases_file = self.tmp / "releases"
        releases_file.write_text(
            "".join(f"{tag}\n" for tag in releases), encoding="utf-8"
        )
        env = git_env(
            {
                "PATH": f"{self.bin}{os.pathsep}{os.environ.get('PATH', '')}",
                "GITHUB_OUTPUT": str(self.output),
                "FAKE_TAGS": str(tags_file),
                "FAKE_RELEASES": str(releases_file),
            }
        )
        return subprocess.run(
            [sys.executable, "scripts/pages_release.py"],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
        )

    def test_writes_tag_and_version(self):
        result = self.run_cli(["v0.0.0", "v0.1.0"], ["v0.0.0", "v0.1.0"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.output.read_text(encoding="utf-8"), "tag=v0.1.0\nversion=0.1.0\n")

    def test_no_release_deploys_nothing(self):
        result = self.run_cli(["v0.0.0"], ["v0.0.0"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("no published release; nothing to deploy", result.stdout)
        self.assertEqual(self.output.read_text(encoding="utf-8"), "tag=\n")

    def test_orphan_fails_without_writing_tag(self):
        result = self.run_cli(["v0.0.0", "v0.1.0"], [])
        self.assertEqual(result.returncode, 1)
        self.assertIn("v0.1.0", result.stderr)
        self.assertIn("README", result.stderr)
        self.assertNotIn("tag=", self.output.read_text(encoding="utf-8"))

    def test_semver_beats_gh_creation_order(self):
        result = self.run_cli(
            ["v0.9.0", "v0.10.0"], ["v0.10.0", "v0.9.0"]
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.output.read_text(encoding="utf-8"), "tag=v0.10.0\nversion=0.10.0\n")


if __name__ == "__main__":
    unittest.main()
