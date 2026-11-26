## ADDED Requirements

### Requirement: Claude Code follows the agent's checkout
When the payload's `cwd` is in a different worktree of the same repository as `CLAUDE_PROJECT_DIR` (equal git common directory and a different git top level, compared as real paths), the Claude Code entry SHALL hand the event to that worktree's own `.agents/harness/hook-runtime/claude.mjs`, so its handlers, `.agents/harness.json`, state and `context.repoRoot` are used. Without a `cwd`, with `cwd` equal to `CLAUDE_PROJECT_DIR`, or without `CLAUDE_PROJECT_DIR`, the entry SHALL behave as before.

#### Scenario: Session moved into a linked worktree
- **WHEN** a session started in the main checkout sends `Stop` with `cwd` in a linked worktree at another revision whose verify command fails
- **THEN** that worktree's verify command runs and the turn end is blocked

#### Scenario: Handler context follows the move
- **WHEN** an event arrives with `cwd` in a linked worktree that has the runtime
- **THEN** handlers receive that worktree's top level as `repoRoot`, its config section, and a state folder under that worktree's git dir

#### Scenario: No cwd
- **WHEN** the payload has no `cwd`, or `cwd` equals `CLAUDE_PROJECT_DIR`
- **THEN** no git call is made for resolution and `CLAUDE_PROJECT_DIR` is used, as before

#### Scenario: Same checkout, other folder
- **WHEN** `cwd` is another folder of the checkout that contains `CLAUDE_PROJECT_DIR`, including when `CLAUDE_PROJECT_DIR` is below the git top level
- **THEN** `CLAUDE_PROJECT_DIR` is used as given

### Requirement: Other checkouts pass silently
The Claude Code entry SHALL print nothing and exit 0 when `cwd` is in another repository or a separate clone (different git common directory), outside any git checkout, or in a same-repository worktree without `.agents/harness/hook-runtime/claude.mjs`.

#### Scenario: Worktree without the runtime
- **WHEN** `cwd` is a linked worktree of the same repository without `.agents/harness/hook-runtime/`
- **THEN** the entry prints nothing and exits 0

#### Scenario: Another repository or a separate clone
- **WHEN** `cwd` is in another git repository, or in a separate clone of the same repository
- **THEN** the entry prints nothing and exits 0

#### Scenario: Folder outside any checkout
- **WHEN** `cwd` is a folder that is not inside a git checkout
- **THEN** the entry prints nothing and exits 0

### Requirement: Bounded checkout resolution
The two git calls that resolve the checkout SHALL run in parallel, each bounded at 2 seconds. When either call times out or cannot start, or git in `CLAUDE_PROJECT_DIR` fails, the entry SHALL use `CLAUDE_PROJECT_DIR` as before.

#### Scenario: git hangs
- **WHEN** the git call in `cwd` does not finish within 2 seconds
- **THEN** the event is handled in `CLAUDE_PROJECT_DIR`, and resolution took at most about 2 seconds
