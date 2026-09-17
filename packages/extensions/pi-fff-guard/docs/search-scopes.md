# FFF search scopes

[pi-fff-guard](../README.md)

## Paths and filters

The guard checks explicit `path` values and multi-grep constraints for missing or Git-ignored files and directories, including broken links. Exclusions follow [separate rules](#globs-and-exclusions). Relative paths resolve against the session's working directory; `~/` expands to the home directory.

Bare filename filters do not require a file in the current directory. In `path` and `exclude`, FFF removes `./` and workspace-local absolute prefixes before parsing. For example, `main.ts` and `./main.ts` remain recursive filters, while `src/main.ts` is an explicit target.

In `fffind`'s `pattern`, the guard checks existing explicit paths and rooted globs such as `node_modules/**`. A rooted glob has a fixed directory prefix. Missing-path checks require an anchor (`/`, `./`, `../`, `~/`), a trailing `/`, or a rooted glob.

The guard trims `path` values without splitting them. Existing explicit paths in `fffind`'s `pattern` remain intact. Other filename queries and multi-grep constraints use whitespace-separated tokens; shell quoting is not parsed.

## Globs and exclusions

- Existing explicit literal paths take precedence over glob syntax; bare filename filters remain recursive.
- For globs, the guard validates only the fixed directory prefix before the first wildcard, without requiring matching files. For finite brace alternatives, a missing-path error requires every branch to have a missing concrete root.
- Positive scopes intersect. Each rooted glob still applies when another scope narrows the search to the same directory or a descendant. Constraint order does not change exclusion handling.
- Missing exclusions are not errors. Fully excluded ignored targets pass through; partially excluded ignored directories still block.
- FFF's `exclude` field splits entries on commas and whitespace, including array entries. Multi-grep brace alternatives are not split on commas.

## Unchanged searches

Repository-root `.` searches, bare fuzzy queries, generic filters such as `*.ts`, cursor-only calls, and globs without a fixed root such as `**/node_modules/**` remain unchanged. Content patterns are never treated as paths.

## Git ignore rules

The guard uses Git's effective ignore rules and tracked-file exceptions, including repository-local and global exclusions. It supports worktrees and external repositories.

Paths inside the workspace use the workspace repository's ignore rules, even within a nested repository. External paths use their own repositories' rules. The guard also checks non-ignored links at their destinations, using the rules for the destination's location.
