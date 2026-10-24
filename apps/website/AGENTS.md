# [Website](README.md) development

## Content

`src/extensions.ts` feeds the landing page's extension list. When you add, remove, or reword an extension in the [workspace README](../../README.md#extensions), update that file in the same change.

The page shares its look with the [README hero](../../docs/assets/hero.html). `src/components/session-panel.tsx` copies the hero's sample session, and `src/styles.css` loads the hero's fonts from `docs/assets/fonts/`. When you change the hero, update the panel to match.

## Routes

The dev server and the build regenerate `src/routeTree.gen.ts` from the files in `src/routes/`. Commit the regenerated file with route changes, because type checks import it. To regenerate it without a build, run `vpr '@pi-mono/website#generate-routes'`.
