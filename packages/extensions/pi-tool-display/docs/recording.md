# Recorded data and replay

[pi-tool-display](../README.md) · [Glossary](../GLOSSARY.md)

The extension keeps observed facts in session history and writes no files of its own. For user-visible effects, read [what is recorded](../README.md#what-is-recorded).

## Observation

- Native `edit` and `write` observations share source capture and patches with `pi-agent-summary` through [file observations](../../../libs/src/file-mutations/README.md), so files are not read twice.
- Another process writing the same file can race with the observation.

## Session history

[What is recorded](../README.md#what-is-recorded) names the session entry. Session history stores only facts that Pi's own entries lack. The full set is:

- that native observation saw an operation;
- cancellation;
- a shell exit code or timeout when the call did not succeed;
- a change applied although Pi reported failure;
- an operation failure that Pi's result or call cancellation cannot preserve;
- bounded patches.

When collection stops before Pi saves a call's result, such as at shutdown, the extension saves the observed outcome and exit code, because replay cannot rely on that result.

Each call saves at most one `pi-tool-display.call` custom entry, and every call with an observed operation saves one. When an entry cannot be saved, because it exceeds the size limit or the session write fails, the extension warns once for each problem, and the live card keeps its facts.

The extension saves patches only when replay needs them:

- `write` saves its patch only when replay cannot derive the same patch from the written content.
- `edit` diffs come from Pi's result. The extension saves its own diff when the edit did not succeed, ended without a result, or Pi's patch is missing, invalid, or has different hunks.

## Record size limits

A call entry is limited to 160 KiB, and the size includes unknown fields. The extension does not save a larger entry, and replay does not apply one.

Other display budgets are listed under [resource limits](presentation.md#resource-limits).

## Replay

Reopening a session restores matching facts for calls on the selected branch. Published results still supply their outcomes and durations.

- Durations come from the `durationMs` that Pi saves with each tool result, so forks, copies, and other machines show them too. Results without it, such as a call that never ran, show no duration.
- Replay rebuilds an operation status only when the call's entry records an observed operation, using Pi's outcome and the saved facts. Pi's duration shows only that the tool ran, so a call that stopped before its operation, such as an edit whose text did not match, shows none.
- Relative targets resolve against the session cwd, as Pi's own rows do, including for calls that ran in another directory.
- Saved-output paths that the extension observed are never saved. [Output paths](presentation.md#output-paths) says when a reopened call still has a preview.
