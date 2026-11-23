---
name: feature-rfc
description: Use when a feature is too big or too risky for a single change and needs a system-level design approved first, or when asked to write, review or amend a feature RFC or feature design doc. Covers milestones and shared contracts, settled before the work is split into tasks, OpenSpec changes and PRs. Not for the proposal or design of a single change.
---

# Feature RFC

A feature RFC is the system-level design for one feature, written before any implementation change. A feature can become tens of PRs. The RFC is where a person reads the whole design, discusses it with you and approves it. After that, the feature is built milestone by milestone, and each PR gets its own small spec (for example an OpenSpec change).

Your job is to produce a document the person can read quickly, understand, and argue with. You research, draft and critique. The person decides.

## Ground rules

These hold in every step.

- **The person owns the decisions.** Nothing you write counts as approved until they say so. You are never the decider.
- **Never invent facts.** Every claim about the system comes from code, specs, docs or data you actually read, with a file path or link. Anything you could not verify is labelled as an assumption and listed under open questions.
- **The RFC file is the single record.** Review can happen in chat, pull request comments, inline comments or a mix. Whatever the channel, bring the outcome into the file. Nothing counts as decided until it is there.
- **Short beats complete.** You can produce length for free, so length proves nothing. Cut anything that does not change a system-level decision.
- **English by default.** Write in another language only when the person explicitly asks.

## Settings

The values below are defaults. If `openspec/design/README.md` (or the README of the design folder the repo uses) has a "Settings" section, a table with the same setting names, its values win. The person can also override any of them in the request.

| Setting | Default |
|---|---|
| Main body word cap | 2,500 words |
| Main body target | 1,500 to 2,000 words |
| Inline spike budget | a handful of tool calls, at most about 20% of the session's context. Stop sooner if it starts crowding out the design discussion |
| Standalone spike budget | one separate session, 1 to 2 hours of run time, or the cost cap the person sets |
| Diagram size | about 12 nodes |
| Milestone size | about 3 to 6 PRs |
| Document language | English |

The main body runs from Summary through Open questions. Code and Mermaid blocks, Decision outcome, Review log, Amendments and Appendix do not count. If the body cannot fit under the cap after cutting, tell the person the feature is probably two features, each with its own RFC.

## Where files live

Design records sit together, grouped by feature:

```
openspec/design/<feature-name>/rfc-<title>.md
openspec/design/<feature-name>/adr-<title>.md
```

- If the repo has no `openspec/` folder, look for an existing design-records folder and follow it. If there is none, ask where to put the RFC.
- Use short descriptive names, not numbers.
- Files never move. Status lives in each file's header, so links from changes and other records never break.
- A decision record not tied to a feature goes in a folder named after the area it affects, for example `openspec/design/billing/`.

## Procedure

### 1. Decide whether an RFC is warranted

Write an RFC when the feature needs more than one change or PR, or when one of these holds: a step is hard to reverse, the change crosses a module or team boundary, it changes persistent data or a public contract, it adds a significant dependency, several reasonable options exist, or the direction is contested.

Then try to describe two genuinely different ways to solve the problem, two sentences each. If there is no credible second option and the work fits one change, skip the RFC and go straight to the change. If you cannot write even the first, the problem is not understood yet, so ask.

Tell the person which trigger fired, roughly how many changes and milestones you expect, and what you recommend: a single change, a decision record only, or a feature RFC. They decide. Using an agent is not by itself a reason to write an RFC.

### 2. Ground yourself

Read before you ask, and ask before you write.

- **Read the repo:** the code the feature touches, existing specs, earlier RFCs and decision records, related issues. Note file paths as you go.
- **Find prior art:** code, libraries or earlier designs that nearly solve the problem. Record why each is not enough, even when it seems obvious.
- **State the problem without a solution:** what is wrong, who or what is affected, the measurable impact, and the decision that must be made. Keep asking "why" until you reach users, money or reliability. If the person gave only a solution ("add a cache"), ask for the problem first.
- **Ask the person for what the repo cannot tell you:** the business goal, constraints, deadlines, who decides, which options are already ruled out. Drafts are weakest on business context and real numbers, so do not guess these.

