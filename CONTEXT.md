# Prompt management terminology

[pi-prompt-manager](packages/extensions/pi-prompt-manager/README.md)

| Term                      | Meaning                                                                                                                                            | Avoid                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Collection                | History or Saved drafts associated with one real working directory.                                                                                |                                                             |
| History                   | The collection of captured interactive user submissions, with surrounding whitespace trimmed.                                                      | Session transcript, native editor history                   |
| Saved draft               | A separately saved occurrence of prompt text, retained until explicitly removed.                                                                   | Queued submission                                           |
| Occurrence                | One stored capture or save, distinct from other occurrences even when their text is identical.                                                     | Unique prompt                                               |
| Source text               | The stored text of an occurrence, distinct from its terminal-safe display text.                                                                    | Preview text                                                |
| Effective browser binding | A binding that wins the prompt browser's precedence rules for its action.                                                                          | Configured binding, when precedence has not been considered |
| Shadowed browser binding  | A configured or fixed browser binding whose key is claimed by a higher-priority browser action.                                                    |                                                             |
| Restoration request       | A choice of occurrence for editor replacement, optionally followed by removal of that saved draft. It records intent, not a completed restoration. |                                                             |
| Restoration               | Replacement of editor text with a selected occurrence's source text, without submitting it.                                                        | Submission, restoration request                             |
