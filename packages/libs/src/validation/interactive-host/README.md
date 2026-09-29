# Interactive host fixture

[Offline validation](../../../README.md#offline-validation)

Import `hostFixture` from `@pi-mono/libs/validation/interactive-host` in Vite+ tests that need installed Pi command registration, custom UI mounting, native registries, or renderer switching. Consumer scenarios and assertions stay with the feature they test.

## Behavior

Creates an offline `AgentSession` with Pi's real interactive containers, renderer, input dock, and UI proxy against a no-op 80×24 terminal. It loads only supplied extension factories, not workspace extensions.

Mutable settings and model-runtime files live in a system temporary directory. The fixture disables model-network access and user resource discovery; it does not send model requests.

## Caller responsibilities

Pass extension factories and optionally `"regular"` or `"fullscreen"`. Create feature-specific settings under the returned `directory` and `agentDir`, then call `bind()` to emit session startup against the real UI. `host`, `ui`, `session`, and `terminal` expose the installed boundary for consumer assertions.

Always close custom UI and await `dispose()` in `finally`. Do not run fixtures concurrently in the same test context: environment stubs and Pi's theme are process-local.

## Validation

Use the [library checks](../../../README.md#validation) and affected consumer suites; each suite registers only its own feature.

The fixture relies on installed Pi 0.87.1's private containers, `mountInteractiveTui`, `createExtensionUIContext`, and `createChatViewport`. Recheck those contracts on Pi upgrades. A no-op terminal does not establish physical keyboard, mouse, or color behavior.
