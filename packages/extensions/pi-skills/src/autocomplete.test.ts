import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { CustomEditor } from "@earendil-works/pi-coding-agent";
import {
  CombinedAutocompleteProvider,
  type AutocompleteProvider,
  type Terminal
} from "@earendil-works/pi-tui";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { expect, it, vi } from "vite-plus/test";

import skills from "../index.ts";
import { createSkillAutocompleteProvider } from "./autocomplete.ts";
import { command } from "./test-fixture.ts";

const commands = [command("skill:review"), command("skill:release"), command("skill:plan")];
const options = () => ({ signal: new AbortController().signal, force: true });

it("does not claim a borrowed item reused by a delegated provider", async () => {
  const item = { value: "skill:review", label: "custom label", description: "native metadata" };
  const native = new CombinedAutocompleteProvider([], process.cwd());
  const current: AutocompleteProvider = {
    getSuggestions: async () => ({ items: [item], prefix: "#issue" }),
    applyCompletion: native.applyCompletion.bind(native)
  };
  const provider = createSkillAutocompleteProvider(current, () => commands);
  const owned = (await provider.getSuggestions(["/skill:re"], 0, 9, options()))!;
  expect(provider.applyCompletion(["/skill:re"], 0, 9, owned.items[0]!, owned.prefix)).toEqual({
    lines: ["/skill:review "],
    cursorLine: 0,
    cursorCol: 14
  });
  const delegated = (await provider.getSuggestions(["#issue"], 0, 6, options()))!;
  expect(provider.applyCompletion(["#issue"], 0, 6, delegated.items[0]!, delegated.prefix)).toEqual(
    { lines: ["skill:review"], cursorLine: 0, cursorCol: 12 }
  );
});

it("Enter accepts a leading skill completion in the mounted editor without submitting", async () => {
  let skillPaths: string[] = [];
  const fixture = await hostFixture([
    skills,
    (pi) => {
      pi.on("resources_discover", () => ({ skillPaths }));
    }
  ]);

  try {
    skillPaths = await Promise.all(
      ["review", "release"].map(async (name) => {
        const path = join(fixture.directory, `${name}.md`);
        await writeFile(path, `---\nname: ${name}\ndescription: Fixture skill\n---\nBody\n`);

        return path;
      })
    );

    let input = (_data: string) => {};

    const terminal: Terminal = fixture.terminal;

    terminal.start = (callback) => {
      input = callback;
    };

    await fixture.bind();
    const editor = fixture.host.editorContainer.children[0];
    if (!(editor instanceof CustomEditor)) throw new Error("Expected the mounted Pi editor");
    const onSubmit = vi.fn();
    editor.onSubmit = onSubmit;
    fixture.host.ui.setFocus(editor);
    fixture.host.ui.start();

    editor.setText("/skill:re");
    input("\t");
    await vi.waitFor(() => expect(editor.isShowingAutocomplete()).toBe(true), {
      interval: 1,
      timeout: STEP_TIMEOUT_MS
    });
    input("\r");
    expect(editor.getText()).toMatch(/^\/skill:(review|release) $/u);
    expect(editor.isShowingAutocomplete()).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  } finally {
    await fixture.dispose();
  }
});
