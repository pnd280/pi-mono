# pi-agent-summary

Shows elapsed agent runtime in Pi's working message. Saves duration, bash-call counts, and file-change statistics in the transcript without adding them to model context.

## Usage

The working message starts at `0s` when the agent starts and updates once per second. When Pi returns to idle, the transcript shows a summary:

```text
Worked for 1m 23s · 4 bash calls · 3 files · +42 −11
```

Added and removed line counts use the theme's diff colors. Other summary text stays dim. Zero counts are omitted. A run without bash calls or file changes shows only its duration. Use Pi's tool-output expansion shortcut (Ctrl+O by default) to show per-file statistics.

One summary covers all model turns, tool calls, automatic retries, compaction retries, and queued follow-ups until the agent settles. Time spent waiting for user input during a run is included. Cancellation and errors also produce a summary once Pi settles. The summary does not indicate task success.

Summaries survive session resume and render when this extension is loaded. RPC, JSON, and print modes save the same statistics without a UI update timer. Shutdown or reload discards an unfinished run without saving a partial summary.

### Tool statistics

#### Bash calls

Each agent `bash` call counts once, including failed, cancelled, and blocked calls. Commands inside a script do not count separately. Manual `!` and `!!` commands do not count.

#### File changes

Only `edit` and `write` targets are observed. Each resolved path counts once. The extension compares contents before the first observed call with contents after the latest result. Repeated edits produce net line counts. Fully reverted changes disappear, but creating an empty file still counts as a changed file.

Files changed only through bash or other tools are excluded. Other edits to an observed file between calls can enter its net comparison. Statistics assume local tools using Pi's path conventions.

#### Limits

File observations require valid UTF-8 source no larger than 64 KiB. Diff generation has limits of 2,000 added and removed lines in total, 50 ms, and a 128 KiB patch.

Binary, unreadable, oversized, or unstable observations appear as unavailable, with reasons in the expanded view. File and line totals include only files with available statistics. The summary shows `File changes partial` when only some file changes have statistics, or `File changes unavailable` when all observed changes are unavailable.

## Configuration

No extension-specific options or environment variables. The shared [working-message coordinator](../../libs/src/working-message/README.md) combines `pi-agent-summary.elapsed` with contributions such as task activity from `pi-todo`. Use `/working-message` to reorder components.

## Side effects

Appends one `pi-agent-summary.summary` custom entry per settled run. Each entry contains the duration, bash-call count, and per-file statistics or reasons statistics are unavailable. Entries never become model messages or trigger another turn. Invalid stored summaries are not rendered.

Reads `edit` and `write` targets before execution and after results. File contents and generated patches remain in memory and are not saved in summary entries. The extension does not scan directories, modify target files, run Git, or make network requests.

The elapsed-time component is cleared on completion or shutdown without clearing other components. Saving component order through `/working-message` updates the coordinator's settings files.

## Validation

Run the [focused checks](../../../docs/development.md#focused-validation) for `pi-agent-summary`:

```sh
vpr 'pi-agent-summary#check'
vpr 'pi-agent-summary#test'
```

For a visual check:

1. Load the extension with `pi-todo` and run a prompt that uses `bash`, `edit`, and `write`. Confirm that elapsed time updates alongside task activity.
2. After the run settles, confirm that line counts use diff colors and expanding tool output shows per-file statistics.
3. Start another run and abort it. Confirm that one summary appears and the timer stops.
4. Resume the session. Confirm that saved summaries appear.
