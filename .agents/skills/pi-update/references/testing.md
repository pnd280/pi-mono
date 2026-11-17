# Pi-update test coverage

[Pi-update skill](../SKILL.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This skill tests the fingerprint probe's argument and environment builder; package tests own extension behaviour.

## Must not regress

- **High, unit:** The fingerprint probe builder passes only its explicit extension and an allow-listed environment.

## Not tested

- The unit test does not start Pi. The [fingerprint check](compatibility-checks.md#host-fingerprints) loads the installed CLI with `--help` to inspect its method sources.
