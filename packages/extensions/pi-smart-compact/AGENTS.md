# [pi-smart-compact](README.md) development

The [compatibility guide](docs/pi-compatibility.md) defines _fingerprint_, _between-response boundary_, _split turn_, and _default summary_.

## Constraints

- Keep private API assumptions inside the compatibility boundary ([src/compatibility.ts](src/compatibility.ts)).

## Validation

| When you…                                           | Read                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| Add or change tests                                 | [Test coverage](docs/testing.md).                                |
| Upgrade Pi, or change a private hook or fingerprint | The [upgrade procedure and checklist](docs/pi-compatibility.md). |
