# pi-fff-guard

Blocks explicit missing or Git-ignored FFF targets. FFF's index omits ignored paths ([FFF #714](https://github.com/dmtrKovalenko/fff/issues/714)).

## Compatibility

Requires Node.js 24+, Git, and the separately installed/loaded official [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff). Validated with Pi 0.85.1 and FFF 0.10.6.

Intercepts official FFF search tools and its native-tool overrides only when Pi attributes them to the official package. Built-ins and unrecognized forks pass through.

## Usage

Ignored targets are blocked with a retry hint; missing explicit targets return `No such file or directory` before ignore checks. A bare filename such as `path: "main.ts"` is a recursive filter, not an explicit target that must exist locally.

For rooted globs, exclusions, repositories, and symlinks, see [search scopes](docs/search-scopes.md).

### Limits

Inspection has a two-second deadline and scope limits. Inspection failures allow the call with a UI/stderr diagnostic; cancellation blocks it.

Wrappers must dispatch children through Pi hooks; direct `execute()` bypasses detection. Slash commands and `@` autocomplete are not intercepted.

## Side effects

No persistent state, network requests, or project writes. Git inspection uses subprocesses; the guard does not run replacement searches or terminate turns.

## Validation

[Coverage specification](docs/testing.md) · [Pi compatibility](docs/pi-compatibility.md). Use [focused checks](../../../docs/development.md#focused-validation) for `pi-fff-guard`.

## Retirement

After a released FFF version fixes [FFF #714](https://github.com/dmtrKovalenko/fff/issues/714), follow the [retirement checks](docs/pi-compatibility.md#retirement-checks) before removing the guard. It does not check FFF versions at runtime.
