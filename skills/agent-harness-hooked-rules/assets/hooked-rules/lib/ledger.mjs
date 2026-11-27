// Generated from src/hooked-rules/lib/ledger.mts by scripts/build.mts. Do not edit.
// The per-context delivery ledger (design D5): one JSON file per agent context and one lock
// directory, `ledger.lock`, created with mkdir(2), which is atomic. A takeover renames a lock older
// than the takeover age to a unique name and removes that; only one rename can win, and a rename
// that fails with ENOENT means another contender took it, so the create is retried. Every write
// re-reads the lock's owner token immediately before it, and a release removes only a lock it still
// owns, so a dispatch whose lock was taken over writes nothing.
//
// A compaction publishes an invalidation marker (ledger.invalidated) atomically. A ledger written
// with a decision time at or before the marker's invalidates every entry of the decision, whatever
// order the two writes land in, so a stale holder cannot revive an entry a compaction voided.
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomic } from './state.mjs';

export const LEDGER_FILE = 'ledger.json';
export const LOCK_FILE = 'ledger.lock';
export const INVALIDATED_FILE = 'ledger.invalidated';
const OWNER_FILE = 'owner';
const WAIT_MS = 1000; // how long to wait for the lock
const RETRY_MS = 20; // the retry interval
const STALE_MS = 10000; // a lock older than this is taken over

// fn returns the next ledger and the value to hand back. It returns null to write nothing; returning
// the ledger it was given also writes nothing (and bump writes on its own).

const emptyLedger = () => ({ version: 1, generation: 0, entries: {}, reported: [], decidedAt: 0 });

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

// Whether this dispatch still owns the lock: its token is the one in the owner file right now.
function owns(lock) {
  const owner = readOwner(lock.path);
  return owner !== null && owner.token === lock.token;
}

// Create the lock directory and write its owner token. A failure after the create removes the lock,
// so a rejected acquisition never leaves a directory later calls would wait on.
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
    // Remove the lock only when it is still the ownerless directory this create made; a takeover may
    // already have replaced it, and that lock is not ours to remove.
    if (readOwner(path) === null) rmSync(path, { recursive: true, force: true });
    throw error;
  }
  return true;
}

// The age of the lock at path, or null when it is gone. A path that is not a directory cannot be a
// lock this version created, so it is taken over at once.
function lockAge(path) {
  let stats;
  try {
    stats = statSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!stats.isDirectory()) return Number.POSITIVE_INFINITY;
  const owner = readOwner(path);
  const at = owner !== null && typeof owner.at === 'number' ? owner.at : stats.mtimeMs;
  return Date.now() - at;
}

// Rename the stale lock to a unique name and remove it; the rename is the atomic step, and it fails
// with ENOENT when another contender got there first.
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
 * The context's ledger lock, or null after the wait. A lock younger than the takeover age is waited
 * for; an older one is renamed away by exactly one contender and re-created by the next mkdir.
 */
export async function acquireLedgerLock(dir) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, LOCK_FILE);
  const end = Date.now() + WAIT_MS;
  for (;;) {
    const token = newToken();
    if (create(path, token)) {
      const lock = {
        path,
        token,
        release() {
          try {
            if (owns(lock)) rmSync(path, { recursive: true, force: true });
          } catch {}
        },
      };
      return lock;
    }
    if (Date.now() >= end) return null;
    const age = lockAge(path);
    if (age !== null && age <= STALE_MS) {
      await sleep(RETRY_MS);
      continue;
    }
    if (age !== null) takeOver(path);
    // Retry the create at once: a takeover released the path, and a fresh lock makes the next
    // create fail and fall into the wait above.
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
      if (entry !== null) entries[name] = entry;
    }
  }
  const reported = Array.isArray(raw.reported) ? raw.reported.filter((key) => typeof key === 'string') : [];
  const decidedAt = typeof raw.decidedAt === 'number' && Number.isFinite(raw.decidedAt) ? raw.decidedAt : 0;
  return { version: 1, generation, entries, reported, decidedAt };
}

