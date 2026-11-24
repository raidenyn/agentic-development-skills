# After the RFC is accepted

An accepted RFC is a record of what was discussed and what was decided. It is not documentation, and it is not kept in step with the code. Current truth lives in the code, the specs and the decision records. The RFC is archived at the moment of acceptance, and its text is not changed again.

Only an accepted RFC is archived and merged to the main branch. A rejected or withdrawn RFC gets its outcome and status committed on its branch, and that branch is never merged.

## Archive the RFC

Do this as soon as the person accepts the RFC, after the decision outcome and the header status are filled in, and before the RFC's branch is merged. Do it in one commit, so no commit on the main branch has broken links.

1. **Move the whole feature folder.** `openspec/design/<feature-name>/` becomes `openspec/design/archive/YYYY-MM-<feature-name>/`, where `YYYY-MM` is the month of the acceptance. Use `git mv`, so the history follows the files. Everything in the folder moves with the RFC: spike findings, drafts of decision records, images.

   ```bash
   mkdir -p openspec/design/archive
   git mv openspec/design/<feature-name> openspec/design/archive/YYYY-MM-<feature-name>
   ```

   If the archive already has a folder with that name, stop and ask the person for a different feature name. Never merge two features into one folder.

2. **Repair the links the move broke.**
   - Out of the folder: the folder is at another depth now, one level deeper with the default archive folder, so every relative link from its files to code, specs or other records is worked out again from the new place.
   - Into the folder: search the repository for the old path and update each hit: other design records, specs, OpenSpec changes, rules, the design folder's README.

   ```bash
   grep -rn "design/<feature-name>/" --exclude-dir=.git .
   ```

   Correcting a path in another archived record is allowed. It does not change what that record says.

3. **Link the new and the old record in both directions.** This is part of the archive operation, not a follow-up. For each earlier record this RFC replaces, in full or in part, an RFC or a decision record:
   - **New to old.** In this RFC, the Links row says "Supersedes" with a link to the earlier record, and names the decisions, contracts or milestones it replaces when it does not replace all of them.
   - **Old to new.** Edit the earlier record, even though it is archived:
     - replaced in full: set its header status to "Superseded by" with a link to this RFC;
     - replaced in part: leave its status, add "Partly superseded by" with the link and the names to its Links row, and add one line under each replaced decision, contract or milestone: "Superseded by <link to the place in this RFC>". Leave the original text in place.

   Write the links after the move, so they use the final paths. Find the earlier records from the RFC's prior art, its review log and, for a follow-up RFC, the RFC it follows. Do not guess: if it is unclear whether an earlier record still holds, ask the person.

4. **Check.** Every link in the moved files resolves, the search for the old path finds nothing, and each "Supersedes" link in this RFC has a link back from the record it names. If the design folder's README lists the records, update its entry.

5. **Tell the person** the new path and what you marked as superseded, and that the branch is ready to merge. Merging is their call.

## What may still change

In the archive, what a record says never changes. Two things are allowed:

- **New decision records in the folder,** described below.
- **Links from an obsolete record to the one that replaces it:** the Status and Links rows in its header, and the one-line "Superseded by" markers under the replaced parts. They are set when the newer record is archived. The original text is never removed or reworded. This is what keeps a reader of an old record from taking it as current.

Nothing else. In particular:

- **Progress is not tracked in the RFC.** Whether a milestone is done is recorded where the tasks are: in the milestone's plan and in the tracker (the `milestone-breakdown` skill's close step covers it). The RFC has no "implemented" status.
- **A clarification is not an edit.** If the RFC can be read two ways, ask the person. An answer that matters to more than one task is written as a decision record that refines the RFC. One that matters to a single task stays in that task. An answer that changes a decision needs a follow-up RFC.

## Offer two follow-ups on acceptance

1. **Break down the first milestone.** It is usually the riskiest, and splitting it early tests whether the plan and contracts hold. Use the `milestone-breakdown` skill if it is available. If it is not, say so, and split the milestone by the same rules: one task per PR, each leaving the main branch working, with dependencies checked against the contracts, and each starting with a check of the task against the merged code before any design work. No task starts before the RFC is on the default branch. Later milestones stay at milestone level until their turn.
2. **Add the implementation rule to the repo**, once per repo. Put it in a rule that loads only when relevant, not in the always-loaded instruction file, because most tasks have nothing to do with RFCs. Use whatever scoped-rule mechanism the agent host offers. For example, in Claude Code that is a file under `.claude/rules/` with a `paths:` list covering the changes folder and the design folder. Suggested text:

   > Changes made from a feature RFC follow its frozen contracts and agreed decisions, together with any follow-up RFC its header links. If one turns out wrong, stop and propose a follow-up RFC. Do not diverge in the change's own design. Link the RFC in every change made from it. Never edit a file under the design archive: a new decision is a new file.

   The always-loaded instruction file gets at most one line: where design records live, and to check them before proposing architectural changes.

   If the host has no scoped rules, skip this. The Design constraints block in each task already carries the rule.

Ask before doing either. Do not edit repo rules on your own initiative.

## When the design must change

If breaking down or implementing a milestone shows that a decision or frozen contract is wrong, stop and tell the person: the decision that does not hold, what you found, and what you propose instead. Dropping, adding or reordering a milestone is the same kind of change.

There are no amendments. When the person agrees that the design must change, write a follow-up RFC:

- **Its own folder,** named for the feature and the change: `openspec/design/<feature-name>-<what changes>/rfc-<title>.md`. It is archived under that name when it is accepted.
- **The same procedure** as any RFC: direction check, draft, review, explicit acceptance, archive. Work that depends on the changed decision waits for the acceptance.
- **Only what changes.** It does not repeat the first RFC. "How it works today" describes the accepted design and what has already been built from it, with links. A template section with nothing new says "unchanged" and links the first RFC's section. The milestone table lists only the milestones that are new or changed, and says what happens to merged work.
- **Explicit about what it replaces.** Its Links row says "Supersedes" with a link to each decision, contract or milestone of the first RFC that it replaces, by name.

On acceptance, the archive steps above link the two: the follow-up links back to the first RFC, and the first RFC is edited to link forward to the follow-up, in its header and under each replaced part.

Reading rule: an RFC together with the follow-ups its header links is the design. Where they disagree, the follow-up wins.

## Smaller decisions made later

The RFC's decision list is the record of the main decisions. Do not duplicate them elsewhere.

Technical decisions made later, inside the space the RFC left open, are recorded at the level they deserve:

- A choice that matters only to one change stays in that change's own design notes.
- A choice that will outlive the change, where someone will later ask "why is it like this?" (a library, a storage layout, a cross-module convention), gets a short decision record next to the RFC: `adr-<title>.md` in the RFC's archived folder.

A decision record may refine an RFC decision. It may never contradict one, or a frozen contract. If it would, that needs a follow-up RFC, and it goes back to the person. Check this before writing the record.

### Decision record format

One decision per record, one page:

```markdown
# ADR: <decision phrased as a choice, e.g. "Use PostgreSQL advisory locks for the scheduler">

| Field | Value |
|---|---|
| Status | Proposed / Accepted / Superseded by <link> |
| Date | YYYY-MM-DD |
| Decider | <person> |
| Refines | <link to the RFC decision, if any> |

## Context
The forces and constraints that made a decision necessary.

## Decision
"We will …", in full sentences.

## Options considered
Only when the choice was close: each option and why it lost.

## Consequences
What becomes easier, and what we accept as a cost.
```

Never edit an accepted record to change its decision. Write a new one and mark the old one superseded.
