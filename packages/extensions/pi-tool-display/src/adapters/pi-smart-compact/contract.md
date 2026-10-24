# pi-smart-compact adapter contract

[pi-smart-compact adapter](README.md) · [Adapter development](../../../docs/adapters.md)

Adapter maintainers use this contract when they change result handling. [Smart compact cards](../../../docs/tools.md#smart-compact) describes what users see.

## Display

- The card does not repeat a successful `Compaction requested.` acknowledgement that has `details.scheduled: true`.
- Valid `details.modelOverride` and `details.thinkingLevel` supply the request-time model and thinking level.
- Valid `details.tokens`, `details.contextWindow`, and `details.percent` supply the usage summary.

## Limitations

Besides the shared [prohibited actions](../../../docs/adapters.md#prohibited-actions), the adapters never read current settings, run compaction, or observe native operations.
