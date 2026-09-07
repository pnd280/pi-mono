import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: [
    "**/.agents/**/*",
    "**/.pi/**/*.json",
    "**/.pi/**/*.jsonl",
    "**/.pi/worktrees/**/*",
    "**/dist/**/*",
    "**/node_modules/**/*",
  ],
  sortImports: {
    groups: [
      "builtin",
      "external",
      ["internal", "subpath"],
      ["parent", "sibling", "index"],
      "style",
      "unknown",
    ],
    newlinesBetween: true,
  },
});
