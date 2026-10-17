import { fauxAssistantMessage, fauxProvider, fauxToolCall, Type } from "@earendil-works/pi-ai";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { expect, it } from "vite-plus/test";

import nullArgs from "./index.ts";

it("drops optional arguments sent as the text null and passes the rest unchanged", async () => {
  const received: unknown[] = [];
  const parameters = Type.Object({
    text: Type.String(),
    mode: Type.Optional(Type.Union([Type.Literal("fast"), Type.Literal("slow")])),
    note: Type.Optional(Type.String())
  });
  const fixture = await hostFixture([
    nullArgs,
    (pi) => {
      for (const [name, schema] of Object.entries({
        probe: parameters,
        composed_probe: Type.Union([
          Type.Intersect([parameters, Type.Object({ group: Type.String() })]),
          Type.Object({ other: Type.Optional(Type.Boolean()) })
        ]),
        referenced_probe: { $defs: { input: parameters }, $ref: "#/$defs/input" },
        conditional_probe: Type.Object(
          { text: Type.Optional(Type.String()), note: Type.Optional(Type.String()) },
          // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema uses "then" for conditional requirements.
          { if: { required: ["note"] }, then: { required: ["text"] } }
        )
      })) {
        pi.registerTool({
          name,
          label: "Probe",
          description: "Offline fixture",
          parameters: schema,
          async execute(_id, args) {
            received.push({ name, args });

            return { content: [{ type: "text", text: "ok" }], details: undefined };
          }
        });
      }
    }
  ]);
  const { session } = fixture;

  try {
    await fixture.bind();
    const faux = fauxProvider({ provider: "null-args", models: [{ id: "offline" }] });
    session.modelRuntime.registerNativeProvider(faux.provider);
    await session.modelRuntime.refresh({ allowNetwork: false });
    await session.setModel(faux.getModel());
    faux.setResponses([
      fauxAssistantMessage([
        fauxToolCall("probe", { text: "null", mode: "null", note: "kept" }),
        fauxToolCall("composed_probe", {
          text: "null",
          group: "null",
          mode: "null",
          note: "kept"
        }),
        fauxToolCall("referenced_probe", { text: "null", note: "kept" }),
        fauxToolCall("conditional_probe", { text: "null", note: "kept" })
      ]),
      fauxAssistantMessage("done")
    ]);
    await session.prompt("Call the probe");
    expect(received).toEqual([
      { name: "probe", args: { text: "null", note: "kept" } },
      { name: "composed_probe", args: { text: "null", group: "null", note: "kept" } },
      { name: "referenced_probe", args: { text: "null", note: "kept" } },
      { name: "conditional_probe", args: { text: "null", note: "kept" } }
    ]);
  } finally {
    await fixture.dispose();
  }
});

it("preserves nested values and required null text through allOf, anyOf, and oneOf", async () => {
  const received = new Map<string, unknown>();
  const parameters = Type.Object({
    text: Type.String(),
    mode: Type.Optional(Type.Union([Type.Literal("fast"), Type.Literal("slow")])),
    object: Type.Optional(
      Type.Object({ text: Type.Optional(Type.String()), items: Type.Array(Type.String()) })
    ),
    array: Type.Optional(
      Type.Array(
        Type.Union([
          Type.String(),
          Type.Number(),
          Type.Boolean(),
          Type.Null(),
          Type.Object({ text: Type.Optional(Type.String()) })
        ])
      )
    )
  });
  const fixture = await hostFixture([
    nullArgs,
    (pi) => {
      for (const [name, schema] of Object.entries({
        all_of_probe: Type.Intersect([parameters, Type.Object({})]),
        any_of_probe: Type.Union([
          parameters,
          Type.Object({ other: Type.Optional(Type.Boolean()) })
        ]),
        one_of_probe: Type.Object(
          {},
          { oneOf: [parameters, Type.Object({ other: Type.Boolean() })] }
        )
      })) {
        pi.registerTool({
          name,
          label: "Probe",
          description: "Offline fixture",
          parameters: schema,
          async execute(_id, args) {
            received.set(name, args);

            return { content: [{ type: "text", text: "ok" }], details: undefined };
          }
        });
      }
    }
  ]);
  const { session } = fixture;

  try {
    await fixture.bind();
    const faux = fauxProvider({ provider: "null-args", models: [{ id: "offline" }] });
    session.modelRuntime.registerNativeProvider(faux.provider);
    await session.modelRuntime.refresh({ allowNetwork: false });
    await session.setModel(faux.getModel());
    faux.setResponses([
      fauxAssistantMessage(
        ["all_of_probe", "any_of_probe", "one_of_probe"].map((name) =>
          fauxToolCall(name, {
            text: "null",
            mode: "null",
            object: { text: "null", items: ["null", "kept"] },
            array: ["null", { text: "null" }, 0, false, null, ""]
          })
        )
      ),
      fauxAssistantMessage("done")
    ]);
    await session.prompt("Call the probes with nested values");

    for (const name of ["all_of_probe", "any_of_probe", "one_of_probe"]) {
      expect(received.get(name), name).toEqual({
        text: "null",
        object: { text: "null", items: ["null", "kept"] },
        array: ["null", { text: "null" }, 0, false, null, ""]
      });
    }
  } finally {
    await fixture.dispose();
  }
});
