/** Stable terminal glyphs shared by TUI renderers. */
const bullet = "•";
const activeBullet = "◦";

export const TUI_GLYPHS = {
  bullet,
  activeBullet,
  expanded: "▾",
  closed: "▸",
  collapse: "▴",
  queued: "◌",
  outcome: {
    success: "✓",
    failure: "✗",
    cancelled: "⊘"
  },
  taskStatus: {
    pending: activeBullet,
    in_progress: bullet,
    completed: "✓",
    deleted: "×"
  },
  tree: {
    guide: "│",
    branch: "├",
    lastBranch: "└",
    horizontal: "─"
  }
} as const;
