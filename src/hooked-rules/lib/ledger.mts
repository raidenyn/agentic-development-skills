// The per-context delivery ledger (design D5): one JSON file per agent context and a lock built on
// exclusive file creation. Ownership is a numbered slot claimed with link(2), the pattern of
// acquireGateLock in lib/state.mts: a dispatch only ever unlinks its own slot and never moves or
// removes another one, so a takeover and a fresh claim cannot interleave into two holders of one
// pathname. A slot is free when it is gone, released, held by a dead process, or older than the
// takeover age; taking over means claiming a higher slot, which the link makes atomic.
import { linkSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomic } from './state.mts';
import type { Entry, Ledger } from './deliver.types.mts';

export const LEDGER_FILE = 'ledger.json';
export const LOCK_FILE = 'ledger.lock';
const SLOT_RE = /^ledger\.lock\.(\d+)$/;
const WAIT_MS = 1000; // how long to wait for the lock
const RETRY_MS = 20; // the retry interval
const STALE_MS = 10000; // a slot older than this may be taken over
const PRUNE_AGE_MS = 3600 * 1000; // abandoned slots kept this long

export interface LedgerLock {
  readonly path: string;
  release(): void;
}

// fn returns the next ledger and the value to hand back. It returns null to write nothing; returning
// the ledger it was given also writes nothing (and bump writes on its own).
export type LedgerOperation<T> = (ledger: Ledger, locked: boolean) => { ledger: Ledger; value: T } | null;

const emptyLedger = (): Ledger => ({ version: 1, generation: 0, entries: {}, reported: [] });

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const slotPath = (dir: string, slot: number) => join(dir, `${LOCK_FILE}.${slot}`);

