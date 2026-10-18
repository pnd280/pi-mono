import type { ToolInfo } from "@earendil-works/pi-coding-agent";

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
