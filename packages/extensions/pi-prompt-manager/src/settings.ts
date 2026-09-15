import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Key, type KeyId } from "@earendil-works/pi-tui";

import { isRecord } from "./model.ts";

export type Settings = {
  historyRetention: number;
  customMessageTypes: string[];
  shortcuts: { history: KeyId[]; saveDraft: KeyId[] };
};

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

export function canonicalKey(value: unknown): KeyId | undefined {
  if (typeof value !== "string" || !value || value.trim() !== value) return undefined;
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

function unknownKeys(value: Record<string, unknown>, allowed: string[], warnings: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    warnings.push("Unknown pi-prompt-manager settings fields were ignored.");
}

function shortcutList(value: unknown, fallback: KeyId[], warnings: string[]): KeyId[] {
  if (value === undefined) return fallback;

  if (Array.isArray(value)) {
    const keys = value.map(canonicalKey);

    if (keys.every((key) => key !== undefined)) return [...new Set(keys)];
  }

  warnings.push("Invalid launch shortcut list; using that action's default.");

  return fallback;
}

export function parseSettings(value: unknown): { settings: Settings; warnings: string[] } {
  const warnings: string[] = [];
  const section = isRecord(value) ? value : {};

  if (value !== undefined && !isRecord(value))
    warnings.push("Invalid pi-prompt-manager settings section; using defaults.");
  unknownKeys(section, ["historyRetention", "customMessageTypes", "shortcuts"], warnings);
  const retention = section.historyRetention;
  let historyRetention = 250;

  if (typeof retention === "number" && Number.isFinite(retention))
    historyRetention = Math.max(1, Math.min(5000, Math.floor(retention)));
  else if (retention !== undefined) warnings.push("Invalid historyRetention; using 250.");
  const allowlist = section.customMessageTypes;
  let customMessageTypes: string[] = [];

  if (
    Array.isArray(allowlist) &&
    allowlist.every((item): item is string => typeof item === "string" && item.length > 0)
  )
    customMessageTypes = [...new Set(allowlist)];
  else if (allowlist !== undefined)
    warnings.push("Invalid customMessageTypes; custom-message capture is disabled.");
  const shortcuts = isRecord(section.shortcuts) ? section.shortcuts : {};

  if (section.shortcuts !== undefined && !isRecord(section.shortcuts))
    warnings.push("Invalid shortcuts object; using defaults.");
  unknownKeys(shortcuts, ["history", "saveDraft"], warnings);
  const history = shortcutList(shortcuts.history, ["ctrl+r"], warnings);
  const saveDraft = shortcutList(shortcuts.saveDraft, ["ctrl+shift+s"], warnings).filter((key) => {
    if (!history.includes(key)) return true;
    warnings.push(`History owns launch shortcut ${key}; it will not save drafts.`);

    return false;
  });

  return {
    settings: { historyRetention, customMessageTypes, shortcuts: { history, saveDraft } },
    warnings
  };
}

/** The caller must establish TUI mode before calling this global-only reader. */
export async function loadSettings(agentDir: string) {
  try {
    const raw: unknown = JSON.parse(await readFile(join(agentDir, "settings.json"), "utf8"));

    return parseSettings(isRecord(raw) ? raw["ext.pi-prompt-manager"] : null);
  } catch (error) {
    const result = parseSettings(undefined);

    if (!isRecord(error) || error.code !== "ENOENT")
      result.warnings.push("Global settings could not be read; using prompt-manager defaults.");

    return result;
  }
}
