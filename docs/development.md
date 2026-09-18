# Workspace development

[Workspace overview](../README.md)

## Setup

Complete [workspace setup](../README.md#setup), then enable the repository's Git hooks:

```sh
vp hooks enable
```

The pre-commit hook rejects em dashes (U+2014) in staged text files. Run the [focused checks](#focused-validation) separately; the hook does not run them.

## Code and tooling

Vite+ runs formatting, linting, type checking, and tests through the root [vite.config.ts](../vite.config.ts). It discovers this configuration when run from a package directory. Checks fail on warnings.

Every workspace package provides `lint`, `check`, `test`, and `format` scripts. `check` checks formatting, then runs `lint` for linting and type checking. Tests use the shared [runner convention](agents/testing.md#runner).

Fix diagnostics in the implementation. Preserve shared checks and explain any narrow exception.

## Focused validation

Run checks from the repository root. Tests require Bash and Git. File-preview tests on Unix and prompt-storage tests on Linux also require `mkfifo`. Linux ACL tests require `getfacl` and `setfacl`.

Use `vpr` (shorthand for `vp run`) and `<package-name>#<task>` to target a package by its `package.json` name:

```sh
vpr '<package-name>#check'
vpr '<package-name>#test'
```

For formatting or linting alone, use `vpr '<package-name>#format' --check` or `vpr '<package-name>#lint'`. Use `vpr --filter <pattern> <task>` to select packages by pattern, dependency, or dependent.

For workspace-wide changes, use:

| Command          | Scope                                             |
| ---------------- | ------------------------------------------------- |
| `vpr check`      | Formatting, linting, and type checking everywhere |
| `vp test run`    | All workspace tests                               |
| `vpr lint`       | Linting and type checking only                    |
| `vp fmt --check` | Formatting only, without writes                   |
| `vp fmt`         | Apply formatting                                  |

`vpr check` uses the repository's `stylish` lint format. `vp check` invokes Vite+'s built-in command, which does not support custom output formats.

## Packages and dependencies

### Package structure

- Use a unique `package.json` name, `"private": true`, and `"type": "module"`. Name internal packages `@pi-mono/<package-name>` (for example, `@pi-mono/utils`). Extension packages retain their extension names (for example, `pi-fff-guard`).
- Put TypeScript source in `src/`.
- Keep offline launchers and providers in package-local `validation/`. Runtime modules must not import validation code. Include validation tests in both root and package-scoped test discovery.
- Give each package a `tsconfig.json` extending [tsconfig.base.json](../tsconfig.base.json) and including its source, tests, and validation fixtures.
- Declare supported entry points in `exports`. Import other workspace packages by their declared name and exported subpaths. Keep relative imports within a single package.

### Dependencies

Keep shared development tooling and Pi host packages in the root `devDependencies`. Declare package-specific dependencies in the package that uses them. Use `workspace:*` for local packages and `catalog:` for shared external versions in [pnpm-workspace.yaml](../pnpm-workspace.yaml).

Update dependencies with `vp add`, `vp remove`, or `vp update` and include the resulting pnpm lockfile changes.

Keep the direct `vite` alias to satisfy Vitest's peer dependency under pnpm. `vite-plus` supplies `vitest` transitively. When updating Vite+, align the alias, `vitest` catalog pin, and overrides with the versions reported by `vp toolchain`.

### Pi extension entry points

Before editing extension manifests or Pi host or runtime dependencies, read the installed [package documentation](../node_modules/@earendil-works/pi-coding-agent/docs/packages.md).

Keep the default Pi factory in `src/index.ts`. A package-root `index.ts` must contain only:

```ts
export { default } from "./src/index.ts";
```

Set `pi.extensions` to `["./index.ts"]` and include the wrapper in `tsconfig.json` and package checks. The wrapper gives local extensions their package directory name in Pi's compact startup list.

## Documentation

- Update documentation when existing guidance becomes inaccurate or readers need new information to use or maintain the project.
- Do not duplicate self-explanatory code or configuration details.
- Use progressive disclosure: keep entry documents concise and task-focused, retain essential prerequisites and constraints inline, and link to canonical references for details.
- Use one level-one title per document, sentence-case headings, and consecutive heading levels. Use numbered lists for ordered procedures, bullets for unordered items, and tables for comparisons or lookup. Give code fences a language.

### Package READMEs

Every workspace package must have a short `README.md`. State what the package does and when to use it in the opening paragraph. Include these level-two sections:

| Section       | Required content                                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usage         | Package-specific instructions and integration examples where needed. Omit generic extension-loading commands.                                                                    |
| Configuration | Available options, environment variables, and defaults.                                                                                                                          |
| Side effects  | Observable effects such as file writes, persistent state changes, or network requests.                                                                                           |
| Validation    | Link to the [focused validation commands](#focused-validation) with the package's `package.json` name, or give runnable package-scoped commands. Include required manual checks. |

Add sections such as `Compatibility` when needed.

State explicitly when configuration or side effects are absent.

### Package instructions

Every workspace package must have an `AGENTS.md` with `Code navigation`, `Constraints`, and `Validation` sections. Use navigation for source locations and constraints for package-wide development rules. Link to the package README and shared conventions instead of duplicating them.

### Guides and references

Give each guide a primary task or reference topic and link back to its package or workspace entry document. Keep short, cohesive topics together rather than splitting them to fit a template. Component references use `Behavior`, `Caller responsibilities`, optional `Usage` examples, and `Validation` sections. Keep validation links under their own heading.

When renaming or removing a heading, update incoming fragment links in the same change.

### Code comments

Record non-obvious constraints and design decisions in comments near the relevant code, explaining why they matter. Avoid narrating obvious implementation details.

## Runtime validation

Use Zod to validate configuration, persisted JSON, external structured data, and option limits. Keep schemas with the owning module and derive owned data types from them. Share schemas through package exports when multiple consumers need the same contract.

- Choose how to handle unknown keys and validation failures. Settings may recover individual fields or reject the whole configuration. Stored documents may retain unknown fields for recovery.
- Use parsed output for normalization. When a contract requires preserving borrowed data or exact stored source, validate without replacing it.
- Apply size limits to the original record, including unknown fields.
- Do not show raw validation errors to users if they could reveal stored content.

Control-flow narrowing, host capability checks, and state-dependent filesystem or lifecycle invariants do not need schemas.

## Pi APIs

Implement Pi customizations and fixes through workspace extensions, preferring public Pi APIs. Extensions may monkey-patch Pi internals at runtime to work around API limitations. Never suggest or apply edits to Pi core source or upstream package files, including installed dependencies.

Use the [Pi API references](pi-docs.md) to find installed documentation and examples.
