import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PiLogo } from "#/components/pi-logo.tsx";
import { SessionPanel } from "#/components/session-panel.tsx";
import {
  type Extension,
  type ExtensionGroup,
  extensionCount,
  extensionGroups,
  extensionUrl,
  repositoryUrl
} from "#/extensions.ts";

export const Route = createFileRoute("/")({ component: Home });

const piAgentUrl = "https://github.com/earendil-works/pi/tree/main/packages/coding-agent";

function Home() {
  return (
    <div className="grid-paper min-h-screen">
      <Header />
      <main>
        <Hero />
        <Facts />
        <Extensions />
        <GetStarted />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-6">
      <a href="/" className="flex items-center gap-3">
        <PiLogo className="size-7" />
        <span className="font-pixel text-[22px] leading-none">pi-mono</span>
      </a>
      <nav className="flex items-center gap-6 text-sm text-dim">
        <a href="#extensions" className="hover:text-ink">
          Extensions
        </a>
        <a href="#get-started" className="hidden hover:text-ink sm:inline">
          Get started
        </a>
        <a href={repositoryUrl} className="hover:text-ink">
          GitHub
        </a>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-6 pt-10 pb-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:pt-20 lg:pb-28">
      <div>
        <a
          href="https://www.npmjs.com/package/@earendil-works/pi-coding-agent"
          className="inline-block border border-panel-line bg-panel px-3 py-1 text-xs text-dim hover:text-ink"
        >
          For Pi ^1.4.0
        </a>
        <h1 className="mt-8 font-pixel text-[33px] leading-[40px] sm:text-[44px] sm:leading-[52px]">
          Good defaults,
          <br />
          engineered
          <br />
          with care
        </h1>
        <p className="mt-6 font-pixel text-[22px] leading-[30px] text-sub">
          {extensionCount} extensions
          <br />
          for the Pi coding agent
        </p>
        <p className="mt-6 max-w-md text-sm leading-6 text-text">
          pi-mono is an opinionated setup for <ExternalLink href={piAgentUrl}>Pi</ExternalLink>.
          Each extension fixes one thing: readable tool output, delegated work, context that follows
          the model, or a guard against a small mistake.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <a
            href="#get-started"
            className="bg-ink px-5 py-2.5 font-bold text-bg hover:bg-accent hover:text-bg"
          >
            Get started
          </a>
          <a
            href="#extensions"
            className="border border-panel-line bg-panel px-5 py-2.5 text-ink hover:border-accent"
          >
            Browse extensions
          </a>
        </div>
      </div>
      <SessionPanel />
    </section>
  );
}

const facts = [
  {
    title: "No build step",
    text: "Extensions load TypeScript directly. Point Pi at a directory and start."
  },
  {
    title: "Load only what you need",
    text: "Each extension is a separate package. Repeat -e to load more."
  },
  {
    title: "Tested with a real Pi",
    text: "End-to-end tests drive a real Pi host with an offline model provider."
  }
];

