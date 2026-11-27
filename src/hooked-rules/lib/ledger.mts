// The per-context delivery ledger (design D5): one JSON file per agent context, and a compaction log
// whose line count is the effective generation. In a hook worker the write is guarded by the lock the
// supervisor owns through `context.lock`; the supervisor tracks it per worker generation and releases
// it when that generation retires, so a terminated worker cannot leave the ledger locked. A busy
// supervisor lock is retried every 20 ms for up to 1 s or the caller's deadline. In process
// (tests) one lock file, `ledger.lock`, guards the write instead. Its acquisition publishes the lock
// atomically: the owner token is written to a temp file and hard-linked to `ledger.lock`, so a lock
// never exists without its full owner record and a missing or unreadable owner can only be a crash
// artifact. A dead holder (its pid is gone) is taken over by renaming the lock to a unique name and
// verifying the moved token is the dead one we checked; a displaced artifact is discarded, never put
// back, so a restored spent lock can never block later calls. Ownership is re-read from the canonical
// path immediately before every write and on release, so a dispatch whose lock a takeover replaced
// writes nothing. Only regular files are ever read as owner records, so a stray FIFO cannot block the
// event loop. Calls in one process are serialized per state directory before the lock is even tried;
// the lock orders separate processes and worker threads.
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
import { join, resolve } from 'node:path';
import { writeJsonAtomic } from './state.mts';
import type { Entry, Ledger } from './deliver.types.mts';
import type {
  LedgerLock,
  LedgerLockHooks,
  LedgerOperation,
  LedgerOptions,
  LockState,
  Owner,
  TakeOver,
} from './ledger.types.mts';

export const LEDGER_FILE = 'ledger.json';
export const LOCK_FILE = 'ledger.lock';
export const COMPACTIONS_FILE = 'compactions.log';
const WAIT_MS = 1000; // how long to wait for the lock
const RETRY_MS = 20; // the retry interval

const emptyLedger = (): Ledger => ({ version: 1, generation: 0, entries: {}, reported: [] });

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let nameCounter = 0;
const uniqueName = (prefix: string) =>
  `${prefix}.${process.pid}-${nameCounter++}-${Math.random().toString(36).slice(2)}`;
const newToken = () => uniqueName('lock');