// The latest compaction marker's time, or 0 when there is none.
function invalidatedAt(dir) {
  let value;
  try {
    value = JSON.parse(readFileSync(join(dir, INVALIDATED_FILE), 'utf8'));
  } catch (error) {
    const code = error.code;
    if (code === 'ENOENT' || error instanceof SyntaxError) return 0;
    throw error;
  }
  const at = value !== null && typeof value === 'object' ? value.at : undefined;
  return typeof at === 'number' && Number.isFinite(at) ? at : 0;
}

// A missing file is a fresh ledger; a broken one is a fresh ledger that the next locked write
// replaces. A decision time at or before the compaction marker is void: its entries are made not
// live by raising the in-memory generation above every recorded one. Any other read failure is an
// operational failure and is surfaced, not hidden.
function readLedgerState(dir) {
  let text;
  try {
    text = readFileSync(join(dir, LEDGER_FILE), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { ledger: emptyLedger(), corrupt: false };
    throw error;
  }
  const stored = parseLedger(text);
  const ledger = stored ?? emptyLedger();
  const invalidated = invalidatedAt(dir);
  if (invalidated > 0 && invalidated >= ledger.decidedAt)
    return { ledger: { ...ledger, generation: ledger.generation + 1 }, corrupt: stored === null };
  return { ledger, corrupt: stored === null };
}

/** The ledger at dir's ledger.json, honoring the compaction marker; a missing or broken file is a fresh ledger. */
export function readLedger(dir) {
  return readLedgerState(dir).ledger;
}

/**
 * Run fn on the context's ledger under its lock, and write the ledger fn returns.
 *
 * Without the lock fn still runs, with `locked: false`, and nothing is written. A broken ledger file
 * is replaced by the next locked, live write, even when the event records nothing. The generation
 * written is at least the one on disk, so a compaction that won no lock is not rolled back by a
 * dispatch holding a stale copy. Read, match and write failures reject, so the runtime shows its
 * manual notice and the host's call still passes.
 */
export async function withLedger(dir, fn) {
  const lock = await acquireLedgerLock(dir);
  try {
    const owned = lock !== null && owns(lock);
    const decidedAt = Date.now();
    const { ledger, corrupt } = readLedgerState(dir);
    const result = fn(ledger, owned);
    if (result === null) return null;
    if (!owned) return result.value;
    if (result.ledger === ledger && !corrupt) return result.value;
    // The decision is recorded only while this dispatch still owns the lock; losing it fails open.
    if (lock === null || !owns(lock)) return null;
    const generation = Math.max(result.ledger.generation, readLedgerState(dir).ledger.generation);
    writeJsonAtomic(join(dir, LEDGER_FILE), { ...result.ledger, generation, decidedAt });
    return result.value;
  } finally {
    lock?.release();
  }
}

/**
 * Bump the context's generation and publish the invalidation marker.
 *
 * The marker is always written, with or without the lock, and is the durable invalidation: a stale
 * holder's later ledger write carries an earlier decision time and stays void. A bump that wins the
 * lock also increments the ledger generation. A call that was aborted or past its deadline right
 * before the write records nothing.
 */
export async function bump(dir, { signal, deadline } = {}) {
  const lock = await acquireLedgerLock(dir);
  try {
    if (lock !== null && owns(lock)) {
      const { ledger } = readLedgerState(dir);
      const at = Date.now();
      if (signal?.aborted || (deadline !== undefined && Date.now() >= deadline)) return;
      writeJsonAtomic(join(dir, INVALIDATED_FILE), { at });
      writeJsonAtomic(join(dir, LEDGER_FILE), { ...ledger, generation: ledger.generation + 1, decidedAt: at });
      return;
    }
    const at = Date.now();
    if (signal?.aborted || (deadline !== undefined && Date.now() >= deadline)) return;
    writeJsonAtomic(join(dir, INVALIDATED_FILE), { at });
  } finally {
    lock?.release();
  }
}
