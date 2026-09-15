# Tree rows

[Shared TUI](../../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/components/tree`](index.ts) adds connectors to already measured rows.

`renderTree` assigns branches after filtering items with no rows. It keeps continuation lines under their item and clips the combined connector and content to the supplied width. `followingSibling` continues the connector into a later fragment rendered by another component.

`renderTreeContinuation` renders rows beneath a parent heading without creating a child branch. `hasChildren` controls whether those rows retain the vertical connector.

Both functions accept caller-selected indentation and connector styling. Each connector occupies two columns after the indentation.

## Caller responsibilities

Callers choose item order, grouping, and visibility. They normalize and wrap content before creating `TreeItem` rows, reserving `indent + 2` columns for connectors. The [budgeted tree example](../../text-budget/README.md#usage) combines text compaction with connectors.

Notices and metadata that belong to an item remain in that item's rows. Callers also decide whether later fragments or children exist.

## Validation

Use the [package validation commands](../../../../README.md#validation).
