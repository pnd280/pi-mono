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

Adjacent supported FFF calls form [exploration groups](../../../../docs/presentation.md#groups) when their literal filters match exactly. The filter is `path`, or `constraints` for multi-search. An omitted or empty filter defaults to `.`. Filters such as `src/**` and `./src/**` remain distinct and never merge with native directory scopes.

Collapsed group headings label the scope as `filter` and omit operation counts. Members show only their search patterns or `files`, without repeating `in <scope>`. Standalone and expanded summaries retain the filter. Search patterns and filters remain literal.

Explicit empty patterns remain valid: `ffgrep` displays `""`, and `fffind` lists files. Missing patterns show `(pattern missing)` and do not qualify for grouping.

Pagination instructions, limit hints, and query and fallback diagnostics remain visible in compact and expanded cards. Combined notices and multiline queries retain their full text. Matches remain available on expansion.

Counts and file annotations use `dim`. Pagination and limit notices, plus query and fallback diagnostics, use `warning`.

## Validation

The [shared terminal fixture](../../../../docs/validation.md#terminal-launcher) includes a `fff` scenario using nonignored files in its disposable Git repository. The official `@ff-labs/pi-fff` extension must be installed separately. It is not a workspace dependency.

1. From the repository root, launch the fixture with the extension's `src/index.ts` and its tool names enabled:

   ```sh
   vpr 'pi-tool-display#validate:terminal' fullscreen \
     -e /absolute/path/to/@ff-labs/pi-fff/src/index.ts \
     --fff-mode tools-only --tools read,ls,grep,ffgrep,fffind
   ```

2. Enter `fff`. If any required tools are unavailable, the scenario reports a skip and issues no calls. Otherwise, wait for `Fixture finished: fff` and check the groups:
   - Two filter groups (`a/**` and `./a/**`), each with two searches and one empty-pattern listing.
   - A standalone `a/` FFF search.
   - A native directory group with a list and a read.
3. When replaying with `--reuse`, include the same extension and flags.

For multi-search, pass `env: { PI_FFF_MULTIGREP: "1" }` to `createPiLaunch` inside `fixtureLaunch` in [workspace.ts](../../../../validation/workspace.ts). The launcher filters the environment, so prefixing its command with `PI_FFF_MULTIGREP=1` does not enable multi-search.

Before and after reload, check that pagination, limit hints, and query and fallback diagnostics remain visible in compact and expanded cards. Expansion must reveal retained matches.
