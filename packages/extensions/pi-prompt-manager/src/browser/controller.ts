import type { Collection, MutationResult, Occurrence, ReadResult, Snapshot } from "../model.ts";
import { initialHistoryQuery, prepareItems, searchItems, type SearchItem } from "../search.ts";
import type { BrowserAction } from "./controls.ts";

export type BrowserPorts = {
  read(this: void, collection: Collection): Promise<ReadResult>;
  copy(this: void, target: Occurrence): Promise<void>;
  restore(this: void, target: Occurrence): boolean;
  restoreAndRemove(this: void, target: Occurrence): Promise<boolean>;
  remove(this: void, collection: Collection, target: Occurrence): Promise<MutationResult>;
  changed(this: void): void;
  close(this: void): void;
  now(this: void): number;
};

type ViewState = { query: string; selected: string | undefined };

export class BrowserController {
  collection: Collection;
  status: "loading" | "ready" | "unavailable" = "loading";
  error = "";
  snapshot: Snapshot | undefined;
  results: SearchItem[] = [];
  preview = false;
  previewScroll = 0;
  deleting = false;
  searching = false;
  closed = false;
  armed: { target: Occurrence; deadline: number } | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private queryGeneration = 0;
  private items: SearchItem[] = [];
  private readonly views: Record<Collection, ViewState>;

  constructor(
    private readonly ports: BrowserPorts,
    options: { collection: Collection; initialEditor: string; inspectionIndex?: number }
  ) {
    this.collection = options.collection;
    this.inspectionIndex = options.inspectionIndex;
    this.views = {
      history: { query: initialHistoryQuery(options.initialEditor), selected: undefined },
      drafts: { query: "", selected: undefined }
    };
  }

  private isClosed() {
    return this.closed;
  }

  readonly inspectionIndex: number | undefined;
  get query() {
    return this.views[this.collection].query;
  }
  get selected() {
    return this.results.find(
      (item) => item.occurrence.key === this.views[this.collection].selected
    );
  }
  get selectedIndex() {
    const selected = this.selected;

    return selected === undefined ? -1 : this.results.indexOf(selected);
  }

  async activate(collection = this.collection): Promise<void> {
    if (this.isClosed() || this.deleting) return;
    const generation = ++this.generation;
    this.queryGeneration++;
    this.cancelConfirmation();
    this.collection = collection;
    this.preview = false;
    this.previewScroll = 0;
    this.status = "loading";
    this.snapshot = undefined;
    this.results = [];
    this.items = [];
    this.ports.changed();
    let result: ReadResult;

    try {
      result = await this.ports.read(collection);
    } catch {
      result = { status: "unavailable", message: "Collection could not be read." };
    }

    if (this.isClosed() || generation !== this.generation) return;

    if (result.status === "unavailable") {
      this.status = "unavailable";
      this.error = result.message;
      this.ports.changed();

      return;
    }

    const items = await prepareItems(result);

    if (this.isClosed() || generation !== this.generation) return;
    this.snapshot = result;
    this.items = items;
    this.status = "ready";
    if (this.inspectionIndex !== undefined) {
      const item = items[this.inspectionIndex - 1];

      if (!item) {
        this.status = "unavailable";
        this.error = "Draft number is outside the current collection.";
      } else {
        this.results = [item];
        this.views[collection].selected = item.occurrence.key;
        this.preview = true;
      }

      this.ports.changed();
    } else await this.filter();
  }

  private async filter(nearby?: number): Promise<void> {
    const generation = ++this.queryGeneration;
    const collection = this.collection;
    const current = () => !this.isClosed() && generation === this.queryGeneration;
    this.searching = true;
    this.ports.changed();
    const results = await searchItems(this.items, this.query, current);

    if (!current()) return;
    this.results = results;
    const state = this.views[collection];

    if (!results.some((item) => item.occurrence.key === state.selected))
      state.selected = results[Math.min(nearby ?? 0, results.length - 1)]?.occurrence.key;
    this.searching = false;
    this.ports.changed();
  }

