// Dispatch, deadlines, fail-open, result merging, handler loading and proofs (design D2, D3).
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readHarnessConfig } from './config.mts';
import { checkTool, readLock } from './install.mts';
import { sessionStateDir, toolStateDir } from './state.mts';
import { startWorker } from './supervisor.mts';
import type {
  DispatchResult,
  EventPayload,
  Handler,
  HandlerContext,
  HarnessEvent,
  HostName,
  ToolKind,
} from './handler.types.mts';
import type { ToolMeta } from './lock.types.mts';

type RuntimeHandler = Handler & Record<string, any>;
type Validated = {
  kind?: string | null;
  text?: string;
  stale?: string;
  error?: string;
  ack?: () => unknown;
  release?: () => unknown;
};
interface ProofCtx extends Partial<HandlerContext> {
  [key: string]: unknown;
}
export interface DispatchOptions {
  sessionId?: string;
  agentId?: string;
  // Epoch ms by which the host stops waiting.
  hostDeadline?: number;
  workDeadline?: number;
}
export interface RuntimeOptions {
  repoRoot: string;
  host: HostName;
  handlers?: RuntimeHandler[];
  problems?: string[];
  now?: () => number;
  budgetMs?: number;
}
export interface Runtime {
  dispatch(event: EventPayload, opts?: DispatchOptions): Promise<DispatchResult>;
  proof(name: string, ctx?: ProofCtx): Promise<string | null>;
  // Closes every handler that has a close; the others are ignored. Close errors are swallowed.
  close(opts?: { cleanupDeadline?: number }): Promise<void>;
  handlers: RuntimeHandler[];
  problems: string[];
}

export const EVENTS: readonly HarnessEvent[] = Object.freeze([
  'tool.before',
  'tool.after',
  'prompt',
  'turn.end',
  'compact',
  'session.start',
]);
export const RESULT_KINDS: Readonly<Record<HarnessEvent, readonly string[]>> = Object.freeze({
  'tool.before': ['deny'],
  'tool.after': ['context'],
  prompt: ['context'],
  'session.start': ['context'],
  compact: [],
  'turn.end': ['block', 'context'],
});
export const DEFAULT_DEADLINE_MS = 5000;
export const CLEANUP_MS = 6000;
export const OUTPUT_MS = 1000;
export const LOAD_BUDGET_MS = 2000;

const KINDS = ['deny', 'block', 'context'];
const TOOL_KINDS: readonly ToolKind[] = ['shell', 'edit', 'read', 'skill', 'other'];
const JOIN = '\n\n';
const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const isObject = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);
const MAX_TIMER_MS = 2 ** 31 - 1; // setTimeout fires at once above this
const positive = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, MAX_TIMER_MS) : undefined;

// With AGENT_HARNESS_TRACE=1, one JSON line per dispatched event in
// <hook-runtime state>/trace.jsonl (design D7): {event, processStart, hostCreatedAt?, receivedAt,
// handlersLoadedAt, settledAt, outcomes}. A skipped call has skipped? instead of handlersLoadedAt.
// Never throws.
export function writeTrace(repoRoot: string, record: unknown, env: NodeJS.ProcessEnv = process.env): void {
  if (env.AGENT_HARNESS_TRACE !== '1') return;
  try {
    const dir = toolStateDir(repoRoot, 'hook-runtime');
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'trace.jsonl'), `${JSON.stringify(record)}\n`);
  } catch {}
}

export function failureNotice(name: string, event: string, reason: unknown, manual?: string): string {
  const r = String(reason ?? 'unknown error').replace(/[.\s]+$/, '');
  return `hook ${name} failed on ${event}: ${r}.${manual ? ` ${manual}` : ' Do this step by hand.'}`;
}

// A referenced timer (never unref): a handler whose promise never settles cannot let Node exit early.
function timer(ms: number): { p: Promise<void>; clear: () => void } {
  let id: NodeJS.Timeout | undefined;
  const p = new Promise<void>((resolve) => {
    id = setTimeout(resolve, Math.max(0, ms));
  });
  return { p, clear: () => clearTimeout(id) };
}

const TIMED_OUT = Symbol('timed out');

// Resolves to the promise's value, or TIMED_OUT once `until` passes.
async function within<T>(
  promise: Promise<T>,
  until: number,
  now: () => number,
): Promise<Awaited<T> | typeof TIMED_OUT> {
  if (!Number.isFinite(until)) return promise as Promise<Awaited<T>>;
  const t = timer(until - now());
  try {
    return await Promise.race([promise, t.p.then((): typeof TIMED_OUT => TIMED_OUT)]);
  } finally {
    t.clear();
  }
}

