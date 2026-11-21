import { contentText } from "@earendil-works/pi-ai";
import {
  getMarkdownTheme,
  type MessageRenderer,
  type MessageRenderOptions,
  type Theme
} from "@earendil-works/pi-coding-agent";
import { Markdown, MouseRegion, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  renderTree,
  renderTreeContinuation,
  type TreeItem
} from "@pi-mono/libs/tui/components/tree";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { displayText } from "@pi-mono/libs/tui/terminal-text";
import { wrapHangingRows } from "@pi-mono/libs/tui/text-budget";
import { decodeNotice } from "pi-nested-instructions/notices";
import { listingSchema } from "pi-nested-instructions/skill-listings";

import { modifierHeld } from "./mouse.ts";
import { pathRows } from "./target-layout.ts";

type CardMessage = Parameters<MessageRenderer>[0];

type CardTheme = Pick<Theme, "fg" | "bold">;

const labels = {
  loaded: "Loaded instructions",
  updated: "Updated instructions",
  removed: "Removed instructions"
};
const explanations = {
  loaded: "",
  updated: "Replaces the earlier instructions for this directory.",
  removed: "The earlier instructions for this directory no longer apply."
};
const listingLabels = {
  loaded: "Listed skills",
  updated: "Updated skills",
  removed: "Removed skills"
};
const listingExplanations = {
  loaded: "",
  updated: "Replaces the earlier skill list for this directory.",
  removed: "The earlier skill list for this directory no longer applies."
};

/** What a compact card shows for one message. */
type Card = {
  label: string;
  /** The path beside the label. */
  target: string | undefined;
  /** Describes the message itself, so it continues the heading when expanded. */
  explanation: string;
  /** The child branches of an expanded card. */
  body(width: number): readonly TreeItem[];
  invalidate(): void;
};

function instructionCard(message: CardMessage, theme: CardTheme): Card {
  const { notice, body } = decodeNotice(message);
  const markdown = new Markdown(displayText(body), 0, 0, getMarkdownTheme());

  return {
    label: notice ? labels[notice.action] : "Nested instructions",
    target: notice?.displayPath,
    explanation: notice ? explanations[notice.action] : "",
    body(width) {
      if (body) return [{ rows: markdown.render(width) }];
      if (notice?.action === "removed") return [];

      return [{ rows: new Text(theme.fg("dim", "Empty instruction file."), 0, 0).render(width) }];
    },
    invalidate: () => markdown.invalidate()
  };
}

function listingCard(message: CardMessage, theme: CardTheme): Card {
  const parsed = listingSchema.safeParse(message.details);

  if (!parsed.success) {
    const text = new Text(theme.fg("text", displayText(contentText(message.content))), 0, 0);

    return {
      label: "Nested skills",
      target: undefined,
      explanation: "",
      body: (width) => [{ rows: text.render(width) }],
      invalidate: () => text.invalidate()
    };
  }

  const { action, displayPath, skills } = parsed.data;
  const entries = skills.map(
    ({ name, description }) =>
      new Text(
        `${theme.bold(displayText(name))} ${theme.fg("dim", displayText(description))}`,
        0,
        0
      )
  );

  return {
    label:
      action === "removed" ? listingLabels[action] : `${listingLabels[action]} (${skills.length})`,
    target: displayPath,
    explanation: listingExplanations[action],
    // One branch per skill keeps each wrapped description under its own connector.
    body: (width) => entries.map((entry) => ({ rows: entry.render(width) })),
    invalidate() {
      for (const entry of entries) entry.invalidate();
    }
  };
}

function headerRows({
  label,
  target,
  width,
  expanded,
  hasChildren,
  theme
}: {
  label: string;
  target: string | undefined;
  width: number;
  expanded: boolean;
  hasChildren: boolean;
  theme: CardTheme;
}): string[] {
  const marker = expanded ? TUI_GLYPHS.expanded : TUI_GLYPHS.bullet;
  const title = `${theme.fg("accent", marker)} ${theme.fg("accent", theme.bold(label))}`;
  const continuation = {
    width,
    indent: 2,
    style: (text: string) => theme.fg("dim", text),
    hasChildren
  };
  // A title wider than the row continues in the body column, like its path.
  const [first = "", ...wrapped] = wrapHangingRows(title, width, Math.max(1, width - 4));
  if (!target) return [first, ...renderTreeContinuation(wrapped, continuation)];
  const indent = visibleWidth(title) + 1;
  const path = displayText(target);
  // Paths wrap like tool-card targets, beside the label when at least four columns remain.
  const inline = pathRows(path, { width: width - indent, theme, expanded });
  if (inline)
    return [
      `${title} ${inline[0] ?? ""}`,
      ...renderTreeContinuation(
        inline.slice(1).map((row) => " ".repeat(Math.max(0, indent - 4)) + row),
        continuation
      )
    ];
  const rows =
    pathRows(path, { width: width - 4, theme, expanded }) ??
    new Text(theme.fg("text", path), 0, 0).render(Math.max(1, width - 4));

  return [first, ...renderTreeContinuation([...wrapped, ...rows], continuation)];
}

/** Renders nested-instruction notices. */
export const createNoticeRenderer = () => createCardRenderer(instructionCard);

/** Renders nested-skill listings. */
export const createListingRenderer = () => createCardRenderer(listingCard);

function createCardRenderer(describe: (message: CardMessage, theme: CardTheme) => Card) {
  // Pi rebuilds renderers on invalidation. Preserve local expansion until the global tool-output toggle changes.
  const states = new WeakMap<CardMessage, { expanded: boolean; globalExpanded: boolean }>();

  return function renderCard(
    message: CardMessage,
    { expanded }: MessageRenderOptions,
    theme: CardTheme
  ) {
    const card = describe(message, theme);
    const previous = states.get(message);
    const expansion =
      previous?.globalExpanded === expanded ? previous : { expanded, globalExpanded: expanded };
    states.set(message, expansion);
    let headerHeight = 0;

    return new MouseRegion(
      {
        render(width) {
          const innerWidth = Math.max(1, width - 4);
          const children = expansion.expanded ? card.body(innerWidth) : [];
          const hasChildren = children.some((item) => item.rows.length > 0);
          const lines = headerRows({
            label: card.label,
            target: card.target,
            width,
            expanded: expansion.expanded,
            hasChildren,
            theme
          });
          headerHeight = lines.length;

          if (expansion.expanded && card.explanation)
            lines.push(
              ...renderTreeContinuation(
                new Text(theme.fg("dim", card.explanation), 0, 0).render(innerWidth),
                {
                  width,
                  indent: 2,
                  style: (text) => theme.fg("dim", text),
                  hasChildren
                }
              )
            );

          lines.push(
            ...renderTree(children, { width, indent: 2, style: (text) => theme.fg("dim", text) })
          );

          return lines.map((line) => truncateToWidth(line, width, ""));
        },
        invalidate: () => card.invalidate()
      },
      (event) => {
        // Leave instruction selection and scrolling alone; only the header toggles.
        if (
          event.type !== "click" ||
          event.button !== "left" ||
          modifierHeld(event) ||
          event.y >= headerHeight
        )
          return;
        expansion.expanded = !expansion.expanded;

        return { handled: true };
      }
    );
  };
}
