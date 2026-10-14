# @pi-mono/libs

Extensions in this workspace share code for work that touches files, processes, Pi hooks, or the terminal. For example, `settings-file` lets an extension update one key in `settings.json` under Pi's lock without losing unrelated keys.

For pure helpers with no side effects, use [utils](../utils/README.md). The [manifest](package.json) lists the supported imports.

## Usage

| Library                                                | Responsibility                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| [tool-schema](src/tool-schema/README.md)               | Zod input projection into a limited Pi tool-schema profile                |
| [working-message](src/working-message/README.md)       | Shared working-message contributions and saved ordering                   |
| [settings-file](src/settings-file/README.md)           | Bounded reads, trusted scopes, and locked atomic JSON-record updates      |
| [native-clipboard](src/native-clipboard/README.md)     | Exact UTF-8 clipboard writes through local helpers                        |
| [private-files](src/private-files/README.md)           | Permission and ACL enforcement, directory scopes, locks, atomic writes    |
| [tui](src/tui/README.md)                               | Components, browser interaction, layout, terminal text, and host mounting |
| [text-search](src/text-search/README.md)               | Cooperative normalisation and search                                      |
| [latest-task](src/latest-task/README.md)               | Result commits and pending state for the latest task                      |
| [expiring-notice](src/expiring-notice/README.md)       | Replaceable notice expiry                                                 |
| [timed-confirmation](src/timed-confirmation/README.md) | Target comparison and confirmation deadline                               |
| [async-cache](src/async-cache/README.md)               | Same-key load sharing and bounded LRU storage                             |
| [owned-hooks](src/owned-hooks/README.md)               | Property replacement and conditional restoration                          |
| [output-buffer](src/output-buffer/README.md)           | UTF-8 decoding and bounded stream retention                               |
| [bounded-output](src/bounded-output/README.md)         | Bounded regular-file previews                                             |
| [file-observation](src/file-observation/README.md)     | Complete UTF-8 file reads                                                 |
| [native-tools](src/native-tools/README.md)             | Shared observation of verified native tools                               |
| [file-mutations](src/file-mutations/README.md)         | Native file mutation observations and shared patches                      |
| [bounded-diff](src/bounded-diff/README.md)             | Bounded unified-patch generation                                          |
| [git-ignore](src/git-ignore/README.md)                 | Git rule and symbolic-link inspection                                     |

### Offline validation

Validation-only entry points:

| Library                                                                    | Responsibility                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [validation/interactive-host](src/validation/interactive-host/README.md)   | Installed interactive host for isolated in-process tests        |
| [validation/pi-process](src/validation/pi-process/README.md)               | Private workspace directories and isolated launch configuration |
| [validation/provider](src/validation/provider/README.md)                   | Scripted assistant messages and event streams                   |
| [validation/terminal-launcher](src/validation/terminal-launcher/README.md) | Interactive fixture launches and exit status                    |
| [validation/tool-context](src/validation/tool-context/README.md)           | Complete native tool contexts for isolated unit fixtures        |

## Configuration

Callers pass options per call. The [working-message coordinator](src/working-message/README.md#persistence) stores ordering in Pi's global and project settings.

## Side effects

Each library has its own effects; none makes network requests.

- Storage and observation libraries read and write local files.
- Clipboard, Git-ignore, and diff helpers start local processes or workers. On macOS, private-file access runs `/bin/chmod` to remove ACLs.
- TUI libraries and hooks modify Pi's host state.

## Validation

The [coverage specification](docs/testing.md) lists what is tested here.

Use the [focused commands and test prerequisites](../../docs/development.md#focused-validation) with `@pi-mono/libs`. For native clipboard or private-storage changes, also use the [isolated platform checks](../extensions/pi-prompt-manager/docs/validation.md#platform-checks).
