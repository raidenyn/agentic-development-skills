export interface Pattern {
  /** The pattern as written in the rule file, after unescaping. Never RegExp.source, which escapes `/`. */
  source: string;
  regex: RegExp;
}

export interface Rule {
  /** The rule file's name. */
  name: string;
  /** The sha256 hex digest of the raw file bytes, BOM and line endings included. */
  sha256: string;
  pointer: string;
  skills: string[];
  commands: Pattern[];
  gates: Pattern[];
  /** The body with LF line endings, leading and trailing blank lines kept. */
  body: string;
}

export interface RuleIssue {
  /** The rule file, relative to the repository root; the rules folder itself for a folder failure. */
  path: string;
  message: string;
  /** True for a failure to read `.agents/hooked-rules/` itself, rather than one invalid file in it. */
  directory?: true;
}

export interface RuleLoad {
  rules: Rule[];
  errors: RuleIssue[];
}
