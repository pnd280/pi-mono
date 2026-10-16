# Pi compatibility for maintainers

[pi-fff-guard](../README.md)

> Last verified against Pi 1.3.0 and FFF 0.11.0 (package checks, offline interception and scope tests, and live calls on Linux to installed FFF through an offline scripted provider, in the default and `override` modes). Compared with 0.10.6, FFF 0.11.0 registers its tools when it loads and again at session start, and changes rendering and SDK loading. Its tool schemas, `query.ts`, and `aux-finders.ts` are unchanged. No runtime changes were needed.

## Upgrade procedure

1. Run the [package checks](../README.md#validation).
2. If an integration contract changed, make real calls to the installed FFF. Local tests don't establish external compatibility.
3. Work through the checklist below, then update the "Last verified" line. Keep the README's external version evidence tied to the versions actually tested.

## Checklist

- [ ] [Interception](../src/index.ts): official-package provenance, enabled tool names, hook dispatch, and `{ block: true, reason }`. No argument changes, replacement searches, or ended turns.
- [ ] [Inspection](../src/evaluate-search.ts): installed FFF schemas and normalisation, explicit paths versus filters, ignore and symlink behaviour, deadlines, and the cancellation policy.

## Limitations

- [Calling `execute()` directly skips hooks](../README.md#limits). Pi's public `ctx.executeTool()` dispatches nested calls through hooks (observed in Pi 0.99.2), but that doesn't show how an external FFF wrapper runs its calls. Recheck the installed wrapper before changing this limitation.

## Retirement checks

After a released FFF version implements [FFF #714](https://github.com/dmtrKovalenko/fff/issues/714):

1. Disable the guard.
2. For every tool in use, search an ignored file, an ignored directory, and a linked dependency.
3. If those pass, check missing explicit paths before retiring the guard. Keep a separate path check if needed.

The [FFF 0.11.0 routing implementation](https://github.com/dmtrKovalenko/fff/blob/95fd777c2529fc7b4d7572dabff64cc07268f2c5/packages/pi-fff/src/aux-finders.ts#L167-L184) still leaves in-workspace paths on the workspace finder, including ignored paths. A live check of FFF 0.11.0 without the guard confirms this: searches of an ignored file and a linked dependency returned only matches from another file, with no notice, and searches of an ignored directory returned nothing. Keep the guard until the procedure above passes.
