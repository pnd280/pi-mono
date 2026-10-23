# Tree rows

[Shared TUI](../../README.md#usage)

## Behaviour

Grouped rows need branch connectors that survive wrapping and later fragments. [`renderTree`](index.ts) adds connectors to already measured rows.

- `renderTree` omits empty items before assigning branches, aligns continuations, and clips connectors and content to width.
- `followingSibling` continues connectors into later components' fragments.
- `renderTreeContinuation` adds rows beneath a parent without a child branch. Its `hasChildren` option retains vertical connectors.
- Connectors take two columns after indentation.

## Caller responsibilities

- Choose item order, grouping, and visibility.
- Normalise and wrap content before creating `TreeItem` rows.
- Reserve `indent + 2` columns for connectors when you wrap content.
- Keep notices and metadata that belong to an item in that item's rows.
- Decide whether later fragments or children exist.

Related: the [budgeted tree example](../../text-budget/README.md#usage) combines text compaction with connectors.
