import type { SessionManager } from "@earendil-works/pi-coding-agent";

import type { DisplayCall, DisplayFact } from "../contracts.ts";
import { DisplayRecordIndex } from "./metadata.ts";

export type HistorySource = Pick<SessionManager, "getBranch" | "getLeafId" | "getEntry">;

/** Index only the selected ancestry; divergent branches must drop old timestamp associations. */
export class DisplayHistory {
  private metadata: DisplayRecordIndex;
  private messageEntries: Map<number, string>;
  private indexedLeaf: string | null;
  constructor(private source: HistorySource) {
    const branch = source.getBranch();
    this.metadata = new DisplayRecordIndex(branch);
    this.messageEntries = new Map(
      branch.flatMap((entry) =>
        entry.type === "message" && entry.message.role === "assistant"
          ? [[entry.message.timestamp, entry.id] as const]
          : []
      )
    );
    this.indexedLeaf = source.getLeafId();
  }
  messageEntry(timestamp: number): string | undefined {
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
      // must drop stale timestamp associations even before the host reconstructs.
      if (id !== this.indexedLeaf) this.messageEntries.clear();
      for (const entry of added.reverse())
        if (entry.type === "message" && entry.message.role === "assistant")
          this.messageEntries.set(entry.message.timestamp, entry.id);
      this.indexedLeaf = leaf;
    }

    return this.messageEntries.get(timestamp);
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