function validate(result: unknown, type: HarnessEvent): Validated {
  if (result === null || result === undefined) return { kind: null };
  if (!isObject(result)) return { error: 'returned an invalid result' };
  const kinds = KINDS.filter((k) => result[k] !== undefined);
  if (kinds.length !== 1)
    return { error: `returned an invalid result (${kinds.length ? kinds.join(' and ') : 'no result kind'})` };
  const [kind] = kinds as [string];
  if (!RESULT_KINDS[type].includes(kind)) return { error: `returned ${kind}, which ${type} does not accept` };
  if (typeof result[kind] !== 'string') return { error: `returned a ${kind} that is not text` };
  const out: Validated = { kind, text: result[kind] };
  if (kind === 'block' || kind === 'context') {
    if (typeof result.stale === 'string') out.stale = result.stale;
  }
  if (kind === 'block') {
    if (typeof result.ack === 'function') out.ack = result.ack;
    if (typeof result.release === 'function') out.release = result.release;
  }
  return out;
}

function callQuietly(fn: () => unknown): Promise<unknown> {
  try {
    return Promise.resolve(fn()).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

const toolOf = (h: RuntimeHandler): string => h.tool ?? h.name;

// The tool kinds a handler tool declared in its tool.json `tools` key, or null for every kind.
// Anything malformed (missing, not an array, empty, an unknown kind) means every kind.
export function declaredKinds(meta: unknown): ToolKind[] | null {
  if (!isObject(meta)) return null;
  const tools: unknown = meta.tools;
  if (!Array.isArray(tools) || tools.length === 0) return null;
  const kinds: ToolKind[] = [];
  for (const kind of tools) {
    if (!TOOL_KINDS.includes(kind)) return null;
    kinds.push(kind);
  }
  return kinds;
}

// Whether a handler with these declared kinds (null for every kind) wants a tool event (design D1).
// `skill` covers a skill call and a read of a skill file, whatever the event's kind.
export function wantsEvent(kinds: readonly ToolKind[] | null, event: EventPayload): boolean {
  if (!kinds) return true;
  if (kinds.includes(event.tool?.kind ?? 'other')) return true;
  return kinds.includes('skill') && event.skill !== undefined;
}

// Whether any installed handler tool could want a tool event (design D2). A missing or unreadable
// lock, tool.json or `tools` list means every kind, so the caller loads handlers instead of
// skipping. Returns false only when every handler tool provably excludes the event.
export function anyHandlerWants(repoRoot: string, event: EventPayload): boolean {
  let lock: ReturnType<typeof readLock>;
  try {
    lock = readLock(repoRoot);
  } catch {
    return true;
  }
  for (const name of Object.keys(lock.tools)) {
    let meta: unknown;
    try {
      meta = JSON.parse(readFileSync(join(repoRoot, '.agents', 'harness', name, 'tool.json'), 'utf8'));
    } catch {
      return true;
    }
    if (!isObject(meta) || meta.handler !== true) continue;
    if (wantsEvent(declaredKinds(meta), event)) return true;
  }
  return false;
}

export function createRuntime(
  { repoRoot, host, handlers = [], problems = [], now = Date.now, budgetMs }: RuntimeOptions = {} as RuntimeOptions,
): Runtime {
  const sorted = [...handlers].sort(byName);

  function stateDirFor(
    handler: RuntimeHandler,
    { sessionId, agentId }: { sessionId?: unknown; agentId?: unknown },
  ): string {
    return sessionStateDir({ repoRoot, tool: toolOf(handler), host, sessionId, agentId });
  }

  async function proof(name: string, ctx: ProofCtx = {}): Promise<string | null> {
    const owner = sorted.find(
      (h) => isObject(h.proofs) && Object.hasOwn(h.proofs, name) && typeof h.proofs[name] === 'function',
    );
    if (!owner) return `proof ${name} is not registered`;
    const deadline = ctx.deadline ?? now() + DEFAULT_DEADLINE_MS;
    let config: unknown = {};
    try {
      config = readHarnessConfig(repoRoot)[toolOf(owner)] ?? {};
    } catch {}
    // The proof's own signal aborts at its deadline, also when the caller passed none.
    const controller = new AbortController();
    const forward = () => controller.abort(ctx.signal!.reason);
    if (ctx.signal?.aborted) forward();
    else ctx.signal?.addEventListener('abort', forward, { once: true });
    const ownerCtx: Record<string, any> = {
      ...ctx,
      repoRoot,
      host,
      deadline,
      config,
      signal: controller.signal,
      trace() {},
    };
    ownerCtx.proof = (n: string) => proof(n, ownerCtx);
    try {
      ownerCtx.stateDir = stateDirFor(owner, ctx);
      const value = await within(Promise.resolve(owner.proofs![name]!(ownerCtx as HandlerContext)), deadline, now);
      if (value === TIMED_OUT) {
        controller.abort(new Error('deadline'));
        return `proof ${name} timed out`;
      }
      if (value === null || value === undefined) return null;
      if (typeof value !== 'string') return `proof ${name} returned an invalid value`;
      return value;
    } catch (err) {
      return `proof ${name} failed: ${errText(err)}`;
    } finally {
      ctx.signal?.removeEventListener('abort', forward);
    }
  }

  async function runHandler(
    handler: RuntimeHandler,
    event: EventPayload,
    opts: DispatchOptions & { workDeadline: number; deadlines: Record<string, unknown>; config: Record<string, any> },
  ): Promise<Record<string, any>> {
    const { workDeadline, deadlines, config, hostDeadline } = opts;
    const type = event.type;
    const budget: number = positive(handler.timeouts?.[type]) ?? positive(deadlines?.[type]) ?? DEFAULT_DEADLINE_MS;
    const t0 = now();
    const deadline = Math.min(t0 + budget, workDeadline);
    const cleanupDeadline = hostDeadline !== undefined ? hostDeadline - OUTPUT_MS : deadline + CLEANUP_MS - OUTPUT_MS;
    const controller = new AbortController();
    let open = true;
    let traced: string | undefined;
    const ctx: HandlerContext = {
      repoRoot,
      host,
      sessionId: opts.sessionId,
      agentId: opts.agentId,
      deadline,
      signal: controller.signal,
      stateDir: undefined,
      config: config[toolOf(handler)] ?? {},
      proof: (name: string) => proof(name, ctx as ProofCtx),
      trace: (outcome: unknown) => {
        if (open) traced = String(outcome);
      },
    };
    const fail = (reason: unknown) => ({
      failure: failureNotice(handler.name, type, reason, handler.manual),
      outcome: 'failed',
    });

    let pending: Promise<unknown>;
    try {
      ctx.stateDir = stateDirFor(handler, opts);
      pending = Promise.resolve(handler.handle(structuredClone(event), ctx, { cleanupDeadline }));
    } catch (err) {
      pending = Promise.reject(err);
    }
    const settled = pending.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const t = timer(deadline - now());
    const first = await Promise.race([settled, t.p.then(() => null)]);
    t.clear();
    open = false;

    if (first === null || now() > deadline) {
      controller.abort(new Error('deadline'));
      // The cleanup the abort starts is awaited separately; a late block is released, never delivered.
      const cleanup = settled.then((r) => {
        if (r.ok && isObject(r.value) && r.value.block !== undefined && typeof r.value.release === 'function') {
          return callQuietly(r.value.release);
        }
        return undefined;
      });
      return {
        ...fail(`timed out after ${Math.max(0, Math.round(deadline - t0))} ms`),
        cleanup,
        cleanupDeadline,
        spent: deadline >= workDeadline,
      };
    }
    if (!first.ok) return fail(errText(first.error));
    const v = validate(first.value, type);
    if (v.error) {
      if (isObject(first.value) && typeof first.value.release === 'function') callQuietly(first.value.release);
      return fail(v.error);
    }
    return { result: v.kind ? v : null, outcome: traced ?? (v.kind ? 'result' : 'null') };
  }

  async function dispatch(
    event: EventPayload,
    { sessionId, agentId, hostDeadline, workDeadline: wd }: DispatchOptions = {},
  ): Promise<DispatchResult> {
    const type = event?.type;
    const notices = [...problems];
    const outcomes: Record<string, string> = {};
    if (!EVENTS.includes(type)) {
      notices.push(`hook-runtime: unknown event ${JSON.stringify(type)} was ignored.`);
      return { notices, outcomes };
    }
    const start = now();
    const workDeadline = Math.min(positive(budgetMs) !== undefined ? start + budgetMs! : Infinity, wd ?? Infinity);
    let config: Record<string, any> = {};
    let configError: string | undefined;
    try {
      config = readHarnessConfig(repoRoot);
    } catch (err) {
      configError = errText(err);
    }
    const deadlines = isObject(config['hook-runtime']?.deadlines) ? config['hook-runtime'].deadlines : {};
    const texts: Record<string, string[]> = { deny: [], block: [], context: [] };
    const staleTexts: string[] = [];
    const acks: (() => unknown)[] = [];
    const releases: (() => unknown)[] = [];
    const cleanups: Promise<unknown>[] = [];
    let cleanupUntil = -Infinity;
    let spent = false; // a timer can fire a little before Date.now() reaches its moment

    for (const handler of sorted.filter((h) => Array.isArray(h.events) && h.events.includes(type))) {
      // Only tool events read `tools` at all, so an unrelated dispatch never touches the key.
      if (type === 'tool.before' || type === 'tool.after') {
        // Validate on every tool dispatch so an in-process `tools: []` or an unknown kind means every kind.
        const kinds = declaredKinds(handler);
        if (!wantsEvent(kinds, event)) continue;
      }
      if (configError || spent || now() >= workDeadline) {
        const reason = configError ?? "skipped, the event's time budget was used up";
        notices.push(failureNotice(handler.name, type, reason, handler.manual));
        outcomes[handler.name] = 'skipped';
        continue;
      }
      const r = await runHandler(handler, event, {
        workDeadline,
        deadlines,
        config,
        hostDeadline,
        sessionId,
        agentId,
      });
      outcomes[handler.name] = r.outcome;
      if (r.failure) notices.push(r.failure);
      if (r.spent) spent = true;
      if (r.cleanup) {
        cleanups.push(r.cleanup);
        cleanupUntil = Math.max(cleanupUntil, r.cleanupDeadline);
      }
      if (r.result) {
        texts[r.result.kind]!.push(r.result.text);
        if (r.result.stale !== undefined) staleTexts.push(r.result.stale);
        if (r.result.ack) acks.push(r.result.ack);
        if (r.result.release) releases.push(r.result.release);
      }
    }

    if (cleanups.length) await within(Promise.allSettled(cleanups), cleanupUntil, now);

    const out: DispatchResult = { notices, outcomes };
    if (texts.deny!.length) out.deny = texts.deny!.join(JOIN);
    if (texts.block!.length) out.block = texts.block!.join(JOIN);
    if (texts.context!.length && !out.deny) out.context = texts.context!.join(JOIN);
    if (staleTexts.length) out.stale = staleTexts.join(JOIN);
    if (acks.length)
      out.ack = async () => {
        for (const fn of acks) await callQuietly(fn);
      };
    if (releases.length)
      out.release = async () => {
        for (const fn of releases) await callQuietly(fn);
      };
    return out;
  }

  // A failing close does not skip the others; the caller gets no error, because there is nothing
  // useful left to do once a handler's worker is gone.
  async function close(opts: { cleanupDeadline?: number } = {}): Promise<void> {
    const closers = sorted.filter((h) => typeof h.close === 'function').map((h) => callQuietly(() => h.close(opts)));
    await Promise.allSettled(closers);
  }

  return { dispatch, proof, close, handlers: sorted, problems };
}

export async function loadHandlers(
  repoRoot: string,
  { loadBudgetMs = LOAD_BUDGET_MS }: { loadBudgetMs?: number } = {},
): Promise<{ handlers: RuntimeHandler[]; problems: string[] }> {
  const notLoaded = (name: string, reason: unknown) =>
    `hook ${name} was not loaded: ${String(reason).replace(/[.\s]+$/, '')}. Do this step by hand.`;
  let lock: ReturnType<typeof readLock>;
  try {
    lock = readLock(repoRoot);
  } catch (err) {
    return { handlers: [], problems: [notLoaded('hook-runtime', errText(err))] };
  }
  type Loaded = { handler?: RuntimeHandler; problem?: string } | null;
  const results: Loaded[] = await Promise.all(
    Object.keys(lock.tools)
      .sort()
      .map(async (name): Promise<Loaded> => {
        const toolDir = join(repoRoot, '.agents', 'harness', name);
        let meta: ToolMeta | null;
        try {
          meta = JSON.parse(readFileSync(join(toolDir, 'tool.json'), 'utf8'));
        } catch (err) {
          return { problem: notLoaded(name, `cannot read tool.json (${errText(err)})`) };
        }
        if (meta?.handler !== true) return null;
        const issues = checkTool({ toolDir, repoRoot });
        if (issues.length) return { problem: notLoaded(name, `its copy differs from the lock: ${issues.join('; ')}`) };
        try {
          const handler = await startWorker(toolDir, { loadBudgetMs, tool: name });
          // tool.json is the only source of `tools`; a `tools` export in handler.mjs is ignored.
          const kinds = declaredKinds(meta);
          if (kinds) handler.tools = kinds;
          return { handler };
        } catch (err) {
          return { problem: notLoaded(name, errText(err)) };
        }
      }),
  );
  return {
    handlers: results.filter((r) => r?.handler).map((r) => r!.handler as RuntimeHandler),
    problems: results.filter((r) => r?.problem).map((r) => r!.problem as string),
  };
}
