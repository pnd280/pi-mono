# Working-message command owner and versions

[Working-message coordinator](README.md)

Read this when you choose an `ownerRank`, debug why `/working-message` is missing or duplicated, or check what changes when two library versions meet. For liveness and version detection, see the [coordinator protocol](../coordination/README.md).

## Command owner

The command owner is the component with the lowest `ownerRank` among live participants and participants that can still become live. Equal ranks fall back to contributor, then ID. Overrides never own the command. The owner extension only hosts the command; the menu and ordering stay shared.

A participant whose factory ran but which Pi's loader left out still counts as a candidate. When it has the lowest `ownerRank`, no extension registers `/working-message` in that runtime. This can occur only on the first start in a project that needs a trust decision. Pi's [project-trust pass](../../docs/pi-compatibility.md#coordinators) runs user and global factories, then leaves out an extension that the final set replaces or removes, for example when the project lists the same package.

## Version mismatch

After a [version mismatch](../coordination/README.md#version-mismatch), each participant writes only its own text, and the latest write shows. Each protocol version registers its own `/working-message` for its own components, and Pi numbers the duplicate names.

## Recommended owner ranks

Each participant states its reasons in its own documentation.

| Participant      | `ownerRank` |
| ---------------- | ----------- |
| pi-todo          | `100`       |
| pi-agent-summary | `200`       |
| pi-subagents     | `300`       |
