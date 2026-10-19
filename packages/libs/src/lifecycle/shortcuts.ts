import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";

import { report, reportFailure, type Entry, type Notify } from "../coordination/index.ts";
import { canonicalKeySchema, keysOverlap } from "../tui/keybindings/index.ts";
import { displayText } from "../tui/terminal-text/index.ts";

export type ShortcutOptions = {
  description?: string;
  handler: (ctx: ExtensionContext) => Promise<void> | void;
};

export type ShortcutClaim = {
  key: string;
  options: ShortcutOptions;
  registerShortcut: ExtensionAPI["registerShortcut"];
};

type Valid = { entry: Entry<ShortcutClaim>; key: KeyId };

/**
 * Registers each uncontested claim through its claimant. Claims whose keys overlap, directly
 * or through another claim, form one conflict, and no claimant in it registers its key.
 */
export function resolveShortcutClaims(
  claims: readonly Entry<ShortcutClaim>[],
  notify: Notify | undefined
): void {
  const groups: Valid[][] = [];

  for (const entry of claims) {
    const key = canonicalKeySchema.safeParse(entry.value.key).data;

    if (key === undefined) {
      report(
        notify,
        `${entry.participant.id}: shortcut ${JSON.stringify(displayText(entry.value.key))} is invalid, so it is not registered.`,
        "warning"
      );
      continue;
    }

    const touching = groups.filter((group) => group.some((other) => keysOverlap(other.key, key)));
    const merged = [...touching.flat(), { entry, key }];
    groups.splice(0, groups.length, ...groups.filter((group) => !touching.includes(group)), merged);
  }

  for (const group of groups) {
    const [only, ...others] = group;
    if (!only) continue;

    if (others.length === 0) {
      register(only, notify);
      continue;
    }

    const keys = [...new Set(group.map((claim) => claim.key))].join('", "');
    const ids = [...new Set(group.map((claim) => claim.entry.participant.id))].join(", ");
    report(
      notify,
      `@pi-mono/libs: shortcut "${keys}" is claimed by ${ids}, so none of them registers it.`,
      "warning"
    );
  }
}

function register({ entry, key }: Valid, notify: Notify | undefined): void {
  try {
    entry.value.registerShortcut(key, entry.value.options);
  } catch (error) {
    reportFailure(notify, entry.participant, `shortcut "${key}" registration`, error);
  }
}
