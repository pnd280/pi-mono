# FFF search scopes

[pi-fff-guard](../README.md)

How the guard decides which paths a search targets. The pure prefix and normalisation helpers are shared with [nested instructions](../../pi-nested-instructions/README.md) through [utils](../../../utils/README.md#search-scopes). The guard retains its own missing-path, intersection, exclusion, and Git policies.

## Paths and filters

The guard checks explicit `path` values and multi-grep constraints for missing or ignored targets, including broken links. Exclusions are handled differently; see [globs and exclusions](#globs-and-exclusions). Relative paths resolve from the session cwd, and `~/` expands to the home directory.

In `path` and `exclude`, FFF strips `./` and absolute prefixes inside the workspace. Absolute paths with Windows `\` separators are read with `/` separators, as FFF does; relative paths are not converted:

| Value                      | Treated as                                                              |
| -------------------------- | ----------------------------------------------------------------------- |
| `main.ts`, `./main.ts`     | Recursive filename filter; no local file needs to exist.                |
| `src/main.ts`              | Explicit path.                                                          |
| `src/utils` (no extension) | Directory constraint; a regular file with that name doesn't satisfy it. |

For `fffind.pattern`, the guard checks existing explicit paths and globs with fixed directory prefixes, such as `node_modules/**`.

For `fffind.pattern`, missing-path checks need an anchor (`/`, `./`, `../`, or `~/`), a trailing `/`, or a rooted glob. Explicit `path` values and multi-grep path constraints are checked without an anchor.

The guard trims `path` without splitting it and preserves existing explicit `fffind.pattern` paths. Other filename queries and multi-grep constraints split on whitespace without shell-quote parsing.

## Globs and exclusions

- FFF glob syntax takes precedence even when the same literal path exists; bare filename filters remain recursive.
- For globs, the guard validates only the fixed directory prefix before the first wildcard. It does not require matching files.
- For finite brace alternatives, it reports a missing-path error only if every branch has a missing concrete root.
- A missing explicit target still blocks when exclusions remove the entire search.
- Positive scopes intersect. Each rooted glob still applies when another scope narrows the search to the same directory or a descendant. Constraint order does not change exclusion handling.
- Missing exclusions are not errors.
- Fully excluded ignored targets pass through.
- Partially excluded ignored directories still block.
- FFF's `exclude` field splits entries on commas and whitespace, including array entries. Multi-grep brace alternatives are not split on commas.

## Unchanged searches

Repository-root `.` searches, bare fuzzy queries, generic filters such as `*.ts`, cursor-only calls, and globs without a fixed root such as `**/node_modules/**` remain unchanged. Content patterns are never treated as paths.

## Git ignore rules

The guard uses effective Git ignore rules, local and global exclusions, and tracked-file exceptions, supporting worktrees and external repositories. Workspace paths use workspace rules even inside nested repositories; external paths use their own repositories. Non-ignored symlinks are also checked under their destinations' rules.

Inspection runs `git` from `PATH` and never enumerates directories. Before it compares a path with a repository root, the guard resolves aliases that are not symbolic links, such as Windows short names or letter case, because Git reports canonical roots. A symbolic link keeps its own name, and only its parent directory is resolved. If the repository found from that directory still does not contain the path, inspection fails instead of reporting the path as not ignored. A target that no longer exists is reported as missing, even when an existing parent is ignored. Symbolic-link cycles and very long link chains count as failed inspections. The [two-second deadline](../README.md#limits) also covers repository discovery and link traversal.

### Inspection contract

This contract is for maintainers. [`inspectGitIgnore`](../src/git-ignore.ts) takes absolute `path` and `cwd` values and the caller's signal, which carries the deadline. Relative paths throw `TypeError`. The result status is `ignored`, `not-ignored`, `missing`, `cancelled` (the signal aborted), or `unavailable`.

The function makes no allow or block decision; the [search policy](../src/evaluate-search.ts) does. Never display an `unavailable` result's internal `cause`.
