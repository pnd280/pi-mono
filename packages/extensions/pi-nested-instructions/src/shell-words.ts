export interface Word {
  value: string;
  pattern: boolean;
  expandHome: boolean;
}

export interface Command {
  words: Word[];
  inputs: Word[];
  separator: string;
}

/** Lex only simple shell commands. Unsupported syntax discards the invocation. */
class Lexer {
  private index = 0;
  private word = "";
  private started = false;
  private pattern = false;
  private expandHome = false;
  private quote = "";
  private redirect = "";
  private current: Command = { words: [], inputs: [], separator: "" };
  private result: Command[] = [];

  constructor(private readonly source: string) {}

  private flush() {
    if (!this.started) return;
    const token = { value: this.word, pattern: this.pattern, expandHome: this.expandHome };

    if (this.redirect === "<") this.current.inputs.push(token);
    else if (!this.redirect) this.current.words.push(token);
    this.redirect = "";
    this.word = "";
    this.pattern = false;
    this.expandHome = false;
    this.started = false;
  }

  private escape(quoted: boolean): boolean {
    const next = this.source[++this.index];
    if (next === undefined) return false;
    if (next === "\n") return true;
    this.started = true;
    if (quoted && !['"', "\\", "$", "`"].includes(next)) this.word += "\\";
    this.word += next;

    return true;
  }

  private quoted(char: string): boolean {
    if (char === this.quote) this.quote = "";
    else if (this.quote === "'") this.word += char;
    else if (char === "$" || char === "`") return false;
    else if (char === "\\") return this.escape(true);
    else this.word += char;

    return true;
  }

  private separator(char: string): boolean {
    this.flush();
    let separator = char;

    if (this.source[this.index + 1] === char && (char === "|" || char === "&"))
      separator += this.source[++this.index];
    if (separator === "&" || this.redirect) return false;
    this.current.separator = separator;
    this.result.push(this.current);
    this.current = { words: [], inputs: [], separator: "" };

    return true;
  }

  private redirection(char: string): boolean {
    const next = this.source[this.index + 1];

    // Do not interpret here-documents, here-strings, or process substitution.
    if (next === "<") return false;

    const descriptor = /^\d+$/.test(this.word) ? this.word : undefined;

    if (descriptor !== undefined) {
      this.word = "";
      this.started = false;
    }

    this.flush();
    if (this.redirect) return false;
    // Descriptor duplication (`2>&1`, `<&3`) names a descriptor, never an input path.
    // Only stdin (`<`, `0<`) supplies command input; `3<file` opens an unused descriptor.
    const stdin = char === "<" && (descriptor === undefined || descriptor === "0");
    this.redirect = next === "&" || (char === "<" && !stdin) ? "&" : char;
    if (next === ">" || next === "&") this.index++;

    return true;
  }

  private unquoted(char: string): boolean {
    if (char === "'" || char === '"') {
      this.quote = char;
      this.started = true;
    } else if (char === "\\") return this.escape(false);
    else if ("$`()".includes(char)) return false;
    else if (char === "#" && !this.started) {
      while (this.index < this.source.length && this.source[this.index] !== "\n") this.index++;
      this.index--;
    } else if ([";", "\n", "|", "&"].includes(char)) return this.separator(char);
    else if (char === "<" || char === ">") return this.redirection(char);
    else if (/\s/.test(char)) this.flush();
    else {
      if (!this.started && char === "~") this.expandHome = true;
      this.started = true;
      this.pattern ||= "*?[{".includes(char);
      this.word += char;
    }

    return true;
  }

  parse(): Command[] {
    for (; this.index < this.source.length; this.index++) {
      const char = this.source.charAt(this.index);
      if (!(this.quote ? this.quoted(char) : this.unquoted(char))) return [];
    }

    if (this.quote) return [];
    this.flush();
    if (this.redirect) return [];
    this.result.push(this.current);
    if (
      this.result.some(({ words }) =>
        /^(?:if|then|else|fi|for|while|until|do|done|case|esac|function|\{|\})$/.test(
          words[0]?.value ?? ""
        )
      )
    )
      return [];

    return this.result;
  }
}

export function shellCommands(source: string): Command[] {
  return new Lexer(source).parse();
}
