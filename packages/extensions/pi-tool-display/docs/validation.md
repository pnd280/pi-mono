# Validation

## Automated checks

```sh
vpr 'pi-tool-display#format' --check
vpr 'pi-tool-display#check'
vpr 'pi-tool-display#test'
```

When changing the shared FFF classifier, also run these tasks for `@pi-mono/utils` and `pi-fff-guard`. See the workspace [verification workflow](../../../../docs/agents/verification.md).

## Terminal procedure

For integration/interaction changes, launch the [offline fixture](../src/validation/launch-terminal.ts) from the workspace root. It requires the installed workspace dependencies, Node, and a Unix Bash backend:

```sh
vpr 'pi-tool-display#validate:terminal' regular
```

The launcher uses the installed manifest's **`bin.pi` executable** and loads only this extension and the [scripted provider](../src/validation/provider.ts). The provider emits fixed calls through Pi's real tool pipeline; it does not contact a model service or interpret arbitrary prompts as commands.

The printed `Fixture directory` contains disposable working files, isolated home/settings directories, temporary output, and session history. It is retained after exit. The fixture changes only its prepared files and settings; it does not load your normal extensions, credentials, or project instructions. Keep it until replay checks finish, then remove that printed directory when no longer needed.

Enter these literal prompts in Pi:

| Prompt    | Inspect                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `explore` | Repeated reads, a missing-file diagnostic, and listing in source order.                                                           |
| `diff`    | Creation and edits, including separated hunks. Run once per fresh workspace; repeating the exact-match edits intentionally fails. |
| `output`  | Live output exceeding the retention budget, saved-file expansion, and a separate nonzero exit.                                    |
| `cancel`  | A long-running shell call; press Esc while it runs.                                                                               |
| `images`  | A native image read between text reads.                                                                                           |
| `public`  | A tool owner using the public standalone renderer factory.                                                                        |

Except for `cancel`, wait for `Fixture finished: <prompt>` before inspecting completed cards. Some calls intentionally fail. An unrecognized prompt lists the available scenarios without executing tools.

Exit with Ctrl+D on an empty editor. Repeat in fullscreen mode with a fresh workspace:

```sh
vpr 'pi-tool-display#validate:terminal' fullscreen
```

To reopen the original fixture session without resetting its files, use the directory printed by its launcher:

```sh
vpr 'pi-tool-display#validate:terminal' fullscreen --reuse /tmp/pi-tool-display-terminal-EXAMPLE
```

Additional arguments go to Pi. For example, append `--use-theme light` for appearance checks or `--print explore` to create a non-TUI history for later replay. Use `--help` instead of the mode for launcher usage.

### Host interaction checks

- Use Pi's configured tool expansion action and fullscreen group clicks on summaries and diagnostics. Scroll and resize before clicking again; the same group must expand. Check wheel scrolling and absence of mouse capture in regular mode. Link activation, drag selection, and clipboard behavior require a supporting terminal and suitable output.
- Run `explore`, then `images`. Notices and images must remain beneath their owning call and before the next tool. The assistant completion text separates the two exploration groups. Compare live cards with `--reuse` reconstruction.
- Inspect [card layout](renderers.md#card-layout) in dark/light themes and wide/narrow windows. Defaults hide specialized parameter blocks even after expansion; generic arguments stay visible. Change `ext.pi-tool-display.showParameters` in the fixture's `agent/settings.json`, then `/reload` to inspect enabled parameters. For project merging, use a trusted `work/.pi/settings.json` and the [configuration contract](../README.md#configuration).
- With `diff`, resize between unified and side-by-side views and expand the whole card. Check that actual changes remain visible and row backgrounds do not leak into separators or following content.
- With `output`, expansion should load the saved preview while the failure card retains its diagnostic. In a disposable replay, remove the output file referenced by the card and reopen the session: retained output and an unavailable notice should remain. Compare generated preview omissions with literal lookalikes using the [semantic-color limitations](renderers.md#semantic-colors).
- With `images`, compare image display enabled and disabled. A supported terminal should display each image once before the next tool; unsupported protocols retain a notice. Account for the [finalized-image limitation](#platform-limitations).
- Reload twice and issue another `explore`. Exercise new/resumed sessions, forks, tree navigation, and compaction when changing those integrations. Historical reconstruction must not execute calls or animate missing outcomes. Print-created histories have no automatic display facts; new interactive calls can acquire them.
- Exercise user `!` and `!!` commands when changing shell integration. They remain Pi-owned shell cards, outside exploration groups and automatic display observation.

### Additional provider and middleware cases

The base fixture has no FFF or MCP backend and does not replace finalized messages. When changing those integrations, add the relevant fixed call plan or scoped middleware to [provider.ts](../src/validation/provider.ts); [workspace.ts](../src/validation/workspace.ts) owns disposable input preparation.

For FFF checks, explicitly load the installed official extension with an additional `-e` argument and enable its names through Pi's `--tools` option. Multi-search also needs that extension's `PI_FFF_MULTIGREP=1` environment in the isolated launch configuration. Exercise real results before and after reload: pagination remains hidden, matches remain available on expansion, and query/fallback diagnostics remain visible. Do not substitute invented FFF ownership for this check.

For finalized-message changes, compare live and replayed results with the corresponding [host integration cases](../src/host-integration.test.ts). Observed operation facts must remain separate from published outcomes. Modify disposable working files before replay to distinguish retained patches from observations of today's files.

## Platform limitations

Pi **0.85.1** does not update a live native image row when finalized-message middleware adds or removes result images. This also occurs without the extension; reconstructed rows use the finalized images. Pi caches converted images by index, so replacing its result alone does not establish safe image replacement during asynchronous conversion. The extension continues to use Pi's image path.

Visible Kitty/iTerm images, link activation, drag/clipboard behavior, and Windows/PowerShell execution remain unverified. Component tests check no-image and Kitty emission paths, including joined grouped siblings, but emitted protocol sequences do not establish visible image rendering. The supplied launcher targets Unix Bash; real PowerShell validation requires an available `pwsh` backend and platform-specific launch settings.

Temporary-output availability, external file races, missing historical facts, and resource limits are documented in the [README](../README.md#observation-and-saved-history).
