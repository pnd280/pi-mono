# pi-subagents

pi-subagents lets a Pi session delegate work to separate Pi processes and receive their results in its own conversation.

## Language

A supervisor launches tasks. Each task has one or more runs, and each run is one child that writes the task's child file.

### Tasks and processes

**Supervisor**:
The Pi session that launches tasks and receives their results. A child is also the supervisor of the tasks that it launches. See [usage](README.md#usage).
_Avoid_: parent, host, orchestrator

**Task**:
Delegated work with one task ID and one child file for its whole life. It can have many runs. See [continue and cancel tasks](docs/tasks.md).
_Avoid_: job, "subagent" when the task is meant

**Run**:
One child process of a task, from launch to exit. A resume starts a new run in the same child file. See [runs and entries](docs/history.md#runs-and-entries).
_Avoid_: attempt, session, turn

**Child**:
The Pi process of one run, in RPC mode. See [process shutdown](docs/shutdown.md).
_Avoid_: worker, subagent process

**Descendant**:
A task that a child launches, at any depth below the supervisor's direct tasks. See [cancel a task](docs/tasks.md#cancel-a-task).
_Avoid_: subtask, grandchild for any depth

**Task tree**:
A supervisor's direct tasks and their descendants, each below the task whose child launched it. See [runs and entries](docs/history.md#runs-and-entries) for where the tree comes from.
_Avoid_: task list, hierarchy

**Capacity slot**:
One place in the whole live task tree. See [configuration](README.md#configuration), and [immediate stop](docs/shutdown.md#immediate-stop) for when a run releases its slot.
_Avoid_: permit, token

**Job**:
A shell command that a supervisor runs in the background with the `job` tool. A job has no child and no capacity slot. See [background jobs](docs/jobs.md).
_Avoid_: background bash, background task

**Promotion**:
Moving foreground work to the background, so that its call returns while the run continues. See [commands](docs/commands.md).
_Avoid_: backgrounding, detach

**Session binding**:
A supervisor's tasks, jobs, result delivery, and views for one session and selected ancestry. See [branch changes](docs/history.md#branch-changes) for what a session change stops.
_Avoid_: lifetime, "session" when the binding is meant

### History

**Child file**:
The task's only Pi session file, and the only copy of the task's conversation. See [task history and branches](docs/history.md).
_Avoid_: checkpoint, child session copy

**Marker**:
The entry that a child writes at the start of each run in the child file. A run's entries are the entries under its marker. See [side effects](README.md#side-effects).
_Avoid_: run header

**Selected ancestry**:
The supervisor's path from its session root to its current leaf. Its `run` and `end` entries set the state of each task. See [runs and entries](docs/history.md#runs-and-entries).
_Avoid_: branch history, timeline

**Writer lease**:
The claim that lets only one process write a child file. See [writer lease](docs/history.md#writer-lease).
_Avoid_: lock

### Results

**Background result**:
The message that delivers a finished background task or job to its supervisor. See [background results](docs/background-results.md).
_Avoid_: completion, notification

**Result source**:
The part of the task or job registry that gives its background results to delivery. It also tells whether its unfinished work holds the supervisor's run. See [ADR 0001](docs/adr/0001-hold-run-for-background-results.md).
_Avoid_: result emitter, completion events

**Late usage**:
The usage of a run after its call returned. See [usage accounting](docs/background-results.md#usage-accounting).
_Avoid_: deferred usage
