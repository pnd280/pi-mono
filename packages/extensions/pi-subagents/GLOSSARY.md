# pi-subagents

pi-subagents lets a Pi session delegate work to separate Pi processes and receive their results in its own conversation.

## Language

A supervisor launches tasks. Each task has one or more runs, and each run is one child that writes the task's child file.

### Tasks and processes

**Supervisor**:
The Pi session that launches tasks and receives their results. A child is also the supervisor of the tasks that it launches.
_Avoid_: parent, host, orchestrator

**Task**:
Delegated work with one task ID and one child file for its whole life. It can have many runs.
_Avoid_: job, "subagent" when the task is meant

**Run**:
One child process of a task, from launch to exit. A resume starts a new run in the same child file.
_Avoid_: attempt, session, turn

**Child**:
The Pi process of one run, in RPC mode.
_Avoid_: worker, subagent process

**Descendant**:
A task that a child launches, at any depth below the supervisor's direct tasks.
_Avoid_: subtask, grandchild for any depth

**Capacity slot**:
One place in the whole live task tree. A run holds its slot until its child exits and any forced stop of the child's process group ends.
_Avoid_: permit, token

**Job**:
A shell command that a supervisor runs in the background with the `job` tool. A job has no child and no capacity slot. It stops when the supervisor's session binding ends.
_Avoid_: background bash, background task

**Promotion**:
Moving foreground work to the background, so that its call returns while the run continues.
_Avoid_: backgrounding, detach

### History

**Child file**:
The task's only Pi session file, and the only copy of the task's conversation.
_Avoid_: checkpoint, child session copy

**Marker**:
The entry that a child writes at the start of each run in the child file. A run's entries are the entries under its marker.
_Avoid_: run header

**Selected ancestry**:
The supervisor's path from its session root to its current leaf. Its `run` and `end` entries set the state of each task.
_Avoid_: branch history, timeline

**Writer lease**:
The claim that lets only one process write a child file.
_Avoid_: lock

### Results

**Background result**:
The message that delivers a finished background task or job to its supervisor.
_Avoid_: completion, notification

**Late usage**:
The usage of a run after its call returned. A background result carries it into the supervisor's totals.
_Avoid_: deferred usage
