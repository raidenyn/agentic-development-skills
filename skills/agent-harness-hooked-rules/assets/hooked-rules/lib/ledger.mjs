// Generated from src/hooked-rules/lib/ledger.mts by scripts/build.mts. Do not edit.
// The per-context delivery ledger (design D5): one JSON file per agent context and an exclusive
// lock built on file creation. Losing the lock leans towards an extra delivery, never towards a
// block: a moment still returns its context and a gate passes.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomic } from './state.mjs';

export const LEDGER_FILE = 'ledger.json';
export const LOCK_FILE = 'ledger.lock';
const WAIT_MS = 1000; // how long to retry the exclusive create
const RETRY_MS = 20; // the retry interval
const STALE_MS = 10000; // an older lock is taken over

// fn returns the next ledger and the value to hand back. It returns null to write nothing; returning
// the ledger it was given also writes nothing (and bump writes on its own).

const emptyLedger = () => ({ version: 1, generation: 0, entries: {}, reported: [] });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/** The ledger at dir's ledger.json; a missing or broken file is a fresh ledger. */
export function readLedger(dir) {
  let value;
  try {
    value = JSON.parse(readFileSync(join(dir, LEDGER_FILE), 'utf8'));
  } catch {
    return emptyLedger();
  }
  if (typeof value !== 'object' || value === null) return emptyLedger();
  const raw = value;
  if (raw.version !== 1) return emptyLedger();
  const generation = raw.generation;
  if (typeof generation !== 'number' || !Number.isInteger(generation) || generation < 0) return emptyLedger();
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

function lockPath(dir) {
  return join(dir, LOCK_FILE);
}

// Create the lock exclusively; false when another dispatch holds it.
function create(path) {
  try {
    writeFileSync(path, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx' });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

// Take a lock older than STALE_MS over atomically: rename it to a unique name, unlink that, and let
// the caller retry the create. A rename that fails with ENOENT lost the race and retries too.
function takeOver(path) {
  let age;
  try {
    age = Date.now() - statSync(path).mtimeMs;
  } catch (error) {
    return error.code === 'ENOENT'; // gone: retry the create
  }
  if (age <= STALE_MS) return false;
  const stale = `${path}.${process.pid}.${randomUUID()}`;
  try {
    renameSync(path, stale);
  } catch (error) {
    return error.code === 'ENOENT';
  }
  try {
    unlinkSync(stale);
  } catch {}
  return true;
}

async function acquire(dir) {
  mkdirSync(dir, { recursive: true });
  const path = lockPath(dir);
  const end = Date.now() + WAIT_MS;
  for (;;) {
    if (create(path)) return true;
    if (Date.now() >= end) return false;
    if (!takeOver(path)) await sleep(RETRY_MS);
  }
}

function release(dir) {
  try {
    unlinkSync(lockPath(dir));
  } catch {}
}

/**
 * Run fn on the context's ledger under its lock, and write the ledger fn returns.
 *
 * Without the lock fn still runs, with `locked: false`, and nothing is written. A failing read,
 * match or write returns null, so a broken state can never block or deny the host's call.
 */
export async function withLedger(dir, fn) {
  let locked = false;
  try {
    locked = await acquire(dir);
  } catch {
    locked = false;
  }
  try {
    const ledger = readLedger(dir);
    const result = fn(ledger, locked);
    if (result === null) return null;
    if (!locked || result.ledger === ledger) return result.value;
    writeJsonAtomic(join(dir, LEDGER_FILE), result.ledger);
    return result.value;
  } catch {
    return null;
  } finally {
    if (locked) release(dir);
  }
}

/** Bump the context's generation. Written even without the lock: a lost write only delivers again. */
export async function bump(dir) {
  let locked = false;
  try {
    locked = await acquire(dir);
  } catch {
    locked = false;
  }
  try {
    const ledger = readLedger(dir);
    writeJsonAtomic(join(dir, LEDGER_FILE), { ...ledger, generation: ledger.generation + 1 });
  } catch {
    // fail open: a lost bump only delivers again
  } finally {
    if (locked) release(dir);
  }
}
