# Shared-library test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../docs/agents/testing.md#coverage)

This package tests reusable protocols with I/O, scheduling, or terminal output; [utils](../../utils/docs/testing.md) owns other pure helpers, and extensions own feature records, policies, and their SDK integration.

## Must not regress

- **Critical, integration:** Private reads return exact bytes within the caller limit and reject larger files.
- **Critical, integration:** Private reads and atomic writes restrict effective POSIX ACL access.
- **Critical, integration:** Atomic replacement leaves the previous destination unchanged on every pre-commit failure.
- **Critical, integration:** Validation launches inherit no user credentials or settings.
- **Critical, integration:** Validation launches enforce private storage and offline environment values even when caller additions disagree.
- **Critical, integration:** Under caller-established trusted parents, private-file access rejects foreign ownership before repairing permissions or ACLs.
- **Critical, integration:** Private-file access rejects final-path symlinks, hard-linked files, and nonregular files without changing their permissions or contents.
- **Critical, integration:** Private-file lock acquisition does not reclaim an existing lock, regardless of its age or the owning process's liveness.
- **Critical, integration:** Releasing a private-file lock never removes a lock whose token or inode changed.
- **Critical, integration:** Private-file transactions acquire the data path's lock before reading the bytes supplied to the update callback.
- **Critical, integration:** Without POSIX owner IDs, private storage refuses a directory outside the user profile before it creates it, and works inside the profile without owner or mode checks.
- **Critical, integration:** Settings updates preserve JSON keys that the synchronous mutator leaves untouched, including `__proto__` and `constructor`.
- **Critical, integration:** Settings updates follow an existing symlink without replacing the link itself.
- **Critical, integration:** On POSIX filesystems, settings updates preserve existing permission bits even when the writer's umask would mask them.
- **Critical, integration:** Settings updates refuse malformed input or serialised output above 1 MiB before replacing the file.
- **Critical, integration:** Settings sections ignore untrusted project and parent-directory settings, and refuse project saves in an untrusted project.
- **Critical, integration:** Settings section loads never write.
- **Critical, integration:** Settings section saves replace only their field.
- **Critical, integration:** Settings section saves refuse invalid values, malformed sections, and held locks without changing the file.
- **Critical, integration:** Settings section diagnostics show terminal-safe paths, while loads and saves still use the real paths.
- **Critical, unit:** For complete input snapshots, `displayText` removes terminal escape and control bytes other than normalised whitespace.
- **Critical, unit:** For complete input snapshots, `styledOutput` retains only SGR styling from source terminal controls.
- **Critical, e2e:** In every load order, startup commits run once per `session_start` emission, in ascending rank, after every extension's `session_start` handler.
- **Critical, e2e:** In every load order, every participant's shutdown revoke runs before any participant's shutdown handler awaits.
- **High, e2e:** A shared custom view receives each owned input once while focused, including controls remapped to transcript paging.
- **High, e2e:** Close, abort, and remount of a shared custom view make old callbacks inert, restore host input, and preserve unrelated overlays.
- **High, e2e:** After-close effects of a shared custom view run once, after final closure only.
- **High, e2e:** In every load order, input-chain observers receive the input before any participant's transform changes it.
- **High, e2e:** In every load order, input-chain transforms run in ascending rank, and each gets the previous result.
- **High, e2e:** A `handled` input-chain result stops the chain.
- **High, e2e:** In every load order, prompt parts are appended after the existing `appendSystemPrompt` text in ascending rank, once per run, and only after every pending hold has settled.
- **High, e2e:** Shortcut claims that overlap, including different spellings of one key, register for no claimant and give one warning per conflict. Other claims register.
- **High, integration:** A configured FIFO cannot block `readSettingsFile` or session startup.
- **High, integration:** Mutation observations preserve native write outcomes and queue order.
- **High, integration:** Mutation observations distinguish unavailable source from complete UTF-8 source.
- **High, integration:** Mutation observations add no post-write reads.
- **High, integration:** Bounded patch requests refuse oversized inputs and results.
- **High, integration:** Bounded patch requests recover after worker failure without blocking later requests or retaining unbounded queued source.
- **High, integration:** Disposing a private-write lifetime cancels unstarted transactions and waits for started commits and lock cleanup.
- **High, integration:** A private-file transaction whose post-commit cleanup or lock release fails still reports `committed`, with the warnings and cleanup errors separate.
- **High, unit:** `highlightCodeBounded` returns its input unchanged when language detection or input limits prevent highlighting, so callers must supply display-safe text.
- **High, unit:** Native hook disposal leaves later replacements by other owners intact.
- **High, integration:** Disposing a native-tool or file-mutation subscription stops that subscription's observation callbacks without disabling surviving subscriptions.
- **High, integration:** File renames retry only on Windows and only for `EPERM`, `EACCES`, and `EBUSY`, stop after 10 attempts, and keep the previous target when they fail.

## Not tested

- Model-facing schema projection is not tested because consumers reject invalid domain input before side effects, and only live provider checks prove that providers accept a schema.
- Output retention, working-message contributions and ordering, scripted provider streams, and the interactive host fixture are below the severity bar.
- [Coordinator](../src/coordination/README.md) liveness, coordinator version-mismatch behaviour, and working-message command ownership are not tested because no invariant is approved for them yet.
- TUI layout, settings-frame presentation, and diff-row appearance are below the severity bar. Use the [shared TUI validation](../src/tui/README.md#validation) for them.
- Extensions own their collection formats and tool-card policies.
- The [release check](../../../docs/development.md#release-branch) owns worker loading in the installed `release` tree, where workers get no Pi host packages.

## Manual checks

Check cross-platform ACL guarantees with the [isolated platform checks](../../extensions/pi-prompt-manager/docs/validation.md#platform-checks). Check visual themes and mouse selection with the [terminal checks](../../extensions/pi-tool-display/docs/validation.md#host-interaction-checks).
