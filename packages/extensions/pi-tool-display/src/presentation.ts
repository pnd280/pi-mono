import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { ToolFamily } from "./display-model.ts";
import { displayText } from "./layout.ts";

export type { ToolFamily } from "./display-model.ts";

export function record(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object") return {};

  // Read-only lookup view, including arrays and class instances. No field's presence or type
  // is guaranteed: consumers must validate each unknown value before using it.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as Readonly<Record<string, unknown>>;
}

export function stringField(value: unknown): string {
  return typeof value === "string" ? displayText(value) : "";
}

function readRange(args: Record<string, unknown>): string {
  if (args.offset === undefined && args.limit === undefined) return "";
  const offset = typeof args.offset === "number" ? args.offset : 1;
  const end = typeof args.limit === "number" ? `-${offset + args.limit - 1}` : "";

  return `:${offset}${end}`;
}

export interface InvocationPart {
  kind: "value" | "path" | "pattern" | "annotation" | "parameters";
  text: string;
}

const value = (text: string): InvocationPart => ({ kind: "value", text });
const annotation = (text: string): InvocationPart => ({ kind: "annotation", text });

/** Resolve only explicitly tagged file targets. Retained rendering must not inspect
 * current files or follow symlinks, and search expressions are not filesystem paths.
 */
export function invocationPartText(part: InvocationPart, cwd: string): string {
  if (part.kind !== "path" || !part.text) return displayText(part.text);
  let path = part.text.startsWith("@") ? part.text.slice(1) : part.text;
  if (path === "~" || path.startsWith("~/") || (sep === "\\" && path.startsWith("~\\")))
    path = resolve(homedir(), path.slice(2));

  if (path.startsWith("file://")) {
    try {
      path = fileURLToPath(path);
    } catch {
      return displayText(part.text);
    }
  }

  const absolute = resolve(cwd, path);
  const local = relative(cwd, absolute);
  const inside = local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local);

  return displayText((inside ? local || "." : absolute).split(sep).join("/"));
}

/** Keep supplied values separate from generated labels; styling must not parse user text. */
export function invocationParts(
  name: string,
  input: unknown,
  family: ToolFamily
): InvocationPart[] {
  const args = record(input);
  const rawPath = args.path ?? args.file_path;
  const path = typeof rawPath === "string" ? rawPath : "";
  const target = (text: string): InvocationPart => ({ kind: "path", text });

  switch (family) {
    case "shell": {
      const timeout = typeof args.timeout === "number" ? ` (timeout ${args.timeout}s)` : "";
      const command = stringField(args.command);

      return [command ? value(command) : annotation("…"), annotation(timeout)];
    }

    case "search": {
      const glob = stringField(args.glob);

      return [
        stringField(args.pattern) ? value(stringField(args.pattern)) : annotation("…"),
        annotation(" in "),
        target(path || "."),
        ...(glob ? [annotation(" ("), value(glob), annotation(")")] : [])
      ];
    }

    case "list":
      return [target(path || ".")];
    case "read":
      return [path ? target(path) : annotation("…"), annotation(readRange(args))];
    case "edit":
    case "write":
      return [path ? target(path) : annotation("…")];
    case "invocation":
      return [
        value(name),
        annotation("("),
        { kind: "parameters", text: displayText(JSON.stringify(args)) },
        annotation(")")
      ];
  }
}
