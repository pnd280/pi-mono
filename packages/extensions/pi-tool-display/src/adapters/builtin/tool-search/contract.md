# Built-in tool-search adapter contract

[Built-in tool-search adapter](README.md) · [Adapter development](../../../../docs/adapters.md)

Adapter maintainers use this contract when they change result handling. [Tool search cards](../../../../docs/tools.md#tool-search) describes what users see.

## Display

- The "Loaded N tools" line and the per-name summary counts need valid, nonempty `details.loaded` names.
- Calls with missing or invalid `details.loaded` keep the output preview.
- Calls with missing, empty, or invalid `details.loaded` count as `tool_search ×N`.

## Limitations

The adapter never activates tools or reads the tool registry; loaded names come only from the retained result details.
