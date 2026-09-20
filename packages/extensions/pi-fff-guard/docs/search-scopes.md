# FFF search scopes

[pi-fff-guard](../README.md)

## Paths and filters

The guard checks explicit `path` values and multi-grep constraints for missing or ignored targets, including broken links. [Exclusions differ](#globs-and-exclusions). Relative paths use session cwd; `~/` expands home.

In `path` and `exclude`, FFF strips `./` and workspace-local absolute prefixes. Thus `main.ts` and `./main.ts` are recursive filters requiring no local file; `src/main.ts` is explicit.

For `fffind.pattern`, the guard checks existing explicit paths and globs with fixed directory prefixes, such as `node_modules/**`. Missing-path checks require an anchor (`/`, `./`, `../`, `~/`), trailing `/`, or rooted glob.

The guard trims `path` without splitting it and preserves existing explicit `fffind.pattern` paths. Other filename queries and multi-grep constraints split on whitespace without shell-quote parsing.

## Globs and exclusions

- Existing explicit literal paths take precedence over glob syntax; bare filename filters remain recursive.
- For globs, the guard validates only the fixed directory prefix before the first wildcard. It does not require matching files. For finite brace alternatives, it reports a missing-path error only if every branch has a missing concrete root.
- Positive scopes intersect. Each rooted glob still applies when another scope narrows the search to the same directory or a descendant. Constraint order does not change exclusion handling.
- Missing exclusions are not errors. Fully excluded ignored targets pass through; partially excluded ignored directories still block.
- FFF's `exclude` field splits entries on commas and whitespace, including array entries. Multi-grep brace alternatives are not split on commas.

## Unchanged searches

Repository-root `.` searches, bare fuzzy queries, generic filters such as `*.ts`, cursor-only calls, and globs without a fixed root such as `**/node_modules/**` remain unchanged. Content patterns are never treated as paths.

## Git ignore rules

The guard uses effective Git ignore rules, local/global exclusions, and tracked-file exceptions, supporting worktrees and external repositories. Workspace paths use workspace rules even inside nested repositories; external paths use their own repositories. Non-ignored symlinks are also checked under their destinations' rules.