function Facts() {
  return (
    <section className="border-y border-panel-line bg-panel/60">
      <dl className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.title}>
            <dt className="font-bold text-ink">{fact.title}</dt>
            <dd className="mt-2 text-sm leading-6 text-dim">{fact.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Extensions() {
  return (
    <section id="extensions" className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
      <SectionHeading title="Extensions">
        Pick one or load them all. Each card links to the extension's README, with its settings and
        limits.
      </SectionHeading>
      <div className="mt-12">
        {extensionGroups.map((group) => (
          <Group key={group.id} group={group} />
        ))}
      </div>
    </section>
  );
}

function Group({ group }: { group: ExtensionGroup }) {
  return (
    <div className="border-t border-panel-line py-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-6">
        <h3 className="font-pixel text-[22px] leading-[28px]">{group.title}</h3>
        <p className="text-sm leading-6 text-dim">{group.summary}</p>
      </div>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {group.extensions.map((extension) => (
          <li key={extension.name}>
            <ExtensionCard extension={extension} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExtensionCard({ extension }: { extension: Extension }) {
  return (
    <a
      href={extensionUrl(extension.name)}
      className="group flex h-full flex-col border border-panel-line bg-panel p-5 hover:border-accent"
    >
      <span className="font-bold text-accent">
        {extension.name}
        <span className="ml-2 text-dim opacity-0 group-hover:opacity-100" aria-hidden="true">
          ↗
        </span>
      </span>
      <span className="mt-2 text-sm leading-6 text-text">{extension.summary}</span>
      {extension.sample ? (
        <div className="mt-auto pt-4">
          <pre className="border-t border-panel-line pt-3 text-[12px] leading-[18px] break-words whitespace-pre-wrap text-dim">
            {extension.sample.kind === "input" ? <span className="text-accent">› </span> : null}
            {extension.sample.text}
          </pre>
        </div>
      ) : null}
    </a>
  );
}

function GetStarted() {
  return (
    <section id="get-started" className="border-t border-panel-line bg-panel/60">
      <div className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
        <SectionHeading title="Get started">
          Run Pi from the workspace with the extensions you choose.
        </SectionHeading>
        <ol className="mt-12">
          <Step
            number={1}
            title="Clone the repository"
            code={`git clone ${repositoryUrl}.git\ncd pi-mono`}
          >
            Each extension is a directory in packages/extensions/.
          </Step>
          <Step number={2} title="Install" code="vp install --frozen-lockfile">
            Use the Node.js version in{" "}
            <ExternalLink href={`${repositoryUrl}/blob/master/.node-version`}>
              .node-version
            </ExternalLink>{" "}
            and the <ExternalLink href="https://viteplus.dev/guide/">Vite+ CLI</ExternalLink> (vp).
          </Step>
          <Step
            number={3}
            title="Launch Pi"
            code={
              "vp exec pi \\\n  -e ./packages/extensions/pi-tool-display \\\n  -e ./packages/extensions/pi-agent-summary"
            }
          >
            Repeat -e for each extension. To keep extensions loaded across launches, use Pi's{" "}
            <ExternalLink href="https://pi.dev/docs/latest/packages#install-and-manage-packages">
              package installation
            </ExternalLink>
            .
          </Step>
        </ol>
      </div>
    </section>
  );
}

function Step({
  number,
  title,
  code,
  children
}: {
  number: number;
  title: string;
  code: string;
  children: ReactNode;
}) {
  return (
    <li className="grid gap-4 border-t border-panel-line py-8 lg:grid-cols-[3rem_minmax(0,2fr)_minmax(0,3fr)] lg:gap-8">
      <span className="font-pixel text-[22px] leading-[24px] text-sub">0{number}</span>
      <div>
        <h3 className="font-bold text-ink">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-dim">{children}</p>
      </div>
      <pre className="self-start overflow-x-auto border border-panel-line bg-bg px-4 py-3 text-[13px] leading-[21px] text-text">
        {code}
      </pre>
    </li>
  );
}

function SectionHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <h2 className="font-pixel text-[33px] leading-[40px] sm:text-[44px] sm:leading-[52px]">
        {title}
      </h2>
      <p className="mt-4 text-sm leading-6 text-dim">{children}</p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-panel-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 text-sm text-dim sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <PiLogo className="size-5" />
          <span>pi-mono · Opinionated setup for the Pi coding agent.</span>
        </div>
        <nav className="flex gap-6">
          <a href={repositoryUrl} className="hover:text-ink">
            GitHub
          </a>
          <a href={piAgentUrl} className="hover:text-ink">
            Pi coding agent
          </a>
          <a href="https://pi.dev" className="hover:text-ink">
            pi.dev
          </a>
        </nav>
      </div>
    </footer>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="text-accent underline decoration-panel-line underline-offset-4 hover:decoration-accent"
    >
      {children}
    </a>
  );
}
