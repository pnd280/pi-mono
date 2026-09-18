# Tool display validation

[pi-tool-display](../README.md)

## Automated checks

Use the [focused checks and test prerequisites](../../../../docs/development.md#focused-validation) with package name `pi-tool-display`.

## Terminal launcher

Complete [workspace setup](../../../../README.md#setup). The offline fixture requires a Unix Bash backend.

1. From the repository root, launch regular mode:

   ```sh
   vpr 'pi-tool-display#validate:terminal' regular
   ```

2. Work only in the printed `Fixture directory`. The launcher isolates working files, settings, and session history. It creates a disposable Git repository for the working files and loads an offline scripted provider. Reuse only launcher-created fixtures, never real agent or project directories.
3. Enter a prompt for the behavior to check:

   | Prompt          | Inspect                                                                                                                                                                                                                                       |
   | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `explore`       | Repeated reads, a missing-file diagnostic, and listing in source order.                                                                                                                                                                       |
   | `scopes`        | A three-call `.` group, a four-call `src` group, and a standalone read of `b.ts`. Includes mixed action counts, repeated reads, and a failed read.                                                                                            |
   | `native-mixed`  | One native group with one list, one search, and three reads, including repeated ranges.                                                                                                                                                       |
   | `normalization` | One four-call native group using relative, absolute, `./`, `../`, and trailing-slash paths.                                                                                                                                                   |
   | `exceptions`    | One four-read group with a missing-file failure and a PNG image.                                                                                                                                                                              |
   | `filenames`     | Spaces, Unicode, and a long filename. Targets wrap without truncation, with `:15-16` ranges intact.                                                                                                                                           |
   | `thinking`      | Four reads with thinking between calls and a visible explanation before the third read. Collapsed thinking produces two two-read groups. Visible thinking produces four standalone cards.                                                     |
   | `buffered`      | Buffered thinking/tool events followed by repeated tool names. Shell outputs appear once each in order: `shell one`, `shell two`, a two-read group, `shell three`, `shell four`, then a standalone read.                                      |
   | `fff`           | Two literal-filter groups, a standalone FFF search, then a native group with a list and a read. Requires the [FFF extension and launch flags](../src/adapters/@ff-labs/pi-fff/README.md#validation). Skips if required tools are unavailable. |
   | `diff`          | Creation and edits, including separated hunks. Run once per fresh workspace. Repeating the exact-match edits intentionally fails.                                                                                                             |
   | `output`        | Live output exceeding the retention budget, saved-file expansion, and a separate nonzero exit.                                                                                                                                                |
   | `cancel`        | A long-running shell call. Press **Esc** while it runs.                                                                                                                                                                                       |
   | `images`        | A native image read between text reads.                                                                                                                                                                                                       |
   | `public`        | A tool author using the public standalone renderer factory.                                                                                                                                                                                   |

4. Unless the scenario is skipped or you run `cancel`, wait for `Fixture finished: <prompt>` before inspecting completed cards. Some calls intentionally fail.
5. Exit with **Ctrl+D** in an empty editor. Repeat the checks in fullscreen mode with a fresh workspace:

   ```sh
   vpr 'pi-tool-display#validate:terminal' fullscreen
   ```

### Replay and launch options

To reopen the original fixture session without resetting its files, use the directory printed by its launcher:

```sh
vpr 'pi-tool-display#validate:terminal' fullscreen --reuse /tmp/pi-tool-display-terminal-EXAMPLE
```

Append `--use-theme light` for appearance checks or `--print explore` to create a non-TUI history for replay. For argument syntax, run `vpr 'pi-tool-display#validate:terminal' --help`.

Keep the fixture directory through replay checks. Remove only that directory after all fixture sessions exit.

### Host interaction checks

#### Expansion, layout, and diffs

- Use Pi's configured tool expansion action. In fullscreen mode, click group summaries and diagnostics before and after scrolling and resizing. Each click must expand or collapse only the selected group. Check wheel scrolling and confirm that regular mode does not capture mouse input.
- Inspect [card layout](presentation.md#card-layout) in dark and light themes and wide and narrow windows. By default, specialized parameter blocks stay hidden even after expansion. Generic arguments stay visible.
- Set `showParameters: true` under the literal `ext.pi-tool-display` key in the fixture's `agent/settings.json`. Run `/reload` to inspect enabled parameters. For project merging, use a trusted `work/.pi/settings.json` and the [configuration contract](../README.md#configuration).
- With `diff`, resize between unified and side-by-side views and expand the whole card. Changes must remain visible, and row backgrounds must not extend into separators or following content.

#### Exploration groups and images

- Run `scopes`. Verify that the global expansion action expands all groups. Compare live cards with `--reuse` reconstruction.
- Run `native-mixed`, `normalization`, and `exceptions` to verify the groups listed above. In `exceptions`, the failure count stays beside **Explored**. The diagnostic body uses `error` in collapsed and expanded cards.
- Run `filenames` at 48, 80, and 110 columns. Check that scope headings are not truncated, filenames are relative to the group directory, and ranges remain intact in `dim`. Expanded paths must be relative to the working directory.
- Run `fff`. Filter headings have no operation counts, and grouped members do not repeat `in <scope>`. Expanded and standalone cards retain the filter. FFF filters must not merge with native directory scopes, even when their text matches.
- Run `thinking` and press **Ctrl+T** during streaming and after completion. Completed thinking placeholders must disappear when collapsed. Live indicators, the visible explanation, and diagnostics remain. Compare live cards with `--reuse` reconstruction.
- Run `buffered` with thinking collapsed. The two-read group must stay contiguous between `shell two` and `shell three`. Expand cards to verify each command, target, and result matches its own call. Toggle thinking and compare live cards with `--reuse` reconstruction; later rows must not reuse earlier commands or results.
- Run `explore`, then `images`. Notices and images must remain beneath their originating call and before the next tool. The assistant completion text separates the two exploration groups. Compare live cards with `--reuse` reconstruction.
- With `images`, compare image display enabled and disabled. A supported terminal displays each image once before the next tool. Unsupported protocols retain a notice. Account for the [finalized-image limitation](#platform-limitations).

#### Saved output

With `output`, expand to load the saved preview. The failure card must retain its diagnostic. Compare generated omissions with literal lookalikes using the [native text-envelope provenance limits](../src/adapters/native/README.md#text-envelope-provenance).

To check missing output:

1. Stop the fixture session.
2. Remove only the referenced output file inside the disposable fixture directory.
3. Reopen with `--reuse`. Retained output and an unavailable notice must remain.

#### History and lifecycle

- Reload twice and issue another `explore`.
- Exercise new and resumed sessions, forks, tree navigation, and compaction when changing those integrations. Historical reconstruction must not execute calls or animate missing outcomes. Print-created histories have no automatic display facts; new interactive calls can acquire them.
- Exercise user `!` and `!!` commands when changing shell integration. Pi continues to render these shell cards, outside exploration groups and automatic display observation.

### Finalized-message middleware

Add the relevant fixed call plan or scoped middleware to [provider.ts](../validation/provider.ts) and prepare disposable inputs in [workspace.ts](../validation/workspace.ts).

Compare live and replayed results with the corresponding [host integration cases](../src/host/install.test.ts). Observed operation facts must remain separate from published outcomes. Modify disposable working files before replay to check that patches come from retained data, not current files.

## Adapter validation

- [@ff-labs/pi-fff checks](../src/adapters/@ff-labs/pi-fff/README.md#validation).
- [pi-mcp-adapter fixture](../src/adapters/pi-mcp-adapter/README.md#validation).

## Platform limitations

Pi **0.85.1** does not update a live native image row when finalized-message middleware adds or removes result images. This also occurs without the extension. Reconstructed rows use the finalized images.

Visible Kitty and iTerm images, link activation, drag selection, and clipboard behavior require checks in a supporting terminal. The supplied launcher targets Unix Bash. Windows and PowerShell execution require separate checks with an available `pwsh` backend and platform-specific launch settings.
