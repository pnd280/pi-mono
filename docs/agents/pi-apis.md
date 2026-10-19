# Pi API contracts

[Workspace development](../development.md)

Never suggest or edit Pi core or upstream package files, including installed dependencies.

Implement Pi changes through workspace extensions, and prefer public APIs. Runtime monkey-patches may work around API limits. Find installed documentation and examples in [Pi API references](pi-docs.md).

## Private-method patches

- Gate each patch of a private Pi method with a SHA-256 [host fingerprint](../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints). Follow that section when you add, move, or remove one.
- `vpr check` fails until `owners` in the [fingerprint script](../../.agents/skills/pi-update/scripts/fingerprints.ts) and the hashes listed in workspace source match the installed Pi, and both owners' `inspectedPiVersion` pins match the public `VERSION` of the installed API and CLI builds. It does not check the host fingerprints table.

## Version-aware gates

Tool-display host integration and the editor-widgets host and renderer gates use shared hook provenance and a reviewed public-version pin. Tool-display row, assistant, and mode source checks stay strict.

- The version-aware gates accept a callable endpoint with a reviewed hash, or an unknown hash when public `VERSION` matches the pin.
- On an unverified version, an unknown wrapper disables the feature until someone reviews the pin.
- On the verified version, the gates can accept a changed native method as a wrapper.

## Custom types

Namespace persisted custom entry and custom message `customType` identifiers as `<extension-package>.<entry-name>`, for example `pi-agent-summary.summary`. Define each identifier in its owning module and reuse it for writes, reads, and renderer registration. These identifiers are distinct from Pi-generated session record `id` values.

## Notices

Start a `ctx.ui.notify` message with the package name and a colon, for example `pi-model-prompt: rules[0] skipped: …`, when the user didn't request it: startup, settings loading, host compatibility, or background work. Pi shows notices without a source. A message that answers the user's own command or an open view needs no prefix.
