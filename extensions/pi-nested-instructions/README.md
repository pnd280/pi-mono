# pi-nested-instructions

Pi on its own loads instruction files at startup, only from the agent directory, the working directory, and its parents. pi-nested-instructions loads `AGENTS.md` files from subdirectories as the model starts working in them. For example, when the model reads `packages/api/src/server.ts`, the instructions in `packages/api/AGENTS.md` are added before its next request.

Pi's startup loading of global, cwd, and parent instructions, and its reload behaviour, are unchanged. Pi's `--no-context-files` option does not stop nested discovery; to disable it, do not load this extension.

## Usage

Use the native `read`, `ls`, `grep`, `find`, and `bash` tools, or the official FFF search tools, as usual. After each tool batch, pi-nested-instructions adds newly found instructions as notices for the next model request, from the broadest directory to the narrowest. The calls that triggered them aren't interrupted.

The model receives each notice as a user message. The message starts with a note that Pi sent it automatically, not the user, and then gives the file in a `<project_instructions path="…">` tag, as Pi does for startup instructions.

With [pi-tool-display](../pi-tool-display/README.md) loaded, notices show as compact cards you can expand; otherwise Pi shows the full messages.

Notices use persisted format version 3. Older notices keep their original text but no longer suppress rediscovery or provide structured display and summary counts. Resume and reload do not restore their scopes, so a later tool input can load the same instructions again while the old text is still in context. The [persisted notice contract](docs/pi-compatibility.md#persisted-notice-contract) lists the format changes.

### Which files load

Discovery searches paths written below the session's working directory. In each directory, the first readable regular file in Pi's order is used:

1. `AGENTS.override.md`
2. `AGENTS.md`
3. `AGENTS.MD`
4. `CLAUDE.md`
5. `CLAUDE.MD`

- Accessing a file searches from its parent directory upward. Accessing a directory includes that directory.
- Scope follows the path as written. Ancestors of a symlink's target are not searched.
- Discovery ignores paths outside the working directory before it resolves symlinks.
- Discovery follows directory and instruction-file symlinks. Their targets can be outside the working directory.
- Git-ignored directories, such as `node_modules`, are searched like any other directory, so reading a dependency's files can load its instructions.
- If the model reads an instruction file directly, no second copy is added, even if the read fails. This applies only to that file: reading `AGENTS.md` does not stop a preferred `AGENTS.override.md` in the same directory from loading.
- Calls made by other tools, such as codemode scripts, still trigger discovery. Their reads of an instruction file don't count as direct reads, because the parent tool may hide what they read.

Discovery reads only tool inputs. It never runs commands, reads tool results, or lists glob matches. For the tool inputs that are recognised and the Bash syntax that stops inference, see [input discovery](docs/input-discovery.md).

### Compaction, branching, and reload

- If compaction, branch navigation, or a context edit removes a notice or the read call that loaded it from the model's context, a later qualifying call can load the file again.
- During normal turns, a loaded file keeps the content that its notice delivered.
- On startup, resume, and `/reload`, discovery refreshes only the scopes that the model's context still shows. It does not restore scopes that compaction removed.
- A refresh can add an updated notice for a changed file or a changed preferred candidate, and a removal notice for a file that is gone.
- If the model read a missing or unreadable instruction file and a file appears there later, the next refresh loads it. If no file appears, refresh adds no removal notice.

## Side effects

- Reads filesystem metadata and the instruction files that apply.
- Appends metadata entries and visible notices to Pi's session.
- Never writes source files or makes network requests. Discovery failures never fail a tool call.

## For tool authors

Display extensions can decode notices with the `pi-nested-instructions/notices` export. Terms are defined in the [glossary](GLOSSARY.md).

## Validation

| When you…                                    | Read                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Change adapter policy, selection, or refresh | [coverage specification](docs/testing.md) and [Pi compatibility](docs/pi-compatibility.md)                         |
| Change notice presentation                   | The [pi-tool-display adapter checks](../pi-tool-display/src/adapters/pi-nested-instructions/README.md#validation). |
