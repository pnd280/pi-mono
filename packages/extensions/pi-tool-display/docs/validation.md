# Manual validation

## Load and exercise tools

- [ ] Load the extension in a disposable working directory. Confirm there are no built-in override warnings and tool ownership/activation remain unchanged.
- [ ] Exercise a successful read, long-output command, failed command/read, edit, and write. Each call must display a heading and result; successful reads collapse to summaries, errors remain visible, and edits show numbered diffs.

## Inspect and reflow

- [ ] Include output large enough for Pi to truncate. Omission notices must remain visible when collapsed.
- [ ] Toggle Pi's configured tool expansion action and confirm retained text and submitted write content expand.
- [ ] Resize the terminal and confirm lines fit.
- [ ] Switch between dark/light themes and confirm settled output and diffs reflect the current theme.

## Restore and unload

- [ ] Run `/reload` twice, then resume the session. After each reload and resume, confirm custom displays survive for historical and new calls, expansion still works, and tool ownership/activation remain unchanged.
- [ ] Unload the extension and confirm Pi's default rendering returns:
  - **Settings-based loading:** remove the extension from the configured resource list and reload.
  - **CLI loading:** restart without its `-e` argument.
