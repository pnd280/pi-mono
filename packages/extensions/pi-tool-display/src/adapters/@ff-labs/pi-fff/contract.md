# @ff-labs/pi-fff adapter contract

[@ff-labs/pi-fff adapter](README.md) · [Adapter development](../../../../docs/adapters.md)

Adapter maintainers use this contract when they change argument or result validation. [FFF cards](../../../../docs/tools.md#fff) describes what users see.

## Arguments and results

Registered schemas must declare `pattern` as a string or `patterns` as an array. Retained patterns must be strings, including every multi-search element. A supplied `path`, find `cursor`, or multi-search `constraints` must be a string.

Missing result details and empty details objects are supported. Nonempty details objects must contain finite numeric `totalMatched` and `totalFiles`. Null, primitive, and array details are rejected. Incompatible retained calls or results use generic cards and do not join exploration groups.

## Display

Groups use the literal `path` or multi-search `constraints` as their filter. Result summaries need nonnegative integer `totalMatched` and `totalFiles`:

- For grep and multi-grep, `totalMatched` is the number of matches collected for the call.
- For find, `totalMatched` is the total number of matching files, which can exceed the current page.
- `totalFiles` is the unfiltered number of indexed files.
