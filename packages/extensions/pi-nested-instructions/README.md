# pi-nested-instructions

Discover nested instruction files when the model accesses their scope. This extends Pi's native startup instructions without replacing its global, cwd, ancestor, or reload behavior.

## Usage

Use the supported tools normally. After each tool batch, newly discovered instructions appear as notices, broad to narrow, for the next model request. The triggering calls are not interrupted.

Load [pi-tool-display](../pi-tool-display/README.md) for compact, expandable notice cards; otherwise Pi displays full messages. Display consumers can use the `pi-nested-instructions/notices` export.

Discovery stays strictly below the session's working directory. Each addressed directory selects the first readable regular file in Pi's order:

1. `AGENTS.override.md`
2. `AGENTS.md`
3. `AGENTS.MD`
4. `CLAUDE.md`
5. `CLAUDE.MD`

A file access starts at its parent; a directory access includes that directory. Scope follows the requested lexical path, not symlink-target ancestors. Direct external paths are ignored.

### Direct instruction reads

An attempted content read of an exact instruction-file path records **metadata only**, not a second copy of the file. Failed and blocked attempts count; results are not inspected.

Markers are per file: reading `AGENTS.md` does not suppress a preferred `AGENTS.override.md`. Listing a filename is not a content read. Direct reads in a batch take precedence over automatic discovery.

### Inputs and adapters

Discovery infers scope from native `read`, `ls`, `grep`, `find`, and `bash` inputs and official FFF `fffind`, `ffgrep`, and `fff-multi-grep` (including their native overrides). Search content patterns, exclusions, fuzzy filenames, and cursor-only searches do not provide scope. Only rooted pattern prefixes and finite brace alternatives contribute directories; glob matches are never enumerated. A wildcard never counts as an exact instruction-file read.

Bash inference recognizes literal paths in `cd`, `ls`, `cat`, `head`, `tail`, `sed`, `awk`, `grep`, `rg`, `find`, and `fd`. Unknown options, dynamic shell expressions, scripts, and ambiguous cwd changes are not interpreted; filename-only modes do not count as content reads. It never executes commands. See [scope extraction](src/scopes.ts) and [Bash inference](src/bash.ts) for supported operands and options.

### Session lifetime

If compaction, branch navigation, or context edits remove a notice or its originating read call from model-visible context, a later qualifying call can discover the file again. Metadata-only markers do not add instruction content.

Ordinary accesses retain snapshots. Startup/resume and `/reload` recheck only still-visible scopes and announce changes or removals; compacted-away scopes are not eagerly restored.

## Configuration

No commands, settings, or extension-specific environment variables. Native Pi context-file configuration remains untouched.

## Side effects

Reads filesystem metadata and applicable instruction files; appends metadata entries and visible notices to Pi's session. No source-file writes or network requests. Discovery failures do not fail tool calls.

## Validation

[Coverage specification](docs/testing.md) · [Pi compatibility](docs/pi-compatibility.md) · [Design and sources](docs/design.md).

```sh
vpr 'pi-nested-instructions#check'
vpr 'pi-nested-instructions#test'
```

Notice rendering checks belong to the [pi-tool-display adapter](../pi-tool-display/src/adapters/pi-nested-instructions/README.md#validation).
