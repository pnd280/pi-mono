import { z } from "zod";

import { displayText, styledOutput } from "../tui/terminal-text/index.ts";

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

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** One runtime owns the writer; handles can mutate only their own registration. */
export class WorkingMessageCoordinator {
  private readonly entries = new Map<string, WorkingMessageEntry>();
  // Kept in the order of their latest text, so the most recent override wins.
  private readonly overrides = new Set<{ text: string }>();
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
        const normalized = oneLine(displayText(text ?? ""));
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

  /** While its text is set, the override replaces the combined message. It keeps SGR styling. */
  registerOverride(): WorkingMessageHandle {
    if (this.stopped) throw new Error("Working-message runtime has stopped.");
    const override = { text: "" };
    this.overrides.add(override);

    return {
      setText: (text) => {
        if (!this.overrides.has(override)) return;
        // Contributions share one line, so only the sole visible text may carry styling.
        const normalized = oneLine(styledOutput(text ?? ""));
        if (override.text === normalized) return;
        override.text = normalized;
        this.overrides.delete(override);
        this.overrides.add(override);
        this.publish();
      },
      dispose: () => {
        if (!this.overrides.delete(override)) return;
        this.publish();
      }
    };
  }

  start(writer: ((text: string | undefined) => void) | undefined, order: readonly string[]): void {
    if (this.stopped) return;
    for (const entry of this.entries.values()) entry.text = "";
    for (const override of this.overrides) override.text = "";
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
    this.overrides.clear();
    this.writer?.(undefined);
    this.writer = undefined;
    this.listeners.clear();
  }

  private publish(): void {
    let text = this.snapshot()
      .map((entry) => entry.text)
      .filter(Boolean)
      .join(" · ");
    for (const override of this.overrides) if (override.text) text = override.text;
    this.writer?.(text || undefined);
    for (const listener of this.listeners) listener();
  }
}
