# pi-nested-instructions

Pi on its own doesn't find instruction files or skill folders in subdirectories of the working directory. pi-nested-instructions loads `AGENTS.md` files and lists skills from subdirectories as the model starts working in them, and has no settings.

For example, when the model reads `packages/api/src/server.ts`, the instructions in `packages/api/AGENTS.md` are added before its next request, and, in a trusted project, so is a list of the skills in `packages/api/.agents/skills/`.

## Controls

| Control                               | Effect                                                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/skill:<name>`                       | Pi's command and its completion also cover nested skills, from the first prompt.                                                    |
| `/reload`, `/new`, `/resume`, `/fork` | Also search for skill folders in subdirectories again, and refresh the instructions and skill lists still in the session's context. |
| `--no-context-files`                  | Doesn't stop nested instructions. To disable them, don't load this extension.                                                       |
| `--no-skills`                         | Doesn't stop nested skills. To disable them, don't load this extension.                                                             |

## Usage

Use the native `read`, `ls`, `grep`, `find`, and `bash` tools as usual. After each tool batch, pi-nested-instructions adds what it newly found for the next model request, from the broadest directory to the narrowest. The calls that triggered it aren't interrupted.

Discovery reads only tool inputs. It never runs commands, reads tool results, or lists glob matches.

### Instructions

The model receives each instruction file as a notice: a user message that starts with a note that Pi sent it automatically, not the user, and then gives the file in a `<project_instructions path="…">` tag, as Pi does for startup instructions. Pi's own instruction loading is unchanged. The [instruction loading rules](docs/loading.md) say which file loads and when it loads again.

### Skills

A nested skill is a skill in `.agents/skills/` or `.pi/skills/` of a directory below the working directory. In a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust), the startup search registers nested skills with Pi, and when the model starts working in a directory, it receives that directory's skills as a skill listing instead of in the system prompt. The [nested skill rules](docs/skills.md) say which folders are found, which skill wins a name, and when a listing is added.

With nested skills registered, [pi-skills](../pi-skills/README.md) also turns a `/skill:<name>` reference anywhere in a prompt into a link to a nested skill's file, and completes nested skill names. [pi-t3-skills](../pi-t3-skills/README.md) also turns T3 Code's `$<name>` chip for a nested skill into such a link.

### Display

With [pi-tool-display](../pi-tool-display/README.md) loaded, notices and skill listings show as compact cards you can expand. Otherwise, Pi's default renderer shows the full message text as Markdown, and this package does not remove terminal control characters from the instruction files and skill descriptions in it.

## Side effects

- pi-nested-instructions reads filesystem metadata, the instruction files that apply, and the skill files of nested skill folders.
- At startup and on `/reload`, `/new`, `/resume`, and `/fork` in a trusted project, it searches the directories below the working directory and reads their ignore files. Pi waits for the search before the first prompt.
- It appends metadata entries, visible notices, and visible skill listings to Pi's session.
- Pi reports its usual collision warning when a nested skill has the name of another skill.
- It never writes source files or makes network requests. Discovery failures never fail a tool call.

## Docs

| When you…                                                                              | Read                                                                                                                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Want the full filename order, symlink rules, or reload and compaction rules            | [Instruction loading rules](docs/loading.md)                                                                                               |
| Want to know which skill folders are found, which skill wins a name, or what is listed | [Nested skill rules](docs/skills.md)                                                                                                       |
| Want to know which tool inputs and Bash syntax trigger discovery                       | [Input discovery](docs/input-discovery.md)                                                                                                 |
| Understand notices or listings with invalid metadata                                   | [Invalid notice metadata](docs/loading.md#invalid-notice-metadata) and [invalid listing metadata](docs/skills.md#invalid-listing-metadata) |
| Look up a term, such as scope, read marker, notice, or skill listing                   | [Glossary](GLOSSARY.md)                                                                                                                    |
| Decode notices or listings in a display extension                                      | [Persisted contracts](docs/pi-compatibility.md#persisted-contracts)                                                                        |
| Change adapter policy, selection, the skill search, or refresh                         | [Test coverage](docs/testing.md) and [Pi compatibility](docs/pi-compatibility.md)                                                          |
| Change notice or listing presentation                                                  | [pi-tool-display adapter checks](../pi-tool-display/src/adapters/pi-nested-instructions/README.md#validation)                              |
