// The CLI's output and exit-code sink. Type-only: never emitted.
export interface Io {
  out: (s: string) => unknown;
  ok: (lines: string[]) => number;
  fail: (lines: string[]) => number;
}
