## Design Summary

Input: task `unattended-task-runs/m1-loop/1`, issue raidenyn/agentic-development-skills#33, under the accepted RFC
`openspec/design/archive/2026-11-unattended-task-runs/rfc-run-board-tasks-unattended.md` (Onboarding, Settings, Run record).

A new skill `project-conductor` is added to this repository with one procedure, "Onboard a board". It is
written instructions plus a reference file of `gh` commands, in the shape of `skills/task-publishing`. No
code is added beyond the marketplace entry and the README row. Later tasks of milestone M1 add the loop
itself to the same skill.

Run against a GitHub Project board and the one repository it serves, the procedure leaves them ready for
the loop:

1. The repository variable `PROJECT_URL` holds the board's URL, or the report holds the exact command for
   the owner when the agent account is not an admin.
2. The board has the fields "Run phase" (single select: plan, implement, closeout, care), "Attempt"
   (number) and "Run thread" (text); fields that exist are reused.
3. `.agents/harness.json` holds the `project-conductor` key (maxParallel 2, reviewRounds 5,
   reconcileMinutes 30, maxAttempts 2); no other key is touched and the file is created when absent.
4. `.agents/hooked-rules/repo-run-models.md` names the model per role (plan, review, implement). Where
   `repo-review-models.md` exists it is replaced and its reviewer presets are kept.
5. Every open issue on the board carries a task key, or is reported.
6. The default branch's approval rule is checked and reported.
7. The webhook step is listed as "pending", owned by the later task "Repair claims, settle merged work and
   wake on events".

Every run first surveys without writing and shows a plan of what it will create, reuse and cannot do. A
dry run stops there. Otherwise the person agrees to the plan, unless they waived the wait. The run ends
with a report in five lists: created, changed, reused, pending, and could not do (with the owner's exact
step). A second run finds everything in place and says that nothing changed.

Observed on main (2026-11-25): the scratch board `raidenyn-shadow` project 5 already has the three run
fields from the RFC's spike; no scratch repository exists yet; `raidenyn/line-mcp` has no `.agents/`
folder; `raidenyn/veles-android` has `.agents/hooked-rules/repo-review-models.md` with a reviewer table
and presets (`sol`, `opus`, `both`).

## Alternatives Considered

### Alternative A: Skill text with a `gh` reference (chosen)
- **Approach**: `SKILL.md` holds the procedure and its rules; `references/onboarding-github.md` holds the
  commands; the agent runs them and judges the results.
- **Pros**: matches the task's size ("no code beyond the marketplace entry"), the RFC's Board reading
  decision (read with `gh` and judge, no ported tool), and the existing `task-publishing` pattern.
- **Cons**: repeatability rests on the agent following "look before you write" for every step.
- **Why chosen**: the only option inside the task's scope and the RFC's decisions.

### Alternative B: An onboarding script (Python or Node)
- **Approach**: a script that performs each step idempotently and prints the report.
- **Pros**: mechanical repeatability; testable with unit tests.
- **Cons**: code the task excludes; contradicts the RFC's choice not to port a tool; a script must be
  vendored into every repository or installed.
- **Why not chosen**: out of scope by the task and the RFC.

### Alternative C: Extend `task-publishing`
- **Approach**: add the fields, settings and keying as a `task-publishing` operation.
- **Pros**: reuses its board discovery and markers.
- **Cons**: the task states `task-publishing` is not changed; the Settings contract names the skill
  `project-conductor`.
- **Why not chosen**: out of scope and against a frozen contract.

## Agreed Approach

Alternative A, approved by the owner on 2026-11-25 together with the decisions below.

## Key Decisions

- **Run shape.** Survey without writing, show the plan; a dry run ends there; otherwise wait for the
  person's agreement unless they said to proceed without asking; then write and report. Every write is
  preceded by a check of what exists.
- **Slugs of a new key.** `<rfc-slug>` from the marker `<!-- rfc: <rfc-slug> -->` in the board's readme;
  `<milestone-slug>` from the marker `<!-- rfc: <rfc-slug>/<milestone-slug> -->` in the issue's repository
  milestone. The number is one above the highest number used under that prefix across all issues of the
  repository, open and closed. A missing marker means no key and a line in the report; the procedure never
  guesses a slug.
- **Trusted authorship.** An issue is keyed only when its author and every editor of its body are the
  agent account (the `gh` login) or the repository owner. Unreadable or incomplete edit history (a further page, a deleted edit, an unidentified
  editor, a read error) counts as untrusted: no key, reported.
- **Key placement.** The key is inserted as the first line of the body; the rest of the body is kept byte
  for byte. An existing key is never changed; a number is never reused; a duplicate key across issues
  stops the keying step and is reported.
- **Tasks folder.** Not restored. The report suggests `task-publishing`'s Restore when the person wants
  the task files back.
- **Committing the files.** The settings key and the model file are committed on a branch
  `chore/project-conductor-onboarding` in the target repository and proposed in a pull request, because
  protected default branches (`line-mcp`) need an approval. A repeated run reuses the branch and the open
  pull request; a merged one with the same content means nothing to do.
- **Models.** The three models are inputs with the RFC's defaults: plan Opus-5.5, review GPT-6.2-Sol,
  implement DeepSeek; the person confirms the exact implement model id in the plan.
- **Owner steps.** Printed as exact commands (`gh variable set PROJECT_URL --repo <repo> --body <url>`) or,
  for settings with no command, the exact settings page. An approval rule that cannot be read is reported
  as "unknown".
- **File split.** `SKILL.md` for the procedure and rules; `references/onboarding-github.md` for commands.

## Open Questions

- The exact model id for "implement" (DeepSeek) is confirmed by the person at each onboarding run.
- Whether the agent's token can write the three fields on a board owned by the owner's account was not
  tested in the spike (finding 7); the `line-mcp` onboarding task proves it, this task proves it on the
  scratch board only.
