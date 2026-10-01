# @ff-labs/pi-fff integration

[Supported tools](../../../../README.md#supported-tools) · [Adapter development](../../../../docs/adapters.md)

## Compatibility and selection

FFF searches appear as compact cards with match counts, grouped by search filter.

`piFffAdapter(toolInfo)` checks the provenance and schemas of the official [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff) 0.10.6 for its `fffind`, `ffgrep`, and `fff-multi-grep` tools and overridden `find`, `grep`, and `multi_grep` names. See [name classification](../../../../../../utils/src/fff-tools.ts) and the [resolver](index.ts) for current contracts.

See [automatic selection](../../../../docs/adapters.md#automatic-selection) for renderer overrides and fallback policy.

## Arguments and results

Registered schemas must declare `pattern` as a string or `patterns` as an array. Retained patterns must be strings, including every multi-search element.

Missing or empty result details are supported. Nonempty details objects must contain finite numeric `totalMatched` and `totalFiles`. Incompatible retained calls or results use generic cards and do not join exploration groups.

## Display

Adjacent calls [group](../../../../docs/presentation.md#groups) by exact literal `path` or multi-search `constraints`, defaulting to `.` when empty or omitted. `src/**` and `./src/**` are different filters, and filters never merge with native directories.

Explicit empty patterns remain valid; missing patterns cannot group and fall back to generic cards after a result arrives.

Completed successful calls with nonnegative integer counts show result summaries instead of match excerpts in compact cards, both inside and outside groups:

- Grep and multi-grep label `totalMatched` as matches collected for the call.
- Find labels `totalMatched` as the total matching files, which can exceed the current page.
- `totalFiles` is the unfiltered number of indexed files, not the number searched or containing matches.

Missing or invalid counts use bounded output previews. Calls with [incompatible details](#arguments-and-results) use generic cards. Failed and partial results do not receive completed-result summaries.

Pagination, limit, query, and fallback notices remain visible in compact and expanded cards.

## Validation

The [terminal fixture](../../../../docs/validation.md#terminal-launcher) uses nonignored files in disposable Git for `fff`. Install official `@ff-labs/pi-fff` separately; it is not a workspace dependency.

1. From the repository root, launch the fixture with the extension's `src/index.ts` and its tool names enabled:

   ```sh
   vpr 'pi-tool-display#validate:terminal' fullscreen \
     -e /absolute/path/to/@ff-labs/pi-fff/src/index.ts \
     --fff-mode tools-only --tools read,ls,grep,ffgrep,fffind
   ```

2. Press **Ctrl+O** for compact mode, then enter `fff`. Wait for `Fixture finished: fff`. If any required tools are unavailable, the scenario reports a skip and issues no calls instead.
3. When replaying with `--reuse`, include the same extension and flags.

Enable multi-search with `env: { PI_FFF_MULTIGREP: "1" }` in `fixtureLaunch`'s `createPiLaunch` in [workspace.ts](../../../../validation/workspace.ts). The launcher filters environment variables; a shell prefix does not work.

Before and after reload, check the completed scenario:

| Do                                  | Expect                                                         |
| ----------------------------------- | -------------------------------------------------------------- |
| Inspect the filter groups.          | `a/**` and `./a/**` form two separate groups.                  |
| Inspect each filter group.          | It contains two searches and one empty-pattern listing.        |
| Inspect the `a/` FFF search.        | It remains standalone.                                         |
| Inspect the native calls.           | The list and read share a directory group.                     |
| Inspect compact cards and groups.   | They show match counts instead of index counts or excerpts.    |
| Compare compact and expanded cards. | Pagination, limit, query, and fallback notices remain visible. |
| Expand a card.                      | Index counts and retained matches appear beside the summaries. |
