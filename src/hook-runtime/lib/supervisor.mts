// The supervisor (design D3): each handler runs in worker_threads Workers (a pool of up to 4 per
// handler). The supervisor owns everything that outlives JavaScript: it spawns processes in their own
// groups and holds gate locks on a worker's behalf, and when a worker generation ends it kills that
// generation's groups (SIGTERM, then SIGKILL, until empty) and only then releases its locks.
import { spawn as spawnChild, spawnSync } from 'node:child_process';
import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { basename, delimiter, isAbsolute, join } from 'node:path';
import type { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { Worker } from 'node:worker_threads';
import { acquireGateLock, staleGroups, writeJsonAtomic } from './state.mts';
import type { GateLockHandle } from './state.mts';
import type { EventPayload, Handler, HandlerContext } from './handler.types.mts';

type Msg = Record<string, any>;
type Ctx = Partial<HandlerContext> & Record<string, any>;
interface Pending {
  requestId: number | string;
  kind: string;
  ctx: Ctx | null;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}
interface HeldLock {
  handle: GateLockHandle;
  requestId: number | string;
  pgids: number[];
}
interface WorkerMeta {
  name: string;
  events: Handler['events'];
  timeouts?: Handler['timeouts'];
  manual?: string;
  proofs: string[];
}
export interface WorkerHandler extends Handler {
  tool: string;
  close(opts?: { cleanupDeadline?: number }): Promise<void>;
  workerGens(): number[];
}

const ENTRY = fileURLToPath(new URL('./worker-entry.mjs', import.meta.url));
export const POOL_SIZE = 4;
export const KILL_AFTER_MS = 5000;
export const REAP_MAX_AGE_MS = 86_400_000;
const POLL_MS = 25;
const CONFIRM_MS = 5000;

// The barrier (design D1): the child's shell starts with an empty environment and waits on fd 3, so
// nothing the caller passes can run before the supervisor records the pgid in every held gate lock.
// After `go` it reads quoted `export` lines from stdin and restores the whole environment, then
// `exec` replaces the shell with the command itself: loader variables apply to the command only and
// a name containing `=` runs through the shell's normal search. EOF, or anything but `go`, exits
// 125 without running anything.
export const SPAWN_BARRIER =
  'IFS= read -r _agent_harness_go <&3 || exit 125\ncase $_agent_harness_go in go) ;; *) exit 125 ;; esac\neval "$(/bin/cat)"\nexec 3>&- "$@"\n';
const DEFAULT_PATH = '/bin:/usr/bin';
let defaultPath: string | undefined;

// The default PATH of the C library (design D2): when the caller's environment has no PATH, that is
// where the shell's own `exec` search lands, so the preflight must search the same places. Queried
// once and trimmed, because `getconf` ends its answer with a newline; the fallback only covers a
// host where `getconf` cannot answer.
function libraryPath(): string {
  if (defaultPath === undefined) {
    const out = spawnSync('/usr/bin/getconf', ['PATH'], { encoding: 'utf8', env: process.env, timeout: 2000 });
    const text = String(out.stdout ?? '').trim();
    defaultPath = out.status === 0 && text !== '' ? text : DEFAULT_PATH;
  }
  return defaultPath;
}

// bash treats the first eight as readonly, so exporting them again fails, and a failed assignment in
// POSIX mode ends the shell; `EXECIGNORE` changes how bash searches PATH. The command recomputes its
// own values for all of them (design D1).
const RESTORE_SKIP = new Set([
  'UID',
  'EUID',
  'PPID',
  'GROUPS',
  'BASHOPTS',
  'SHELLOPTS',
  'BASH_VERSINFO',
  'BASH_VERSION',
  'EXECIGNORE',
]);
const POSIX_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const shellQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

// The barrier's stdin script (design D1): the shell starts empty, so every caller environment entry
// is exported again after `go`. Names that are not shell identifiers cannot be exported by `sh`
// (that includes `BASH_FUNC_*`), and the `RESTORE_SKIP` names would abort or mislead bash. When the
// caller has no PATH, the C library default is exported so lookup and execution agree with a direct
// spawn. A NUL in a value is rejected here, as a direct spawn rejects it.
function restoreEnv(env: Record<string, unknown>): string {
  const lines: string[] = [];
  let hasPath = false;
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (typeof value === 'string' && value.includes('\0')) {
      throw new Error("The argument 'env' must be a string without null bytes");
    }
    if (name === 'PATH') hasPath = true;
    if (RESTORE_SKIP.has(name) || !POSIX_NAME.test(name)) continue;
    lines.push(`export ${name}=${shellQuote(typeof value === 'string' ? value : String(value))}`);
  }
  if (!hasPath) lines.push(`export PATH=${shellQuote(libraryPath())}`);
  return lines.length ? `${lines.join('\n')}\n` : '';
}

