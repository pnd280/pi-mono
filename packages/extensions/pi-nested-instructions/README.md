# pi-nested-instructions

Pi on its own loads instruction files only from the working directory and its parents, at startup. pi-nested-instructions loads `AGENTS.md` files from subdirectories as the model starts working in them. For example, when the model reads `packages/api/src/server.ts`, the instructions in `packages/api/AGENTS.md` are added before its next request.

Pi's startup loading of global, cwd, and parent instructions, and its reload behaviour, are unchanged. Pi's `--no-context-files` option does not stop nested discovery; to disable it, do not load this extension.

## Usage

Use the native `read`, `ls`, `grep`, `find`, and `bash` tools, or the official FFF search tools, as usual. After each tool batch, newly found instructions are added as notices for the next model request, from the broadest directory to the narrowest. The calls that triggered them aren't interrupted.

With [pi-tool-display](../pi-tool-display/README.md) loaded, notices show as compact cards you can expand; otherwise Pi shows the full messages.

### Which files load

Only directories below the session's working directory are searched. In each directory, the first readable regular file in Pi's order is used:

1. `AGENTS.override.md`
2. `AGENTS.md`
3. `AGENTS.MD`
4. `CLAUDE.md`
5. `CLAUDE.MD`

- Accessing a file searches from its parent directory upward. Accessing a directory includes that directory.
- Scope follows the path as written, not the ancestors of a symlink's target.
- Paths outside the working directory are ignored.
- Git-ignored directories, such as `node_modules`, are searched like any other directory, so reading a dependency's files can load its instructions.
- If the model reads an instruction file directly, no second copy is added, even if the read fails.
- Calls made by other tools, such as codemode scripts, still trigger discovery, and their instructions are always delivered, because the parent tool may hide what they read.

For the tool inputs that are recognised and the limits of Bash inference, see [input discovery](docs/design.md#input-discovery). For compaction, branching, and reload, see [session lifetime](docs/design.md#session-lifetime).

Notices use persisted format version 2. Older notices keep their original text but no longer suppress rediscovery or provide structured display and summary counts. See the [persisted notice contract](docs/pi-compatibility.md#persisted-notice-contract) before resuming older sessions.

## Side effects

- Reads filesystem metadata and the instruction files that apply.
- Appends metadata entries and visible notices to Pi's session.
- Never writes source files or makes network requests. Discovery failures never fail a tool call.

## For tool authors

Display extensions can decode notices with the `pi-nested-instructions/notices` export. Terms are defined in the [glossary](GLOSSARY.md).

## Validation

| When you…                                    | Read                                                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Change any behaviour                         | [workspace checks](../../../docs/development.md#focused-validation)                                                    |
| Change adapter policy, selection, or refresh | [coverage specification](docs/testing.md) and [Pi compatibility](docs/pi-compatibility.md)                             |
| Change notice presentation                   | Also check the [pi-tool-display adapter](../pi-tool-display/src/adapters/pi-nested-instructions/README.md#validation). |
