// The worker side (design D3): import one handler, answer `event`, `proof`, `ack` and `release`
// messages from the supervisor. Spawning, the gate lock, proofs of other handlers and traces are
// message calls to the supervisor; this thread never starts a process or touches a lock itself.
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import type { Handler, SpawnOptions, SpawnResult, WorkerContext } from './handler.types.mts';

type Msg = Record<string, any>;
interface Call {
  resolve: (msg: Msg) => void;
  onData?: (stream: 'stdout' | 'stderr', chunk: Uint8Array) => void;
}

const { handlerPath, workerGen } = workerData;
const post = (msg: Msg) => parentPort!.postMessage({ workerGen, ...msg });
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));
let handler: Handler;
let callCounter = 0;
const calls = new Map<number, Call>(); // callId -> {resolve, onData?}
const blocks = new Map<unknown, { ack?: () => unknown; release?: () => unknown }>(); // event requestId -> {ack, release}

function call(requestId: unknown, type: string, payload: Msg, extra: Partial<Call> = {}): Promise<Msg> {
  const callId = ++callCounter;
  return new Promise<Msg>((resolve) => {
    calls.set(callId, { resolve, ...extra });
    post({ type, requestId, callId, ...payload });
  });
}

function spawnVia(
  requestId: unknown,
  argv: readonly unknown[],
  { cwd, env, timeoutMs, signal, maxBytes = Infinity }: SpawnOptions = {},
): Promise<SpawnResult> {
  if (!Array.isArray(argv) || argv.length === 0) return Promise.reject(new TypeError('spawn needs a non-empty argv'));
  const out: Record<'stdout' | 'stderr', Buffer[]> = { stdout: [], stderr: [] };
  const size = { stdout: 0, stderr: 0 };
  let truncated = false;
  const onData = (stream: 'stdout' | 'stderr', chunk: Uint8Array) => {
    const buf = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    out[stream].push(buf);
    size[stream] += buf.length;
    while (size[stream] > maxBytes) {
      truncated = true;
      const first = out[stream][0] as Buffer;
      const excess = size[stream] - maxBytes;
      if (first.length <= excess) {
        out[stream].shift();
        size[stream] -= first.length;
      } else {
        out[stream][0] = first.subarray(excess);
        size[stream] -= excess;
      }
    }
  };
  let callId: number;
  const onAbort = () => post({ type: 'spawn.kill', requestId, callId });
  const p = call(requestId, 'spawn', {
    argv: argv.map(String), cwd, env, timeoutMs,
  }, { onData }).then((m) => {
    signal?.removeEventListener('abort', onAbort);
    if (m.error) throw new Error(m.error);
    return {
      code: m.code, signal: m.signal, pgid: m.pgid, timedOut: m.timedOut === true, truncated,
      stdout: Buffer.concat(out.stdout).toString('utf8'),
      stderr: Buffer.concat(out.stderr).toString('utf8'),
    };
  });
  callId = callCounter;
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return p;
}

function buildContext(requestId: unknown, data: Msg): { ctx: WorkerContext; done: () => void } {
  const controller = new AbortController();
  const ms = data.deadline - Date.now();
  const timer = Number.isFinite(ms) ? setTimeout(() => controller.abort(new Error('deadline')), Math.max(0, ms)) : null;
  const ctx: WorkerContext = {
    ...(data as WorkerContext),
    signal: controller.signal,
    proof: (name: string) => call(requestId, 'proof.request', { name }).then((m) => m.value ?? null),
    trace: (outcome: unknown) => post({ type: 'trace', requestId, outcome: String(outcome) }),
    spawn: (argv: readonly unknown[], opts?: SpawnOptions) => spawnVia(requestId, argv, opts),
    lock: {
      async acquire(dir: string) {
        const m = await call(requestId, 'lock.acquire', { dir: String(dir) });
        if (m.error) throw new Error(m.error);
        if (m.lockId === null || m.lockId === undefined) return null;
        let released = false;
        return {
          async release() {
            if (released) return;
            released = true;
            const r = await call(requestId, 'lock.release', { lockId: m.lockId });
            if (r.error) throw new Error(r.error);
          },
        };
      },
    },
  };
  return { ctx, done: () => clearTimeout(timer as NodeJS.Timeout) };
}

