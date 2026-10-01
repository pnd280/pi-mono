# Pi compatibility for maintainers

[pi-fff-guard](../README.md)

> Last verified against Pi 1.0.0 (package checks and offline interception and scope tests, with explicit `ToolInfo.exposure`). Not covered: live calls to installed FFF, and the retirement checks. The FFF version in the README comes from earlier external testing.

## Upgrade procedure

1. Run the [package checks](../README.md#validation).
2. If an integration contract changed, make real calls to the installed FFF. Local tests don't establish external compatibility.
3. Work through the checklist below, then update the "Last verified" line. Keep the README's external version evidence tied to the versions actually tested.

## Checklist

- [ ] [Interception](../src/index.ts): official-package provenance, enabled tool names, hook dispatch, and `{ block: true, reason }`. No argument changes, replacement searches, or ended turns.
- [ ] [Inspection](../src/evaluate-search.ts): installed FFF schemas and normalisation, explicit paths versus filters, ignore and symlink behaviour, deadlines, and the cancellation policy.

## Limitations

- **Direct calls.** [Calling `execute()` directly skips hooks](../README.md#limits). Pi's public `ctx.executeTool()` dispatches nested calls through hooks (observed in Pi 0.99.2), but that doesn't show how an external FFF wrapper runs its calls. Recheck the installed wrapper before changing this limitation.
- **Upstream fix.** If FFF supports ignored paths, the guard may no longer be needed. Follow the [retirement checks](#retirement-checks) against the installed FFF release, not Pi alone.

## Retirement checks

After a released FFF version implements [FFF #714](https://github.com/dmtrKovalenko/fff/issues/714):

1. Disable the guard.
2. For every tool in use, search an ignored file, an ignored directory, and a linked dependency.
3. If those pass, check missing explicit paths before retiring the guard. Keep a separate path check if needed.

The [FFF 0.11.0 routing implementation](https://github.com/dmtrKovalenko/fff/blob/95fd777c2529fc7b4d7572dabff64cc07268f2c5/packages/pi-fff/src/aux-finders.ts#L167-L184) still leaves in-workspace paths on the workspace finder, including ignored paths. This is not a released fix for the retirement precondition; keep the guard until the procedure above passes. Source inspection alone does not establish live search compatibility.
