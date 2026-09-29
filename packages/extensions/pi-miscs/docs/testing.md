# Miscellaneous extension coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

The package is currently an empty registration scaffold. Loading it registers no commands, tools, or event handlers and performs no I/O.

## Coverage boundaries

Formatting, linting, and type checking cover the entry-point wrapper and factory signature. The package is intentionally test-free because it has no runtime behavior; the test script uses `--passWithNoTests`.

When adding behavior, document its observable contracts here, colocate meaningful `*.test.ts` coverage with its owner, and remove `--passWithNoTests`. Put offline host validation in `validation/` when integration risks warrant it; shared test discovery already includes that directory.

## Exclusions

Do not add tests that merely assert the empty factory or duplicate Pi's extension loader. Bundled extensions should cover their own behavior, not unchanged host APIs.
