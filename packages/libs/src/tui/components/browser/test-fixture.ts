import { searchText } from "../../../text-search/index.ts";
import { displayText } from "../../terminal-text/index.ts";
import type { BrowserOptions } from "./types.ts";

export type TestItem = { id: string; label: string; display: string; normalized: string };

export function items(texts = ["alpha", "beta", "alpha"]): TestItem[] {
  return texts.map((text, index) => ({
    id: String(index),
    label: displayText(text).replace(/\s+/gu, " "),
    display: displayText(text),
    normalized: displayText(text).toLowerCase()
  }));
}

export function browserOptions(values = items()): BrowserOptions<TestItem> {
  return {
    initialSection: "saved",
    sections: ["recent", "saved"].map((id) => ({
      id,
      label: id,
      initialQuery: id === "recent" ? "alpha" : "",
      load: async () => ({ items: values }),
      confirm: { label: "select", run: () => true },
      alternate: { label: "open", run: () => true },
      copy: async () => {},
      remove: {
        label: "remove",
        confirmation: "Delete again to remove (1.5s)",
        pending: "Removing item…",
        durationMs: 1500,
        enabled: () => true,
        run: async () => undefined
      }
    })),
    key: (item) => item.id,
    search: searchText,
    format: (visible) => ({
      items: visible.map((item) => ({ value: item.id, label: item.label }))
    }),
    preview: (item) => ({ text: item.display })
  };
}
