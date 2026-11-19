import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";

import { renameWithRetry } from "@pi-mono/libs/file-rename";

import { mapSectionBody, sectionBody } from "./rules.ts";

/** The bash and PowerShell tools' guideline, as Pi renders it in the `rules` section. */
const PI_ENV_BULLET =
  "- You can inspect PI_* environment variables for current model and session details.";

type Sections = Record<string, string | null>;

/**
 * The effective `docs` body after replaying the transcript's system messages, which the docs file holds. Later messages replace a section by name, and `null` removes it.
 */
export function latestDocsBody(sectionsList: readonly Sections[]): string | undefined {
  let body: string | undefined;

  for (const sections of sectionsList) {
    if (!("docs" in sections)) continue;

    const docs = sections.docs;
    body = typeof docs === "string" ? sectionBody("docs", docs) : undefined;
  }

  return body;
}

/**
 * Replaces each `docs` section body with a pointer to `docsFile`, and removes the PI_* bullet from `rules` while a `docs` section is in effect. Pi adds and removes `docs` together with `rules`, but a `rules` patch alone adds or drops the bullet when the shell tools change, so that patch also gets a matching `docs` patch.
 */
export function collapseDocs(sectionsList: readonly Sections[], docsFile: string): void {
  let docsActive = false;
  let piEnv = false;

  for (const sections of sectionsList) {
    if ("docs" in sections) docsActive = typeof sections.docs === "string";

    const previousPiEnv: boolean = piEnv;
    const rules = sections.rules;

    if (typeof rules === "string") {
      const lines = sectionBody("rules", rules).split("\n");
      const kept = lines.filter((line) => line !== PI_ENV_BULLET);
      piEnv = docsActive && kept.length < lines.length;

      if (piEnv) sections.rules = mapSectionBody("rules", rules, () => kept.join("\n"));
    } else if (rules === null) {
      piEnv = false;
    }

    if (docsActive && (typeof sections.docs === "string" || piEnv !== previousPiEnv)) {
      sections.docs = `<docs>\n${docsPointer(docsFile, piEnv)}\n</docs>`;
    }
  }
}

function docsPointer(docsFile: string, piEnv: boolean): string {
  const pointer = `Read ${docsFile} only when asked about Pi or before extending or changing the Pi harness.`;

  return piEnv ? `${pointer} PI_* env vars hold current model and session details.` : pointer;
}

/**
 * Writes `content` to `path` unless the file already holds it. The write goes through a new private temporary file and a rename, so concurrent readers never see a partial file.
 */
export async function syncDocsFile(path: string, content: string): Promise<void> {
  if ((await readFile(path, "utf8").catch(() => undefined)) === content) return;

  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
    await renameWithRetry(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
