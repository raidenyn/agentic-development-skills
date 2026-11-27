---
pointer: "Conventional Commits for commits and PR titles"
skills: ["openspec-apply-change"]
gates: ["\\bgit\\b[^;&|\\n]*?\\scommit\\b", "\\bgh\\s+pr\\s+(create|edit)\\b"]
---

Commits and PR titles follow Conventional Commits: `type(optional scope): summary`.

- Allowed types: `feat`, `fix`, `perf`, `docs`, `chore`, `ci`, `build`, `refactor`, `test`, `style`, `revert`.
- `feat` bumps the minor version; `!` after the type or a `BREAKING CHANGE:` line bumps the major version; anything else bumps the patch version.
- A PR title is at most 92 characters. GitHub squashes with the PR title as the commit subject, so the title picks the bump, and the parser matches `BREAKING CHANGE:` even inside a code fence.