// The lock file's owner record, or null when it is gone, not a regular file, unreadable or not this
// version's JSON. A present lock always carries a complete record, so null is a crash artifact,
// never a half-created lock a contender could race. A non-regular artifact is never read: reading a
// writerless FIFO would block the event loop.
function readOwner(path: string): Owner | null {
  let info: ReturnType<typeof lstatSync>;
  try {
    info = lstatSync(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw error;
  }
  if (!info.isFile()) return null;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
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

// Rename whatever holds the canonical path to a unique name and inspect only that artifact. A
// regular file carrying the dead token we checked is removed and the acquisition retries. Anything
// else — a lock another dispatch published meanwhile, or a non-file crash artifact — is discarded
// with an unlink, never restored, and this dispatch gives up writing nothing. Restoring a displaced
// lock can resurrect a lock its holder has already released; discarding cannot.
function takeOver(path: string, deadToken: string | null): TakeOver {
  const claimed = uniqueName(`${path}.stale`);
  try {
    renameSync(path, claimed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'retry';
    throw error;
  }
  let moved: Owner | null = null;
  try {
    moved = readOwner(claimed); // lstat first: a stray FIFO is never read
  } finally {
    rmSync(claimed, { recursive: true, force: true });
  }
  const movedToken = typeof moved?.token === 'string' ? moved.token : null;
  return movedToken === deadToken ? 'retry' : 'give-up';
}

/**
 * The context's ledger lock, or null after the wait. Acquisition links a complete owner record into
 * place, so no contender can observe an ownerless lock. A dead holder's lock is renamed away and
 * re-created; a live holder keeps it and the call fails open once the wait expires. A takeover that
 * displaced a lock it did not check discards it and gives up rather than restore it.
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
      // here cannot become a second writer: a mismatched artifact is discarded and this dispatch
      // gives up instead of claiming it.
      if (takeOver(path, state.token) === 'give-up') return null;
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

// In-process serialization per state directory. Concurrent calls in one process run one at a time,
// so an exactly-once guarantee never depends on the timing of the cross-process file lock. Every
// ledger operation goes through this queue; acquireLedgerLock itself stays open because a paused
// acquisition is how a takeover race is observed.
const processLocks = new Map<string, Promise<void>>();

function withProcessLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const key = resolve(dir);
  const previous = processLocks.get(key) ?? Promise.resolve();
  const run = previous.then(() => fn());
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  processLocks.set(key, tail);
  void tail.then(() => {
    if (processLocks.get(key) === tail) processLocks.delete(key);
  });
  return run;
}

async function acquireRuntimeLock(
  runtimeLock: NonNullable<LedgerOptions['lock']>,
  dir: string,
  live: () => boolean,
): Promise<{ release(): Promise<void> } | null> {
  const end = Date.now() + WAIT_MS;
  for (;;) {
    const acquired = await runtimeLock.acquire(dir);
    if (acquired !== null) return acquired;
    if (Date.now() >= end || !live()) return null;
    await sleep(RETRY_MS);
  }
}

async function withLedgerLocked<T>(
  dir: string,
  fn: LedgerOperation<T>,
  { live = () => true, lock: runtimeLock, skip }: LedgerOptions,
): Promise<T | null> {
  // A read before the lock lets the handler skip events that match no rule, which is most shell
  // events. Only an intact ledger can prove that: a corrupt one is repaired under the lock.
  if (skip !== undefined) {
    const peek = readLedgerState(dir);
    if (!peek.corrupt && skip(peek.ledger, peek.corrupt)) return null;
  }
  // In a worker the lock is the supervisor's: it survives this call only while the generation does,
  // and `retire()` releases it. A busy supervisor lock is retried like the local file lock, for the
  // same wait or until the caller is no longer live, so a sibling call cannot silently drop a gate.
  // In process the local file lock records the host pid and retries on its own.
  const runtime = runtimeLock ? await acquireRuntimeLock(runtimeLock, dir, live) : null;
  const lock = runtimeLock ? null : await acquireLedgerLock(dir);
  try {
    const owned = runtimeLock ? runtime !== null : (lock?.owned() ?? false);
    const { ledger, corrupt } = readLedgerState(dir);
    const result = fn(ledger, owned);
    if (result === null) return null;
    if (!owned) return result.value;
    if (result.ledger === ledger && !corrupt) return result.value;
    // The last read before the write, then ownership and liveness at that same point: a dispatch
    // whose lock a takeover replaced, or whose call has expired, records nothing and fails open.
    const generation = Math.max(result.ledger.generation, effectiveGeneration(dir));
    const next = { version: 1, generation, entries: result.ledger.entries, reported: result.ledger.reported };
    if (!live()) return null;
    if (runtimeLock ? runtime === null : lock === null || !lock.owned()) return null;
    writeJsonAtomic(join(dir, LEDGER_FILE), next);
    return result.value;
  } finally {
    if (runtime) {
      try {
        await runtime.release();
      } catch {}
    } else {
      lock?.release();
    }
  }
}

/**
 * Run fn on the context's ledger under its lock, and write the ledger fn returns.
 *
 * Callers in one process are serialized per state directory before the lock is tried. A worker
 * passes its supervisor-owned `lock`; in process the local file lock is used. Without either lock fn
 * still runs, with `locked: false`, and nothing is written. A broken ledger file is replaced by the
 * next locked, live write, even when the event records nothing. The payload is built before the final
 * read; the write then happens only while this dispatch still owns the lock and `live()` holds.
 * Otherwise nothing is written and the call fails open. Read, match and write failures reject, so the
 * runtime shows its manual notice and the host's call still passes.
 */
export function withLedger<T>(dir: string, fn: LedgerOperation<T>, options: LedgerOptions = {}): Promise<T | null> {
  return withProcessLock(dir, () => withLedgerLocked(dir, fn, options));
}

/**
 * Append one compaction to the log. The log is append-only, so a completed compaction can never be
 * rolled back by a dispatch holding a stale ledger, and each appended line raises the effective
 * generation that makes earlier entries not live. The timestamp written is sampled before the final
 * check and reused, so no time-dependent payload is read after the deadline has passed; the check is
 * the last thing before the append. It appends without the ledger queue or lock, so a compaction never
 * waits behind a ledger operation: O_APPEND gives it its own atomic line.
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