  setQuery(query: string): void {
    if (this.isClosed() || this.deleting || this.preview || this.inspectionIndex !== undefined)
      return;
    this.cancelConfirmation();
    this.views[this.collection].query = query;
    void this.filter();
  }

  cancelConfirmation(): void {
    this.armed = undefined;
    clearTimeout(this.expiry);
    this.expiry = undefined;
  }

  resize(): void {
    this.cancelConfirmation();
    this.ports.changed();
  }

  close(): void {
    if (this.isClosed()) return;
    this.closed = true;
    this.generation++;
    this.queryGeneration++;
    this.cancelConfirmation();
    this.ports.close();
  }

  private navigate(action: BrowserAction, pageSize: number) {
    const delta =
      action === "up" ? -1 : action === "down" ? 1 : action === "pageUp" ? -pageSize : pageSize;

    if (this.preview) this.previewScroll = Math.max(0, this.previewScroll + delta);
    else {
      const index = Math.max(0, Math.min(this.results.length - 1, this.selectedIndex + delta));
      this.views[this.collection].selected = this.results[index]?.occurrence.key;
    }
  }

  private confirmDeletion(): void {
    const target = this.selected?.occurrence;

    if (!target || target.identity !== "valid" || this.snapshot?.access === "read-only") return;

    if (this.armed?.target === target && this.ports.now() < this.armed.deadline) {
      this.cancelConfirmation();
      void this.delete(target);
    } else {
      this.cancelConfirmation();
      this.armed = { target, deadline: this.ports.now() + 1500 };
      this.expiry = setTimeout(() => {
        this.cancelConfirmation();
        if (!this.isClosed()) this.ports.changed();
      }, 1500);
    }
  }

  private async delete(target: Occurrence): Promise<void> {
    this.deleting = true;
    const nearby = this.selectedIndex;
    this.ports.changed();
    let result: MutationResult;

    try {
      result = await this.ports.remove(this.collection, target);
    } catch {
      result = { status: "failed", message: "Deletion failed." };
    }

    if (this.isClosed()) return;

    if (result.status === "committed") {
      this.preview = false;
      this.previewScroll = 0;
      this.snapshot = result.snapshot;
      this.items = await prepareItems(result.snapshot);
      if (!this.isClosed()) await this.filter(nearby);
    }

    this.deleting = false;
    if (!this.isClosed()) this.ports.changed();
  }

  action(action: BrowserAction, pageSize = 5): void {
    if (this.isClosed() || action === "ignore") return;
    if (action !== "delete") this.cancelConfirmation();
    if (action === "cancel") {
      if (this.preview && !this.deleting && this.inspectionIndex === undefined) {
        this.preview = false;
        this.previewScroll = 0;
      } else this.close();
    } else if (!this.deleting) this.perform(action, pageSize);
    if (!this.isClosed()) this.ports.changed();
  }

  private perform(action: BrowserAction, pageSize: number) {
    const target = this.selected?.occurrence;

    if (this.inspectionIndex !== undefined && action === "confirm") {
      this.close();

      return;
    }

    if (action === "switch" && this.inspectionIndex === undefined) {
      void this.activate(this.collection === "history" ? "drafts" : "history");

      return;
    }

    if (this.status !== "ready" || this.searching) return;

    if (["up", "down", "pageUp", "pageDown"].includes(action)) {
      this.navigate(action, pageSize);

      return;
    }

    if (!target) return;

    if (action === "copy") {
      void this.ports.copy(target);

      return;
    }

    if (this.inspectionIndex !== undefined) return;

    switch (action) {
      case "confirm":
        if (this.ports.restore(target)) this.close();
        break;
      case "restore-remove":
        if (this.collection === "drafts") {
          this.deleting = true;
          void this.ports.restoreAndRemove(target).then((restored) => {
            if (this.isClosed()) return;
            this.deleting = false;
            if (restored) this.close();
            else this.ports.changed();
          });
        }

        break;
      case "preview":
        this.preview = true;
        this.previewScroll = 0;
        break;
      case "delete":
        this.confirmDeletion();
        break;
    }
  }
}
