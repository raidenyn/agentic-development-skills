// OpenCode 2.4.1 adapter (design D2 tool kinds, D3 event mapping, child lifecycle, superseded
// results and notice channels, D5 turn-end queue). A V2 plugin `{id, setup(ctx)}`: tool hooks
// `execute.before`/`execute.after`, session hooks `prompt`/`context`, and the event stream. Handlers
// are loaded once at setup and run in workers under the supervisor (runtime.mjs, supervisor.mjs).
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { capabilityNotice, HOST_CAPABILITIES } from './capabilities.mts';
import { readHarnessConfig } from './config.mts';
import { CLEANUP_MS, createRuntime, DEFAULT_DEADLINE_MS, failureNotice, loadHandlers, writeTrace } from './runtime.mts';
import { sessionStateDir } from './state.mts';
import { skillFromPath } from './skill-path.mts';
import type { DispatchResult, EventPayload, Handler, HarnessEvent, ToolKind } from './handler.types.mts';
import type { Runtime } from './runtime.mts';

type HostObject = any;
type Who = { sessionId: string; agentId: string };
type Bounded<T> = { value: T } | { error: unknown } | { timedOut: true };
type Received = { receivedAt?: number; hostCreatedAt?: number };
type PluginRuntime = Pick<Runtime, 'dispatch'> & { handlers?: (Handler & Record<string, any>)[]; problems?: string[] };
type Out = Partial<DispatchResult> & { notices: string[] };
type SlotEntry = { generation: number; received: Received };
type Slot = { busy: boolean; queue: SlotEntry[] };
export interface PluginOptions {
  runtimeFactory?: (opts: { repoRoot: string; host: string }) => Promise<PluginRuntime>;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: any) => void;
  capabilities?: typeof HOST_CAPABILITIES;
  now?: () => number;
}

export const HOST = 'opencode';
export const PLUGIN_ID = 'agent-harness-hook-runtime';
export const DISPOSE_MS = 1000;
const LOOKUP_MS = 2000; // budget of one ctx.session.get call
const MAX_DEPTH = 16; // parentID walk cap
const CALLBACK_MS = CLEANUP_MS; // bound on synthetic, ack and release
const JOIN = '\n\n';

const KINDS: Record<string, ToolKind> = {
  shell: 'shell',
  bash: 'shell',
  patch: 'edit',
  edit: 'edit',
  write: 'edit',
  read: 'read',
  glob: 'read',
  grep: 'read',
  skill: 'skill',
};

const isObject = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const isId = (v: unknown): v is string => typeof v === 'string' && v !== '';
const unique = (list: unknown[]): string[] =>
  [...new Set(list.flat().filter((t) => typeof t === 'string' && t))] as string[];
const positive = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;

// One deadline rule for every OpenCode event: the work budget is the largest declared budget of the
// subscribed handlers (timeouts[event], else hook-runtime.deadlines[event], else 5000 ms), and the
// host deadline adds the 6 s cleanup budget. `startedAt` is receipt, or dequeue for a turn end.
export function eventDeadlines(
  handlers: readonly (Partial<Handler> | null | undefined)[] | null | undefined,
  event: string | { type?: string } | null | undefined,
  startedAt: number,
  deadlines: Record<string, unknown> = {},
): { workDeadline: number; hostDeadline: number } {
  const type = (typeof event === 'string' ? event : event?.type) as HarnessEvent;
  let work = 0;
  for (const h of handlers ?? []) {
    if (!Array.isArray(h?.events) || !h.events.includes(type)) continue;
    work = Math.max(work, positive(h!.timeouts?.[type]) ?? positive(deadlines?.[type]) ?? DEFAULT_DEADLINE_MS);
  }
  if (!work) work = DEFAULT_DEADLINE_MS;
  return { workDeadline: startedAt + work, hostDeadline: startedAt + work + CLEANUP_MS };
}

function repoRelative(path: unknown, repoRoot: string): string | null {
  if (!isId(path)) return null;
  const rel = relative(repoRoot, resolve(repoRoot, path));
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join('/');
}

