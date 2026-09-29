export const compactionStatusKey = "pi-smart-compact.compactions";

interface BranchReader {
  getBranch(): readonly { type: string }[];
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

  const count = ctx.sessionManager
    .getBranch()
    .filter((entry) => entry.type === "compaction").length;

  ctx.ui.setStatus(
    compactionStatusKey,
    count > 0 ? ctx.ui.theme.fg("dim", `compacted ${count}×`) : undefined
  );
}
