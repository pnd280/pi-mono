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

export type Writer = (text: string | undefined) => void;

type Item<Participant, Owner> = {
  readonly participant: Participant;
  /** `undefined` for an override. */
  readonly component: WorkingMessageComponent | undefined;
  readonly owner: Owner | undefined;
  text: string;
};

export function completeOrder(order: readonly string[], available: readonly string[]): string[] {
  return [...new Set([...order, ...[...available].sort()])];
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The registrations of one runtime. Only live participants' registrations show. Handles can
 * mutate only their own registration.
 */
export class WorkingMessageCoordinator<Participant extends object, Owner> {
  // Overrides stay in the order of their latest text, so the most recent override wins.
  private readonly items = new Set<Item<Participant, Owner>>();
  private readonly writers = new Map<Participant, Writer | undefined>();
  private readonly written = new Map<Participant | undefined, string | undefined>();
  private readonly listeners = new Set<() => void>();
  private order: string[] = [];
  private stopped = false;

  constructor(
    private readonly isLive: (participant: Participant) => boolean,
    /** True after a version mismatch: each participant then writes only its own message. */
    private readonly alone: () => boolean
  ) {}

  register(
    participant: Participant,
    component: WorkingMessageComponent,
    owner: Owner
  ): WorkingMessageHandle {
    const parsed = componentSchema.parse(component);
    // Other extensions' duplicates are resolved among live participants at session start.
    for (const item of this.items)
      if (item.participant === participant && item.component?.id === parsed.id)
        throw new Error(`Duplicate working-message component: ${parsed.id}`);

    return this.track({ participant, component: parsed, owner, text: "" }, (text) =>
      oneLine(displayText(text))
    );
  }

  /** While its text is set, the override replaces the combined message. It keeps SGR styling. */
  registerOverride(participant: Participant): WorkingMessageHandle {
    // Contributions share one line, so only the sole visible text may carry styling.
    return this.track({ participant, component: undefined, owner: undefined, text: "" }, (text) =>
      oneLine(styledOutput(text))
    );
  }

  /** Sets the participant's writer from its `session_start` handler and writes the message. */
  attach(participant: Participant, writer: Writer | undefined): void {
    if (this.stopped) return;
    this.writers.set(participant, writer);
    // A new writer can reach a new UI, so it writes even unchanged text.
    this.written.clear();
    this.publish();
  }

  /** Applies the saved order at the first `session_start` handler of an emission. */
  start(order: readonly string[]): void {
    this.order = [...order];
  }

  setOrder(order: readonly string[]): void {
    this.order = [...order];
    this.publish();
  }

  /** Shown components in display order. */
  snapshot(only?: Participant): WorkingMessageEntry[] {
    const components = this.components(only);

    return completeOrder(this.order, [...components.keys()]).flatMap((id) => {
      const item = components.get(id);

      return item?.component ? [{ ...item.component, text: item.text }] : [];
    });
  }

  /** IDs that more than one live component uses. None of them shows. */
  duplicates(): string[] {
    return [...this.components(undefined)].flatMap(([id, item]) => (item ? [] : [id]));
  }

  /** Every registered component's participant and owner, live or not. */
  owners(): { participant: Participant; owner: Owner }[] {
    return [...this.items].flatMap(({ participant, owner }) =>
      owner === undefined ? [] : [{ participant, owner }]
    );
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  shutdown(): void {
    if (this.stopped) return;
    this.items.clear();
    this.publish();
    this.stopped = true;
    this.writers.clear();
    this.listeners.clear();
  }

  private track(
    item: Item<Participant, Owner>,
    normalize: (text: string) => string
  ): WorkingMessageHandle {
    if (this.stopped) throw new Error("Working-message runtime has stopped.");
    this.items.add(item);
    this.publish();

    return {
      setText: (text) => {
        if (!this.items.has(item)) return;
        const normalized = normalize(text ?? "");
        if (item.text === normalized) return;
        item.text = normalized;

        if (!item.component) {
          this.items.delete(item);
          this.items.add(item);
        }

        this.publish();
      },
      dispose: () => {
        if (this.items.delete(item)) this.publish();
      }
    };
  }

  /** Live components by ID. An ID that more than one live component uses maps to `undefined`. */
  private components(
    only: Participant | undefined
  ): Map<string, Item<Participant, Owner> | undefined> {
    const components = new Map<string, Item<Participant, Owner> | undefined>();

    for (const item of this.items)
      if (item.component && this.shows(item, only))
        components.set(item.component.id, components.has(item.component.id) ? undefined : item);

    return components;
  }

  private shows(item: Item<Participant, Owner>, only: Participant | undefined): boolean {
    return (only === undefined || item.participant === only) && this.isLive(item.participant);
  }

  private text(only: Participant | undefined): string | undefined {
    let text = this.snapshot(only)
      .map((entry) => entry.text)
      .filter(Boolean)
      .join(" · ");
    for (const item of this.items)
      if (!item.component && item.text && this.shows(item, only)) text = item.text;

    return text || undefined;
  }

  private publish(): void {
    if (this.alone())
      for (const [participant, writer] of this.writers)
        this.write(participant, writer, this.text(participant));
    else {
      const [writer] = this.writers.values();
      this.write(undefined, writer, this.text(undefined));
    }

    for (const listener of this.listeners) listener();
  }

  /** Writes only changed text, so a participant writing alone does not overwrite unchanged. */
  private write(
    scope: Participant | undefined,
    writer: Writer | undefined,
    text: string | undefined
  ): void {
    if (!writer || (this.written.has(scope) && this.written.get(scope) === text)) return;
    this.written.set(scope, text);
    writer(text);
  }
}