// Resolve the command the way execvp would (design D2): `onSpawn` runs this before it spawns, so a
// command that would fail gets a `spawn <file> ENOENT|EACCES` error naming what the handler asked
// for. Resolution only decides the error; the barrier still execs `argv[0]` itself.
export function resolveCommand(
  file: string,
  cwd: string | undefined,
  env: Record<string, string | undefined>,
): { ok: true } | { ok: false; error: string } {
  if (typeof file !== 'string') {
    return { ok: false, error: `The argument 'file' must be of type string. Received ${inspect(file)}` };
  }
  if (!file) return { ok: false, error: "The argument 'file' cannot be empty. Received ''" };
  if (file.includes('\0')) {
    return { ok: false, error: `The argument 'file' must be a string without null bytes. Received ${inspect(file)}` };
  }
  // Any other non-string cwd is left to spawnChild to reject, as it did before the barrier.
  const cwdValue: unknown = cwd;
  if (cwdValue != null && typeof cwdValue !== 'string') return { ok: true };
  if (file.startsWith('-')) return { ok: false, error: `spawn ${file} ENOENT` };
  // The raw cwd, not `resolve(cwd)`: the filesystem follows symlinks before `..`, as a direct spawn
  // does, while `resolve()` would collapse `..` lexically and miss a cwd such as `link/..`.
  const base = typeof cwdValue === 'string' ? cwdValue : process.cwd();
  // Keep `entry` and `file` verbatim after the raw base: the filesystem resolves symlinks before
  // `..`, as a direct spawn does. An absolute entry and an absolute file are probed as they are.
  let candidates: string[];
  if (isAbsolute(file)) {
    candidates = [file];
  } else if (file.includes('/')) {
    candidates = [`${base}/${file}`];
  } else {
    candidates = (env.PATH ?? libraryPath())
      .split(delimiter)
      .map((entry) => (isAbsolute(entry) ? `${entry}/${file}` : `${base}/${entry}/${file}`));
  }
  let eacces = false;
  for (const candidate of candidates) {
    let stats: ReturnType<typeof statSync>;
    try {
      stats = statSync(candidate);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EACCES') eacces = true;
      continue;
    }
    if (!stats.isFile()) {
      eacces = true;
      continue;
    }
    try {
      accessSync(candidate, constants.X_OK);
      return { ok: true };
    } catch {
      eacces = true;
    }
  }
  return { ok: false, error: `spawn ${file} ${eacces ? 'EACCES' : 'ENOENT'}` };
}

let genCounter = 0;
let idCounter = 0;
const generations = new Map<number, WorkerRecord>();

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Record a group in a lock the supervisor holds (design D3). The record must still be ours: a lock
// file that cannot be read is an error, because replacing it with `{ pgids }` would drop `pid` and
// `at` and the next supervisor could no longer reap the holder's groups. Kept local because
// `state.mts` is shared with hooked-rules and verify-gate.
function recordGatePgids(handle: { path: string }, pgids: number[]): void {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(readFileSync(handle.path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not a lock record');
    body = parsed as Record<string, unknown>;
  } catch (err) {
    throw new Error(`could not read the gate lock (${errText(err)})`);
  }
  if (body.pid !== process.pid || typeof body.at !== 'number' || body.released === true) {
    throw new Error('the gate lock is not ours');
  }
  writeJsonAtomic(handle.path, { ...body, pgids });
}

export function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function signalGroup(pgid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(-pgid, sig);
  } catch {}
}

