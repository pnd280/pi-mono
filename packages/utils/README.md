# @pi-mono/utils

Extensions in this workspace share pure functions for transforming source text, paths, and patches. For example, `parsePatch` validates a unified patch and returns its hunks, with no file access.

The helpers hold no state: callers supply inputs and policy. The [manifest](package.json) lists the supported imports.

## Usage

Choose the [exported module](package.json) for your task:

- File and display text: [source selections](src/source-selection.ts), [patches](src/patch.ts), [output notices](src/output-text.ts), [UTF-8 windows](src/utf8.ts).
- Discovery: [FFF provenance](src/fff-tools.ts), [search scopes](src/search-scopes.ts), [lexical paths](src/paths.ts).
- Commands: [POSIX argument quoting](src/shell.ts).

For terminal text sanitisation and shortcut normalisation, use [terminal text](../libs/src/tui/terminal-text/README.md) and [keybindings](../libs/src/tui/keybindings/README.md).

Before using a helper, read its [caller boundaries](docs/caller-boundaries.md). For text ranking and cancellable event-loop scheduling, use [cooperative search](../libs/src/text-search/README.md).

### Search scopes

For FFF provenance or static prefix discovery, see [search-scope caller boundaries](docs/caller-boundaries.md#search-scopes).

### Source selections

For line and column coordinates and raw source slicing, see [selection caller boundaries](docs/caller-boundaries.md#source-selections).

## Validation

The [coverage specification](docs/testing.md) lists what is tested here.

Use the [focused commands](../../docs/development.md#focused-validation) with `@pi-mono/utils`.
