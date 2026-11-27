// The per-context delivery ledger (design D5): one JSON file per agent context, and a compaction log
// whose line count is the effective generation. One lock file, `ledger.lock`, guards the ledger
// write. Acquisition publishes the lock atomically: the owner token is written to a temp file and
// hard-linked to `ledger.lock`, so a lock never exists without its full owner record and a missing or
// unreadable owner can only be a crash artifact. A dead holder (its pid is gone) is taken over by
// renaming the lock to a unique name and verifying the moved token is the dead one we checked; a
// fresh lock displaced by a delayed contender is put back instead of being claimed. Ownership is
// re-read from the canonical path immediately before every write and on release, so a dispatch whose
// lock a takeover replaced writes nothing.
//
// `compactions.log` is append-only: a compaction appends one small line and never rewrites the
// ledger, so no writer, however late, can lower the effective generation or revive an entry a
// compaction voided. `ledger.json`'s `generation` is kept for readability and ignored on read.
import {
  appendFileSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomic } from './state.mts';
import type { Entry, Ledger } from './deliver.types.mts';

export const LEDGER_FILE = 'ledger.json';
export const LOCK_FILE = 'ledger.lock';
export const COMPACTIONS_FILE = 'compactions.log';
const WAIT_MS = 1000; // how long to wait for the lock
const RETRY_MS = 20; // the retry interval

export interface LedgerLock {
  /** The canonical lock path. Ownership is always read from this path, never from a moved handle. */
  readonly path: string;
  /** The owner token this dispatch wrote; a write is only made while the token is still there. */
  readonly token: string;
  /** Whether the canonical lock still names this dispatch's token. */
  owned(): boolean;
  release(): void;
}

