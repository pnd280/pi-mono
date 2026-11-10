# pi-agent-summary

Long agent runs scroll past what changed, so pi-agent-summary shows a live timer and output rate while the agent works and saves a summary after each run. The summary lists the models, the output rate, the duration, the commands, the edited files, and the milestones and counters that other extensions add.

When the agent finishes, the transcript shows a summary such as:

```text
• anthropic/claude-opus-5-5:medium (48.2 tok/s) · 1m 23s · ran 4 commands · edited 3 files · +42 -11
```

## Controls

| Control            | Effect                                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Click a summary    | In fullscreen mode only, expand or collapse that summary to show its local finish time and per-file changes.                                                                                       |
| **Ctrl+O**         | Pi's tool-output shortcut (the default key) also expands or collapses all summaries, in regular and fullscreen modes.                                                                              |
| `/working-message` | Reorder the live timer and rate among the other working-message contributions. Interactive TUI mode only. This extension or another extension that uses the working message registers the command. |

## Usage

pi-agent-summary saves summaries in the session but never sends them to the model.

A _run_ is everything from your prompt until the agent settles, including retries, follow-ups, and time spent waiting for your input. Cancelled and failed runs get summaries too, so a summary doesn't mean the run succeeded.

- Saved summaries show again when you resume a session with the extension loaded.
- With [pi-tool-display](../pi-tool-display/README.md), the summary marker lines up with other message markers.
- RPC, JSON, and print modes save summaries without the live timer and rate.
- Quitting Pi or switching sessions during a run cancels the run, and the cancelled run gets a summary.
- A run gets no summary when Pi is killed before the run settles, or when you quit, reload, or switch sessions just after it settles, while its file changes are still being compared.

pi-agent-summary has no settings or environment variables. It shows the live timer and rate in the working message as `pi-agent-summary.elapsed` and `pi-agent-summary.throughput`, alongside other contributions such as `pi-todo` activity.

### What the summary shows

| Segment          | Meaning                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Model prefix     | Each model that answered, with the thinking level Pi requested, in order of first use.                          |
| `tok/s`          | Approximate output rate, including reasoning, over the time the assistant spent streaming.                      |
| Duration         | The length of the run.                                                                                          |
| `ran N commands` | Each `bash` call the agent made, counted once. Commands you run yourself with `!` or `!!` are excluded.         |
| Counters         | Segments that other extensions add, such as `delegated 3 tasks`. See [counters](#counters).                     |
| `edited N files` | Files changed through Pi's native `edit` and `write` tools, with net added and removed lines such as `+42 -11`. |

Changes made through `bash` or custom tools aren't counted. Statistics for a file can be unavailable, for example for binary files or when another writer changed the file between native edits. Unavailable statistics are not the same as zero changes; expand the summary to see why. While the agent works, the working message shows a live rate such as `160/s`. For how each value is measured and when it is left out, read [summary fields](docs/summary-fields.md).

### Milestones

Other extensions can declare a _milestone_, such as a published release or an opened pull request, for the active run. Each milestone shows as its own `◆` line above the summary line:

```text
◆ Published v1.2.0
◆ Opened PR #42: Release v1.2.0
• anthropic/claude-opus-5-5:medium (48.2 tok/s) · 1m 23s · ran 4 commands
```

### Counters

Other extensions can add to a _counter_, such as delegated tasks, during the active run. Each counter shows as a segment of the summary line, after the command count and before the file changes:

```text
• anthropic/claude-opus-5-5:medium (48.2 tok/s) · 1m 23s · ran 4 commands · delegated 3 tasks · edited 3 files · +42 -11
```

[pi-subagents](../pi-subagents/README.md#usage) counts delegated tasks this way. It also counts [started jobs](../pi-subagents/docs/jobs.md#start-a-job) with the `pi-subagents.jobs` counter, shown as `started N jobs`.

## Side effects

- Appends one `pi-agent-summary.summary` entry per run, hidden from the model. It stores timing, answering models and throughput when known, milestones, counters, the command count, and file statistics or why they're unavailable. Entries don't start turns.
- May read a file before a native write, to compare contents. When pi-tool-display is also loaded, the file is read only once. Contents and patches stay in memory.
- Never scans directories, writes extra files, runs Git, or makes network requests.
- When a run finishes or Pi shuts down, it clears only its own timer and rate from the working message.
- Saving an order in `/working-message` writes it to Pi's global or trusted-project settings.

## Docs

| When you…                                                                                    | Read                                                                             |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Want to know how each summary value is measured and when it is left out                      | [Summary fields](docs/summary-fields.md)                                         |
| Emit milestones or counters: the event channels, payload limits, and which run an emit joins | [Milestones and counters for extension authors](docs/milestones-and-counters.md) |
| Change tests or check TUI changes by hand                                                    | [Test coverage](docs/testing.md)                                                 |
| Upgrade Pi or change how runs are observed                                                   | [Pi compatibility](docs/pi-compatibility.md)                                     |
