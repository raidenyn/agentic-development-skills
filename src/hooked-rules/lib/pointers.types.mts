// Where the AGENTS.md pointer block sits (design D7), as veles's BlockLocation. Type-only: never emitted.
export interface BlockLocation {
  /** The offset of the begin marker line's first character. */
  begin: number;
  /** The offset just past the end marker line's text, before its line break. */
  end: number;
  /** Whether the heading is the line right before the begin marker. */
  headingOk: boolean;
  /** The offset of the heading line when it is the last non-blank line before the begin marker. */
  heading: number | null;
}
