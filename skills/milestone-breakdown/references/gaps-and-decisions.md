# Gaps and decisions

An RFC fixes the approach and the scope and leaves detail out on purpose. The breakdown is where most of the missing detail is first noticed. This file says what to do with each kind.

## Four ways to handle a gap

Pick exactly one for every missing detail that matters to the split.

### Leave it to the implementing agent

Use when the choice is local, reversible, and best made with the code open: internal structure, algorithms, helper and local names, test cases inside a module, log placement.

Name it under "Open choices" in the task when the agent might otherwise think it was decided. Trivial choices are not recorded at all.

### Record an assumption

Use when a default is needed to draw task boundaries, the default is safe and reversible, and no behavior visible in the RFC depends on it. A page-size limit the RFC does not mention is an example.

Each assumption has a short name, the default, why it is safe, and how to revisit it. Tasks that rely on it cite it by name and repeat the default, because a copied task does not carry the table. The person sees all assumptions in one list at review and can turn any of them into a question.

### Ask a blocking question

Use when the answer changes the task list, a contract, the data model, security, permissions or behavior a user would see. Also use when the RFC can be read two ways.

Ask as soon as you find it, together with other open questions where you can. Write the question with the possible readings and your recommendation. Do not write the tasks that depend on the answer until the person has answered. Tasks that do not depend on it can go ahead. Tasks written after the answer go through the same checks as the rest.

### Propose an RFC amendment

Use when the RFC is wrong or cannot work given the code, or when the choice would add, remove or change scope or contradict an approach the RFC chose.

Quote the RFC text, state the problem with file paths, and propose the new text. Stop the part of the milestone it affects until the person decides. The `feature-rfc` skill covers how amendments are recorded.

An idea for a feature the RFC did not ask for is also an amendment proposal. It never becomes a task on its own.

## Where a decision belongs

Three questions place any decision:

- **How many tasks depend on it?** If two or more, it is decided before those tasks are written.
- **How expensive is it to undo?** If undoing it needs a data migration, a break in a public interface or coordination between people, it is decided before the tasks.
- **Can it only be decided well with the code open?** If so, and it affects only one task, it is left to the implementing agent.

A simple test: if changing the decision later would mean editing more than one task, decide it before the tasks. If it would change only the task it appears in, defer it.

| Decision | Where |
|---|---|
| Module boundaries, interfaces between milestones, the data model, auth and error conventions, shared library choices, rollout strategy | The RFC. If missing, it is an amendment or a blocking question |
| An interface, event or config key shared by two tasks in this milestone | A milestone-level contract, written during the breakdown |
| Acceptance criteria, verification commands, the order of migration steps, which guard covers which task | The breakdown |
| Internal structure, algorithms, local names, test cases inside a module, where to log | The implementing agent |
| A name that appears in a public interface, a config key or a database column | Wherever the contract that holds it is decided, never the implementing agent |

## Checking for a design gap

Before slicing, ask whether any of these is true and not already settled by the RFC:

- Two or more tasks must agree on an interface or data shape that is not defined precisely.
- Persistent data or a public interface changes.
- A migration must keep old and new versions working at the same time.
- Security or permission boundaries change.
- A performance target could change the structure.
- The code offers two or more plausible places to integrate, and the RFC does not say which.
- The repository has no existing example of the pattern being introduced.
- A question can only be answered by trying it.

If one is true, settle it first, in the lightest form that works:

| The gap | Form |
|---|---|
| A seam between tasks | A milestone-level contract: types, a schema or an error table, with one producing task. Where practical the producing task lands it in code so later tasks consume the merged thing |
| A durable choice between alternatives, inside the RFC's bounds | A one-page decision record in the RFC's folder |
| A question about what is feasible | A spike |
| A missing example | Make the first task that introduces the pattern the reference, and put it early |

Keep the scope to this milestone. If the gap is in an RFC-level decision or a frozen contract, it is an amendment.

When one person runs the tasks one after another, a lighter path is allowed for a seam: the producing task defines it, and the consuming tasks are written after it merges.

## Spikes

A spike is right when the answer would change the task list. Size it in agent effort, using the two spike budget settings:

- **Small question:** answer it now, during the breakdown, by reading library source or running a short script. Record what was tested and the result in the findings.
- **Bigger question:** make it the first task. It states the questions, a stop condition and a budget. Its output is findings: what was tested, what was not, the results, and a link to the throwaway code. Its pull request is optional and may be closed unmerged.

Do not write the tasks that depend on a spike until it has reported. If it answers differently than expected, break down the rest again.
