# @pi-mono/libs

Extensions in this workspace share code for work that touches files, processes, Pi hooks, or the terminal. For example, `settings-file` lets an extension update one key in `settings.json` under Pi's lock without losing unrelated keys.

For pure helpers with no side effects, use [utils](../utils/README.md). Import each library through its entry point, such as `@pi-mono/libs/settings-file` or `@pi-mono/libs/tui/open-browser`. The [manifest](package.json) lists the supported imports.

## Usage

| Library                                                | Responsibility                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| [tool-schema](src/tool-schema/README.md)               | Zod input projection into a limited Pi tool-schema profile                |
| [working-message](src/working-message/README.md)       | Shared working-message contributions and saved ordering                   |
| [input-chain](src/input-chain/README.md)               | Input observers and ranked transforms from one `input` handler            |
| [prompt-parts](src/prompt-parts/README.md)             | Ranked system-prompt parts appended once per run                          |
| [lifecycle](src/lifecycle/README.md)                   | Startup barrier, shortcut claims, shutdown phase, and run marks           |
| [settings-file](src/settings-file/README.md)           | Bounded reads, trusted scopes, and locked settings-section saves          |
| [file-rename](src/file-rename/README.md)               | File replacement by rename, with bounded retries on Windows               |
| [tui](src/tui/README.md)                               | Components, browser interaction, layout, terminal text, and host mounting |
| [timed-confirmation](src/timed-confirmation/README.md) | Target comparison and confirmation deadline                               |
| [abort-race](src/abort-race/README.md)                 | Waits that stop when an abort signal fires                                |
| [owned-hooks](src/owned-hooks/README.md)               | Property replacement and conditional restoration                          |
| [output-buffer](src/output-buffer/README.md)           | UTF-8 decoding and bounded stream retention                               |
| [native-tools](src/native-tools/README.md)             | Shared observation of verified native tools                               |
| [file-mutations](src/file-mutations/README.md)         | Native file mutation observations and shared patches                      |
| [bounded-diff](src/bounded-diff/README.md)             | Bounded unified-patch generation                                          |

The input-chain, prompt-parts, lifecycle, and working-message coordinators follow one [coordinator protocol](src/coordination/README.md), so their results do not depend on extension load order.

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
- The diff library generates patches in a worker thread.
- TUI libraries and hooks modify Pi's host state.

## Validation

The [coverage specification](docs/testing.md) lists what is tested here.
