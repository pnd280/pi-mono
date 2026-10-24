import {
  isKeyRelease,
  Key,
  matchesKey,
  type Keybinding,
  type KeybindingsManager,
  type KeyId
} from "@earendil-works/pi-tui";
import { z } from "zod";

const baseKeys = new Set<string>(Object.values(Key).filter((key) => typeof key === "string"));
const modifiers = ["ctrl", "shift", "alt", "super"];
const symbolKeys = new Set([...baseKeys].filter((key) => /^[^a-z0-9]$/.test(key)));

// Modifiers end in "+", so a final "+" names the plus key, as in "+" or "ctrl++".
function splitKey(value: string): { parts: string[]; base: string } {
  const [, prefix = "", base = ""] = /^((?:[a-z]+\+)*)(.+)$/.exec(value) ?? [];

  return { parts: prefix.split("+").slice(0, -1), base };
}

function validKey(value: string): value is KeyId {
  const { parts, base } = splitKey(value);

  return (
    (baseKeys.has(base) || /^[a-z0-9]$/.test(base)) &&
    parts.every((part) => modifiers.includes(part)) &&
    new Set(parts).size === parts.length
  );
}

function normalizeKey(value: string): KeyId | undefined {
  const { parts, base: typed } = splitKey(value.toLowerCase());
  let base = typed;

  if (base === "esc") base = "escape";
  if (base === "return") base = "enter";
  if (base === "pageup") base = "pageUp";
  if (base === "pagedown") base = "pageDown";
  // Pi 1.4.0 cannot dispatch modified Escape or modified function keys.
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

function canonicalKey(value: unknown): KeyId | undefined {
  return canonicalKeySchema.safeParse(value).data;
}

export function formatKeyLabel(key: string): string {
  // A capital letter alone reads as Shift plus that letter.
  if (/^[a-z]$/.test(key)) return key;

  return key
    .split("+")
    .map((part) => {
      if (part === "escape") return "Esc";
      if (part === "delete") return "Del";

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("+");
}

/**
 * Hint a paired up/down action from `formatKeyLabel` output; `undefined` marks a
 * direction unavailable. Arrow keys with the same modifiers share one label, such as `↑↓` or
 * `Shift+↑↓`.
 */
export function navigationHints(
  up: string | undefined,
  down: string | undefined,
  label: string
): string[] {
  if (up && down) return [`${arrowPair(up, down) ?? `${up}/${down}`} ${label}`];

  return [
    up ? `${up} ${label} up` : `${label} up unavailable`,
    down ? `${down} ${label} down` : `${label} down unavailable`
  ];
}

function arrowPair(up: string, down: string): string | undefined {
  const modifiers = up.slice(0, -"Up".length);
  if (!up.endsWith("Up") || (modifiers && !modifiers.endsWith("+"))) return undefined;

  return down === `${modifiers}Down` ? `${modifiers}↑↓` : undefined;
}

export type KeybindingCandidate<Action extends string = string> = {
  action: Action;
  keys: readonly string[];
  exclude?: (key: KeyId) => boolean;
};

/**
 * Pi 1.4.0 matches a Shift press both as `shift+<key>` and as the symbol it types, so `ctrl++` and
 * `ctrl+shift+=` can be one keypress. The layout decides which key types which symbol, so treat a
 * symbol and any shifted digit or symbol with the same other modifiers as overlapping.
 */
function shiftOverlap(a: KeyId, b: KeyId): boolean {
  const slot = (key: KeyId) => {
    const { parts, base } = splitKey(key);
    const shifted = parts.includes("shift");
    if (!symbolKeys.has(base) && !(shifted && /^[0-9]$/.test(base))) return undefined;

    return { shifted, others: parts.filter((part) => part !== "shift").join("+") };
  };

  const [first, second] = [slot(a), slot(b)];

  return !!first && !!second && first.shifted !== second.shifted && first.others === second.others;
}

// Pi accepts these legacy sequences for more than one key ID. Ask its matcher
// about both IDs so protocol and platform rules stay with the host.
const legacyInputs = new Map<string, readonly string[]>([
  ["escape", ["\x1b"]],
  ["enter", ["\r", "\n"]],
  ["shift+enter", ["\x1b\r", "\n"]],
  ["tab", ["\t"]],
  ["backspace", ["\b", "\x7f"]],
  ["ctrl+backspace", ["\b"]],
  ["ctrl+-", ["\x1f"]],
  ["ctrl+alt+-", ["\x1b\x1f"]],
  ["alt+enter", ["\x1b\r"]],
  ["alt+backspace", ["\x1b\b", "\x1b\x7f"]],
  ["alt+up", ["\x1bp"]],
  ["alt+down", ["\x1bn"]],
  ["alt+left", ["\x1bb", "\x1bB"]],
  ["alt+right", ["\x1bf", "\x1bF"]]
]);

function legacyOverlap(a: KeyId, b: KeyId): boolean {
  const overlaps = (data: string) => matchesKey(data, a) && matchesKey(data, b);

  return (
    (legacyInputs.get(a)?.some(overlaps) ?? false) || (legacyInputs.get(b)?.some(overlaps) ?? false)
  );
}

/** True when Pi can dispatch one keypress to both canonical keys. */
export function keysOverlap(a: KeyId, b: KeyId): boolean {
  return a === b || shiftOverlap(a, b) || legacyOverlap(a, b);
}

/** Claim alternatives in order so dispatch and user-facing hints share precedence. */
export function resolveKeybindings<Action extends string>(
  candidates: readonly KeybindingCandidate<Action>[]
): Array<{ action: Action; key: KeyId }> {
  const occupied: KeyId[] = [];
  const bindings: Array<{ action: Action; key: KeyId }> = [];

  for (const candidate of candidates) {
    for (const value of candidate.keys) {
      const key = canonicalKey(value);
      if (!key || occupied.some((other) => keysOverlap(other, key)) || candidate.exclude?.(key))
        continue;
      occupied.push(key);
      bindings.push({ action: candidate.action, key });
    }
  }

  return bindings;
}

export type KeybindingSource = Pick<KeybindingsManager, "getKeys">;

/** An action bound to the keys of Pi keybinding `id`, or to one fixed `key`. */
export type KeyControl<Action extends string> =
  | { action: Action; id: Keybinding; exclude?: (key: KeyId) => boolean }
  | { action: Action; key: KeyId };

/**
 * Dispatch and hints of one view, resolved from its ordered controls at each call so that live
 * keybinding changes apply. An earlier control takes the keys that overlap a later one.
 */
export class KeyControls<Action extends string> {
  constructor(
    private readonly keys: KeybindingSource,
    private readonly controls: readonly KeyControl<Action>[]
  ) {}

  private bindings(): Array<{ action: Action; key: KeyId }> {
    return resolveKeybindings(
      this.controls.map((control): KeybindingCandidate<Action> =>
        "id" in control
          ? { ...control, keys: this.keys.getKeys(control.id) }
          : { action: control.action, keys: [control.key] }
      )
    );
  }

  /** The action of a keypress; key releases have none. */
  actionFor(data: string): Action | undefined {
    if (isKeyRelease(data)) return undefined;

    return this.bindings().find(({ key }) => matchesKey(data, key))?.action;
  }

  /** The label of the action's first key, or `undefined` when no key reaches it. */
  label(action: Action): string | undefined {
    const binding = this.bindings().find((candidate) => candidate.action === action);

    return binding && formatKeyLabel(binding.key);
  }

  hint(action: Action, label: string): string {
    const key = this.label(action);

    return key ? `${key} ${label}` : `${label} unavailable`;
  }

  navigationHints(up: Action, down: Action, label: string): string[] {
    return navigationHints(this.label(up), this.label(down), label);
  }
}
