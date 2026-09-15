# pi-fff-guard

Blocks FFF searches that explicitly target missing or Git-ignored paths. FFF's workspace index omits ignored paths ([FFF #714](https://github.com/dmtrKovalenko/fff/issues/714)).

## Compatibility

Requires Node.js 24+, Git, and the official [`@ff-labs/pi-fff` extension](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff), installed and loaded separately. Validated with Pi 0.85.1 and FFF 0.10.6.

Intercepts `fffind`, `ffgrep`, and `fff-multi-grep` when enabled, plus FFF's `find`, `grep`, and `multi_grep` overrides. Pi must attribute the tool to the official `@ff-labs/pi-fff` package; built-ins, unrelated tools, and unrecognized forks pass through.

## Usage

For an `fffind` call targeting a Git-ignored path, the guard returns:

```text
fffind does not work with Git-ignored paths. Retry with rg or another available tool.
```

The guard blocks missing explicit targets with `No such file or directory` before checking ignore rules.

A file path with a directory component, such as `path: "src/main.ts"`, is checked as an explicit target. `path: "main.ts"` is a recursive filename filter. A missing or Git-ignored file with that name in the current directory does not block the search.

See [search scopes](docs/search-scopes.md) for path normalization, globs, exclusions, and Git ignore behavior across repositories and symbolic links.

### Limits

Checks have a two-second deadline and traversal limits for search scopes and symbolic links. If scope arguments are malformed, inspection times out, Git fails, or links form a cycle, the guard allows the FFF call. It reports a plain-text diagnostic in the UI or stderr. Cancellation blocks the call.

Wrappers must dispatch child tool calls through Pi's hooks; direct `execute()` calls bypass detection. Slash commands and `@` autocomplete are not intercepted.

## Configuration

There are no configuration options or extension-specific environment variables.

## Side effects

The extension keeps no persistent state, makes no network requests, and writes no project files. Subprocesses only inspect Git state.

Tool arguments, registrations, and the active tool list remain unchanged. The extension does not run a replacement search or terminate the turn.

## Validation

Use the [focused validation commands](../../../docs/development.md#focused-validation) with package name `pi-fff-guard`.

## Retirement

Once a released FFF version implements [FFF #714](https://github.com/dmtrKovalenko/fff/issues/714):

1. Disable this extension.
2. Verify ignored-file, ignored-directory, and linked-dependency searches for every tool in use.
3. If those searches pass, check that FFF also reports missing explicit paths before retiring this extension. Retain separate path validation if it does not.

The extension does not check the FFF version at runtime.
