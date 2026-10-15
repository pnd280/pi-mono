# pi-agent-summary

Long agent runs scroll past what changed. pi-agent-summary shows how long the agent has been working and how fast it streams output, and after each run adds a short summary of what it did: which models answered, how long it took, commands run, files changed, and counters and milestones that other extensions report. Summaries are saved in the session but never sent to the model.

## Usage

When the agent finishes, the transcript shows a summary such as:

```text
• anthropic/claude-opus-5-5:medium (48.2 tok/s) · 1m 23s · ran 4 commands · edited 3 files · +42 -11
```

A _run_ is everything from your prompt until the agent settles, including retries, follow-ups, and time spent waiting for your input. Cancelled and failed runs get summaries too, so a summary doesn't mean the run succeeded.

- In fullscreen mode, click a summary to show its local finish time and per-file changes.
- In either mode, Pi's tool-output shortcut (default **Ctrl+O**) toggles all summaries.
- Saved summaries show again when you resume a session with the extension loaded.
- With [pi-tool-display](../pi-tool-display/README.md), the summary marker lines up with other message markers.

### Models

The prefix lists each model that answered, with the thinking level Pi requested, in order of first use, for example `openai-codex/gpt-5.5:high → openai-codex/gpt-5.5-mini:medium`.

- Under a Pi virtual model, these are the physical models it routed to.
- Interrupted responses count. Requests that ended in an error don't.
- Runs with no response have no prefix.

### Output throughput

`tok/s` is the reported output tokens, including reasoning, divided by the time the assistant spent streaming. Tool execution and gaps between responses are excluded.

It's an approximate rate seen from the client, not the provider's generation speed. Responses with no output usage or no streaming time are left out, and a run with nothing to measure shows no rate.

While the agent works, the working message refreshes the rate once a second in whole tokens per second, such as `160/s`:

- While a response streams text or tool input, it estimates that response at four characters per token, because most providers report output usage only at completion. The first non-empty update starts the clock; later updates supply the count. Thinking is excluded because providers hide or summarise it differently. During pauses, the estimate decreases until more visible output arrives or the response ends.
- Before a live estimate is available and between responses, it shows the run rate from completed responses, rounded to a whole number. If no response has reported measurable usage, no rate appears until a live estimate is available. The saved summary shows the final run rate to one decimal place.

### Commands

`ran N commands` counts each `bash` call the agent made once, including failed, cancelled, or blocked calls. Commands inside a script don't count separately, and commands you run yourself with `!` or `!!` are excluded.

### File changes

File statistics come from Pi's native `edit` and `write` tools only; changes made through `bash` or custom tools aren't counted.

- Counts compare each file's original and final content, so a change that was reverted disappears.
- Symlink aliases count as one file.
- Statistics are unavailable, not zero, for binary or unreadable files, files that changed during observation, failed writes, and files over the [diff limits](../../libs/src/bounded-diff/README.md#behaviour). Expand the summary to see why.
- Totals include only files with available statistics.

### Milestones

Other extensions can declare a _milestone_, such as a published release or an opened pull request, for the active run. Each milestone shows as its own `◆` line above the summary line:

```text
◆ Published v1.2.0
◆ Opened PR #42: Release v1.2.0
• anthropic/claude-opus-5-5:medium (48.2 tok/s) · 1m 23s · ran 4 commands
```

To declare one, emit `{ text }` on Pi's event bus. With this extension not loaded, nothing happens.

```ts
pi.events.emit("pi-agent-summary:milestone", { text: "Published v1.2.0" });
```

Workspace packages can import `milestoneChannel` and the `Milestone` type from `pi-agent-summary/milestones`.

- A milestone joins only the active run. Milestones declared before the first `agent_start`, or after pi-agent-summary clears the run in its `agent_settled` handler, are dropped.
- Text is trimmed and must have 1 to 200 characters; other payloads are ignored. Whitespace is collapsed for display, and long text wraps with a two-column indent.
- Repeated text in one run is kept once. A run keeps its first 20 milestones and drops the rest.

### Counters

Other extensions can add to a _counter_, such as delegated tasks, during the active run. Each counter shows as a segment of the summary line, after the command count and before the file changes:

```text
• anthropic/claude-opus-5-5:medium (48.2 tok/s) · 1m 23s · ran 4 commands · delegated 3 tasks · edited 3 files · +42 -11
```

Each emit adds 1. With this extension not loaded, nothing happens.

```ts
pi.events.emit("pi-agent-summary:counter", {
  id: "pi-subagents.delegated",
  verb: "delegated",
  singular: "task",
  plural: "tasks"
});
```

Workspace packages can import `counterChannel` and the `Counter` type from `pi-agent-summary/counters`. [pi-subagents](../pi-subagents/README.md#usage) counts delegated tasks this way. It also counts [started jobs](../pi-subagents/README.md#background-jobs) with the `pi-subagents.jobs` counter, shown as `started N jobs`.

- A counter adds only to the run that is active when it is emitted, with the same rule as milestones.
- Emits with the same `id` share one count. The labels of the first emit in the run stay.
- `id` must have 1 to 64 characters, and `verb`, `singular`, and `plural` must have 1 to 32 characters after trimming; other payloads are ignored.
- Segments follow the order of each counter's first emit. A run keeps its first 10 counters and ignores new ids after that.

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

See the maintainer guides [testing](docs/testing.md) and [Pi compatibility](docs/pi-compatibility.md).
