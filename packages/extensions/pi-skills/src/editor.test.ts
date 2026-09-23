import {
  CombinedAutocompleteProvider,
  Editor,
  ProcessTerminal,
  TuiMainScreen,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type EditorTheme
} from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import { createSkillAutocompleteProvider } from "./autocomplete.ts";
import { command } from "./test-fixture.ts";

const plain = (text: string) => text;
const theme: EditorTheme = {
  borderColor: plain,
  selectList: {
    selectedPrefix: plain,
    selectedText: plain,
    description: plain,
    scrollInfo: plain,
    noMatch: plain
  }
};
const commands = [command("skill:review"), command("skill:release")];

function editorFixture(current = new CombinedAutocompleteProvider(commands, process.cwd())) {
  const tui = new TuiMainScreen(new ProcessTerminal());
  vi.spyOn(tui, "requestRender").mockImplementation(() => {});
  const editor = new Editor(tui, theme);
  const onSubmit = vi.fn();
  editor.onSubmit = onSubmit;
  editor.setAutocompleteProvider(createSkillAutocompleteProvider(current, () => commands));

  return { editor, onSubmit };
}

it.each(["Use /skill:re", "First\n/skill:re", "First\n  /skill:re", "/skill:re"])(
  "Tab opens native candidates for %j and Enter inserts without submitting",
  async (text) => {
    const { editor, onSubmit } = editorFixture();
    editor.setText(text);
    editor.handleInput("\t");
    await vi.waitFor(() => expect(editor.isShowingAutocomplete()).toBe(true));
    editor.handleInput("\r");
    expect(editor.getText()).toMatch(/\/skill:(review|release) $/u);
    expect(editor.isShowingAutocomplete()).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
    editor.handleInput("\x1f"); // Native ctrl+- undo.
    expect(editor.getText()).toBe(text);
  }
);

it.each(["Use /skill:review", "First\n/skill:review"])(
  "Tab accepts a single candidate for %j",
  async (text) => {
    const { editor, onSubmit } = editorFixture();
    editor.setText(text);
    editor.handleInput("\t");
    await vi.waitFor(() => expect(editor.getText()).toBe(`${text} `));
    expect(onSubmit).not.toHaveBeenCalled();
  }
);

it("Tab accepts from multiple results, replaces the right suffix, and preserves trailing text", async () => {
  const { editor, onSubmit } = editorFixture();
  editor.setText("First\n/skill:reBAD rest");
  for (let index = 0; index < "BAD rest".length; index++) editor.handleInput("\x1b[D");
  editor.handleInput("\t");
  await vi.waitFor(() => expect(editor.isShowingAutocomplete()).toBe(true));
  editor.handleInput("\t");
  expect(editor.getText()).toMatch(/^First\n\/skill:(review|release)  rest$/u);
  expect(editor.getCursor()).toEqual({ line: 1, col: editor.getLines()[1]!.indexOf("  rest") + 1 });
  expect(onSubmit).not.toHaveBeenCalled();
});

it("Escape cancels owned suggestions without inserting or submitting", async () => {
  const { editor, onSubmit } = editorFixture();
  editor.setText("First\n/skill:re");
  editor.handleInput("\t");
  await vi.waitFor(() => expect(editor.isShowingAutocomplete()).toBe(true));
  editor.handleInput("\x1b");
  expect(editor.isShowingAutocomplete()).toBe(false);
  expect(editor.getText()).toBe("First\n/skill:re");
  expect(onSubmit).not.toHaveBeenCalled();
});

it("keeps native Enter submission for unrelated command completions", async () => {
  const { editor, onSubmit } = editorFixture(
    new CombinedAutocompleteProvider([{ name: "model" }], process.cwd())
  );
  editor.setText("/mod");
  editor.handleInput("\t");
  await vi.waitFor(() => expect(editor.isShowingAutocomplete()).toBe(true));
  editor.handleInput("\r");
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("/model");
});

it("Escape cancels an asynchronous update to an open picker", async () => {
  const pending = Promise.withResolvers<AutocompleteSuggestions | null>();
  let signal: AbortSignal | undefined;
  const getSuggestions = vi.fn<AutocompleteProvider["getSuggestions"]>(
    (_lines, _line, _col, options) => {
      signal = options.signal;

      return pending.promise;
    }
  );
  getSuggestions.mockResolvedValueOnce({
    items: commands.map((entry) => ({ value: entry.name, label: entry.name })),
    prefix: "/skill:re"
  });
  const current: AutocompleteProvider = {
    getSuggestions,
    applyCompletion: (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol })
  };
  const { editor, onSubmit } = editorFixture();
  editor.setAutocompleteProvider(createSkillAutocompleteProvider(current, () => commands));
  editor.setText("Use /skill:re");
  editor.handleInput("\t");
  await vi.waitFor(() => expect(editor.isShowingAutocomplete()).toBe(true));
  editor.handleInput("v");
  await vi.waitFor(() => expect(getSuggestions).toHaveBeenCalledTimes(2));
  editor.handleInput("\x1b");
  expect(signal?.aborted).toBe(true);
  pending.resolve({
    items: [{ value: "skill:review", label: "skill:review" }],
    prefix: "/skill:rev"
  });
  await pending.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(editor.getText()).toBe("Use /skill:rev");
  expect(editor.isShowingAutocomplete()).toBe(false);
  expect(onSubmit).not.toHaveBeenCalled();
});

it.each(["edit", "move"])("does not apply stale asynchronous results after %s", async (action) => {
  const pending = Promise.withResolvers<AutocompleteSuggestions | null>();
  const getSuggestions = vi.fn(() => pending.promise);
  const current: AutocompleteProvider = {
    getSuggestions,
    applyCompletion: (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol }),
    shouldTriggerFileCompletion: () => false
  };
  const { editor, onSubmit } = editorFixture();
  editor.setAutocompleteProvider(createSkillAutocompleteProvider(current, () => commands));
  editor.setText("First\n/skill:re");
  editor.handleInput("\t");
  await vi.waitFor(() => expect(getSuggestions).toHaveBeenCalledTimes(1));
  if (action === "edit") editor.handleInput("x");
  if (action === "move") editor.handleInput("\x1b[D");
  const before = editor.getText();
  pending.resolve({
    items: [{ value: "skill:review", label: "skill:review" }],
    prefix: "/skill:re"
  });
  await pending.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(editor.isShowingAutocomplete()).toBe(false);
  expect(editor.getText()).toBe(before);
  expect(onSubmit).not.toHaveBeenCalled();
});
