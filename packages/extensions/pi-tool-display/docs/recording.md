# Recorded data and replay

[pi-tool-display](../README.md) · [Glossary](../GLOSSARY.md)

This guide gives the details behind [what is recorded](../README.md#what-is-recorded): which facts the extension saves, when it creates its local files, and how replay finds them again.

## Observation

- Native `edit` and `write` observations share source capture and patches with `pi-agent-summary` through [file observations](../../../libs/src/file-mutations/README.md), so files are not read twice.
- Another process writing the same file can race with the observation.

## Session history

Session history stores only facts that Pi's own entries lack:

- cancellation;
- a shell exit code or timeout when the call did not succeed;
- a change applied although Pi reported failure;
- an operation failure that Pi's result or call cancellation cannot preserve;
- bounded patches.

When collection stops before Pi saves a call's result, such as at shutdown, the observed outcome and exit code are saved, because replay cannot rely on that result.

These facts are kept in `pi-tool-display.call` custom entries, outside the model's context. A `pi-tool-display.writer` entry names the local file for subsequent saved call facts and results, and the directory where those calls ran.

Patches are saved only when replay needs them:

- `write` saves its patch only when replay cannot derive the same patch from the written content.
- `edit` diffs come from Pi's result. The extension saves its own diff when the edit did not succeed, ended without a result, or Pi's patch is missing, invalid, or has different hunks.

## Local files

Local details (timing, saved-output references, and diagnostics) go to `pi-tool-display/calls/<writer>.jsonl` under Pi's agent directory.

- The file is created at the first live tool start or local-detail write, including after a reload.
- Folders and files are owner-only, and linked files are refused.
- On native Windows, the folders rely on the user profile's ACL instead of owner and mode checks, so the agent directory must be inside the user profile. Outside it, the extension warns once and keeps local details in memory, as for sessions that Pi does not save. See the [Windows storage decision](../../../libs/docs/adr/0001-windows-private-storage.md).
- A failed write or close of this file shows a warning, also during shutdown.
- Line and file size limits are listed under [resource limits](presentation.md#resource-limits).

## Replay

Reopening a session restores matching facts for calls on the selected branch. Published results still supply their outcomes.

Replay finds local details through the nearest writer entry before a call's saved facts or result, so forks and copies keep them on the same machine. When that file is not on this machine, shell cards show `Timing not on this machine`, and expanded cards say that local details are missing. The other reasons for missing details are listed under [outcomes](presentation.md#outcomes).
