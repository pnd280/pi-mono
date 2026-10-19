# Workspace development

[Workspace overview](../README.md)

## Setup

Complete [workspace setup](../README.md#setup), then enable Git hooks:

```sh
vp hooks enable
```

The pre-commit hook rejects em dashes (U+2014) in staged text outside `.agents/skills/`; it does not run [focused checks](#focused-validation).

## Code and tooling

Vite+ runs formatting, lint, types, and tests through root [vite.config.ts](../vite.config.ts). Lint warnings fail checks. Tests follow the [runner convention](agents/testing.md#runner).

Fix implementation diagnostics without weakening shared checks; explain narrow exceptions.

| When you…                                                                                                          | Read                                               |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Validate configuration, persisted JSON, external data, or tool parameters                                          | [Runtime validation](agents/runtime-validation.md) |
| Change Pi behaviour or use Pi APIs, patch Pi, gate a host hook, name a custom entry or message, or notify the user | [Pi API contracts](agents/pi-apis.md)              |

## Focused validation

Run checks from the repository root. Tests require Bash and Git. FIFO tests on Unix also require `mkfifo`, and Linux ACL tests require `getfacl` and `setfacl`.

Use `vpr` (`vp run`) with the package's `package.json` name:

```sh
vpr '<package-name>#check'
vpr '<package-name>#test'
```

Check formatting with `vpr '<package-name>#format' --check` or lint with `vpr '<package-name>#lint'`.

Workspace commands:

| Command                  | Scope                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `vpr check`              | Formatting, linting, type checking, `docs:check`, and `fingerprints:check`                                                       |
| `vpr docs:check`         | Markdown links and anchors, inline prototype member names, "Last verified" lines, bold bullet labels, and testing-guide sections |
| `vpr fingerprints:check` | [Host fingerprints](../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints) of private Pi methods      |
| `vpr test`               | All tests in one Vitest invocation                                                                                               |
| `vpr lint`               | Linting and type checking                                                                                                        |
| `vp fmt --check`         | Formatting without writes                                                                                                        |
| `vp fmt`                 | Apply formatting                                                                                                                 |

Use `vpr check` for the repository's `stylish` lint format; the built-in `vp check` does not support custom output formats.

### Test caching

Package tests are uncached by default. If investigating cache misses, run `vpr -r --cache test` twice and inspect `vp run --last-details`. Mutable workspace fixtures can invalidate cache inputs; see [filesystem fixtures](agents/testing.md#filesystem-fixtures).

## Packages and dependencies

Each package declares its supported imports and dependencies; shared versions come from the workspace catalog.

### Package structure

Keep runtime code independent of package-local `validation/` fixtures. Across packages, import declared package names and subpaths rather than relative paths. See the boundary rules in [vite.config.ts](../vite.config.ts).

### Dependencies

Keep shared development tooling and Pi host packages in root `devDependencies`; declare package-specific dependencies locally. Use `workspace:*` for local packages and `catalog:` for external versions in [pnpm-workspace.yaml](../pnpm-workspace.yaml). Pi `peerDependencies` use `catalog:pi-host` to retain host-supplied versions independently of development versions.

Runtime code can import only the host entry points that Pi supplies to installed extensions: the `@earendil-works/pi-ai` root, `/compat`, `/oauth`, and `/providers/all`; the roots of `@earendil-works/pi-agent-core`, `@earendil-works/pi-tui`, and `@earendil-works/pi-coding-agent`; and `typebox` with `/compile` and `/value`. Inside the workspace, other subpaths resolve to the development copy in `node_modules`, so lint rejects value imports of them in runtime code. Type imports are allowed, because TypeScript removes them before Pi runs the code. Worker files get none of these entry points, because Node loads them without Pi's loader. The [release check](#release-branch) finds the failures that lint misses.

Use `vp add --save-catalog`, `vp remove`, or `vp update`; include pnpm lockfile changes.

When updating Vite+, keep the direct `vite` alias and override aligned with `vp toolchain` for Vitest's pnpm peer dependency; let Vite+ select its transitive Vitest version.

### Pi extension entry points

Before editing extension manifests or Pi host or runtime dependencies, read the package documentation for the workspace's installed version through [Pi API references](agents/pi-docs.md).

Keep the default Pi factory in `src/index.ts` and only this export in package-root `index.ts`:

```ts
export { default } from "./src/index.ts";
```

Set `pi.extensions` to `["./index.ts"]`; include the wrapper in `tsconfig.json` and checks. It gives local extensions their package directory name in Pi's compact startup list.

### Release branch

Users [install](../README.md#install) the generated `release` branch. Pull requests run [check.yml](../.github/workflows/check.yml). On each push to `master`, [release.yml](../.github/workflows/release.yml) runs the same checks first. When they pass, its `release` job builds the tree with [build-release.ts](../.scripts/build-release.ts) and commits it to `release` when the tree changed. The job never force-pushes, so commits that users installed stay available.

To release a version, raise `version` in the root `package.json`. The job tags the first `release` commit that has a version `v<version>`, if that tag does not exist yet. Tags never move, so a tag always names the same build. A push without a version change moves only the branch.

The build includes every package under `packages/` and `packages/extensions/`, so a new extension needs no release change. `pnpm pack` replaces the `workspace:` and `catalog:` specifiers, which npm rejects. The build removes tests, `validation/` fixtures, `AGENTS.md`, `tsconfig.json`, scripts, and development dependencies. Then it installs a copy outside the workspace with Pi's npm command and starts the Pi CLI with every extension and an offline model. An extension that fails to load fails the job. The offline model also starts both worker threads from the installed copy, because print mode never starts them, and it fails the job when one does not answer.

Must not regress ([testing policy](agents/testing.md#coverage)):

- **High, e2e:** In an installed copy of the release tree, the bounded-diff and pi-prompt-manager collection workers start and return a result. Otherwise, pi-agent-summary and pi-tool-display show no diffs, and pi-prompt-manager can't read or write collections of 1 MiB or more.

To inspect the tree, run `node .scripts/build-release.ts`. It writes `.tmp/release` and needs network access for npm.

## Documentation

Correct inaccurate guidance and document what readers need to use or maintain the project. Keep entry documents short by moving task-specific detail, not by compressing facts into fragments. Purpose, practical setup, and constraints needed by all readers belong inline. Put substantial task-specific guidance behind a link that says when to follow it. Prefer source links over prose repeating implementation or configuration, but summarise the point inline before linking. Retain non-obvious rationale and observable limits.

Use one H1, sentence-case headings, consecutive heading levels, numbered procedures, bullets for unordered items, tables for lookup and comparison, and language-tagged fences. Give parent headings substantive text before subheadings; remove headings that add no structure.

### Writing for scanning

- Put one checkable claim in each bullet. Group related claims under a heading, ordered by phase (for example read, write, cleanup).
- State the normal behaviour before exceptions. Collect leftovers under a labelled "Edge cases" line, and use a table for flag or option matrices.
- Put the most important rule first. In contract lists, lead with invariants whose violation causes harm (trust, data loss, focus capture) under an explicit heading, and move cosmetic rules lower.
- Write full sentences with verbs and articles. Use a slash only for a true alternative such as read/write, and at most once per sentence.
- Keep one or two inline links per paragraph, and make each link label name what its target holds. Collect routing links into a "When you… / Read" table instead of prose.
- Define project terms on first use in user-facing docs; in maintainer docs, link the package `GLOSSARY.md` term on first use when the package has one.
- Write manual procedures as a setup line followed by a Do / Expect table. Each Expect cell names what the tester sees, such as "The footer shows two rows", never "It works". Merge a row into the row before when it repeats that row's action or result.
- State each rule in one place and link to it elsewhere. User-visible behaviour belongs in the README or the user guide that it links; maintainer and tool-author docs link there. A callback contract belongs only in the tool-author reference.
- A README section that summarises a guide gives the user-visible outcome in one or two sentences and links the guide for the conditions. A glossary entry defines the term and links the guide that owns its behaviour, without restating rules or limits.
- Keep version-specific validation logs out of reference docs and ADRs. Start the compatibility doc with one "Last verified against Pi x.y.z" line: the method in one clause, then "Not covered:" and the gaps. Put the line directly under the title and intro, in the form `> Last verified against Pi x.y.z with <method>. Not covered: <gap>, <gap>, and <gap>.`, and separate gaps that contain commas with semicolons. Put source-diff results and host quirks under `## Limitations`, labelled with the Pi version they were observed in. An ADR keeps the evidence for its decision; record later upgrade checks in the compatibility doc.
- Use British spelling in prose. Preserve spelling in API names, settings, commands, and literal output.
- Replace stock assurances with observable behaviour. Omit sentences that only announce what a section will explain.

Emphasis convention: bold for keys (**Ctrl+O**), code for setting names and values (`summary`), and quotes for on-screen labels ("Explored"). Do not bold versions or mode names. Use headings or lookup tables instead of repeated bold labels at the start of bullets. The one exception is the severity and layer label, such as `**Critical, e2e:**`, that starts each invariant in a "Must not regress" list of the [testing policy](agents/testing.md#coverage).

### Package READMEs

Write each package README for users. Open with the problem it solves in one sentence, then one concrete example (output, a screenshot, a command, or, for an extension that the model drives, a prompt); put feature links after that. Include `Usage` for actual package steps, `Configuration` for choices not obvious from source, `Side effects` for important writes or requests, and `Validation` for package-specific checks or manual prerequisites, only when there is substantive content. Do not repeat generic extension-loading commands or workspace checks in every package. Move tool-author and implementation detail to `docs/`, or label the section by its audience. When a section is a rule list longer than one screen, keep a short summary and an example in the README, and move the list to `docs/<topic>.md` with a "When you… / Read" row.

User docs (the README and the user guides that it links) state what the user sees and every limit that applies. Keep coordinator ranks, lifecycle phases, renderer-author budgets, and the names of shared modules, classes, listeners, and hooks in maintainer docs, tool-author docs, or `AGENTS.md`. When a user-visible rule comes from a shared module or is stated only in a maintainer reference, state it in the user doc; link the source only as detail for callers or maintainers.

Optional headings exist for substantive content only; omit a heading rather than fill it with boilerplate. Package `docs/testing.md` files follow the [package testing guide](agents/testing.md#package-testing-guide).

### Package instructions

A package `AGENTS.md` is optional. Add one for non-obvious boundaries and conditional pointers to specialised guidance, not for an inventory of source files or a repeat of the README. State each instruction once, and link the README or the compatibility doc for its reason.

Maintain a Pi compatibility checklist when the package relies on Pi contracts that need rechecking on upgrade; do not require an empty checklist for packages without such contracts. Give each checkbox one Pi contract, as a sentence that names the contract and its expected result, so that a maintainer can confirm it as true or false. Put rationale and failure behaviour in prose under the same heading as the checkbox, and link user-visible behaviour instead of restating it.

### Guides and references

Give each guide one primary task or topic and a link to its package or workspace entry document. Keep short, cohesive topics together; use headings only for content that benefits from separation.

Keep user guides in package `docs/`; existing `docs/testing.md`, `docs/pi-compatibility.md`, and `docs/validation.md` are maintainer references. Make that audience explicit in their titles or opening instructions. Shared-module and adapter READMEs address library callers and maintainers; `.agents/` skills and `AGENTS.md` address coding agents.

A shared-module README opens with the caller's problem, then names the entry point once. Put module behaviour, including what the module does not do, under "Behaviour". "Caller responsibilities" holds only imperative caller duties. Put ownership pointers in one "Related" sentence.

Follow the [Pi link policy](agents/pi-docs.md#linking-pi-documentation): published pages for users, installed references for agents checking pinned contracts. Fetch new external targets and check their anchors. Update incoming fragment links when renaming or removing headings.

When revising docs, compare inline-code tokens and numbers with the previous text, check that moved facts keep their conditions, and run link and formatting checks. Preserve verified example output and distinguish placeholders in templates from commands readers can run as written.

### Code comments

Explain non-obvious constraints and design decisions near the code; omit obvious implementation narration.
