# pi-nested-instructions

Discover nested instruction files when the model accesses their scope. This extends Pi's native startup instructions without replacing its global, cwd, ancestor, or reload behavior.

## Usage

Use native `read`, `ls`, `grep`, `find`, or `bash`, or official FFF search tools normally. After each tool batch, newly discovered instructions appear as notices, broad to narrow, for the next model request. The triggering calls are not interrupted.

Load [pi-tool-display](../pi-tool-display/README.md) for compact, expandable notice cards; otherwise Pi displays full messages. Display consumers can use the `pi-nested-instructions/notices` export.

Discovery stays strictly below the session's working directory. Each addressed directory selects the first readable regular file in Pi's order:

1. `AGENTS.override.md`
2. `AGENTS.md`
3. `AGENTS.MD`
4. `CLAUDE.md`
5. `CLAUDE.MD`

A file access starts at its parent; a directory access includes that directory. Scope follows the requested lexical path, not symlink-target ancestors. Direct external paths are ignored. Exact instruction-file read attempts are recorded as metadata rather than injecting a second copy, even if the tool fails.

For supported tool inputs, Bash inference limits, and direct-read precedence, see [input discovery](docs/design.md#input-discovery). For compaction, branching, and reload behavior, see [session lifetime](docs/design.md#session-lifetime).

## Side effects

Reads filesystem metadata and applicable instruction files; appends metadata entries and visible notices to Pi's session. No source-file writes or network requests. Discovery failures do not fail tool calls.

## Validation

[Workspace checks](../../../docs/development.md#focused-validation) · [Coverage specification](docs/testing.md) · [Pi compatibility](docs/pi-compatibility.md).

If changing notice presentation, check the [pi-tool-display adapter](../pi-tool-display/src/adapters/pi-nested-instructions/README.md#validation).