function listSlots(dir: string): number[] {
  return readdirSync(dir)
    .map((name) => SLOT_RE.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}

function pidAlive(pid: unknown): boolean {
  if (!Number.isInteger(pid) || (pid as number) <= 0) return false;
  try {
    process.kill(pid as number, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

// A slot is free when it is gone, was released, belongs to a dead process, is older than the takeover
// age, or is unreadable (a crash mid-write). Any other read error is an operational failure.
function isFree(path: string): boolean {
  let age: number;
  let body: { released?: unknown; pid?: unknown } | null;
  try {
    age = Date.now() - statSync(path).mtimeMs;
    body = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || error instanceof SyntaxError) return true;
    throw error;
  }
  if (age > STALE_MS || !body || typeof body !== 'object') return true;
  return body.released === true || !pidAlive(body.pid);
}

let tmpCounter = 0;

// Claim a slot exclusively by linking a complete file into its name; false when another dispatch took
// that number first. Only this dispatch ever unlinks the slot it claimed.
function claim(dir: string, slot: number): boolean {
  const tmp = join(dir, `.ledger-lock-${process.pid}-${Date.now()}-${tmpCounter++}`);
  writeFileSync(tmp, JSON.stringify({ pid: process.pid, at: Date.now(), released: false }));
  try {
    linkSync(tmp, slotPath(dir, slot));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

function prune(dir: string, own: number): void {
  const now = Date.now();
  for (const slot of listSlots(dir)) {
    if (slot >= own) continue;
    const path = slotPath(dir, slot);
    try {
      if (now - statSync(path).mtimeMs > PRUNE_AGE_MS) unlinkSync(path);
    } catch {}
  }
}

/**
 * The context's ledger lock, or null after the wait. The highest free-or-stale slot is taken over by
 * claiming its successor; a claim that loses the race to a concurrent dispatch is dropped, never
 * renamed, so no dispatch can remove the lock a takeover just created.
 */
export async function acquireLedgerLock(dir: string): Promise<LedgerLock | null> {
  mkdirSync(dir, { recursive: true });
  const end = Date.now() + WAIT_MS;
  for (;;) {
    const slots = listSlots(dir);
    const highest = slots.length > 0 ? (slots[slots.length - 1] as number) : 0;
    if (highest === 0 || isFree(slotPath(dir, highest))) {
      const mine = highest + 1;
      if (claim(dir, mine)) {
        const after = listSlots(dir);
        if (after[after.length - 1] === mine) {
          prune(dir, mine);
          return {
            path: slotPath(dir, mine),
            release() {
              try {
                unlinkSync(slotPath(dir, mine));
              } catch {}
            },
          };
        }
        // A concurrent dispatch claimed above us: drop our own slot and keep waiting.
        try {
          unlinkSync(slotPath(dir, mine));
        } catch {}
      }
    }
    if (Date.now() >= end) return null;
    await sleep(RETRY_MS);
  }
}

function readEntry(value: unknown): Entry | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
  if (typeof item.sha256 !== 'string') return null;
  if (typeof item.generation !== 'number' || !Number.isInteger(item.generation) || item.generation < 0) return null;
  if (item.state !== 'delivered' && item.state !== 'pending') return null;
  if (!strings(item.patterns) || !strings(item.triggers)) return null;
  return {
    sha256: item.sha256,
    generation: item.generation,
    state: item.state,
    patterns: item.patterns,
    triggers: item.triggers,
  };
}

// The ledger text, or null when it is not this version's JSON. An unreadable entry is dropped, which
// delivers again rather than blocking.
function parseLedger(text: string): Ledger | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return null;
  const generation = raw.generation;
  if (typeof generation !== 'number' || !Number.isInteger(generation) || generation < 0) return null;
  const entries: Record<string, Entry> = {};
  if (typeof raw.entries === 'object' && raw.entries !== null && !Array.isArray(raw.entries)) {
    for (const [name, item] of Object.entries(raw.entries as Record<string, unknown>)) {
      const entry = readEntry(item);
      if (entry !== null) entries[name] = entry;
    }
  }
  const reported = Array.isArray(raw.reported)
    ? raw.reported.filter((key): key is string => typeof key === 'string')
    : [];
  return { version: 1, generation, entries, reported };
}

// A missing file is a fresh ledger; a broken one is a fresh ledger that the next locked write
// replaces. Any other read failure is an operational failure and is surfaced, not hidden.
function readLedgerState(dir: string): { ledger: Ledger; corrupt: boolean } {
  let text: string;
  try {
    text = readFileSync(join(dir, LEDGER_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ledger: emptyLedger(), corrupt: false };
    throw error;
  }
  const ledger = parseLedger(text);
  return ledger === null ? { ledger: emptyLedger(), corrupt: true } : { ledger, corrupt: false };
}

/** The ledger at dir's ledger.json; a missing or broken file is a fresh ledger. */
export function readLedger(dir: string): Ledger {
  return readLedgerState(dir).ledger;
}

/**
 * Run fn on the context's ledger under its lock, and write the ledger fn returns.
 *
 * Without the lock fn still runs, with `locked: false`, and nothing is written. A broken ledger file
 * is replaced by the next locked write, even when the event records nothing. The generation written
 * is at least the one on disk, so a compaction that won no lock is not rolled back by a dispatch
 * holding a stale copy. Read, match and write failures reject, so the runtime shows its manual
 * notice and the host's call still passes.
 */
export async function withLedger<T>(dir: string, fn: LedgerOperation<T>): Promise<T | null> {
  const lock = await acquireLedgerLock(dir);
  try {
    const { ledger, corrupt } = readLedgerState(dir);
    const result = fn(ledger, lock !== null);
    if (result === null) return null;
    if (lock === null) return result.value;
    if (result.ledger === ledger && !corrupt) return result.value;
    const generation = Math.max(result.ledger.generation, readLedgerState(dir).ledger.generation);
    writeJsonAtomic(join(dir, LEDGER_FILE), { ...result.ledger, generation });
    return result.value;
  } finally {
    lock?.release();
  }
}

/**
 * Bump the context's generation. Written even without the lock, because a lost concurrent write only
 * delivers again; the value is raised above whatever is on disk at write time so a concurrent bump
 * survives. A call that was aborted or past its deadline before the write records nothing.
 */
export async function bump(
  dir: string,
  { signal, deadline }: { signal?: AbortSignal; deadline?: number } = {},
): Promise<void> {
  const lock = await acquireLedgerLock(dir);
  try {
    if (signal?.aborted || (deadline !== undefined && Date.now() >= deadline)) return;
    const { ledger } = readLedgerState(dir);
    const generation = Math.max(ledger.generation, readLedgerState(dir).ledger.generation) + 1;
    writeJsonAtomic(join(dir, LEDGER_FILE), { ...ledger, generation });
  } finally {
    lock?.release();
  }
}
