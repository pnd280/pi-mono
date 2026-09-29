# pi-nested-instructions

Discover nested instruction files when the model accesses their scope. This extends Pi's native startup instructions without replacing its global, cwd, ancestor, or reload behavior.

## Usage

Use the supported tools normally. After each tool batch, the extension adds visible notices for newly discovered instructions, in broad-to-narrow directory order. Their complete text is available to the next model request. The triggering commands are never interrupted or retried.

This extension registers no custom renderer. Load [pi-tool-display](../pi-tool-display/README.md) for compact, expandable notice cards; otherwise Pi renders the full messages with its default display. The `pi-nested-instructions/notices` export owns the notice identifier, schema, creation, and decoding for display consumers.

Discovery stays strictly below the session's `ctx.cwd`. Each addressed directory selects the first readable regular file in Pi's order:

1. `AGENTS.override.md`
2. `AGENTS.md`
3. `AGENTS.MD`
4. `CLAUDE.md`
5. `CLAUDE.MD`

A file access starts at its parent; a directory access includes that directory. The requested lexical path determines the ancestor chain. Instruction-file symlinks are followed, but their destinations' separate ancestors are not searched. Direct external paths are ignored.

### Direct instruction reads

When recognized inputs indicate a content-read attempt on an exact instruction-file path, the extension records **metadata only**: the path, originating call, and filesystem revision. It does not reread the file or inject a second copy. This applies across native tools, Bash inference, and supported adapters. Partial, failed, and blocked attempts count; results are never inspected.

Markers are per file, not per directory. Reading `AGENTS.md` does not suppress a preferred `AGENTS.override.md`. Listing an instruction filename does not mark its contents loaded. Direct reads anywhere in a batch are recorded before automatic discovery, so sibling calls cannot cause duplicate injection.

### Inputs and adapters

| Tool                                                  | Scope inputs                                              |
| ----------------------------------------------------- | --------------------------------------------------------- |
| Native `read`, including `pi-selective-read`          | `path`; selection and read limits do not affect marking   |
| Native `ls`                                           | `path`, without content-read markers                      |
| Native `grep`                                         | `path` and rooted `glob`, never the content pattern       |
| Native `find`                                         | `path` and rooted `pattern`, without content-read markers |
| Official FFF `fffind` / override `find`               | `path` and explicit path constraints in `pattern`         |
| Official FFF `ffgrep` / override `grep`               | `path`, never the content pattern                         |
| Official FFF `fff-multi-grep` / override `multi_grep` | `constraints`, never content `patterns`                   |
| Native `bash`                                         | Best-effort parsing described below                       |

FFF ownership uses the shared package-provenance adapter, including registrations made after startup. Bare FFF filenames remain recursive filters, even with `./` or cwd-absolute prefixes. Bare fuzzy queries, content patterns, and exclusions add no scope. Cursor-only searches cannot reveal the prior scope.

Patterns imply only fixed directory prefixes and finite brace alternatives. For example, `packages/web/**/*.ts` discovers through `packages/web`, `{src,lib}/**` discovers both chains, and `**/*.ts` adds no scope. No glob matches or directory descendants are enumerated. A remaining wildcard does not identify an exact instruction-file read.

Bash supports literal paths in `cd`, `ls`, `cat`, `head`, `tail`, `sed`, `awk`, `grep`, `rg`, `find`, and `fd`, with common options, `head`/`tail` `-NUM` counts, quoting, stdin redirection, and simple chains. Output destinations, other input descriptors such as `3<file`, and descriptor duplication such as `2>&1` are ignored. Content patterns and inline sed/awk programs are not paths. Filename-only modes do not mark instructions read. Unknown options discard that command; variables, substitutions, here-documents, and compound shell programs are not interpreted. Ambiguous cwd changes stop inference. Scripts and unrecognized tools are outside this adapter's scope. Inference never executes commands.

### Session lifetime

Loaded notices and originating read calls are checked against Pi's canonical session projection, not raw history. Compaction, branch navigation, or persistent context edits that remove them permit discovery on a later qualifying call. Metadata-only markers never add instruction content to model context.

Ordinary accesses retain snapshots. Startup/resume and `/reload` recheck only still-visible scopes and announce changes or removals; unchanged instructions are not repeated. Direct-read markers use filesystem revisions so unchanged files need no content read. Changed files can be loaded on reload. Compacted-away scopes are not eagerly restored.

## Configuration

No commands, settings, or environment variables. Native Pi context-file configuration remains untouched; this extension's nested discovery is independently enabled by loading the extension.

## Side effects

Reads filesystem metadata and applicable instruction files; appends namespaced metadata entries and visible instruction notices to Pi's session. Does not edit source files, alter tool arguments/results, invoke inference commands, or make network requests. Discovery failures do not fail tool calls.

## Validation

[Coverage specification](docs/testing.md) · [Pi compatibility](docs/pi-compatibility.md) · [Design and sources](docs/design.md).

```sh
vpr 'pi-nested-instructions#check'
vpr 'pi-nested-instructions#test'
```

Tests use temporary files, real session projections, and an offline Pi host. Notice rendering and interaction checks belong to the [pi-tool-display adapter](../pi-tool-display/src/adapters/pi-nested-instructions/README.md#validation).
