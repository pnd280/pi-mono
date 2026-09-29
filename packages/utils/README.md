# @pi-mono/utils

Pure workspace helpers for source, path, patch, and search transformations. Callers supply clocks, state, and policy. The [manifest](package.json) is authoritative for supported imports.

## Usage

Choose the [exported module](package.json) for your task:

- File and display text: [source selections](src/source-selection.ts), [patches](src/patch.ts), [output notices](src/output-text.ts), [UTF-8 windows](src/utf8.ts), [relative ages](src/relative-time.ts).
- Discovery and matching: [FFF provenance](src/fff-tools.ts), [search scopes](src/search-scopes.ts), [lexical paths](src/paths.ts), [text ranking](src/text-search.ts).
- Commands: [POSIX argument quoting](src/shell.ts).

For terminal text sanitization and shortcut normalization, use [terminal text](../libs/src/tui/terminal-text/README.md) and [keybindings](../libs/src/tui/keybindings/README.md).

If integrating a helper, read the [caller boundaries](docs/caller-boundaries.md) for the relevant transformation. For event-loop scheduling, use [cooperative search](../libs/src/text-search/README.md).

### Search scopes

For FFF provenance or static prefix discovery, see [search-scope caller boundaries](docs/caller-boundaries.md#search-scopes).

### Source selections

For line/column coordinates and raw source slicing, see [selection caller boundaries](docs/caller-boundaries.md#source-selections).

## Validation

[Coverage specification](docs/testing.md).

Use the [focused commands](../../docs/development.md#focused-validation) with `@pi-mono/utils`.
