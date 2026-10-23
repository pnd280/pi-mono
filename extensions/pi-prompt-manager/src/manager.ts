import { WriteLifetime } from "@pi-mono/libs/private-files";
import { displayText, hasUnsafeTerminalControls } from "@pi-mono/libs/tui/terminal-text";

import { NativeClipboardError } from "./clipboard.ts";
import { parseCommand, usage, type NumberedAction } from "./commands.ts";
import {
  captureText,
  errorMessage,
  limits,
  PromptError,
  type Collection,
  type Mutation,
  type MutationResult,
  type Occurrence,
  type Repository
} from "./model.ts";

export type RestorationRequest = { target: Occurrence; deleteAfterRestore: boolean };

export type ViewRequest = {
  collection: Collection;
  initialEditor: string;
  inspectionIndex: number | undefined;
  signal: AbortSignal;
  /** Receives the selection only after final host closure, never during a remount. */
  afterClose(restoration: RestorationRequest | undefined): Promise<void>;
};

export type EditorPort = { read(): string; write(text: string): void };

export type ManagerPorts = {
  repository: Repository;
  editor: EditorPort;
  copy(text: string, signal: AbortSignal): Promise<void>;
  notify(this: void, message: string, severity: "info" | "warning" | "error"): void;
  open(request: ViewRequest): Promise<void>;
  now(): Date;
};

/** Source is refused, never sanitized. Pi still normalizes tabs and line endings. */
export function assertRestorable(text: string): void {
  if (hasUnsafeTerminalControls(text))
    throw new PromptError(
      "Restoration refused: source contains unsafe terminal controls. Inspection and native copying remain available."
    );
}

export class PromptManager {
  private readonly lifetime = new WriteLifetime();
  private readonly mutations = new Set<Promise<MutationResult>>();
  private queue: { text: string; recordedAt: string; bytes: number }[] = [];
  private queueBytes = 0;
  private pumping = false;
  private warned = false;
  private saving = false;
  private copying = false;
  private restorationRevision = 0;
  private ui: AbortController | undefined;

  constructor(private readonly ports: ManagerPorts) {}

  private isActive() {
    return !this.lifetime.signal.aborted;
  }

  /** The lifetime drains only atomic writes; disposal also waits for cancelled transactions' cleanup. */
  private mutate(collection: Collection, operation: Mutation): Promise<MutationResult> {
    const mutation = this.ports.repository.mutate(collection, operation, this.lifetime);
    const settled = () => this.mutations.delete(mutation);
    this.mutations.add(mutation);
    void mutation.then(settled, settled);

    return mutation;
  }

  notify(message: string, severity: "info" | "warning" | "error" = "info") {
    if (this.isActive()) this.ports.notify(displayText(message), severity);
  }

  private automaticWarning() {
    if (this.warned || !this.isActive()) return;
    this.warned = true;
    this.notify(
      "pi-prompt-manager: some prompt history could not be recorded this session. Check collection access, capacity, and lock contention.",
      "warning"
    );
  }

  /** Synchronous event observer: no collection reads/serialization on the input stack. */
  capture(source: string): void {
    if (!this.isActive()) return;
    const recordedAt = this.ports.now().toISOString();
    const text = captureText(source);

    if (text === undefined) return;
    const bytes = Buffer.byteLength(text);

    if (this.queue.length >= limits.queueCount || this.queueBytes + bytes > limits.queueBytes) {
      this.automaticWarning();

      return;
    }

    this.queue.push({ text, recordedAt, bytes });
    this.queueBytes += bytes;

    if (!this.pumping) {
      this.pumping = true;
      queueMicrotask(() => {
        void this.pump();
      });
    }
  }

