#!/usr/bin/env python3
"""Validate and scaffold skills in this repository.

Usage:
    python3 scripts/skills.py validate
    python3 scripts/skills.py new <skill-name> "<description>" [--category CATEGORY]
    python3 scripts/skills.py check-commit-msg [PATH] [--text TITLE]
    python3 scripts/skills.py install-hooks [--force]
    python3 scripts/skills.py build-pages --version X.Y.Z --out DIR

`validate` checks every skills/<name>/SKILL.md against the Agent Skills spec
(https://agentskills.io/specification) and checks that
.claude-plugin/marketplace.json lists exactly one plugin entry per skill.

`new` copies template/SKILL.md into skills/<name>/ and adds the matching
marketplace entry.

`build-pages` validates the repository, then writes the static catalogs for a
release into DIR: opencode/index.json plus a byte-for-byte copy of every skill
file under DIR/opencode/<name>/. It builds into a temporary directory and
renames it into place at the end, so a failed build leaves no partial catalog.

`check-commit-msg` checks a git commit message file (file mode, used by the
commit-msg hook) or a PR title (title mode) against the Conventional Commits
header rule.

`install-hooks` points this checkout's `core.hooksPath` at the committed
`.githooks` directory, so the commit-msg hook runs. It is safe to run again
and refuses to replace a different value unless `--force` is given.

Requires Python 3.9+ and, for `validate`, `new` and `build-pages`, PyYAML
(`pip install -r requirements-dev.txt`). The YAML import is lazy, so other
subcommands, `check-commit-msg` and `install-hooks` included, run without it.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

_yaml: types.ModuleType | None = None  # imported by load_yaml() on first use


def load_yaml() -> types.ModuleType:
    """Import PyYAML on first use, or exit with an install hint."""
    global _yaml
    if _yaml is None:
        try:
            import yaml
        except ImportError:  # pragma: no cover
            sys.exit("PyYAML is required: pip install -r requirements-dev.txt")
        _yaml = yaml
    return _yaml

NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
VERSION_RE = re.compile(r"\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?")
DEFAULT_SLUG = "raidenyn/agentic-development-skills"
# Keys from the open Agent Skills spec. These are the only keys claude.ai and
# the Skills API accept, so anything else is reported as a portability warning.
SPEC_KEYS = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}
RESERVED_PREFIXES = ("claude-", "anthropic-", "anthropics-", "cc-plugin-")
RESERVED_NAMES = {"claude", "anthropic", "anthropics", "claude-code", "claude-mods"}
MAX_SKILL_LINES = 500

HEADER_RE = re.compile(
    r"^(feat|fix|perf|docs|chore|ci|build|refactor|test|style|revert)"
    r"(\([a-z0-9-]+\))?!?: \S.*"
)
# GitHub appends " (#N)" when it squashes, so a local header gets the larger budget.
HEADER_LIMIT = 100
TITLE_LIMIT = 92
COMMIT_TYPES = "feat, fix, perf, docs, chore, ci, build, refactor, test, style, revert"
# Headers git writes itself, and the autosquash prefixes git rebases later.
COMMIT_PASS_PREFIXES = (
    "Merge ",
    'Revert "',
    'Reapply "',
    "fixup! ",
    "squash! ",
    "amend! ",
)
SCISSORS_TAIL = " ------------------------ >8 ------------------------"


def read_frontmatter(path: Path) -> tuple[dict | None, str, str | None]:
    yaml = load_yaml()
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return None, text, "SKILL.md must start with a '---' YAML frontmatter block"
    end = text.find("\n---", 4)
    if end == -1:
        return None, text, "frontmatter block is not closed with '---'"
    try:
        data = yaml.safe_load(text[4:end]) or {}
    except yaml.YAMLError as exc:
        return None, text, f"frontmatter is not valid YAML: {exc}"
    if not isinstance(data, dict):
        return None, text, "frontmatter must be a YAML mapping"
    return data, text, None


def check_name(name: object, where: str, errors: list[str]) -> None:
    if not isinstance(name, str) or not name:
        errors.append(f"{where}: name is required")
        return
    if len(name) > 64:
        errors.append(f"{where}: name '{name}' is longer than 64 characters")
    if not NAME_RE.match(name):
        errors.append(
            f"{where}: name '{name}' must be lowercase a-z, 0-9 and single hyphens, "
            "with no leading or trailing hyphen"
        )
    if name in RESERVED_NAMES or name.startswith(RESERVED_PREFIXES):
        errors.append(f"{where}: name '{name}' is reserved by Claude Code for plugins")


def validate(root: Path = ROOT) -> int:
    errors: list[str] = []
    warnings: list[str] = []

    skills_dir = root / "skills"
    marketplace_path = root / ".claude-plugin" / "marketplace.json"
    skills_rel = skills_dir.relative_to(root)
    market_rel = marketplace_path.relative_to(root)

    skill_dirs = sorted(p for p in skills_dir.iterdir() if p.is_dir()) if skills_dir.is_dir() else []
    skill_names = set()
    for d in skill_dirs:
        rel = d.relative_to(root)
        skill_md = d / "SKILL.md"
        if not skill_md.is_file():
            errors.append(f"{rel}: missing SKILL.md")
            continue
        fm, text, err = read_frontmatter(skill_md)
        if err:
            errors.append(f"{rel}/SKILL.md: {err}")
            continue
        skill_names.add(d.name)
        where = f"{rel}/SKILL.md"
        check_name(fm.get("name"), where, errors)
        if fm.get("name") != d.name:
            errors.append(f"{where}: name '{fm.get('name')}' must match its directory '{d.name}'")
        desc = fm.get("description")
        if not isinstance(desc, str) or not desc.strip():
            errors.append(f"{where}: description is required")
        else:
            if len(desc) > 1024:
                errors.append(f"{where}: description is {len(desc)} characters (max 1024)")
            if "<" in desc or ">" in desc:
                errors.append(f"{where}: description must not contain '<' or '>'")
        meta = fm.get("metadata")
        if meta is not None and (
            not isinstance(meta, dict) or not all(isinstance(v, str) for v in meta.values())
        ):
            errors.append(f"{where}: metadata must be a map of string values (quote numbers)")
        extra = sorted(set(fm) - SPEC_KEYS)
        if extra:
            warnings.append(
                f"{where}: non-spec keys {extra} work in Claude Code but are rejected by "
                "claude.ai and the Skills API"
            )
        lines = text.count("\n") + 1
        if lines > MAX_SKILL_LINES:
            warnings.append(
                f"{where}: {lines} lines; consider moving detail into references/ "
                f"(guideline is under {MAX_SKILL_LINES})"
            )

    # Marketplace consistency.
    try:
        market = json.loads(marketplace_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"{market_rel}: cannot read: {exc}")
        market = {"plugins": []}
    entries = market.get("plugins", [])
    seen: dict[str, int] = {}
    for i, entry in enumerate(entries):
        name = entry.get("name")
        where = f"{market_rel} plugins[{i}]"
        check_name(name, where, errors)
        seen[name] = seen.get(name, 0) + 1
        expected = f"./skills/{name}"
        if entry.get("source") != expected:
            errors.append(f"{where}: source must be '{expected}', found '{entry.get('source')}'")
        if name not in skill_names:
            errors.append(f"{where}: no skill directory {skills_rel}/{name}/")
        if not entry.get("description"):
            errors.append(f"{where}: description is required")
    for name, count in seen.items():
        if count > 1:
            errors.append(f"{market_rel}: plugin '{name}' is listed {count} times")
    for name in sorted(skill_names - set(seen)):
        errors.append(
            f"{skills_rel}/{name}/: not listed in {market_rel} "
            "(add an entry, or create skills with: python3 scripts/skills.py new)"
        )

    for w in warnings:
        print(f"warning: {w}")
    for e in errors:
        print(f"error: {e}")
    print(f"{len(skill_names)} skill(s), {len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


def new(name: str, description: str, category: str, root: Path = ROOT) -> int:
    errors: list[str] = []
    check_name(name, "name", errors)
    if len(description) > 1024 or "<" in description or ">" in description:
        errors.append("description must be at most 1024 characters with no '<' or '>'")
    skills_dir = root / "skills"
    template = root / "template" / "SKILL.md"
    marketplace_path = root / ".claude-plugin" / "marketplace.json"
    target = skills_dir / name
    if target.exists():
        errors.append(f"{target.relative_to(root)} already exists")
    if errors:
        for e in errors:
            print(f"error: {e}")
        return 1

    body = template.read_text(encoding="utf-8")
    body = body.replace("{{name}}", name).replace("{{description}}", json.dumps(description))
    target.mkdir(parents=True)
    skill_md = target / "SKILL.md"
    skill_md.write_text(body, encoding="utf-8")

    market = json.loads(marketplace_path.read_text(encoding="utf-8"))
    market.setdefault("plugins", []).append(
        {
            "name": name,
            "source": f"./skills/{name}",
            "description": description,
            "category": category,
        }
    )
    market["plugins"].sort(key=lambda p: p["name"])
    marketplace_path.write_text(
        json.dumps(market, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        f"Created {skill_md.relative_to(root)} and added it to "
        f"{marketplace_path.relative_to(root)}"
    )
    return 0


class BuildError(Exception):
    """A skill that cannot be published to the static catalogs."""


# OpenCode silently drops a whole skill when a file name contains one of these.
UNSAFE_PATH_CHARS = "?#\\\0"


def check_publish_path(rel: str) -> None:
    """Raise BuildError unless rel is a relative path OpenCode accepts."""
    for part in rel.split("/"):
        if part in ("", ".", ".."):
            raise BuildError(f"{rel}: path segment {part!r} is not allowed")
        for char in UNSAFE_PATH_CHARS:
            if char in part:
                raise BuildError(f"{rel}: {char!r} is not allowed in a published path")


def skill_files(skill_dir: Path) -> list[str]:
    """Return every publishable file under skill_dir, as sorted POSIX relative paths.

    Hidden files and directories and __pycache__ are skipped. A symlink, or a
    path OpenCode refuses, raises BuildError instead of being published.
    """
    if skill_dir.is_symlink():
        raise BuildError(f"{skill_dir}: symlinks are not allowed in a published skill")
    files: list[str] = []
    for dirpath, dirnames, filenames in os.walk(skill_dir, followlinks=False):
        here = Path(dirpath)
        for name in dirnames + filenames:
            if (here / name).is_symlink():
                raise BuildError(f"{here / name}: symlinks are not allowed in a published skill")
        dirnames[:] = sorted(
            name for name in dirnames if not name.startswith(".") and name != "__pycache__"
        )
        for name in filenames:
            if name.startswith("."):
                continue
            rel = (here / name).relative_to(skill_dir).as_posix()
            check_publish_path(f"{skill_dir.name}/{rel}")
            files.append(rel)
    return sorted(files)


def build_pages(version: str, out: Path, slug: str, root: Path = ROOT) -> int:
    """Build the static catalogs for a release into out, returning an exit code.

    slug is the GitHub 'owner/repo' slug for the release.
    """
    if not VERSION_RE.fullmatch(version):
        print(f"error: invalid version '{version}' (expected X.Y.Z)", file=sys.stderr)
        return 1
    if out.exists() and (not out.is_dir() or any(out.iterdir())):
        print(f"error: output directory not empty: {out}", file=sys.stderr)
        return 1
    if validate(root) != 0:
        return 1

    skills_dir = root / "skills"
    skill_dirs = (
        sorted((p for p in skills_dir.iterdir() if p.is_dir()), key=lambda p: p.name)
        if skills_dir.is_dir()
        else []
    )
    if not skill_dirs:
        print("error: no skills found", file=sys.stderr)
        return 1
    # Checks 5 and 6 (every skill folder has a marketplace entry, every entry has
    # a skill folder, and every skill has SKILL.md) are enforced by validate()
    # above, which names the skill and fails before this point; repeating them
    # here would be untested duplicate code.

    try:
        files_by_skill = [(d, skill_files(d)) for d in skill_dirs]
    except BuildError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    try:
        temp = Path(tempfile.mkdtemp(prefix=".build-", dir=out.parent))
    except OSError as exc:
        print(f"error: cannot create a build directory in {out.parent}: {exc}", file=sys.stderr)
        return 1
    try:
        opencode = temp / "opencode"
        catalog = []
        for skill_dir, files in files_by_skill:
            for rel in files:
                target = opencode / skill_dir.name / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(skill_dir / rel, target)
            catalog.append({"name": skill_dir.name, "version": version, "files": files})
        opencode.mkdir(parents=True, exist_ok=True)
        (opencode / "index.json").write_text(
            json.dumps({"skills": catalog}, indent=2) + "\n", encoding="utf-8"
        )
        # mkdtemp creates 0700; the Pages artifact must be readable and
        # traversable by others, so do not leave out at the temporary mode.
        os.chmod(temp, 0o755)
        os.replace(temp, out)
    except OSError as exc:
        shutil.rmtree(temp, ignore_errors=True)
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


def check_header(header: str, limit: int) -> str | None:
    """Check one commit header or PR title, returning an error message or None."""
    if len(header) > limit:
        return f"header is {len(header)} characters (max {limit})"
    if not HEADER_RE.match(header):
        return (
            f"invalid commit header: '{header}'\n"
            "expected '<type>(<scope>)!: <subject>', e.g. 'feat: add sandbox checks'\n"
            f"types: {COMMIT_TYPES}"
        )
    return None


def check_commit_msg(text: str, mode: str, comment_char: str = "#") -> str | None:
    """Check a commit message file (`file`) or a PR title (`title`).

    File mode normalises CRLF, cuts everything from git's scissors line, drops
    comment lines, and passes headers git wrote itself. Title mode is strict.
    """
    if mode == "title":
        return check_header(text.rstrip("\n"), TITLE_LIMIT)
    if mode != "file":
        raise ValueError(f"unknown mode: {mode!r}")

    scissors = comment_char + SCISSORS_TAIL
    lines = text.replace("\r\n", "\n").split("\n")
    for i, line in enumerate(lines):
        if line == scissors:
            lines = lines[:i]
            break
    header = next(
        (line for line in lines if line.strip() and not line.startswith(comment_char)), None
    )
    if header is None:
        # git aborts an empty message itself; the hook says nothing.
        return None
    if header.startswith(COMMIT_PASS_PREFIXES):
        return None
    return check_header(header, HEADER_LIMIT)


def git_comment_char(cwd: Path) -> str:
    """Return the comment character git will use for a commit message in cwd."""
    for key in ("core.commentString", "core.commentChar"):
        try:
            result = subprocess.run(
                ["git", "config", "--get", key], cwd=cwd, capture_output=True, text=True
            )
        except OSError:  # git is not installed; the default still applies
            return "#"
        if result.returncode != 0:
            continue
        value = result.stdout.strip()
        # `auto` means git picks a character itself; the hook can't know which.
        return value if value and value != "auto" else "#"
    return "#"


def check_commit_msg_cli(path: str | None, text: str | None) -> int:
    """Run `check-commit-msg`; exactly one of path and text must be given."""
    if (path is None) == (text is None):
        print("error: pass exactly one of PATH or --text", file=sys.stderr)
        return 1
    if text is not None:
        error = check_commit_msg(text, "title")
    else:
        try:
            message = Path(path).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            print(f"error: cannot read {path}: {exc}", file=sys.stderr)
            return 1
        error = check_commit_msg(message, "file", git_comment_char(Path.cwd()))
    if error:
        print(error, file=sys.stderr)
        return 1
    return 0


NOT_A_CHECKOUT = "not a git checkout (or git not found)"


def git_toplevel(cwd: Path) -> Path | None:
    """Return the working-tree root containing cwd, or None outside a checkout."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=cwd,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return None
    if result.returncode != 0:
        return None
    root = result.stdout.strip()
    return Path(root) if root else None


