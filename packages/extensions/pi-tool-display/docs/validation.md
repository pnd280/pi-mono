# Tool display validation

[pi-tool-display](../README.md)

## Automated checks

Use [focused checks and prerequisites](../../../../docs/development.md#focused-validation) for `pi-tool-display`.

## Terminal launcher

Complete [workspace setup](../../../../README.md#setup). The offline fixture requires a Unix Bash backend.

1. From the repository root, launch regular mode:

   ```sh
   vpr 'pi-tool-display#validate:terminal' regular
   ```

2. Work only in the printed `Fixture directory`: isolated files, settings, history, disposable Git, and an offline provider. Reuse only launcher fixtures, never real agent/project directories.
3. Enter a prompt for the behavior to check:

   | Prompt          | Inspect                                                                                                                                                                                                                                       |
   | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `explore`       | Repeated reads, a missing-file diagnostic, and listing in source order.                                                                                                                                                                       |
   | `scopes`        | A three-call `.` group, a four-call `src` group, and a standalone read of `b.ts`. Includes mixed actions, repeated reads, and a failed read.                                                                                                  |
   | `native-mixed`  | One native group with one list, one search, and three reads, including repeated ranges.                                                                                                                                                       |
   | `normalization` | One four-call native group using relative, absolute, `./`, `../`, and trailing-slash paths.                                                                                                                                                   |
   | `exceptions`    | One four-read group with a missing-file failure and a PNG image.                                                                                                                                                                              |
   | `filenames`     | Spaces, Unicode, and a long filename. Targets wrap without truncation, with `:15-16` ranges intact.                                                                                                                                           |
   | `thinking`      | Four reads with thinking between calls and a visible explanation before the third read. Collapsed thinking produces two two-read groups. Visible thinking produces four standalone cards.                                                     |
   | `buffered`      | Buffered thinking and tool events followed by repeated tool names. Shell outputs appear once each in order: `shell one`, `shell two`, a two-read group, `shell three`, `shell four`, then a standalone read.                                  |
   | `fff`           | Two literal-filter groups, a standalone FFF search, then a native group with a list and a read. Requires the [FFF extension and launch flags](../src/adapters/@ff-labs/pi-fff/README.md#validation). Skips if required tools are unavailable. |
   | `diff`          | Creation and edits, including separated hunks. Run once per fresh workspace. Repeating the exact-match edits intentionally fails.                                                                                                             |
   | `output`        | Live output exceeding the retention budget, saved-file expansion, and a separate nonzero exit.                                                                                                                                                |
   | `cancel`        | A long-running shell call. Press **Esc** while it runs.                                                                                                                                                                                       |
   | `images`        | A native image read between text reads.                                                                                                                                                                                                       |
   | `public`        | A `display_fixture_read` card using the standalone renderer factory.                                                                                                                                                                          |

4. Wait for `Fixture finished: <prompt>` before inspecting, except skips and `cancel`. Some calls fail intentionally.
5. Exit with **Ctrl+D** in an empty editor; repeat fullscreen with a fresh workspace:

   ```sh
   vpr 'pi-tool-display#validate:terminal' fullscreen
   ```

### Replay and launch options

Reopen the printed fixture without resetting files:

```sh
vpr 'pi-tool-display#validate:terminal' fullscreen --reuse /tmp/pi-tool-display-terminal-EXAMPLE
```

Append `--use-theme light` for appearance checks or `--print explore` to create a non-TUI history for replay. For argument syntax, run `vpr 'pi-tool-display#validate:terminal' --help`.

Keep the fixture directory through replay checks. Remove only that directory after all fixture sessions exit.

### Host interaction checks

#### Expansion, layout, and diffs

- Check Pi expansion and fullscreen clicks on summaries/diagnostics before/after scroll and resize: toggle only the clicked group. Verify wheel scrolling and no regular-mode mouse capture.
- Check [layout](presentation.md#card-layout) in dark/light and wide/narrow views. Defaults keep MCP/generic arguments visible and other specialized parameter blocks hidden, even expanded.
- Set `showParameters: true` under the literal `ext.pi-tool-display` key in the fixture's `agent/settings.json`. Run `/reload` to inspect enabled parameters. For project merging, use a trusted `work/.pi/settings.json` and the [configuration contract](../README.md#configuration).
- With `diff`, resize between unified and side-by-side views and expand the whole card. Changes must remain visible, and row backgrounds must not extend into separators or following content.

#### Exploration groups and images

- Run `scopes`. Verify that the global expansion action expands all groups. Compare live cards with `--reuse` reconstruction.
- Run `native-mixed`, `normalization`, and `exceptions` to verify the groups listed above. Directory headings use **Exploring** or **Explored** without a scope-kind noun or operation counts. In `exceptions`, the failure count stays beside **Explored**. The diagnostic body uses `error` in collapsed and expanded cards.
- Run `filenames` at 48, 80, and 110 columns. Check that scope headings are not truncated, filenames are relative to the group directory, and ranges remain intact in `dim`. Expanded paths must be relative to the working directory.
- Run `fff`. Filter headings use **Filtering** or **Filtered** without call or operation counts, and grouped members do not repeat the filter. Expanded and standalone searches separate the pattern and filter with an em dash; empty-pattern listings use `Listed <filter>`. FFF filters must not merge with native directory scopes, even when their text matches.
- In `thinking`, toggle **Ctrl+T** during streaming/after completion: only completed collapsed placeholders disappear, not live indicators, explanation, or diagnostics. Compare `--reuse` replay.
- In collapsed `buffered`, keep the two-read group between `shell two` and `shell three`. Expand to verify call-specific commands, targets, and results; toggle thinking and compare replay. Later rows must not reuse earlier data.
- Run `explore`, then `images`: notices/images stay beneath their call before the next tool; assistant completion separates groups. Compare replay.
- With `images`, compare image display enabled and disabled. A supported terminal displays each image once before the next tool. Unsupported protocols retain a notice. Account for the [finalized-image limitation](#platform-limitations).

#### Saved output

With `output`, expand to load the saved preview. The failure card must retain its diagnostic. Compare generated omissions with literal lookalikes using the [native text-envelope provenance limits](../src/adapters/native/README.md#text-envelope-provenance).

To check missing output:

1. Stop the fixture session.
2. Remove only the referenced output file inside the disposable fixture directory.
3. Reopen with `--reuse`. Retained output and an unavailable notice must remain.

#### History and lifecycle

- Reload twice and issue another `explore`.
- Exercise new and resumed sessions, forks, tree navigation, and compaction when changing those integrations. Include boundary-generated compaction and custom messages: retained groups keep expansion ownership, visible messages separate groups, and hidden messages/context edits do not. Historical reconstruction must not execute calls or animate missing outcomes. Print-created histories have no automatic display facts; new interactive calls can acquire them.
- Exercise user `!` and `!!` commands when changing shell integration. Pi continues to render these shell cards, outside exploration groups and automatic display observation.

### Finalized-message middleware

Add the relevant fixed call plan or scoped middleware to [provider.ts](../validation/provider.ts) and prepare disposable inputs in [workspace.ts](../validation/workspace.ts).

Compare live/replay results with [host cases](../src/host/install.test.ts). Keep observed facts separate from published outcomes. Change disposable files before replay; patches must come from retained data.

## Adapter validation

- [@ff-labs/pi-fff checks](../src/adapters/@ff-labs/pi-fff/README.md#validation).
- [pi-mcp-adapter fixture](../src/adapters/pi-mcp-adapter/README.md#validation).

## Platform limitations

Pi 0.87.0 does not update a live native image row when finalized-message middleware adds or removes result images. API checks with and without the extension reproduce this behavior, including Kitty image output. Reconstructed rows use the finalized images.

Check Kitty/iTerm images, links, drag selection, and clipboard in supporting terminals. The launcher uses Unix Bash; Windows/PowerShell need separate `pwsh` and platform-specific launch checks.
