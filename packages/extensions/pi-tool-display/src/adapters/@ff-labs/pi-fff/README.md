# @ff-labs/pi-fff integration

## Compatibility and selection

`piFffAdapter(toolInfo)` supports the inspected official [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff) 0.10.6 contracts. It verifies package provenance and parameter schemas before matching these names:

| Tool             | FFF-owned override | Summary arguments         |
| ---------------- | ------------------ | ------------------------- |
| `fffind`         | `find`             | `pattern`, `path`         |
| `ffgrep`         | `grep`             | `pattern`, `path`         |
| `fff-multi-grep` | `multi_grep`       | `patterns`, `constraints` |

See [automatic selection](../../../../docs/adapters.md#automatic-selection) for renderer overrides and fallback policy.

## Argument and result contract

Registered schemas must declare `pattern` as a string or `patterns` as an array. Retained patterns must be strings, including every multi-search element. Missing or empty result details are supported; nonempty details must contain finite numeric `totalMatched` and `totalFiles`. Incompatible retained calls or results use generic cards and do not join exploration groups.

## Display behavior and limitations

Supported calls participate in exploration groups. Explicit empty patterns remain valid searches: `ffgrep` displays `""`; `fffind` lists files in the supplied scope, defaulting to `.`. Missing patterns show `(pattern missing)` and do not qualify for grouping.

Search patterns and scope/filter expressions remain literal; they are not rewritten as file paths. Every pattern uses `syntaxString` in compact, standalone, and expanded summaries; scope/filter text retains `text`.

Pagination instructions, limit hints, and query/fallback diagnostics remain visible in compact and expanded cards, preserving the full text of combined notices and multiline queries. Matches remain available on expansion. Counts and file annotations use `dim`; pagination/limit notices and query/fallback diagnostics use `warning`.

FFF text-envelope styling does not establish text provenance. The shared [interpretation limits](../../../../docs/renderers.md#semantic-colors) apply.

## Validation

Use the [shared terminal fixture](../../../../docs/validation.md#terminal-procedure). Add the relevant fixed call plan to [provider.ts](../../../../validation/provider.ts) and prepare disposable inputs in [workspace.ts](../../../../validation/workspace.ts).

Explicitly load the installed official extension with an additional `-e` argument and enable its names through Pi's `--tools` option. Multi-search also needs that extension's `PI_FFF_MULTIGREP=1` environment in the isolated launch configuration.

Before and after reload, check that pagination, limit hints, and query/fallback diagnostics remain visible in compact and expanded cards, and that expansion reveals retained matches.
