# [pi-nested-instructions](README.md) development

Domain terms are in the [glossary](GLOSSARY.md).

## Must not regress

- Infer [scope](GLOSSARY.md#discovery) from tool inputs alone. Never inspect results, enumerate glob matches, or run commands to infer scope.
- Never replace tools or modify Pi's native instruction loading. Keep Pi's filename precedence and the lexical cwd boundary.
- Deduplicate against the canonical projection, including context edits, and tie each [marker](GLOSSARY.md#discovery) to the exact call that created it.

## Constraints

- Collect all markers in a batch before reading instructions.
- Save only through public session APIs.
- Send startup refresh notices only in the [lifecycle](../../libs/src/lifecycle/phases.md#recommended-ranks-and-registrations) startup commit at rank `100`. A direct `session_start` send would place them by load order.
- Keep rendering in [pi-tool-display](../pi-tool-display/src/adapters/pi-nested-instructions/README.md).
- Document new adapter limits in the [input discovery guide](docs/input-discovery.md).

## References

| When you…                                   | Read                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Change discovery or persistence             | [Session lifetime](docs/design.md#session-lifetime)                                                                |
| Change shared scope extraction              | [Shared scope extraction](docs/design.md#shared-scope-extraction), then check the utils helpers and `pi-fff-guard` |
| Validate discovery, persistence, or notices | [Package validation](README.md#validation)                                                                         |
| Upgrade Pi                                  | [Compatibility checklist](docs/pi-compatibility.md)                                                                |
