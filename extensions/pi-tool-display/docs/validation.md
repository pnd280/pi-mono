# Tool display validation for maintainers

[pi-tool-display](../README.md)

Run the terminal scenarios for changes to clicks, keys, or layout. Use the glossary to distinguish [exploration groups and runs](../GLOSSARY.md#transcript-structure).

## Terminal launcher

Setup: complete [workspace setup](../../../../README.md#setup). The offline fixture needs a Unix Bash backend.

1. From the repository root, launch regular mode:

   ```sh
   vpr 'pi-tool-display#validate:terminal' regular
   ```

2. Work only in the printed `Fixture directory`. It contains isolated files, settings, history, a disposable Git repository, and an offline provider. Never point the launcher at real agent or project directories.
3. The fixture starts in summary mode, which renders compact cards in regular mode. In fullscreen, stay in summary mode for summary checks, and press **Ctrl+O** once for the compact cards the other prompts describe.
4. Enter a prompt from the table below. Except for skipped prompts and `cancel`, wait for `Fixture finished: <prompt>` before inspecting. Some calls fail on purpose.
5. Exit with **Ctrl+D** in an empty editor. Repeat in fullscreen with a fresh workspace:

   ```sh
   vpr 'pi-tool-display#validate:terminal' fullscreen
   ```

| Prompt          | Scenario                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary`       | In fullscreen summary mode, three summary lines. Run once per fresh workspace; see [summary mode](#summary-mode).                                                                       |
| `explore`       | Repeated reads, a missing-file diagnostic, and a listing, in source order.                                                                                                              |
| `scopes`        | A three-call `.` group, a four-call `src` group, and a standalone read of `b.ts`, with mixed actions, repeated reads, and a failed read.                                                |
| `native-mixed`  | One native group with one list, one search, and three reads, including repeated ranges.                                                                                                 |
| `normalization` | One four-call native group using relative, absolute, `./`, `../`, and trailing-slash paths.                                                                                             |
| `exceptions`    | One four-read group with a missing-file failure and a PNG image.                                                                                                                        |
| `filenames`     | Spaces, Unicode, and a long filename. Targets wrap without truncation and keep `:15-16` ranges intact.                                                                                  |
| `thinking`      | Four reads with thinking between calls and a visible explanation before the third read. Collapsed thinking gives two two-read groups; visible thinking gives four standalone cards.     |
| `buffered`      | Buffered thinking and tool events, then repeated tool names. In order: `shell one`, `shell two`, a two-read group, `shell three`, `shell four`, a standalone read.                      |
| `fff`           | Two literal-filter groups, a standalone FFF search, then a native group with a list and a read. Needs the [FFF extension and launch flags](#fff); skipped if the tools are unavailable. |
| `diff`          | A creation and edits, including separated hunks. Run once per fresh workspace; repeating the exact-match edits fails on purpose.                                                        |
| `output`        | Live output over the retention budget, saved-file expansion, and a separate nonzero exit.                                                                                               |
| `cancel`        | A long-running shell call. Press **Esc** while it runs.                                                                                                                                 |
| `images`        | A native image read between text reads.                                                                                                                                                 |
| `public`        | A `display_fixture_read` card drawn by the standalone renderer factory.                                                                                                                 |

### Replay and launch options

Reopen a printed fixture without resetting its files:

```sh
vpr 'pi-tool-display#validate:terminal' fullscreen --reuse /tmp/pi-tool-display-terminal-EXAMPLE
```

| Option              | Use                                           |
| ------------------- | --------------------------------------------- |
| `--reuse <dir>`     | Reopen an existing fixture for replay checks. |
| `--use-theme light` | Appearance checks in the light theme.         |
| `--print explore`   | Create a non-TUI history to replay.           |
| `--help`            | Full argument syntax.                         |

Keep the fixture directory until replay checks are done. After all fixture sessions exit, remove only that directory.

## Host interaction checks

Use the fixture to compare live output with saved-session replay after expansion, scrolling, and resizing.

### Expansion, layout, and diffs

Setup: fullscreen fixture, compact mode.

| Do                                                                                                             | Expect                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Click cards and groups, before and after scrolling and resizing.                                               | Only the clicked card or group expands.                                                                                   |
| Click cards, groups, summary lines, run rules, and notice headers with Shift, Alt, or Ctrl held.               | Nothing expands, collapses, or opens.                                                                                     |
| Scroll with the wheel in each mode.                                                                            | The transcript scrolls.                                                                                                   |
| In regular mode, use the terminal's mouse selection.                                                           | The terminal keeps mouse control.                                                                                         |
| Check MCP and generic [card layout](presentation.md#card-layout) in dark and light, wide and narrow.           | Arguments stay visible.                                                                                                   |
| Repeat with other specialised cards, collapsed and expanded.                                                   | Parameter blocks stay hidden.                                                                                             |
| In `summary` and `thinking`, watch streaming, replay, resize, and **Ctrl+T** in every mode.                    | Assistant prose keeps one `•` marker with [hanging alignment](presentation.md#assistant-prose).                           |
| Repeat while inspecting user messages, thinking, and diagnostics.                                              | These rows have no assistant markers.                                                                                     |
| Follow a link and inspect Markdown in those scenarios.                                                         | Markdown renders, and the link opens.                                                                                     |
| Set `showParameters: true` under `ext.pi-tool-display` in the fixture's `agent/settings.json`, then `/reload`. | Parameters appear.                                                                                                        |
| Repeat with a trusted `work/.pi/settings.json`.                                                                | Project values replace global values key by key, as the [configuration merge rules](../README.md#configuration) describe. |
| Run `diff`, resize between unified and side-by-side, and expand the whole card.                                | Changes stay visible.                                                                                                     |
| Inspect the diff panel edges.                                                                                  | The panel follows the [full-width layout](presentation.md#diff-viewer), without a tree connector.                         |
| Inspect changed-row backgrounds.                                                                               | Backgrounds stop before separators and following content.                                                                 |

### Subagent cards

Setup: launch the [subagent fixture](../../pi-subagents/README.md#validation) with `-e "$PWD/packages/extensions/pi-tool-display/index.ts"`, in regular and then fullscreen mode. Use compact mode (`collapsedMode: "compact"`).

| Do                                                                                                                                             | Expect                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Run `delegate-reply`.                                                                                                                          | Completed cards follow the [three-line or four-line reply preview rule](tools.md#results-and-expansion) under a `└` branch. |
| Expand the completed card.                                                                                                                     | The full result appears once.                                                                                               |
| Compare generic cards in the same fixture.                                                                                                     | Generic cards keep the generic layout.                                                                                      |
| Run `background-slow` and wait for its result.                                                                                                 | The result uses the subagent card layout without the `<task>` envelope.                                                     |
| In fullscreen, click that result.                                                                                                              | The click opens the task.                                                                                                   |
| In the same fixture, run `job-barrier`.                                                                                                        | The call card shows the description, `↗ returned; job continues in background`, the command, and a short job ID.            |
| Create `job-release` in the work directory.                                                                                                    | The result shows the outcome, run time, exit code, and log path.                                                            |
| Inspect the collapsed result body.                                                                                                             | It previews output without the `<job>` envelope.                                                                            |
| In fullscreen, click the `job` card, then the job result.                                                                                      | Each click opens the job.                                                                                                   |
| Delete `job-release`, run `job-barrier` again, and make sure that `/subagents jobs` shows the job as active. Then run `job-abort-id <job_id>`. | The abort card shows the job description and `⊘ aborted`.                                                                   |

### Summary mode

Setup: fullscreen fixture in summary mode unless a row says otherwise.

| Do                                                                                            | Expect                                                                                                                           |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Run `summary` once per fresh workspace and inspect its first line.                            | `Read 2 files · ran 2 commands (1 failed) · created 1 file · edited 1 file` (the check command runs twice, and both runs count). |
| Inspect its second line.                                                                      | `Read 1 file · listed 1 dir`.                                                                                                    |
| Watch the tail shell while it runs.                                                           | Its run keeps compact cards.                                                                                                     |
| Wait for the agent to finish.                                                                 | The tail run collapses to one summary line.                                                                                      |
| Repeat, clicking the shell card while it runs, then wait for the agent to finish.             | The run stays open with the [documented collapse controls](presentation.md#opening-and-closing-a-run).                           |
| Click the run's summary line or its `▴ collapse` bar.                                         | The run returns to its [summary line](presentation.md#line-layout).                                                              |
| Inspect summary lines in the dark and light themes, at full width and at 52 columns.          | They follow the [line layout](presentation.md#line-layout): one full-width bar, call count at the right.                         |
| Open the run again.                                                                           | Individual cards keep their expansion state.                                                                                     |
| Repeat with a single-card run and a run ending in an image, after resize and group expansion. | The bottom control stays below all output and images.                                                                            |
| Click the image.                                                                              | The run stays open.                                                                                                              |
| Click a summary line.                                                                         | The run opens to compact cards, where group and card clicks work as usual.                                                       |
| Press **Ctrl+O** with a run open.                                                             | The run closes.                                                                                                                  |
| Press **Ctrl+O** repeatedly.                                                                  | Status reads "Tool output: compact", "verbose", then "summary".                                                                  |
| Inspect Pi's header and loaded resources in each mode.                                        | They expand only in verbose mode.                                                                                                |
| Change the mode, then `/reload`, rebuild history, and switch sessions in the same process.    | The selected mode stays.                                                                                                         |
| Inspect settings and history after those mode changes.                                        | Mode changes wrote neither file.                                                                                                 |
| Start a new process.                                                                          | Its mode follows `collapsedMode` or `--verbose`.                                                                                 |
| Change `collapsedMode` and press **Ctrl+O** repeatedly.                                       | The cycle stays compact, verbose, summary.                                                                                       |
| Switch `/settings` TUI mode between fullscreen and regular.                                   | Ended runs collapse and expand to match.                                                                                         |
| Run `exceptions` and inspect the summary.                                                     | The image read counts as a file without showing the image.                                                                       |
| Inspect the mid-run failure in that summary.                                                  | It appears only as `(1 failed)`.                                                                                                 |
| Run `cancel` and press **Esc** while the shell runs.                                          | The final cancellation appears as `(1 cancelled)`, with no extra row.                                                            |
| Inspect failed and cancelled counts.                                                          | They use the [summary outcome colours](presentation.md#line-layout).                                                             |
| Set `collapsedMode: "compact"` in `agent/settings.json`, reopen with `--reuse`.               | The session starts in compact mode.                                                                                              |

#### Regular mode

Setup: regular-mode fixture. Set `collapsedMode: "compact"` in `agent/settings.json`, then reopen with `--reuse`.

| Do                                              | Expect                                                          |
| ----------------------------------------------- | --------------------------------------------------------------- |
| Run `summary`.                                  | Every run keeps compact cards.                                  |
| Inspect terminal scrollback after the run ends. | Earlier rows remain.                                            |
| Press **Ctrl+O** repeatedly.                    | Status alternates between "Tool output: verbose" and "compact". |

#### Failed row hooks

Setup: fullscreen fixture in summary mode. Temporarily make the first `bindRowChrome` call in [row-layout.ts](../src/host/row-layout.ts) throw. Undo the change afterwards.

| Do                                                       | Expect                                                                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Run `summary`.                                           | One warning appears. The first call is a standalone card, and the rest of its run has its own summary line, which opens the run. |
| Press **Ctrl+O** until the status reads "summary" again. | Every call is visible or behind a summary line.                                                                                  |

#### With nested instructions

Setup: load `pi-nested-instructions` and put a nested instruction file in the disposable fixture.

| Do                                                                                                                          | Expect                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Read a file beneath that directory.                                                                                         | The notice stays inside the run, even as the last row.                                           |
| Inspect that run's summary.                                                                                                 | It includes `loaded 1 instruction file`.                                                         |
| Load several files, update one, remove one.                                                                                 | Loaded files, updated files, and removed directories have separate counts.                       |
| Open the summary, expand the notice, and resize.                                                                            | The notice stays in place.                                                                       |
| Collapse with the `▴ collapse` bar.                                                                                         | The notice hides with the run.                                                                   |
| Repeat through replay and **Ctrl+O**.                                                                                       | Notice placement, counts, and visibility match the live run.                                     |
| Insert an unrelated visible custom message between calls.                                                                   | The message splits the runs.                                                                     |
| Set `rendererOverrides` `bash` to `original`. Read a file outside that directory, then `cat` a file beneath it with `bash`. | The notice stays standalone below the Bash row. The read run's summary has no instruction count. |

### Exploration groups and images

Setup: fullscreen fixture, compact mode.

| Do                                                                              | Expect                                                                                                            |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Run `scopes` and use the global expansion action.                               | All groups expand.                                                                                                |
| Reopen with `--reuse`.                                                          | Reconstructed cards match the live cards.                                                                         |
| Run `native-mixed`, `normalization`, and `exceptions`.                          | Group membership matches the prompt table.                                                                        |
| Inspect directory headings.                                                     | They follow the [Exploring/Explored heading rules](presentation.md#headings-and-members).                         |
| In `exceptions`, inspect the failure heading.                                   | The failure count sits beside "Explored".                                                                         |
| Inspect that failure's body, collapsed and expanded.                            | The diagnostic uses `error`.                                                                                      |
| Run `filenames` at 48, 80, and 110 columns.                                     | Scope headings remain complete.                                                                                   |
| Inspect member filenames at each width.                                         | They follow the [group-relative target rules](presentation.md#headings-and-members), with ranges intact in `dim`. |
| Expand descendants at each width and include an outside target.                 | Targets follow the [working-directory path rules](presentation.md#target-paths).                                  |
| Run `fff` and inspect filter headings.                                          | They read "Filtering" or "Filtered", with no counts.                                                              |
| Inspect grouped member headings.                                                | Members omit the shared filter.                                                                                   |
| Expand a search and compare a standalone search.                                | A spaced em dash separates the pattern and filter.                                                                |
| Inspect an empty-pattern listing.                                               | Its heading reads `Listed <filter>`.                                                                              |
| Compare FFF filters with native directory scopes, including matching text.      | The two scope kinds stay separate.                                                                                |
| In `thinking`, toggle **Ctrl+T** during streaming.                              | Collapsed placeholders disappear at `thinking_end`, before later prose and tools finish.                          |
| Inspect active indicators, the explanation, and diagnostics.                    | They remain visible under the [thinking visibility rules](presentation.md#thinking).                              |
| Toggle **Ctrl+T** after streaming and force a redraw.                           | Ended placeholders stay hidden.                                                                                   |
| Run `thinking` in summary mode.                                                 | The first two reads stay compact through thinking, then collapse at the explanation.                              |
| Wait for the agent to finish.                                                   | The remaining reads collapse.                                                                                     |
| Toggle thinking and click thinking rows, including beside a run opened by hand. | Run state stays unchanged.                                                                                        |
| Reopen with `--reuse`.                                                          | Replay matches the live run state.                                                                                |
| Run `buffered` collapsed, then expand, toggle thinking, and replay.             | The two-read group stays between `shell two` and `shell three`.                                                   |
| Inspect each call in those views.                                               | Each row keeps its own command, target, and result.                                                               |
| Run `explore`, then `images`, and replay.                                       | Notices and images stay beneath their call, before the next tool.                                                 |
| Inspect the boundary at assistant completion.                                   | It separates the groups.                                                                                          |

#### Images

Setup: `images` prompt, at wide and narrow widths, with image display on and then off. Account for the [platform limitations](#platform-limitations).

| Do                                                                                                      | Expect                                                       |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| View collapsed in a supported terminal.                                                                 | Each image appears once before the next tool.                |
| Inspect its alignment.                                                                                  | It aligns with the card body and continues the group guide.  |
| Expand.                                                                                                 | The group guide disappears, with body indentation unchanged. |
| Inspect preview width after expansion.                                                                  | Previews fit the remaining width.                            |
| Use an unsupported protocol.                                                                            | A notice replaces the image.                                 |
| In fullscreen, click image rows, indentation, spacers, and unused columns after scrolling and resizing. | No overlay opens.                                            |
| Inspect card and group expansion, opened runs, and the editor draft after those clicks.                 | Their state stays unchanged.                                 |

### Saved output

Setup: `output` prompt.

| Do                                                                                                         | Expect                                                                                                      |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Expand the successful card.                                                                                | The saved preview loads.                                                                                    |
| Inspect the separate failure card.                                                                         | Its diagnostic stays visible.                                                                               |
| Compare generated omissions with literal lookalikes.                                                       | They follow the [text-notice provenance limits](../src/adapters/native/README.md#text-envelope-provenance). |
| Stop the session, move the referenced output file aside inside the fixture, reopen with `--reuse`, expand. | Retained output and an unavailable notice remain.                                                           |
| Restore the file with the session open, toggle expansion.                                                  | The cached failure is reused.                                                                               |
| Run `/reload`, then expand.                                                                                | The saved preview appears. See [saved-output previews](presentation.md#saved-output-previews).              |

### History and lifecycle

Run these when you change the matching integration.

| Do                                                                                                                                 | Expect                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reload twice, then run `explore`.                                                                                                  | The `explore` cards and groups look as they do in a fresh session.                                                                                                    |
| Use new and resumed sessions, forks, tree navigation, and compaction, including boundary-generated compaction and custom messages. | Retained groups keep expansion ownership.                                                                                                                             |
| Inspect boundaries in those sessions, including after a context edit.                                                              | Context edits do not split groups; other boundaries follow the [visible-message boundary rules](presentation.md#what-separates-groups).                               |
| Reconstruct the transcript.                                                                                                        | No call executes again.                                                                                                                                               |
| Inspect a reconstructed call with a missing outcome.                                                                               | Its marker stays still.                                                                                                                                               |
| Add `"offset": null` to a `read` call in a disposable fixture session, then reopen with `--reuse` in both modes.                   | The card is the same as before the edit, because validation removes optional nulls that the schema rejects. See [callback arguments](adapters.md#callback-arguments). |
| Replay a print-created history.                                                                                                    | Calls keep their [saved facts](../GLOSSARY.md#interpretation) and Pi's durations.                                                                                     |
| Inspect mutation observation during replay.                                                                                        | Replay observes no mutations.                                                                                                                                         |
| Make new interactive calls.                                                                                                        | New calls collect fresh facts.                                                                                                                                        |
| Insert `ctx.ui.notify` calls between matching tool calls at each severity.                                                         | Visible notifications split groups and runs.                                                                                                                          |
| Repeat with a no-op notification and a thinking-toggle status message.                                                             | Neither creates a boundary.                                                                                                                                           |
| Run user `!` and `!!` commands.                                                                                                    | Pi renders these shell cards itself, outside exploration groups and display observation.                                                                              |

### Finalised-message middleware

1. Add the fixed call plan or scoped middleware to [provider.ts](../validation/provider.ts), and prepare disposable inputs in [workspace.ts](../validation/workspace.ts).
2. Change the disposable files before replay, so patches must come from retained data.
3. Compare live and replay results with the [host cases](../src/host/install.test.ts). Observed facts stay separate from published outcomes.
4. Rename a call that has a generic card, and keep its arguments. The live card and summary line name the final tool, as in replay.

## Adapter validation

Run these checks after changing the matching adapter. The adapter contracts they check are in the [FFF](../src/adapters/@ff-labs/pi-fff/README.md) and [pi-mcp-adapter](../src/adapters/pi-mcp-adapter/README.md) adapter READMEs.

### FFF

The [terminal fixture](#terminal-launcher) uses nonignored files in disposable Git for `fff`. Install official `@ff-labs/pi-fff` separately; it is not a workspace dependency.

1. From the repository root, launch the fixture with the extension's `src/index.ts` and its tool names enabled:

   ```sh
   vpr 'pi-tool-display#validate:terminal' fullscreen \
     -e /absolute/path/to/@ff-labs/pi-fff/src/index.ts \
     --fff-mode tools-only --tools read,ls,grep,ffgrep,fffind
   ```

2. Press **Ctrl+O** for compact mode, then enter `fff`. Wait for `Fixture finished: fff`. If any required tools are unavailable, the scenario reports a skip and issues no calls instead.
3. When replaying with `--reuse`, include the same extension and flags.

Enable multi-search with `env: { PI_FFF_MULTIGREP: "1" }` in `fixtureLaunch`'s `createPiLaunch` in [workspace.ts](../validation/workspace.ts). The launcher filters environment variables; a shell prefix does not work.

Before and after reload, check the completed scenario:

| Do                                  | Expect                                                         |
| ----------------------------------- | -------------------------------------------------------------- |
| Inspect the filter groups.          | `a/**` and `./a/**` form two separate groups.                  |
| Inspect each filter group.          | It contains two searches and one empty-pattern listing.        |
| Inspect the `a/` FFF search.        | It remains standalone.                                         |
| Inspect the native calls.           | The list and read share a directory group.                     |
| Inspect compact cards and groups.   | They show match counts instead of index counts or excerpts.    |
| Compare compact and expanded cards. | Pagination, limit, query, and fallback notices remain visible. |
| Expand a card.                      | Index counts and retained matches appear beside the summaries. |

### pi-mcp-adapter

Install `pi-mcp-adapter` separately for `mcp`; it is not a workspace dependency. The offline [stdio backend](../validation/mcp-server.ts) does no network or filesystem work. MCP caches and output stay inside the fixture.

1. Create a [terminal fixture using the shared launcher](#terminal-launcher), then exit.
2. In the printed fixture directory, create `agent/mcp.json` with the following configuration. Replace `/absolute/path/to/pi-mono` with your checkout path:

   ```json
   {
     "mcpServers": {
       "display": {
         "command": "node",
         "args": [
           "/absolute/path/to/pi-mono/packages/extensions/pi-tool-display/validation/mcp-server.ts"
         ],
         "lifecycle": "eager"
       },
       "direct": {
         "command": "node",
         "args": [
           "/absolute/path/to/pi-mono/packages/extensions/pi-tool-display/validation/mcp-server.ts"
         ],
         "lifecycle": "eager",
         "directTools": true
       }
     }
   }
   ```

3. Reopen that fixture from the workspace root, using its printed path and the installed package entry point:

   ```sh
   vpr 'pi-tool-display#validate:terminal' regular --reuse /tmp/pi-tool-display-terminal-EXAMPLE \
     -e /absolute/path/to/node_modules/pi-mcp-adapter/index.ts \
     --tools 'mcp,mcpScript,mcp__display,direct_echo'
   ```

4. The regular-mode fixture starts with compact cards. Enter `mcp` and wait for `Fixture finished: mcp`. Check collapsed and expanded cards against the expectations below, then run `/reload`.
5. Exit, then repeat the command with `fullscreen` instead of `regular` to check replay. Keep the `--reuse`, `-e`, and `--tools` arguments. Press **Ctrl+O** for compact cards.

| Do                                                                                                          | Expect                                                        |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Inspect resolved echo calls.                                                                                | Headings show `display.echo` or `direct.echo`.                |
| Inspect connection and description calls.                                                                   | Headings keep their action and target.                        |
| Inspect images, resources, and returned errors.                                                             | They stay visible beneath their call.                         |
| Inspect large output in both card modes.                                                                    | The saved-output reference stays visible.                     |
| Omit [`showParameters`](../README.md#configuration), then try `false` and `true`, with `/reload` each time. | Arguments and script code stay visible in each configuration. |
| Expand a card with long parameters.                                                                         | The compact preview expands to the full parameters.           |
| Set an exact-name [`original` override](../README.md#configuration).                                        | The card uses the tool owner's renderer.                      |

These checks inspect retained output; the display adapter never reads the saved file.

## Platform limitations

- Inline images need a native protocol that works in fullscreen, such as Kitty. Pi disables iTerm2 images in fullscreen (observed in Pi 0.99.2).
- When finalised-message middleware adds or removes result images, Pi does not update the live native image row; reconstructed rows use the finalised images. This reproduces with and without the extension, including Kitty output (observed in Pi 0.87.0).
- Check Kitty and iTerm images, links, drag selection, and the clipboard in terminals that support them.
- The launcher uses Unix Bash. Windows and PowerShell need separate `pwsh` and platform launch checks.