// SIGTERM, then SIGKILL after min(5 s, cleanupDeadline - now - 1 s); resolves once every group is
// empty, independent of the leaders' exits. With confirmUntil the wait ends at that time and
// SIGKILL is always sent before returning, because the caller cannot wait for the confirmation
// window (the reap at lock acquisition).
export async function killGroups(
  pgids: number[],
  { cleanupDeadline, confirmUntil }: { cleanupDeadline?: number; confirmUntil?: number } = {},
): Promise<void> {
  let live = pgids.filter(groupAlive);
  if (!live.length) return;
  for (const p of live) signalGroup(p, 'SIGTERM');
  const room = Number.isFinite(cleanupDeadline) ? cleanupDeadline! - Date.now() - 1000 : KILL_AFTER_MS;
  const killAt = Date.now() + Math.max(0, Math.min(KILL_AFTER_MS, room));
  const confirm = Number.isFinite(confirmUntil) ? confirmUntil! : undefined;
  const end = confirm ?? killAt + CONFIRM_MS;
  let killed = false;
  while (live.length && Date.now() < end) {
    await sleep(POLL_MS);
    if (!killed && Date.now() >= killAt) {
      for (const p of live) signalGroup(p, 'SIGKILL');
      killed = true;
    }
    live = live.filter(groupAlive);
  }
  if (confirm !== undefined && !killed) {
    live = live.filter(groupAlive);
    for (const p of live) signalGroup(p, 'SIGKILL');
  }
}

// Resolves with the promise, or rejects once `signal` aborts. Checks `aborted` before listening,
// because a listener added to an already aborted signal never fires.
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined, message: string): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error(message));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error(message));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

function contextData(ctx: Ctx): Record<string, unknown> {
  const { repoRoot, host, sessionId, agentId, deadline, stateDir, config } = ctx;
  return { repoRoot, host, sessionId, agentId, deadline, stateDir, config };
}

class WorkerRecord {
  declare pool: HandlerPool;
  declare gen: number;
  declare loaded: boolean;
  declare dead: boolean;
  declare busy: number | 'reserved' | null;
  declare pending: Map<string, Pending>;
  declare groups: Map<number, number | string>;
  declare locks: Map<number, HeldLock>;
  declare children: Map<unknown, number>;
  declare worker: Worker;
  declare ready: Promise<WorkerMeta>;
  declare onLoad: ((err: Error | null, meta?: WorkerMeta) => void) | null;
  declare retiring: Promise<void> | undefined;

  constructor(pool: HandlerPool, budgetMs: number) {
    this.pool = pool;
    this.gen = ++genCounter;
    this.loaded = false;
    this.dead = false;
    this.busy = null; // requestId of the running event, 'reserved', or null
    this.pending = new Map(); // key -> {requestId, kind, ctx, resolve, reject}
    this.groups = new Map(); // pgid -> requestId
    this.locks = new Map(); // lockId -> {handle, requestId, pgids}
    this.children = new Map(); // callId -> pgid
    generations.set(this.gen, this);
    this.worker = new Worker(ENTRY, {
      workerData: { handlerPath: join(pool.toolDir, 'handler.mjs'), workerGen: this.gen },
      stdout: true,
      stderr: true,
    });
    // Handler output must never reach the host's stdout (Claude Code reads hook JSON there).
    const toStderr = (d: Buffer) => {
      try {
        process.stderr.write(d);
      } catch {}
    };
    this.worker.stdout.on('data', toStderr);
    this.worker.stderr.on('data', toStderr);
    this.ready = new Promise<WorkerMeta>((resolve, reject) => {
      const t = setTimeout(
        () => {
          reject(new Error(`still loading after ${budgetMs} ms`));
          this.retire('load timeout');
        },
        Math.max(0, budgetMs),
      );
      this.onLoad = (err, meta) => {
        clearTimeout(t);
        this.onLoad = null;
        if (err) {
          reject(err);
          this.retire('load failed');
        } else {
          this.loaded = true;
          resolve(meta as WorkerMeta);
        }
      };
    });
    this.ready.catch(() => {});
    this.worker.on('message', (msg: Msg) => this.onMessage(msg));
    this.worker.on('error', (err: Error) => this.crash(err));
    this.worker.on('exit', (code: number) => this.crash(new Error(`worker exited (code ${code})`)));
  }

  post(msg: Msg): void {
    if (this.dead) return;
    try {
      this.worker.postMessage({ workerGen: this.gen, ...msg });
    } catch {}
  }

  refresh(): void {
    if (this.dead) return;
    if (this.pending.size || this.busy !== null || !this.loaded) this.worker.ref();
    else this.worker.unref();
  }

  isActive(requestId: unknown): boolean {
    if (this.dead) return false;
    for (const p of this.pending.values()) if (p.requestId === requestId) return true;
    return false;
  }

