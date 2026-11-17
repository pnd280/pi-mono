# [pi-skills](README.md) development

## Constraints

- Register input behaviour only through the [input chain](../../libs/src/input-chain/README.md), at the transform rank that its [recommended ranks](../../libs/src/input-chain/order.md#recommended-ranks) give.
- Wrap the editor only to open completion after an edit inserts a single `/`, such as typing it, and compose with an earlier extension's editor factory.
