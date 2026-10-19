import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export type HintFooterOptions = {
  width: number;
  maxRows: number;
  hints: readonly string[];
  padding: string;
  separator: string;
  style(this: void, text: string): string;
  message?: { text: string; style(this: void, text: string): string; overflowText: string };
};

/** Pack display-safe hints, or replace their row budget with feedback. Never deliver notifications. */
export function renderHintFooter(options: HintFooterOptions): string[] {
  const { hints, padding, separator, style, message } = options;
  const width = Math.max(0, Math.floor(options.width));
  const available = Math.max(0, width - visibleWidth(padding));
  const lines: string[] = [];
  let line = "";

  for (const hint of hints) {
    const joined = line ? line + separator + hint : hint;
    if (line && visibleWidth(joined) > available) {
      lines.push(line);
      line = hint;
    } else line = joined;
  }

  if (line) lines.push(line);
  const count = width > 0 ? Math.max(0, Math.min(lines.length, Math.floor(options.maxRows))) : 0;
  const crop = (text: string) => truncateToWidth(text, width);
  if (!message) return lines.slice(0, count).map((text) => crop(style(padding + text)));
  const feedback = available > 0 ? wrapTextWithAnsi(message.text, available) : [];
  const overflow = feedback.length > count || (available === 0 && message.text.length > 0);
  if (overflow && count > 0) feedback[count - 1] = message.overflowText;

  return Array.from({ length: count }, (_, index) =>
    feedback[index] === undefined ? "" : crop(message.style(padding + feedback[index]))
  );
}
