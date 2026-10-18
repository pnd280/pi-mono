# Website

The marketing site for this workspace, built with [TanStack Start](https://tanstack.com/start), React, TypeScript, and Tailwind CSS.

```sh
vpr '@pi-mono/website#dev'
```

The development server listens on port 3000.

## Usage

Complete [workspace setup](../../README.md#setup), then run these commands from the repository root:

| Command                          | Result                                                          |
| -------------------------------- | --------------------------------------------------------------- |
| `vpr '@pi-mono/website#dev'`     | Starts the development server on port 3000.                     |
| `vpr '@pi-mono/website#build'`   | Builds the client and server bundles into `apps/website/dist/`. |
| `vpr '@pi-mono/website#preview'` | Serves the production build.                                    |
| `vpr '@pi-mono/website#check'`   | Checks formatting, lint, and types with the workspace config.   |

## Content

The landing page in `src/routes/index.tsx` lists the extensions from `src/extensions.ts`. When you add, remove, or reword an extension in the [workspace README](../../README.md#extensions), update that file too.

The page shares its look with the [README hero](../../docs/assets/hero.html). `src/components/session-panel.tsx` copies the hero's sample session, and `src/styles.css` loads the hero's fonts from `docs/assets/fonts/`. When you change the hero, update the panel to match.

## Routes

Each file in `src/routes/` is a route; `src/routes/__root.tsx` renders the document shell around every page. The dev server and the build regenerate `src/routeTree.gen.ts` from these files. Commit the regenerated file with route changes, because type checks import it. To regenerate it without a build, run `vpr '@pi-mono/website#generate-routes'`.
