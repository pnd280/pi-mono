# Built-in tool-search adapter contract

[Built-in tool-search adapter](README.md) · [Adapter development](../../../../docs/adapters.md)

Adapter maintainers use this contract when they change result handling. [Tool search cards](../../../../docs/tools.md#tool-search) describes what users see.

## Arguments and results

The adapter validates `details.loaded` as an array of strings; missing or invalid details do not reject the call.

## Display

The validated array supplies the compact summary and the loaded-tool identities; an empty array supplies no identities. [Tool search cards](../../../../docs/tools.md#tool-search) gives the text, expansion, and fallback counts.

## Limitations

The adapter never activates tools or reads the tool registry; loaded names come only from the retained result details.