  private async pump() {
    try {
      while (this.isActive()) {
        const entry = this.queue.shift();

        if (!entry) break;
        this.queueBytes -= entry.bytes;

        try {
          const result = await this.mutate("history", {
            kind: "add",
            text: entry.text,
            recordedAt: entry.recordedAt
          });

          if (
            result.status === "failed" ||
            (result.status === "committed" && result.warnings.length)
          )
            this.automaticWarning();
        } catch {
          this.automaticWarning();
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  async open(collection: Collection, inspectionIndex?: number): Promise<void> {
    if (!this.isActive()) return;

    if (this.ui) {
      this.notify("A prompt-manager view is already open.", "warning");

      return;
    }

    const controller = new AbortController();
    this.ui = controller;

    try {
      await this.ports.open({
        collection,
        inspectionIndex,
        initialEditor: this.ports.editor.read(),
        signal: controller.signal,
        afterClose: async (restoration) => {
          if (!restoration || controller.signal.aborted || this.ui !== controller) return;
          if (restoration.deleteAfterRestore) await this.restoreAndDelete(restoration.target);
          else this.restore(restoration.target);
        }
      });
    } catch (error) {
      this.notify(errorMessage(error), "error");
    } finally {
      if (this.ui === controller) this.ui = undefined;
    }
  }

  private reportMutation(result: MutationResult, success: string): boolean {
    if (result.status === "failed") {
      this.notify(result.message, "error");

      return false;
    }

    if (result.status === "committed")
      this.notify(
        [success, ...result.warnings].join(" "),
        result.warnings.length ? "warning" : "info"
      );

    return result.status === "committed";
  }

  async saveEditor(): Promise<void> {
    if (!this.isActive()) return;

    if (this.saving) {
      this.notify("An editor save is already pending.", "warning");

      return;
    }

    let ownsGuard = false;

    try {
      const recordedAt = this.ports.now().toISOString();
      const text = this.ports.editor.read();

      if (!text.trim()) {
        await this.open("drafts");

        return;
      }

      const revision = this.restorationRevision;
      this.saving = true;
      ownsGuard = true;
      const result = await this.mutate("drafts", { kind: "add", text, recordedAt });

      if (!this.reportMutation(result, "Draft saved.") || !this.isActive()) return;

      try {
        if (this.restorationRevision === revision && this.ports.editor.read() === text)
          this.ports.editor.write("");
      } catch {
        this.notify("Draft saved, but the editor could not be cleared.", "warning");
      }
    } catch (error) {
      this.notify(errorMessage(error), "error");
    } finally {
      if (ownsGuard) this.saving = false;
    }
  }

  async copy(target: Occurrence): Promise<void> {
    if (!this.isActive()) return;

    if (this.copying) {
      this.notify("A clipboard operation is already pending.", "warning");

      return;
    }

    this.copying = true;

    try {
      await this.ports.copy(target.source.text, this.lifetime.signal);
      this.notify("Copied to the native clipboard.", "info");
    } catch (error) {
      this.notify(
        error instanceof NativeClipboardError
          ? error.message
          : "Clipboard operation failed or was cancelled.",
        "error"
      );
    } finally {
      this.copying = false;
    }
  }

  restore(target: Occurrence): boolean {
    if (!this.isActive()) return false;

    try {
      const previous = this.ports.editor.read();
      assertRestorable(target.source.text);
      if (!this.isActive() || this.ports.editor.read() !== previous)
        throw new PromptError("Editor changed during restoration; replacement refused.");
      // Advance before writing, including identical text. A pending save may not clear it.
      this.restorationRevision++;
      this.ports.editor.write(target.source.text);

      return true;
    } catch (error) {
      this.notify(errorMessage(error), "error");

      return false;
    }
  }

  async deleteOccurrence(collection: Collection, target: Occurrence): Promise<MutationResult> {
    if (!this.isActive()) return { status: "failed", message: "Session expired." };
    let result: MutationResult;

    try {
      result = await this.mutate(collection, { kind: "delete", target });
    } catch (error) {
      result = { status: "failed", message: errorMessage(error) };
    }

    this.reportMutation(result, "Entry deleted.");

    return result;
  }

  async restoreAndDelete(target: Occurrence): Promise<boolean> {
    if (!this.restore(target)) return false;
    const result = await this.deleteOccurrence("drafts", target);

    if (result.status === "failed")
      this.notify("Text was restored; deletion failed. The editor was not rolled back.", "warning");

    return true;
  }

  private async numbered(action: NumberedAction, index: number) {
    if (action === "show") {
      await this.open("drafts", index);

      return;
    }

    const current = await this.ports.repository.read("drafts", this.lifetime.signal);

    if (!this.isActive()) return;

    if (current.status === "unavailable") {
      this.notify(current.message, "error");

      return;
    }

    const target = current.entries[index - 1];

    if (!target) {
      this.notify("Draft number is outside the current collection.", "error");

      return;
    }

    switch (action) {
      case "copy":
        await this.copy(target);
        break;
      case "restore":
        this.restore(target);
        break;
      case "restore-and-delete":
        await this.restoreAndDelete(target);
        break;
      case "delete":
        await this.deleteOccurrence("drafts", target);
        break;
    }
  }

  async command(args: string): Promise<void> {
    if (!this.isActive()) return;
    const command = parseCommand(args);

    try {
      switch (command.kind) {
        case "invalid":
          this.notify(usage, "error");
          break;
        case "open":
          await this.open(command.collection);
          break;
        case "save":
          await this.saveEditor();
          break;

        case "add": {
          const result = await this.mutate("drafts", {
            kind: "add",
            text: command.text,
            recordedAt: this.ports.now().toISOString()
          });
          this.reportMutation(result, "Draft saved.");
          break;
        }

        case "numbered":
          await this.numbered(command.action, command.index);
          break;
      }
    } catch (error) {
      this.notify(errorMessage(error), "error");
    }
  }

  /**
   * Stops new writes, notifications, and views before it returns its promise. The promise settles
   * when started mutations have committed or been cancelled, and have released their locks.
   */
  async dispose(): Promise<void> {
    const finishing = this.lifetime.dispose();
    const mutations = [...this.mutations];
    this.queue = [];
    this.queueBytes = 0;
    this.ui?.abort();
    this.ui = undefined;
    await Promise.allSettled([finishing, ...mutations]);
  }
}
