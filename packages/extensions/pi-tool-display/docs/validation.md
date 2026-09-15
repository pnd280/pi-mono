# Tool display validation

[Package usage](../README.md)

## Automated checks

Use the [focused checks and test prerequisites](../../../../docs/development.md#focused-validation) with package name `pi-tool-display`.

## Terminal launcher

Complete [workspace setup](../../../../README.md#setup). The offline fixture requires a Unix Bash backend.

1. From the repository root, launch regular mode:

   ```sh
   vpr 'pi-tool-display#validate:terminal' regular
   ```

2. Work only in the printed `Fixture directory`. The launcher isolates working files, settings, and session history and loads an offline scripted provider. Reuse only launcher-created fixtures, never real agent or project directories.
3. Enter a literal prompt for the changed behavior:

   | Prompt    | Inspect                                                                                                                           |
   | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
   | `explore` | Repeated reads, a missing-file diagnostic, and listing in source order.                                                           |
   | `diff`    | Creation and edits, including separated hunks. Run once per fresh workspace; repeating the exact-match edits intentionally fails. |
   | `output`  | Live output exceeding the retention budget, saved-file expansion, and a separate nonzero exit.                                    |
   | `cancel`  | A long-running shell call; press Esc while it runs.                                                                               |
   | `images`  | A native image read between text reads.                                                                                           |
   | `public`  | A tool author using the public standalone renderer factory.                                                                       |

4. Except for `cancel`, wait for `Fixture finished: <prompt>` before inspecting completed cards. Some calls intentionally fail.
5. Exit with Ctrl+D in an empty editor. Repeat the checks in fullscreen mode with a fresh workspace:

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

- Use Pi's configured tool expansion action and fullscreen group clicks on summaries and diagnostics. Scroll and resize before clicking again. The same group must expand. Check wheel scrolling and absence of mouse capture in regular mode.
- Inspect [card layout](presentation.md#card-layout) in dark and light themes and wide and narrow windows. Defaults hide specialized parameter blocks even after expansion; generic arguments stay visible.
- Set `showParameters: true` under the literal `ext.pi-tool-display` key in the fixture's `agent/settings.json`. Run `/reload` to inspect enabled parameters. For project merging, use a trusted `work/.pi/settings.json` and the [configuration contract](../README.md#configuration).
- With `diff`, resize between unified and side-by-side views and expand the whole card. Changes must remain visible, and row backgrounds must not extend into separators or following content.

Link activation, drag selection, and clipboard behavior require a supporting terminal and suitable output.

#### Exploration groups and images

- Run `explore`, then `images`. Notices and images must remain beneath their originating call and before the next tool. The assistant completion text separates the two exploration groups. Compare live cards with `--reuse` reconstruction.
- With `images`, compare image display enabled and disabled. A supported terminal should display each image once before the next tool; unsupported protocols retain a notice. Account for the [finalized-image limitation](#platform-limitations).

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

Pi **0.85.1** does not update a live native image row when finalized-message middleware adds or removes result images. This also occurs without the extension; reconstructed rows use the finalized images.

Visible Kitty and iTerm images, link activation, drag selection, and clipboard behavior require checks in a supporting terminal. The supplied launcher targets Unix Bash. Windows and PowerShell execution require separate checks with an available `pwsh` backend and platform-specific launch settings.
