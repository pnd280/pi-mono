# [@pi-mono/libs](README.md) development

## Constraints

- When you change a coordinator's shared state, increase its protocol version. The [version-mismatch rules](src/coordination/README.md#version-mismatch) explain how participants of different versions behave.
