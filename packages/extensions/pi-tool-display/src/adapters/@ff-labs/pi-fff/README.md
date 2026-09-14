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

Supported calls participate in exploration groups. Explicit empty patterns remain valid searches: `ffgrep` displays `""`; `fffind` lists files. Missing patterns show `(pattern missing)` and do not qualify for grouping.

Searches and file listings show `in .` when their scope is omitted or empty, in both compact and expanded summaries. Search patterns and scope/filter expressions remain literal; they are not rewritten as file paths.

Pagination instructions, limit hints, and query/fallback diagnostics remain visible in compact and expanded cards, preserving the full text of combined notices and multiline queries. Matches remain available on expansion. Counts and file annotations use `dim`; pagination/limit notices and query/fallback diagnostics use `warning`.

## Validation

The [shared terminal fixture](../../../../docs/validation.md#terminal-procedure) has no built-in FFF scenario. Add the relevant fixed call plan to [provider.ts](../../../../validation/provider.ts) and prepare disposable inputs in [workspace.ts](../../../../validation/workspace.ts).

The official `@ff-labs/pi-fff` extension must be installed separately; it is not a workspace dependency. Load its `src/index.ts` with an additional `-e` argument and enable its tool names through Pi's `--tools` option.

For multi-search, add `PI_FFF_MULTIGREP: "1"` to the `env` object returned by `fixtureLaunch` in [workspace.ts](../../../../validation/workspace.ts). The launcher filters the environment, so prefixing its command with `PI_FFF_MULTIGREP=1` does not enable multi-search.

Before and after reload, check that pagination, limit hints, and query/fallback diagnostics remain visible in compact and expanded cards, and that expansion reveals retained matches.
