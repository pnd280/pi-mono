# Workspace development

[Workspace overview](../README.md)

## Setup

Complete [workspace setup](../README.md#setup).

## Code and tooling

Vite+ runs formatting, lint, types, and tests through root [vite.config.ts](../vite.config.ts). Lint warnings fail checks. Tests follow the [runner convention](agents/testing.md#runner).

Packages extend the compiler options in [tsconfig.base.json](../tsconfig.base.json). The root [tsconfig.json](../tsconfig.json) applies them to `.scripts/`, the pi-update scripts, and `vite.config.ts`.

Fix implementation diagnostics without weakening shared checks; explain narrow exceptions.

## Focused validation

Run checks from the repository root. Tests require Bash and Git. FIFO tests on Unix also require `mkfifo`, and Linux ACL tests require `getfacl` and `setfacl`.

Use `vpr` (`vp run`) with the package's `package.json` name:

```sh
vpr '<package-name>#check'
vpr '<package-name>#test'
```

Check formatting with `vpr '<package-name>#format' --check` or lint with `vpr '<package-name>#lint'`.

To run one-off TypeScript against workspace source, put a `*.test.ts` file in a `.tmp/<probe>/` directory and run `vp test run --root .tmp/<probe> --silent=false`. Plain `node` strips types only, so it rejects workspace code that uses TypeScript-only syntax, such as parameter properties.

Workspace commands:

| Command                  | Scope                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vpr check`              | Formatting, linting, type checking, `docs:check`, `fingerprints:check`, and `lockfile:check`                                                                                                                  |
| `vpr docs:check`         | Markdown links and anchors, inline prototype member names, "Last verified" lines, bold bullet labels, testing-guide sections, extension README `jsonc` blocks, and the extension count in the README and hero |
| `vpr fingerprints:check` | [Host fingerprints](../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints) of private Pi methods                                                                                   |
| `vpr lockfile:check`     | One lockfile snapshot for each Pi host package                                                                                                                                                                |
| `vpr test`               | All tests in one Vitest invocation                                                                                                                                                                            |
| `vpr test:count`         | The number of tests and test files in each package, without running them                                                                                                                                      |
| `vpr lint`               | Linting and type checking                                                                                                                                                                                     |
| `vp fmt --check`         | Formatting without writes                                                                                                                                                                                     |
| `vp fmt`                 | Apply formatting                                                                                                                                                                                              |

Use `vpr check` for the repository's `stylish` lint format; the built-in `vp check` does not support custom output formats.

### Test caching

Package tests are uncached by default. To investigate cache misses, run `vpr -r --cache test` twice and inspect `vp run --last-details`. Mutable workspace fixtures can invalidate cache inputs; see [filesystem fixtures](agents/testing.md#filesystem-fixtures).

## Packages and dependencies

Each package declares its supported imports and dependencies; shared versions come from the workspace catalog.

### Package structure

Keep runtime code independent of package-local `validation/` fixtures. Across packages, import declared package names and subpaths rather than relative paths. See the boundary rules in [vite.config.ts](../vite.config.ts).

### Dependencies

Keep shared development tooling and Pi host packages in root `devDependencies`; declare package-specific dependencies locally. Use `workspace:*` for local packages and `catalog:` for external versions in [pnpm-workspace.yaml](../pnpm-workspace.yaml). Pi `peerDependencies` use `catalog:pi-host` to retain host-supplied versions independently of development versions.

Runtime code can import only the host entry points that Pi supplies to installed extensions:

- the `@earendil-works/pi-ai` root, `/compat`, `/models`, `/oauth`, and `/providers/all`
- the roots of `@earendil-works/pi-agent-core`, `@earendil-works/pi-tui`, and `@earendil-works/pi-coding-agent`
- `typebox` with `/compile` and `/value`

Inside the workspace, other subpaths resolve to the development copy in `node_modules`, so lint rejects value imports of them in runtime code. Type imports are allowed, because TypeScript removes them before Pi runs the code. Worker files get none of these entry points, because Node loads them without Pi's loader, so lint rejects value imports of them in the worker entries that `vite.config.ts` lists. Lint does not follow the modules that a worker entry imports; the [release check](#release-branch) finds those failures.

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

Users [install](../README.md#install) the generated `release` branch. Pull requests run [check.yml](../.github/workflows/check.yml). On each push to `master`, [release.yml](../.github/workflows/release.yml) runs the same checks first. When they pass, its `release` job builds the tree with [build-release.ts](../.scripts/build-release.ts) and commits it to `release` when the tree changed.

- Workflow runs can reach the `release` job out of order, so the job publishes only when its commit is still the head of `master`.
- The job's concurrency group keeps all pending jobs (`queue: max`), so a late older run cannot cancel the pending job for the current commit.
- The job never force-pushes, so commits that users installed stay available.

To release a version, follow the [release procedure](release.md), which raises `version` in the root `package.json`. The job tags the first `release` commit that has a version `v<version>`, if that tag does not exist yet. Tags never move, so a tag always names the same build. A push without a version change moves only the branch.

The build includes every package under `packages/` and `packages/extensions/`, so a new extension needs no release change. It runs these steps:

1. Pack each package with `pnpm pack`, which replaces the `workspace:` and `catalog:` specifiers that npm rejects.
2. Remove tests, `validation/` fixtures, `AGENTS.md`, `tsconfig.json`, scripts, and development dependencies.
3. Install a copy outside the workspace with Pi's npm command.
4. Start the Pi CLI with every extension and an offline model. An extension that fails to load fails the job. The offline model also starts both worker threads from the installed copy, because this startup-only print run would not otherwise start them, and it fails the job when one does not answer.

Must not regress ([testing policy](agents/testing.md#coverage)):

- **High, e2e:** In an installed copy of the release tree, the bounded-diff and pi-prompt-manager collection workers start and return a result. Otherwise, pi-tool-display shows diffs only from native edit patches: `write` calls and edits without a valid patch show none. pi-prompt-manager can't read or write collections of 1 MiB or more.

To inspect the tree, run `node .scripts/build-release.ts`. It writes `.tmp/release` and needs network access for npm.
