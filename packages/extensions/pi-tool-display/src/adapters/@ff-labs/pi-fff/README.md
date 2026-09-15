# @ff-labs/pi-fff integration

[Tool coverage](../../../../README.md#tool-coverage) · [Adapter development](../../../../docs/adapters.md)

## Compatibility and selection

`piFffAdapter(toolInfo)` supports the inspected official [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff) 0.10.6 contracts. It verifies package provenance and parameter schemas before matching these names:

| Tool             | FFF override | Summary arguments         |
| ---------------- | ------------ | ------------------------- |
| `fffind`         | `find`       | `pattern`, `path`         |
| `ffgrep`         | `grep`       | `pattern`, `path`         |
| `fff-multi-grep` | `multi_grep` | `patterns`, `constraints` |

See [automatic selection](../../../../docs/adapters.md#automatic-selection) for renderer overrides and fallback policy.

## Arguments and results

Registered schemas must declare `pattern` as a string or `patterns` as an array. Retained patterns must be strings, including every multi-search element.

Missing or empty result details are supported. Nonempty details objects must contain finite numeric `totalMatched` and `totalFiles`. Incompatible retained calls or results use generic cards and do not join exploration groups.

## Display

Supported calls participate in exploration groups. Explicit empty patterns remain valid searches: `ffgrep` displays `""`; `fffind` lists files. Missing patterns show `(pattern missing)` and do not qualify for grouping.

Compact and expanded search and file-listing summaries show `in .` when their scope is omitted or empty. Search patterns, scopes, and filters remain literal; they are not rewritten as file paths.

Pagination instructions, limit hints, and query and fallback diagnostics remain visible in compact and expanded cards. Combined notices and multiline queries retain their full text. Matches remain available on expansion.

Counts and file annotations use `dim`. Pagination and limit notices, plus query and fallback diagnostics, use `warning`.

## Validation

The [shared terminal fixture](../../../../docs/validation.md#terminal-launcher) has no built-in FFF scenario. Add the relevant fixed call plan to [provider.ts](../../../../validation/provider.ts) and prepare disposable inputs in [workspace.ts](../../../../validation/workspace.ts).

The official `@ff-labs/pi-fff` extension must be installed separately; it is not a workspace dependency. Load its `src/index.ts` with an additional `-e` argument and enable its tool names through Pi's `--tools` option.

For multi-search, pass `env: { PI_FFF_MULTIGREP: "1" }` to `createPiLaunch` inside `fixtureLaunch` in [workspace.ts](../../../../validation/workspace.ts). The launcher filters the environment, so prefixing its command with `PI_FFF_MULTIGREP=1` does not enable multi-search.

Before and after reload, check that pagination, limit hints, and query and fallback diagnostics remain visible in compact and expanded cards. Expansion must reveal retained matches.
