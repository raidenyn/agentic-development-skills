## Context

The accepted RFC "Run the tasks of a project board unattended" names one procedure that prepares a board
and its repository for the conductor loop (Onboarding), freezes the names it writes (Settings), and adds
three board fields to the Run record. This change is the first task of milestone M1
(`unattended-task-runs/m1-loop/1`, issue #33). Nothing in the repository reads these settings yet; every
later M1 task does.

Current state: `skills/task-publishing` is the only skill that writes to a GitHub Project, with
`references/github-project.md` for its commands, markers (`<!-- rfc: … -->`, `<!-- task: … -->`) and
field-update pattern (send the full option list with existing ids). Agents act as `raidenyn-shadow`
(write, not admin, on the owner's repositories); the owner is `raidenyn`. The spike proved that the agent
token can create and write the three fields on a board it owns (scratch board, project 5 of
`raidenyn-shadow`), and that it cannot manage webhooks or variables where it is not an admin.

## Goals / Non-Goals

**Goals:**
- A skill `skills/project-conductor/` with an "Onboard a board" procedure, a marketplace entry and a
  README row, passing the repository's validators.
- A repeatable procedure: each step checks before it writes; a second run reports no change.
- A dry-run form that writes nothing and prints the owner's exact steps.
- Task keys for keyless open issues, only for trusted bodies, without touching any other byte.

**Non-Goals:**
- Reading Ready tasks, claims, starting threads, the webhook and timer triggers (later M1 tasks).
- Onboarding `line-mcp` for real (its own task), `repo-unattended-run.md` (M2).
- Any change to `task-publishing`; any new dependency; any script.

## Decisions

1. **Skill text plus a `gh` reference, no script.** The RFC's Board reading decision chose `gh` and
   judgement over a ported tool, and the task excludes code. `SKILL.md` carries the steps and rules;
   `references/onboarding-github.md` carries the commands, written in the style of
   `task-publishing/references/github-project.md`. Alternative: a Node/Python script — rejected as out of
   scope.
2. **Survey, plan, write, report.** The survey reads: the board (`gh project view`, `field-list`, readme),
   the repository's permissions, the `PROJECT_URL` variable where readable, `.agents/harness.json` and
   `.agents/hooked-rules/` on the default branch and on the onboarding branch, every open board item with
   its body, author and edit history, all keys in the repository, and the default branch's rules. The plan
   lists each step as create, reuse, or cannot do. Dry run stops after the plan.
3. **Fields.** Match by exact name, case included; a case-only collision is an owner step. A missing field is created (`gh project field-create`;
   "Run phase" with options plan, implement, closeout, care). An existing "Run phase" missing options gets
   them through `updateProjectV2Field` with the full list and existing ids. A field with the right name and
   the wrong type is reported and not changed.
4. **Settings through a pull request.** Files are written on branch `chore/project-conductor-onboarding`
   from the default branch, then a PR is opened. `.agents/harness.json` is parsed as JSON; only the
   `project-conductor` key is set; other keys and their order are kept; a file that is not valid JSON
   stops this step. The PR is reused on later runs. Merging it is the owner's step and is in the report.
5. **Model file.** A hooked-rule file with a `pointer` frontmatter line and the OpenSpec skill triggers of
   `repo-review-models.md`, a table Role | Model | Effort for plan, review, implement, and, when it
   replaces `repo-review-models.md`, that file's reviewer table and presets copied unchanged under a
   "Reviewer presets" heading. The old file is deleted in the same commit, unless other files refer to its
   path (veles's `AGENTS.md` does): then the roster migration is deferred (neither file changes) and the
   references are an owner step, unless the person agreed in the plan to edit them in the same PR. After
   the merge, presets are read from `repo-run-models.md`. A PR is reused only from the onboarding branch of
   the same repository to the current default branch, with a diff limited to those paths.
6. **Keys.** Slugs from the readme and milestone markers; number = highest used under the prefix + 1,
   across open and closed issues; first-line insertion; trust = author and all body editors in
   {agent login, repository owner}, read through GraphQL `userContentEdits`; no further page, no deleted
   edit, no unidentified editor, no GraphQL error. Body and history are read again just before each write.
   Plan issues (`<!-- plan: … -->` first line), pull requests, drafts and other repositories' issues are
   never keyed. Board items are paged to the end; a failed page stops the step. First lines are matched
   whole against the marker forms; a malformed marker is reported. Board and milestone RFC slugs must agree.
   The re-check before writing also covers edit ids and times, state, board membership and milestone.
7. **Approval check.** Read rulesets (`repos/<repo>/rules/branches/<default>`) and classic protection.
   "yes" when either requires an approval; "no" only when both were read and neither does (a classic
   404 "Branch not protected" counts as read only with admin rights); otherwise "unknown".
8. **Webhook.** Never created. Every run lists, verbatim under Pending: "Webhook: pending. Created by the
   task "Repair claims, settle merged work and wake on events"."

9. **Report.** Five lists: created, changed, reused, pending, could not do (with owner steps). "Nothing
   changed" exactly when no write succeeded; pending and owner items repeat on every run.
10. **Fields read through GraphQL**, because `gh project field-list` omits the data type of number and text
    fields and option colors.

## Risks / Trade-offs

- [Agent skips a check and writes twice] → each step's reference section starts with its read command and
  the condition for writing; the second-run acceptance test catches it.
- [Body rewrite changes bytes, e.g. trailing newline] → body is read with `gh api` raw JSON and written
  with `--body-file`; the proof compares the body after the key line with the original.
- [Two issues get the same new number in one run] → numbers are allocated in one pass, in issue-number
  order, from a single in-memory max per prefix.
- [Owner-owned boards untested for field writes] → noted; proved by the `line-mcp` onboarding task.
- [Settings PR stays unmerged] → the report lists it as the owner's step; later tasks read settings from
  the default branch and treat absence as not onboarded.

## Migration Plan

Additive. Rollback is removing the skill folder, its marketplace entry and README row; boards and
repositories onboarded keep their fields and files, which nothing reads until the loop exists.

## Open Questions

- Exact model id for "implement" — an input confirmed per run.
