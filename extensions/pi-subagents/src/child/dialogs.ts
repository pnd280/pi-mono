import type {
  ExtensionUIContext,
  RpcExtensionUIRequest,
  RpcExtensionUIResponse
} from "@earendil-works/pi-coding-agent";
import { displayText } from "@pi-mono/libs/tui/terminal-text";

import { boundedText } from "../result.ts";

const DIALOG_METHODS: ReadonlySet<RpcExtensionUIRequest["method"]> = new Set([
  "select",
  "confirm",
  "input",
  "editor"
]);

/** Pi's editor expands tabs, normalises line ends, and trims the text that it returns. */
function editorText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").trim();
}

/** Fire-and-forget child UI stays local; only dialog replies flow back down. */
export async function forwardDialog(
  request: RpcExtensionUIRequest,
  description: string,
  ui: Pick<ExtensionUIContext, "select" | "confirm" | "input" | "editor">,
  signal: AbortSignal
): Promise<RpcExtensionUIResponse | undefined> {
  if (!DIALOG_METHODS.has(request.method)) return undefined;
  const cancelled: RpcExtensionUIResponse = {
    type: "extension_ui_response",
    id: request.id,
    cancelled: true
  };

  return ask(request, description, ui, signal, cancelled);
}

async function ask(
  request: RpcExtensionUIRequest,
  description: string,
  ui: Pick<ExtensionUIContext, "select" | "confirm" | "input" | "editor">,
  signal: AbortSignal,
  cancelled: RpcExtensionUIResponse
): Promise<RpcExtensionUIResponse | undefined> {
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
      // Pi's editor takes no signal, so it stays open after `signal` aborts.
      const { prefill } = request;
      const shown = prefill === undefined ? undefined : clean(prefill);
      const answer = await ui.editor(title, shown);
      if (answer === undefined) return cancelled;
      // The shown prefill is sanitised and cut, so an unchanged answer returns the child's own. Pi
      // can return the shown text normalised; any other answer, even by whitespace only, is an edit.
      const unchanged =
        prefill !== undefined &&
        shown !== undefined &&
        (answer === shown || answer === editorText(shown));

      return { type: "extension_ui_response", id: request.id, value: unchanged ? prefill : answer };
    }

    default:
      return undefined;
  }
}
