# Instruction loading rules

[Package](../README.md) · [Input discovery](input-discovery.md)

pi-nested-instructions decides which instruction files to load, and when to load them again, from the paths that tool inputs address. The [input discovery guide](input-discovery.md) lists the tool inputs that give paths.

## Which files load

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

## Compaction, branching, and reload

- If compaction, branch navigation, or a context edit removes a notice or the read call that loaded it from the model's context, a later qualifying call can load the file again.
- During normal turns, a loaded file keeps the content that its notice delivered.
- On startup, resume, and `/reload`, discovery refreshes only the scopes that the model's context still shows. It does not restore scopes that compaction removed.
- A refresh can add an updated notice for a changed file or a changed preferred candidate, and a removal notice for a file that is gone.
- If the model read a missing or unreadable instruction file and a file appears there later, the next refresh loads it. If no file appears, refresh adds no removal notice.

## Invalid notice metadata

Notices use persisted format version 3. Notices with invalid metadata keep their original text but do not suppress rediscovery or provide structured display and summary counts. Resume and reload do not restore their scopes, so a later tool input can load the same instructions again while the invalid notice text is still in context. The [persisted notice contract](pi-compatibility.md#persisted-notice-contract) defines validation.
