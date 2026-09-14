# Terminal validation

## Terminal procedure

For integration/interaction changes, launch the [offline fixture](../src/validation/launch-terminal.ts) from the workspace root. It requires the installed workspace dependencies, Node, and a Unix Bash backend:

```sh
vpr 'pi-tool-display#validate:terminal' regular
```

The launcher uses the installed Pi executable with only this extension and an offline [scripted provider](../src/validation/provider.ts). The provider emits fixed tool calls; it does not contact a model service or interpret arbitrary prompts as commands.

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
- Inspect [card layout](renderers.md#card-layout) in dark/light themes and wide/narrow windows. Defaults hide specialized parameter blocks even after expansion; generic arguments stay visible. Set `showParameters: true` under the literal `ext.pi-tool-display` key in the fixture's `agent/settings.json`, then `/reload` to inspect enabled parameters. For project merging, use a trusted `work/.pi/settings.json` and the [configuration contract](../README.md#configuration).
- With `diff`, resize between unified and side-by-side views and expand the whole card. Check that actual changes remain visible and row backgrounds do not leak into separators or following content.
- With `output`, expansion should load the saved preview while the failure card retains its diagnostic. In a disposable replay, remove the output file referenced by the card and reopen the session: retained output and an unavailable notice should remain. Compare generated preview omissions with literal lookalikes using the [semantic-color limitations](renderers.md#semantic-colors).
- With `images`, compare image display enabled and disabled. A supported terminal should display each image once before the next tool; unsupported protocols retain a notice. Account for the [finalized-image limitation](#platform-limitations).
- Reload twice and issue another `explore`. Exercise new/resumed sessions, forks, tree navigation, and compaction when changing those integrations. Historical reconstruction must not execute calls or animate missing outcomes. Print-created histories have no automatic display facts; new interactive calls can acquire them.
- Exercise user `!` and `!!` commands when changing shell integration. They remain Pi-owned shell cards, outside exploration groups and automatic display observation.

### Additional provider and middleware cases

For FFF or finalized-message middleware checks, add the relevant fixed call plan or scoped middleware to [provider.ts](../src/validation/provider.ts) and prepare disposable inputs in [workspace.ts](../src/validation/workspace.ts). MCP has a [separate fixture setup](#mcp-fixture).

For FFF checks, explicitly load the installed official extension with an additional `-e` argument and enable its names through Pi's `--tools` option. Multi-search also needs that extension's `PI_FFF_MULTIGREP=1` environment in the isolated launch configuration. Exercise real results before and after reload: pagination, limit hints, and query/fallback diagnostics remain visible in compact and expanded cards, and matches remain available on expansion.

For finalized-message changes, compare live and replayed results with the corresponding [host integration cases](../src/host-integration.test.ts). Observed operation facts must remain separate from published outcomes. Modify disposable working files before replay to distinguish retained patches from observations of today's files.

### MCP fixture

The `mcp` prompt uses the offline [stdio backend](../src/validation/mcp-server.ts) through an installed `pi-mcp-adapter` 2.33.0. It covers gateway connection/description/calls, a namespace image/resource result, a direct tool, scripting, a returned error, and output truncation. The backend performs no network requests or filesystem work; the MCP package writes its normal cache and output artifacts inside the isolated fixture.

Create a terminal fixture using the launcher, then exit. In its printed directory, create `agent/mcp.json` with the following configuration. Replace `/absolute/path/to/pi-mono` with your checkout path:

```json
{
  "mcpServers": {
    "display": {
      "command": "node",
      "args": [
        "/absolute/path/to/pi-mono/packages/extensions/pi-tool-display/src/validation/mcp-server.ts"
      ],
      "lifecycle": "eager"
    },
    "direct": {
      "command": "node",
      "args": [
        "/absolute/path/to/pi-mono/packages/extensions/pi-tool-display/src/validation/mcp-server.ts"
      ],
      "lifecycle": "eager",
      "directTools": true
    }
  }
}
```

Reopen that fixture, explicitly loading the real installed package entry point and enabling its tools:

```sh
vpr 'pi-tool-display#validate:terminal' regular --reuse /tmp/pi-tool-display-terminal-EXAMPLE \
  -e /absolute/path/to/node_modules/pi-mcp-adapter/index.ts \
  --tools 'mcp,mcpScript,mcp__display,direct_echo'
```

Enter `mcp` and wait for `Fixture finished: mcp`. Check compact and expanded cards, then `/reload`. Exit and repeat the command with `fullscreen` instead of `regular`, retaining `--reuse`, `-e`, and `--tools`, to check replay.

- Resolved echo calls show `display.echo` or `direct.echo`; connection and description headings retain their action and target.
- Image/resource output stays beneath its call, returned errors remain visible, and large output retains a saved-output reference without reading that file.
- With `showParameters: true`, call arguments and script code remain available. Use an exact-name `original` override to compare the owner's UI; see [configuration](../README.md#configuration).

## Platform limitations

Pi **0.85.1** does not update a live native image row when finalized-message middleware adds or removes result images. This also occurs without the extension; reconstructed rows use the finalized images.

Visible Kitty/iTerm images, link activation, and drag/clipboard behavior require checks in a supporting terminal. The supplied launcher targets Unix Bash and does not validate Windows/PowerShell execution; that requires an available `pwsh` backend and platform-specific launch settings.
