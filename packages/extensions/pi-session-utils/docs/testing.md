# Session management test coverage for maintainers

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

Shared algorithms are tested in libs and utils; see the [workspace ownership rules](../../../../docs/agents/testing.md#ownership). Property restoration belongs to [OwnedHooks](../../../libs/src/owned-hooks/README.md). Pi owns session reconstruction, metadata serialisation, later persistence, and provider-specific reasoning mappings.

Unit coverage is limited to the must-not-regress invariants below. Filesystem, session-manager round-trip, model-registry, real-host, and process integration tests retain broader coverage.

## Must not regress

- Missing or invalid merged naming settings, an unavailable configured model, or an unsupported thinking level prevent naming requests rather than falling back to the active model.
- Parent lookup leaves file contents unchanged, including older supported session headers, whether the parent is selected by path or exact ID.
- A persistence switch error leaves the saved snapshot available for recovery, including when the error occurs after session replacement.
- An explicitly cancelled persistence switch removes only the newly saved snapshot.
- Superseded or cancelled naming results do not change the session name, even when the provider ignores cancellation.
- Invalid `--parent-session` startup exits nonzero before executing the prompt.

## Session commands

Persistence and child creation share an operation lock and require an idle agent. Naming can run while either is busy.

### Busy agent

- Persistence and child creation need `isIdle()`. When busy they warn at once, without waiting, saving, switching, or queueing.
- A busy child command includes a POSIX-shell-safe `pi --parent-session` command when the parent file exists. Paths with spaces, apostrophes, and shell metacharacters stay one literal argument.
- Ephemeral and unwritten parents get guidance to save first.
- Paths with control characters get guidance to retry once idle. Notifications sanitise displayed paths without changing the real filesystem or switch targets.

### Persist

- `/sesh persist` copies only the active branch under a new session header, keeps any parent link, and switches to the saved file.
- Entries keep their IDs, parent links, metadata, and model context.
- The current session-wide name, or an explicit clear, survives even when its metadata is outside the active branch. An empty branch can keep a name without bringing in any conversation.
- The source session, and sessions already saved, are unchanged.

### Create an empty child

- `/sesh create-empty-child` starts an empty conversation linked to the current saved session.
- It refuses ephemeral parents and parent files that were allocated but never written.
- Cancelling leaves the current session unchanged.

### Command surface

- `/sesh` handles persistence, child creation, and `auto-name [clear]`. No separate naming command is registered.
- Unsupported subcommands and extra arguments start no session operation or naming request.
- While an operation holds the lock, non-naming arguments get the in-progress warning instead of usage guidance.
- Completion offers the supported subcommands, and the nested `clear`, with short descriptions, without intercepting submission of complete arguments.
- Only persistence and child creation share an operation lock. Naming works while the agent or a session operation is busy. Regeneration replaces earlier generation, and `clear` cancels at once.
- The operation lock stays held until the awaited operation settles, then releases after success, cancellation, or an error.

## Startup flag

- `--parent-session` resolves a readable file path, or an exact ID that matches one session. Header reads are bounded. Malformed, oversized, missing, and non-file parents are rejected safely.
- The flag can't reparent existing or non-empty sessions, or combine with conflicting session-selection flags.
- Pi parses prompts and option values without treating their contents as flags.
- Saved and ephemeral children keep the chosen parent without bringing in its conversation. Saving an ephemeral child keeps its lineage.
- Scratch sessions rebuilt by other extensions' factories are ignored.
- Reloads, and later sub-sessions, don't apply the startup parent again.
- The first JSON header already includes the parent.

## Naming

Naming requires an explicit model; missing or invalid settings must leave session operations usable.

### Configuration

- Generation needs an explicit model and a supported thinking level, from `ext.pi-session-utils.auto-title` in global or trusted current-project settings. Fields are inherited across scopes.
- With missing or invalid settings, `clear` and session operations still work.

### Automatic and manual

- Automatic naming makes at most one attempt per load. It waits for an incoming message with non-empty user text without using up the attempt, even when the branch already contains text. It keeps existing names and stays quiet.
- Manual regeneration uses recent conversation from the current branch and reports safe notifications.

### Requests and titles

- Only user and assistant text from the current branch is sent, within the documented 4,000-character limits. Tool output and thinking are excluded.
- Complete text responses become sanitised titles of at most 80 characters that never split a grapheme. Incomplete responses and provider errors leave the name unchanged.
- Authentication and transport use Pi's configured provider.
- Deadlines and cancellation settle even if external work ignores the abort.

### Cancellation

- A native rename or clear cancels generation, even if the name ends up back at its original value.
- Tree navigation, reload, session replacement, and shutdown also cancel pending work. Tree navigation doesn't give back the automatic attempt.
- Persistence keeps existing name metadata. Empty children start unnamed and can name themselves from their own requests.
- Print and JSON output stay clean, and exit doesn't wait for background naming.

## How to test

- Integration is checked with session-manager round trips, Pi host and runtime tests, and isolated installed-Pi processes.
- Cover each distinct notification and activation branch in a representative host mode, plus real process checks, rather than every scenario in every mode.
- Process fixtures use offline providers, or append assistant entries directly to exercise persistence.

## Not covered here

Paid model requests, judgments of title quality, exporting other branches, terminal rendering, and reimplementing provider authentication.
