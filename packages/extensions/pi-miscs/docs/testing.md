# Miscellaneous extension coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

The empty scaffold registers no commands, tools, or handlers and performs no I/O. It is intentionally test-free (`--passWithNoTests`); formatting, linting, and types cover the entry point.

When adding behavior, document its observable contracts here, colocate meaningful `*.test.ts` coverage with its owner, and remove `--passWithNoTests`. Put offline host validation in `validation/` when integration risks warrant it; shared test discovery already includes that directory.

Do not test the empty factory or duplicate Pi's loader. Bundled extensions own their behavior, not unchanged host APIs.
