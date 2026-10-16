import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatReadLineRange } from "@earendil-works/pi-coding-agent";
import { displayText, sliceTerminalText } from "@pi-mono/libs/tui/terminal-text";
import { expandHomePath, relativeDisplayPath } from "@pi-mono/utils/paths";

import type { ToolFamily, InvocationPart } from "./contracts.ts";
import { record } from "./values.ts";

const value = (text: string): InvocationPart => ({ kind: "value", text });
const annotation = (text: string): InvocationPart => ({ kind: "annotation", text });
const literal = (value: unknown): string => (typeof value === "string" ? value : "");

const UNAVAILABLE_PARAMETERS = "<parameters unavailable>";

export function serializeParameters(input: unknown, indentation?: number): string {
  try {
    const serialized = JSON.stringify(input, undefined, indentation) as string | undefined;

    return serialized ?? UNAVAILABLE_PARAMETERS;
  } catch {
    return UNAVAILABLE_PARAMETERS;
  }
}

/** Serialize a JSON prefix without traversing omitted argument values. The depth
 * and visit budgets also bound deeply nested or entirely omitted properties.
 */
function parameterPreview(input: unknown, maximum: number): { text: string; truncated: boolean } {
  if (maximum === Infinity) return { text: serializeParameters(input), truncated: false };
  let text = "";
  let truncated = false;
  let visits = 0;
  const ancestors = new Set<object>();

  const exhausted = () => {
    if (text.length >= maximum || ++visits > maximum) truncated = true;

    return truncated;
  };

  const append = (value: string): boolean => {
    if (truncated) return false;
    const prefix = sliceTerminalText(value, 0, Math.max(0, maximum - text.length)).text;
    text += prefix;
    truncated = prefix.length < value.length;

    return !truncated;
  };

  const quoted = (value: string) => {
    const remaining = Math.max(0, maximum - text.length);
    const prefix = sliceTerminalText(value.slice(0, remaining + 1), 0, remaining).text;
    const serialized = JSON.stringify(prefix);

    if (prefix.length < value.length) {
      append(serialized.slice(0, -1));
      truncated = true;

      return false;
    }

    return append(serialized);
  };

  const normalize = (value: unknown, key: string): unknown => {
    if (value !== null && typeof value === "object") {
      const toJSON: unknown = Reflect.get(value, "toJSON");
      if (typeof toJSON === "function") value = toJSON.call(value, key);
    }

    if (value instanceof Number || value instanceof String || value instanceof Boolean)
      return value.valueOf();

    if (value !== null && typeof value === "object") {
      if (ancestors.has(value)) throw new TypeError("Circular parameters");
      if (ancestors.size >= 64) truncated = true;
    }

    return value;
  };

  const omitted = (value: unknown) =>
    value === undefined || typeof value === "function" || typeof value === "symbol";

  const write = (value: unknown): void => {
    if (truncated) return;

    if (typeof value === "string") {
      quoted(value);

      return;
    }

    if (value === null || typeof value !== "object") {
      const serialized = JSON.stringify(value) as string | undefined;
      append(serialized ?? UNAVAILABLE_PARAMETERS);

      return;
    }

    ancestors.add(value);

    if (Array.isArray(value)) {
      append("[");

      for (let index = 0; index < value.length; index++) {
        if (exhausted()) break;
        if (index && !append(",")) break;
        const item = normalize(value[index], String(index));
        write(omitted(item) ? null : item);
      }

      append("]");
    } else {
      append("{");
      let first = true;

      for (const key in value) {
        if (exhausted()) break;
        if (!Object.hasOwn(value, key)) continue;
        const item = normalize(Reflect.get(value, key), key);
        if (omitted(item)) continue;
        if (!first && !append(",")) break;
        first = false;
        if (!quoted(key) || !append(":")) break;
        write(item);
      }

      append("}");
    }

    ancestors.delete(value);
  };

  try {
    if (!exhausted()) write(normalize(input, ""));

    return { text, truncated };
  } catch {
    // Match expanded serialization for invalid borrowed values, including cycles.
    return { text: UNAVAILABLE_PARAMETERS, truncated: false };
  }
}

type ParametersPart = Extract<InvocationPart, { kind: "parameters" }>;

/** Serialize at most `maximum` characters; a truncated excerpt has no closing parenthesis. */
export function parametersText(
  part: ParametersPart,
  maximum: number
): { text: string; truncated: boolean } {
  const open = part.separated ? " (" : "(";
  const preview = parameterPreview(part.value, Math.max(0, maximum - open.length));

  return {
    text: preview.truncated ? open + preview.text : `${open}${preview.text})`,
    truncated: preview.truncated
  };
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

export function invocationPartText(
  part: Exclude<InvocationPart, ParametersPart>,
  cwd: string,
  relativeTo = cwd
): string {
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
  const path = literal(rawPath);
  const target = (text: string): InvocationPart => ({ kind: "path", text });

  switch (family) {
    case "shell": {
      const timeout = typeof args.timeout === "number" ? ` (timeout ${args.timeout}s)` : "";
      const command = literal(args.command);

      return [command ? value(command) : annotation("…"), annotation(timeout)];
    }

    case "search": {
      const glob = literal(args.glob);
      const pattern = literal(args.pattern);

      return [
        pattern ? { kind: "pattern", text: pattern } : annotation("…"),
        annotation(" \u2014 "),
        target(path || "."),
        ...(glob ? [annotation(" ("), value(glob), annotation(")")] : [])
      ];
    }

    case "list":
      return [target(path || ".")];
    case "read":
      return [
        path ? target(path) : annotation("…"),
        { kind: "range", text: formatReadLineRange(args.offset, args.limit) }
      ];
    case "edit":
    case "write":
      return [path ? target(path) : annotation("…")];
    case "invocation":
      return [value(name), { kind: "parameters", value: args }];
  }
}