/** Test seams at the three points where a takeover or an acquisition can race. */
export interface LedgerLockHooks {
  /** Awaited after the owner token is written and before it is linked to the canonical path. */
  beforeLink?(): void | Promise<void>;
  /** Awaited after a dead owner was seen and before the dead-owner re-check. */
  beforeTakeOver?(): void | Promise<void>;
  /** Awaited after the dead-owner re-check and immediately before the rename. */
  beforeRename?(): void | Promise<void>;
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

let nameCounter = 0;
const uniqueName = (prefix: string) =>
  `${prefix}.${process.pid}-${nameCounter++}-${Math.random().toString(36).slice(2)}`;
const newToken = () => uniqueName('lock');

// The lock file's owner record, or null when it is gone, unreadable or not this version's JSON. A
// present lock always carries a complete record, so null is a crash artifact, never a half-created
// lock a contender could race.
function readOwner(path: string): Owner | null {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR' || error instanceof SyntaxError) return null;
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

type LockState = { kind: 'absent' } | { kind: 'dead'; token: string | null } | { kind: 'live' };

// A lock is stale only when its recorded owner is dead, or the path is not a lock file this version
// wrote (a legacy directory or a stray path). A live pid keeps the lock, however old it is. An
// absent path is not a lock at all.
function lockState(path: string): LockState {
  let info: ReturnType<typeof lstatSync>;
  try {
    info = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'absent' };
    throw error;
  }
  if (!info.isFile()) return { kind: 'dead', token: null };
  const owner = readOwner(path);
  if (owner === null || !pidAlive(owner.pid)) {
    return { kind: 'dead', token: typeof owner?.token === 'string' ? owner.token : null };
  }
  return { kind: 'live' };
}

function makeLock(path: string, token: string): LedgerLock {
  const owned = () => {
    try {
      const owner = readOwner(path); // the canonical path, never a copy inside a moved handle
      return owner !== null && owner.token === token;
    } catch {
      return false; // an unreadable owner proves no ownership; the call fails open
    }
  };
  return {
    path,
    token,
    owned,
    release() {
      try {
        if (owned()) unlinkSync(path);
      } catch {}
    },
  };
}

// Rename a dead holder's lock to a unique name, verify it is the dead lock we checked and remove it.
// A delayed contender can rename a fresh lock after the re-check; the token comparison detects that
// and puts the fresh lock back instead of claiming it. A rename that fails with ENOENT means another
// contender got there first, so the caller simply retries the acquire.
function takeOver(path: string, deadToken: string | null): void {
  const claimed = uniqueName(`${path}.stale`);
  try {
    renameSync(path, claimed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  let moved: Owner | null = null;
  try {
    moved = readOwner(claimed);
  } catch {}
  const movedToken = typeof moved?.token === 'string' ? moved.token : null;
  if (movedToken !== deadToken) {
    // We displaced a lock that is not the one we checked: restore it when the path is still free.
    let restored = false;
    try {
      linkSync(claimed, path);
      restored = true;
    } catch {}
    try {
      if (restored) unlinkSync(claimed);
      else rmSync(claimed, { recursive: true, force: true });
    } catch {}
    return;
  }
  rmSync(claimed, { recursive: true, force: true });
}

/**
 * The context's ledger lock, or null after the wait. Acquisition links a complete owner record into
 * place, so no contender can observe an ownerless lock. A dead holder's lock is renamed away and
 * re-created; a live holder keeps it and the call fails open once the wait expires.
 */
export async function acquireLedgerLock(dir: string, hooks: LedgerLockHooks = {}): Promise<LedgerLock | null> {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, LOCK_FILE);
  const end = Date.now() + WAIT_MS;
  for (;;) {
    const token = newToken();
    const tmp = uniqueName(join(dir, '.ledger-lock'));
    let created = false;
    try {
      writeFileSync(tmp, JSON.stringify({ token, pid: process.pid, at: Date.now() }));
      await hooks.beforeLink?.();
      try {
        linkSync(tmp, path);
        created = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    } finally {
      try {
        unlinkSync(tmp);
      } catch {}
    }
    if (created) return makeLock(path, token);
    if (Date.now() >= end) return null;
    const state = lockState(path);
    if (state.kind === 'dead') {
      await hooks.beforeTakeOver?.();
      const recheck = lockState(path);
      // A paused contender must not displace a lock another takeover created meanwhile.
      if (recheck.kind !== 'dead' || recheck.token !== state.token) continue;
      await hooks.beforeRename?.();
      // The rename is verified against the token we saw, so even a contender that was not paused
      // here cannot displace a fresh holder: a mismatched token is put back, not claimed.
      takeOver(path, state.token);
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
 * is replaced by the next locked, live write, even when the event records nothing. The payload is
 * built before the final read; the write then happens only while this dispatch still owns the
 * canonical lock and `live()` holds. Otherwise nothing is written and the call fails open. Read,
 * match and write failures reject, so the runtime shows its manual notice and the host's call still
 * passes.
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
    const next = { version: 1, generation, entries: result.ledger.entries, reported: result.ledger.reported };
    if (lock === null || !lock.owned() || !live()) return null;
    writeJsonAtomic(join(dir, LEDGER_FILE), next);
    return result.value;
  } finally {
    lock?.release();
  }
}

/**
 * Append one compaction to the log. The log is append-only, so a completed compaction can never be
 * rolled back by a dispatch holding a stale ledger, and each appended line raises the effective
 * generation that makes earlier entries not live. The timestamp written is sampled before the final
 * check and reused, so no time-dependent payload is read after the deadline has passed; the check is
 * the last thing before the append.
 */
export async function bump(
  dir: string,
  { signal, deadline }: { signal?: AbortSignal; deadline?: number } = {},
): Promise<void> {
  if (signal?.aborted || (deadline !== undefined && Date.now() >= deadline)) return;
  mkdirSync(dir, { recursive: true });
  const at = Date.now();
  if (signal?.aborted || (deadline !== undefined && at >= deadline)) return;
  appendFileSync(join(dir, COMPACTIONS_FILE), `${at}\n`);
}
