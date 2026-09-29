export const compactionStatusKey = "pi-smart-compact.compactions";

interface BranchReader {
  getBranch(): readonly { type: string }[];
}

/** Counts successful compactions on the active branch; failed attempts never persist an entry. */
export function countCompactions(sessionManager: BranchReader) {
  return sessionManager.getBranch().filter((entry) => entry.type === "compaction").length;
}

export function compactionStatusText(count: number): string | undefined {
  return count > 0 ? `compacted ${count}×` : undefined;
}

export function updateCompactionStatus(ctx: {
  hasUI: boolean;
  sessionManager: BranchReader;
  ui: {
    theme: { fg(color: "dim", text: string): string };
    setStatus(key: string, text: string | undefined): void;
  };
}) {
  // Headless hosts expose a no-op UI whose theme is uninitialized outside the CLI.
  if (!ctx.hasUI) return;

  const text = compactionStatusText(countCompactions(ctx.sessionManager));

  ctx.ui.setStatus(
    compactionStatusKey,
    text === undefined ? undefined : ctx.ui.theme.fg("dim", text)
  );
}
