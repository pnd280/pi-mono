# [pi-miscs](README.md) development

## Code navigation

- [index.ts](index.ts): package-root Pi entry-point wrapper.
- [src/index.ts](src/index.ts): explicit registration of the bundled extensions.
- `src/<name>.ts`: one small extension per file; colocate tests as `<name>.test.ts`.

## Constraints

- Keep each extension independent; the entry point only composes factories in explicit order. Await asynchronous factories.
- Do not scan directories or import tests automatically. Adding a source file must not register it implicitly.
- Move larger features to a dedicated extension package rather than growing a second framework here.
- Follow shared [development conventions](../../../docs/development.md) and [reuse guidance](../../../docs/agents/architecture.md).
- Update the README's behavior, configuration, and side effects when adding an extension.

## Validation

Use [package validation](README.md#validation), the [coverage specification](docs/testing.md), and the [Pi compatibility checklist](docs/pi-compatibility.md). Keep validation offline.
