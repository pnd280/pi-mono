import type { Theme } from "@earendil-works/pi-coding-agent";

import type { WindowedListOptions } from "../windowed-list/index.ts";

export type BrowserSnapshot<Item> = {
  items: Item[];
  message?: string;
};

export type BrowserSelectionAction<Item> = {
  label: string;
  /** Return true to close. Apply editor changes only after the host presentation closes. */
  run(item: Item): boolean | Promise<boolean>;
};

export type BrowserRemoval<Item> = {
  label: string;
  confirmation: string;
  pending: string;
  durationMs: number;
  enabled(item: Item): boolean;
  /** The signal cancels snapshot preparation, never effects already started. */
  run(item: Item, signal: AbortSignal): Promise<BrowserSnapshot<Item> | undefined>;
};

export type BrowserSection<Item> = {
  id: string;
  label: string;
  initialQuery?: string;
  load(signal: AbortSignal): Promise<BrowserSnapshot<Item>>;
  confirm?: BrowserSelectionAction<Item>;
  alternate?: BrowserSelectionAction<Item>;
  copy?(item: Item): Promise<void>;
  remove?: BrowserRemoval<Item>;
};

/** Inspection opens the preview, so it needs one. */
type BrowserPreview<Item> =
  | {
      /** A separate scrollable view, opened with Ctrl+P. */
      preview(item: Item): { text: string; metadata?: string };
      inspection?: { index: number; title: string; missingMessage: string };
    }
  | { preview?: undefined; inspection?: undefined };

export type BrowserOptions<Item> = BrowserPreview<Item> & {
  sections: readonly BrowserSection<Item>[];
  initialSection: string;
  key(item: Item): string;
  search(items: Item[], query: string, current: () => boolean): Promise<Item[]>;
  format(
    items: readonly Item[],
    theme: Pick<Theme, "fg" | "bold">
  ): ReturnType<WindowedListOptions<Item>["format"]>;
  /** Short text shown below the results for the selected item. Rows that do not fit are cut. */
  details?(item: Item): string;
  /** Shown when `load` rejects with a non-Error value; Error messages are shown directly. */
  loadError?: string;
  /** Caller-owned diagnostic when no usable cancel binding exists. */
  cancelError?: Error;
};
