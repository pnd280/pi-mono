# Input discovery

[Package](../README.md) · [Glossary](../GLOSSARY.md)

pi-nested-instructions finds the directories to search from the inputs of each tool call. It never runs commands, reads tool results, or lists glob matches to find them.

## Recognised tools

Discovery infers the scope of a call from its inputs. The scope is the directories below the working directory that the input addresses, plus the exact instruction files that it tries to read. These tools provide scope:

- The native `read`, `ls`, `grep`, `find`, and `bash` tools.
- The official FFF tools `fffind`, `ffgrep`, and `fff-multi-grep`, and the FFF tools that override native tool names.

These inputs give no scope:

- Search content patterns.
- Exclusions.
- Fuzzy filenames.
- Searches that give only a cursor.

In a glob pattern, only the fixed directory prefix before the first wildcard and finite brace alternatives, such as `{src,lib}`, give directories. A wildcard never counts as an exact read of an instruction file. Listing a filename is not a content read.

When the model calls a tool directly, a failed or blocked attempt to read an instruction file still counts as a read of that file, so discovery does not add a second copy.

## Bash inference

Discovery parses each Bash command without running it, and without expanding variables or filesystem globs. It supports this syntax:

- Literal simple commands.
- Unquoted finite brace alternatives.
- Ordinary pipes.
- `&&` and `||` chains.
- Sequential commands.
- Basic redirections: `<`, `>`, `>>`, `<&`, and `>&`.

### Syntax that stops inference

A parser error or unsupported syntax stops inference for the whole invocation, including commands in it that are otherwise valid. Unsupported syntax includes:

- Dynamic expansions, also in declaration assignments such as `export NAME=value`.
- Assignments before a command.
- Compound commands.
- Background execution.
- `|&`, `time`, and negation.
- Extended globs.
- ANSI-C and localised strings.
- Here-documents and here-strings.
- Variable file descriptors.

Quoting and escapes decide whether tildes and glob characters are literal. Scope patterns cannot keep shell quoting for each character, so these two combinations also stop inference for the invocation:

- Quotes or escapes inside brace alternatives.
- Words that mix literal glob characters with active glob or brace syntax.

Paths that are completely quoted or escaped still give scope. Quoted plain prefixes, such as `"pkg/"{src,lib}/AGENTS.md`, also still give scope.

### Commands and operands

Inference recognises paths in `cd`, `ls`, `cat`, `head`, `tail`, `sed`, `awk`, `grep`, `rg`, `find`, and `fd`.

- An unknown option discards the hints of that command.
- `source`, `.`, `eval`, `exec`, `pushd`, `popd`, and a `cd` without exactly one literal target stop inference for the rest of the invocation. A piped `cd` also stops it. Hints from earlier commands are kept.
- Inference stops before the right-hand side of `||`, also when the left-hand side is a command with only redirections. Discovery still checks the later syntax, so unsupported syntax there stops inference for the whole invocation.
- Modes that print only filenames do not count as content reads.
- For `find`, only the path operands before the filter expression give scope.

The [scope extraction](../src/scopes.ts) and [Bash inference](../src/bash.ts) sources list the supported operands and options.

### Windows

On Windows, Pi's Bash can be Git Bash, MSYS2, Cygwin, or WSL. A path operand or a path-valued option that starts with a drive component, such as `/c/`, is read as the drive path `C:/`, as in Git Bash and MSYS2. This applies to separate and attached option values. Other POSIX-rooted paths, such as `/tmp/pkg`, give no scope, because their mount root depends on the shell. A `cd` to such a path stops inference for the rest of the invocation.
