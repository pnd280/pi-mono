# [pi-t3-skills](README.md) development

## Constraints

- Register input behaviour only through the [input chain](../../libs/src/input-chain/README.md), as two transforms of one participant.
- Mirror T3 Code's hook at the commit that the [hook fixture](validation/t3-input-hook.ts) names. When T3 Code changes its hook, update the fixture and the suffix reconstruction in the same change.
