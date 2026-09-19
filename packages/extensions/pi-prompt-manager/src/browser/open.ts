import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { searchText } from "@pi-mono/libs/text-search";
import type { BrowserOptions, BrowserSnapshot } from "@pi-mono/libs/tui/components/browser";
import { openBrowser as openSharedBrowser } from "@pi-mono/libs/tui/open-browser";
import { relativeTime } from "@pi-mono/utils/relative-time";

import { assertRestorable } from "../host/editor.ts";
import type { RestorationRequest, ViewRequest } from "../manager.ts";
import {
  errorMessage,
  PromptError,
  type Collection,
  type Occurrence,
  type MutationResult,
  type Repository,
  type Snapshot
} from "../model.ts";
import { initialHistoryQuery, prepareItems, type SearchItem } from "../search.ts";

type PromptItem = SearchItem & { removable: boolean };

type BrowserPorts = {
  read: Repository["read"];
  copy(target: Occurrence): Promise<void>;
  remove(collection: Collection, target: Occurrence): Promise<MutationResult>;
  notify(message: string, severity: "error"): void;
};

async function browserSnapshot(
  snapshot: Snapshot,
  signal: AbortSignal
): Promise<BrowserSnapshot<PromptItem>> {
  const items = await prepareItems(snapshot, signal);
  let message = snapshot.warnings[0];
  if (snapshot.access === "read-only") message = "Read-only: repair invalid occurrence IDs.";
  else if (snapshot.access === "delete-only") message = "Recovery: deletions only.";

  return {
    items: items.map((item) => ({
      ...item,
      removable: item.occurrence.identity === "valid" && snapshot.access !== "read-only"
    })),
    ...(message ? { message } : {})
  };
}

const formatRows: BrowserOptions<PromptItem>["format"] = (items, theme) => {
  const now = Date.now();
  const ageWidth = Math.max(3, ...items.map((item) => relativeTime(item.time, now).length));

  return {
    items: items.map((item) => ({
      value: item.occurrence.key,
      label: `${relativeTime(item.time, now).padEnd(ageWidth)}  ${item.summary}`
    })),
    layout: {
      truncatePrimary: ({ text, maxWidth, isSelected }) => {
        const label = truncateToWidth(text, maxWidth);

        return isSelected
          ? label
          : theme.fg("muted", label.slice(0, ageWidth)) + label.slice(ageWidth);
      }
    }
  };
};

export async function openBrowser(
  ui: Pick<ExtensionContext["ui"], "custom">,
  ports: BrowserPorts,
  request: ViewRequest
): Promise<void> {
  if (request.signal.aborted) return;
  let restoration: RestorationRequest | undefined;

  const requestRestoration = (item: PromptItem, deleteAfterRestore: boolean) => {
    try {
      assertRestorable(item.occurrence.source.text);
      restoration = { target: item.occurrence, deleteAfterRestore };

      return true;
    } catch (error) {
      ports.notify(errorMessage(error), "error");

      return false;
    }
  };

  const collections: Collection[] = ["history", "drafts"];
  const browser: BrowserOptions<PromptItem> = {
    sections: collections.map((collection) => ({
      id: collection,
      label: collection,
      initialQuery: collection === "history" ? initialHistoryQuery(request.initialEditor) : "",
      load: async (signal) => {
        const result = await ports.read(collection, signal);
        if (result.status === "unavailable") throw new PromptError(result.message);

        return browserSnapshot(result, signal);
      },
      confirm: { label: "restore", run: (item) => requestRestoration(item, false) },
      ...(collection === "drafts"
        ? {
            alternate: {
              label: "restore then delete",
              run: (item: PromptItem) => requestRestoration(item, true)
            }
          }
        : {}),
      copy: (item) => ports.copy(item.occurrence),
      remove: {
        label: "delete",
        confirmation: "Delete again to confirm (1.5s)",
        pending: "Deleting entry…",
        durationMs: 1500,
        enabled: (item) => item.removable,
        run: async (item, signal) => {
          const result = await ports.remove(collection, item.occurrence);

          return result.status === "committed"
            ? browserSnapshot(result.snapshot, signal)
            : undefined;
        }
      }
    })),
    initialSection: request.collection,
    key: (item) => item.occurrence.key,
    search: searchText,
    format: formatRows,
    preview: (item) => ({
      text: item.display,
      metadata:
        item.time === undefined
          ? "Unknown time"
          : new Date(item.time).toLocaleString(undefined, { timeZoneName: "longOffset" })
    }),
    ...(request.inspectionIndex === undefined
      ? {}
      : {
          inspection: {
            index: request.inspectionIndex,
            title: `Draft ${request.inspectionIndex} · Inspection`,
            missingMessage: "Draft number is outside the current collection."
          }
        }),
    loadError: "Collection could not be read.",
    cancelError: new PromptError(
      "Prompt browser requires an unshadowed cancel binding other than Ctrl+C. Fix tui.select.cancel / tui.input.copy and reload."
    )
  };

  await openSharedBrowser({
    ui,
    signal: request.signal,
    browser,
    onError: (error) => ports.notify(errorMessage(error), "error"),
    afterClose: () => request.afterClose(restoration)
  });
}
