# pi-nested-instructions

Pi on its own loads instruction files at startup, only from the agent directory, the working directory, and its parents. pi-nested-instructions loads `AGENTS.md` files from subdirectories as the model starts working in them. For example, when the model reads `packages/api/src/server.ts`, the instructions in `packages/api/AGENTS.md` are added before its next request.

Pi's startup loading of global, cwd, and parent instructions, and its reload behaviour, are unchanged. Pi's `--no-context-files` option does not stop nested discovery; to disable it, do not load this extension.

## Usage

Use the native `read`, `ls`, `grep`, `find`, and `bash` tools, or the official FFF search tools, as usual. After each tool batch, pi-nested-instructions adds newly found instructions as notices for the next model request, from the broadest directory to the narrowest. The calls that triggered them aren't interrupted.

The model receives each notice as a user message. The message starts with a note that Pi sent it automatically, not the user, and then gives the file in a `<project_instructions path="…">` tag, as Pi does for startup instructions.

With [pi-tool-display](../pi-tool-display/README.md) loaded, notices show as compact cards you can expand; otherwise Pi shows the full messages.

In each directory below the working directory, discovery uses the first readable instruction file in Pi's order, starting with `AGENTS.override.md`. If the model reads an instruction file itself, no second copy is added. After compaction, branch navigation, or a context edit removes a notice, a later call can load the file again; startup, resume, and `/reload` refresh the files that the model's context still shows.

Discovery reads only tool inputs. It never runs commands, reads tool results, or lists glob matches.

| When you…                                                                   | Read                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Want the full filename order, symlink rules, or reload and compaction rules | [Instruction loading rules](docs/loading.md)                       |
| Want to know which tool inputs and Bash syntax trigger discovery            | [Input discovery](docs/input-discovery.md)                         |
| Understand notices with invalid metadata                                    | [Invalid notice metadata](docs/loading.md#invalid-notice-metadata) |

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
