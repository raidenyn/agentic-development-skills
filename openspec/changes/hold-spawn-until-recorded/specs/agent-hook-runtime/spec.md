## ADDED Requirements

### Requirement: No group runs before it is recorded
When the supervisor spawns a process for a worker, it SHALL write the new process group's pgid into the `pgids` of every gate lock it holds before the requested command starts. Until then the group SHALL NOT run the requested command.

#### Scenario: A SIGKILL right after the command starts
- **WHEN** a Claude Code hook process is killed with SIGKILL as soon as its verify command has started and written its own pid
- **THEN** the newest gate lock already lists that command's pgid, and the next turn end in the same repository reaps it before its own verify command runs

#### Scenario: The command waits for the release
- **WHEN** a spawned process has started but the supervisor has not yet released it
- **THEN** the requested command has not run

### Requirement: An unrecorded group never runs
If a gate lock cannot be written during a spawn, the supervisor SHALL NOT run the requested command, SHALL kill the group, and SHALL answer the spawn with an error once the group is gone. If the supervisor process dies before it releases a spawned process, that process SHALL exit without running the requested command.

#### Scenario: The lock cannot be written
- **WHEN** writing the pgid into a held gate lock fails during a spawn
- **THEN** the requested command never runs, and the spawn answers with an error after the group is gone

#### Scenario: The supervisor dies before the release
- **WHEN** the supervisor's side of the release channel closes before the release
- **THEN** the spawned process exits without running the requested command

### Requirement: Spawn results are unchanged
A spawn through the supervisor SHALL return the same results as a direct spawn of the command in its own group: its pid as `pgid`, its output, its exit code or signal, and `timedOut` when its timeout fires. A missing command, a non-executable file, and a missing `cwd` SHALL each be answered with an error that names the command. An empty command name SHALL get the same invalid-argument error a direct spawn gives; a name beginning with `-` SHALL get `spawn <name> ENOENT`.

#### Scenario: Results of a command
- **WHEN** a worker spawns a command that prints its own pid, writes to stdout and stderr, and exits 3
- **THEN** the result has code 3, the output, and a `pgid` equal to the printed pid

#### Scenario: A timeout
- **WHEN** a worker spawns `sleep 30` with `timeoutMs` 100
- **THEN** the result reports `timedOut` and signal SIGTERM

#### Scenario: A missing command
- **WHEN** a worker spawns a command that is not on PATH
- **THEN** the spawn answers with an error naming the command and ENOENT

#### Scenario: A command that is not executable
- **WHEN** a worker spawns a path to a file without execute permission
- **THEN** the spawn answers with an error naming the command and EACCES

#### Scenario: An invalid working directory
- **WHEN** a worker spawns a command with a `cwd` that does not exist
- **THEN** the spawn answers with an error that names the command, not the shell
