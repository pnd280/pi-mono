# pi-fff-guard

The guard stops FFF searches that would silently return nothing, or only matches from other files, because their target is missing or Git-ignored. For example, `ffgrep` with `path: "node_modules/zod"` finds no matches, because FFF's index leaves out ignored paths ([FFF #714](https://github.com/dmtrKovalenko/fff/issues/714)). With this guard the model is told why, and can retry with another tool.

## Compatibility

The guard requires Git and the official [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff), installed and loaded separately. It was validated with Pi 1.4.0 and FFF 0.11.0.

The guard checks FFF's search tools, and its overrides of native tool names, only when Pi attributes them to the official package. It leaves built-in tools and unrecognised forks alone.

## Usage

| Target                                   | Result                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Git-ignored                              | Blocked, with a hint to retry using another tool.                         |
| Explicit path that doesn't exist         | `No such file or directory`, checked before ignore rules.                 |
| Bare filename, such as `path: "main.ts"` | Allowed. FFF treats it as a recursive filter, not a path that must exist. |

For rooted globs, exclusions, repositories, and symlinks, see [search scopes](docs/search-scopes.md).

### Limits

- Inspection has a two-second deadline. It fails for paths or filters with more than 128 components, and for link chains of 32 or more links. If inspection fails and no other target is blocked, the guard allows the call and shows a diagnostic in the UI or on stderr. If you cancel, the guard blocks the call.
- Tools that wrap FFF must dispatch child calls through Pi hooks; calling `execute()` directly skips the guard.
- Slash commands and `@` autocomplete aren't checked.

## Side effects

- The guard runs Git subprocesses to inspect ignore rules.
- It keeps no state, makes no network requests, and writes nothing to the project.
- It never runs replacement searches or ends turns.

## Validation

Run the [focused checks](../../../docs/development.md#focused-validation) for `pi-fff-guard`. Tests require Git and `mkfifo`.

| When you change                   | Read                                           |
| --------------------------------- | ---------------------------------------------- |
| Interception or search scopes     | The [coverage specification](docs/testing.md). |
| Pi or FFF versions, or retirement | [Pi compatibility](docs/pi-compatibility.md).  |

## Retirement

The guard doesn't check FFF versions at runtime. Once a released FFF version fixes [FFF #714](https://github.com/dmtrKovalenko/fff/issues/714), follow the [retirement checks](docs/pi-compatibility.md#retirement-checks) before removing it.
