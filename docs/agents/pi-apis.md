# Pi API contracts

[Workspace development](../development.md)

Implement Pi changes in workspace extensions, through public APIs first; a runtime monkey-patch may work around an API limit. Never suggest or edit Pi core or upstream package files, including installed dependencies.

Find installed documentation and examples in [Pi API references](pi-docs.md).

## Private-method gates

- Gate each patch of, or call to, a private Pi method with a SHA-256 [host fingerprint](../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints). Follow that section when you add, move, or remove one.

## Custom types

Namespace persisted custom entry and custom message `customType` identifiers as `<extension-package>.<entry-name>`, for example `pi-agent-summary.summary`. Define each identifier in its owning module and reuse it for writes, reads, and renderer registration. These identifiers are distinct from Pi-generated session record `id` values.

## Notices

Start a `ctx.ui.notify` message with the package name and a colon, for example `pi-model-prompt: rules[0] skipped: …`, when the user didn't request it: startup, settings loading, host compatibility, or background work. Pi shows notices without a source. A message that answers the user's own command or an open view needs no prefix.
