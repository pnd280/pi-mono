import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { Type } from "typebox";
import { expect, it } from "vite-plus/test";

import nullArgs from "./index.ts";

/** Registers each schema as a probe tool, replays the calls in one turn, and returns each probe's arguments. */
async function receivedArguments(
  schemas: Record<string, ToolDefinition["parameters"]>,
  calls: ReturnType<typeof fauxToolCall>[]
): Promise<Map<string, unknown>> {
  const received = new Map<string, unknown>();
  const fixture = await hostFixture([
    nullArgs,
    (pi) => {
      for (const [name, parameters] of Object.entries(schemas)) {
        pi.registerTool({
          name,
          label: "Probe",
          description: "Offline fixture",
          parameters,
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
    faux.setResponses([fauxAssistantMessage(calls), fauxAssistantMessage("done")]);
    await session.prompt("Call the probes");
  } finally {
    await fixture.dispose();
  }

  return received;
}

it("drops optional arguments sent as the text null and passes the rest unchanged", async () => {
  const parameters = Type.Object({
    text: Type.String(),
    mode: Type.Optional(Type.Union([Type.Literal("fast"), Type.Literal("slow")])),
    note: Type.Optional(Type.String())
  });
  const received = await receivedArguments(
    {
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
      ),
      // Each schema requires `text` without a `required` list that names it.
      negated_probe: Type.Object(
        { text: Type.Optional(Type.String()) },
        { not: { not: { required: ["text"] } } }
      ),
      constant_probe: Type.Union([
        Type.Object({ text: Type.Optional(Type.String()) }, { const: { text: "null" } })
      ]),
      enumerated_probe: Type.Object(
        { text: Type.Optional(Type.String()) },
        { enum: [{ text: "null" }] }
      ),
      counted_probe: Type.Object({ text: Type.Optional(Type.String()) }, { minProperties: 1 })
    },
    [
      fauxToolCall("probe", { text: "null", mode: "null", note: "kept" }),
      fauxToolCall("composed_probe", { text: "null", group: "null", mode: "null", note: "kept" }),
      fauxToolCall("referenced_probe", { text: "null", note: "kept" }),
      fauxToolCall("conditional_probe", { text: "null", note: "kept" }),
      ...["negated_probe", "constant_probe", "enumerated_probe", "counted_probe"].map((name) =>
        fauxToolCall(name, { text: "null" })
      )
    ]
  );

  expect(Object.fromEntries(received)).toEqual({
    probe: { text: "null", note: "kept" },
    composed_probe: { text: "null", group: "null", note: "kept" },
    referenced_probe: { text: "null", note: "kept" },
    conditional_probe: { text: "null", note: "kept" },
    negated_probe: { text: "null" },
    constant_probe: { text: "null" },
    enumerated_probe: { text: "null" },
    counted_probe: { text: "null" }
  });
});

it("preserves nested values and required null text through allOf, anyOf, and oneOf", async () => {
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
  const probes = ["all_of_probe", "any_of_probe", "one_of_probe"];
  const received = await receivedArguments(
    {
      all_of_probe: Type.Intersect([parameters, Type.Object({})]),
      any_of_probe: Type.Union([parameters, Type.Object({ other: Type.Optional(Type.Boolean()) })]),
      one_of_probe: Type.Object({}, { oneOf: [parameters, Type.Object({ other: Type.Boolean() })] })
    },
    probes.map((name) =>
      fauxToolCall(name, {
        text: "null",
        mode: "null",
        object: { text: "null", items: ["null", "kept"] },
        array: ["null", { text: "null" }, 0, false, null, ""]
      })
    )
  );

  for (const name of probes) {
    expect(received.get(name), name).toEqual({
      text: "null",
      object: { text: "null", items: ["null", "kept"] },
      array: ["null", { text: "null" }, 0, false, null, ""]
    });
  }
});
