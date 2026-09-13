import type { ToolFamily } from "../../display-model.ts";
import { record, invocationParts } from "../../presentation.ts";
import type { ToolDisplayAdapter } from "../types.ts";
import {
  nativeResultParts,
  nativeResultNotices,
  nativeReadImageNotices,
  nativeImageCaption
} from "./result-presentation.ts";

const nativeFamilies: Readonly<Record<string, ToolFamily>> = {
  read: "read",
  grep: "search",
  find: "search",
  ls: "list",
  bash: "shell",
  powershell: "shell",
  edit: "edit",
  write: "write"
};

/** Explicit contract assertion for owners; this function does not establish native ownership. */
export function nativeAdapter(name: string): ToolDisplayAdapter | undefined {
  const family = Object.hasOwn(nativeFamilies, name) ? nativeFamilies[name] : undefined;
  if (!family) return undefined;

  return {
    id: `pi:${name}`,
    family,
    savedOutput: family === "shell",
    patch: family === "edit",
    notices: (result, expanded) => [
      ...nativeResultNotices(result.details),
      ...(name === "read" && !expanded ? nativeReadImageNotices(result.content) : [])
    ],
    textParts: (text, args, context) => nativeResultParts(name, text, args, context),
    ...(family === "read"
      ? { imageCaptionMimeType: (text: string) => nativeImageCaption(text)?.mimeType }
      : {}),
    ...(family === "read" || family === "search" || family === "list"
      ? {
          exploration(args: unknown) {
            const data = record(args);
            if (family === "read" && typeof (data.path ?? data.file_path) !== "string")
              return undefined;
            if (family === "search" && typeof data.pattern !== "string") return undefined;

            return [
              {
                label:
                  family === "read"
                    ? ("Read" as const)
                    : family === "search"
                      ? ("Search" as const)
                      : ("List" as const),
                parts: invocationParts(name, args, family)
              }
            ];
          }
        }
      : {})
  };
}
