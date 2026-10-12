# Tool display validation for maintainers

[pi-tool-display](../README.md)

Run the terminal scenarios for changes to clicks, keys, or layout.

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

| Prompt          | Expect                                                                                                                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary`       | In fullscreen summary mode, three summary lines. Run once per fresh workspace; see [summary mode](#summary-mode).                                                                                                                       |
| `explore`       | Repeated reads, a missing-file diagnostic, and a listing, in source order.                                                                                                                                                              |
| `scopes`        | A three-call `.` group, a four-call `src` group, and a standalone read of `b.ts`, with mixed actions, repeated reads, and a failed read.                                                                                                |
| `native-mixed`  | One native group with one list, one search, and three reads, including repeated ranges.                                                                                                                                                 |
| `normalization` | One four-call native group using relative, absolute, `./`, `../`, and trailing-slash paths.                                                                                                                                             |
| `exceptions`    | One four-read group with a missing-file failure and a PNG image.                                                                                                                                                                        |
| `filenames`     | Spaces, Unicode, and a long filename. Targets wrap without truncation and keep `:15-16` ranges intact.                                                                                                                                  |
| `thinking`      | Four reads with thinking between calls and a visible explanation before the third read. Collapsed thinking gives two two-read groups; visible thinking gives four standalone cards.                                                     |
| `buffered`      | Buffered thinking and tool events, then repeated tool names. In order: `shell one`, `shell two`, a two-read group, `shell three`, `shell four`, a standalone read.                                                                      |
| `fff`           | Two literal-filter groups, a standalone FFF search, then a native group with a list and a read. Needs the [FFF extension and launch flags](../src/adapters/@ff-labs/pi-fff/README.md#validation); skipped if the tools are unavailable. |
| `diff`          | A creation and edits, including separated hunks. Run once per fresh workspace; repeating the exact-match edits fails on purpose.                                                                                                        |
| `output`        | Live output over the retention budget, saved-file expansion, and a separate nonzero exit.                                                                                                                                               |
| `cancel`        | A long-running shell call. Press **Esc** while it runs.                                                                                                                                                                                 |
| `images`        | A native image read between text reads.                                                                                                                                                                                                 |
| `public`        | A `display_fixture_read` card drawn by the standalone renderer factory.                                                                                                                                                                 |

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

| Do                                                                                                                                                              | Expect                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Click cards and groups, before and after scrolling and resizing                                                                                                 | Only the clicked card or group expands.                                                                                                                                              |
| Scroll with the wheel; repeat in regular mode                                                                                                                   | Wheel scrolling works. Regular mode never captures the mouse.                                                                                                                        |
| Check [layout](presentation.md#card-layout) in dark and light, wide and narrow                                                                                  | MCP and generic arguments are visible. Other specialised parameter blocks stay hidden, even expanded.                                                                                |
| In `summary` and `thinking`, watch streaming, replay, resize, and **Ctrl+T**                                                                                    | Assistant prose starts with `•` and wraps beneath the text in every mode, with no duplicate markers.                                                                                 |
| In `summary` and `thinking`, watch streaming, replay, resize, and **Ctrl+T**                                                                                    | User messages, thinking, and diagnostics have no assistant markers. Markdown and links still work.                                                                                   |
| Set `showParameters: true` under `ext.pi-tool-display` in the fixture's `agent/settings.json`, then `/reload`                                                   | Parameters appear. For project merging, use a trusted `work/.pi/settings.json`; see [configuration](../README.md#configuration).                                                     |
| Run `diff`, resize between unified and side-by-side, expand the whole card                                                                                      | Changes stay visible. The panel fills each row to the terminal edge without a tree connector. Changed-row backgrounds don't extend into separators or following content.             |
| Launch the [subagent fixture](../../pi-subagents/README.md#validation) with `-e "$PWD/packages/extensions/pi-tool-display/index.ts"`, then run `delegate-reply` | Collapsed completed cards preview three reply lines, or all four when there are exactly four, under a `└` branch; expansion keeps the full result once. Generic cards are unchanged. |
| In the same fixture, run `background-slow` and wait for its result; in fullscreen, click the result                                                             | The result uses the subagent card layout without the `<task>` envelope, and the click opens the task.                                                                                |

### Summary mode

Setup: fullscreen fixture in summary mode unless a row says otherwise.

| Do                                                                                           | Expect                                                                                                                                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Run `summary`                                                                                | First line: `Read 2 files · ran 2 commands (1 failed) · created 1 file · edited 1 file` (both runs of the check count). Second line: `Read 1 file · listed 1 dir`. |
| Watch the tail shell while it runs                                                           | Its run shows compact cards and no summary line. It collapses to one line when the agent finishes.                                                                 |
| Repeat, clicking the shell card while it runs                                                | After the agent finishes, the run stays as cards between two plain full-width rules, with no label or triangle and one blank row inside each rule.                 |
| Click either rule or its inner padding                                                       | The run returns to its summary line, with no leading marker, and no card toggles.                                                                                  |
| Repeat with a single-card run and a run ending in an image, after resize and group expansion | The bottom control stays below all output and images. Clicking an image doesn't collapse the run.                                                                  |
| Click a summary line                                                                         | The run opens to compact cards, where group and card clicks work as usual.                                                                                         |
| Press **Ctrl+O** with a run open                                                             | The run closes.                                                                                                                                                    |
| Press **Ctrl+O** repeatedly                                                                  | Status reads "Tool output: compact", "verbose", then "summary". Pi's header and loaded resources expand only in verbose.                                           |
| Change the mode, then `/reload`, rebuild history, and switch sessions in the same process    | The selected mode stays, with no settings or history writes.                                                                                                       |
| Start a new process                                                                          | It uses `collapsedMode` or `--verbose`. Changing `collapsedMode` doesn't change the **Ctrl+O** cycle.                                                              |
| Switch `/settings` TUI mode between fullscreen and regular                                   | Ended runs collapse and expand to match.                                                                                                                           |
| Run `exceptions`                                                                             | The image read counts as a file without showing the image. The mid-run failure appears only as `(1 failed)`.                                                       |
| Run `cancel`                                                                                 | The final cancellation appears as `(1 cancelled)`, with no extra row. Problem counts are error-coloured.                                                           |
| Set `collapsedMode: "compact"` in `agent/settings.json`, reopen with `--reuse`               | The session starts in compact mode.                                                                                                                                |
| Regular mode: run `summary`                                                                  | Every run keeps compact cards. Scrollback is never cleared. **Ctrl+O** alternates between "Tool output: verbose" and "compact".                                    |

#### With nested instructions

Setup: load `pi-nested-instructions` and put a nested instruction file in the disposable fixture.

| Do                                                                         | Expect                                                                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Read a file beneath that directory                                         | The notice stays inside the run, even as the last row. The summary includes `loaded 1 instruction file`. |
| Load several files, update one, remove one                                 | Separate counts for loaded files, updated files, and removed directories.                                |
| Open the summary, expand the notice, resize, collapse with the bottom rule | The notice stays in place and disappears with the run.                                                   |
| Repeat through replay and **Ctrl+O**                                       | Same behaviour. Unrelated visible custom messages still split runs.                                      |

### Exploration groups and images

Setup: fullscreen fixture, compact mode.

| Do                                                          | Expect                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Run `scopes`, use the global expansion action               | All groups expand. Live cards match `--reuse` reconstruction.                                                                                                                                                                                                                                                |
| Run `native-mixed`, `normalization`, `exceptions`           | The groups listed in the prompt table. Directory headings read "Exploring" or "Explored", with no scope-kind noun or counts.                                                                                                                                                                                 |
| In `exceptions`, inspect the failure                        | The failure count sits beside "Explored". The diagnostic body uses `error`, collapsed and expanded.                                                                                                                                                                                                          |
| Run `filenames` at 48, 80, and 110 columns                  | Scope headings aren't truncated. Filenames are relative to the group directory, with ranges intact in `dim`.                                                                                                                                                                                                 |
| Run `filenames` at 48, 80, and 110 columns                  | Expanded descendants are relative to the working directory; outside targets stay absolute.                                                                                                                                                                                                                   |
| Run `fff`                                                   | Filter headings read "Filtering" or "Filtered", with no counts. Members don't repeat the filter. Expanded and standalone searches separate pattern and filter with an em dash. Empty-pattern listings read `Listed <filter>`. FFF filters never merge with native directory scopes, even with matching text. |
| In `thinking`, toggle **Ctrl+T** during and after streaming | Collapsed placeholders disappear at `thinking_end`, before later prose and tools finish. Active indicators, the explanation, and diagnostics stay. Toggles and redraws never revive ended placeholders.                                                                                                      |
| `thinking` in summary mode                                  | The first two reads stay compact through thinking, then collapse at the explanation. The rest collapses at agent end. Toggles and thinking clicks never settle or reopen runs, including runs opened by hand. Replay with `--reuse` matches.                                                                 |
| Collapsed `buffered`, then expand; toggle thinking; replay  | The two-read group stays between `shell two` and `shell three`. Each call shows its own command, target, and result. Later rows never reuse earlier data.                                                                                                                                                    |
| Run `explore`, then `images`; replay                        | Notices and images stay beneath their call, before the next tool. Assistant completion separates groups.                                                                                                                                                                                                     |

#### Images

Setup: `images` prompt, at wide and narrow widths, with image display on and then off. Account for the [platform limitations](#platform-limitations).

| Do                                                                                                  | Expect                                                                                                |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| View collapsed in a supported terminal                                                              | Each image appears once before the next tool, aligned with the card body, continuing the group guide. |
| Expand                                                                                              | The group guide disappears; body indentation stays. Previews fit the remaining width.                 |
| Use an unsupported protocol                                                                         | A notice replaces the image.                                                                          |
| Fullscreen: click image rows, indentation, spacers, and unused columns after scrolling and resizing | No overlay opens. Card and group expansion, opened runs, and the editor draft are unchanged.          |

### Saved output

Setup: `output` prompt.

| Do                                                                                                        | Expect                                                                                                      |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Expand the card                                                                                           | The saved preview loads. The failure card keeps its diagnostic.                                             |
| Compare generated omissions with literal lookalikes                                                       | They follow the [text-notice provenance limits](../src/adapters/native/README.md#text-envelope-provenance). |
| Stop the session, move the referenced output file aside inside the fixture, reopen with `--reuse`, expand | Retained output and an unavailable notice remain.                                                           |
| Restore the file with the session open, toggle expansion                                                  | The cached failure is reused.                                                                               |
| Run `/reload`, then expand                                                                                | The retry succeeds. See [preview retry and eviction](presentation.md#saved-output-previews).                |

### History and lifecycle

Run these when you change the matching integration.

| Do                                                                                                                                | Expect                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reload twice, then run `explore`                                                                                                  | Cards render normally.                                                                                                                                                             |
| Use new and resumed sessions, forks, tree navigation, and compaction, including boundary-generated compaction and custom messages | Retained groups keep expansion ownership. Visible messages separate groups; hidden messages and context edits don't. Reconstruction never runs calls or animates missing outcomes. |
| Add `"offset": null` to a `read` call in a disposable fixture session, then reopen with `--reuse` in both modes                   | The card is the same as before the edit, because validation removes optional nulls that the schema rejects. See [callback arguments](adapters.md#callback-arguments).              |
| Replay a print-created history, then make new interactive calls                                                                   | Calls collected in print mode retain their call facts and local details; replay does not observe mutations again. New calls collect fresh facts.                                   |
| Insert `ctx.ui.notify` calls between matching tool calls                                                                          | Every severity splits groups and runs when Pi inserts a visible component. No-op notifications and thinking-toggle status messages don't.                                          |
| Run user `!` and `!!` commands                                                                                                    | Pi renders these shell cards itself, outside exploration groups and display observation.                                                                                           |

### Finalized-message middleware

1. Add the fixed call plan or scoped middleware to [provider.ts](../validation/provider.ts), and prepare disposable inputs in [workspace.ts](../validation/workspace.ts).
2. Change the disposable files before replay, so patches must come from retained data.
3. Compare live and replay results with the [host cases](../src/host/install.test.ts). Observed facts stay separate from published outcomes.

## Adapter validation

- [@ff-labs/pi-fff checks](../src/adapters/@ff-labs/pi-fff/README.md#validation)
- [pi-mcp-adapter fixture](../src/adapters/pi-mcp-adapter/README.md#validation)

## Platform limitations

- Inline images need a native protocol that works in fullscreen, such as Kitty. Pi disables iTerm2 images in fullscreen (observed in Pi 0.99.2).
- When finalized-message middleware adds or removes result images, Pi does not update the live native image row; reconstructed rows use the finalized images. This reproduces with and without the extension, including Kitty output (observed in Pi 0.87.0).
- Check Kitty and iTerm images, links, drag selection, and the clipboard in terminals that support them.
- The launcher uses Unix Bash. Windows and PowerShell need separate `pwsh` and platform launch checks.