  request(kind: string, requestId: number | string, ctx: Ctx | null, msg: Msg): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pending.set(`${kind}:${requestId}`, { requestId, kind, ctx, resolve, reject });
      this.refresh();
      if (this.dead) return;
      try {
        this.worker.postMessage({ workerGen: this.gen, ...msg, requestId });
      } catch (err) {
        this.pending.delete(`${kind}:${requestId}`);
        this.refresh();
        reject(new Error(`could not be sent to the worker (${errText(err)})`));
      }
    });
  }

  finish(kind: string, requestId: unknown): Pending | undefined {
    const key = `${kind}:${requestId}`;
    const p = this.pending.get(key);
    this.pending.delete(key);
    const owns =
      [...this.locks.values()].some((l) => l.requestId === requestId) ||
      [...this.groups.values()].includes(requestId as number | string);
    if (!this.isActive(requestId) && owns) {
      this.cleanup({ requestId }).catch(() => {});
    }
    return p;
  }

  onMessage(msg: Msg): unknown {
    if (!msg || msg.workerGen !== this.gen || this.dead) return; // foreign or late
    const { type, requestId, callId } = msg;
    switch (type) {
      case 'loaded':
        return this.onLoad?.(null, msg.meta);
      case 'load-error':
        return this.onLoad?.(new Error(msg.error));
      case 'result': {
        if (this.busy !== requestId) return;
        const p = this.finish('event', requestId);
        this.busy = null;
        this.refresh();
        this.pool.wake();
        if (!p) return;
        if (!msg.ok) return p.reject(new Error(msg.error));
        const result = msg.result;
        if (result && typeof result === 'object') {
          if (msg.hasAck) result.ack = () => this.blockCallback('ack', requestId);
          if (msg.hasRelease) result.release = () => this.blockCallback('release', requestId);
        }
        return p.resolve(result);
      }
      case 'proof.result':
      case 'acked':
      case 'released': {
        const kind = type === 'proof.result' ? 'proof' : type === 'acked' ? 'ack' : 'release';
        const p = this.finish(kind, requestId);
        this.refresh();
        if (!p) return;
        return msg.ok ? p.resolve(msg.value ?? null) : p.reject(new Error(msg.error));
      }
      case 'trace': {
        const p = this.pending.get(`event:${requestId}`);
        if (p && this.busy === requestId) p.ctx!.trace?.(msg.outcome);
        return;
      }
      case 'proof.request':
        return this.onProofRequest(msg);
      case 'spawn':
        return this.onSpawn(msg);
      case 'spawn.kill': {
        const pgid = this.children.get(callId);
        if (pgid) killGroups([pgid]).catch(() => {});
        return;
      }
      case 'lock.acquire':
        return this.onLockAcquire(msg);
      case 'lock.release':
        return this.onLockRelease(msg);
      default:
    }
  }

  onProofRequest({ requestId, callId, name }: Msg): unknown {
    const reply = (value: unknown) => this.post({ type: 'proof.response', requestId, callId, value });
    const p = [...this.pending.values()].find((x) => x.requestId === requestId && x.ctx?.proof);
    if (!p) return reply(`proof ${name} was requested after its event ended`);
    Promise.resolve()
      .then(() => p.ctx!.proof!(name))
      .then(
        (v) => reply(v ?? null),
        (err) => reply(`proof ${name} failed: ${errText(err)}`),
      );
  }

  onSpawn({ requestId, callId, argv, cwd, env, timeoutMs }: Msg): unknown {
    const reply = (m: Msg) => this.post({ type: 'spawn.exit', requestId, callId, ...m });
    if (!this.isActive(requestId)) return reply({ error: 'the event has ended' });
    const spawnEnv = { ...process.env, ...env };
    let child: ReturnType<typeof spawnChild>;
    try {
      const resolved = resolveCommand(argv[0], cwd, spawnEnv);
      if (!resolved.ok) return reply({ error: resolved.error });
      // The barrier `sh` starts empty (design D1), so nothing the caller passes can run before `go`;
      // the quoted exports on its stdin restore the whole environment after the release, and `exec`
      // then replaces the shell with the command itself.
      const restore = restoreEnv(spawnEnv);
      // The barrier `sh` waits on fd 3 before it execs the command: the pgid recorded below is the
      // command's own, and the command cannot run before it is in every held lock.
      child = spawnChild('/bin/sh', ['-p', '-c', SPAWN_BARRIER, 'agent-harness-spawn', ...argv], {
        cwd,
        env: {},
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
      });
      // A failed spawn is reported here; otherwise the barrier `eval`s these exports after `go`.
      child.stdin?.on('error', () => {});
      child.stdin?.end(restore);
    } catch (err) {
      return reply({ error: errText(err) });
    }
    const pgid = child.pid;
    let timedOut = false;
    let timeout: NodeJS.Timeout | undefined;
    let recordError: string | undefined;
    let done = false;
    const end = (m: Msg) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      this.children.delete(callId);
      if (pgid && !groupAlive(pgid)) this.groups.delete(pgid);
      reply(m);
    };
    // Under descriptor pressure a spawn can return a child without stdio and a pending EMFILE error,
    // so the listeners go on before anything touches a stream, and every access stays guarded. The
    // barrier may also exit before the release is written, so the release stream swallows its error
    // rather than crash the supervisor.
    const gate = child.stdio?.[3] as Writable | undefined;
    gate?.on('error', () => {});
    child.stdout?.on('data', (chunk: Buffer) =>
      this.post({ type: 'spawn.data', requestId, callId, stream: 'stdout', chunk: new Uint8Array(chunk) }),
    );
    child.stderr?.on('data', (chunk: Buffer) =>
      this.post({ type: 'spawn.data', requestId, callId, stream: 'stderr', chunk: new Uint8Array(chunk) }),
    );
    // Every error of this child names `/bin/sh`, so it is rewritten to name the command the handler
    // asked for (design D4). That is how an invalid cwd reaches the handler as before. A failed
    // record keeps its own error, because the command was never released.
    child.on('error', (err) => {
      if (recordError) return end({ error: recordError, pgid });
      const code = (err as NodeJS.ErrnoException).code;
      end({ error: code ? `spawn ${argv[0]} ${code}` : errText(err), pgid });
    });
    child.on('close', (code, signal) =>
      end(recordError ? { error: recordError, pgid } : { code, signal, pgid, timedOut }),
    );
    if (pgid) {
      this.groups.set(pgid, requestId);
      this.children.set(callId, pgid);
      for (const lock of this.locks.values()) {
        lock.pgids.push(pgid);
        try {
          recordGatePgids(lock.handle, lock.pgids);
        } catch (err) {
          // A group whose pgid is not in every held lock can outlive a SIGKILL of the holder
          // (design D3), so the command is never released: kill the barrier `sh` and reply from
          // `close`, once the group is gone.
          recordError = `could not record the process group: ${errText(err)}`;
          break;
        }
      }
      if (recordError) {
        signalGroup(pgid, 'SIGKILL');
        // A denied kill must not park the barrier: the closed release side reads as EOF, so the
        // barrier exits 125 without running the command.
        try {
          gate?.end();
        } catch {}
      } else {
        gate?.write('go\n');
        if (timeoutMs > 0) {
          timeout = setTimeout(() => {
            timedOut = true;
            killGroups([pgid]).catch(() => {});
          }, timeoutMs);
        }
      }
    }
  }

  // Reap the groups a dead holder recorded before taking the gate lock (design D3): SIGTERM, then
  // SIGKILL by this event's deadline. The reply is asynchronous, so an ended event is checked again
  // after the reap; every throw is replied, because onMessage does not catch this promise.
  async onLockAcquire({ requestId, callId, dir }: Msg): Promise<void> {
    const reply = (m: Msg) => this.post({ type: 'lock.response', requestId, callId, ...m });
    try {
      if (!this.isActive(requestId)) return reply({ error: 'the event has ended' });
      const stale = staleGroups(dir, { maxAgeMs: REAP_MAX_AGE_MS }).filter((pgid) => {
        try {
          process.kill(-pgid, 0);
          return true;
        } catch {
          return false; // gone (ESRCH) or not ours (EPERM)
        }
      });
      if (stale.length) {
        const holder = [...this.pending.values()].find((p) => p.requestId === requestId && p.ctx);
        const deadline = holder?.ctx?.deadline;
        const cleanupDeadline = Number.isFinite(deadline) ? (deadline as number) : Date.now() + 2000;
        await killGroups(stale, { cleanupDeadline, confirmUntil: cleanupDeadline });
        if (this.dead || !this.isActive(requestId)) return reply({ error: 'the event has ended' });
        if (stale.some(groupAlive)) return reply({ lockId: null });
      }
      let handle: GateLockHandle | null;
      try {
        handle = acquireGateLock(dir);
      } catch (err) {
        return reply({ error: errText(err) });
      }
      if (!handle) return reply({ lockId: null });
      const lockId = ++idCounter;
      this.locks.set(lockId, { handle, requestId, pgids: [] });
      return reply({ lockId });
    } catch (err) {
      return reply({ error: errText(err) });
    }
  }

  onLockRelease({ requestId, callId, lockId }: Msg): void {
    const lock = this.locks.get(lockId);
    this.locks.delete(lockId);
    let error: string | undefined;
    try {
      lock?.handle.release();
    } catch (err) {
      error = errText(err);
    }
    this.post({ type: 'lock.released', requestId, callId, error });
  }

  blockCallback(kind: string, requestId: number | string): Promise<boolean> {
    if (this.dead) return Promise.resolve(false);
    return this.request(kind, requestId, null, { type: kind }).then(
      () => true,
      () => false,
    );
  }

  // Kill the groups this generation started (optionally one request's), then release its locks.
  async cleanup({ requestId, cleanupDeadline }: { requestId?: unknown; cleanupDeadline?: number } = {}): Promise<void> {
    const mine = (r: unknown) => requestId === undefined || r === requestId;
    const pgids = [...this.groups].filter(([, r]) => mine(r)).map(([p]) => p);
    await killGroups(pgids, { cleanupDeadline });
    const survivors = new Set(pgids.filter(groupAlive));
    for (const p of pgids) if (!survivors.has(p)) this.groups.delete(p);
    for (const [id, lock] of this.locks) {
      if (!mine(lock.requestId)) continue;
      // A group that survived SIGKILL (a process stuck in the kernel) keeps its lock held: the lock
      // is never released before its groups are gone (design D3).
      if (lock.pgids.some((p) => survivors.has(p))) continue;
      this.locks.delete(id);
      try {
        lock.handle.release();
      } catch {}
    }
  }

  // End this generation: terminate, kill its groups, release its locks, fail what is pending.
  retire(reason: string, { cleanupDeadline }: { cleanupDeadline?: number } = {}): Promise<void> {
    if (this.retiring) return this.retiring;
    this.dead = true;
    this.pool.remove(this);
    this.retiring = (async () => {
      try {
        await this.worker.terminate();
      } catch {}
      await this.cleanup({ cleanupDeadline });
      generations.delete(this.gen);
      for (const p of this.pending.values()) p.reject(new Error(`worker ended: ${reason}`));
      this.pending.clear();
      this.onLoad?.(new Error(`worker ended: ${reason}`));
      this.pool.wake();
    })();
    return this.retiring;
  }

  crash(err: unknown): void {
    if (!this.dead) this.retire(errText(err)).then(() => this.pool.replenish());
  }
}

