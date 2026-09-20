# [Shared TUI](README.md) development

## Code navigation

[Components and helpers](README.md#usage) · [Browser contract](components/browser/README.md) · [Host mounting](open-browser/README.md)

## Constraints

Colocate implementation, tests, and contracts; keep domain policy in extensions.

Components own reusable interaction, dimensions, focus, and layout; callers control low-level renderers. Use consumer callbacks for loading, persistence, clipboard, and editor effects. Never import host mounting, extensions, or filesystem/process/network APIs.

Use Pi wrapping and borders. Prepare full text outside render/input loops to bound redraws; keep theme colors out of cached layout. Preserve one browser across host remounts; dispose only at final closure.

## Validation

Use [package validation](../../README.md#validation). Keep browser interaction and dimension tests in `components/browser/`, host closure and editor snapshot ordering tests in `open-browser/`, and generic presentation lifetime tests in `responsive-custom-ui/`.
