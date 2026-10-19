# pi-subagents

Long reviews and parallel investigations fill one conversation with every intermediate step. pi-subagents runs each piece in a separate Pi process and returns only its final result to your conversation. For example, send this prompt:

```text
Ask two subagents to review the parser and the documentation, then summarise their findings.
```

| When you…                                                         | Read                                                |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| Send input to a task, resume it, pick its model, or cancel it     | [Continue and cancel tasks](docs/tasks.md)          |
| Need to know when background results arrive and how waits work    | [Background results](docs/background-results.md)    |
| Turn on background shell commands                                 | [Background jobs](docs/jobs.md)                     |
| Script `/subagents` or read its JSON pages and transcript digests | [Commands](docs/commands.md)                        |
| Use the task panel, viewers, tool cards, or widget                | [Task panel, viewers, and cards](docs/interface.md) |
| Navigate, fork, or resume and want to know what a task keeps      | [Task history and branches](docs/history.md)        |
| Need to know how and when child processes stop                    | [Process shutdown](docs/shutdown.md)                |
| Add your own instructions to the `subagent` tool                  | [Subagent tool docs](docs/tool-docs.md)             |

## Usage

Your current Pi session is the supervisor. Its model calls `subagent` with a short `description` and a detailed `prompt`. Foreground calls wait for completion; `background: true` returns a task ID and delivers the result automatically. Each child starts with a fresh conversation in the same working directory. Supply the context it needs, and keep parallel edits in different files.

