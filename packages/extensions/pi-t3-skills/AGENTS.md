# [pi-t3-skills](README.md) development

## Constraints

- Register input behaviour only through the [input chain](../../libs/src/input-chain/README.md), as two transforms of one participant. A separate `input` handler would run in load order.
- Mirror T3 Code's hook at commit `8b44f42b14c8e273156474a924ccf29680dd7857`. When T3 Code changes its hook, update the [hook fixture](validation/t3-input-hook.ts) and the suffix reconstruction in the same change.
