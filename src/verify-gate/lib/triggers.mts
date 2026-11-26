// Trigger detection (design D5 "Ticked task"). One detector serves edits and shell calls alike: it
// compares per-key checkbox counts of a task file before the call (the before-image) with the file
// afterwards. Line positions and hunks do not matter. Swapping which of two identically labelled
// items is ticked leaves the counts unchanged and is not detected (a stated limit).

export type Counts = { ticked: number; unticked: number };

const escapeRe = (s: string): string => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

// `*` matches within one path segment, `**` across segments, `?` one character other than `/`.
export function matchesGlob(pattern: unknown, relPath: unknown): boolean {
  const path = String(relPath).replace(/\\/g, '/');
  let re = '';
  const p = String(pattern).replace(/\\/g, '/');
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') {
      i++;
      if (p[i + 1] === '/') {
        i++;
        re += '(?:.*/)?';
      } else {
        re += '.*';
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += escapeRe(c);
    }
  }
  return new RegExp(`^${re}$`).test(path);
}

const segmentRe = (seg: string): RegExp => {
  let re = '';
  for (const c of seg) {
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += escapeRe(c);
  }
  return new RegExp(`^${re}$`, 'u');
};

// Segment by segment: a whole `**` segment matches zero or more path segments, any other segment
// exactly one. In the pattern `\` counts as `/`; the path is split on `/` only. `.` and empty
// segments are dropped on both sides. Memoized, so repeated `**` cost patterns x path segments.
export function matchesPathGlob(pattern: unknown, relPath: unknown): boolean {
  const keep = (s: string) => s !== '' && s !== '.';
  const pat = String(pattern).replace(/\\/g, '/').split('/').filter(keep);
  const path = String(relPath).split('/').filter(keep);
  const res = pat.map((s) => (s === '**' ? null : segmentRe(s)));
  const memo = new Map<number, boolean>();
  const go = (i: number, j: number): boolean => {
    if (i === pat.length) return j === path.length;
    const key = i * (path.length + 1) + j;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const re = res[i];
    const ok =
      re === null
        ? go(i + 1, j) || (j < path.length && go(i, j + 1))
        : j < path.length && re.test(path[j]) && go(i + 1, j + 1);
    memo.set(key, ok);
    return ok;
  };
  return go(0, 0);
}

const ITEM = /^\s*[-*+]\s+\[([ xX])\]\s+(.*?)\s*$/;

// A checkbox list item: `- [ ] text`, `* [x] text`, `+ [X] text`. The key is the trimmed text
// after the box. A trailing CR is ignored.
export function parseItem(line: unknown): { key: string; ticked: boolean } | null {
  const m = ITEM.exec(String(line).replace(/\r$/, ''));
  if (!m || m[2] === '') return null;
  return { key: m[2], ticked: m[1] !== ' ' };
}

export function itemCounts(text: unknown): Map<string, Counts> {
  const counts = new Map<string, Counts>();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const item = parseItem(line);
    if (!item) continue;
    const c = counts.get(item.key) ?? { ticked: 0, unticked: 0 };
    if (item.ticked) c.ticked++;
    else c.unticked++;
    counts.set(item.key, c);
  }
  return counts;
}

const countsOf = (m: any, key: string): Counts => {
  const c = m instanceof Map ? m.get(key) : m?.[key];
  return { ticked: c?.ticked ?? 0, unticked: c?.unticked ?? 0 };
};

// Keys whose unticked count fell and whose ticked count rose, min(fall, rise) times each. Without a
// before-image (a new file) there is no transition. Accepts Maps or plain {key: counts} objects.
export function detectTicks(before: unknown, after: unknown): string[] {
  if (!before || !after) return [];
  const keys = after instanceof Map ? [...after.keys()] : Object.keys(after);
  const out: string[] = [];
  for (const key of keys) {
    const b = countsOf(before, key);
    const a = countsOf(after, key);
    const n = Math.min(b.unticked - a.unticked, a.ticked - b.ticked);
    for (let i = 0; i < n; i++) out.push(key);
  }
  return out;
}

const toMs = (at: unknown): number => (typeof at === 'number' ? at : Date.parse(at as string));

// Removes, per key, as many ticks as the tasks.json snapshot
// ({"version": 1, "files": {path: {key: {ticked, unticked, ticks: [at, ...]}}}}) recorded after
// `callAt`. With `path`, only that file's entry counts; otherwise every file's.
export function suppressSeen(ticks: string[], snapshot: any, callAt: unknown, path?: string): string[] {
  const files = snapshot?.files ?? {};
  const entries: any[] = path === undefined ? Object.values(files) : [files[path]];
  const since = toMs(callAt);
  const seen = new Map<string, number>();
  for (const entry of entries) {
    for (const [key, rec] of Object.entries(entry ?? {})) {
      const n = ((rec as any)?.ticks ?? []).filter((at: unknown) => toMs(at) > since).length;
      if (n) seen.set(key, (seen.get(key) ?? 0) + n);
    }
  }
  const out: string[] = [];
  for (const key of ticks) {
    const left = seen.get(key) ?? 0;
    if (left > 0) seen.set(key, left - 1);
    else out.push(key);
  }
  return out;
}
