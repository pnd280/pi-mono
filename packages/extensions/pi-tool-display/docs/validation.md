# Tool display validation for maintainers

[pi-tool-display](../README.md)

Run the terminal scenarios for changes to clicks, keys, or layout. Use the glossary to distinguish [exploration groups and runs](../GLOSSARY.md#transcript-structure).

## Terminal launcher

Setup: complete [workspace setup](../../../../README.md#setup). The offline fixture needs a Unix Bash backend.

1. From the repository root, launch regular mode:

   ```sh
   vpr 'pi-tool-display#validate:terminal' regular
   ```

2. Work only in the printed `Fixture directory`. It contains isolated files, settings, history, and an offline provider.
3. The fixture starts in summary mode, which renders compact cards in regular mode. In fullscreen, stay in summary mode for summary checks, and press **Ctrl+O** once for the compact cards the other prompts describe.
4. Enter a prompt from the table below. Do streaming checks while the prompt runs. For other checks, wait for `Fixture finished: <prompt>`, except for skipped prompts and `cancel`. Some calls fail on purpose.
5. Exit with **Ctrl+D** in an empty editor. Repeat in fullscreen with a fresh workspace:

   ```sh
   vpr 'pi-tool-display#validate:terminal' fullscreen
   ```

| Prompt          | Scenario                                                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary`       | In fullscreen summary mode, three summary lines. Run once per fresh workspace; see [summary mode](#summary-mode).                                                                   |
| `explore`       | Repeated reads, a missing-file diagnostic, and a listing, in source order.                                                                                                          |
| `scopes`        | A three-call `.` group, a four-call `src` group, and a standalone read of `b.ts`, with mixed actions, repeated reads, and a failed read.                                            |
| `native-mixed`  | One native group with one list, one search, and three reads, including repeated ranges.                                                                                             |
| `normalization` | One four-call native group using relative, absolute, `./`, `../`, and trailing-slash paths.                                                                                         |
| `exceptions`    | One four-read group with a missing-file failure and a PNG image.                                                                                                                    |
| `filenames`     | Spaces, Unicode, and a long filename. Targets wrap without truncation and keep `:15-16` ranges intact.                                                                              |
| `thinking`      | Four reads with thinking between calls and a visible explanation before the third read. Collapsed thinking gives two two-read groups; visible thinking gives four standalone cards. |
| `buffered`      | Buffered thinking and tool events, then repeated tool names. In order: `shell one`, `shell two`, a two-read group, `shell three`, `shell four`, a standalone read.                  |
| `diff`          | A creation and edits, including separated hunks. Run once per fresh workspace; repeating the exact-match edits fails on purpose.                                                    |
| `output`        | Live output over the retention budget, saved-file expansion, and a separate nonzero exit.                                                                                           |
| `cancel`        | A long-running shell call. Press **Esc** while it runs.                                                                                                                             |
| `images`        | A native image read between text reads.                                                                                                                                             |
| `public`        | A `display_fixture_read` card drawn by the standalone renderer factory.                                                                                                             |

### Replay and launch options

Reopen a printed fixture without resetting its files:

```sh
vpr 'pi-tool-display#validate:terminal' fullscreen --reuse /tmp/pi-tool-display-terminal-EXAMPLE
```

| Option              | Use                                   |
| ------------------- | ------------------------------------- |
| `--use-theme light` | Appearance checks in the light theme. |
| `--print explore`   | Create a non-TUI history to replay.   |
| `--help`            | Full argument syntax.                 |

## Host interaction checks

Use the fixture to compare live output with saved-session replay after expansion, scrolling, and resizing.

### Expansion, layout, and diffs

Setup: fullscreen fixture, compact mode.

| Do                                                                                                             | Expect                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Click cards and groups, before and after scrolling and resizing.                                               | Only the clicked card or group expands.                                                                                   |
| Click cards, groups, summary lines, `▴ collapse` bars, and notice headers with Shift, Alt, or Ctrl held.       | Nothing expands, collapses, or opens.                                                                                     |
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

Setup: launch the [subagent fixture](../../pi-subagents/docs/validation.md#launch-the-terminal-fixture) with `-e "$PWD/packages/extensions/pi-tool-display/index.ts"`, in regular and then fullscreen mode. Use compact mode (`collapsedMode: "compact"`).

| Do                                                                                                                                             | Expect                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Run `delegate-reply`.                                                                                                                          | Completed cards follow the [three-line or four-line reply preview rule](tools.md#results-and-expansion) under a `└` branch. |
| Expand the completed card.                                                                                                                     | The full result appears once.                                                                                               |
| Run `delegate-launch-args`, then expand its card at full width and at a narrow width.                                                          | Only the expanded card shows `launch_args`, and rows break only between arguments.                                          |
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

| Do                                                                                                                         | Expect                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Run `summary` once per fresh workspace and inspect its first line.                                                         | `Read 2 files · ran 2 commands (1 failed) · created 1 file · edited 1 file` (the check command runs twice, and both runs count). |
| Inspect the row below its first line.                                                                                      | `└ A summary.txt  +2 -1  2 edits`, as the [changed files](presentation.md#changed-files) describe.                               |
| Inspect its second line.                                                                                                   | `Read 1 file · listed 1 dir`, with no row below it.                                                                              |
| Watch the tail shell while it runs.                                                                                        | Its run keeps compact cards.                                                                                                     |
| Wait for the agent to finish.                                                                                              | The tail run collapses to one summary line.                                                                                      |
| Repeat, clicking the shell card while it runs, then wait for the agent to finish.                                          | The run stays open with the [documented collapse controls](presentation.md#opening-and-closing-a-run).                           |
| Click the run's summary line or its `▴ collapse` bar.                                                                      | The run returns to its [summary line](presentation.md#line-layout).                                                              |
| Inspect summary lines in the dark and light themes, at full width and at a width that wraps them.                          | They follow the [line layout](presentation.md#line-layout): one full-width bar, call count at the right.                         |
| Open the run again.                                                                                                        | Individual cards keep their expansion state.                                                                                     |
| Repeat with a single-card run and a run ending in an image, after resize and group expansion.                              | The bottom control stays below all output and images.                                                                            |
| Click the image.                                                                                                           | The run stays open.                                                                                                              |
| Click a summary line.                                                                                                      | The run opens to compact cards, where group and card clicks work as usual.                                                       |
| Click the `summary.txt` row of the closed first run, then close the run.                                                   | The run opens without the row below its line, and the row returns when the run closes.                                           |
| Run `diff` in a fresh workspace and inspect the rows below its line.                                                       | `A created.ts  +1`, `M a.ts  +1 -1`, and `M b.ts  +2 -2`, with the counts in one column.                                         |
| Press **Ctrl+O** with a run open.                                                                                          | The status reads "Tool output: compact". After two more presses, back in summary mode, the run shows only its summary line.      |
| Press **Ctrl+O** repeatedly.                                                                                               | Status reads "Tool output: compact", "verbose", then "summary".                                                                  |
| Inspect Pi's header and loaded resources in each mode.                                                                     | They expand only in verbose mode.                                                                                                |
| Change the mode, then `/reload`, rebuild history, and switch sessions in the same process.                                 | The selected mode stays.                                                                                                         |
| Inspect settings and history after those mode changes.                                                                     | Mode changes wrote neither file.                                                                                                 |
| Start a new process.                                                                                                       | Its mode follows `collapsedMode` or `--verbose`.                                                                                 |
| Set `collapsedMode` to `"compact"` in the fixture's `agent/settings.json`, run `/reload`, and press **Ctrl+O** repeatedly. | The cycle stays compact, verbose, summary.                                                                                       |
| Switch `/settings` TUI mode between fullscreen and regular.                                                                | Ended runs collapse and expand to match.                                                                                         |
| Run `exceptions` and inspect the summary.                                                                                  | The image read counts as a file without showing the image.                                                                       |
| Inspect the mid-run failure in that summary.                                                                               | It appears only as `(1 failed)`.                                                                                                 |
| Run `cancel` and press **Esc** while the shell runs.                                                                       | The final cancellation appears as `(1 cancelled)`, with no extra row.                                                            |
| Inspect failed and cancelled counts.                                                                                       | They use the [summary outcome colours](presentation.md#line-layout).                                                             |

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

| Do                                                                                                                                                           | Expect                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Read a file beneath that directory.                                                                                                                          | The notice stays inside the run, even as the last row.                                                                                      |
| Inspect that run's summary.                                                                                                                                  | It includes `loaded 1 instruction file`.                                                                                                    |
| Load several files, update one, remove one.                                                                                                                  | Loaded files, updated files, and removed directories have separate counts.                                                                  |
| In a fresh workspace, add an instruction file and a skill in `.agents/skills/` to the same directory, run `/reload`, and read a file beneath that directory. | The summary includes `loaded 1 instruction file` and `listed skills in 1 dir`. Opening the run shows the listing directly after the notice. |
| Open the summary, expand the notice, and resize.                                                                                                             | The notice stays in place.                                                                                                                  |
| Collapse with the `▴ collapse` bar.                                                                                                                          | The notice hides with the run.                                                                                                              |
| Repeat through replay and **Ctrl+O**.                                                                                                                        | Notice placement, counts, and visibility match the live run.                                                                                |
| Insert an unrelated visible custom message between calls.                                                                                                    | The message splits the runs.                                                                                                                |
| Set `rendererOverrides` `bash` to `original`. Read a file outside that directory, then `cat` a file beneath it with `bash`.                                  | The notice stays standalone below the Bash row. The read run's summary has no instruction count.                                            |

### Exploration groups and images

Setup: fullscreen fixture, compact mode.

| Do                                                                              | Expect                                                                                                                                              |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run `scopes` and use the global expansion action.                               | All groups expand.                                                                                                                                  |
| Reopen with `--reuse`.                                                          | Reconstructed cards match the live cards.                                                                                                           |
| Run `native-mixed`, `normalization`, and `exceptions`.                          | Group membership matches the prompt table.                                                                                                          |
| Inspect directory headings.                                                     | They follow the [Exploring/Explored heading rules](presentation.md#headings-and-members).                                                           |
| In `exceptions`, inspect the failure heading.                                   | The failure count sits beside "Explored".                                                                                                           |
| Inspect that failure's body, collapsed and expanded.                            | The diagnostic uses `error`.                                                                                                                        |
| Run `filenames` at narrow and wide widths.                                      | Scope headings remain complete.                                                                                                                     |
| Inspect member filenames at each width.                                         | They follow the [group-relative target rules](presentation.md#headings-and-members), with ranges intact in `dim`.                                   |
| Expand descendants at each width and include an outside target.                 | Targets follow the [working-directory path rules](presentation.md#target-paths).                                                                    |
| In `thinking`, toggle **Ctrl+T** during streaming.                              | Collapsed placeholders disappear at `thinking_end`, before later prose and tools finish.                                                            |
| Inspect active indicators, the explanation, and diagnostics.                    | They remain visible under the [thinking visibility rules](presentation.md#thinking).                                                                |
| Toggle **Ctrl+T** after streaming and force a redraw.                           | Ended placeholders stay hidden.                                                                                                                     |
| Run `thinking` in summary mode.                                                 | The first two reads stay compact through thinking, then collapse at the explanation.                                                                |
| Wait for the agent to finish.                                                   | The remaining reads collapse.                                                                                                                       |
| Toggle thinking and click thinking rows, including beside a run opened by hand. | Run state stays unchanged.                                                                                                                          |
| Reopen with `--reuse`.                                                          | Saved calls and run boundaries match the live session. In summary mode, ended runs start closed; open the same runs by hand before comparing cards. |
| Run `buffered` collapsed, then expand, toggle thinking, and replay.             | The two-read group stays between `shell two` and `shell three`.                                                                                     |
| Inspect each call in those views.                                               | Each row keeps its own command, target, and result.                                                                                                 |
| Run `explore`, then `images`, and replay.                                       | Notices and images stay beneath their call, before the next tool.                                                                                   |
| Inspect the boundary at assistant completion.                                   | It separates the groups.                                                                                                                            |

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

| Do                                                                                                         | Expect                                                                                                        |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Expand the successful card.                                                                                | The saved preview loads.                                                                                      |
| Inspect the separate failure card.                                                                         | Its diagnostic stays visible.                                                                                 |
| Compare generated omissions with literal lookalikes.                                                       | They follow the [text-notice provenance limits](../src/adapters/native/contract.md#text-envelope-provenance). |
| Stop the session, move the referenced output file aside inside the fixture, reopen with `--reuse`, expand. | Retained output and an unavailable notice remain.                                                             |
| Restore the file with the session open, toggle expansion.                                                  | The cached failure is reused.                                                                                 |
| Run `/reload`, then expand.                                                                                | The saved preview appears. See [saved-output previews](presentation.md#saved-output-previews).                |

### History and lifecycle

Run these when you change the matching integration.

| Do                                                                                                                                 | Expect                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Reload twice, then run `explore`.                                                                                                  | The `explore` cards and groups look as they do in a fresh session.                                                                      |
| Use new and resumed sessions, forks, tree navigation, and compaction, including boundary-generated compaction and custom messages. | Retained groups keep expansion ownership.                                                                                               |
| Inspect boundaries in those sessions, including after a context edit.                                                              | Context edits do not split groups; other boundaries follow the [visible-message boundary rules](presentation.md#what-separates-groups). |
| Inspect a reconstructed call with a missing outcome.                                                                               | Its marker stays still.                                                                                                                 |
| Add `"offset": null` to a `read` call in a disposable fixture session, then reopen with `--reuse` in both modes.                   | The card is the same as before the edit; see [callback arguments](adapters.md#callback-arguments).                                      |
| Replay a print-created history.                                                                                                    | Calls keep their [saved facts](../GLOSSARY.md#interpretation) and Pi's durations.                                                       |
| Inspect mutation observation during replay.                                                                                        | Replay observes no mutations.                                                                                                           |
| Make new interactive calls.                                                                                                        | New calls collect fresh facts.                                                                                                          |
| Insert `ctx.ui.notify` calls between matching tool calls at each severity.                                                         | Visible notifications split groups and runs.                                                                                            |
| Repeat with a no-op notification and a thinking-toggle status message.                                                             | Neither creates a boundary.                                                                                                             |
| Run user `!` and `!!` commands.                                                                                                    | Pi renders these shell cards itself, outside exploration groups and display observation.                                                |
| Run a user `!` command while the agent is running.                                                                                 | Pi moves the shell card below the run's last row when the run settles. The run ends as it does without the command.                     |

### Finalised-message middleware

1. Add the fixed call plan or scoped middleware to [provider.ts](../validation/provider.ts), and prepare disposable inputs in [workspace.ts](../validation/workspace.ts).
2. Change the disposable files before replay, so patches must come from retained data.
3. Compare live and replay results with the [host cases](../src/host/install.test.ts). Observed facts stay separate from published outcomes.
4. Rename a call that has a generic card, and keep its arguments. The live card and summary line name the final tool, as in replay.

## Adapter validation

Run these checks after changing the matching adapter. Each adapter's README and contract, listed under [built-in adapters](adapters.md#built-in-adapters), state what the checks confirm.

### Codemode

Setup: a TUI session with Pi's built-in `codemode` enabled.

| Do                                                         | Expect                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Run a short script, then a script that throws an error.    | Each finished card shows `Took` with Pi's time in `dim`, and no `Wall time` header. |
| Run `/reload`, then compare both cards with the live ones. | The replayed cards show the same times.                                             |

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

4. Enter `mcp` and wait for `Fixture finished: mcp`. Check collapsed and expanded cards against the expectations below, then run `/reload`.
5. Exit, then repeat the command with `fullscreen` instead of `regular` to check replay. Keep the `--reuse`, `-e`, and `--tools` arguments.

| Do                                                                                                          | Expect                                                        |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Inspect resolved echo calls.                                                                                | Headings show `display.echo` or `direct.echo`.                |
| Inspect connection and description calls.                                                                   | Headings keep their action and target.                        |
| Inspect images, resources, and returned errors.                                                             | They stay visible beneath their call.                         |
| Inspect large output in both card modes.                                                                    | The saved-output reference stays visible.                     |
| Omit [`showParameters`](../README.md#configuration), then try `false` and `true`, with `/reload` each time. | Arguments and script code stay visible in each configuration. |
| Expand a card with long parameters.                                                                         | The compact preview expands to the full parameters.           |
| Set an exact-name [`original` override](../README.md#configuration).                                        | The card uses the tool owner's renderer.                      |

### Nested-instruction notices

Setup: load pi-tool-display and `pi-nested-instructions` in a disposable workspace. Use compact mode so run summaries do not hide the notices. The [summary checks with nested instructions](#with-nested-instructions) cover counts and run placement.

| Do                                                                | Expect                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Access a nested directory containing `AGENTS.md`.                 | The collapsed notice shows its action and path.                      |
| Expand the notice with the shortcut or a fullscreen header click. | The body shows formatted Markdown without the model-facing preamble. |
| Resize to narrow widths and compare dark and light themes.        | Text stays readable within the available width.                      |
| Select or scroll the expanded body.                               | The notice keeps its expansion state.                                |

### Nested-skill listings

Setup: as for [nested-instruction notices](#nested-instruction-notices), in a trusted project with two skills in `.agents/skills/` of a nested directory.

| Do                                                                                                                                                                                                                | Expect                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access a file in the nested directory.                                                                                                                                                                            | The collapsed listing shows "Listed skills (2)" and the directory.                                                                                                                 |
| Expand the listing with the shortcut or a fullscreen header click.                                                                                                                                                | Each skill shows its name and description, without the model-facing preamble or file paths.                                                                                        |
| Give one skill a description longer than the terminal width that contains a literal ANSI colour sequence, such as `"Deploys \x1b[31mred text"` as a quoted YAML string. Run `/reload` and expand the new listing. | It shows "Updated skills (2)", the line "Replaces the earlier skill list for this directory.", and both skills. The text after the colour sequence keeps the description's colour. |
| Narrow the terminal until a description wraps.                                                                                                                                                                    | Each description wraps under its own skill, and the next skill starts at a new branch connector.                                                                                   |
| Delete both skills, run `/reload`, and expand the new listing.                                                                                                                                                    | It shows "Removed skills" and the line "The earlier skill list for this directory no longer applies.", with no skills.                                                             |

### pi-profiles

Setup: load pi-tool-display and `pi-profiles`, and start a new session where `bash` is declared and not used.

| Do                                                                           | Expect                                                          |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Switch to a profile that defers `bash`, then ask the model to run a command. | The `tool_search` card reads "Searched tools" and names `bash`. |

### pi-read

Setup: load pi-tool-display and `pi-read`. Include repeated reads, tabs, wide characters, multiline selections, selections outside the read window, images, and failed reads.

| Do                                                                                     | Expect                                                           |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Expand and collapse groups at narrow and wide terminal sizes in light and dark themes. | Expanded reads show source once, without the appended preview.   |
| Replay the session and expand a read.                                                  | The selection remains highlighted without repeating the preview. |

### pi-smart-compact

Setup: load pi-tool-display and `pi-smart-compact` with [`statusStep`](../../pi-smart-compact/docs/configuration.md) set, in a disposable project. Use compact mode for the layout checks, then fullscreen summary mode once the calls on both sides of a status have finished.

| Do                                                                      | Expect                                                                                                                      |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Work past the first status boundary during a run of tool calls.         | One row reads `Context usage` with the usage summary, such as `152,340 / 200,000 tokens · 76.17% used`, and splits the run. |
| Resize to narrow widths and compare dark and light themes, then replay. | The row wraps beneath its label and stays readable.                                                                         |
| Switch to fullscreen summary mode, then replay.                         | The row stays visible between two summary lines, and neither line counts it.                                                |

### pi-todo

Setup: load pi-tool-display and `pi-todo` in a disposable project, and use compact mode. The [fixed-plan terminal fixture](#terminal-launcher) makes no todo calls. Compare the cards with the [todo card rules](tools.md#todo) for exact wording and limits.

| Do                                                                             | Expect                                                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Ask the model to create several todos, then update one to `in_progress`.       | Adjacent calls form one collapsed `Todos` group. Statuses and progress match the pi-todo widget and the `/todos` browser. |
| Delete a todo, then list with a status filter and with `includeDeleted: true`. | List cards keep the output preview beside the summary and report the number of matching todos.                            |
| Ask the model to call `todo` with arguments it cannot accept, such as `{}`.    | The call gets an ungrouped generic card, such as `Call failed todo({})`.                                                  |
| Expand a todo card.                                                            | The full result text returns.                                                                                             |

## Platform limitations

- Inline images need a native protocol that works in fullscreen, such as Kitty. Pi disables iTerm2 images in fullscreen (observed in Pi 0.99.2).
- When finalised-message middleware adds or removes result images, Pi does not update the live native image row; reconstructed rows use the finalised images. This reproduces with and without the extension, including Kitty output (observed in Pi 0.87.0).
- Check Kitty and iTerm images, links, drag selection, and the clipboard in terminals that support them.
- No terminal check covers Windows or the `powershell` tool.
