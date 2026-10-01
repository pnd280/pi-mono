/** Safe diagnostics never include clipboard contents or helper output. */
export class NativeClipboardError extends Error {}

export type NativeHelper = { command: string; args: string[] };

export function nativeHelpers(
  platform: string,
  env: NodeJS.ProcessEnv,
  osRelease: string
): NativeHelper[] {
  if (env.SSH_CONNECTION || env.SSH_TTY)
    throw new NativeClipboardError(
      "Remote clipboard access is unsupported. Use a local native clipboard session."
    );
  if (platform === "darwin") return [{ command: "pbcopy", args: [] }];
  if (platform !== "linux")
    throw new NativeClipboardError("Native clipboard supports Linux, macOS, and WSL only.");

  if (env.WSL_DISTRO_NAME || /microsoft/i.test(osRelease)) {
    // clip.exe can perform code-page conversion. PowerShell decodes stdin explicitly
    // and uses the native clipboard API without adding a newline.
    return [
      {
        command: "powershell.exe",
        args: [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-STA",
          "-Command",
          "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText([Console]::In.ReadToEnd())"
        ]
      }
    ];
  }

  const helpers: NativeHelper[] = [];

  if (env.WAYLAND_DISPLAY)
    helpers.push({ command: "wl-copy", args: ["--type", "text/plain;charset=utf-8"] });
  if (env.DISPLAY)
    helpers.push(
      { command: "xclip", args: ["-selection", "clipboard", "-in"] },
      { command: "xsel", args: ["--clipboard", "--input"] }
    );
  if (!helpers.length)
    throw new NativeClipboardError(
      "No local Wayland/X11 clipboard is available. Install wl-copy, xclip, or xsel and use a graphical session."
    );

  return helpers;
}
