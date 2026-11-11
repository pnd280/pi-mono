# [pi-session-utils](README.md) development

## Startup

- Keep host assumptions for startup in `startup.ts`.

## Naming

- Save an automatic title only after its agent run settles without an abort. The [compatibility checklist](docs/pi-compatibility.md#naming) gives the reason.
- Cancel title work for tree navigation in `session_tree`, not `session_before_tree`: another extension's handler can cancel the navigation after this one runs.
- Stop title work at shutdown only in the [lifecycle](../../libs/src/lifecycle/README.md) shutdown revoke, which runs before any participant awaits. A direct `session_shutdown` handler can run after another extension's await, and a finished generation could still save its title.

## Validation

When you change a host assumption, work through the [compatibility checklist](docs/pi-compatibility.md).
