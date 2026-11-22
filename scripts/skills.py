#!/usr/bin/env python3
"""Validate and scaffold skills in this repository.

Usage:
    python3 scripts/skills.py validate
    python3 scripts/skills.py new <skill-name> "<description>" [--category CATEGORY]

`validate` checks every skills/<name>/SKILL.md against the Agent Skills spec
(https://agentskills.io/specification) and checks that
.claude-plugin/marketplace.json lists exactly one plugin entry per skill.

`new` copies template/SKILL.md into skills/<name>/ and adds the matching
marketplace entry.

Requires Python 3.9+ and, for `validate` and `new`, PyYAML
(`pip install -r requirements-dev.txt`). The YAML import is lazy, so other
subcommands run without it.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
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
# Keys from the open Agent Skills spec. These are the only keys claude.ai and
# the Skills API accept, so anything else is reported as a portability warning.
SPEC_KEYS = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}
RESERVED_PREFIXES = ("claude-", "anthropic-", "anthropics-", "cc-plugin-")
RESERVED_NAMES = {"claude", "anthropic", "anthropics", "claude-code", "claude-mods"}
MAX_SKILL_LINES = 500


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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("validate", help="validate all skills and the marketplace manifest")
    p_new = sub.add_parser("new", help="scaffold a new skill")
    p_new.add_argument("name")
    p_new.add_argument("description")
    p_new.add_argument("--category", default="development")
    args = parser.parse_args()
    if args.cmd == "validate":
        return validate()
    return new(args.name, args.description, args.category)


if __name__ == "__main__":
    sys.exit(main())
