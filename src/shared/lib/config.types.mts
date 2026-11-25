// Types for .agents/harness.json: one top-level key per tool (harness RFC, "Vendored tool layout").
export type HarnessConfig = Record<string, unknown>;

export interface SectionOptions {
  // Keys the tool accepts in its own section; any other key is an error.
  keys?: readonly string[];
  required?: readonly string[];
  defaults?: Record<string, unknown>;
}

export interface SectionResult<T> {
  section: T;
  errors: string[];
}
