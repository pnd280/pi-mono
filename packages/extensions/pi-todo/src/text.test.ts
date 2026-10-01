import { expect, it } from "vite-plus/test";

import { presentCompactTaskText, presentTaskDescription } from "./text.ts";

it.each([
  { name: "compact fields", present: presentCompactTaskText, maximum: 200 },
  { name: "descriptions", present: presentTaskDescription, maximum: 4000 }
])("keeps complete graphemes in legacy $name excerpts", ({ present, maximum }) => {
  const prefix = "x".repeat(maximum - 2);
  expect(present("😀".repeat(maximum))).toBe("😀".repeat(maximum));
  expect(present(prefix + "yz!")).toBe(prefix + "y…");

  for (const cluster of ["e\u0301", "👩‍💻"]) {
    const source = prefix + cluster + "suffix";
    expect(present(source)).toBe(prefix + "…");
  }
});
