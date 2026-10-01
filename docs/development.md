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

Each package declares its supported imports and dependencies; shared versions come from the workspace catalog.

### Package structure

Keep runtime code independent of package-local `validation/` fixtures. Across packages, import declared package names and subpaths rather than relative paths. See the boundary rules in [vite.config.ts](../vite.config.ts).

### Dependencies

Keep shared development tooling and Pi host packages in root `devDependencies`; declare package-specific dependencies locally. Use `workspace:*` for local packages and `catalog:` for external versions in [pnpm-workspace.yaml](../pnpm-workspace.yaml). Pi `peerDependencies` use `catalog:pi-host` to retain host-supplied versions independently of development versions.

Use `vp add --save-catalog`, `vp remove`, or `vp update`; include pnpm lockfile changes.

When updating Vite+, keep the direct `vite` alias and override aligned with `vp toolchain` for Vitest's pnpm peer dependency; let Vite+ select its transitive Vitest version.

### Pi extension entry points

Before editing extension manifests or Pi host or runtime dependencies, read the package documentation for the workspace's installed version through [Pi API references](pi-docs.md).

Keep the default Pi factory in `src/index.ts` and only this export in package-root `index.ts`:

```ts
export { default } from "./src/index.ts";
```

Set `pi.extensions` to `["./index.ts"]`; include the wrapper in `tsconfig.json` and checks. It gives local extensions their package directory name in Pi's compact startup list.

## Documentation

Correct inaccurate guidance and document what readers need to use or maintain the project. Keep entry documents short by moving task-specific detail, not by compressing facts into fragments. Purpose, practical setup, and constraints needed by all readers belong inline. Put substantial task-specific guidance behind a link that says when to follow it. Prefer source links over prose repeating implementation or configuration, but summarise the point inline before linking. Retain non-obvious rationale and observable limits.

Use one H1, sentence-case headings, consecutive heading levels, numbered procedures, bullets for unordered items, tables for lookup and comparison, and language-tagged fences. Give parent headings substantive text before subheadings; remove headings that add no structure.

### Writing for scanning

- Put one checkable claim in each bullet. Group related claims under a heading, ordered by phase (for example read, write, cleanup).
- State the normal behaviour before exceptions. Collect leftovers under a labelled "Edge cases" line, and use a table for flag or option matrices.
- Put the most important rule first. In contract lists, lead with invariants whose violation causes harm (trust, data loss, focus capture) under an explicit heading, and move cosmetic rules lower.
- Write full sentences with verbs and articles. Use a slash only for a true alternative such as read/write, and at most once per sentence.
- Keep one or two inline links per paragraph. Collect routing links into a "When you… / Read" table instead of prose.
- Define project terms on first use in user-facing docs; in maintainer docs, link the package `GLOSSARY.md` term on first use when the package has one.
- Write manual procedures as a setup line followed by a Do / Expect table with one observable result per row.
- State each rule in one place and link to it elsewhere. User-visible behaviour belongs in the README; maintainer docs link to it.
- Keep version-specific validation logs out of reference docs. Reduce them to one "Last verified against Pi x.y.z" line at the top of the compatibility doc, naming what was not covered. Label a version-specific host quirk with the version it was observed in.
- Use British spelling in prose. Preserve spelling in API names, settings, commands, and literal output.
- Replace stock assurances with observable behaviour. Omit sentences that only announce what a section will explain.

Emphasis convention: bold for keys (**Ctrl+O**), code for setting names and values (`summary`), and quotes for on-screen labels ("Explored"). Do not bold versions or mode names. Use headings or lookup tables instead of repeated bold labels at the start of bullets.

### Package READMEs

Each package README is written for users. Open with the problem it solves in one sentence, then one concrete example (output, a screenshot, or a command); put feature links after that. Include `Usage` for actual package steps, `Configuration` for choices not obvious from source, `Side effects` for important writes or requests, and `Validation` for package-specific checks or manual prerequisites, only when there is substantive content. Do not repeat generic extension-loading commands or workspace checks in every package. Move tool-author and implementation detail to `docs/`, or label the section by its audience.

Optional headings exist for substantive content only; omit a heading rather than fill it with boilerplate. In `docs/testing.md`, the coverage-boundary section names only what this package tests and links to the [workspace ownership rules](agents/testing.md#ownership) instead of restating them.

### Package instructions

Use a package `AGENTS.md` for non-obvious boundaries and conditional pointers to specialised guidance, not a mandatory inventory of source files or a repeat of the README. Maintain a Pi compatibility checklist when the package relies on Pi contracts that need rechecking on upgrade; do not require an empty checklist for packages without such contracts.

### Guides and references

Give each guide one primary task or topic and a link to its package or workspace entry document. Keep short, cohesive topics together; use headings only for content that benefits from separation.

Keep user guides in package `docs/`; existing `docs/testing.md`, `docs/pi-compatibility.md`, and `docs/validation.md` are maintainer references. Make that audience explicit in their titles or opening instructions. Shared-module READMEs address library callers; `.agents/` skills and `AGENTS.md` address coding agents.

Follow the [Pi link policy](pi-docs.md#linking-pi-documentation): published pages for users, installed references for agents checking pinned contracts. Fetch new external targets and check their anchors. Update incoming fragment links when renaming or removing headings.

When revising docs, compare inline-code tokens and numbers with the previous text, check that moved facts keep their conditions, and run link and formatting checks. Preserve verified example output and distinguish placeholders in templates from commands readers can run as written.

### Code comments

Explain non-obvious constraints and design decisions near the code; omit obvious implementation narration.

## Runtime validation

Use Zod for configuration, persisted JSON, external structured data, and option limits. Colocate schemas with their owner, derive owned types, and export shared contracts.

- Choose unknown-key and failure handling: settings may recover fields or reject everything; stored documents may retain unknown fields for recovery.
- Use parsed output for normalisation, but validate without replacement when preserving borrowed data or exact stored source.
- Limit original record sizes, including unknown fields.
- Hide raw validation errors that could expose stored content.

For Zod-based model-facing parameters, use [`toToolSchema`](../packages/libs/src/tool-schema/README.md) from `@pi-mono/libs/tool-schema`, not direct Zod-to-TypeBox conversion or local keyword stripping. Its explicit profile omits runtime metadata and unsupported integer bounds while rejecting unhandled keywords. State omitted constraints in descriptions (explicit integer bounds require one) and enforce full validation before side effects. Test serialized schemas and runtime rejection separately; valid arguments do not prove provider acceptance.

Schemas are unnecessary for control-flow narrowing, host capability checks, or invariants that depend on filesystem or lifecycle state.

## Pi APIs

Implement Pi changes through workspace extensions, preferring public APIs. Runtime monkey-patches may work around API limits. Never suggest or edit Pi core or upstream package files, including installed dependencies.

Namespace persisted custom entry and custom message `customType` identifiers as `<extension-package>.<entry-name>`, for example `pi-agent-summary.summary`. Define each identifier in its owning module and reuse it for writes, reads, and renderer registration. These identifiers are distinct from Pi-generated session record `id` values.

Find installed documentation and examples in [Pi API references](pi-docs.md).
