# pi-tool-display

Borderless Pi TUI tool cards with one-line run summaries, exploration groups, live shell previews, and [file diffs](docs/presentation.md#diff-viewer), using the active theme/highlighter.

## Usage

Pi's expansion key (default **Ctrl+O**) cycles **summary** → **compact** → **verbose** → **summary**:

- **Summary** (default): each completed tool-call run becomes [one summary line](docs/presentation.md#summary-mode); pending runs show compact cards. Requires fullscreen mode; in regular mode, summary renders as compact and **Ctrl+O** toggles compact and verbose. Click a line to open its run; click its horizontal rule to collapse it again.
- **Compact**: the cards and groups described below.
- **Verbose**: every card expanded, with Pi's startup header and loaded resources. Pi's `--verbose` starts here.

Adjacent compatible calls form [exploration groups](docs/presentation.md#groups); compact cards show bounded [result previews or summaries](docs/presentation.md#results) and edit/write diffs. Diagnostics and images stay visible in compact mode. In fullscreen, clicks expand cards, groups, or summary runs; regular mode leaves mouse input to the terminal.

Summary mode hides output from transcript search, including image and failure details until the run opens. Switching modes does not preserve scroll position. Assistant prose uses a `•` marker; collapsed thinking (default **Ctrl+T**) hides completed thinking blocks. See [presentation](docs/presentation.md#thinking) for boundaries and replay behavior.

### Tool coverage

Specialized adapters for [verified native tools](src/adapters/native/README.md) and supported extension tools override supplied custom renderers. See [adapter selection and the supported integrations](docs/adapters.md#built-in-adapters). Other tools retain their custom renderer slots or use generic cards, including historical calls without a current definition. The [nested-instruction message adapter](src/adapters/pi-nested-instructions/README.md) also renders notices and contributes to run summaries.

Tool authors can use the [standalone renderer API](docs/renderers.md); automatic integration requires an [adapter resolver](docs/adapters.md#add-an-adapter).

## Configuration

Set literal `ext.pi-tool-display` in global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`). Trusted projects may override it in `.pi/settings.json`:

```json
{
  "ext.pi-tool-display": {
    "collapsedMode": "summary",
    "showParameters": false,
    "rendererOverrides": {
      "search_docs": "generic",
      "bash": "original"
    }
  }
}
```

`collapsedMode` starts in `summary` by default or `compact`; it also selects the target of programmatic collapse from verbose. **Ctrl+O** still follows the [mode cycle](#usage). Mode changes survive `/reload` and session switches in the same process without writing settings; a new process uses the startup setting (or `--verbose`).

`showParameters` defaults to `false` for specialized cards. Set it to `true` to show optional details; structured blocks still require expansion. MCP and generic cards always show arguments. Neither setting changes execution, saved arguments, or custom renderers.

`rendererOverrides` matches exact tool names: `auto` uses [automatic selection](docs/adapters.md#automatic-selection), `generic` shows supplied data without specialization or this extension's observation, and `original` bypasses its rendering, grouping, and future observation. Overrides do not disable another extension's observations.

Trusted project fields merge over global settings by key; an `auto` override resets an inherited per-tool override. Untrusted project settings are ignored. **An invalid applicable section, even one overridden later, keeps original rendering and disables display observations.** Check the terminal warning for its source/key, then fix settings and `/reload`.

No extension-specific environment variables, CLI flags, or settings writes.

## Side effects

### Observation and saved history

In participating TUI sessions, verified native `bash`, `powershell`, `edit`, and `write` observations collect shell previews, timing, outcomes, and pre-write contents. [File observations](../../libs/src/file-mutations/README.md) are shared with `pi-agent-summary` without duplicate reads. External writers may race; display failures never change tool outcomes.

Session history stores operation/cancellation facts, bounded patches, and saved-output references in `pi-tool-display.facts` custom entries outside model context. Live shell previews stay in memory. **Deleted/context lines from overwritten files may persist in history.**

Display observation excludes SDK overrides, custom tools, and manual `!`/`!!` commands. Other extensions may still observe files in print, JSON, or RPC modes.

History replays facts for matching calls on the selected ancestry without rerunning tools or rereading files. Missing operation facts stay unknown; [outcomes](docs/presentation.md#outcomes) cannot be inferred from output text alone.

Expanding completed shell cards reads bounded previews from Pi's temporary output files; see [loading/retry behavior](docs/presentation.md#saved-output-previews). No durable output archive or network requests.

[Resource limits](docs/presentation.md#resource-limits) bound output, previews, and patches; large, binary, or unavailable changes never block native operations.

## Compatibility

Verified against Pi 0.99.1 via offline API and installed-CLI tests. Unsupported host hooks warn and fall back: native observation stops (saved data can still render), assistant presentation remains native, summary mode renders as compact, or **Ctrl+O** toggles only collapsed and verbose modes, according to the unavailable contract. See the [compatibility checklist](docs/pi-compatibility.md).

No tool registration, active-tool changes, or added keybindings; the mode cycle reuses Pi's expansion action. Custom cards do not apply to HTML exports.

## Validation

[Coverage specification](docs/testing.md).

Use [focused checks](../../../docs/development.md#focused-validation) for `pi-tool-display` and the [validation guide](docs/validation.md) for manual host checks and platform limits.
