// The per-context delivery ledger (design D5): one JSON file per agent context, and a compaction log
// whose line count is the effective generation. One lock directory, `ledger.lock`, guards the
// ledger write; it is created with mkdir(2) and carries an owner token. A lock is taken over only
// when its recorded pid is not alive (a crashed holder), never by age alone, so a slow live holder
// keeps it and other calls fail open. Ownership is re-checked immediately before every write and on
// release, so a dispatch whose lock a takeover replaced writes nothing.
//
// `compactions.log` is append-only: a compaction appends one small line and never rewrites the
// ledger, so no writer, however late, can lower the effective generation or revive an entry a
// compaction voided. `ledger.json`'s `generation` is kept for readability and ignored on read.
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomic } from './state.mts';
import type { Entry, Ledger } from './deliver.types.mts';

export const LEDGER_FILE = 'ledger.json';
export const LOCK_FILE = 'ledger.lock';
export const COMPACTIONS_FILE = 'compactions.log';
const OWNER_FILE = 'owner';
const WAIT_MS = 1000; // how long to wait for the lock
const RETRY_MS = 20; // the retry interval

export interface LedgerLock {
  /** The lock directory. */
  readonly path: string;
  /** The owner token this dispatch wrote; a write is only made while the token is still there. */
  readonly token: string;
  /** Whether the owner file still names this dispatch's token. */
  owned(): boolean;
  release(): void;
}

/** A test seam: awaited after a dead owner was seen and before the lock is renamed away. */
export interface LedgerLockHooks {
  beforeTakeOver?(): void | Promise<void>;
}

export interface LedgerOptions {
  /** Checked right before a write, after the final read; false writes nothing. */
  live?: () => boolean;
}

// fn returns the next ledger and the value to hand back. It returns null to write nothing; returning
// the ledger it was given also writes nothing.
export type LedgerOperation<T> = (ledger: Ledger, locked: boolean) => { ledger: Ledger; value: T } | null;

interface Owner {
  token?: unknown;
  pid?: unknown;
  at?: unknown;
}

const emptyLedger = (): Ledger => ({ version: 1, generation: 0, entries: {}, reported: [] });

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let tokenCounter = 0;
const newToken = () => `${process.pid}-${Date.now()}-${tokenCounter++}-${Math.random().toString(36).slice(2)}`;

const ownerPath = (lock: string) => join(lock, OWNER_FILE);

// The lock's owner file, or null when it is gone, unreadable or not a lock directory.
function readOwner(lock: string): Owner | null {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(ownerPath(lock), 'utf8'));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || error instanceof SyntaxError) return null;
    throw error;
  }
  return value !== null && typeof value === 'object' ? (value as Owner) : null;
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

// A lock is stale only when its recorded owner is dead. A lock directory without an owner is a crash
// between mkdir and the token write, and a path that is not a directory is not a lock this version
// wrote; both are taken over as dead. A live pid keeps the lock, however old it is.
function isDeadOwner(path: string): boolean {
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
  if (!stats.isDirectory()) return true;
  const owner = readOwner(path);
  return owner === null || !pidAlive(owner.pid);
}

// Create the lock directory and write its owner token. A failure after the create removes only the
// still-ownerless directory this create made, so a rejected acquisition never leaves a lock behind.
function create(path: string, token: string): boolean {
  try {
    mkdirSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
  try {
    writeFileSync(ownerPath(path), JSON.stringify({ token, pid: process.pid, at: Date.now() }));
  } catch (error) {
    if (readOwner(path) === null) rmSync(path, { recursive: true, force: true });
    throw error;
  }
  return true;
}

// Rename a dead holder's lock to a unique name and remove it; the rename is atomic, and a rename that
// fails with ENOENT means another contender got there first.
function takeOver(path: string): void {
  const stale = `${path}.${newToken()}`;
  try {
    renameSync(path, stale);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  rmSync(stale, { recursive: true, force: true });
}

/**
 * The context's ledger lock, or null after the wait. A dead holder's lock is renamed away and
 * re-created; a live holder keeps it and the call fails open once the wait expires.
 */
export async function acquireLedgerLock(dir: string, hooks: LedgerLockHooks = {}): Promise<LedgerLock | null> {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, LOCK_FILE);
  const end = Date.now() + WAIT_MS;
  for (;;) {
    const token = newToken();
    if (create(path, token)) {
      const lock: LedgerLock = {
        path,
        token,
        owned() {
          try {
            const owner = readOwner(path);
            return owner !== null && owner.token === token;
          } catch {
            return false; // an unreadable owner proves no ownership; the call fails open
          }
        },
        release() {
          try {
            if (lock.owned()) rmSync(path, { recursive: true, force: true });
          } catch {}
        },
      };
      return lock;
    }
    if (Date.now() >= end) return null;
    if (isDeadOwner(path)) {
      await hooks.beforeTakeOver?.();
      // Re-check at the rename point: a paused contender must not displace a lock a takeover created.
      if (!isDeadOwner(path)) continue;
      takeOver(path);
      continue;
    }
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
      if (entry !== null) entries[name] = entry; // an unreadable entry is dropped, which delivers again
    }
  }
  const reported = Array.isArray(raw.reported)
    ? raw.reported.filter((key): key is string => typeof key === 'string')
    : [];
  return { version: 1, generation, entries, reported };
}

