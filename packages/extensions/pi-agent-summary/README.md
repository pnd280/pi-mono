# pi-agent-summary

Shows elapsed runtime in Pi's working message and saves run summaries outside model context.

## Usage

When Pi settles, the transcript shows:

```text
• anthropic/claude-opus-5-5:medium (48.2 tok/s) · 1m 23s · ran 4 commands · edited 3 files · +42 −11
```

The run captures the model provider, ID, and thinking level at its start; later changes do not update the summary. Summaries without model metadata omit the model prefix, including runs with no selected model. Summaries with model metadata but no provider are hidden.

The italic summary starts with `•` and shows the model, available throughput, duration, command and file statistics, and notices for unavailable file statistics on one line. Throughput, command-count, and edited-file-count numbers are bold. Its marker aligns with assistant and tool markers when [`pi-tool-display`](../pi-tool-display/README.md) is loaded. Narrow terminals wrap continuation lines with a two-column indent aligned to the metadata.

Expanded (verbose) summaries also show the exact finish time in your local timezone after the duration, with per-file statistics on subsequent indented lines. Left-click a summary in fullscreen TUI to toggle these details independently, even when there are no file changes. Pi's tool-output shortcut (default Ctrl+O) toggles all summaries in either TUI mode.

A run includes model turns, tool calls, automatic/compaction retries, queued follow-ups, and time waiting for user input. Cancellation and errors also produce summaries; summaries do not indicate success.

Saved summaries render on resume when the extension is loaded. Invalid summaries, including entries without a finish timestamp, are hidden.

RPC, JSON, and print modes save the same statistics without a UI timer. Shutdown/reload discards unfinished runs.

### Output throughput

Throughput appears in parentheses next to the model, or as a separate statistic when model metadata is absent.

`tok/s` is total reported output tokens divided by the combined assistant streaming time, rounded to one decimal place. Each response is timed monotonically from `message_start` to `message_end`; tool execution, retry delays, and other gaps between responses are excluded. This is a time-weighted run average, not an average of individual response rates.

Output tokens include provider-reported reasoning tokens, counted once. Input/cache tokens and nested tool usage are excluded. Cancelled and failed responses contribute when they report positive output usage and have positive elapsed time. Unfinished responses, zero-duration responses, and responses without positive output usage are excluded from both totals. Runs without a usable measurement omit `tok/s`.

This is approximate client-observed throughput, not provider-side generation speed. Provider stream-start timing and usage reporting vary, so request startup latency may be excluded. Saved summaries retain the measured token and time totals for replay.

### Tool statistics

#### Bash calls

`ran N commands` counts each agent `bash` call once, including failed, cancelled, or blocked calls. Script commands do not count separately; manual `!` and `!!` commands are excluded.

#### File changes

Statistics cover native `edit` and `write` verified against Pi 0.87.1. Failures before a disk-write attempt add no file. Canonical paths deduplicate symlink aliases.

Net counts compare content before the first observed write attempt with final written content; unavailable intermediate snapshots do not matter if both endpoints exist. Reverted changes disappear; creating an empty file still counts.

Bash-only changes, SDK overrides, custom tools, and unverified definitions are excluded. Other changes between observed native operations can enter the net comparison.

#### Limits

Snapshots require valid UTF-8, at most 8 MiB each. Per-run retained original/final text is limited to 16 MiB measured as UTF-16.

Generated diffs are limited to 2,000 total added/removed lines, 50 ms from worker dispatch to returned patch, 128 KiB per patch, and [shared worker limits](../../libs/src/bounded-diff/README.md#behavior). A single native edit patch within 128 KiB can supply statistics despite source, retention, or generation limits.

Binary/unreadable files, unstable snapshots, failed final writes, and exceeded limits can make statistics unavailable. Both compact and expanded views show `Statistics unavailable for N files`; expanded views explain each reason. Change totals include only files with available statistics.

## Configuration

No extension-specific options or environment variables. The shared [coordinator](../../libs/src/working-message/README.md) combines `pi-agent-summary.elapsed` with other contributions, such as `pi-todo` activity. Reorder them with `/working-message`.

## Side effects

Appends one `pi-agent-summary.summary` entry per settled run with duration, finish timestamp, model provider, ID, and thinking level when available, output-throughput totals when measurable, bash count, and per-file statistics or unavailability reasons. Entries never enter model context or trigger turns.

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

1. Load with `pi-todo` and `pi-tool-display`; run a prompt using `bash`, `edit`, and `write`. Check elapsed time alongside task activity, then a summary starting with `•` aligned with assistant and tool markers, the provider, model, and thinking level followed by output `tok/s` in parentheses, duration, command counts, and diff-colored file statistics on one line. Confirm the summary line is italic with bold throughput, command-count, and edited-file-count numbers, and the exact finish time is hidden when collapsed. Resize to a narrow terminal and confirm the summary wraps without losing statistics.
2. In fullscreen, click summaries independently, including one without file changes; confirm expansion reveals the local finish time and any per-file details. Verify dragging selects text and the wheel scrolls.
3. Check Ctrl+O toggles all summaries in regular and fullscreen modes; throughput stays visible in both views.
4. Abort another run; expect one summary and a stopped timer.
5. Resume the session; confirm saved summaries retain their captured provider, model, thinking level, finish time, and output throughput.
