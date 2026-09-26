# pi-agent-summary

Shows elapsed runtime in Pi's working message and saves run summaries outside model context.

## Usage

When Pi settles, the transcript shows:

```text
claude-opus-5-5:medium · 1m 23s (2:34:56 PM) · 4 bash calls · 3 files changed · +42 −11
```

The model ID (without its provider) and thinking level are captured when the run begins. Changes during the run do not update the summary. This prefix is omitted if no model was selected or the summary was saved before model capture.

Finish times use your local timezone. Statistics appear on the same line when there are bash calls or observed files, including files whose statistics are unavailable. Narrow terminals wrap the line as needed.

Left-click a summary in fullscreen TUI to toggle its per-file statistics independently. Pi's tool-output shortcut (default Ctrl+O) toggles all summaries in either TUI mode.

A run includes model turns, tool calls, automatic/compaction retries, queued follow-ups, and time waiting for user input. Cancellation and errors also produce summaries; summaries do not indicate success.

Saved summaries render on resume when the extension is loaded. Invalid summaries, including entries without a finish timestamp, are hidden.

RPC, JSON, and print modes save the same statistics without a UI timer. Shutdown/reload discards unfinished runs.

### Tool statistics

#### Bash calls

Each agent `bash` call counts once, including failed, cancelled, or blocked calls. Script commands do not count separately; manual `!` and `!!` commands are excluded.

#### File changes

Statistics cover native `edit` and `write` verified against Pi 0.87.1. Failures before a disk-write attempt add no file. Canonical paths deduplicate symlink aliases.

Net counts compare content before the first observed write attempt with final written content; unavailable intermediate snapshots do not matter if both endpoints exist. Reverted changes disappear; creating an empty file still counts.

Bash-only changes, SDK overrides, custom tools, and unverified definitions are excluded. Other changes between observed native operations can enter the net comparison.

#### Limits

Snapshots require valid UTF-8, at most 8 MiB each. Per-run retained original/final text is limited to 16 MiB measured as UTF-16.

Generated diffs are limited to 2,000 total added/removed lines, 50 ms from worker dispatch to returned patch, 128 KiB per patch, and [shared worker limits](../../libs/src/bounded-diff/README.md#behavior). For a single edit, a native patch within 128 KiB can supply statistics despite source, retention, or generation limits.

Binary/unreadable files, unstable snapshots, failed final writes, and exceeded limits can make statistics unavailable. Both compact and expanded views show `Statistics unavailable for N files`; expanded views explain each reason. Change totals include only files with available statistics.

## Configuration

No extension-specific options or environment variables. The shared [coordinator](../../libs/src/working-message/README.md) combines `pi-agent-summary.elapsed` with other contributions, such as `pi-todo` activity. Reorder them with `/working-message`.

## Side effects

Appends one `pi-agent-summary.summary` entry per settled run with duration, finish timestamp, model ID and thinking level when available, bash count, and per-file statistics or unavailability reasons. Entries never enter model context or trigger turns.

Observation adds a bounded read before native `write`, reuses native `edit` reads, and never reads after writing. Observations are [shared](../../libs/src/file-mutations/README.md) with `pi-tool-display` without duplicate reads. Contents and patches stay in memory. No directory scans, extra target writes, Git commands, or network requests.

Completion/shutdown clears only the elapsed-time contribution. Saving `/working-message` order writes coordinator settings.

## Validation

[Coverage specification](docs/testing.md).

Run [focused checks](../../../docs/development.md#focused-validation) for `pi-agent-summary`:

```sh
vpr 'pi-agent-summary#check'
vpr 'pi-agent-summary#test'
```

Visual checks:

1. Load with `pi-todo`; run a prompt using `bash`, `edit`, and `write`. Check elapsed time alongside task activity, then a compact summary with the model and thinking level, duration, local finish time, and diff-colored statistics. Resize to a narrow terminal and confirm the summary wraps without losing statistics.
2. In fullscreen, click summaries independently; verify dragging selects text and the wheel scrolls.
3. Check Ctrl+O toggles all summaries in regular and fullscreen modes.
4. Abort another run; expect one summary and a stopped timer.
5. Resume the session; confirm saved summaries retain their captured model, thinking level, and finish time.
