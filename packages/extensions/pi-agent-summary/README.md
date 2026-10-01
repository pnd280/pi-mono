# pi-agent-summary

Long agent runs scroll past what changed. pi-agent-summary shows how long the agent has been working, and after each run adds a one-line summary of what it did: which models answered, how long it took, commands run, and files changed. Summaries are saved in the session but never sent to the model.

## Usage

When the agent finishes, the transcript shows a summary such as:

```text
• anthropic/claude-opus-5-5:medium (48.2 tok/s) · 1m 23s · ran 4 commands · edited 3 files · +42 −11
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

### Commands

`ran N commands` counts each `bash` call the agent made once, including failed, cancelled, or blocked calls. Commands inside a script don't count separately, and commands you run yourself with `!` or `!!` are excluded.

### File changes

File statistics come from Pi's native `edit` and `write` tools only; changes made through `bash` or custom tools aren't counted.

- Counts compare each file's original and final content, so a change that was reverted disappears.
- Symlink aliases count as one file.
- Statistics are unavailable, not zero, for binary or unreadable files, files that changed during observation, failed writes, and files over the [diff limits](../../libs/src/bounded-diff/README.md#behaviour). Expand the summary to see why.
- Totals include only files with available statistics.

### Other modes

RPC, JSON, and print modes save summaries without the live timer. Shutdown or reload discards an unfinished run.

## Configuration

There are no options or environment variables. The live timer is shown through the shared [working-message coordinator](../../libs/src/working-message/README.md) as `pi-agent-summary.elapsed`, alongside other contributions such as `pi-todo` activity. Reorder them with `/working-message`.

## Side effects

- Appends one `pi-agent-summary.summary` entry per run, hidden from the model. It stores timing, answering models and throughput when known, the command count, and file statistics or why they're unavailable. Entries don't start turns.
- May read a file before a native write, to compare contents. [Shared file-mutation observation](../../libs/src/file-mutations/README.md) avoids reading twice when pi-tool-display is also loaded. Contents and patches stay in memory.
- Never scans directories, writes extra files, runs Git, or makes network requests.
- When a run finishes or Pi shuts down, it clears only its own timer from the working message.
- Saving an order in `/working-message` writes the coordinator's settings.

## Validation

Run the [package checks](../../../docs/development.md#focused-validation). For TUI changes, also check by hand.

Setup: load this extension with `pi-todo` and `pi-tool-display`.

| Do                                               | Expect                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Ask the agent to run `bash`, `edit`, and `write` | The timer counts up live, and a summary appears when it settles.                                           |
| Click a summary in fullscreen; press **Ctrl+O**  | Clicking toggles one summary; **Ctrl+O** toggles all of them. Expanded summaries show statistics per file. |
| Narrow the terminal                              | The summary wraps with a two-column indent.                                                                |
| Abort a run, then resume the session             | The timer is gone, and saved summaries show again.                                                         |

See the maintainer guides [testing](docs/testing.md) and [Pi compatibility](docs/pi-compatibility.md).
