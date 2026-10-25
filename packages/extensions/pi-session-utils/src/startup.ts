import { existsSync } from "node:fs";

import {
  parseArgs,
  SessionManager,
  type Args,
  type ExtensionAPI,
  type SessionEntry
} from "@earendil-works/pi-coding-agent";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";
import { z } from "zod";

import { resolveParentSession } from "./parent.ts";

const referenceSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);
const startupClaim = Symbol.for("pi-session-utils.parent-session-startup");
/** Entry types that a fresh session can hold; any other entry is history. */
const FRESH_ENTRIES: ReadonlySet<SessionEntry["type"]> = new Set([
  "model_change",
  "thinking_level_change",
  "session_info"
]);

function applyStartupParent(manager: SessionManager, args: Args): void {
  if (
    args.continue ||
    args.resume ||
    args.session !== undefined ||
    args.sessionId !== undefined ||
    args.fork !== undefined
  ) {
    throw new Error(
      "--parent-session cannot be combined with --continue, --resume, --session, --session-id, or --fork"
    );
  }

  const reference = referenceSchema.safeParse(args.unknownFlags.get("parent-session"));
  if (!reference.success)
    throw new Error("--parent-session requires a session file or exact session ID");
  const file = manager.getSessionFile();
  const header = manager.getHeader();
  const hasHistory = manager.getEntries().some((entry) => !FRESH_ENTRIES.has(entry.type));

  if (!header || header.parentSession || hasHistory || (file && existsSync(file))) {
    throw new Error("--parent-session only applies to a fresh session");
  }

  const sessionDir =
    manager.getSessionDir() || args.sessionDir || process.env.PI_CODING_AGENT_SESSION_DIR;
  const parent = resolveParentSession(reference.data, manager.getCwd(), sessionDir);
  // Pi currently returns its live header. Do not silently succeed if a future host returns a copy.
  if (manager.getHeader() !== header) throw new Error("Pi no longer exposes a live session header");
  header.parentSession = parent;
}

export function installParentSessionStartup(pi: Pick<ExtensionAPI, "on" | "getFlag">): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.unknownFlags.has("parent-session") || args.help || args.listModels !== undefined)
    return;
  // Extension factories run again on reload and session replacement. This CLI flag is startup-only.
  if (Reflect.get(SessionManager.prototype, startupClaim) === true) return;
  Reflect.set(SessionManager.prototype, startupClaim, true);
  const hooks = new OwnedHooks();
  // Retain the method unbound so forwarding preserves the manager receiver.
  // oxlint-disable-next-line typescript/unbound-method
  const original = SessionManager.prototype.buildSessionContext;
  let active = true;

  const dispose = () => {
    active = false;
    hooks.restore();
  };

  // CLI/SDK context reconstruction runs after resource loading, before session binding and JSON
  // output. A session_start error is swallowed by Pi, so validate here to fail startup instead.
  hooks.replace(SessionManager.prototype, "buildSessionContext", function (this: SessionManager) {
    // CLI flag values become available only after all extension factories have finished.
    // Ignore scratch managers reconstructed by another factory before that boundary.
    if (active && pi.getFlag("parent-session") !== undefined) {
      dispose();
      applyStartupParent(this, args);
    }

    return original.call(this);
  });
  pi.on("session_shutdown", dispose);
}