def install_hooks(repo: Path, force: bool) -> int:
    """Point repo's core.hooksPath at .githooks, refusing another value."""
    try:
        current = subprocess.run(
            ["git", "config", "--get", "core.hooksPath"],
            cwd=repo,
            capture_output=True,
            text=True,
        )
        # `--get` exits 1 when the key is absent; anything else is a git error
        # (a directory outside a checkout makes the later write fail instead).
        if current.returncode not in (0, 1):
            raise subprocess.CalledProcessError(current.returncode, current.args)
        value = current.stdout.strip() if current.returncode == 0 else None
        if value == ".githooks":
            print("core.hooksPath already .githooks")
            return 0
        if value and not force:
            print(
                f"core.hooksPath is '{value}'; refusing to replace it (use --force)",
                file=sys.stderr,
            )
            return 1
        subprocess.run(
            ["git", "config", "core.hooksPath", ".githooks"],
            cwd=repo,
            capture_output=True,
            text=True,
            check=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        print(NOT_A_CHECKOUT, file=sys.stderr)
        return 1
    print("core.hooksPath set to .githooks")
    return 0


def install_hooks_cli(force: bool) -> int:
    """Run `install-hooks` against the checkout that contains the current directory."""
    root = git_toplevel(Path.cwd())
    if root is None:
        print(NOT_A_CHECKOUT, file=sys.stderr)
        return 1
    return install_hooks(root, force)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("validate", help="validate all skills and the marketplace manifest")
    p_new = sub.add_parser("new", help="scaffold a new skill")
    p_new.add_argument("name")
    p_new.add_argument("description")
    p_new.add_argument("--category", default="development")
    p_cm = sub.add_parser("check-commit-msg", help="check a commit message or PR title")
    p_cm.add_argument("path", nargs="?", help="commit message file (file mode)")
    p_cm.add_argument("--text", metavar="TITLE", help="PR title to check (title mode)")
    p_install = sub.add_parser("install-hooks", help="point core.hooksPath at .githooks")
    p_install.add_argument(
        "--force", action="store_true", help="replace a different core.hooksPath"
    )
    p_build = sub.add_parser("build-pages", help="build the static release catalogs")
    p_build.add_argument("--version", required=True, metavar="X.Y.Z")
    p_build.add_argument("--out", required=True, type=Path, metavar="DIR")
    args = parser.parse_args()
    if args.cmd == "validate":
        return validate()
    if args.cmd == "check-commit-msg":
        return check_commit_msg_cli(args.path, args.text)
    if args.cmd == "install-hooks":
        return install_hooks_cli(args.force)
    if args.cmd == "build-pages":
        slug = os.environ.get("GITHUB_REPOSITORY", DEFAULT_SLUG)
        return build_pages(args.version, args.out, slug)
    return new(args.name, args.description, args.category)


if __name__ == "__main__":
    sys.exit(main())
