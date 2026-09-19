import { z } from "zod";

import { displayText } from "../tui/terminal-text/index.ts";

const componentSchema = z.object({
  id: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/)
    .max(200),
  label: z.string().trim().min(1).max(200),
  contributor: z.string().trim().min(1).max(200)
});

export type WorkingMessageComponent = z.infer<typeof componentSchema>;

export type WorkingMessageEntry = WorkingMessageComponent & { text: string };

export type WorkingMessageHandle = {
  setText(text?: string): void;
  dispose(): void;
};

export function completeOrder(order: readonly string[], available: readonly string[]): string[] {
  return [...new Set([...order, ...[...available].sort()])];
}

/** One runtime owns the writer; handles can mutate only their own registration. */
export class WorkingMessageCoordinator {
  private readonly entries = new Map<string, WorkingMessageEntry>();
  private readonly listeners = new Set<() => void>();
  private order: string[] = [];
  private writer: ((text: string | undefined) => void) | undefined;
  private stopped = false;

  register(component: WorkingMessageComponent): WorkingMessageHandle {
    const parsed = componentSchema.parse(component);
    if (this.stopped) throw new Error("Working-message runtime has stopped.");
    if (this.entries.has(parsed.id)) throw new Error(`Duplicate working-message id: ${parsed.id}`);
    const entry = { ...parsed, text: "" };
    this.entries.set(entry.id, entry);
    this.publish();

    return {
      setText: (text) => {
        if (this.entries.get(entry.id) !== entry) return;
        const normalized = displayText(text ?? "")
          .replace(/\s+/g, " ")
          .trim();
        if (entry.text === normalized) return;
        entry.text = normalized;
        this.publish();
      },
      dispose: () => {
        if (this.entries.get(entry.id) !== entry) return;
        this.entries.delete(entry.id);
        this.publish();
      }
    };
  }

  start(writer: ((text: string | undefined) => void) | undefined, order: readonly string[]): void {
    if (this.stopped) return;
    for (const entry of this.entries.values()) entry.text = "";
    this.writer = writer;
    this.setOrder(order);
  }

  setOrder(order: readonly string[]): void {
    this.order = [...order];
    this.publish();
  }

  snapshot(): WorkingMessageEntry[] {
    return completeOrder(this.order, [...this.entries.keys()]).flatMap((id) => {
      const entry = this.entries.get(id);

      return entry ? [{ ...entry }] : [];
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  shutdown(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.entries.clear();
    this.writer?.(undefined);
    this.writer = undefined;
    this.listeners.clear();
  }

  private publish(): void {
    const text = this.snapshot()
      .map((entry) => entry.text)
      .filter(Boolean)
      .join(" · ");
    this.writer?.(text || undefined);
    for (const listener of this.listeners) listener();
  }
}
