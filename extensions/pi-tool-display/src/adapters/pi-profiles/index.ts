import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { formatNoticeRefs, profileNoticeSchema } from "pi-profiles/notice";

import type { ToolDisplayAdapter } from "../../contracts.ts";
import {
  toolSearchDisplayAdapter,
  toolSearchParametersSchema
} from "../builtin/tool-search/index.ts";
import { registeredBy } from "../provenance.ts";

const profilesToolSearchDisplayAdapter: ToolDisplayAdapter = {
  ...toolSearchDisplayAdapter,
  id: "pi-profiles:tool_search"
};

/** Pure: the transition text of a `pi-profiles.notice` message; undefined when its details are invalid. */
export function profileNoticeText(details: unknown): string | undefined {
  const notice = profileNoticeSchema.safeParse(details).data;
  if (!notice) return undefined;

  switch (notice.kind) {
    case "switched": {
      const { from, to } = formatNoticeRefs(notice.from, notice.to);

      return `${from} \u2192 ${to}`;
    }

    case "set":
      return notice.to.name;

    case "cleared":
      return `cleared (was ${notice.from.name})`;

    case "unavailable":
      return `unavailable (was ${notice.from.name})`;
  }
}

/** pi-profiles registers Pi's own `tool_search` in place of the built-in, so its calls look the same. */
export function piProfilesAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  if (
    tool?.name !== "tool_search" ||
    !registeredBy(tool, "pi-profiles") ||
    !toolSearchParametersSchema.safeParse(tool.parameters).success
  )
    return undefined;

  return profilesToolSearchDisplayAdapter;
}
