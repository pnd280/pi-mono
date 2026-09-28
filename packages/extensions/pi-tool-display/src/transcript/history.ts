import type { SessionManager } from "@earendil-works/pi-coding-agent";

import type { DisplayCall, DisplayFact } from "../contracts.ts";
import { DisplayRecordIndex } from "./metadata.ts";

export type HistorySource = Pick<SessionManager, "getBranch" | "getLeafId" | "getEntry">;

/** Index only the selected ancestry; divergent branches must drop old call associations. */
export class DisplayHistory {
  private metadata: DisplayRecordIndex;
  private messageEntries: Map<number, Map<string, string>>;
  private indexedLeaf: string | null;
  constructor(private source: HistorySource) {
    const branch = source.getBranch();
    this.metadata = new DisplayRecordIndex(branch);
    this.messageEntries = new Map();
    for (const entry of branch) this.indexMessage(entry);
    this.indexedLeaf = source.getLeafId();
  }
  private indexMessage(entry: ReturnType<HistorySource["getEntry"]>): void {
    if (!entry || entry.type !== "message" || entry.message.role !== "assistant") return;
    const entries = this.messageEntries.get(entry.message.timestamp) ?? new Map<string, string>();
    for (const [index, content] of entry.message.content.entries())
      if (content.type === "toolCall") entries.set(JSON.stringify([index, content.id]), entry.id);
    this.messageEntries.set(entry.message.timestamp, entries);
  }
  messageEntry(timestamp: number, contentIndex: number, toolCallId: string): string | undefined {
    const manager = this.source;
    const leaf = manager.getLeafId();

    if (leaf !== this.indexedLeaf) {
      const added: ReturnType<typeof manager.getBranch> = [];
      let id = leaf;

      while (id && id !== this.indexedLeaf) {
        const entry = manager.getEntry(id);
        if (!entry) break;
        added.push(entry);
        id = entry.parentId;
      }

      // Usually only the newly appended entries are visited. A divergent ancestry
      // must drop stale call associations even before the host reconstructs.
      if (id !== this.indexedLeaf) this.messageEntries.clear();
      for (const entry of added.reverse()) this.indexMessage(entry);
      this.indexedLeaf = leaf;
    }

    return this.messageEntries.get(timestamp)?.get(JSON.stringify([contentIndex, toolCallId]));
  }
  facts(call: DisplayCall): readonly DisplayFact[] {
    const records = this.metadata.forCall(call.reference);
    const facts = records
      .filter((record) => record.adapter === call.adapter.id && record.fact.kind !== "cancellation")
      .map((record) => record.fact);
    // A recorded cancellation remains known when the renderer changes.
    const cancelled = records.some(
      ({ fact }) =>
        fact.kind === "cancellation" || (fact.kind === "operation" && fact.outcome === "cancelled")
    );

    return cancelled ? [...facts, { kind: "cancellation", availability: "available" }] : facts;
  }
}
