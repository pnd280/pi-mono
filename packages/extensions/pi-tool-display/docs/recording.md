# Recorded data and replay

[pi-tool-display](../README.md) · [Glossary](../GLOSSARY.md)

pi-tool-display saves a few facts about tool calls in Pi's session history, so that a reopened session shows the same cards. It keeps no durable output archive.

## Observation

In TUI, RPC, print, and JSON sessions, the extension observes verified Pi-native `bash`, `powershell`, `edit`, and `write` calls. Invalid display settings, or a `rendererOverrides` value other than `auto` for the tool, turn observation off; see [configuration](../README.md#configuration). It collects shell previews, outcomes, and file contents from before each write. Display failures never change a tool's outcome.

- Native observation excludes SDK tool overrides, custom tools, and manual `!` and `!!` commands. Verified extension adapters can still contribute call provenance and summaries.
- Another process writing the same file can race with the observation.

## Session history

Session history stores only facts that Pi's own entries lack. The extension keeps them in `pi-tool-display.call` custom entries, outside the model's context. The full set is:

- that native observation saw an operation;
- cancellation;
- a shell exit code or timeout when the call did not succeed;
- a change applied although Pi reported failure;
- an operation failure that Pi's result or call cancellation cannot preserve;
- whether a write created or modified its file, with a bounded patch when replay needs it;
- why a change has no patch;
- for a [codemode](tools.md#codemode) script, the nested `edit` and `write` facts below.

The extension saves a call's facts when Pi publishes the call's final result. Under Pi's [quit, session-change, and reload contracts](pi-compatibility.md#transcript), only a killed process leaves a call without them.

Each call saves at most one `pi-tool-display.call` custom entry, and every call with an observed operation and a final result saves one. When an entry cannot be saved, because it exceeds the size limit or the session write fails, the extension warns once for each problem, and the live card keeps its facts.

The extension saves patches only when replay needs them:

- `write` saves its patch only when replay cannot derive the same patch from the written content.
- `edit` diffs come from Pi's result. The extension saves its own diff when the edit did not succeed, or Pi's patch is missing, invalid, or has different hunks.

A script's nested facts are keyed by the nested call's ID after the script's own ID, such as `1` or `2/1`. Each holds only what Pi's record of the script's calls lacks, and a script with none saves no nested facts:

- the observed file, only when Pi dropped the call's arguments;
- that the call created its file;
- added and removed line counts of a successful change, unless replay derives them from a created file's content in Pi's record;
- that the change was applied although Pi's record shows no success.

Nested facts hold no patches or file text.

## Record size limits

The JSON data of a call entry is limited to 160 KiB, including unknown fields. The extension does not save a larger entry, and replay does not apply one.

Change observation reads at most 8 MiB of each file version, keeps patches up to 128 KiB, and stops a comparison after 2,000 changed lines or 50 ms. A change over a limit shows as unavailable; the edit or write itself is unaffected. Other display effects are under [resource limits](presentation.md#resource-limits).

## Replay

Reopening a session restores matching facts for calls on the selected branch, without rerunning tools or observing source files again. Published results still supply their outcomes and durations. Missing facts are never guessed from output text.

- Durations come from the `durationMs` that Pi saves with each tool result, so forks, copies, and other machines show them too. Pi measures the whole tool execution, including setup and any file observation or patch generation. Results without a duration, such as a call that never ran, show none.
- Replay rebuilds an operation status only when the call's entry records an observed operation, using Pi's outcome and the saved facts. Pi's duration shows only that the tool ran, so a call that stopped before its operation, such as an edit whose text did not match, shows none.
- Relative targets resolve against the session cwd, as Pi's own rows do, including for calls that ran in another directory.

### Saved output

For saved-output paths, expansion, reload, and retry, see [saved-output previews](presentation.md#saved-output-previews).
