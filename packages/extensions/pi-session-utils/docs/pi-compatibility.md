# Pi compatibility for maintainers

[pi-session-utils](../README.md)

> Last verified against Pi 1.3.0 with the package checks, offline tests of API and process startup, persistence, naming, and title requests, and a source review of session management, the session picker, the model registry, and thinking levels. Not covered: offline payload probes for per-level sampling and routed title budgets, title quality with live providers, and manual checks of the session picker.

## Upgrade procedure

1. Run the [package checks](../../../../docs/development.md#focused-validation). Model requests use offline fixture providers. The [coverage specification](testing.md) lists the unit, runtime, and installed-process checks for startup hooks, session replacement, naming, and clean protocol output.
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

Session replacement must preserve saved data and parent links while giving naming callbacks a fresh context.

### Persistence

[Persistence](../src/persist.ts):

- [ ] `SessionManager.create()` provides a new header and path.
- [ ] `getBranch()` keeps the order of the active path.
- [ ] Pi can reopen the resulting JSONL and keep appending to it.
- [ ] `getSessionName()` reads the latest session-wide metadata, including an explicit clear, regardless of the active branch.
- [ ] The saved snapshot keeps that name and any existing `parentSession`.

### Commands

[Commands](../src/commands.ts):

- [ ] `isIdle()` reports active runs and other busy states, so persistence and child creation can reject them at once.
- [ ] Naming stays independent of idle checks and session-operation locking.
- [ ] `switchSession()` and `newSession({ parentSession })` supply a fresh `withSession` context.
- [ ] `switchSession()` and `newSession({ parentSession })` report cancellation before replacement.
- [ ] `newSession()` leaves out the parent's conversation and name.

### Startup hook

[Startup hook](../src/startup.ts):

- [ ] Pi and extension imports share the `SessionManager` prototype.
- [ ] CLI flag values aren't available while extension factories run.
- [ ] The first `buildSessionContext()` runs after flags are filled in, but before JSON headers, extension binding, or prompts.
- [ ] `getHeader()` returns the live, writable header before a new session file is written.
- [ ] Pi turns failures while building the startup context into nonzero exits.
- [ ] The one-shot hook is restored before forwarding or throwing.
- [ ] Reload and replacement don't apply the CLI flag again.

### Parent lookup

[Parent lookup](../src/parent.ts):

- [ ] Default session groups are still under `getAgentDir()/sessions/`.
- [ ] Headers identify exact IDs and the session cwd.
- [ ] Lookup never triggers migration or modifies parents.

### Generation

[Generation](../src/auto-title/generate.ts):

- [ ] Pi normalises title requests and applies provider authentication.
- [ ] The title request contains one user message.
- [ ] Unsupported thinking levels are rejected before a request.
- [ ] Only complete, non-empty text responses become titles.
- [ ] Provider errors don't expose raw error details.
- [ ] Requests keep the 15-second deadline, `cacheRetention: "none"`, and `maxRetries: 0`.
- [ ] Pi applies the title model's `samplingParamsByThinkingLevel` using its effective physical level, including `off`.
- [ ] An unavailable configured model is rejected before a request, with no fallback to the active model.
- [ ] The [shared thinking levels](../../../utils/src/thinking-levels.ts) list every level that the `thinkingLevel` setting accepts, including `off`, and matches the levels in the [README](../README.md#configuration).
- [ ] A virtual model's unknown output limit never becomes a zero-token request.
- [ ] Registry dispatch caps the extension's 1,024-token title budget to the routed physical model, and a smaller known model limit is kept.

The extension leaves sampling selection to the registry. It keeps its own token budget, disabled cache retention, and no-retry policy.

### Naming

The [naming lifecycle](../src/auto-title/runtime.ts) and the [naming adapter](../src/auto-title/index.ts) own this behaviour.

The [naming guide](naming.md#cancellation-and-retries) states what users see.

- [ ] Pi's session events let naming make one automatic attempt per load.
- [ ] Branch changes, session changes, and reloads cancel a generation in progress.
- [ ] Every agent run that emits a user `message_start` ends with `agent_settled`.
- [ ] `agent_settled` still reports `aborted` for an abort after the low-level agent loop ends, for example during `agent_before_settle`, when `ctx.signal` no longer fires.
- [ ] A name that the user or another extension sets during generation is visible through `getSessionName()`, so the generated title is discarded.
- [ ] Results of a superseded or cancelled generation are discarded.
- [ ] Naming events and metadata-only name updates work in TUI, print, JSON, and RPC modes, with no conversation messages or custom stdout.
- [ ] Persistence and child creation replace sessions without leaking old naming callbacks.

Naming holds a generated automatic title until its run settles, because Pi reports a late abort only in `agent_settled`. If a run never settles, its automatic title is never saved.

## Limitations

These limits come from Pi behaviour. Recheck each one when Pi changes the behaviour it describes.

### Startup parent

In Pi 1.3.0, Pi has no public way to set the parent at startup, so the CLI flag uses a scoped prototype hook and changes the live header. If Pi adds an API for startup session options, use it, while still rejecting resumed or non-empty sessions and failing before any model request.

### Option order

In Pi 1.3.0, Pi resolves its built-in session-selection options before extensions load. [Parent lookup](sessions.md#parent-lookup-from-the-cli) states what users see when an option conflicts with `--parent-session`.

### Custom directories

In Pi 1.3.0, in-memory session managers don't remember a custom directory. [Session directories](sessions.md#session-directories) states the directories that `/sesh persist` and parent ID lookup use as a result.

### Copying JSONL

If Pi adds a public API to save in-memory sessions, use it instead of copying JSONL. Keep the branch state, the current session-wide name, lineage, and cleanup after a cancelled switch.

### Cancellation

In Pi 1.3.0, authentication and providers may ignore cancellation of a [title request](../src/auto-title/generate.ts). Revisit request cancellation before simplifying the outer deadline, and keep bounded waiting and stale-result protection.

### Naming APIs

Compare any new naming APIs with the [source selection and naming policy](../README.md#automatic-session-names). Adopting one must keep the text limits, the explicit model choice, and the request side effects.
