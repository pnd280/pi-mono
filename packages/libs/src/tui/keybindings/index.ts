import { Key, type KeyId } from "@earendil-works/pi-tui";
import { z } from "zod";

const baseKeys = new Set<string>(Object.values(Key).filter((key) => typeof key === "string"));
const modifiers = ["ctrl", "shift", "alt", "super"];

function validKey(value: string): value is KeyId {
  // A plus symbol may itself be the base key, including in ctrl++.
  const parts = value.endsWith("+")
    ? [...value.slice(0, -1).split("+").filter(Boolean), "+"]
    : value.split("+");
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

  if (!base && value.endsWith("+")) {
    base = "+";
    if (parts.length > 0 && parts.pop() !== "") return undefined;
  }

  if (base === "esc") base = "escape";
  if (base === "return") base = "enter";
  if (base === "pageup") base = "pageUp";
  if (base === "pagedown") base = "pageDown";
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
