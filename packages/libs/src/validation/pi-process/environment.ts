import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { vi } from "vite-plus/test";

/**
 * Any provider variable can authenticate, so in-process fixtures keep only these names, compared
 * in upper case because Windows names ignore case.
 */
const inheritedEnvironment = new Set([
  "PATH",
  "TERM",
  "COLORTERM",
  "LANG",
  "SYSTEMROOT",
  "TMPDIR",
  "TMP",
  "TEMP"
]);

/**
 * Stubs `process.env` for an in-process Pi fixture whose private files live in `directory`. The
 * caller restores it with `vi.unstubAllEnvs()`.
 */
export function isolateEnvironment(directory: string): void {
  for (const name of Object.keys(process.env))
    if (!inheritedEnvironment.has(name.toUpperCase())) vi.stubEnv(name, undefined);
  // A private home also hides file credentials, such as Google's application defaults.
  const home = join(directory, "home");
  mkdirSync(home);
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("PI_CODING_AGENT_DIR", join(directory, "agent"));
  vi.stubEnv("PI_OFFLINE", "1");
}