// Tool hook input to a normalized tool event. `patch` files come from the result's metadata,
// `edit` and `write` files from input.path (OpenCode 2.4.1's native tools, relative to the session
// directory) or input.filePath. A skill's name is the arguments' id, then name, never the call id;
// a `read` of a SKILL.md carries the skill, while grep and glob (the same kind) never do.
export function toToolEvent(type: HarnessEvent, input: HostObject, repoRoot: string): EventPayload {
  const name = String(input?.tool ?? '');
  const toolInput = isObject(input?.input) ? input.input : {};
  const kind: ToolKind = Object.hasOwn(KINDS, name) ? (KINDS[name] as ToolKind) : 'other';
  const event: EventPayload = { type, host: HOST, tool: { name, kind, input: toolInput, callId: input?.id } };
  if (kind === 'shell' && typeof toolInput.command === 'string') event.command = toolInput.command;
  if (kind === 'edit') {
    const meta = input?.result?.metadata;
    const paths: unknown[] =
      name === 'patch'
        ? Array.isArray(meta?.files)
          ? meta.files.map((f: HostObject) => f?.file)
          : []
        : [toolInput.path ?? toolInput.filePath];
    event.files = [...new Set(paths.map((p) => repoRelative(p, repoRoot)).filter((p) => p !== null))] as string[];
  }
  if (kind === 'skill') {
    const skill = isId(toolInput.id) ? toolInput.id : isId(toolInput.name) ? toolInput.name : null;
    if (skill) {
      event.skill = skill;
      event.skillVia = 'call';
    }
  }
  if (name === 'read') {
    const skill = skillFromPath(toolInput.path ?? toolInput.filePath, repoRoot);
    if (skill) {
      event.skill = skill;
      event.skillVia = 'read';
    }
  }
  // A shell call also needs a zero exit code; any other tool's status is the whole answer.
  if (type === 'tool.after')
    event.ok = input?.status === 'completed' && (kind !== 'shell' || input?.result?.metadata?.exit === 0);
  return event;
}

function findRepoRoot(ctx: HostObject): string {
  const dir = [ctx?.location?.directory, ctx?.directory, ctx?.worktree].find(isId) ?? process.cwd();
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    if (top) return top;
  } catch {}
  return dir;
}

async function defaultRuntime({ repoRoot, host }: { repoRoot: string; host: string }): Promise<PluginRuntime> {
  const { handlers, problems } = await loadHandlers(repoRoot);
  // Load problems are reported once per session.start, not on every event.
  return { ...createRuntime({ repoRoot, host, handlers }), problems };
}

export function createOpencodePlugin({
  runtimeFactory = defaultRuntime,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  capabilities = HOST_CAPABILITIES,
  now = Date.now,
}: PluginOptions = {}): { id: string; setup: (ctx: HostObject) => Promise<() => Promise<void>> } {
  return {
    id: PLUGIN_ID,
    setup: (ctx: HostObject) => setup(ctx, { runtimeFactory, setTimer, clearTimer, capabilities, now }),
  };
}

