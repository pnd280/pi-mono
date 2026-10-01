import { Key, type KeyId } from "@earendil-works/pi-tui";
import { z } from "zod";

const baseKeys = new Set<string>(Object.values(Key).filter((key) => typeof key === "string"));
const modifiers = ["ctrl", "shift", "alt", "super"];

function validKey(value: string): value is KeyId {
  const parts = value.split("+");
  const base = parts.pop();

  return (
    base !== undefined &&
    (baseKeys.has(base) || /^[a-z0-9]$/.test(base)) &&
    parts.every((part) => modifiers.includes(part)) &&
    new Set(parts).size === parts.length
  );
}

function normalizeKey(value: string): KeyId | undefined {
  const parts = value.toLowerCase().split("+");
  let base = parts.pop() ?? "";

  if (base === "esc") base = "escape";
  if (base === "return") base = "enter";
  if (base === "pageup") base = "pageUp";
  if (base === "pagedown") base = "pageDown";
  // Pi 1.0.0 cannot dispatch literal plus, modified Escape or modified function keys.
  if (!base || (parts.length > 0 && (base === "escape" || /^f\d+$/.test(base)))) return undefined;
  if (parts.some((part) => !modifiers.includes(part)) || new Set(parts).size !== parts.length)
    return undefined;
  const key = [...modifiers.filter((modifier) => parts.includes(modifier)), base].join("+");

  return validKey(key) ? key : undefined;
}

export const canonicalKeySchema = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value, "Shortcut must not have surrounding whitespace")
  .transform((value, context) => {
    const key = normalizeKey(value);
    if (key !== undefined) return key;
    context.addIssue({ code: "custom", message: "Invalid shortcut" });

    return z.NEVER;
  });

export function canonicalKey(value: unknown): KeyId | undefined {
  return canonicalKeySchema.safeParse(value).data;
}

export function formatKeyLabel(key: string): string {
  return key
    .split("+")
    .map((part) => {
      if (part === "escape") return "Esc";
      if (part === "delete") return "Del";

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("+");
}

export type KeybindingCandidate<Action extends string = string> = {
  action: Action;
  keys: readonly string[];
  exclude?: (key: KeyId) => boolean;
};

/** Claim alternatives in order so dispatch and user-facing hints share precedence. */
export function resolveKeybindings<Action extends string>(
  candidates: readonly KeybindingCandidate<Action>[]
): Array<{ action: Action; key: KeyId }> {
  const occupied = new Set<KeyId>();
  const bindings: Array<{ action: Action; key: KeyId }> = [];

  for (const candidate of candidates) {
    for (const value of candidate.keys) {
      const key = canonicalKey(value);
      if (!key || occupied.has(key) || candidate.exclude?.(key)) continue;
      occupied.add(key);
      bindings.push({ action: candidate.action, key });
    }
  }

  return bindings;
}
