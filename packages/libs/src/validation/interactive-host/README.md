# Interactive host fixture

[Offline validation](../../../README.md#offline-validation)

Import `hostFixture` from `@pi-mono/libs/validation/interactive-host` in Vite+ tests that need installed Pi command registration, custom UI mounting, native registries, or renderer switching. Consumer scenarios and assertions stay with the feature they test.

## Behavior

Creates an offline `AgentSession`, real `InteractiveMode` renderers and UI proxy, in-memory session/settings managers, and a no-op 80×24 terminal. Both regular and fullscreen modes use Pi's actual containers and input dock without startup downloads or signal handlers. The fixture loads only supplied extension factories; it has no dependency on workspace extensions.

Mutable settings and model-runtime files live in a system temporary directory. The fixture stubs `PI_CODING_AGENT_DIR` and `PI_OFFLINE`; it disables model-network access and user resource discovery. It does not send model requests.

## Caller responsibilities

Pass extension factories and optionally `"regular"` or `"fullscreen"`. Create feature-specific settings under the returned `directory` and `agentDir`, then call `bind()` to emit session startup against the real UI. `host`, `ui`, `session`, and `terminal` expose the installed boundary for consumer assertions.

Always await `dispose()` in `finally`. Close any open custom UI first. Disposal emits session shutdown, clears native widgets/footer, stops the renderer and footer subscription, disposes the session, removes the temporary directory, and restores stubbed environment variables. Do not run fixtures concurrently in the same test context: environment stubs and Pi's theme are process-local.

## Validation

Use the [library checks](../../../README.md#validation) and affected consumer suites. Working-message command integration lives under `src/working-message/`; widget integration stays in `pi-editor-widgets`. Each suite registers only its own feature.

The fixture relies on installed Pi 0.87.1's private containers, `mountInteractiveTui`, `createExtensionUIContext`, and `createChatViewport`. Recheck those contracts on Pi upgrades. A no-op terminal does not establish physical keyboard, mouse, or color behavior.
