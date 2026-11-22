import {
  CustomMessageComponent,
  initTheme,
  type MessageRenderer
} from "@earendil-works/pi-coding-agent";
import { NOTICE_MESSAGE } from "pi-profiles/notice";
import { beforeAll, expect, it } from "vite-plus/test";

import { renderProfileNotice } from "../../rendering/profile-notice.ts";

beforeAll(() => initTheme("dark", false));

it("keeps profile notice messages unchanged while rendering", () => {
  const message = {
    role: "custom",
    customType: NOTICE_MESSAGE,
    content:
      "The active profile switched from build to plan (Plan). Follow the updated system prompt and tools. The user did not send this message.",
    display: true,
    timestamp: 0,
    details: {
      kind: "switched",
      from: { name: "build", scope: "global" },
      to: { name: "plan", scope: "global" }
    }
  } satisfies Parameters<MessageRenderer>[0];
  const before = structuredClone(message);
  const component = new CustomMessageComponent(message, renderProfileNotice);

  for (const expanded of [false, true]) {
    component.setExpanded(expanded);

    for (const width of [12, 80]) {
      component.invalidate();
      expect(
        component.render(width).join("\n"),
        "Expected renderProfileNotice to format the transition arrow instead of falling back to Pi's default message box"
      ).toContain("\u2192");
    }
  }

  expect(message).toEqual(before);
});
