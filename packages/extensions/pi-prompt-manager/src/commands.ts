import type { Collection } from "./model.ts";

export type NumberedAction = "show" | "copy" | "restore" | "restore-and-remove" | "delete";

export type Command =
  | { kind: "open"; collection: Collection }
  | { kind: "save" }
  | { kind: "add"; text: string }
  | { kind: "numbered"; action: NumberedAction; index: number }
  | { kind: "invalid" };

export const usage =
  "Usage: /prompts [history|save|drafts [list|add <text>|show <n>|copy <n>|restore <n>|restore-and-remove <n>|delete <n>]]";

const numbered = ["show", "copy", "restore", "restore-and-remove", "delete"] as const;

export function parseCommand(args: string): Command {
  const value = args.trim();

  if (!value || value === "history") return { kind: "open", collection: "history" };
  if (value === "save") return { kind: "save" };
  if (value === "drafts" || /^drafts\s+list$/.test(value))
    return { kind: "open", collection: "drafts" };
  const add = /^drafts\s+add\s+([\s\S]+)$/.exec(value);

  if (add?.[1]?.trim()) return { kind: "add", text: add[1].trim() };
  const parts = value.split(/\s+/);
  const action = numbered.find((item) => item === parts[1]);
  const index = parts[2];

  if (
    parts.length === 3 &&
    parts[0] === "drafts" &&
    action &&
    index &&
    /^[1-9]\d*$/.test(index) &&
    Number.isSafeInteger(Number(index))
  )
    return { kind: "numbered", action, index: Number(index) };

  return { kind: "invalid" };
}

export function completions(prefix: string) {
  const choices = [
    "history",
    "save",
    "drafts",
    "drafts list",
    "drafts add",
    ...numbered.map((action) => `drafts ${action}`)
  ];
  // An exact argument must submit, rather than accepting an identical completion first.
  if (choices.includes(prefix)) return null;
  const items = choices
    .filter((choice) => choice.startsWith(prefix))
    .map((value) => ({ value, label: value }));

  return items.length ? items : null;
}
