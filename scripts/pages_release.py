#!/usr/bin/env python3
"""Choose the published release that GitHub Pages deploys.

Usage:
    python3 scripts/pages_release.py

The release workflow runs this after semantic-release. It re-derives the tag
from GitHub on every run instead of reading the `release` job's outputs, so a
re-run with Pages failed still deploys the newest published release.

The choice is, in order:
  1. the orphan check: the highest stable tag merged into `origin/main`
     (ignoring the seed tag `v0.0.0`) must have a published GitHub release,
     because semantic-release pushes the tag before it creates the release;
  2. otherwise the highest semver tag that is both on `origin/main` and
     published. `gh release list` sorts by creation date, so the tags are
     sorted by semver here.

Writes `tag=<tag>` and `version=<tag without v>` to `$GITHUB_OUTPUT`, or
`tag=` when no release is published yet. An orphan tag exits 1 and writes
nothing, so the Pages job leaves the previous deployment in place.

Requires Python 3.9+ and only the standard library.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys

STABLE_RE = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")


def select_release(
    tags_on_main: list[str], published: list[str]
) -> tuple[str | None, str | None]:
    """Return (tag_to_deploy, orphan_error) for the tags on main and the releases."""

    def _key(t):
        return tuple(int(x) for x in STABLE_RE.match(t).groups())

    stable = sorted(
        {t for t in tags_on_main if STABLE_RE.match(t) and t != "v0.0.0"}, key=_key
    )
    pub = {t for t in published if STABLE_RE.match(t)}
    if stable and stable[-1] not in pub:
        return None, f"tag {stable[-1]} on main has no published GitHub release"
    candidates = [t for t in stable if t in pub]
    return (candidates[-1] if candidates else None), None


def _lines(command: list[str]) -> list[str]:
    """Run command and return its non-empty output lines."""
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    return [line for line in result.stdout.splitlines() if line]


def main() -> int:
    tags_on_main = _lines(["git", "tag", "--merged", "origin/main", "--list", "v*"])
    published = _lines(
        [
            "gh",
            "release",
            "list",
            "--exclude-drafts",
            "--exclude-pre-releases",
            "--limit",
            "1000",
            "--json",
            "tagName",
            "-q",
            ".[].tagName",
        ]
    )
    tag, error = select_release(tags_on_main, published)
    if error:
        print(error, file=sys.stderr)
        print("See README → Releasing → Recovery", file=sys.stderr)
        return 1
    if tag is None:
        print("no published release; nothing to deploy")
        lines = ["tag="]
    else:
        lines = [f"tag={tag}", f"version={tag[1:]}"]
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
