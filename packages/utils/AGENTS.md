# [pi-utils](README.md) development

## Code navigation

[Source](src/fff-tools.ts) and [tests](src/fff-tools.test.ts) classify FFF ownership and names. The supported entry point is `pi-utils/fff-tools`.

## Constraints and validation

Keep utilities pure and shared by concrete consumers. Do not move extension display state, filesystem guard policy, tool execution, or Pi-private integration here. Changes to classification require scoped checks/tests for `pi-utils`, `pi-fff-guard`, and `pi-tool-display` under the workspace [verification workflow](../../docs/agents/verification.md).
