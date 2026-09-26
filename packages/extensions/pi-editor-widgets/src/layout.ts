import { z } from "zod";

export const regions = ["aboveEditor", "belowEditor", "footer"] as const;

export type Region = (typeof regions)[number];

export const widgetIdSchema = z
  .string()
  .max(4096)
  .regex(/^(?:builtin:.+|(?:widget|status):.*)$/su);

const itemSchema = z.union([z.literal("separator"), z.literal("flex"), widgetIdSchema]);

export const layoutSchema = z
  .object({
    aboveEditor: z.array(z.array(itemSchema).max(1000)).max(1000),
    belowEditor: z.array(z.array(itemSchema).max(1000)).max(1000),
    footer: z.array(z.array(itemSchema).max(1000)).max(1000),
    hidden: z.array(widgetIdSchema).max(10000)
  })
  .strict()
  .superRefine((layout, ctx) => {
    // Rows may repeat a contribution elsewhere; hidden means placed nowhere.
    const placed = new Set<string>();

    for (const region of regions)
      for (const row of layout[region]) {
        if (row.filter((item) => item === "flex").length > 1)
          ctx.addIssue({ code: "custom", message: "A row may contain only one flex separator." });
        const ids = row.filter(isWidget);
        if (new Set(ids).size !== ids.length)
          ctx.addIssue({ code: "custom", message: "A row may contain each widget ID only once." });
        for (const id of ids) placed.add(id);
      }

    if (new Set(layout.hidden).size !== layout.hidden.length)
      ctx.addIssue({ code: "custom", message: "Hidden widget IDs must be unique." });
    if (layout.hidden.some((id) => placed.has(id)))
      ctx.addIssue({ code: "custom", message: "Hidden widget IDs cannot also be placed." });
  });

export type Layout = z.output<typeof layoutSchema>;

export type Placement = { id: string; region: Region };

export function isWidget(id: string): boolean {
  return id !== "separator" && id !== "flex";
}

export function defaultLayout(): Layout {
  return {
    aboveEditor: [],
    belowEditor: [],
    footer: [
      ["builtin:cwd", "separator", "builtin:git-branch", "separator", "builtin:session-title"],
      ["builtin:tokens", "separator", "builtin:context", "flex", "builtin:model"]
    ],
    hidden: []
  };
}

export function listedIds(layout: Layout): Set<string> {
  return new Set([
    ...layout.hidden,
    ...regions.flatMap((region) => layout[region].flat().filter(isWidget))
  ]);
}

/** Unlisted contributions retain defaults; empty regions do not implicitly hide future registrations. */
export function resolveLayout(
  saved: Layout | undefined,
  contributions: readonly Placement[]
): Layout {
  const layout = structuredClone(saved ?? defaultLayout());
  const seen = listedIds(layout);
  const defaults = defaultLayout();

  for (const row of defaults.footer) {
    const missing = row.filter((item) => !isWidget(item) || !seen.has(item));
    if (missing.some(isWidget)) layout.footer.push(missing);
    for (const item of row) if (isWidget(item)) seen.add(item);
  }

  const statuses: string[] = [];

  for (const { id, region } of contributions) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (id.startsWith("status:")) statuses.push(id);
    else layout[region].push([id]);
  }

  if (statuses.length)
    layout.footer.push(
      statuses
        .sort((a, b) => a.localeCompare(b))
        .flatMap((id, index) => (index ? ["separator", id] : [id]))
    );

  return layout;
}