async function setup(
  ctx: HostObject,
  { runtimeFactory, setTimer, clearTimer, capabilities, now }: Required<PluginOptions>,
): Promise<() => Promise<void>> {
  const repoRoot = findRepoRoot(ctx);
  let runtime: PluginRuntime;
  try {
    runtime = await runtimeFactory({ repoRoot, host: HOST });
  } catch (err) {
    runtime = {
      handlers: [],
      problems: [failureNotice('hook-runtime', 'setup', errText(err))],
      dispatch: async () => ({ notices: [] }) as unknown as DispatchResult,
    };
  }
  const handlers = Array.isArray(runtime.handlers) ? runtime.handlers : [];
  const handlersLoadedAt = now();
  let deadlines: Record<string, unknown> = {};
  try {
    const d = (readHarnessConfig(repoRoot)['hook-runtime'] as HostObject)?.deadlines;
    if (isObject(d)) deadlines = d;
  } catch {}

  let disposed = false;
  const identities = new Map<string, Promise<Who>>(); // OpenCode session id -> Promise<{sessionId, agentId}>
  const parents = new Map<string, string | null>(); // session id -> direct parent id, or null for a known root
  const lifecycle = new Map<string, 'running' | 'idle'>(); // session id -> 'running' | 'idle'
  const generations = new Map<string, number>(); // session id -> count of session.execution.started
  const slots = new Map<string, Slot>(); // session id -> {busy, queue: [{generation}]}
  const started = new Map<string, Promise<void>>(); // session id -> Promise of its first session.start
  const pending = new Map<string, string[]>(); // session id -> texts for `system` at the next context hook
  const compacted = new Set<string>(); // sessions marked by session.compaction.ended, not yet re-delivered

  // Resolves to {value} | {error} | {timedOut}, never rejects.
  const within = <T,>(fn: () => T | Promise<T>, ms: number): Promise<Bounded<T>> =>
    new Promise((done) => {
      const t = setTimer(() => done({ timedOut: true }), ms);
      Promise.resolve()
        .then(fn)
        .then(
          (value) => {
            clearTimer(t);
            done({ value });
          },
          (error) => {
            clearTimer(t);
            done({ error });
          },
        );
    });
  const callBounded = (fn: unknown) =>
    typeof fn === 'function' ? within(fn as () => unknown, CALLBACK_MS) : Promise.resolve();
  const detached = (p: unknown) => {
    Promise.resolve(p).catch(() => {});
  };

  // The parentID walk. A lookup error or timeout, a cycle or the depth cap makes the session a root.
  async function walk(sid: string): Promise<Who> {
    const root = { sessionId: sid, agentId: 'main' };
    const visited = new Set([sid]);
    let cur = sid;
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      let parent: string | null | undefined = parents.get(cur);
      if (parent === undefined) {
        const r = await within(() => ctx.session.get({ sessionID: cur }), LOOKUP_MS);
        if (!('value' in r)) return root;
        parent = isId((r.value as HostObject)?.parentID) ? (r.value as HostObject).parentID : null;
        parents.set(cur, parent as string | null);
      }
      if (!parent) return cur === sid ? root : { sessionId: cur, agentId: sid };
      if (visited.has(parent)) return root;
      visited.add(parent);
      cur = parent;
    }
    return root;
  }
  const identity = (sid: string): Promise<Who> => {
    if (!identities.has(sid))
      identities.set(
        sid,
        walk(sid).catch(() => ({ sessionId: sid, agentId: 'main' })),
      );
    return identities.get(sid) as Promise<Who>;
  };

  const background = (sid: string): number => {
    let n = 0;
    for (const [child, parent] of parents) if (parent === sid && lifecycle.get(child) === 'running') n++;
    return n;
  };

  function queueSystem(sid: string, ...texts: unknown[]): void {
    const list = pending.get(sid) ?? [];
    for (const t of unique(texts)) if (!list.includes(t)) list.push(t);
    if (list.length) pending.set(sid, list);
  }

  function flush(sid: string, input: HostObject): void {
    const list = pending.get(sid);
    pending.delete(sid);
    if (!list?.length) return;
    const items = list.map((text) => ({ type: 'text', text }));
    if (Array.isArray(input.system)) input.system.push(...items);
    else input.system = items;
  }

  // `received` is {receivedAt, hostCreatedAt?} for the trace line; receipt defaults to the start.
  async function run(event: EventPayload, who: Who, startedAt: number = now(), received: Received = {}): Promise<Out> {
    const { workDeadline, hostDeadline } = eventDeadlines(handlers, event, startedAt, deadlines);
    let out: Out;
    try {
      const merged = await runtime.dispatch(event, {
        sessionId: who.sessionId,
        agentId: who.agentId,
        workDeadline,
        hostDeadline,
      });
      out = { ...merged, notices: Array.isArray(merged?.notices) ? merged.notices : [] };
    } catch (err) {
      out = { notices: [failureNotice('hook-runtime', event.type, errText(err))] };
    }
    const trace: Record<string, unknown> = {
      event: event.type,
      processStart: performance.timeOrigin,
      receivedAt: received.receivedAt ?? startedAt,
      handlersLoadedAt,
      settledAt: now(),
      outcomes: out.outcomes ?? {},
    };
    if (typeof received.hostCreatedAt === 'number') trace.hostCreatedAt = received.hostCreatedAt;
    writeTrace(repoRoot, trace);
    return out;
  }

  // The compaction mark lives in the session's state folder, so it survives a new plugin instance.
  const markFile = (who: Who) =>
    join(sessionStateDir({ repoRoot, tool: 'hook-runtime', host: HOST, ...who }), 'compacted');
  async function setMark(sid: string): Promise<void> {
    compacted.add(sid);
    const who = await identity(sid);
    if (compacted.has(sid)) writeFileSync(markFile(who), String(now()));
  }
  // `persistedOnly`: a mark set in this instance waits for the context hook.
  function takeMark(sid: string, who: Who, { persistedOnly = false }: { persistedOnly?: boolean } = {}): boolean {
    if (persistedOnly && compacted.has(sid)) return false;
    let marked = compacted.delete(sid);
    try {
      const file = markFile(who);
      if (existsSync(file)) {
        marked = true;
        rmSync(file, { force: true });
      }
    } catch {}
    return marked;
  }

  async function sessionStart(sid: string, who: Who, afterCompact: boolean): Promise<void> {
    const merged = await run({ type: 'session.start', host: HOST, afterCompact }, who);
    const problems = Array.isArray(runtime.problems) ? runtime.problems : [];
    queueSystem(sid, merged.context, merged.notices, problems, capabilityNotice(HOST, handlers, capabilities));
  }

  // session.start for the first event seen for a session id (session.created arrives only for children).
  function ensureStarted(sid: string): Promise<void> | undefined {
    if (!started.has(sid)) {
      started.set(
        sid,
        (async () => {
          const who = await identity(sid);
          await sessionStart(sid, who, takeMark(sid, who, { persistedOnly: true }));
        })().catch(() => {}),
      );
    }
    return started.get(sid);
  }

  async function begin(sid: string): Promise<Who> {
    await ensureStarted(sid);
    return identity(sid);
  }

  // Detached turn ends: one in flight per session, a FIFO behind it, every entry runs.
  function enqueueTurnEnd(sid: string, received: Received): void {
    let slot = slots.get(sid);
    if (!slot) {
      slot = { busy: false, queue: [] };
      slots.set(sid, slot);
    }
    slot.queue.push({ generation: generations.get(sid) ?? 0, received });
    if (!slot.busy) detached(drain(sid, slot));
  }

  async function drain(sid: string, slot: Slot): Promise<void> {
    slot.busy = true;
    try {
      while (slot.queue.length && !disposed) {
        const entry = slot.queue.shift() as SlotEntry;
        try {
          await turnEnd(sid, entry, slot);
        } catch {}
      }
    } finally {
      slot.busy = false;
    }
  }

  async function turnEnd(sid: string, entry: SlotEntry, slot: Slot): Promise<void> {
    const who = await begin(sid);
    const event: EventPayload = { type: 'turn.end', host: HOST, background: background(sid) };
    const merged = await run(event, who, now(), entry.received); // the budget starts at dequeue
    // A newer session.execution.started supersedes this result: not delivered as a block, its
    // release is called, and its stale text may still be shown as a notice.
    const superseded = disposed || (generations.get(sid) ?? 0) !== entry.generation;
    if (superseded) {
      // The newest superseded result is shown as a notice: only with no later turn end queued.
      const stale = typeof merged.stale === 'string' ? merged.stale : '';
      if (!disposed && slot.queue.length === 0 && stale)
        await within(() => ctx.session.synthetic({ sessionID: sid, text: stale, resume: false }), CALLBACK_MS);
      await callBounded(merged.release);
      return;
    }
    const text = unique([merged.block, merged.context, merged.notices]).join(JOIN);
    if (!text) return;
    let resume = typeof merged.block === 'string';
    // The root's background is checked again just before delivery.
    if (resume && event.background === 0 && background(sid) > 0) resume = false;
    const r = await within(() => ctx.session.synthetic({ sessionID: sid, text, resume }), CALLBACK_MS);
    if ('value' in r && resume) await callBounded(merged.ack);
    else if ('error' in r || !resume) await callBounded(merged.release); // a timeout leaves the charge
  }

  async function compact(sid: string): Promise<void> {
    const who = await begin(sid);
    const merged = await run({ type: 'compact', host: HOST }, who);
    queueSystem(sid, merged.notices);
  }

  // Applied in arrival order, synchronously, before any await.
  function onEvent(ev: HostObject): void {
    const type = ev?.type;
    const data = ev?.data;
    const sid = data?.sessionID;
    if (!isId(sid)) return;
    if (type === 'session.created' && isId(data.parentID) && !parents.has(sid)) parents.set(sid, data.parentID);
    detached(ensureStarted(sid));
    switch (type) {
      case 'session.execution.started':
        generations.set(sid, (generations.get(sid) ?? 0) + 1);
        lifecycle.set(sid, 'running');
        break;
      case 'session.execution.succeeded':
        lifecycle.set(sid, 'idle');
        enqueueTurnEnd(sid, {
          receivedAt: now(),
          hostCreatedAt: typeof ev.created === 'number' ? ev.created : undefined,
        });
        break;
      case 'session.execution.failed':
      case 'session.execution.interrupted':
        lifecycle.set(sid, 'idle');
        break;
      case 'session.compaction.started':
        detached(compact(sid));
        break;
      case 'session.compaction.ended':
        detached(setMark(sid));
        break;
      default:
    }
  }

  // A subagent launch result marks the child running only if none of its own events was seen.
  function noteLaunch(input: HostObject): void {
    if (input.tool !== 'subagent' || input.status !== 'completed') return;
    const meta = input.result?.metadata;
    if (!isId(meta?.sessionID) || meta.status !== 'running') return;
    if (!parents.has(meta.sessionID) && isId(input.sessionID)) parents.set(meta.sessionID, input.sessionID);
    if (!lifecycle.has(meta.sessionID)) lifecycle.set(meta.sessionID, 'running');
  }

  const register = async (target: HostObject, name: string, fn: (input: HostObject) => Promise<void>) => {
    try {
      await target.hook(name, fn);
    } catch {}
  };

  await register(ctx.tool, 'execute.before', async (input) => {
    let deny: string | undefined;
    try {
      if (disposed || !isObject(input) || !isId(input.sessionID)) return;
      const who = await begin(input.sessionID);
      const merged = await run(toToolEvent('tool.before', input, repoRoot), who);
      queueSystem(input.sessionID, merged.notices);
      if (typeof merged.deny === 'string' && !disposed) deny = merged.deny;
    } catch {}
    if (deny !== undefined) throw new Error(deny);
  });

  await register(ctx.tool, 'execute.after', async (input) => {
    try {
      if (!isObject(input) || !isId(input.sessionID)) return;
      noteLaunch(input);
      if (disposed) return;
      const who = await begin(input.sessionID);
      const merged = await run(toToolEvent('tool.after', input, repoRoot), who);
      if (disposed) return;
      if (input.status === 'completed' && isObject(input.result)) {
        if (!Array.isArray(input.result.content)) input.result.content = [];
        for (const text of unique([merged.context, merged.notices])) input.result.content.push({ type: 'text', text });
      } else {
        // A failed call's content cannot be appended: notices go to `system` at the next context
        // call, and context is reported as not delivered.
        const lost =
          typeof merged.context === 'string'
            ? `hook-runtime: the context from tool.after of the failed ${input.tool} call was not delivered.`
            : null;
        queueSystem(input.sessionID, merged.notices, lost);
      }
    } catch {}
  });

  await register(ctx.session, 'prompt', async (input) => {
    try {
      if (disposed || !isId(input?.sessionID)) return;
      const who = await begin(input.sessionID);
      const text = input.prompt?.text ?? input.prompt;
      const merged = await run({ type: 'prompt', host: HOST, prompt: typeof text === 'string' ? text : '' }, who);
      queueSystem(input.sessionID, merged.context, merged.notices);
    } catch {}
  });

  await register(ctx.session, 'context', async (input) => {
    try {
      if (disposed || !isObject(input) || !isId(input.sessionID)) return;
      const sid = input.sessionID;
      const who = await begin(sid);
      if (takeMark(sid, who)) await sessionStart(sid, who, true);
      flush(sid, input);
    } catch {}
  });

  const controller = new AbortController();
  detached(
    (async () => {
      for await (const ev of ctx.event.subscribe({ signal: controller.signal })) {
        if (disposed) break;
        try {
          onEvent(ev);
        } catch {}
      }
    })(),
  );

  // Stops dispatching and returns within 1 s. The supervisor keeps killing the running events'
  // process groups in the background and releases their gate locks only once the groups are gone.
  return async function dispose() {
    if (disposed) return;
    disposed = true;
    controller.abort();
    const closing = Promise.allSettled(handlers.map((h: HostObject) => Promise.resolve().then(() => h.close?.())));
    await within(() => closing, DISPOSE_MS);
  };
}
