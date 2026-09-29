# pi-agent-summary

Shows elapsed runtime in Pi's working message and saves run summaries outside model context.

## Usage

When Pi settles, the transcript shows a summary such as:

```text
• anthropic/claude-opus-5-5:medium (48.2 tok/s) · 1m 23s · ran 4 commands · edited 3 files · +42 −11
```

The model and thinking level reflect the start of the run, not later switches. Runs without a selected model omit the model prefix.

Click a summary in fullscreen TUI to expand its local finish time and per-file changes; Pi's tool-output shortcut (default Ctrl+O) toggles all summaries in either TUI mode. [`pi-tool-display`](../pi-tool-display/README.md) aligns the summary marker with other message markers.

A run includes retries, follow-ups, and time waiting for user input. Cancellation and errors also produce summaries; a summary does not indicate success. Saved summaries render on resume when the extension is loaded. RPC, JSON, and print modes save statistics without a UI timer; shutdown or reload discards unfinished runs.

### Output throughput

`tok/s` divides reported output tokens (including reasoning) by assistant streaming time, excluding tool execution and gaps between responses. It is an approximate client-observed, time-weighted rate, not provider-side generation speed. Responses without positive output usage and elapsed streaming time do not contribute; runs without a usable measurement omit it.

### Tool statistics

`ran N commands` counts each agent `bash` call once, including failed, cancelled, or blocked calls. Script commands do not count separately; manual `!` and `!!` commands are excluded.

File statistics cover observed native `edit` and `write` operations, not bash-only changes or custom tools. Net counts compare original and final content, so reverted changes disappear; symlink aliases count as one file. Binary or unreadable files, unstable snapshots, failed writes, and [bounded diff limits](../../libs/src/bounded-diff/README.md#behavior) can leave statistics unavailable rather than zero. Totals include only files with available statistics; expand a summary to see the reason.

## Configuration

No extension-specific options or environment variables. The shared [coordinator](../../libs/src/working-message/README.md) combines `pi-agent-summary.elapsed` with other contributions, such as `pi-todo` activity. Reorder them with `/working-message`.

## Side effects

Appends one context-free `pi-agent-summary.summary` entry per settled run; it stores timing, model and throughput when available, command count, and file statistics or unavailability reasons. Entries do not trigger turns.

Observation may read targets before native writes; [shared file-mutation observation](../../libs/src/file-mutations/README.md) avoids duplicate reads with `pi-tool-display`. Contents and patches stay in memory. No directory scans, extra target writes, Git commands, or network requests.

Completion/shutdown clears only the elapsed-time contribution. Saving `/working-message` order writes coordinator settings.

## Validation

[Coverage specification](docs/testing.md).

Run [focused checks](../../../docs/development.md#focused-validation) for `pi-agent-summary`:

```sh
vpr 'pi-agent-summary#check'
vpr 'pi-agent-summary#test'
```

Manual TUI check: load with `pi-todo` and `pi-tool-display`, run `bash`, `edit`, and `write`, then confirm live elapsed time, compact/expanded statistics, fullscreen click and Ctrl+O toggles, and wrapping in a narrow terminal. Abort a run and resume the session to check timer cleanup and saved summaries.