### 3. Run spikes instead of guessing

When a decision depends on an unproven assumption ("will this library handle our case?", "is it fast enough?"), propose a spike. Every spike starts with written questions and a stop condition, and ends with findings: what was tested, what was not, the results, and a link to the throwaway code.

- **Inline spike.** For a small question you can answer now: read library source, run a short script, measure one thing. Stay inside the inline budget and touch nothing outside a scratch area. Report every inline spike you ran.
- **Standalone spike.** For anything bigger: a prototype across modules, a benchmark, a check that needs other people. Pause the design, mark the affected decisions "waiting on spike", and write the spike as a separate task with its questions, scope, stop condition and budget. Ask before starting it. Resume the design from its findings.

If an inline spike outgrows its budget, stop and turn it into a standalone one.

A spike can come up at any step. Before the direction is agreed (step 4), run only inline spikes, and list any standalone spike you propose in the outline. Put the findings in the Appendix, and cite them from the decisions they affect.

### 4. Check the direction before drafting

Show the person a one-screen outline first: the problem in a few sentences, the options you see, the direction you recommend, the rough milestones, and the points you expect to need their call. Write the full document only after they agree with the direction. When they agree, create the RFC file with status Draft and record the agreed direction, with their reason, as the first review log entry.

This costs them a minute. A full draft in the wrong direction costs them a full read.

### 5. Draft the RFC

Use [references/rfc-template.md](references/rfc-template.md). It gives the section order and what each section holds. The ideas that matter most:

- **Context before decisions.** The reader gets the problem, how it works today and what changes before being asked to approve anything. The list of decisions to approve comes after the design, not before it.
- **Show changes against today.** Describe how the touched parts work now, then mark every difference as `NEW`, `CHANGED` or `REMOVED` in tables and diagrams.
- **Settle shared contracts here.** Anything two or more milestones depend on (an interface, event, data model, error model, naming, configuration) is decided in the RFC, with its shape, producer, consumers and whether it is `frozen` or `provisional`. Anything one piece of work owns alone is left to implementation, and the RFC says so.
- **Plan milestones, not tasks.** Each milestone is a shippable increment that leaves the main branch working. Aim for the milestone size setting. A much larger one is probably two. Task breakdown happens later, one milestone at a time (the `milestone-breakdown` skill covers it).
- **Mark what needs the person's call.** Sort every decision and open question into "needs your call" or "routine". This is how the person knows where to spend attention.

**Needs your call** covers business and scope trade-offs, hard-to-reverse steps, cost you cannot judge, ownership impact, security and data risk, taste, and any gap you filled with an assumption. Each carries your recommendation with its reason, the strongest alternative, and what it would cost to change later. **Routine** covers choices that follow from the code, a spec or an agreed decision, and each names its source. A hard-to-reverse step, a frozen contract or an unverified assumption is never routine. When unsure, mark it "needs your call".

#### Writing rules

- Write for a competent engineer who does not know this codebase's names, history or acronyms. Define terms on first use and use one name per concept.
- Lead with the point: the document, each section and each paragraph start with their conclusion.
- Use prose for reasoning, because bullets let you skip the "because". Use lists for lists and tables for comparisons.
- Be concrete. Give numbers instead of adjectives, and name the actor ("the gateway retries twice"). A specific claim that turns out wrong is more useful than a vague one, because a reviewer can correct it.
- Label each important number as measured, derived, estimated or assumed, with its source and time window.
- Refer to decisions, contracts, risks and milestones by short names and link to them. Keep a name once it has been used in discussion. If a name must change, note the old one in the review log.
- Make sections self-contained, so each still makes sense when read on its own.
- Do not paste full schemas or code. Show only the contract-level shape that is itself the decision, and link the rest.
- Keep implementation steps out. If a section has no trade-off, it is a task list and belongs later.

