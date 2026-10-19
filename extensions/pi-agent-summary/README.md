# pi-agent-summary

Long agent runs scroll past what changed, so pi-agent-summary shows a live timer and output rate and saves a summary after each run.

## Usage

When the agent finishes, the transcript shows a summary such as:

```text
• anthropic/claude-opus-5-5:medium (48.2 tok/s) · 1m 23s · ran 4 commands · edited 3 files · +42 -11
```

Summaries are saved in the session but never sent to the model.

A _run_ is everything from your prompt until the agent settles, including retries, follow-ups, and time spent waiting for your input. Cancelled and failed runs get summaries too, so a summary doesn't mean the run succeeded.

- In fullscreen mode, click a summary to show its local finish time and per-file changes.
- In either mode, Pi's tool-output shortcut (default **Ctrl+O**) toggles all summaries.
- Saved summaries show again when you resume a session with the extension loaded.
- With [pi-tool-display](../pi-tool-display/README.md), the summary marker lines up with other message markers.

### What the summary shows

| Segment          | Meaning                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Model prefix     | Each model that answered, with the thinking level Pi requested, in order of first use.                          |
| `tok/s`          | Approximate output rate, including reasoning, over the time the assistant spent streaming.                      |
| Duration         | The length of the run.                                                                                          |
| `ran N commands` | Each `bash` call the agent made, counted once. Commands you run yourself with `!` or `!!` are excluded.         |
| Counters         | Segments that other extensions add, such as `delegated 3 tasks`. See [counters](#counters).                     |
| `edited N files` | Files changed through Pi's native `edit` and `write` tools, with net added and removed lines such as `+42 -11`. |

Changes made through `bash` or custom tools aren't counted. Statistics for a file can be unavailable, for example for binary files; this is not the same as zero changes, and you can expand the summary to see why. While the agent works, the working message shows a live rate such as `160/s`. For how each value is measured and when it is left out, read [summary fields](docs/summary-fields.md).

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

To emit milestones or counters from your own extension, read [milestones and counters for extension authors](docs/milestones-and-counters.md). It covers the event channels, payload limits, and which run an emit joins.

### Other modes

RPC, JSON, and print modes save summaries without the live timer and rate. Shutdown or reload discards an unfinished run.

## Configuration

There are no options or environment variables. The live timer and rate are shown through the shared [working-message coordinator](../../libs/src/working-message/README.md) as `pi-agent-summary.elapsed` and `pi-agent-summary.throughput`, alongside other contributions such as `pi-todo` activity. Reorder them with `/working-message`.

## Side effects

- Appends one `pi-agent-summary.summary` entry per run, hidden from the model. It stores timing, answering models and throughput when known, milestones, counters, the command count, and file statistics or why they're unavailable. Entries don't start turns.
- May read a file before a native write, to compare contents. [Shared file-mutation observation](../../libs/src/file-mutations/README.md) avoids reading twice when pi-tool-display is also loaded. Contents and patches stay in memory.
- Never scans directories, writes extra files, runs Git, or makes network requests.
- When a run finishes or Pi shuts down, it clears only its own timer and rate from the working message.
- Saving an order in `/working-message` writes the coordinator's settings.

## Validation

Run the [package checks](../../../docs/development.md#focused-validation). For TUI changes, also check by hand.

Setup: load this extension with `pi-todo` and `pi-tool-display`, in regular and fullscreen modes.

| Do                                               | Expect                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Ask the agent to run `bash`, `edit`, and `write` | The timer counts up live, and a summary appears when it settles.                                           |
| Watch the working message during a long response | `n/s` estimates the response while text streams. After the response, it shows the run rate.                |
| Click a summary in fullscreen; press **Ctrl+O**  | Clicking toggles one summary; **Ctrl+O** toggles all of them. Expanded summaries show statistics per file. |
| Narrow the terminal                              | The summary wraps with a four-column indent, behind a `│` guide when the expanded file tree follows.       |
| Emit a long milestone during a run               | Its line shows above the summary, wraps with a two-column indent, and shows again after resume.            |
| Emit one counter twice during a run              | The summary line shows its segment with count 2 after the command count, and shows again after resume.     |
| Abort a run, then resume the session             | The timer and rate are gone, and saved summaries show again.                                               |

For maintainers, see [testing](docs/testing.md) and [Pi compatibility](docs/pi-compatibility.md).
