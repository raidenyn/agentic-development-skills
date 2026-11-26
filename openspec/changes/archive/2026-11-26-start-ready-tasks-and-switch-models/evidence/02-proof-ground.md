# Proof ground (Task 1, 2026-11-25)

## Board: project 5 of `raidenyn-shadow` (`PVT_kwHOD4ARxs4BtKTK`)

- **Status** (`PVTSSF_lAHOD4ARxs4BtKTKzhrVEQI`) now has the options Backlog `914839bd`, Ready `eb4176c7`, In progress `ab7ef2c1`, In review `a0ddaf14`, Done `f0340381`. It replaced Todo, In Progress and Done, with the owner's approval.
- **Phase** (`PVTSSF_lAHOD4ARxs4BtKTKzhrX9Zc`) was created with the options Spike, Refactor, Foundation, Feature, Migration, Hardening, Outline, Planning.
- **Run fields:** "Run phase" (`PVTSSF_lAHOD4ARxs4BtKTKzhrVES8`: plan `be77257a`, implement `7b5e29c9`, closeout `cde67355`, care `90709d7a`), "Attempt" (`PVTF_lAHOD4ARxs4BtKTKzhrVET8`) and "Run thread" (`PVTF_lAHOD4ARxs4BtKTKzhrVEUE`) were already present.
- Every earlier item (the draft item and #1 to #12) is in Backlog.

## Repository `raidenyn-shadow/task-run-scratch` (commit `57bd73d` on `main`)

- `openspec init --tools none` (schema `spec-driven`). An `AGENTS.md` names the process.
- `.agents/hooked-rules/repo-run-models.md` roles: plan `claudeAgent/claude-opus-5-5` (medium), review `opencode/openai/gpt-6.2-sol` (medium), implement `opencode/ollama-cloud/deepseek-v4.1-flash:1017` (high). The owner confirmed the implement id. That model offers low, high and max, so the effort is `high`.
- The `project-conductor` key in `.agents/harness.json`: `{"maxParallel": 2, "reviewRounds": 5, "reconcileMinutes": 30, "maxAttempts": 2}`.
- `PROJECT_URL` = `https://github.com/users/raidenyn-shadow/projects/5`.
- T3 project `task-run-scratch`: `mcp:84ce4bcf-4cde-4084-b7dd-d7ee5ba21f79`.
- `raidenyn` was invited with write access (invitation 346325499) and must accept.

## Test issues (milestone "M1 scratch", Phase Feature)

| Letter | Issue | Key | Status | Set-up | Expected |
|---|---|---|---|---|---|
| R1 | #15 | `/20` | Ready | — | start |
| R2 | #16 | `/21` | Ready | — | start |
| R3 | #17 | `/22` | Ready | only blocker #14, closed as not planned | Ready; not started for lack of a slot |
| K | #18 | none | Ready | keyless | not-task |
| C | #19 | `/23` | Backlog | "Ready to start when: owner signs off" | waiting-for-ready |
| L | #20 | `/24` | Ready | linked branch `feat/20-l-preexisting` | taken:branch |
| E | #21 | `/25` | Ready | body to be edited by `raidenyn` | untrusted |
| O | #22 | `/26` | Ready | blocked by #1, open | blocker-open |