#### Diagrams

Use Mermaid blocks only, so the diagrams stay readable and editable as text.

- Start with a context diagram (the system as one box with its users and neighbors). Add a second diagram one level down (apps, services, data stores) only when the change is inside the system.
- Pick the type that fits: `flowchart` for structure and data flow, `sequenceDiagram` for interactions, `stateDiagram` for lifecycles, `erDiagram` for data.
- One diagram answers one question. Stay near the diagram size setting and split rather than grow.
- Label every line with how A uses B, use `subgraph` for boundaries, set a direction (`LR` or `TB`), and give each diagram a title and a legend. Refer to each diagram from the text.
- Show before and after as the same diagram twice, with new and changed elements highlighted through a `classDef` style.
- Check that each diagram renders if you have a way to. If not, tell the person they were not rendered.

### 6. Review your own draft

Before the person sees it, review the draft critically against [references/review-checklist.md](references/review-checklist.md). Look for the weakest argument, the missing alternative, the unlabelled claim, the hidden hard-to-reverse step, and a milestone that consumes a contract nobody has produced yet. Fix what you find, or list it under open questions.

Set the header status to In review when you hand the draft to the person.

### 7. Review with the person

- **Start with the points that need their call**, one at a time.
- **Ask how strict feedback is when it is unclear:** a hard requirement, a preference you may trade off, or a question. Ask only when the answer changes what you do.
- **Disagree openly when you have a reason.** If feedback conflicts with the evidence, a frozen contract, an agreed decision or a hard-to-reverse risk, say so once, with the reason, the cost and an alternative. Then follow their call. Do not comply silently, and do not keep re-arguing.
- **Capture the reason, not just the verdict.** When they decide without saying why, ask one short question, or propose the reason you infer and ask them to confirm it: "Option 1, because it covers future cases such as multi-currency. Correct?" If they prefer not to give one, record "no rationale given". Never invent one.
- **Fold every outcome into the file.** Update the body, write the person's reason and any "yes, if" condition next to the decision it belongs to, move rejected ideas to the abandoned ideas section with one line on why, and add a review log entry: what was asked, what changed (by name), what was decided, why, and any disagreement you raised and how it ended.
- **Do not reopen agreed points.** A decision marked "agreed" changes only when the person asks.
- **Do not add process.** No extra approvals, meetings or reviewers unless the person asks. When someone else must weigh in, prepare a short, self-contained question for them with only the part they need and a link to the rest. Record their answer on the decision it affects.

### 8. Close the decision

Close only on an explicit statement from the person. A "looks good" on one section is not acceptance. Before setting Accepted, run the checklist again and confirm that every decision is agreed, none is waiting on a spike, and no open question blocks the decision. If one does, say so and ask.

When the person accepts, rejects or withdraws the RFC:

1. Fill in the decision outcome: result, date, decider, and any conditions.
2. Set the status in the header.
3. On acceptance, freeze the document. After that only four things change: milestone status, the header status, small clarifications, and amendments (step 9). Clarifications and amendments are both logged in the Amendments section.
4. On acceptance, offer the two follow-ups in [references/after-acceptance.md](references/after-acceptance.md): breaking down the first milestone, and adding the implementation rule to the repo.

Implementation starts only after acceptance.

### 9. Amend when the work disproves the design

If later work shows that a decision or a frozen contract is wrong, the fix is an amendment: a new decision entry that supersedes the old one, with the reason, approved by the person. Log it in the Amendments section, leave the original text in place, and add a line under it that points to the amendment, so nobody reads the old decision as current. Never let an implementation change diverge quietly. A change too large to amend gets a new RFC that supersedes this one, with links in both directions.

[references/after-acceptance.md](references/after-acceptance.md) also covers how smaller technical decisions are recorded once the RFC is accepted.

## Output

- The RFC file at the agreed path, with its status and review log up to date.
- A short message to the person: what is proposed, how many points need their call, and what you could not verify.
