// Type-only declarations of the per-context ledger (design D5): the local file lock, its test
// seams, the runtime lock the supervisor owns, and the operation `withLedger` runs.
import type { Ledger } from './deliver.types.mts';

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

/**
 * The lock a hook worker receives as `context.lock`. The supervisor tracks each handle per worker
 * generation and releases it when that generation retires, so a terminated worker cannot leave the
 * ledger locked to a host pid that never dies.
 */
export interface LedgerRuntimeLock {
  acquire(dir: string): Promise<{ release(): Promise<void> } | null>;
}

export interface LedgerOptions {
  /** Checked right before a write, after the final read; false writes nothing. */
  live?: () => boolean;
  /** The worker's supervisor-owned lock; absent in process, where the local file lock is used. */
  lock?: LedgerRuntimeLock | null;
  /**
   * Read the ledger unlocked first: true skips the lock and writes nothing. Only the reader can prove
   * that skipping is safe, so it must be false whenever the ledger is corrupt or the event would
   * record something. The handler uses it to keep events that match no rule off the lock.
   */
  skip?: (ledger: Ledger, corrupt: boolean) => boolean;
}

// fn returns the next ledger and the value to hand back. It returns null to write nothing; returning
// the ledger it was given also writes nothing.
export type LedgerOperation<T> = (ledger: Ledger, locked: boolean) => { ledger: Ledger; value: T } | null;

export interface Owner {
  token?: unknown;
  pid?: unknown;
  at?: unknown;
}

export type LockState = { kind: 'absent' } | { kind: 'dead'; token: string | null } | { kind: 'live' };

export type TakeOver = 'retry' | 'give-up';
