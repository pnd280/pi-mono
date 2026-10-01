# Shared-library coverage

[Package](../README.md) · [Shared testing policy](../../../docs/agents/testing.md)

For maintainers: this package tests reusable algorithms and protocols, including cooperative search and its internal ranking. Other pure helpers are tested in [utils](../../utils/docs/testing.md), and features in their extensions; see the [workspace ownership rules](../../../docs/agents/testing.md#ownership).

## Must not regress

- **Private files.** Ownership is enforced. Unsafe links and file types are rejected before permissions or ACLs are repaired.
- **Locks.** Locks are never stolen. Transactions lock before reading the current bytes.
- **Settings.** Updates keep unrelated JSON keys, settings symlinks, and mode bits, and never write a malformed or oversized file.
- **Terminal output.** Sanitised and highlighted text never emits terminal commands.
- **Hook ownership.** Native hooks restore only replacements they own, and disposed consumers cannot affect surviving ones.

## Model-facing schemas

Projection:

- Zod input types are projected into composable TypeBox schemas.
- Runtime metadata and integer bounds that providers don't support are left out.
- Structural constraints, descriptions, optionality, nullable values, and declared string and array limits are kept.
- A description is required wherever explicit integer bounds are left out.

Safety:

- Original runtime schemas and metadata are never changed.
- The profile also applies to nested schemas supplied through metadata.
- Unsupported keywords are rejected with their schema paths. Recursive schemas are rejected rather than silently broadened.
- Literal property names, and `const` and `enum` values, are never mistaken for schema keywords.

Consumers must still reject invalid domain input before side effects. Local schema checks don't replace live checks that providers accept the schema.

## Files and storage

File changes must respect ownership and lock boundaries while preserving unrelated settings.

### Private files

- Reads are bounded.
- Directory aliases share storage scopes, but child paths can't escape them.

### Transactions

- Cooperating writers are serialised, and commits use an atomic rename.
- When a competing owner releases its lock during descriptor inspection, acquisition still succeeds.
- Unlinked open descriptors stay safe; hard-linked files do not.
- Cancellation prevents unstarted writes, but lets started writes and cleanup finish.
- Warnings after a commit never turn into failed writes or retries.

### Settings files

Example: a settings file with a leading BOM, a symlink, and mode `0600` stays a symlink with mode `0600` after an update that changes one key, even under a restrictive umask.

Reads:

- Reads are bounded, and the caller decides how errors are handled.
- JSON-record reads accept Pi's leading UTF-8 BOM, and treat an empty file as no settings.

Updates:

- Each update reads the file afresh under Pi's lock.
- Unrelated JSON keys, settings symlinks, and existing mode bits are kept, even when the writer's umask would mask them.
- Malformed files, oversized output, and asynchronous mutators are rejected before writing.
- When a mutator rejects, locks and temporary files are released.

### File observation

Observations distinguish complete, missing, changed, invalid, and non-regular sources, and never repair permissions.

### Clipboard

- Helpers receive exact UTF-8 on stdin, with no shell interpretation.
- They use the platform's native selection and fallback, with no OSC 52 fallback.
- They respect cancellation and deadlines.
- Platform selection has internal deterministic coverage; process failures, fallback, and complete payload delivery are exercised through `copyNative`.

## Output and diffs

Apply resource bounds without losing source order or labelling source text as generated notices.

### Output retention

- Stream and file output keep their order, byte and line bounds, and UTF-8 boundaries.
- Records keep which omissions were generated.
- Short Unicode lines stay complete until their line budget runs out.
- File omission counts include bytes discarded at incomplete character boundaries.

### Bounded diffs

- Diffs run off the main thread, and time spent queued doesn't use up the request's time budget.
- Active and waiting inputs share one accounting budget. Unrelated option fields aren't retained.
- Queue overload, work limits, and worker failures stay distinct.
- Completed and failed work release capacity, and rejected requests keep no inputs.
- Waiting and future requests stay usable after a failure.

### Git inspection

- Inspection uses real repository rules, worktrees, tracked exceptions, literal names, and symlink boundaries.
- Cancellation and deadlines stay distinct from missing or ignored targets.
- Injected malformed Git responses are rejected independently of the real-repository cases.

## Native tool hooks

- Hooks observe only verified definitions, and share observations across consumers.
- Execution and mutation order are preserved, and observer failures are isolated.
- Native `defaultTools` additions, and their retention on reload, survive observation without duplicate wrappers.
- Mutation observations and patches reflect the UTF-8 encoding of the written text, including replaced unpaired surrogates.
- Observations never modify borrowed tool arguments.

## Lifetimes and shared state

- Latest tasks, async caches, timed confirmations, and expiring notices reject stale work after replacement or disposal.
- Caches share loads and bound storage. Falsy values are cache hits. Rejected and busy loads can be retried.

### Cooperative search

- Phrase matches precede all-term matches and fuzzy matches; equal ranks retain source order and caller item identity.
- Internal ranking retains Pi-compatible fuzzy scores, transposition fallback, and bounded-work checkpoints within long records and repeated scans.
- Normalisation preserves whole-string Unicode casing across chunks. Cancellation and stale-result checks suppress obsolete work.

### Working message

- Contributors compose independently. Old handles can't clear replacements.
- Session transitions clear contributions.
- Saved ordering respects project trust and keeps unrelated settings.
- The library's own command integration is checked against the installed interactive host, without loading a workspace extension. It covers argument rejection, default and in-menu scopes, saved ordering, inline warnings, and editor restoration.

### Offline fixtures

- Fixtures isolate home directories, credentials, mutable directories, and launch flags.
- Scripted responses stay pending until their scenario finishes.
- Scripted providers end on errors and cancellation instead of leaving consumers hanging.

## Reusable TUI

Keep user state across asynchronous work and remounts, and release the view only at final closure.

### Browsers

- Shortcut validation rejects keys Pi cannot dispatch. Hints skip them, and opening requires a usable cancel binding.
- Sections retain independent queries and stable-key selections.
- Switching sections keeps the preview open when a result exists and resets its scroll position.
- Loading, empty, and error states are distinct.
- Deletion is confirmed for the same target within its deadline.
- Late results cannot update a closed browser. Consumer effects that have already started continue.
- Logical activation and input preserve section selection. Invalidation cancels confirmation without cancelling active preparation; final disposal suppresses late results.

### Host mounting

- One logical view survives resizing, and closes exactly once.
- The captured editor is restored before consumer effects run.
- Fullscreen input ownership respects focus, overlays, listener order, and transcript search. It never captures unrelated keys.

### Lists and settings editors

Lists, trees, footers, previews, and settings editors keep the selection and essential actions visible within the given dimensions.

Footer feedback replaces the reserved hint rows, retains bounded final-row overflow text, and performs no render-time notification effects.

The shared settings frame, at 40×10:

- keeps the target, save and exit controls, and recovery visible;
- puts the pagination row of an overflowing list immediately below its items, never on the frame border, and omits the counter when the list fits;
- separates feedback from content with a blank row when there's room, without pushing out essential controls or recovery;
- shows the active scope in the accent colour, and unset and changed markers as text;
- keeps load warnings, failed saves, and "saved but overridden" outcomes distinct.

Order editors:

- Edits stay drafts until saved.
- Inherited orders and explicitly empty orders are different.
- Selection stops at the ends of the list.
- Inheritance configured by a consumer follows the real scope precedence.

### Terminal text

- Sanitisation, grapheme-safe slicing, highlighting, wrapping, and diff layouts keep the source's meaning.
- Byte, code-point, and terminal-cell bounds are distinct. Limits never hide the edit, or label literal text as an omission.
- Recognised escape boundaries take precedence over grapheme segmentation, so a following combining mark can't split a complete escape.
- Output that depends on the theme refreshes on invalidation.
- Split and unified diff rows preserve unequal replacements, line numbers, context separation, and hunk order.
- Search and layout preparation yields, discards cancelled work, and matches whole-input results across chunk boundaries.

## How to test

- Keep integration checks where a consumer could leave out a safety option or misread a result. Do not repeat every shared failure matrix.
- Use real filesystem, process, and host-component tests where mocks can't establish the boundary.
- Assert exact call counts only to protect bounded work, prevent duplicate I/O, or verify effect ownership, not to pin a particular helper structure.
- Don't freeze full terminal snapshots or internal batching when public state, bounded work, and routing outcomes are enough.

## Not covered here

- Extension-specific collection formats and tool-card policies.
- Native clipboard contents and cross-platform ACL guarantees. Captured stdin and Linux tests can't establish them; use the [isolated platform checks](../../extensions/pi-prompt-manager/docs/validation.md#platform-checks).
- Visual themes and mouse selection; use the [terminal checks](../../extensions/pi-tool-display/docs/validation.md#host-interaction-checks).