- Set `task_id` to continue a task: an inactive task resumes, and an active task receives input. Use `delivery: "steer"` to deliver input before the child's next model request instead of after its current work. See [continue and cancel tasks](docs/tasks.md#send-input-or-resume).
- Omit `model` and `thinking` to use the supervisor's current selection for a new task, or set `model` to `provider/id`. A resume repeats the selection that the task's latest run requested; see [model and thinking](docs/tasks.md#model-and-thinking).
- Aborting the supervisor's turn immediately force-stops its running foreground subtrees. It also cancels the calls that have not returned: queued calls, and background calls whose child has not started.
- Tree navigation, parent-session fork, and session switch force-stop all owned running subtrees, including background work. Restored tasks never restart automatically; see [task history](docs/history.md).
- Child dialogs appear with a `[subagent: <description>]` prefix. RPC clients answer them using Pi's [extension UI protocol](https://pi.dev/docs/latest/rpc-extension-ui).

The tools are model-only, so codemode scripts cannot invoke them. At `maxDepth`, `subagent` and `subagent_abort` are hidden. When `jobs` is off, `job` and `job_abort` are hidden.

### Background tasks

Background tasks survive turn aborts after their call returns. Use them only for independent work; wait for their automatic result instead of polling or duplicating their work.

By default, a ready result joins the run after the model's reply and its tool calls, before the next model request. After a normal reply, a supervisor stays busy while its direct background tasks run, until new input or an abort. For the [`resultDelivery`](#configuration) modes, the waits in print and JSON modes, and the exceptions, see [background results](docs/background-results.md).

### Cancel a task

The model calls `subagent_abort` with a `task_id` to cancel an active owned task. The task session remains resumable. For the result that each supervisor receives, see [cancel a task](docs/tasks.md#cancel-a-task).

### Background jobs

Set [`jobs`](#configuration) to `true` to give the model the `job` and `job_abort` tools. A job runs one shell command in the background, such as a build, a test run, a server, or a watcher. It is not a task: it has no child, no capacity slot, no model, and no usage.

The `job` call returns immediately with the job ID and the log file path. When the command exits, its result arrives like a task result, with the exit code and the end of the output. A turn abort does not stop jobs. Session changes, exit, and the end of a print, JSON, or child run stop jobs without a result. For the result envelope, exit codes, and stop conditions, see [background jobs](docs/jobs.md).

### Commands and task panel

Press **Ctrl+Alt+S** or run `/subagents` to open the task panel in TUI mode; elsewhere, `/subagents` returns the first JSON page. The panel lists task trees and jobs, and **Enter** opens a read-only transcript or log viewer.

Other `/subagents` subcommands list, show, and abort tasks and jobs, and `/subagents background` moves foreground work to the background. Each returns one JSON notification outside model context. See [commands](docs/commands.md) and [task panel, viewers, and cards](docs/interface.md).

## Configuration

Add `ext.pi-subagents` to Pi's global `settings.json` or the trusted project's `.pi/settings.json`. This example shows the default limits, jobs turned off, the default result delivery, and one docs file:

```json
{
  "ext.pi-subagents": {
    "maxDepth": 2,
    "maxConcurrent": 8,
    "maxQueued": 8,
    "jobs": false,
    "resultDelivery": "turn_end",
    "docs": ["prompts/subagent.md"]
  }
}
```

| Setting          | Meaning                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxDepth`       | A non-negative integer. `0` disables launches; `2` permits children and grandchildren.                                                                           |
| `maxConcurrent`  | A positive integer limiting the whole live task tree, including reserved launches and stopping processes.                                                        |
| `maxQueued`      | A non-negative integer limiting launches waiting for capacity in FIFO order. `0` rejects a launch when all slots are occupied.                                   |
| `jobs`           | A boolean. `true` gives the model the `job` and `job_abort` tools. The default is `false`. See [background jobs](docs/jobs.md).                                  |
| `resultDelivery` | `turn_end` (the default) or `settle`. Sets when task and job results reach a busy supervisor; see [delivery timing](docs/background-results.md#delivery-timing). |
| `docs`           | An array of Markdown file paths. Their text is added to the `subagent` tool description. See [subagent tool docs](docs/tool-docs.md).                            |

Settings load at session start and `/reload`. Valid trusted-project values override global values; invalid values are ignored. See Pi's [settings reference](https://pi.dev/docs/latest/settings) for its own settings.

Top-level launches queue FIFO when capacity is full. Nested launches fail immediately with the configured capacity in the error; a task never waits for capacity held by its own ancestors.

## Side effects

- Children have normal Pi tools and permissions. A research prompt does not make a child read-only, and there is no workspace isolation.
- Children inherit the environment, working directory, and project-trust decision.
- Children load their own configured extensions and tools. When Pi reports an absolute source path for this package, children also load it through `-e`; otherwise, their settings must load it.
- A child whose settings load another copy of the package fails to launch.
- Other supervisor CLI flags, including the supervisor's own `-e`, `--tools`, `--session-dir`, and `--no-session`, are not forwarded.
- Each task saves one Pi session for the child, and the child adds a `pi-subagents.marker` entry at the start of each run. Child session files are not automatically deleted.
- The supervisor adds two small entries for each run, whatever the child writes.
- While a run is live, a `<session_file>.lease/` directory blocks other resumes of the task. See [writer lease](docs/history.md#writer-lease).
- Child model calls can incur provider charges. Usage after a background call returns reaches supervisor totals only when its result is delivered; see [usage accounting](docs/background-results.md#usage-accounting).
- Successful compaction adds a hidden reminder of direct task IDs without starting a new turn. When `jobs` is on, the reminder also lists the jobs on the selected ancestry with their IDs, states, outcomes, and exit codes.
- Each job writes to `pi-job-<job_id>.log` in the OS temporary directory. Files are not automatically deleted. For the size limit and file access, see [log files](docs/jobs.md#log-files).
- The supervisor adds two small entries for each job, whatever the command writes.

### Limits

- Force-kill does not reverse file changes and can bypass child cleanup. After supervisor SIGKILL, a child that blocks shutdown can remain alive. See [process shutdown limits](docs/shutdown.md#limits).
- In a job, keep each process in the foreground of its command. A process that leaves the job's process group is outside job cleanup, and Windows has a parent-exit limit. See [job limits](docs/jobs.md#limits).
- A model can bypass extension depth limits by running Pi itself through `bash`.
- Tool output is truncated using Pi's 2,000-line and 50 KiB defaults.
- Linux has automated coverage. macOS uses the same process-group path but has not been verified. Windows code paths are untested and not officially supported.
- When a Node or Bun SDK host has no script file, children start with the `pi` command and without a shell. On Windows, this finds only a `pi.com` or `pi.exe`, not npm's `pi.cmd` shim.

## Validation

For maintainers, the offline e2e suite checks cleanup with real Pi processes and Linux `/proc`. See [coverage](docs/testing.md) and the [maintainer compatibility checklist](docs/pi-compatibility.md).

For the [manual terminal checks](docs/validation.md), run from the repository root:

```sh
vpr 'pi-subagents#validate:terminal' regular
```

Use `fullscreen` for Pi's fullscreen mode. The launcher turns on `jobs`. It prints a disposable workspace path and retains it for replay with `--reuse <directory>`. Exit Pi and check that its processes have stopped before removing that directory.
