# Pi-update test coverage

[Pi-update skill](../SKILL.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This skill tests the fingerprint probe's argument and environment builder without starting Pi; package tests own extension behaviour.

## Must not regress

- **High, unit:** Fingerprint inspection loads only its explicit extension, receives no provider credentials, and sends no model requests.

## Not tested

- The unit test does not start Pi. The [fingerprint check](compatibility-checks.md#host-fingerprints) loads the installed CLI with `--help` to inspect its method sources.
