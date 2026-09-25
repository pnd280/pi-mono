import { randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { lockSync } from "proper-lockfile";
import { z } from "zod";

import { MAX_SETTINGS_FILE_BYTES, readSettingsFile } from "../settings-file/index.ts";
import { compactDisplayText } from "../tui/terminal-text/index.ts";

const recordSchema = z.record(z.string(), z.unknown());
const orderSchema = z
  .array(z.string().min(1).max(200))
  .max(1000)
  .transform((ids) => [...new Set(ids)]);
const sectionSchema = z.object({ order: orderSchema.optional() }).passthrough();

export type WorkingMessageScope = "global" | "project";

export type WorkingMessagePreferences = {
  global: string[] | undefined;
  project: string[] | undefined;
  warnings: string[];
};

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function writeTarget(path: string): string {
  try {
    lstatSync(path);
  } catch (error) {
    if (missing(error)) return path;
    throw error;
  }

  // Keep dotfile symlinks intact; a dangling link fails rather than being replaced.
  return realpathSync(path);
}

function readSettings(path: string): Record<string, unknown> {
  try {
    const source = readSettingsFile(path);
    if (source === undefined)
      throw new Error("Settings must be a complete regular file up to 1 MiB.");

    return recordSchema.parse(JSON.parse(source));
  } catch (error) {
    if (missing(error)) return {};
    throw new Error(
      `Cannot read settings at ${compactDisplayText(path)}. Check access, JSON syntax, and the 1 MiB file limit.`
    );
  }
}

function readSection(record: Record<string, unknown>) {
  const parsed = sectionSchema.safeParse(
    record.workingMessage === undefined ? {} : record.workingMessage
  );
  if (!parsed.success)
    throw new Error("Invalid workingMessage settings. Expected an order array of component ids.");

  return parsed.data;
}

export class WorkingMessageSettings {
  readonly paths: Record<WorkingMessageScope, string>;

  constructor(
    private readonly options: { cwd: string; projectTrusted: boolean; agentDir?: string }
  ) {
    this.paths = {
      global: join(options.agentDir ?? getAgentDir(), "settings.json"),
      project: join(options.cwd, CONFIG_DIR_NAME, "settings.json")
    };
  }

  load(): WorkingMessagePreferences {
    const warnings: string[] = [];

    const readOrder = (scope: WorkingMessageScope) => {
      try {
        return readSection(readSettings(this.paths[scope])).order;
      } catch {
        warnings.push(
          `Cannot load working-message order from ${compactDisplayText(this.paths[scope])}. Check access, syntax, and the 1 MiB regular-file limit.`
        );

        return undefined;
      }
    };

    const global = readOrder("global");
    const project = this.options.projectTrusted ? readOrder("project") : undefined;

    return { global, project, warnings };
  }

  save(scope: WorkingMessageScope, order: readonly string[]): void {
    if (scope === "project" && !this.options.projectTrusted)
      throw new Error("Trust this project before saving project settings.");
    const parsed = orderSchema.safeParse(order);
    if (!parsed.success)
      throw new Error("Cannot save this component order: too many or invalid component ids.");
    const path = this.paths[scope];
    let temporary: string | undefined;
    let release: (() => void) | undefined;

    try {
      mkdirSync(dirname(path), { recursive: true });
      // Use Pi's settings lock convention so unrelated host saves cannot race this merge.
      release = lockSync(path, { realpath: false });
      const target = writeTarget(path);
      temporary = `${target}.${randomUUID()}.tmp`;
      const record = readSettings(path);
      const section = readSection(record);
      record.workingMessage = { ...section, order: parsed.data };
      let mode = 0o600;

      try {
        mode = statSync(path).mode & 0o777;
      } catch (error) {
        if (!missing(error)) throw error;
      }

      const content = `${JSON.stringify(record, null, 2)}\n`;
      if (Buffer.byteLength(content) > MAX_SETTINGS_FILE_BYTES)
        throw new Error("Saving would exceed the settings file limit.");
      writeFileSync(temporary, content, { flag: "wx", mode });
      renameSync(temporary, target);
    } catch {
      throw new Error(
        `Cannot save ${compactDisplayText(path)}. Check access, syntax, the 1 MiB regular-file limit, and whether another process holds its lock.`
      );
    } finally {
      try {
        if (temporary) rmSync(temporary, { force: true });
      } finally {
        release?.();
      }
    }
  }
}
