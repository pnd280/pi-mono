# Interactive host fixture

[Offline validation](../../../README.md#offline-validation)

Import `hostFixture` from `@pi-mono/libs/validation/interactive-host` in Vite+ tests that need installed Pi command registration, custom UI mounting, native registries, or renderer switching. Consumer scenarios and assertions stay with the feature they test.

## Behaviour

Creates an offline `AgentSession` with Pi's real interactive containers, renderer, input dock, and UI proxy against a no-op 80×24 terminal. It loads only supplied extension factories, not workspace extensions.

Mutable settings and model-runtime files live in a system temporary directory. Until `dispose()`, the process environment keeps only `PATH`, `SystemRoot`, and the terminal, locale, and temporary-directory variables, and `HOME` points to a private directory, so provider credentials from the user's environment or home files cannot authenticate. The fixture disables model-network access and user resource discovery; it does not send model requests. If setup fails, it releases the acquired host and session resources, removes the temporary directory, and restores the environment before it rejects.

## Caller responsibilities

Pass extension factories and optionally `"regular"` or `"fullscreen"`. Create feature-specific settings under the returned `directory` and `agentDir`, then call `bind()` to emit session startup against the real UI. `host`, `ui`, `session`, and `terminal` expose the installed boundary for consumer assertions.

Always close custom UI and await `dispose()` in `finally`. If a widget or footer disposer throws, `dispose()` still releases the host and session resources. Directory removal and environment restoration also run if host or session cleanup throws.

Do not run fixtures concurrently in the same test context, because environment stubs and Pi's theme are process-local.

## Terminal input tests

Use `inputHostFixture("fullscreen")` for focused-input and custom-view lifetime tests. It adds an offline faux provider, binds the session, focuses the editor as Pi's startup does, starts the real renderer, and registers teardown with Vite+. The default mode is `"fullscreen"`; pass `"regular"` to test regular-mode mounting.

Send terminal bytes with `send(data)` and force a render with `render()`. The returned `presentation`, `editor`, `dock`, and `transcript` expose the active host components for assertions. The fixture supplies a 100-line transcript so paging has an observable target. Always close custom views in `finally`; fixture teardown releases the host after the test.

## Validation

Use the [library checks](../../../README.md#validation) and affected consumer suites; each suite registers only its own feature.

The fixture relies on installed Pi's private containers, `mountInteractiveTui`, `createExtensionUIContext`, and `createChatViewport`. Recheck those contracts on Pi upgrades. A no-op terminal does not establish physical keyboard, mouse, or colour behaviour.
