import { z } from "zod";

import type { Collection } from "./model.ts";

const numberedActionSchema = z.enum(["show", "copy", "restore", "restore-and-remove", "delete"]);
const numberedCommandSchema = z.tuple([
  z.literal("drafts"),
  numberedActionSchema,
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.int().positive())
]);

export type NumberedAction = z.infer<typeof numberedActionSchema>;

export type Command =
  | { kind: "open"; collection: Collection }
  | { kind: "save" }
  | { kind: "add"; text: string }
  | { kind: "numbered"; action: NumberedAction; index: number }
  | { kind: "invalid" };

export const usage =
  "Usage: /prompts [history|save|drafts [list|add <text>|show <n>|copy <n>|restore <n>|restore-and-remove <n>|delete <n>]]";

export function parseCommand(args: string): Command {
  const value = args.trim();

  if (!value || value === "history") return { kind: "open", collection: "history" };
  if (value === "save") return { kind: "save" };
  if (value === "drafts" || /^drafts\s+list$/.test(value))
    return { kind: "open", collection: "drafts" };
  const add = /^drafts\s+add\s+([\s\S]+)$/.exec(value);

  if (add?.[1]?.trim()) return { kind: "add", text: add[1].trim() };
  const numbered = numberedCommandSchema.safeParse(value.split(/\s+/));
  if (numbered.success)
    return { kind: "numbered", action: numbered.data[1], index: numbered.data[2] };

  return { kind: "invalid" };
}

export function completions(prefix: string) {
  const choices = [
    "history",
    "save",
    "drafts",
    "drafts list",
    "drafts add",
    ...numberedActionSchema.options.map((action) => `drafts ${action}`)
  ];
  // An exact argument must submit, rather than accepting an identical completion first.
  if (choices.includes(prefix)) return null;
  const items = choices
    .filter((choice) => choice.startsWith(prefix))
    .map((value) => ({ value, label: value }));

  return items.length ? items : null;
}
