# @ff-labs/pi-fff adapter

[pi-tool-display](../../../../README.md) · [Adapter development](../../../../docs/adapters.md)

FFF searches appear as compact cards with match counts, grouped by search filter. This page documents the adapter contract for its maintainers; if you use `@ff-labs/pi-fff`, read [Display](#display) for how its calls appear.

## Compatibility and selection

`piFffAdapter(toolInfo)` checks the provenance and schemas of the official [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff) for its `fffind`, `ffgrep`, and `fff-multi-grep` tools and overridden `find`, `grep`, and `multi_grep` names. Provenance accepts any package version; the schemas and cursor handling were inspected in 0.11.0. See [name classification](../../../../../../utils/src/fff-tools.ts) and the [resolver](index.ts) for current contracts.

See [automatic selection](../../../../docs/adapters.md#automatic-selection) for renderer overrides and fallback policy.

## Arguments and results

Registered schemas must declare `pattern` as a string or `patterns` as an array. Retained patterns must be strings, including every multi-search element. A supplied `path`, find `cursor`, or multi-search `constraints` must be a string.

Missing result details and empty details objects are supported. Nonempty details objects must contain finite numeric `totalMatched` and `totalFiles`. Null, primitive, and array details are rejected. Incompatible retained calls or results use generic cards and do not join exploration groups.

## Display

Adjacent calls [group](../../../../docs/presentation.md#groups) by exact literal `path` or multi-search `constraints`, defaulting to `.` when empty or omitted. `src/**` and `./src/**` are different filters, and filters never merge with native directories.

Explicit empty patterns remain valid; missing patterns cannot group and fall back to generic cards after a result arrives.

Find calls with a nonempty `cursor` show `page <cursor>` instead of the supplied pattern and filter. They stay outside exploration groups because FFF resumes a saved query whose pattern and scope are not in the result. Result counts and notices remain available.

Completed successful calls with nonnegative integer counts show result summaries instead of match excerpts in compact cards, both inside and outside groups:

- Grep and multi-grep label `totalMatched` as matches collected for the call.
- Find labels `totalMatched` as the total matching files, which can exceed the current page.
- `totalFiles` is the unfiltered number of indexed files, not the number searched or containing matches.

Missing or invalid counts use bounded output previews. Calls with [incompatible details](#arguments-and-results) use generic cards. Failed and partial results do not receive completed-result summaries.

Pagination, limit, query, and fallback notices remain visible in compact and expanded cards.

## Validation

The manual check needs official `@ff-labs/pi-fff` installed separately, because it is not a workspace dependency. Follow the [FFF terminal check](../../../../docs/validation.md#fff) for the launch flags, the multi-search setting, and the expected groups.
