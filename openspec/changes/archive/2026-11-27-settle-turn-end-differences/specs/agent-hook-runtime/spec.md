## MODIFIED Requirements

### Requirement: OpenCode turn-end slot
On OpenCode, turn-end work SHALL run detached, one slot per session. Turn ends that arrive while the slot is busy SHALL be queued in order, and each SHALL run. A result whose start generation was overtaken by a newer `session.execution.started` SHALL NOT be delivered as a block, and its `release` SHALL be called.

#### Scenario: A later turn fixes the tree
- **WHEN** turn A's slow run fails and turn B starts and fixes the tree before A's result is ready
- **THEN** A's block is not delivered, its `release` is called, and B's run verifies the fixed tree

#### Scenario: Two turn ends during one run
- **WHEN** turn ends B and C arrive while A's run is in flight
- **THEN** both run after A, in order, and only a result whose generation is current is delivered as a block

### Requirement: Handlers in workers under a supervisor
On both hosts, each handler SHALL run in its own worker thread under the adapter's main thread (the supervisor). The supervisor SHALL terminate a worker whose handler passes its deadline, and start a fresh one for later events. A worker SHALL NOT spawn processes or take the gate lock itself. The supervisor SHALL do both on its behalf, and SHALL kill those processes and release those locks when the worker ends.

#### Scenario: Synchronous loop
- **WHEN** a handler runs `while (true) {}` before its first `await` during `tool.before`, on either host
- **THEN** the command runs after the handler's deadline, the failure notice is given where the event has a channel, and the next event is handled by a fresh worker

#### Scenario: Termination during a git write
- **WHEN** a worker is terminated while its private-index `git add` runs
- **THEN** no git process keeps running, the gate lock is released, and the next run is not blocked by `index.lock`

#### Scenario: A killed hook process leaves its groups running
- **WHEN** the Claude Code hook process is killed with SIGKILL while its verify command runs
- **THEN** the verify command's process group is still alive afterwards

## ADDED Requirements

### Requirement: Stale text of a result
A `block` or `context` result MAY carry a string `stale`, the text to show if the result is superseded. The runtime SHALL keep it and SHALL join the `stale` texts of all handlers into the merged result's `stale`, in handler-name order. Claude Code SHALL ignore it.

#### Scenario: Stale texts are kept and joined
- **WHEN** two handlers return `{block, stale}` and `{context, stale}` for one `turn.end`
- **THEN** the merged result's `stale` holds both `stale` texts, in handler-name order

### Requirement: Superseded results shown as a notice
When an OpenCode turn-end result is superseded, its merged `stale` is not empty, the plugin is not disposed, and no later turn end is queued for the session, the plugin SHALL send the `stale` text as a synthetic message with `resume: false` before calling `release`. In every other superseded case it SHALL send nothing.

#### Scenario: A superseded result with no later turn end is shown
- **WHEN** turn A's slow run fails with a `stale` text, and a new turn has started but not ended when the result is ready
- **THEN** one synthetic message with `resume: false` and exactly the `stale` text is sent, and A's `release` is called

#### Scenario: A superseded result with a queued turn end is dropped
- **WHEN** turn A's slow run fails with a `stale` text while turn end B is queued behind it
- **THEN** nothing is sent for A, A's `release` is called, and only B's result is delivered

#### Scenario: No stale text
- **WHEN** a superseded result carries no `stale`
- **THEN** nothing is sent and its `release` is called

### Requirement: Reaping a dead holder's groups
Before the supervisor takes a gate lock for a worker, it SHALL check the newest lock in that directory. If that lock is not released, its holder `pid` is dead, and it was taken less than 24 hours ago, the supervisor SHALL first terminate the recorded `pgids` of that lock that it is allowed to signal. Groups that answer EPERM SHALL be skipped.

#### Scenario: The next run reaps an orphan
- **WHEN** a Claude Code hook process was killed with SIGKILL while its verify command ran, and a later turn end runs in the same repository
- **THEN** the orphaned group is gone before the later run's verify command starts

#### Scenario: A released or live lock is not reaped
- **WHEN** the newest lock is released, or its holder `pid` is alive
- **THEN** no group is signalled

#### Scenario: An old lock is not reaped
- **WHEN** the newest lock's holder is dead and the lock was taken more than 24 hours ago
- **THEN** no group is signalled and the lock is taken as before

### Requirement: Bounded reap
The reap SHALL send SIGTERM and then SIGKILL, bounded by the requesting event's deadline, and SHALL always send SIGKILL before it gives up. If the event ended during the reap, the supervisor SHALL reply with an error and SHALL NOT take the lock. If a reaped group is still alive, it SHALL reply that the lock is busy. Otherwise it SHALL take the lock as before.

#### Scenario: A reap that outlives its event
- **WHEN** an event ends while the supervisor is still terminating a dead holder's group that ignores SIGTERM
- **THEN** the acquisition answers with an error, no unreleased lock is left, and the group ends up dead

### Requirement: Claude Code entry cleans up on signals
When `claude.mjs` runs as a script and receives SIGTERM, SIGHUP or SIGINT, it SHALL close every runtime it started in this process with a cleanup deadline of 4.5 seconds, including that of a delegated checkout whose copy supports it, so that the groups are killed and the locks are released. Calling `main()` in-process SHALL NOT install signal listeners.

#### Scenario: SIGTERM during a verify run
- **WHEN** the hook process receives SIGTERM while its verify command runs
- **THEN** within 6 seconds the command's group is gone and its gate lock is released

#### Scenario: A command that traps SIGTERM
- **WHEN** the verify command ignores SIGTERM and the hook process receives SIGTERM
- **THEN** the group is killed with SIGKILL

### Requirement: Exit after a signal
After a signal, the Claude Code entry SHALL exit 0 within 5 seconds and SHALL write nothing to stdout. If `main()` has already returned a result that is not yet delivered, the entry SHALL call that result's `release`, bounded by 1 second, before it closes the runtimes, and SHALL NOT call `ack`. A charge made by a handler that is terminated before it returns SHALL stay, as the charge rules already say. A second signal SHALL make it exit at once.

#### Scenario: Quiet exit
- **WHEN** the hook process receives SIGTERM while its verify command runs
- **THEN** it exits 0 within 5 seconds with empty stdout

#### Scenario: An undelivered block is released first
- **WHEN** a signal arrives after `main()` returned a block and before it was written
- **THEN** that block's `release` is called before the runtimes are closed, and `ack` is never called
