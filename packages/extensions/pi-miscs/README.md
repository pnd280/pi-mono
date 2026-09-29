# pi-miscs

A home for small Pi extensions that do not need their own package, typically one source file each. Use a dedicated package when an extension grows into a larger feature.

## Usage

The bundle is currently empty and registers nothing.

To add an extension:

1. Create `src/<name>.ts` with a default factory accepting Pi's `ExtensionAPI`.
2. Import and call the factory from [src/index.ts](src/index.ts), passing `pi`. Await asynchronous factories.
3. Document its behavior, configuration, and side effects here, and add relevant coverage beside the source.

Adding a file alone does not enable it. All registered extensions load together; there are no per-extension toggles.

## Configuration

None. No settings or environment variables are read.

## Side effects

None while the bundle is empty. It performs no writes, persistent state changes, or network requests.

## Validation

From the repository root:

```sh
vpr 'pi-miscs#check'
vpr 'pi-miscs#test'
```

The package is intentionally test-free until it contains behavior: **no tests ran** is the expected test result. Remove `--passWithNoTests` when adding the first tests. See [coverage boundaries](docs/testing.md) and the [Pi compatibility checklist](docs/pi-compatibility.md).
