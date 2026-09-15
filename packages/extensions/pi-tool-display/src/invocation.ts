import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import { displayText } from "@pi-mono/libs/tui/terminal-text";
import { expandHomePath, relativeDisplayPath } from "@pi-mono/utils/paths";

import type { ToolFamily, InvocationPart } from "./contracts.ts";
import { stringField } from "./terminal-text.ts";
import { record } from "./values.ts";

function readRange(args: Record<string, unknown>): string {
  if (args.offset === undefined && args.limit === undefined) return "";
  const offset = typeof args.offset === "number" ? args.offset : 1;
  const end = typeof args.limit === "number" ? `-${offset + args.limit - 1}` : "";

  return `:${offset}${end}`;
}

const value = (text: string): InvocationPart => ({ kind: "value", text });
const annotation = (text: string): InvocationPart => ({ kind: "annotation", text });

/** Resolve only explicitly tagged file targets. Retained rendering must not inspect
 * current files or follow symlinks, and search expressions are not filesystem paths.
 */
export function invocationPartText(part: InvocationPart, cwd: string): string {
  if (part.kind !== "path" || !part.text) return displayText(part.text);
  let path = expandHomePath(part.text.startsWith("@") ? part.text.slice(1) : part.text, homedir());

  if (path.startsWith("file://")) {
    try {
      path = fileURLToPath(path);
    } catch {
      return displayText(part.text);
    }
  }

  return displayText(relativeDisplayPath(path, cwd));
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
