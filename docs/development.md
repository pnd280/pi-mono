# Workspace development

[Workspace overview](../README.md)

## Setup

Complete [workspace setup](../README.md#setup), then enable Git hooks:

```sh
vp hooks enable
```

The pre-commit hook rejects em dashes (U+2014) in staged text; it does not run [focused checks](#focused-validation).

## Code and tooling

Vite+ runs formatting, lint, types, and tests through root [vite.config.ts](../vite.config.ts), also discovered from package directories. Lint warnings fail checks.

Each package under `packages/` provides `lint`, `check`, `test`, and `format`. `check` checks formatting, then runs `lint` for linting and types. Tests follow the shared [runner convention](agents/testing.md#runner).

Fix implementation diagnostics without weakening shared checks; explain narrow exceptions.

## Focused validation

Run checks from the repository root. Tests require Bash and Git; Unix file-preview and Linux prompt-storage tests also require `mkfifo`. Linux ACL tests require `getfacl` and `setfacl`.

Use `vpr` (`vp run`) with the package's `package.json` name:

```sh
vpr '<package-name>#check'
vpr '<package-name>#test'
```

For individual checks, use `vpr '<package-name>#format' --check` or `vpr '<package-name>#lint'`. Select packages by pattern, dependency, or dependent with `vpr --filter <pattern> <task>`.

Workspace commands:

| Command          | Scope                                  |
| ---------------- | -------------------------------------- |
| `vpr check`      | Formatting, linting, and type checking |
| `vpr test`       | All tests in one Vitest invocation     |
| `vpr lint`       | Linting and type checking              |
| `vp fmt --check` | Formatting without writes              |
| `vp fmt`         | Apply formatting                       |

Use `vpr check` for the repository's `stylish` lint format; the built-in `vp check` does not support custom output formats.

### Test caching

Package test scripts are uncached by default. Use `vpr --no-cache '<package-name>#test'` to force execution.

To verify caching:

1. Run `vpr -r --cache test` twice without changing inputs.
2. Inspect cache hits and misses with `vp run --last-details`. For fixture-related misses, see [filesystem fixtures](agents/testing.md#filesystem-fixtures).

## Packages and dependencies

### Package structure

- Set a unique name, `"private": true`, and `"type": "module"` in `package.json`. Use `@pi-mono/<package-name>` for internal packages and extension names such as `pi-fff-guard` for extensions.
- Put TypeScript in `src/` and offline launchers/providers in package-local `validation/`. Runtime code must not import validation code. Discover validation tests in root and package suites.
- Extend [tsconfig.base.json](../tsconfig.base.json) in each package's `tsconfig.json`, including source, tests, and validation fixtures.
- Declare supported entry points in `exports`. Use declared package names and subpaths across packages; keep relative imports within a package.

### Dependencies

Keep shared development tooling and Pi host packages in root `devDependencies`; declare package-specific dependencies locally. Use `workspace:*` for local packages and `catalog:` for shared versions in [pnpm-workspace.yaml](../pnpm-workspace.yaml).

Use `vp add`, `vp remove`, or `vp update`; include pnpm lockfile changes.

Keep the direct `vite` alias for Vitest's pnpm peer dependency. `vite-plus` supplies `vitest` transitively; let it select the matching version instead of pinning or overriding Vitest separately. On Vite+ updates, align the `vite` alias and override with `vp toolchain`.

### Pi extension entry points

Before editing extension manifests or Pi host/runtime dependencies, read the installed [package documentation](../node_modules/@earendil-works/pi-coding-agent/docs/packages.md).

Keep the default Pi factory in `src/index.ts` and only this export in package-root `index.ts`:

```ts
export { default } from "./src/index.ts";
```

Set `pi.extensions` to `["./index.ts"]`; include the wrapper in `tsconfig.json` and checks. It gives local extensions their package directory name in Pi's compact startup list.

## Documentation

Update inaccurate guidance and add information readers need to use or maintain the project. Omit self-explanatory code/configuration details. Keep entry documents task-focused, essential prerequisites and constraints inline, and details in canonical references.

Use one H1, sentence-case headings, consecutive heading levels, numbered procedures, bullets for unordered items, tables for lookup/comparison, and language-tagged fences.

### Package READMEs

Every package needs a short `README.md` opening with its purpose and when to use it, followed by these H2 sections:

| Section       | Content                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| Usage         | Package instructions and necessary examples; no generic extension-loading commands.                                  |
| Configuration | Options, environment variables, and defaults. State when absent.                                                     |
| Side effects  | Observable writes, persistent state changes, network requests, or explicitly none.                                   |
| Validation    | [Focused commands](#focused-validation) with the package name, or runnable package commands; required manual checks. |

Add sections such as `Compatibility` as needed.

### Package instructions

Every package needs an `AGENTS.md` with `Code navigation`, `Constraints`, and `Validation` sections. Separate source locations from package-wide rules; link to the README and shared conventions rather than duplicate them.

Every package also needs a `docs/pi-compatibility.md` checklist covering Pi contracts to verify, limitations and replacement opportunities, and validation.

### Guides and references

Give each guide one primary task/topic and a link to its package or workspace entry document. Keep short, cohesive topics together. Component references use `Behavior`, `Caller responsibilities`, optional `Usage`, and a separate `Validation` section.

Update incoming fragment links when renaming or removing headings.

### Code comments

Explain non-obvious constraints and design decisions near the code; omit obvious implementation narration.

## Runtime validation

Use Zod for configuration, persisted JSON, external structured data, and option limits. Colocate schemas with their owner, derive owned types, and export shared contracts.

- Choose unknown-key and failure handling: settings may recover fields or reject everything; stored documents may retain unknown fields for recovery.
- Use parsed output for normalization, but validate without replacement when preserving borrowed data or exact stored source.
- Limit original record sizes, including unknown fields.
- Hide raw validation errors that could expose stored content.

For Zod-based model-facing parameters, use [`toToolSchema`](../packages/libs/src/tool-schema/README.md) from `@pi-mono/libs/tool-schema`, not direct Zod-to-TypeBox conversion or local keyword stripping. Its explicit profile omits runtime metadata and unsupported integer bounds while rejecting unhandled keywords. State omitted constraints in descriptions (explicit integer bounds require one) and enforce full validation before side effects. Test serialized schemas and runtime rejection separately; valid arguments do not prove provider acceptance.

Schemas are unnecessary for control-flow narrowing, host capability checks, or state-dependent filesystem/lifecycle invariants.

## Pi APIs

Implement Pi changes through workspace extensions, preferring public APIs. Runtime monkey-patches may work around API limits. Never suggest or edit Pi core or upstream package files, including installed dependencies.

Find installed documentation and examples in [Pi API references](pi-docs.md).
