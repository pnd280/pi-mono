# [pi-miscs](README.md) development

Register each new factory explicitly in [src/index.ts](src/index.ts); keep its behavior and tests together in `src/`.

## Constraints

- Keep each extension independent; the entry point only composes factories in explicit order. Await asynchronous factories.
- Do not scan directories or import tests automatically. Adding a source file must not register it implicitly.
- Move larger features to a dedicated extension package rather than growing a second framework here.

## Validation

Run [package validation](README.md#validation). When adding behavior, consult [coverage boundaries](docs/testing.md) and [Pi compatibility](docs/pi-compatibility.md); keep validation offline.
