# Model-prompt coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

Shared algorithms are tested in libs and utils; see the [workspace ownership rules](../../../../docs/agents/testing.md#ownership). For maintainers: this package tests one session snapshot that owns settings, loaded files, warnings, and model-specific replacements, plus its Pi adapter.

## Must not regress

- Different explicit `--append-system-prompt` text, and earlier edits by other extensions, survive. Replacement happens only when the current append text equals the loaded base text. Identical text can't be told apart from the base.
- Project settings are always ignored, and untrusted projects contribute no base file.
- Validation warnings never echo settings content.
- File warnings identify paths without terminal control sequences.

## Rules

- Patterns are unanchored, case-sensitive regular expressions tested against `provider/modelId`. The first matching rule that sets `append` wins.
- `append` paths expand a leading `~`, and relative paths resolve against the settings directory.
- Limits: 100 rules, 512 characters per pattern, 32 files per rule, 4096 characters per path.
- Invalid rules are skipped with a warning. Invalid sections, or unreadable settings, disable all rules. Missing settings produce no warning.
- Invalid rules' files and unconfigured files are not loaded. Valid rules' files are loaded even when the current model does not match.

## Base text and joining

- Base text follows Pi's discovery: the trusted project file, then the agent file, with a byte-order mark stripped. No file means empty text.
- Listed files have their byte-order mark stripped, and are joined in order with `\n\n`. Other whitespace is kept.
- Repeated paths retain their listed positions, but each unique configured path is loaded once and produces at most one file warning.
- Empty lists or files can remove the base append text.
- A missing, unreadable, or non-regular listed file produces a warning with its path. Matching rules keep the base text, and startup isn't blocked.
- An unreadable first selection does not fall through to a later matching rule.
- An unreadable base disables replacement.
- Startup warnings report settings problems first, then base discovery, then configured files in first-reference order.

## Real host

- The effective provider prompt switches between the selected files and the base as models change.
- Files and settings stay cached until `/reload`.
- `ctx.ui.notify` warns once per load in RPC mode, and stays silent without a UI in print mode.

## Where each layer is tested

| Suite                                           | Covers                                                                                                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Session snapshot](../src/model-prompt.test.ts) | Rule parsing, path resolution, base discovery, ordered replacements, warning order and deduplication, and a timed subprocess that checks FIFOs are rejected. All scenarios use the snapshot's loader and `replacementFor` interface. |
| [Host](../src/index.test.ts)                    | Event wiring, trust, model switching, CLI and earlier-extension append text, and reload, using Pi's faux provider and transcript replay helper.                                                                                      |

The 4096-character path acceptance case asserts the complete unreadable-file warning, because a real filesystem cannot open that path. This distinguishes schema acceptance from an invalid-rule warning without exposing the parser or injecting a filesystem.

## Not covered here

Pi's recording of transcript changes, prompt caching, and project-trust resolution belong to Pi and aren't retested.
