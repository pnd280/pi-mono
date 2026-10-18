import type { ReactNode } from "react";

// A sample Pi session, ported from the README hero (docs/assets/hero.html). Keep the two in step.
export function SessionPanel() {
  return (
    <figure className="min-w-0 border border-panel-line bg-panel shadow-[0_14px_34px_var(--panel-shadow)]">
      <figcaption className="sr-only">
        A sample Pi session with a subagent card, a compact tool card with a diff of the edit, and a
        run summary.
      </figcaption>
      <div className="overflow-x-auto px-4 py-4 text-[12px] leading-[19px] whitespace-pre text-text sm:px-[22px] sm:py-[18px] sm:text-[15px] sm:leading-[23px]">
        {/* Grow to the longest line, so diff tints span the scrolled width on narrow screens. */}
        <div className="w-max min-w-full">
          <div>
            <span className="text-accent">›</span> Accept trailing commas in the parser, then test.
          </div>
          <div>
            <span className="text-dim">•</span> <b className="text-accent">Subagent</b> Locate list
            parsing<span className="text-dim"> · </span>
            <span className="text-add">✓ completed 38.2s</span>
          </div>
          <div className="text-dim">
            {"  │ anthropic/claude-haiku-5-5:xhigh · ↑48k ↓3.1k $0.21"}
          </div>
          <div className="text-dim">{"  └ Lists close in parseList, src/parser.ts:52."}</div>
          <div>• Edited src/parser.ts</div>
          <DiffRow tint="bg-dim/8">
            <span className="text-add">+1</span> <span className="text-del">-1</span>
          </DiffRow>
          <DiffRow tint="bg-del/12">
            <span className="text-dim">54</span> <span className="text-del">-</span>
            {"    "}
            <Code>
              <Keyword>throw</Keyword> unexpected(<span className="text-string">","</span>)
            </Code>
            ;
          </DiffRow>
          <DiffRow tint="bg-add/12">
            <span className="text-dim">54</span> <span className="text-add">+</span>
            {"    "}
            <Code>
              <Keyword>break</Keyword>
            </Code>
            ;
          </DiffRow>
          <div>
            • Ran vp test parser <span className="text-add">✓</span>{" "}
            <span className="text-dim">2.1s</span>
          </div>
          <div className="text-dim">• anthropic/claude-opus-5-5:medium (48.2 tok/s) · 1m 23s</div>
          <div>
            <span className="text-dim">
              {"    ran 1 command · delegated 1 task · edited 1 file · "}
            </span>
            <span className="text-add">+1</span> <span className="text-del">-1</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

// pi-tool-display's diff panel: tinted strips with one column of padding.
function DiffRow({ tint, children }: { tint: string; children: ReactNode }) {
  return <div className={`px-[0.6em] ${tint}`}>{children}</div>;
}

// The unchanged prefix of the edited line, followed by its highlighted change.
function Code({ children }: { children: ReactNode }) {
  return (
    <>
      <Keyword>if</Keyword> (at(<span className="text-string">"]"</span>)){" "}
      <span className="bg-accent/16 font-bold">{children}</span>
    </>
  );
}

function Keyword({ children }: { children: ReactNode }) {
  return <span className="text-accent">{children}</span>;
}
