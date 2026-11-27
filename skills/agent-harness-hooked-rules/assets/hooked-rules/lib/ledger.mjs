// Generated from src/hooked-rules/lib/ledger.mts by scripts/build.mts. Do not edit.
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
import { writeJsonAtomic } from './state.mjs';

export const LEDGER_FILE = 'ledger.json';
export const LOCK_FILE = 'ledger.lock';
export const COMPACTIONS_FILE = 'compactions.log';
const OWNER_FILE = 'owner';
const WAIT_MS = 1000; // how long to wait for the lock
const RETRY_MS = 20; // the retry interval

/** A test seam: awaited after a dead owner was seen and before the lock is renamed away. */

// fn returns the next ledger and the value to hand back. It returns null to write nothing; returning
// the ledger it was given also writes nothing.

const emptyLedger = () => ({ version: 1, generation: 0, entries: {}, reported: [] });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let tokenCounter = 0;
const newToken = () => `${process.pid}-${Date.now()}-${tokenCounter++}-${Math.random().toString(36).slice(2)}`;

const ownerPath = (lock) => join(lock, OWNER_FILE);

// The lock's owner file, or null when it is gone, unreadable or not a lock directory.
function readOwner(lock) {
  let value;
  try {
    value = JSON.parse(readFileSync(ownerPath(lock), 'utf8'));
  } catch (error) {
    const code = error.code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || error instanceof SyntaxError) return null;
    throw error;
  }
  return value !== null && typeof value === 'object' ? value : null;
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

// A lock is stale only when its recorded owner is dead. A lock directory without an owner is a crash
// between mkdir and the token write, and a path that is not a directory is not a lock this version
// wrote; both are taken over as dead. A live pid keeps the lock, however old it is.
function isDeadOwner(path) {
  let stats;
  try {
    stats = statSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
  if (!stats.isDirectory()) return true;
  const owner = readOwner(path);
  return owner === null || !pidAlive(owner.pid);
}

// Create the lock directory and write its owner token. A failure after the create removes only the
// still-ownerless directory this create made, so a rejected acquisition never leaves a lock behind.
function create(path, token) {
  try {
    mkdirSync(path);
  } catch (error) {
    if (error.code === 'EEXIST') return false;
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
function takeOver(path) {
  const stale = `${path}.${newToken()}`;
  try {
    renameSync(path, stale);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  rmSync(stale, { recursive: true, force: true });
}

/**
 * The context's ledger lock, or null after the wait. A dead holder's lock is renamed away and
 * re-created; a live holder keeps it and the call fails open once the wait expires.
 */
export async function acquireLedgerLock(dir, hooks = {}) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, LOCK_FILE);
  const end = Date.now() + WAIT_MS;
  for (;;) {
    const token = newToken();
    if (create(path, token)) {
      const lock = {
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

function readEntry(value) {
  if (typeof value !== 'object' || value === null) return null;
  const item = value;
  const strings = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');
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
function parseLedger(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const raw = value;
  if (raw.version !== 1) return null;
  const generation = raw.generation;
  if (typeof generation !== 'number' || !Number.isInteger(generation) || generation < 0) return null;
  const entries = {};
  if (typeof raw.entries === 'object' && raw.entries !== null && !Array.isArray(raw.entries)) {
    for (const [name, item] of Object.entries(raw.entries)) {
      const entry = readEntry(item);
      if (entry !== null) entries[name] = entry; // an unreadable entry is dropped, which delivers again
    }
  }
  const reported = Array.isArray(raw.reported) ? raw.reported.filter((key) => typeof key === 'string') : [];
  return { version: 1, generation, entries, reported };
}

// The effective generation: the number of compactions logged. Only ever grows, and a late writer
// cannot lower it.
function effectiveGeneration(dir) {
  let text;
  try {
    text = readFileSync(join(dir, COMPACTIONS_FILE), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
  return text.split('\n').filter((line) => line.trim() !== '').length;
}

// A missing file is a fresh ledger; a broken one is a fresh ledger that the next locked, live write
// replaces. The stored generation is ignored: the effective generation comes from the log. Any other
// read failure is an operational failure and is surfaced, not hidden.
function readLedgerState(dir) {
  const generation = effectiveGeneration(dir);
  let text;
  try {
    text = readFileSync(join(dir, LEDGER_FILE), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { ledger: { ...emptyLedger(), generation }, corrupt: false };
    throw error;
  }
  const stored = parseLedger(text);
  if (stored === null) return { ledger: { ...emptyLedger(), generation }, corrupt: true };
  return { ledger: { ...stored, generation }, corrupt: false };
}

/** The ledger at dir's ledger.json at the effective generation; a missing or broken file is a fresh ledger. */
export function readLedger(dir) {
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
export async function withLedger(dir, fn, { live = () => true } = {}) {
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
export async function bump(dir, { signal, deadline } = {}) {
  if (signal?.aborted || (deadline !== undefined && Date.now() >= deadline)) return;
  mkdirSync(dir, { recursive: true });
  if (signal?.aborted || (deadline !== undefined && Date.now() >= deadline)) return;
  appendFileSync(join(dir, COMPACTIONS_FILE), `${Date.now()}\n`);
}
