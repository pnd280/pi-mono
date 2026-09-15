import { displayText } from "@pi-mono/libs/tui/terminal-text";

export function stringField(value: unknown): string {
  return typeof value === "string" ? displayText(value) : "";
}
