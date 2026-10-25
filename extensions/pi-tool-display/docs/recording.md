# Recorded data and replay

[pi-tool-display](../README.md) · [Glossary](../GLOSSARY.md)

pi-tool-display saves a few facts about tool calls in Pi's session history, so that a reopened session shows the same cards. It writes no files of its own, keeps no durable output archive, and makes no network requests. The README summarises [what is recorded](../README.md#what-is-recorded).

## Observation

In TUI, RPC, print, and JSON sessions, the extension observes verified Pi-native `bash`, `powershell`, `edit`, and `write` calls. It collects shell previews, outcomes, and file contents from before each write. Display failures never change a tool's outcome.

- Native observation excludes SDK tool overrides, custom tools, and manual `!` and `!!` commands. Verified extension adapters can still contribute call provenance and summaries.
- Native `edit` and `write` observations share source capture and patches with `pi-agent-summary`, so files are not read twice. Maintainers can find the shared capture in [file observations](../../../libs/src/file-mutations/README.md).
- Another process writing the same file can race with the observation.
- Live shell previews stay in memory only.

## Session history

Session history stores only facts that Pi's own entries lack. The extension keeps them in `pi-tool-display.call` custom entries, outside the model's context. The full set is:

- that native observation saw an operation;
- cancellation;
- a shell exit code or timeout when the call did not succeed;
- a change applied although Pi reported failure;
- an operation failure that Pi's result or call cancellation cannot preserve;
- bounded patches.

> Patches can keep deleted text. Removed and context lines from overwritten files may remain in session history.

When collection stops before Pi saves a call's result, such as at shutdown, the extension saves the observed outcome and exit code, because replay cannot rely on that result.

Each call saves at most one `pi-tool-display.call` custom entry, and every call with an observed operation saves one. When an entry cannot be saved, because it exceeds the size limit or the session write fails, the extension warns once for each problem, and the live card keeps its facts.

The extension saves patches only when replay needs them:

- `write` saves its patch only when replay cannot derive the same patch from the written content.
- `edit` diffs come from Pi's result. The extension saves its own diff when the edit did not succeed, ended without a result, or Pi's patch is missing, invalid, or has different hunks.

## Record size limits

A call entry is limited to 160 KiB, and the size includes unknown fields. The extension does not save a larger entry, and replay does not apply one.

Other display budgets are listed under [resource limits](presentation.md#resource-limits).

## Replay

Reopening a session restores matching facts for calls on the selected branch, without rerunning tools or observing source files again. Published results still supply their outcomes and durations. Missing facts are never guessed from output text.

- Durations come from the `durationMs` that Pi saves with each tool result, so forks, copies, and other machines show them too. Pi measures the whole tool execution, including setup and any file observation or patch generation. Results without a duration, such as a call that never ran, show none.
- Replay rebuilds an operation status only when the call's entry records an observed operation, using Pi's outcome and the saved facts. Pi's duration shows only that the tool ran, so a call that stopped before its operation, such as an edit whose text did not match, shows none.
- Relative targets resolve against the session cwd, as Pi's own rows do, including for calls that ran in another directory.

### Saved output

Expanding a finished shell card reads a bounded preview from Pi's temporary output file. Saved-output paths that the extension observed are never saved. After `/reload` or reopening a session, an aborted or timed-out shell call shows no preview, because Pi saves no output path with its result. [Saved-output previews](presentation.md#saved-output-previews) describes path sources, loading, and retry.
