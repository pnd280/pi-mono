# [pi-skills](README.md) development

## Constraints

- Register input behaviour only through the [input chain](../../libs/src/input-chain/README.md), at transform rank `100`. At this rank, input observers, such as pi-prompt-manager's prompt history, see the text before expansion, and transforms with a higher rank see the expanded text.
- Wrap the editor only to open completion after an edit inserts a single `/`, such as typing it. Compose with an earlier extension's editor factory. Call Pi's private `tryTriggerAutocomplete` only on an editor whose [host fingerprints](../../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints) match. On a mismatch, leave the editor unchanged and warn once.
