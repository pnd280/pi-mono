# @ff-labs/pi-fff integration

[Tool coverage](../../../../README.md#tool-coverage) · [Adapter development](../../../../docs/adapters.md)

## Compatibility and selection

`piFffAdapter(toolInfo)` verifies official [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff) 0.10.6 provenance/schemas for:

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

Adjacent calls [group](../../../../docs/presentation.md#groups) by exact literal `path` or multi-search `constraints`, defaulting to `.` when empty/omitted. `src/**` and `./src/**` differ; filters never merge with native directories.

Explicit empty patterns remain valid: `ffgrep` displays `""`, and `fffind` uses `Listing <filter>` or `Listed <filter>`, defaulting to `.`. Missing patterns show `(pattern missing)` and do not qualify for grouping.

Completed successful calls with nonnegative integer counts show result summaries instead of match excerpts in compact cards, both inside and outside groups:

- Grep and multi-grep label `totalMatched` as matches collected for the call, for example `9 matches collected`.
- Find labels `totalMatched` as the total matching files, which can exceed the current page.
- `totalFiles` is the unfiltered number of indexed files, not the number searched or containing matches.

Missing or invalid counts use bounded output previews. Calls with [incompatible details](#arguments-and-results) use generic cards. Failed and partial results do not receive completed-result summaries.

Counts and file annotations use `dim`. Pagination instructions, limit hints, and query and fallback diagnostics use `warning` and remain visible in compact and expanded cards. Combined notices and multiline queries retain their full text.

## Validation

The [terminal fixture](../../../../docs/validation.md#terminal-launcher) uses nonignored files in disposable Git for `fff`. Install official `@ff-labs/pi-fff` separately; it is not a workspace dependency.

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

Enable multi-search with `env: { PI_FFF_MULTIGREP: "1" }` in `fixtureLaunch`'s `createPiLaunch` in [workspace.ts](../../../../validation/workspace.ts). The launcher filters environment variables; a shell prefix does not work.

Before/after reload, compact cards/groups must show match counts, not index counts/excerpts. Both modes retain pagination, limit, query, and fallback notices. Expansion reveals index counts and retained matches beside summaries.
