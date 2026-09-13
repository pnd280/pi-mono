export const SETTINGS_KEY = "ext.pi-tool-display";
export type RendererMode = "auto" | "generic" | "original";
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
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Validate every applicable source before merging, including values overridden later. */
export function loadDisplaySettings(sources: readonly SettingsSource[]): DisplaySettings {
  const rendererOverrides: Record<string, RendererMode> = Object.create(null);
  const warnings: string[] = [];
  let showParameters = false;
  for (const source of sources) {
    const section = object(source.settings) ? source.settings[SETTINGS_KEY] : undefined;
    if (section === undefined) continue;
    const invalid = (key: string) =>
      warnings.push(
        `${source.path}: invalid ${key}; keeping original rendering and disabling display observation.`
      );
    if (!object(section)) {
      invalid(SETTINGS_KEY);
      continue;
    }
    for (const key of Object.keys(section))
      if (key !== "rendererOverrides" && key !== "showParameters")
        invalid(`${SETTINGS_KEY}.${key}`);
    if (section.showParameters !== undefined) {
      if (typeof section.showParameters !== "boolean") invalid(`${SETTINGS_KEY}.showParameters`);
      else showParameters = section.showParameters;
    }
    const overrides = section.rendererOverrides;
    if (overrides === undefined) continue;
    if (!object(overrides)) {
      invalid(`${SETTINGS_KEY}.rendererOverrides`);
      continue;
    }
    for (const [name, value] of Object.entries(overrides)) {
      if (name.length === 0 || (value !== "auto" && value !== "generic" && value !== "original")) {
        invalid(`${SETTINGS_KEY}.rendererOverrides.${name}`);
      } else rendererOverrides[name] = value;
    }
  }
  return {
    valid: warnings.length === 0,
    showParameters: warnings.length ? false : showParameters,
    rendererOverrides: warnings.length ? {} : rendererOverrides,
    warnings
  };
}
