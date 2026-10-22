import { contentText, type UserMessage } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionUIContext,
  SessionEntry
} from "@earendil-works/pi-coding-agent";
import { raceWithAbortSignal } from "@pi-mono/libs/abort-race";

import { TitleError } from "./generate.ts";
import { conversationSource, firstRequestSource, requestSource } from "./source.ts";

export type TitleHost = Pick<ExtensionAPI, "getSessionName" | "setSessionName"> & {
  getBranch(): readonly SessionEntry[];
  generate(source: string, signal: AbortSignal): Promise<string | undefined>;
  notify: ExtensionUIContext["notify"];
};

/** The agent run that owns an automatic attempt. An aborted run aborts `signal` before `settled`. */
export type TitleRun = { signal: AbortSignal; settled: Promise<void> };

export class SessionTitle {
  private controller: AbortController | undefined;
  private attempted: boolean;
  private disposed = false;

  constructor(private readonly host: TitleHost) {
    this.attempted = Boolean(host.getSessionName());
  }

  async automatic(message: UserMessage, run: TitleRun): Promise<void> {
    if (this.disposed || this.attempted || this.host.getSessionName()) return;
    const source = requestSource(contentText(message.content));
    if (!source) return;
    await this.run(firstRequestSource(this.host.getBranch()) || source, false, run);
  }

  async command(args: string): Promise<void> {
    if (this.disposed) return;
    const action = args.trim();

    if (action === "clear") {
      this.nameChanged();
      this.host.setSessionName("");
      this.host.notify("Session title cleared.", "info");
    } else if (action === "") {
      await this.run(conversationSource(this.host.getBranch()), true);
    } else {
      this.host.notify("Usage: /sesh auto-name [clear]", "error");
    }
  }

  nameChanged(): void {
    this.attempted = true;
    this.cancel();
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = undefined;
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }

  private async run(source: string, manual: boolean, owner?: TitleRun): Promise<void> {
    this.cancel();
    if (source) this.attempted = true;
    const controller = new AbortController();
    this.controller = controller;
    const signal = owner ? AbortSignal.any([controller.signal, owner.signal]) : controller.signal;
    const originalName = this.host.getSessionName();
    if (manual) this.host.notify("Generating session title…", "info");

    try {
      const title = await this.host.generate(source, signal);
      // Hold an automatic title until its agent run settles, because Pi can abort the run until then.
      if (title && owner) await raceWithAbortSignal(owner.settled, signal);
      // A superseded or cancelled generation always has an aborted signal.
      if (!title || signal.aborted || this.host.getSessionName() !== originalName) return;
      this.controller = undefined;
      this.host.setSessionName(title);
      if (manual) this.host.notify(`Session title: ${title}`, "info");
    } catch (error) {
      if (manual && !signal.aborted)
        this.host.notify(
          error instanceof TitleError
            ? error.message
            : "Session title generation failed. Check Pi's provider setup.",
          "warning"
        );
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }
}
