# [Website](README.md) development

## Routes

The dev server and the build regenerate `src/routeTree.gen.ts` from the files in `src/routes/`. Commit the regenerated file with route changes, because type checks import it. Regenerate it with `vpr '@pi-mono/website#build'`; the TanStack Router CLI (`tsr generate`) omits the `@tanstack/react-start` type registration that the Start plugin adds.
