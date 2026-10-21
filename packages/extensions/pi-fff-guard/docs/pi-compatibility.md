# Pi compatibility for maintainers

[pi-fff-guard](../README.md)

> Last verified against Pi 1.3.0 and FFF 0.11.0 with package checks, offline interception and scope tests, and live Linux calls to installed FFF through an offline scripted provider in the default and `override` modes. Not covered: live calls on platforms other than Linux.

## Upgrade procedure

1. Run the [package checks](../../../../docs/development.md#focused-validation).
2. If an integration contract changed, make real calls to the installed FFF. Local tests don't establish external compatibility.
3. Work through the checklist below, then update the "Last verified" line. Keep the README's external version evidence tied to the versions actually tested.

## Checklist

Recheck these contracts against the installed Pi and FFF versions.

### Interception

Confirm these items against [src/index.ts](../src/index.ts):

- [ ] `getAllTools().sourceInfo` attributes FFF's tools, including override names and late registrations, to the official package.
- [ ] The tool names that FFF enables still match the names that the guard intercepts.
- [ ] Pi runs `tool_call` hooks for every FFF search call.
- [ ] Returning `{ block: true, reason }` from a `tool_call` hook blocks the call and gives the reason to the model.
- [ ] `ctx.signal` in a `tool_call` hook aborts when the caller cancels.

The guard changes no arguments, runs no replacement searches, and ends no turns.

### Inspection

Confirm these items against [src/evaluate-search.ts](../src/evaluate-search.ts) and the installed FFF source:

- [ ] The installed FFF schemas still have the path, exclusion, pattern, and constraint fields that the guard reads.
- [ ] FFF still normalises `path` and `exclude` as [search scopes](search-scopes.md#paths-and-filters) describes.
- [ ] FFF still treats bare filenames as recursive filters and other paths as explicit paths.
- [ ] In an FFF glob without `**`, `*`, `?`, and bracket expressions still match `/`; in a glob with `**`, they still match within one path component.
- [ ] FFF's index still leaves out Git-ignored paths, as [FFF #714](https://github.com/dmtrKovalenko/fff/issues/714) describes.
- [ ] Ignore inspection still follows the [Git ignore rules](search-scopes.md#git-ignore-rules).
- [ ] FFF still indexes the files below a directory link under the link's name, including a link that Git does not ignore into an ignored directory, and still applies the ignore files inside the destination below the link.
- [ ] Caller cancellation still blocks the call.
- [ ] An inspection that passes the two-second deadline still allows the call with a diagnostic.

The README states the deadline and the cancellation result as user-visible [limits](../README.md#limits).

## Limitations

- [Calling `execute()` directly skips hooks](../README.md#limits). In Pi 1.3.0, the public `ctx.executeTool()` dispatches nested calls through hooks, but that doesn't show how an external FFF wrapper runs its calls. Recheck the installed wrapper before changing this limitation.

## Retirement checks

After a released FFF version implements [FFF #714](https://github.com/dmtrKovalenko/fff/issues/714):

1. Disable the guard.
2. For every tool in use, search an ignored file, an ignored directory, and a linked dependency.
3. If those pass, check missing explicit paths before retiring the guard. Keep a separate path check if needed.

The [FFF 0.11.0 routing implementation](https://github.com/dmtrKovalenko/fff/blob/95fd777c2529fc7b4d7572dabff64cc07268f2c5/packages/pi-fff/src/aux-finders.ts#L167-L184) still leaves in-workspace paths on the workspace finder, including ignored paths. A live check of FFF 0.11.0 without the guard confirms this: searches of an ignored file and a linked dependency returned only matches from another file, with no notice, and searches of an ignored directory returned nothing. Keep the guard until the procedure above passes.
