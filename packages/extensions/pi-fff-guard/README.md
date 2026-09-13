# pi-fff-guard

Blocks FFF searches that explicitly target missing or Git-ignored paths. FFF's workspace index omits ignored paths ([FFF #714](https://github.com/dmtrKovalenko/fff/issues/714)).

An ignored-path `fffind` call is blocked with:

```text
fffind does not work with Git-ignored paths. Retry with rg or another available tool.
```

Missing explicit paths return `No such file or directory` before ignore checks.

## Compatibility

Requires Node.js 24+ and Git. Validated with Pi 0.85.1 and `@ff-labs/pi-fff` 0.10.6.

Intercepts `fffind`, `ffgrep`, and enabled `fff-multi-grep`, plus FFF-owned `find`, `grep`, and `multi_grep` overrides. Pi must attribute the tool to the official `@ff-labs/pi-fff` package; built-ins, unrelated tools, and unrecognized forks pass through.

## Detection

A file path with a directory component, such as `path: "src/main.ts"`, is checked as an explicit target. `path: "main.ts"` is a recursive filename filter, including its `./main.ts` and workspace-local absolute aliases after FFF normalization. A missing or Git-ignored file with that name in the current directory does not block the recursive search.

See [search scopes](docs/search-scopes.md) for path syntax, exclusions, unsupported queries, and Git ignore behavior across repositories and symbolic links.

### Limits

Checks have a two-second deadline and bounded scope/link traversal. Malformed scope arguments, timeouts, Git errors, and link cycles allow the FFF call with a diagnostic (UI notification or stderr); cancellation blocks the call.

Wrappers must dispatch child tool calls through Pi's hooks; direct `execute()` calls bypass detection. Slash commands and `@` autocomplete are not intercepted.

## Configuration and side effects

No configuration, persistent state, network requests, or project-file writes. Subprocesses only inspect Git state.

Tool arguments, registrations, and the active tool list remain unchanged. The extension does not run a replacement search or terminate the turn.

## Validation and retirement

Use the [focused validation commands](../../../docs/development.md#focused-validation) with package name `pi-fff-guard`.

Once a released FFF version implements #714, disable this extension and verify ignored-file, ignored-directory, and linked-dependency searches for every tool in use. If they pass, check that FFF also reports missing explicit paths before retiring this extension, or retain path validation separately. The extension does not check the FFF version at runtime.
