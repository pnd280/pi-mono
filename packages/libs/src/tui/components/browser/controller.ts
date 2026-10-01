import { LatestTask } from "../../../latest-task/index.ts";
import { TimedConfirmation } from "../../../timed-confirmation/index.ts";
import type { BrowserAction } from "./controls.ts";
import type {
  BrowserOptions,
  BrowserSection,
  BrowserSelectionAction,
  BrowserSnapshot
} from "./types.ts";

type BrowserPorts = {
  changed(this: void): void;
  close(this: void): void;
  now(this: void): number;
  onError(this: void, error: unknown): void;
};

type ViewState = { query: string; selected: string | undefined };

export class BrowserController<Item> {
  section: BrowserSection<Item>;
  status: "loading" | "ready" | "unavailable" = "loading";
  error = "";
  snapshot: BrowserSnapshot<Item> | undefined;
  results: Item[] = [];
  preview = false;
  previewScroll = 0;
  pendingAction: "delete" | "confirm" | "alternate" | undefined;
  closed = false;
  private readonly searchTask: LatestTask;
  private confirmation: TimedConfirmation<Item>;
  private activation = new AbortController();
  private readonly views = new Map<string, ViewState>();

  constructor(
    readonly options: BrowserOptions<Item>,
    private readonly ports: BrowserPorts
  ) {
    for (const section of options.sections) {
      if (this.views.has(section.id)) throw new Error("Browser section IDs must be unique.");
      this.views.set(section.id, { query: section.initialQuery ?? "", selected: undefined });
    }

    this.section = this.findSection(options.initialSection);
    this.searchTask = new LatestTask({ changed: ports.changed });
    this.confirmation = this.createConfirmation();
  }

  private findSection(id: string) {
    const section = this.options.sections.find((candidate) => candidate.id === id);
    if (!section) throw new Error("Browser section does not exist.");

    return section;
  }

  private createConfirmation() {
    return new TimedConfirmation<Item>({
      durationMs: this.section.remove?.durationMs ?? 1500,
      now: this.ports.now,
      expired: this.ports.changed
    });
  }

  private isClosed() {
    return this.closed;
  }

  private get state() {
    const state = this.views.get(this.section.id);
    if (!state) throw new Error("Browser section state does not exist.");

    return state;
  }

  get searching() {
    return this.searchTask.pending;
  }
  get busy() {
    return this.pendingAction !== undefined;
  }
  get armed() {
    return this.confirmation.armed;
  }
  get query() {
    return this.state.query;
  }
  get selected() {
    return this.results.find((item) => this.options.key(item) === this.state.selected);
  }
  get selectedIndex() {
    const selected = this.selected;

    return selected === undefined ? -1 : this.results.indexOf(selected);
  }
  get canReturnToList() {
    return this.preview && this.status === "ready" && !this.busy && !this.options.inspection;
  }

  async activate(id = this.section.id): Promise<void> {
    if (this.isClosed() || this.busy) return;
    const section = this.findSection(id);
    this.activation.abort();
    const activation = new AbortController();
    this.activation = activation;
    this.searchTask.cancel();
    this.confirmation.dispose();
    this.section = section;
    this.confirmation = this.createConfirmation();
    this.previewScroll = 0;
    this.status = "loading";
    this.snapshot = undefined;
    this.results = [];
    this.ports.changed();

    try {
      const snapshot = await section.load(activation.signal);
      if (activation.signal.aborted) return;
      this.snapshot = snapshot;
      this.status = "ready";
      const inspection = this.options.inspection;

      if (inspection) {
        const item = snapshot.items[inspection.index - 1];

        if (item === undefined) {
          this.preview = false;
          this.status = "unavailable";
          this.error = inspection.missingMessage;
        } else {
          this.results = [item];
          this.state.selected = this.options.key(item);
          this.preview = true;
        }

        this.ports.changed();
      } else await this.filter();
    } catch (error) {
      if (activation.signal.aborted) return;
      this.preview = false;
      this.status = "unavailable";
      this.error =
        error instanceof Error
          ? error.message
          : (this.options.loadError ?? "Could not load items.");
      this.ports.changed();
    }
  }

