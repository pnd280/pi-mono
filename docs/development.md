# Package development

## Code and tooling

Every workspace package exposes these scripts, scoped to its own files:

- `check`: Oxlint's combined lint and TypeScript diagnostics, with warnings failing through the shared configuration.
- `test`: a non-watch Vitest runner.
- `format`: Oxfmt formatting, accepting `--check` for validation without writes.

Package scripts own tool invocations and configuration; invoke them instead of calling Oxlint or Oxfmt directly. Resolve diagnostics in the implementation, preserving shared checks and explaining any necessary narrow exception.

## Focused validation

Select packages from the changed files and their dependency impact. Filter by exact manifest name:

```sh
pnpm --filter '<package-name>' format --check
pnpm --filter '<package-name>' check
pnpm --filter '<package-name>' test
```

Run relevant tests through those packages' `test` scripts. For shared-code changes, include every affected consumer. Format writes use the same package filter with `format` instead of `format --check`.

Root `check`, `test`, and `format` commands use `pnpm -r`. Reserve them for workspace-wide impact.

## Packages and dependencies

- **Manifest:** use a unique name, `"private": true`, and `"type": "module"`. Keep packages private until distribution is explicitly requested.
- **Source:** use TypeScript under `src/`. Give each package a `tsconfig.json` extending [tsconfig.base.json](../tsconfig.base.json) and including its source and tests. Its scripts must apply the shared lint and format configs from the package's working directory.
- **Dependencies:** declare imports in the owning package. Use `workspace:*` for local packages and `catalog:` for shared external versions. Update dependencies with pnpm and include the resulting lockfile changes.
- **Package API:** declare supported entry points in `exports`. Import other workspace packages by their declared name and exported subpaths; keep relative imports inside the owning package.
- **Pi packages:** before editing extension manifests or host/runtime dependencies, read the installed [package documentation](../node_modules/@earendil-works/pi-coding-agent/docs/packages.md). Use `src/index.ts` for the default pi factory and list that file explicitly in `pi.extensions`; helpers and tests stay outside the entry list.

## Documentation

Every workspace package must have a short `README.md` covering:

- **Purpose:** what the package does and when to use it.
- **Usage:** supported entry points and a minimal working example or invocation.
- **Configuration:** available options, environment variables, and defaults.
- **Side effects:** observable effects such as file writes, persistent state changes, or network requests.
- **Validation:** runnable, package-scoped formatting, check, and test commands, plus any required manual checks.

State explicitly when configuration or side effects are absent. Update documentation in the same change as public behavior, API, configuration, usage, or development workflow changes; keep examples and validation commands current.

Record non-obvious constraints and design decisions in comments near the relevant code, explaining why they matter. Avoid narrating obvious implementation details.

## Pi APIs

Use the installed references to match the workspace's pi version:

- **Extension APIs:** before changing pi API usage, read [extensions](../node_modules/@earendil-works/pi-coding-agent/docs/extensions.md) and the relevant [examples](../node_modules/@earendil-works/pi-coding-agent/examples/extensions/README.md).
- **TUI:** before component or rendering work, also read [TUI components](../node_modules/@earendil-works/pi-coding-agent/docs/tui.md).

## Local loading

From the repository root, replace `example` with the existing extension directory:

```sh
pnpm exec pi --no-extensions -e ./packages/extensions/example
```

This loads the selected package with workspace pi and leaves global installation settings unchanged. `--no-extensions` disables extension auto-discovery; global settings and skills still apply. Restart after edits to reload this CLI-only extension path.