export function terminateWorker(gen: number, opts?: { cleanupDeadline?: number }): Promise<void> {
  const rec = generations.get(gen);
  return rec ? rec.retire('terminated', opts) : Promise.resolve();
}

class HandlerPool {
  declare toolDir: string;
  declare tool: string;
  declare loadBudgetMs: number;
  declare workers: WorkerRecord[];
  declare waiters: (() => void)[];
  declare closed: boolean;

  constructor(toolDir: string, tool: string, loadBudgetMs: number) {
    this.toolDir = toolDir;
    this.tool = tool;
    this.loadBudgetMs = loadBudgetMs;
    this.workers = [];
    this.waiters = [];
    this.closed = false;
  }

  spawnWorker(budgetMs: number = this.loadBudgetMs): WorkerRecord {
    const rec = new WorkerRecord(this, budgetMs);
    this.workers.push(rec);
    return rec;
  }

  remove(rec: WorkerRecord): void {
    this.workers = this.workers.filter((w) => w !== rec);
  }

  wake(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }

  replenish(): void {
    if (this.closed || this.workers.length) return;
    const rec = this.spawnWorker();
    rec.ready.then(
      () => rec.refresh(),
      () => {},
    );
  }

  async acquire(ctx: Ctx): Promise<WorkerRecord> {
    for (;;) {
      if (this.closed) throw new Error('the handler was closed');
      if (ctx.signal?.aborted) throw new Error('no worker was free before the deadline');
      const free =
        this.workers.find((w) => !w.dead && w.busy === null && w.loaded) ??
        this.workers.find((w) => !w.dead && w.busy === null);
      const rec =
        free ??
        (this.workers.length < POOL_SIZE
          ? this.spawnWorker(Math.min(this.loadBudgetMs, (ctx.deadline ?? Infinity) - Date.now()))
          : null);
      if (rec) {
        rec.busy = 'reserved';
        rec.refresh();
        try {
          await untilAborted(rec.ready, ctx.signal, 'no worker was ready before the deadline');
        } catch (err) {
          this.unreserve(rec);
          if (ctx.signal?.aborted) throw err;
          throw new Error(`the handler did not load: ${errText(err)}`);
        }
        return rec;
      }
      await untilAborted(
        new Promise<void>((resolve) => this.waiters.push(resolve)),
        ctx.signal,
        'no worker was free before the deadline',
      );
    }
  }