// The effective generation: the number of compactions logged. Only ever grows, and a late writer
// cannot lower it.
function effectiveGeneration(dir: string): number {
  let text: string;
  try {
    text = readFileSync(join(dir, COMPACTIONS_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  return text.split('\n').filter((line) => line.trim() !== '').length;
}

// A missing file is a fresh ledger; a broken one is a fresh ledger that the next locked, live write
// replaces. The stored generation is ignored: the effective generation comes from the log. Any other
// read failure is an operational failure and is surfaced, not hidden.
function readLedgerState(dir: string): { ledger: Ledger; corrupt: boolean } {
  const generation = effectiveGeneration(dir);
  let text: string;
  try {
    text = readFileSync(join(dir, LEDGER_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { ledger: { ...emptyLedger(), generation }, corrupt: false };
    throw error;
  }
  const stored = parseLedger(text);
  if (stored === null) return { ledger: { ...emptyLedger(), generation }, corrupt: true };
  return { ledger: { ...stored, generation }, corrupt: false };
}

/** The ledger at dir's ledger.json at the effective generation; a missing or broken file is a fresh ledger. */
export function readLedger(dir: string): Ledger {
  return readLedgerState(dir).ledger;
}

/**
 * Run fn on the context's ledger under its lock, and write the ledger fn returns.
 *
 * Without the lock fn still runs, with `locked: false`, and nothing is written. A broken ledger file
 * is replaced by the next locked, live write, even when the event records nothing. The write happens
 * only after a final read while this dispatch still owns the lock and `live()` holds; otherwise
 * nothing is written and the call fails open. Read, match and write failures reject, so the runtime
 * shows its manual notice and the host's call still passes.
 */
export async function withLedger<T>(
  dir: string,
  fn: LedgerOperation<T>,
  { live = () => true }: LedgerOptions = {},
): Promise<T | null> {
  const lock = await acquireLedgerLock(dir);
  try {
    const owned = lock?.owned() ?? false;
    const { ledger, corrupt } = readLedgerState(dir);
    const result = fn(ledger, owned);
    if (result === null) return null;
    if (!owned) return result.value;
    if (result.ledger === ledger && !corrupt) return result.value;
    // The last read before the write, then ownership and liveness at that same point: a dispatch
    // whose lock a takeover replaced, or whose call has expired, records nothing and fails open.
    const generation = Math.max(result.ledger.generation, effectiveGeneration(dir));
    if (lock === null || !lock.owned() || !live()) return null;
    writeJsonAtomic(join(dir, LEDGER_FILE), {
      version: 1,
      generation,
      entries: result.ledger.entries,
      reported: result.ledger.reported,
    });
    return result.value;
  } finally {
    lock?.release();
  }
}

/**
 * Append one compaction to the log. The log is append-only, so a completed compaction can never be
 * rolled back by a dispatch holding a stale ledger, and each appended line raises the effective
 * generation that makes earlier entries not live. The liveness check sits immediately before the
 * append, after any directory creation.
 */
export async function bump(
  dir: string,
  { signal, deadline }: { signal?: AbortSignal; deadline?: number } = {},
): Promise<void> {
  if (signal?.aborted || (deadline !== undefined && Date.now() >= deadline)) return;
  mkdirSync(dir, { recursive: true });
  if (signal?.aborted || (deadline !== undefined && Date.now() >= deadline)) return;
  appendFileSync(join(dir, COMPACTIONS_FILE), `${Date.now()}\n`);
}
