# @pi-mono/libs

Shared extension APIs and [TUI infrastructure](src/tui/README.md). Use [utils](../utils/README.md) for pure helpers. See the [manifest](package.json) for imports and Pi peers.

## Usage

| Library                                                | Responsibility                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| [working-message](src/working-message/README.md)       | Shared working-message contributions and saved ordering                   |
| [native-clipboard](src/native-clipboard/README.md)     | Exact UTF-8 clipboard writes through local helpers                        |
| [private-files](src/private-files/README.md)           | Permission and ACL enforcement, directory scopes, locks, atomic writes    |
| [tui](src/tui/README.md)                               | Components, browser interaction, layout, terminal text, and host mounting |
| [text-search](src/text-search/README.md)               | Cooperative normalization and search                                      |
| [latest-task](src/latest-task/README.md)               | Result commits and pending state for the latest task                      |
| [expiring-notice](src/expiring-notice/README.md)       | Notice expiry and deferred overflow reporting                             |
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
| [validation/pi-process](src/validation/pi-process/README.md)               | Private workspace directories and isolated launch configuration |
| [validation/provider](src/validation/provider/README.md)                   | Scripted assistant messages and event streams                   |
| [validation/terminal-launcher](src/validation/terminal-launcher/README.md) | Interactive fixture launches and exit status                    |

## Configuration

Callers pass options per call. The [working-message coordinator](src/working-message/README.md#persistence) stores ordering in Pi's global and project settings.

## Side effects

APIs may launch local helpers/workers, read/write files, repair permissions/ACLs, replace clipboard contents, mount UI, and replace object properties. No network requests.

## Validation

Use the [focused commands and test prerequisites](../../docs/development.md#focused-validation) with `@pi-mono/libs`. For native clipboard or private-storage changes, also use the [isolated platform checks](../extensions/pi-prompt-manager/docs/validation.md#platform-checks).
