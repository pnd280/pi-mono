# pi-agent-summary

Shows elapsed runtime in Pi's working message and saves duration, bash-call counts, and file-change statistics outside model context.

## Usage

When Pi settles, the transcript shows:

```text
Worked for 1m 23s · 4 bash calls · 3 files · +42 −11
```

Left-click a summary in fullscreen TUI to toggle its per-file statistics independently. Pi's tool-output shortcut (default Ctrl+O) toggles all summaries in either TUI mode.

A run includes model turns, tool calls, automatic/compaction retries, queued follow-ups, and time waiting for user input. Cancellation and errors also produce summaries; summaries do not indicate success.

Saved summaries render on resume when the extension is loaded. RPC, JSON, and print modes save the same statistics without a UI timer. Shutdown/reload discards unfinished runs.

### Tool statistics

#### Bash calls

Each agent `bash` call counts once, including failed, cancelled, or blocked calls. Script commands do not count separately; manual `!` and `!!` commands are excluded.

#### File changes

Statistics cover native `edit` and `write` verified against Pi 0.86.1. Failures before a disk-write attempt add no file. Canonical paths deduplicate symlink aliases.

Net counts compare content before the first observed write attempt with final written content; unavailable intermediate snapshots do not matter if both endpoints exist. Reverted changes disappear; creating an empty file still counts.

Bash-only changes, SDK overrides, custom tools, and unverified definitions are excluded. Other changes between observed native operations can enter the net comparison.

#### Limits

Snapshots require valid UTF-8, at most 8 MiB each. Per-run retained original/final text is limited to 16 MiB measured as UTF-16.

Generated diffs are limited to 2,000 total added/removed lines, 50 ms from worker dispatch to returned patch, 128 KiB per patch, and [shared worker limits](../../libs/src/bounded-diff/README.md#behavior). For a single edit, a native patch within 128 KiB can supply statistics despite source, retention, or generation limits.

Binary/unreadable files, unstable snapshots, failed final writes, and exceeded limits can make statistics unavailable. Expanded views explain why; totals include only files with available statistics.

## Configuration

No extension-specific options or environment variables. The shared [coordinator](../../libs/src/working-message/README.md) combines `pi-agent-summary.elapsed` with other contributions, such as `pi-todo` activity. Reorder them with `/working-message`.

## Side effects

Appends one `pi-agent-summary.summary` entry per settled run with duration, bash count, and per-file statistics or unavailability reasons. Entries never enter model context or trigger turns; invalid stored summaries are hidden.

Observation adds a bounded read before native `write`, reuses native `edit` reads, and never reads after writing. Observations are [shared](../../libs/src/file-mutations/README.md) with `pi-tool-display` without duplicate reads. Contents and patches stay in memory. No directory scans, extra target writes, Git commands, or network requests.

Completion/shutdown clears only the elapsed-time contribution. Saving `/working-message` order writes coordinator settings.

## Validation

Run [focused checks](../../../docs/development.md#focused-validation) for `pi-agent-summary`:

```sh
vpr 'pi-agent-summary#check'
vpr 'pi-agent-summary#test'
```

Visual checks:

1. Load with `pi-todo`; run a prompt using `bash`, `edit`, and `write`. Check elapsed time alongside task activity and diff-colored line counts after settling.
2. In fullscreen, click summaries independently; verify dragging selects text and the wheel scrolls.
3. Check Ctrl+O toggles all summaries in regular and fullscreen modes.
4. Abort another run; expect one summary and a stopped timer.
5. Resume the session; confirm saved summaries appear.
