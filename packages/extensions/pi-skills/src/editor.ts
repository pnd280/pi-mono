import { createHash } from "node:crypto";

import type { Editor, EditorComponent } from "@earendil-works/pi-tui";

type InlineEditor = EditorComponent &
  Pick<Editor, "getLines" | "getCursor" | "isShowingAutocomplete">;

// Pi's editor has no public trigger, and opens its picker for a typed slash only at the start of
// the message. Reviewed Pi 1.4.0 API build and installed bundled CLI, respectively. Never learn
// fingerprints from the running host: an unknown editor must keep only Pi's own completion.
// Keep .agents/skills/pi-update/scripts/fingerprints.ts in sync with these methods.
const fingerprints = [
  {
    tryTriggerAutocomplete: "945b59f464acf64fb5c0ac7e5f0181dcc90f2a1f9fb37c8e5b203d9c12b94bc3",
    requestAutocomplete: "eb7df90caef7fde0452db61b270d6561458fca9702ca7b529fc1af8208760667"
  },
  {
    tryTriggerAutocomplete: "30b8e3ccbe18504a4eee3cd61baaee57778fe8641d8b0fe27675778b6b047590",
    requestAutocomplete: "e5d848942efd1d08d762bc61ad21b22ddd63b160906667e82adb6db8d1eb4b50"
  }
];

function sha256(method: unknown): string | undefined {
  if (typeof method !== "function") return undefined;

  return createHash("sha256").update(Function.prototype.toString.call(method)).digest("hex");
}

/** Pi's regular completion request, as after a typed letter, for a reviewed editor only. */
function findTrigger(editor: EditorComponent): (() => void) | undefined {
  const reviewed = fingerprints.some((expected) =>
    Object.entries(expected).every(([name, hash]) => sha256(Reflect.get(editor, name)) === hash)
  );
  const trigger: unknown = Reflect.get(editor, "tryTriggerAutocomplete");

  if (!reviewed || typeof trigger !== "function") return undefined;

  return () => {
    Reflect.apply(trigger, editor, []);
  };
}

/** A slash that starts a token, except at the start of the message, where Pi opens its own picker. */
function startsInlineCompletion(lines: string[], cursorLine: number, cursorCol: number): boolean {
  const beforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);

  return /(?:^|\s)\/$/u.test(beforeCursor) && !(cursorLine === 0 && beforeCursor.trim() === "/");
}

function isInlineEditor(editor: EditorComponent): editor is InlineEditor {
  return ["getLines", "getCursor", "isShowingAutocomplete"].every(
    (name) => typeof Reflect.get(editor, name) === "function"
  );
}

/**
 * Opens completion when a typed slash starts a token after the start of the message.
 * Returns false, and leaves the editor unchanged, when the editor is not a reviewed Pi editor.
 */
export function completeInlineSlash(editor: EditorComponent): boolean {
  const trigger = findTrigger(editor);

  if (!trigger || !isInlineEditor(editor)) return false;

  const handleInput = editor.handleInput.bind(editor);

  editor.handleInput = (data) => {
    // Pi re-queries an open picker after typed text.
    const showing = editor.isShowingAutocomplete();
    const before = editor.getCursor();
    const line = editor.getLines()[before.line] ?? "";

    handleInput(data);

    if (showing) return;

    const lines = editor.getLines();
    const after = editor.getCursor();
    // Compare text, not key data: terminals can encode a typed slash in more than one way. Pasting,
    // yanking, or undoing a single slash counts too.
    const typedSlash =
      after.line === before.line &&
      after.col === before.col + 1 &&
      lines[after.line] === `${line.slice(0, before.col)}/${line.slice(before.col)}`;

    if (typedSlash && startsInlineCompletion(lines, after.line, after.col)) trigger();
  };

  return true;
}
