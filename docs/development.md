# Workspace development

[Workspace overview](../README.md)

## Setup

Complete [workspace setup](../README.md#setup), then enable Git hooks:

```sh
vp hooks enable
```

The pre-commit hook rejects em dashes (U+2014) in staged text; it does not run [focused checks](#focused-validation).

## Code and tooling

Vite+ runs formatting, lint, types, and tests through root [vite.config.ts](../vite.config.ts). Lint warnings fail checks. Tests follow the [runner convention](agents/testing.md#runner).

Fix implementation diagnostics without weakening shared checks; explain narrow exceptions.

## Focused validation

Run checks from the repository root. Tests require Bash and Git; Unix file-preview and Linux prompt-storage tests also require `mkfifo`. Linux ACL tests require `getfacl` and `setfacl`.

Use `vpr` (`vp run`) with the package's `package.json` name:

```sh
vpr '<package-name>#check'
vpr '<package-name>#test'
```

Check formatting with `vpr '<package-name>#format' --check` or lint with `vpr '<package-name>#lint'`.

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

Package tests are uncached by default. If investigating cache misses, run `vpr -r --cache test` twice and inspect `vp run --last-details`. Mutable workspace fixtures can invalidate cache inputs; see [filesystem fixtures](agents/testing.md#filesystem-fixtures).

## Packages and dependencies

### Package structure

Keep runtime code independent of package-local `validation/` fixtures. Across packages, import declared package names and subpaths rather than relative paths. See the boundary rules in [vite.config.ts](../vite.config.ts).

### Dependencies

Keep shared development tooling and Pi host packages in root `devDependencies`; declare package-specific dependencies locally. Use `workspace:*` for local packages and `catalog:` for external versions in [pnpm-workspace.yaml](../pnpm-workspace.yaml). Pi `peerDependencies` use `catalog:pi-host` to retain host-supplied versions independently of development versions.

Use `vp add --save-catalog`, `vp remove`, or `vp update`; include pnpm lockfile changes.

When updating Vite+, keep the direct `vite` alias and override aligned with `vp toolchain` for Vitest's pnpm peer dependency; let Vite+ select its transitive Vitest version.

### Pi extension entry points

Before editing extension manifests or Pi host/runtime dependencies, read the installed [package documentation](../node_modules/@earendil-works/pi-coding-agent/docs/packages.md).

Keep the default Pi factory in `src/index.ts` and only this export in package-root `index.ts`:

```ts
export { default } from "./src/index.ts";
```

Set `pi.extensions` to `["./index.ts"]`; include the wrapper in `tsconfig.json` and checks. It gives local extensions their package directory name in Pi's compact startup list.

## Documentation

Correct inaccurate guidance and document what readers need to use or maintain the project. Keep entry documents short: purpose, practical setup, and constraints needed by all readers belong inline. Put substantial task-specific guidance behind a link that says when to follow it. Prefer source links over prose repeating implementation or configuration; retain non-obvious rationale and observable limits.

Use one H1, sentence-case headings, consecutive heading levels, numbered procedures, bullets for unordered items, tables for lookup/comparison, and language-tagged fences.

### Package READMEs

Each package README states its purpose and when to use it. Include `Usage` for actual package steps, `Configuration` for choices not obvious from source, `Side effects` for important writes or requests, and `Validation` for package-specific checks or manual prerequisites, only when there is substantive content. Do not repeat generic extension-loading commands or workspace checks in every package.

### Package instructions

Use a package `AGENTS.md` for non-obvious boundaries and conditional pointers to specialized guidance, not a mandatory inventory of source files or a repeat of the README. Maintain a Pi compatibility checklist when the package relies on Pi contracts that need rechecking on upgrade; do not require an empty checklist for packages without such contracts.

### Guides and references

Give each guide one primary task or topic and a link to its package or workspace entry document. Keep short, cohesive topics together; use headings only for content that benefits from separation.

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

Namespace persisted custom entry and custom message `customType` identifiers as `<extension-package>.<entry-name>`, for example `pi-agent-summary.summary`. Define each identifier in its owning module and reuse it for writes, reads, and renderer registration. These identifiers are distinct from Pi-generated session record `id` values.

Find installed documentation and examples in [Pi API references](pi-docs.md).