  unreserve(rec: WorkerRecord): void {
    if (rec.busy !== 'reserved') return;
    rec.busy = null;
    rec.refresh();
    this.wake();
  }

  async handle(event: EventPayload, ctx: Ctx, { cleanupDeadline }: { cleanupDeadline?: number } = {}): Promise<any> {
    const rec = await this.acquire(ctx);
    if (ctx.signal?.aborted) {
      this.unreserve(rec);
      throw new Error('no worker was ready before the deadline');
    }
    const requestId = ++idCounter;
    rec.busy = requestId;
    const onAbort = () => rec.retire('deadline', { cleanupDeadline }).then(() => this.replenish());
    ctx.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await rec.request('event', requestId, ctx, { type: 'event', event, context: contextData(ctx) });
    } finally {
      ctx.signal?.removeEventListener('abort', onAbort);
      if (rec.dead) await rec.retiring;
    }
  }

  async runProof(name: string, ctx: Ctx): Promise<any> {
    let rec =
      this.workers.find((w) => !w.dead && w.loaded && w.busy === null) ?? this.workers.find((w) => !w.dead && w.loaded);
    if (!rec) {
      rec = this.workers.length < POOL_SIZE ? this.spawnWorker() : (this.workers[0] as WorkerRecord);
      await untilAborted(rec.ready, ctx.signal, 'timed out');
    }
    if (ctx.signal?.aborted) throw new Error('timed out');
    const requestId = ++idCounter;
    const onAbort = () => {
      const p = rec!.finish('proof', requestId);
      if (!p) return;
      p.reject(new Error('timed out'));
      if (rec!.busy === null && !rec!.pending.size) rec!.retire('proof deadline').then(() => this.replenish());
      else rec!.cleanup({ requestId }).catch(() => {});
    };
    ctx.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await rec.request('proof', requestId, ctx, { type: 'proof', name, context: contextData(ctx) });
    } finally {
      ctx.signal?.removeEventListener('abort', onAbort);
    }
  }

  async close({ cleanupDeadline }: { cleanupDeadline?: number } = {}): Promise<void> {
    this.closed = true;
    await Promise.all(this.workers.map((w) => w.retire('closed', { cleanupDeadline })));
  }
}

