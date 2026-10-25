# Temporary property hooks

[Library index](../../README.md#usage)

An extension that temporarily replaces properties on host objects must restore them without undoing a replacement that another extension installed later. [`@pi-mono/libs/owned-hooks`](index.ts) exports `OwnedHooks` for temporary property replacements and `unwrapHook` for inspecting their recorded predecessors.

## Behaviour

### Restoration

- `restore()` reverses a replacement only where the installed value remains. It restores the descriptor, or removes a property that the replacement added.
- `restore()` skips unrestorable properties without throwing.
- Held callback references cannot be revoked.

### Provenance

When `replace()` installs a function, it records the preceding data-property value.

- `unwrapHook(value)` follows those recorded links to the deepest value without changing the binding. It works across module reloads and after `restore()`.
- It stops at an unrecorded value.
- It returns `undefined` for a cycle, an ambiguous reused function, or an accessor predecessor.
- It does not call getters.

| When you…                                                     | Read                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| Decide what an `unwrapHook` result proves about a host method | [What provenance proves](provenance.md#what-provenance-proves) |
| Gate a feature on host fingerprints                           | [Host fingerprints](provenance.md#host-fingerprints)           |

## Usage

```ts
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

type Renderer = { render(text: string): string };

export function markRenderer(renderer: Renderer): () => void {
  const hooks = new OwnedHooks();
  const previous = renderer.render;
  let active = true;

  hooks.replace(renderer, "render", (text: string) => {
    const output = previous.call(renderer, text);
    return active ? `${output} *` : output;
  });
  // unwrapHook(renderer.render) now follows the record back to the original method.

  return () => {
    active = false;
    hooks.restore();
  };
}
```

## Caller responsibilities

- Deactivate retained callbacks before you call `restore()`.
- Verify host compatibility before replacement. Supply compatibility evidence, such as reviewed source hashes or a public-version pin.
- Make sure that existing own properties are writable data properties. Otherwise `replace()` throws `TypeError`.
- Use a fresh wrapper for each predecessor.

Related: tool display's [installer](../../../extensions/pi-tool-display/src/host/install.ts) and [display collectors](../../../extensions/pi-tool-display/src/host/collection.ts) manage the teardown order.
