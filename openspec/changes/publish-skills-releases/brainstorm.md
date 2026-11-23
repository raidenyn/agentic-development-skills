## Design Summary

Publish the skills publicly and let Claude Code and OpenCode update on their own from release-only catalogs hosted on GitHub Pages. The owner runs the release by hand ("Run workflow" on `main`). semantic-release does the following:

1. reads the Conventional Commits since the last `v*` tag;
2. picks the semver bump;
3. generates grouped release notes;
4. tags the current commit;
5. publishes a GitHub release.

Before the tag is created, `scripts/skills.py build-pages` runs once as a check, and its output is thrown away. The catalogs that get published are rebuilt from the release tag by the Pages job. There are two:

- `opencode/index.json` plus the skill files, which the OpenCode URL skill source reads;
- `claude/marketplace.json`, where every plugin carries the release version and a `git-subdir` source pinned to the tag.

A second job deploys Pages from the latest *published GitHub release*. Tags without a release are ignored, and a newer orphan tag makes the job fail. Nothing is committed back to `main`. The README drops the private-repo note and documents installing with auto-update and how to release. The dev server becomes the reference install for both tools. The full design is in `design.md`.

## Alternatives Considered

### Alternative A: Our own Python release script in `scripts/skills.py`
- **Approach**: `release` and `build-pages` commands compute the bump from commits, write the notes, and the workflow tags, releases and deploys with `gh` and the Pages actions.
- **Pros**: no new dependencies; the same rules run locally and in CI; full control over the notes format.
- **Cons**: about 200 lines of release logic to own and test, re-implementing what existing tools already do.
- **Why not chosen**: the owner preferred a mature, widely used release tool over owning the version and notes logic.

### Alternative B: semantic-release plus a small catalog builder (chosen)
- **Approach**: semantic-release with the `conventionalcommits` preset handles the bump, notes, tag and GitHub release. `@semantic-release/exec` runs `validate` and `build-pages` before tagging, and a separate job deploys Pages.
- **Pros**: proven bump and notes logic; dry-run preview; standard Conventional Commits behaviour; tags only after the catalogs build.
- **Cons**: a pinned Node toolchain in a Python repo; the catalog builder is still custom code; custom notes go through preset configuration.

### Alternative C: Marketplace actions (tag action plus `action-gh-release`) plus a small script
- **Approach**: third-party actions compute the version, push the tag and create the release, and a script builds the catalogs.
- **Pros**: the least code.
- **Cons**: the bump rules live in third-party actions and can't be previewed locally; the logic is spread across workflow steps.
- **Why not chosen**: hard to answer "what will the next version be?" before releasing.

release-please was ruled out because its release-PR model commits back to `main`.

## Agreed Approach

Alternative B, chosen by the owner. semantic-release owns the version and the release; `skills.py build-pages` owns the catalog format. The Pages deploy is decoupled and always rebuilds from the latest published GitHub release, so a failed deploy can be fixed by starting a new workflow run, with no new release needed. An independent review (GPT-6.2 Sol) checked the tool behaviour and led to these changes: picking the version from releases, not tags; explicit bump rules; Node and semantic-release pins; HTTPS git URLs; a strict title mode; and an explicit hook install.

## Key Decisions

- **Public repo with GitHub Pages hosting** (owner).
- **Manual `workflow_dispatch` on `main` only** (owner). No releases on merge.
- **Conventional Commits decide the bump** (owner): breaking changes give a major bump, `feat` a minor bump, and everything else a patch bump. This is set as explicit `releaseRules` (breaking, then feat, then a catch-all patch) and covered by Node tests. No commits means no release.
- **semantic-release** (owner).
- **README**: remove the private-repo note and rewrite the install section (owner).
- **OpenCode reads an HTTP catalog** (owner). It uses the built-in `skills` URL source, which needs a `version` on every entry to update.
- One version for the whole repo, tag format `vX.Y.Z` (my call).
- Start at 0.x: seed tag `v0.0.0` (my call; pushed on `9dbab5b` with the owner's OK). The repo is public, Pages is set to Actions, and squash-only with the PR title and body is configured (owner, already done).
- **A Conventional Commits check before every local commit** (owner): a `.githooks/commit-msg` hook, turned on explicitly with `scripts/skills.py install-hooks`, which refuses to replace another `core.hooksPath`. It covers both humans and agents (my call on how).
- PR titles checked in CI with the same checker in strict title mode, through `pull_request_target` running the base branch's checker (my call; the shared checker replaces a third-party action).
- The Claude catalog on Pages uses `git-subdir` sources with a full HTTPS git URL pinned to the tag. The committed marketplace keeps relative sources and no versions (my call).
- No commit-back: no `@semantic-release/git` and no CHANGELOG file (my call).
- The Pages job builds from the latest published GitHub release, not from the run's output or the newest tag (my call, after review).
- The dev server is set up as the reference install after the first release, with the owner's go-ahead (from the request).

## Open Questions

- The update timing each tool documents (Claude: after a session's first message, loaded on reload or relaunch; OpenCode: at startup or config reload) still has to be seen end to end during the dev-server rollout. OpenCode loading a URL catalog hasn't been tested yet.

Resolved by the second review (Opus, high effort): in an isolated HOME, Claude Code 2.1.330 installed a `git-subdir` plugin containing only `SKILL.md` from the `v0.0.0` tag ("Skills (1) harness-audit"), and updated it when the catalog `version` was bumped.
