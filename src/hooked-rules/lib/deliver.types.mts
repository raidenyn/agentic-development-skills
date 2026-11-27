// The delivery ledger of one agent context (design D5): the generation a compaction bumps, one entry
// per rule file name, and the load-error keys already reported. Type-only: never emitted.
export interface Entry {
  /** The sha256 of the rule file the entry was recorded for. */
  sha256: string;
  /** The ledger generation at which the entry was recorded. */
  generation: number;
  state: 'delivered' | 'pending';
  /** The matched gate patterns of a pending or confirmed rule. */
  patterns: string[];
  /** The `skill:<name>` and `command:<source>` triggers already delivered for this rule. */
  triggers: string[];
}

export interface Ledger {
  version: 1;
  /** Bumped by a compaction in this context; older entries are not live. */
  generation: number;
  entries: Record<string, Entry>;
  /** The `path:message` keys of load errors already reported in this context. */
  reported: string[];
}

export type DecisionResult = { context: string } | { deny: string } | null;

export interface Decision {
  result: DecisionResult;
  /** The next ledger; the same object as the argument when nothing was recorded. */
  ledger: Ledger;
}
