import { expect, it } from "vite-plus/test";

import { nativeHelpers, NativeClipboardError } from "./helpers.ts";

it("selects platform-native helpers and refuses remote/no-display/native Windows environments", () => {
  expect(nativeHelpers("darwin", {}, "")[0]?.command).toBe("pbcopy");
  expect(
    nativeHelpers("linux", { WAYLAND_DISPLAY: "wayland-0", DISPLAY: ":1" }, "").map(
      (helper) => helper.command
    )
  ).toEqual(["wl-copy", "xclip", "xsel"]);
  expect(nativeHelpers("linux", {}, "microsoft-standard-WSL2")[0]?.command).toBe("powershell.exe");
  expect(nativeHelpers("linux", { WSL_DISTRO_NAME: "Ubuntu" }, "")[0]?.command).toBe(
    "powershell.exe"
  );
  expect(() => nativeHelpers("linux", {}, "")).toThrow(NativeClipboardError);
  expect(() => nativeHelpers("win32", {}, "")).toThrow(NativeClipboardError);
  expect(() => nativeHelpers("darwin", { SSH_TTY: "/dev/pts/1" }, "")).toThrow(
    NativeClipboardError
  );
  expect(() => nativeHelpers("linux", { SSH_CONNECTION: "remote", DISPLAY: ":1" }, "")).toThrow(
    NativeClipboardError
  );
});
