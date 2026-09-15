import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { hasUnsafeTerminalControls } from "@pi-mono/libs/tui/terminal-text";

import { PromptError } from "../model.ts";

export type EditorPort = { read(): string; write(text: string): void };

export function editorPort(ctx: ExtensionContext): EditorPort {
  return { read: () => ctx.ui.getEditorText(), write: (text) => ctx.ui.setEditorText(text) };
}

/** Source is refused, never sanitized. Pi still normalizes tabs and line endings. */
export function assertRestorable(text: string): void {
  if (hasUnsafeTerminalControls(text))
    throw new PromptError(
      "Restoration refused: source contains unsafe terminal controls. Inspection and native copying remain available."
    );
}
