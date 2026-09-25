import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { z } from "zod";

export const SETTINGS_KEY = "ext.pi-tool-display";

const rendererModeSchema = z.enum(["auto", "generic", "original"]);
// Zod records omit __proto__, but every exact tool name must be validated and retained.
const rendererOverridesSchema = z
  .preprocess(
    (value) => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return value;

      return new Map(Object.entries(value));
    },
    z.map(z.string().min(1), rendererModeSchema)
  )
  .transform((entries) => Object.fromEntries(entries));
const settingsSchema = z.strictObject({
  showParameters: z.boolean().optional(),
  rendererOverrides: rendererOverridesSchema.optional()
});
const sourceSchema = z.object({ [SETTINGS_KEY]: z.unknown().optional() });

export type RendererMode = z.infer<typeof rendererModeSchema>;

export interface DisplaySettings {
  valid: boolean;
  showParameters: boolean;
  rendererOverrides: Readonly<Record<string, RendererMode>>;
  warnings: string[];
}

export interface SettingsSource {
  path: string;
  settings: unknown;
}

/** Validate every applicable source before merging, including values overridden later. */
export function loadDisplaySettings(sources: readonly SettingsSource[]): DisplaySettings {
  const rendererOverrides: Record<string, RendererMode> = {};
  Object.setPrototypeOf(rendererOverrides, null);
  const warnings: string[] = [];
  let showParameters = false;

  for (const source of sources) {
    const section = sourceSchema.safeParse(source.settings).data?.[SETTINGS_KEY];
    if (section === undefined) continue;
    const parsed = settingsSchema.safeParse(section);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const paths =
          issue.code === "unrecognized_keys"
            ? issue.keys.map((key) => [...issue.path, key])
            : [issue.path];
        for (const path of paths)
          warnings.push(
            compactDisplayText(
              `${source.path}: invalid ${[SETTINGS_KEY, ...path].join(".")}; keeping original rendering and disabling display observation.`
            )
          );
      }

      continue;
    }

    if (parsed.data.showParameters !== undefined) showParameters = parsed.data.showParameters;
    Object.assign(rendererOverrides, parsed.data.rendererOverrides);
  }

  return {
    valid: warnings.length === 0,
    showParameters: warnings.length ? false : showParameters,
    rendererOverrides: warnings.length ? {} : rendererOverrides,
    warnings
  };
}
