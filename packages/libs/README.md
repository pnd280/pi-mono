# @pi-mono/libs

Extensions in this workspace share code for work that touches files, processes, Pi hooks, or the terminal. For example, `settings-file` lets an extension update one key in `settings.json` under Pi's lock without losing unrelated keys.

For pure helpers with no side effects, use [utils](../utils/README.md). Import each library through its entry point, such as `@pi-mono/libs/settings-file` or `@pi-mono/libs/tui/open-browser`. The [manifest](package.json) lists the supported imports.

## Usage

| Library                                                | Responsibility                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| [tool-schema](src/tool-schema/README.md)               | Zod input projection into a limited Pi tool-schema profile                |
| [working-message](src/working-message/README.md)       | Shared working-message contributions and saved ordering                   |
| [settings-file](src/settings-file/README.md)           | Bounded reads, trusted scopes, and locked settings-section saves          |
| [private-files](src/private-files/README.md)           | Permission and ACL enforcement, directory scopes, locks, atomic writes    |
| [tui](src/tui/README.md)                               | Components, browser interaction, layout, terminal text, and host mounting |
| [timed-confirmation](src/timed-confirmation/README.md) | Target comparison and confirmation deadline                               |
| [owned-hooks](src/owned-hooks/README.md)               | Property replacement and conditional restoration                          |
| [output-buffer](src/output-buffer/README.md)           | UTF-8 decoding and bounded stream retention                               |
| [native-tools](src/native-tools/README.md)             | Shared observation of verified native tools                               |
| [file-mutations](src/file-mutations/README.md)         | Native file mutation observations and shared patches                      |
| [bounded-diff](src/bounded-diff/README.md)             | Bounded unified-patch generation                                          |

### Offline validation

Use these entry points only in validation code:

| Library                                                                    | Responsibility                                                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [validation/bounded-diff](src/validation/bounded-diff/README.md)           | Step deadline for bounded patches in tests that expect a generated patch                |
| [validation/interactive-host](src/validation/interactive-host/README.md)   | Installed interactive host for isolated in-process tests                                |
| [validation/pi-process](src/validation/pi-process/README.md)               | Private workspace directories, isolated launch configuration, and shared compile caches |
| [validation/provider](src/validation/provider/README.md)                   | Scripted assistant messages and event streams                                           |
| [validation/terminal-launcher](src/validation/terminal-launcher/README.md) | Interactive fixture launches and exit status                                            |
| [validation/tool-context](src/validation/tool-context/README.md)           | Complete native tool contexts for isolated unit fixtures                                |

## Configuration

Callers pass options per call. The [working-message coordinator](src/working-message/README.md#persistence) stores ordering in Pi's global and project settings.

## Side effects

Each library has its own effects; none makes network requests.

- Storage and observation libraries read and write local files.
- The diff library generates patches in a worker thread. On macOS, private-file access runs `/bin/chmod` to remove ACLs.
- TUI libraries and hooks modify Pi's host state.

## Validation

The [coverage specification](docs/testing.md) lists what is tested here.

Use the [focused commands and test prerequisites](../../docs/development.md#focused-validation) with `@pi-mono/libs`. For private-storage changes, also use the [isolated platform checks](../extensions/pi-prompt-manager/docs/validation.md#platform-checks).
