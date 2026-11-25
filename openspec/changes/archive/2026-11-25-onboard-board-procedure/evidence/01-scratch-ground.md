# Run 1: scratch ground

Brief step 1. Repositories `raidenyn-shadow/task-run-scratch` and `raidenyn-shadow/task-run-scratch-bare` (README only), both linked to board 5 (`https://github.com/users/raidenyn-shadow/projects/5`). Board readme starts with `<!-- rfc: scratch-rfc -->`; milestone 1 "M1 scratch" holds `<!-- rfc: scratch-rfc/m1-scratch -->`. `task-run-scratch` holds `.agents/harness.json` = `{"agent-harness-verify-gate": {"x": 1}}` and a copy of veles's `.agents/hooked-rules/repo-review-models.md` (sha256 `d37b184f…1ced`; `git grep repo-review-models` finds no other file).

Issues: #1 A (`<!-- task: scratch-rfc/m1-scratch/1 -->`, on board), #2 P (`<!-- plan: scratch-rfc/m1-scratch -->`, on board), #3 Z (`<!-- task: scratch-rfc/m1-scratch/7 -->`, closed, off board), #4 B (keyless, on board), #5 C (keyless, CRLF, no trailing newline, on board), all in milestone 1. The draft item is the board's existing draft "scratch task" (from the earlier spike).

Expected: `gh project item-list` shows A, P, B, C and the draft. Actual: as expected.

#### Outputs

````text
$ gh project item-list 5 --owner raidenyn-shadow --limit 1000
DraftIssue	scratch task			PVTI_lAHOD4ARxs4BtKTKzhLwZX4
Issue	A: keyed task	1	raidenyn-shadow/task-run-scratch	PVTI_lAHOD4ARxs4BtKTKzhLyfgw
Issue	P: plan issue	2	raidenyn-shadow/task-run-scratch	PVTI_lAHOD4ARxs4BtKTKzhLyfkY
Issue	B: keyless task	4	raidenyn-shadow/task-run-scratch	PVTI_lAHOD4ARxs4BtKTKzhLyfms
Issue	C: keyless CRLF task	5	raidenyn-shadow/task-run-scratch	PVTI_lAHOD4ARxs4BtKTKzhLyfqQ

$ gh api "repos/raidenyn-shadow/task-run-scratch/issues/5" | jq -j .body | od -c | tail -3
0000060   s   t       l   i   n   e       w   i   t   h   o   u   t    
0000100   n   e   w   l   i   n   e
0000107

$ gh issue list --repo raidenyn-shadow/task-run-scratch --state all --json number,title,state,milestone
5	OPEN	M1 scratch	C: keyless CRLF task
4	OPEN	M1 scratch	B: keyless task
3	CLOSED	M1 scratch	Z: closed keyed task
2	OPEN	M1 scratch	P: plan issue
1	OPEN	M1 scratch	A: keyed task

--- first line of #1:
0000000   <   !   -   -       t   a   s   k   :       s   c   r   a   t
0000020   c   h   -   r   f   c   /   m   1   -   s   c   r   a   t   c
--- first line of #2:
0000000   <   !   -   -       p   l   a   n   :       s   c   r   a   t
0000020   c   h   -   r   f   c   /   m   1   -   s   c   r   a   t   c
--- first line of #3:
0000000   <   !   -   -       t   a   s   k   :       s   c   r   a   t
0000020   c   h   -   r   f   c   /   m   1   -   s   c   r   a   t   c
--- first line of #4:
0000000   T   a   s   k       B       w   i   t   h   o   u   t       a
0000020       k   e   y   .  \n
--- first line of #5:
0000000   T   a   s   k       C       w   i   t   h       C   R   L   F
0000020       l   i   n   e       e   n   d   i   n   g   s   .  \r  \n

$ gh api repos/raidenyn-shadow/task-run-scratch/milestones/1 --jq .description
<!-- rfc: scratch-rfc/m1-scratch -->
First scratch milestone.
$ gh project view 5 --owner raidenyn-shadow --format json --jq .readme
<!-- rfc: scratch-rfc -->

Scratch board for the project-conductor onboarding proof.
$ git ls-tree -r main (task-run-scratch)
.agents/harness.json
.agents/hooked-rules/repo-review-models.md
README.md
$ gh repo view task-run-scratch-bare tree
README.md
$ linked repos of board 5
raidenyn-shadow/task-run-scratch-bare
raidenyn-shadow/task-run-scratch
````

#### Saved original bodies (od -c of #5 C, as stored)

```text
0000000   T   a   s   k       C       w   i   t   h       C   R   L   F
0000020       l   i   n   e       e   n   d   i   n   g   s   .  \r  \n
0000040   S   e   c   o   n   d       l   i   n   e   .  \r  \n   L   a
0000060   s   t       l   i   n   e       w   i   t   h   o   u   t    
0000100   n   e   w   l   i   n   e
0000107
```
