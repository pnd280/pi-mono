# pi-fff-guard

Blocks explicit missing or Git-ignored FFF targets. FFF's index omits ignored paths ([FFF #714](https://github.com/dmtrKovalenko/fff/issues/714)).

## Compatibility

Requires Node.js 24+, Git, and the separately installed/loaded official [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff). Validated with Pi 0.85.1 and FFF 0.10.6.

Intercepts enabled `fffind`, `ffgrep`, `fff-multi-grep`, and FFF's `find`, `grep`, `multi_grep` overrides only when Pi attributes them to the official package. Built-ins, unrelated tools, and unrecognized forks pass through.

## Usage

An `fffind` call targeting an ignored path returns:

```text
fffind does not work with Git-ignored paths. Retry with rg or another available tool.
```

Missing explicit targets return `No such file or directory` before ignore checks. `path: "src/main.ts"` is explicit; `path: "main.ts"` is a recursive filename filter and needs no non-ignored local file.

See [search scopes](docs/search-scopes.md) for normalization, globs, exclusions, repositories, and symlinks.

### Limits

Inspection has a two-second deadline and scope/symlink traversal limits. Malformed scopes, timeout, Git failure, or symlink cycles allow the call with a plain-text UI/stderr diagnostic. Cancellation blocks it.

Wrappers must dispatch children through Pi hooks; direct `execute()` bypasses detection. Slash commands and `@` autocomplete are not intercepted.

## Configuration

No options or extension-specific environment variables.

## Side effects

No persistent state, network requests, or project writes. Subprocesses only inspect Git. Arguments, registrations, and active tools stay unchanged; the guard neither runs replacement searches nor terminates turns.

## Validation

Use [focused checks](../../../docs/development.md#focused-validation) for `pi-fff-guard`.

## Retirement

After a released FFF version implements [FFF #714](https://github.com/dmtrKovalenko/fff/issues/714):

1. Disable the guard.
2. Check ignored-file, ignored-directory, and linked-dependency searches for every tool in use.
3. If they pass, check missing explicit paths before retiring the guard; retain separate path validation if needed.

The guard does not check FFF versions at runtime.
