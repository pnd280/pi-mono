# [pi-fff-guard](../README.md) search scopes

## Paths and filters

- Concrete positive `path` values and multi-grep constraints are checked for missing or Git-ignored files/directories, including broken links. Relative paths resolve against the session's working directory; `~/` expands to the home directory. Bare filename filters do not require a file in the current directory. In `path` and `exclude` fields, FFF removes `./` and workspace-local absolute prefixes before parsing; aliases of bare filenames remain recursive filters.
- Filename queries check existing explicit paths and rooted globs such as `node_modules/**`. Missing-path validation for filename queries requires an anchor (`/`, `./`, `../`, `~/`), a trailing `/`, or a rooted glob.
- Positive `path` values are trimmed but are not split; existing explicit filename-query paths remain intact. Other filename queries and multi-grep constraints use whitespace-separated tokens; shell quoting is not parsed.

## Globs and exclusions

- Existing explicit literal paths take precedence over glob syntax. Bare filename filters stay recursive even when a matching local file exists. Otherwise, globs validate only the fixed directory prefix before the first wildcard, without requiring matching files. For finite brace alternatives, a missing-path error requires every branch to have a missing concrete root.
- Positive scopes intersect; each rooted glob remains effective when another scope narrows the same directory or a descendant. Constraint order does not change exclusion handling.
- Missing exclusions are not errors. Fully excluded ignored targets pass through; partially excluded ignored directories still block.
- FFF's `exclude` field splits comma/space-separated entries, including array entries; multi-grep brace alternatives are not comma-split.

## Limits

Repository-root `.` searches, bare fuzzy queries, generic filters such as `*.ts`, cursor-only calls, and globs without a fixed root such as `**/node_modules/**` remain unchanged. Content patterns are never treated as paths.

## Git ignore rules

Uses Git's effective ignore rules and tracked-file exceptions, including repository-local and global exclusions. Supports worktrees and external repositories. For paths inside the workspace, uses the workspace repository's ignore rules even when the path belongs to a nested repository. Non-ignored links are also checked in their destination repositories.