function sendResult(type: string, requestId: unknown, fields: Msg): void {
  try {
    post({ type, requestId, ok: true, ...fields });
  } catch (err) {
    post({ type, requestId, ok: false, error: `returned a value that cannot be sent (${errText(err)})` });
  }
}

async function runEvent({ requestId, event, context }: Msg): Promise<void> {
  const { ctx, done } = buildContext(requestId, context);
  try {
    let result: unknown = await handler.handle(event, ctx);
    let hasAck = false;
    let hasRelease = false;
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const { ack, release, ...rest } = result as Record<string, any>;
      hasAck = typeof ack === 'function';
      hasRelease = typeof release === 'function';
      if (hasAck || hasRelease) blocks.set(requestId, { ack, release });
      result = rest;
    }
    sendResult('result', requestId, { result: result ?? null, hasAck, hasRelease });
  } catch (err) {
    post({ type: 'result', requestId, ok: false, error: errText(err) });
  } finally {
    done();
  }
}

async function runProof({ requestId, name, context }: Msg): Promise<void> {
  const { ctx, done } = buildContext(requestId, context);
  ctx.trace = () => {};
  try {
    const check = handler.proofs?.[name];
    if (typeof check !== 'function') throw new Error(`proof ${name} is not registered`);
    sendResult('proof.result', requestId, { value: (await check(ctx)) ?? null });
  } catch (err) {
    post({ type: 'proof.result', requestId, ok: false, error: errText(err) });
  } finally {
    done();
  }
}

async function runBlockCallback({ type, requestId }: Msg): Promise<void> {
  const reply = type === 'ack' ? 'acked' : 'released';
  const entry = blocks.get(requestId);
  blocks.delete(requestId);
  try {
    const fn = entry?.[type as 'ack' | 'release'];
    if (typeof fn === 'function') await fn();
    post({ type: reply, requestId, ok: true });
  } catch (err) {
    post({ type: reply, requestId, ok: false, error: errText(err) });
  }
}

parentPort!.on('message', (msg: Msg) => {
  if (!msg || msg.workerGen !== workerGen) return;
  switch (msg.type) {
    case 'event': return void runEvent(msg);
    case 'proof': return void runProof(msg);
    case 'ack':
    case 'release': return void runBlockCallback(msg);
    case 'spawn.data': return void calls.get(msg.callId)?.onData?.(msg.stream, msg.chunk);
    default: {
      const c = calls.get(msg.callId);
      if (!c) return;
      calls.delete(msg.callId);
      c.resolve(msg);
    }
  }
});

function meta(h: any): Record<string, unknown> {
  if (!h || typeof h !== 'object') throw new Error('handler.mjs has no default export object');
  if (typeof h.name !== 'string' || !h.name) throw new Error('the handler has no name');
  if (!Array.isArray(h.events) || h.events.some((e: unknown) => typeof e !== 'string')) throw new Error('the handler events are not a list of names');
  if (typeof h.handle !== 'function') throw new Error('the handler has no handle function');
  const timeouts: Record<string, number> = {};
  for (const [k, v] of Object.entries(h.timeouts ?? {})) if (typeof v === 'number') timeouts[k] = v;
  return {
    name: h.name,
    events: [...h.events],
    timeouts,
    manual: typeof h.manual === 'string' ? h.manual : undefined,
    proofs: Object.keys(h.proofs ?? {}).filter((k) => typeof h.proofs[k] === 'function'),
  };
}

try {
  const mod = await import(pathToFileURL(handlerPath).href);
  handler = mod.default ?? mod.handler;
  post({ type: 'loaded', meta: meta(handler) });
} catch (err) {
  post({ type: 'load-error', error: errText(err) });
}
