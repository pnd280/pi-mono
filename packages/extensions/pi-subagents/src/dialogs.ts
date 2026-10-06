import type {
  ExtensionUIContext,
  RpcExtensionUIRequest,
  RpcExtensionUIResponse
} from "@earendil-works/pi-coding-agent";
import { displayText } from "@pi-mono/libs/tui/terminal-text";

import { boundedText } from "./result.ts";

/** Fire-and-forget child UI stays local; only dialog replies flow back down. */
export async function forwardDialog(
  request: RpcExtensionUIRequest,
  description: string,
  ui: Pick<ExtensionUIContext, "select" | "confirm" | "input" | "editor">,
  signal: AbortSignal
): Promise<RpcExtensionUIResponse | undefined> {
  if (!["select", "confirm", "input", "editor"].includes(request.method)) return undefined;
  const cancelled: RpcExtensionUIResponse = {
    type: "extension_ui_response",
    id: request.id,
    cancelled: true
  };
  if (signal.aborted) return cancelled;
  const clean = (text: string) => displayText(boundedText(text));
  const title = "title" in request ? clean(`[subagent: ${description}] ${request.title}`) : "";
  const options = {
    signal,
    ...("timeout" in request ? { timeout: request.timeout } : {})
  };

  switch (request.method) {
    case "confirm":
      return {
        type: "extension_ui_response",
        id: request.id,
        confirmed: await ui.confirm(title, clean(request.message), options)
      };

    case "select": {
      const cleaned = request.options.map(clean);
      // Prefix every label when sanitisation or truncation makes choices indistinguishable.
      const labels =
        new Set(cleaned).size === cleaned.length
          ? cleaned
          : cleaned.map((label, index) => `${index + 1}. ${label}`);
      const answer = await ui.select(title, labels, options);
      const original = answer === undefined ? undefined : request.options[labels.indexOf(answer)];

      return original === undefined
        ? cancelled
        : { type: "extension_ui_response", id: request.id, value: original };
    }

    case "input": {
      const answer = await ui.input(
        title,
        request.placeholder === undefined ? undefined : clean(request.placeholder),
        options
      );

      return answer === undefined
        ? cancelled
        : { type: "extension_ui_response", id: request.id, value: answer };
    }

    case "editor": {
      const answer = await ui.editor(
        title,
        request.prefill === undefined ? undefined : clean(request.prefill)
      );

      return answer === undefined
        ? cancelled
        : { type: "extension_ui_response", id: request.id, value: answer };
    }

    default:
      return undefined;
  }
}
