# pi-fff-guard

Blocks explicit missing or Git-ignored FFF targets. FFF's index omits ignored paths ([FFF #714](https://github.com/dmtrKovalenko/fff/issues/714)).

## Compatibility

Requires Node.js 24+, Git, and the separately installed/loaded official [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff). Validated with Pi 0.85.1 and FFF 0.10.6.

Intercepts official FFF search tools and its native-tool overrides only when Pi attributes them to the official package. Built-ins and unrecognized forks pass through.

## Usage

Ignored targets are blocked with a retry hint; missing explicit targets return `No such file or directory` before ignore checks. A bare filename such as `path: "main.ts"` is a recursive filter, not an explicit target that must exist locally.

See [search scopes](docs/search-scopes.md) for normalization, globs, exclusions, repositories, and symlinks.

### Limits

Inspection has a two-second deadline and scope limits. Inspection failures allow the call with a UI/stderr diagnostic; cancellation blocks it.

Wrappers must dispatch children through Pi hooks; direct `execute()` bypasses detection. Slash commands and `@` autocomplete are not intercepted.

## Configuration

No options or extension-specific environment variables.

## Side effects

No persistent state, network requests, or project writes. Git inspection uses subprocesses; the guard does not run replacement searches or terminate turns.

## Validation

[Coverage specification](docs/testing.md).

Use [focused checks](../../../docs/development.md#focused-validation) for `pi-fff-guard`.

## Retirement

After a released FFF version implements [FFF #714](https://github.com/dmtrKovalenko/fff/issues/714):

1. Disable the guard.
2. Check ignored-file, ignored-directory, and linked-dependency searches for every tool in use.
3. If they pass, check missing explicit paths before retiring the guard; retain separate path validation if needed.

The guard does not check FFF versions at runtime.
