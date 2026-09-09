# pi-fff-guard

Temporary workaround for [FFF #714](https://github.com/dmtrKovalenko/fff/issues/714): FFF's workspace index omits Git-ignored files, so searches explicitly targeting them can misleadingly report no matches.

For example, an ignored-path `fffind` call returns:

```text
fffind does not work with Git-ignored paths. Retry with rg or another available tool.
```

Missing explicit paths return `No such file or directory` before ignore checks.

## Usage

Requires Node.js 24+ and Git. Validated with Pi 0.85.1 and `@ff-labs/pi-fff` 0.10.6.

## Detection

- Intercepts `fffind`, `ffgrep`, and enabled `fff-multi-grep`, plus FFF-owned `find`, `grep`, and `multi_grep` overrides. Pi must attribute the tool to the official npm package or a package-root or `src/` index entry under `@ff-labs/pi-fff/`; built-ins, unrelated tools, and unrecognized forks pass through.
- Checks concrete positive `path` values and multi-grep constraints for missing or Git-ignored files/directories, including broken links. Relative paths resolve against `ctx.cwd`; `~/` expands to the home directory. Bare filename filters such as `main.ts` do not require a file in the current directory; use `./main.ts` for an explicit file.
- Filename queries check existing explicit paths and rooted globs such as `node_modules/**`. Missing-path validation requires an anchor (`/`, `./`, `../`, `~/`), a trailing `/`, or a rooted glob.
- Existing literal paths take precedence over glob syntax. Otherwise, globs validate only the fixed directory prefix before the first wildcard, without requiring matching files. For finite brace alternatives, a missing-path error requires every branch to have a missing concrete root. Missing exclusions are not errors.
- Fully excluded ignored targets pass through; partially excluded ignored directories still block. Positive `path` values are trimmed but are not split; existing explicit filename-query paths remain intact. Other filename queries and multi-grep constraints use whitespace-separated tokens. FFF's `exclude` field splits comma/space-separated entries, including array entries; multi-grep brace alternatives are not comma-split.
- Uses Git's effective ignore rules, including nested rules, negations, tracked-file exceptions, `.git/info/exclude`, and global exclusions. Supports worktrees and external repositories. For paths inside the workspace, uses the workspace repository's ignore rules even when the path belongs to a nested repository. Non-ignored links are also checked in their destination repositories.

Repository-root `.` searches, bare fuzzy queries, generic filters such as `*.ts`, cursor-only calls, and globs without a fixed root such as `**/node_modules/**` remain unchanged. Content patterns are never treated as paths. The extension does not parse shell quoting in multi-grep constraints or decode cursors.

Checks have a two-second deadline and bounded scope/link traversal. Timeouts, Git errors, and link cycles allow the FFF call with a diagnostic (UI notification or stderr); cancellation blocks the call.

Wrappers must dispatch child tool calls through Pi's hooks; direct `execute()` calls bypass detection. Slash commands and `@` autocomplete are not intercepted.

## Configuration and side effects

No configuration, persistent state, network requests, or project-file writes. Subprocesses only inspect Git state.

Tool arguments, registrations, and the active tool list remain unchanged. The extension does not run a replacement search or terminate the turn.

## Validation and retirement

Use the [focused validation commands](../../../docs/development.md#focused-validation) with package name `pi-fff-guard`.

Once a released FFF version implements #714, disable this extension and verify ignored-file, ignored-directory, and linked-dependency searches for every tool in use. If they pass, check that FFF also reports missing explicit paths before retiring this extension, or retain path validation separately. The extension does not check the FFF version at runtime.
