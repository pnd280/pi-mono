# FFF search scopes

[pi-fff-guard](../README.md)

The guard reads the path, exclusion, and pattern fields of each FFF call to find the paths that the search targets.

## Paths and filters

The guard checks explicit `path` values and multi-grep constraints for missing or ignored targets, including broken links. The guard handles exclusions differently; see [globs and exclusions](#globs-and-exclusions). Relative paths resolve from the session cwd, and `~/` expands to the home directory.

In `path` and `exclude`, FFF strips `./` and absolute prefixes inside the workspace. Like FFF, the guard reads Windows `\` separators in absolute paths as `/` separators, and doesn't convert relative paths:

| Value                      | Treated as                                                              |
| -------------------------- | ----------------------------------------------------------------------- |
| `main.ts`, `./main.ts`     | Recursive filename filter; no local file needs to exist.                |
| `src/main.ts`              | Explicit path.                                                          |
| `src/utils` (no extension) | Directory constraint; a regular file with that name doesn't satisfy it. |

For `fffind.pattern`, the guard checks existing explicit paths and globs with fixed directory prefixes, such as `node_modules/**`. Missing-path checks need an anchor (`/`, `./`, `../`, or `~/`), a trailing `/`, or a rooted glob. Explicit `path` values and multi-grep path constraints are checked without an anchor. A multi-grep constraint without `/`, such as `vendor`, does not limit FFF 0.11.0 results to a directory, so the guard allows it.

The guard trims `path` without splitting it and preserves existing explicit `fffind.pattern` paths. Other filename queries and multi-grep constraints split on whitespace without shell-quote parsing.

## Globs and exclusions

- FFF glob syntax takes precedence even when the same literal path exists; bare filename filters remain recursive.
- Like FFF, the guard matches a glob that contains `/` but not `**` against the whole path, and its `*`, `?`, and bracket expressions also match `/`. For example, `node_modules/*.ts` includes `node_modules/dependency/file.ts`, and the exclusion `node_modules/*` removes every file below `node_modules/`.
- In a glob with `**`, the other wildcards match within one path component, as in FFF.
- For globs, the guard validates only the fixed directory prefix before the first wildcard. It does not require matching files.
- For finite brace alternatives, it reports a missing-path error only if every branch has a missing directory. That directory is the fixed prefix of a branch with a wildcard, or the parent of a branch without one. For example, `src/{missing,absent}/**` is missing, but `src/{missing,absent}.ts` is not when `src/` exists.
- A missing explicit target still blocks when exclusions remove the entire search.
- Positive scopes intersect. Each rooted glob still applies when another scope narrows the search to the same directory or a descendant. Constraint order does not change exclusion handling.
- Missing exclusions are not errors.
- Fully excluded ignored targets pass through.
- Partially excluded ignored directories still block.
- FFF's `exclude` field splits entries on commas and whitespace, including array entries. Multi-grep brace alternatives are not split on commas.

## Unchanged searches

Repository-root `.` searches, bare fuzzy queries, generic filters such as `*.ts`, cursor-only calls, and globs without a fixed root such as `**/node_modules/**` remain unchanged. The guard never treats content patterns as paths.

## Git ignore rules

The guard uses effective Git ignore rules, local and global exclusions, and tracked-file exceptions, and supports worktrees and external repositories. Workspace paths use workspace rules even inside nested repositories; external paths use their own repositories.

With its default `followSymlinks: true` setting, FFF indexes the files below a directory link under the link's own name. A link that Git does not ignore therefore stays searchable even when Git ignores its destination or one of the destination's parents. Below the link, FFF also applies the ignore files inside the destination. These limits apply:

- When Git does not ignore the destination, the guard checks paths below the link with Git's rules for the destination path. A rule from outside the destination can then block a path that FFF indexes.
- When Git ignores the destination, Git cannot report the rules inside it. The guard then does not block paths below the link.
- The guard does not read FFF's `followSymlinks` setting. If you disable it with `--fff-follow-symlinks=false`, `FFF_FOLLOW_SYMLINKS=0`, or `"followSymlinks": false` in `pi-fff.json`, FFF leaves out the files below directory links, but the guard still allows searches below a link that Git does not ignore. Those searches silently return nothing, or only matches from other files.

A link to a file is checked under its destination's rules.

Inspection runs `git` from `PATH` and never enumerates directories. Before it compares a path with a repository root, the guard resolves aliases that are not symbolic links, such as Windows short names or letter case, because Git reports canonical roots. A symbolic link keeps its own name, and only its parent directory is resolved. If the repository found from that directory still does not contain the path, inspection fails instead of reporting the path as not ignored. A target that no longer exists is reported as missing, even when an existing parent is ignored. Symbolic-link cycles, link chains of 32 or more links, and paths with more than 128 components count as failed inspections. The [two-second deadline](../README.md#limits) also covers repository discovery and link traversal.
