# Package development

## Code and tooling

Vite+ owns formatting, linting, type checking, and test execution through the root [vite.config.ts](../vite.config.ts). Checks fail on warnings.

Every workspace package provides scoped `check`, `test`, and `format` scripts. Tests use the shared [runner convention](agents/testing.md#runner).

Resolve diagnostics in the implementation, preserving shared checks and explaining any necessary narrow exception.

## Focused validation

Use `vpr` (the shorthand for `vp run`) and `<package-name>#<task>` to target an exact manifest name:

```sh
vpr '<package-name>#format' --check
vpr '<package-name>#check'
vpr '<package-name>#test'
```

Use `vpr --filter <pattern> <task>` for package patterns or dependency/dependent selection.

For workspace-wide changes, run `vp check` and `vp test run` at the repository root to include root-level files and all packages. Use `vp fmt --check` to check repository formatting without writes, or `vp fmt` to format it.

## Packages and dependencies

- **Manifest:** use a unique name, `"private": true`, and `"type": "module"`.
- **Source:** use TypeScript under `src/`. Give each package a `tsconfig.json` extending [tsconfig.base.json](../tsconfig.base.json) and including its source and tests. Vite+ discovers the shared root configuration from the package's working directory.
- **Dependencies:** keep shared development tooling and Pi host packages in the root `devDependencies`; declare package-specific dependencies in the owning package. Use `workspace:*` for local packages and `catalog:` for shared external versions. Update dependencies with `vp add`, `vp remove`, or `vp update` and include the resulting pnpm lockfile changes.
- **Vite+ dependencies:** keep the direct `vite` alias to satisfy Vitest's peer dependency under pnpm. `vite-plus` supplies `vitest` transitively. When updating Vite+, align the alias, `vitest` catalog pin, and overrides with the versions reported by `vp toolchain`.
- **Package API:** declare supported entry points in `exports`. Import other workspace packages by their declared name and exported subpaths; keep relative imports inside the owning package.
- **Pi packages:** before editing extension manifests or host/runtime dependencies, read the installed [package documentation](../node_modules/@earendil-works/pi-coding-agent/docs/packages.md). Keep the default pi factory in `src/index.ts`. A package-root `index.ts` must contain only `export { default } from "./src/index.ts";`, and `pi.extensions` must list only `./index.ts`. This gives local extensions their package directory name in Pi's compact startup list. Include the wrapper in `tsconfig.json` and the package's `check` script.

## Documentation

Use progressive disclosure: keep entry documents concise and task-focused, retain essential prerequisites and constraints inline, and link to canonical references for details. Keep short, cohesive topics together.

Every workspace package must have a short `README.md` covering:

- **Purpose:** what the package does and when to use it.
- **Usage:** package-specific operation and integration examples where needed. Omit generic extension-loading commands.
- **Configuration:** available options, environment variables, and defaults.
- **Side effects:** observable effects such as file writes, persistent state changes, or network requests.
- **Validation:** a link to the [focused validation commands](#focused-validation) with the package's manifest name, or equivalent runnable package-scoped commands, plus any required manual checks.

State explicitly when configuration or side effects are absent. Update documentation in the same change as public behavior, API, configuration, usage, or development workflow changes.

Every workspace package must have an `AGENTS.md` covering package-specific constraints, code navigation, and development or validation instructions. Link to the package README and shared conventions instead of duplicating them.

Record non-obvious constraints and design decisions in comments near the relevant code, explaining why they matter. Avoid narrating obvious implementation details.

## Pi APIs

Implement Pi customizations and fixes through workspace extensions, preferring public Pi APIs. Extensions may monkey-patch Pi internals at runtime to work around API limitations. Never suggest or apply edits to Pi core source or upstream package files, including installed dependencies.

If you are not the Pi coding agent (`echo $PI_CODING_AGENT` is not `true`), read [pi-docs.md](pi-docs.md).
