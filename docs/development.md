# Package development

## Code and tooling

Every workspace package exposes these scripts, scoped to its own files:

- `check`: Oxlint's combined lint and TypeScript diagnostics, with warnings failing through the shared configuration.
- `test`: a non-watch Vitest runner.
- `format`: Oxfmt formatting, accepting `--check` for validation without writes.

Invoke package scripts instead of calling Oxlint or Oxfmt directly. Resolve diagnostics in the implementation, preserving shared checks and explaining any necessary narrow exception.

## Focused validation

Filter by exact manifest name:

```sh
pnpm --filter '<package-name>' format --check
pnpm --filter '<package-name>' check
pnpm --filter '<package-name>' test
```

Root `check`, `test`, and `format` commands recurse through workspace packages; they do not check root-level files. Reserve them for workspace-wide impact. To check formatting of root-level files, pass their absolute paths to a package's `format --check` script; Oxfmt rejects paths containing `..`.

## Packages and dependencies

- **Manifest:** use a unique name, `"private": true`, and `"type": "module"`.
- **Source:** use TypeScript under `src/`. Give each package a `tsconfig.json` extending [tsconfig.base.json](../tsconfig.base.json) and including its source and tests. Its scripts must apply the shared lint and format configs from the package's working directory.
- **Dependencies:** keep shared development tooling and Pi host packages in the root `devDependencies`; declare package-specific dependencies in the owning package. Use `workspace:*` for local packages and `catalog:` for shared external versions. Update dependencies with pnpm and include the resulting lockfile changes.
- **Package API:** declare supported entry points in `exports`. Import other workspace packages by their declared name and exported subpaths; keep relative imports inside the owning package.
- **Pi packages:** before editing extension manifests or host/runtime dependencies, read the installed [package documentation](../node_modules/@earendil-works/pi-coding-agent/docs/packages.md). Keep the default pi factory in `src/index.ts`. A package-root `index.ts` must contain only `export { default } from "./src/index.ts";`, and `pi.extensions` must list only `./index.ts`. This gives local extensions their package directory name in Pi's compact startup list. Include the wrapper in `tsconfig.json` and the package's `check` script.

## Documentation

Every workspace package must have a short `README.md` covering:

- **Purpose:** what the package does and when to use it.
- **Usage:** package-specific operation and integration examples where needed; refer to `package.json` for declared entry points.
- **Configuration:** available options, environment variables, and defaults.
- **Side effects:** observable effects such as file writes, persistent state changes, or network requests.
- **Validation:** a link to the [focused validation commands](#focused-validation) with the package's manifest name, or equivalent runnable package-scoped commands, plus any required manual checks.

State explicitly when configuration or side effects are absent. Update documentation in the same change as public behavior, API, configuration, usage, or development workflow changes.

Every workspace package must have an `AGENTS.md` covering package-specific constraints, code navigation, and development or validation instructions. Link to the package README and shared conventions instead of duplicating them.

Record non-obvious constraints and design decisions in comments near the relevant code, explaining why they matter. Avoid narrating obvious implementation details.

## Pi APIs

Implement Pi customizations and fixes through workspace extensions, preferring public Pi APIs. Extensions may monkey-patch Pi internals at runtime to work around API limitations. Never suggest or apply edits to Pi core source or upstream package files, including installed dependencies.

If you are not the Pi coding agent (`echo $PI_CODING_AGENT` is not `true`), read [pi-docs.md](pi-docs.md).
