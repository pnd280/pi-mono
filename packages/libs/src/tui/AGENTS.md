# [Shared TUI](README.md) development

## Code navigation

[Components and helpers](README.md#usage) · [Browser contract](components/browser/README.md) · [Host mounting](open-browser/README.md)

## Constraints

Keep each component or helper's implementation, tests, and contract together. Domain policy stays in extensions.

Components manage reusable interaction, dimensions, focus, and layout. Callers control low-level renderers. Keep data loading, persistence, clipboard access, and editor effects behind consumer callbacks. Components must not import host mounting, extension modules, or APIs for filesystem, process, or network access.

Use Pi's text wrapping and borders. Prepare full text outside repeated rendering and input handling so redraws stay bounded. Keep theme colors out of cached layout. Preserve one logical browser across host remounts and dispose it only at final closure.

## Validation

Use [package validation](../../README.md#validation). Keep browser interaction and dimension tests in `components/browser/`, host closure and editor snapshot ordering tests in `open-browser/`, and generic presentation lifetime tests in `responsive-custom-ui/`.
