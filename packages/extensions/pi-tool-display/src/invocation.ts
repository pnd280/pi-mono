import { homedir } from "node:os";
import { resolve } from "node:path";
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

const UNAVAILABLE_PARAMETERS = "<parameters unavailable>";

export function serializeParameters(input: unknown, indentation?: number): string {
  try {
    const serialized = JSON.stringify(input, undefined, indentation) as string | undefined;

    return serialized ?? UNAVAILABLE_PARAMETERS;
  } catch {
    return UNAVAILABLE_PARAMETERS;
  }
}

/** Resolve only explicitly tagged file targets. Retained rendering must not inspect
 * current files or follow symlinks, and search expressions are not filesystem paths.
 */
export function resolveInvocationPath(value: string, cwd: string): string | undefined {
  if (!value) return undefined;
  let path = expandHomePath(value.startsWith("@") ? value.slice(1) : value, homedir());

  if (path.startsWith("file://")) {
    try {
      path = fileURLToPath(path);
    } catch {
      return undefined;
    }
  }

  return resolve(cwd, path);
}

export function invocationPartText(part: InvocationPart, cwd: string, relativeTo = cwd): string {
  const path = part.kind === "path" ? resolveInvocationPath(part.text, cwd) : undefined;

  return displayText(path === undefined ? part.text : relativeDisplayPath(path, relativeTo));
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
        annotation(" \u2014 "),
        target(path || "."),
        ...(glob ? [annotation(" ("), value(glob), annotation(")")] : [])
      ];
    }

    case "list":
      return [target(path || ".")];
    case "read":
      return [path ? target(path) : annotation("…"), { kind: "range", text: readRange(args) }];
    case "edit":
    case "write":
      return [path ? target(path) : annotation("…")];
    case "invocation":
      return [
        value(name),
        annotation("("),
        { kind: "parameters", text: serializeParameters(args) },
        annotation(")")
      ];
  }
}
