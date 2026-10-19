# Tree rows

[Shared TUI](../../README.md#usage)

## Behaviour

Grouped rows need branch connectors that survive wrapping and later fragments. [`renderTree`](index.ts) adds connectors to already measured rows.

- `renderTree` omits empty items before assigning branches, aligns continuations, and clips connectors and content to width.
- `followingSibling` continues connectors into later components' fragments.
- `renderTreeContinuation` adds rows beneath a parent without a child branch; `hasChildren` retains vertical connectors.
- Connectors take two columns after indentation.

## Caller responsibilities

- Callers choose item order, grouping, and visibility.
- They normalise and wrap content before creating `TreeItem` rows, reserving `indent + 2` columns for connectors. The [budgeted tree example](../../text-budget/README.md#usage) combines text compaction with connectors.
- Notices and metadata that belong to an item remain in that item's rows.
- Callers also decide whether later fragments or children exist.