  private async filter(nearby?: number): Promise<void> {
    const state = this.state;

    try {
      await this.searchTask.run(
        (current) => this.options.search(this.snapshot?.items ?? [], state.query, current),
        (results) => {
          this.results = results;

          if (this.snapshot) {
            this.status = "ready";
            this.error = "";
          }

          if (!results.some((item) => this.options.key(item) === state.selected)) {
            const selected = results[Math.min(nearby ?? 0, results.length - 1)];
            state.selected = selected === undefined ? undefined : this.options.key(selected);
          }

          if (!results.length) this.preview = false;
        }
      );
    } catch (error) {
      this.results = [];
      state.selected = undefined;
      this.preview = false;

      if (this.snapshot) {
        this.status = "unavailable";
        this.error = "Could not search items.";
      }

      this.ports.changed();
      throw error;
    }
  }

  setQuery(query: string): void {
    if (this.isClosed() || this.busy || this.preview || this.options.inspection) return;
    this.cancelConfirmation();
    this.state.query = query;
    void this.filter().catch((error: unknown) => this.reportError(error));
  }

  cancelConfirmation(): void {
    this.confirmation.cancel();
  }

  close(): void {
    if (this.isClosed()) return;
    this.closed = true;
    this.activation.abort();
    this.searchTask.dispose();
    this.confirmation.dispose();
    this.ports.close();
  }

  private reportError(error: unknown) {
    if (!this.isClosed()) this.ports.onError(error);
  }

  private navigate(action: BrowserAction, pageSize: number) {
    let delta = pageSize;
    if (action === "up") delta = -1;
    else if (action === "down") delta = 1;
    else if (action === "pageUp") delta = -pageSize;

    if (this.preview) this.previewScroll = Math.max(0, this.previewScroll + delta);
    else {
      const index = Math.max(0, Math.min(this.results.length - 1, this.selectedIndex + delta));
      const selected = this.results[index];
      this.state.selected = selected === undefined ? undefined : this.options.key(selected);
    }
  }

  private confirmDeletion(): void {
    const target = this.selected;
    const removal = this.section.remove;
    if (target === undefined || !removal?.enabled(target)) return;
    if (this.confirmation.confirm(target)) void this.delete(target);
  }

  private async delete(target: Item): Promise<void> {
    this.pendingAction = "delete";
    const nearby = this.selectedIndex;
    this.ports.changed();

    try {
      const snapshot = await this.section.remove?.run(target, this.activation.signal);
      if (this.isClosed()) return;

      if (snapshot) {
        this.preview = false;
        this.previewScroll = 0;
        this.snapshot = snapshot;
        await this.filter(nearby);
      }
    } catch (error) {
      this.reportError(error);
    } finally {
      this.pendingAction = undefined;
      if (!this.isClosed()) this.ports.changed();
    }
  }

  private async copy(item: Item): Promise<void> {
    try {
      await this.section.copy?.(item);
    } catch (error) {
      this.reportError(error);
    }
  }

  private select(kind: "confirm" | "alternate", item: Item) {
    const action: BrowserSelectionAction<Item> | undefined = this.section[kind];
    if (!action) return;

    try {
      const result = action.run(item);

      if (typeof result === "boolean") {
        if (result) this.close();
      } else {
        this.pendingAction = kind;
        void result
          .then((close) => {
            if (!this.isClosed() && close) this.close();
          })
          .catch((error: unknown) => this.reportError(error))
          .finally(() => {
            this.pendingAction = undefined;
            if (!this.isClosed()) this.ports.changed();
          });
      }
    } catch (error) {
      this.reportError(error);
    }
  }

  action(action: BrowserAction, pageSize = 5): void {
    if (this.isClosed() || action === "ignore") return;
    if (action !== "delete") this.cancelConfirmation();
    if (action === "cancel") {
      if (this.canReturnToList) {
        this.preview = false;
        this.previewScroll = 0;
      } else this.close();
    } else if (!this.busy) this.perform(action, pageSize);
    if (!this.isClosed()) this.ports.changed();
  }

  private perform(action: BrowserAction, pageSize: number) {
    if (this.options.inspection && action === "confirm") {
      this.close();

      return;
    }

    if (action === "switch" && !this.options.inspection) {
      const sections = this.options.sections;
      const index = sections.indexOf(this.section);
      const next = sections[(index + 1) % sections.length];
      if (next && next !== this.section) void this.activate(next.id);

      return;
    }

    if (this.status !== "ready" || this.searching) return;

    if (["up", "down", "pageUp", "pageDown"].includes(action)) {
      this.navigate(action, pageSize);

      return;
    }

    const target = this.selected;
    if (target === undefined) return;

    if (action === "copy") {
      void this.copy(target);

      return;
    }

    if (this.options.inspection) return;

    switch (action) {
      case "confirm":
        this.select("confirm", target);
        break;
      case "alternate":
        this.select("alternate", target);
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
