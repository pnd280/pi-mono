export const repositoryUrl = "https://github.com/pnd280/pi-mono";

export type Extension = {
  name: string;
  // Follows the workspace README's extension table.
  summary: string;
  // A prompt, command, or output line, copied from the extension's README.
  sample?: { kind: "input" | "output"; text: string };
};

export type ExtensionGroup = {
  id: string;
  title: string;
  summary: string;
  extensions: Extension[];
};

export const extensionGroups: ExtensionGroup[] = [
  {
    id: "readable-runs",
    title: "Readable runs",
    summary: "See what the agent did without scrolling through raw tool output.",
    extensions: [
      {
        name: "pi-tool-display",
        summary:
          "Shows tool calls as compact, expandable cards with file diffs, so long runs stay readable.",
        sample: {
          kind: "output",
          text: "▸ Read 4 files · 2 searches · edited 2 files · ran 3 commands (1 failed) · created 1 file   12 calls"
        }
      },
      {
        name: "pi-agent-summary",
        summary:
          "Adds a one-line summary after each run: time, models, commands, and changed files.",
        sample: {
          kind: "output",
          text: "• anthropic/claude-opus-5-5:medium (48.2 tok/s) · 1m 23s · ran 4 commands · edited 3 files · +42 -11"
        }
      },
      {
        name: "pi-editor-widgets",
        summary: "Moves widgets and statuses above the editor, below it, or into the footer.",
        sample: { kind: "input", text: "/widgets" }
      }
    ]
  },
  {
    id: "long-tasks",
    title: "Long tasks",
    summary: "Split work up, keep the plan visible, and keep going past the context limit.",
    extensions: [
      {
        name: "pi-subagents",
        summary:
          "Delegates foreground and background work to resumable Pi processes, with task views and cancellation.",
        sample: {
          kind: "input",
          text: "Ask two subagents to review the parser and the documentation, then summarise their findings."
        }
      },
      {
        name: "pi-smart-compact",
        summary: "Lets the model compact its own context mid-task, so long tasks keep going.",
        sample: {
          kind: "output",
          text: 'compact({ instructions: "Preserve modified files and remaining tests." })'
        }
      },
      {
        name: "pi-todo",
        summary:
          "Gives the model a todo list, shown in a widget and a /todos browser and saved in the session.",
        sample: { kind: "input", text: "/todos" }
      }
    ]
  },
  {
    id: "context",
    title: "The right context",
    summary: "Give each model the instructions, skills, and code spans that it needs.",
    extensions: [
      {
        name: "pi-nested-instructions",
        summary: "Loads AGENTS.md files from subdirectories when the model starts working in them."
      },
      {
        name: "pi-skills",
        summary: "Turns /skill:<name> anywhere in a prompt into a file link, with Tab completion."
      },
      {
        name: "pi-read",
        summary: "Lets the model select and highlight an exact span of a file when reading it.",
        sample: { kind: "output", text: "src/example.ts:12:4-15:9" }
      },
      {
        name: "pi-model-prompt",
        summary: "Appends different system instructions depending on the model.",
        sample: { kind: "output", text: '{ "match": "claude", "append": ["prompts/ant.md"] }' }
      },
      {
        name: "pi-profiles",
        summary:
          "Switches the model, thinking level, tools, and instructions together with one key.",
        sample: { kind: "output", text: "Profile plan: tools removed edit, write" }
      }
    ]
  },
  {
    id: "guards",
    title: "Guards",
    summary: "Stop small mistakes from failing a call or ending a turn.",
    extensions: [
      {
        name: "pi-abort-guard",
        summary:
          "Stops a running agent only on a second Escape, so one stray press doesn't end the turn.",
        sample: { kind: "output", text: "escape again to interrupt" }
      },
      {
        name: "pi-null-args",
        summary:
          'Drops optional tool arguments that a model sent as the text "null", so Pi doesn\'t reject the call.',
        sample: {
          kind: "output",
          text: 'Validation failed for tool "subagent":\n  - thinking: must be equal to one of the allowed values'
        }
      },
      {
        name: "pi-fff-guard",
        summary: "Stops FFF searches that would silently find nothing in ignored or missing paths."
      }
    ]
  },
  {
    id: "sessions",
    title: "Sessions and prompts",
    summary: "Keep conversations, prompts, and drafts that Pi would otherwise lose.",
    extensions: [
      {
        name: "pi-session-utils",
        summary:
          "Saves unsaved sessions, starts empty child sessions, and names sessions automatically.",
        sample: { kind: "input", text: "/sesh persist" }
      },
      {
        name: "pi-prompt-manager",
        summary: "Keeps searchable prompt history and saved drafts per directory.",
        sample: { kind: "input", text: "/prompts" }
      },
      {
        name: "pi-prompt-cloak",
        summary:
          "Rephrases Pi-specific system prompt text to reduce fingerprinting by upstream providers."
      }
    ]
  }
];

export const extensionCount = extensionGroups.reduce(
  (count, group) => count + group.extensions.length,
  0
);

export function extensionUrl(name: string) {
  return `${repositoryUrl}/tree/master/packages/extensions/${name}`;
}