// Start the first worker of a handler pool and return its proxy Handler once the worker reports
// `loaded`. Rejects when the handler is still loading after loadBudgetMs, or fails to load.
export async function startWorker(
  toolDir: string,
  { loadBudgetMs = 2000, tool = basename(toolDir) }: { loadBudgetMs?: number; tool?: string } = {},
): Promise<WorkerHandler> {
  const pool = new HandlerPool(toolDir, tool, loadBudgetMs);
  const rec = pool.spawnWorker();
  rec.busy = 'reserved';
  let meta: WorkerMeta;
  try {
    meta = await rec.ready;
  } catch (err) {
    await rec.retire('load');
    throw err;
  }
  rec.busy = null;
  rec.refresh();
  const proofs: Record<string, (ctx: HandlerContext) => Promise<any>> = {};
  for (const name of meta.proofs) proofs[name] = (ctx: HandlerContext) => pool.runProof(name, ctx);
  return {
    name: meta.name,
    tool,
    events: meta.events,
    timeouts: meta.timeouts,
    manual: meta.manual,
    proofs,
    handle: (event: EventPayload, ctx: HandlerContext, internal?: { cleanupDeadline?: number }) =>
      pool.handle(event, ctx, internal),
    close: (opts?: { cleanupDeadline?: number }) => pool.close(opts),
    workerGens: () => pool.workers.map((w) => w.gen),
  };
}
