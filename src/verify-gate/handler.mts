// The verify gate handler (design D5): one configured command on an edit, on a ticked task and at
// every turn end, with the no-change shortcut, bounded blocks and the verify-pass proof. It runs in a
// hook-runtime worker; `context.spawn` and `context.lock` go through the supervisor. In process
// (tests) it falls back to a local spawn and the local gate lock.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHarnessConfig } from './lib/config.mts';
import {
  chargeBlock,
  confirmCharge,
  CONFIG_KEYS,
  CONTENDED,
  DEFAULTS,
  failureKey,
  localLock,
  localSpawn,
  MANUAL,
  normalizeConfig,
  readJson,
  refundCharge,
  REQUIRED_KEYS,
  resolveConfig,
  runGate,
  verifyPass,
  waitLock,
} from './lib/gate.mts';
import { commonSessionDir, writeJsonAtomic } from './lib/state.mts';
import { detectTicks, itemCounts, matchesGlob, suppressSeen } from './lib/triggers.mts';
import type {
  EventPayload,
  Handler,
  HandlerContext,
  HandlerResult,
  HarnessEvent,
  WorkerContext,
} from './lib/handler.types.mts';
import type { Failure, GateResult } from './lib/gate.mts';
import type { Counts } from './lib/triggers.mts';

type Ctx = HandlerContext & Partial<Pick<WorkerContext, 'spawn' | 'lock'>> & { stateDir: string };
type Deps = Record<string, unknown>;
type Trace = (outcome: string) => void;
type Snapshot = { version: number; files: Record<string, Record<string, any>> };
type Tick = { path: string; key: string };

export { CONFIG_KEYS, failureKey, REQUIRED_KEYS, runGate };
export { normalizeTail } from './lib/gate.mts';

const EVENTS: HarnessEvent[] = ['session.start', 'tool.before', 'tool.after', 'turn.end'];
const CALL_MAX_AGE_MS = 3600 * 1000; // before-images whose tool.after never came
const TICK_KEEP_MS = 24 * 3600 * 1000;
const RUN_MARGIN_MS = 1000; // the gate returns this long before the handler deadline
const CLEANUP_MS = 5000;
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const HERE = dirname(fileURLToPath(import.meta.url));

// The state layout (hook-runtime lib/state.mjs): <tool>/sessions/<host>-<session>/<agent>. The block
// ledger is the session's across worktrees: <git common dir>/agent-harness/verify-gate/sessions/
// <host>-<session>, which is the root session folder in a main checkout.
const toolDirOf = (ctx: Ctx) => resolve(ctx.stateDir, '..', '..', '..');
const ledgerDirOf = (ctx: Ctx) =>
  commonSessionDir({ repoRoot: ctx.repoRoot, tool: 'verify-gate', host: ctx.host, sessionId: ctx.sessionId });
const callFile = (ctx: Ctx, callId: unknown) =>
  join(ctx.stateDir, 'calls', `${String(callId).replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
const services = (ctx: Ctx) => ({ spawn: ctx.spawn ?? localSpawn, lock: ctx.lock ?? localLock });

// timeoutSeconds from the installed copy's repo (<repo>/.agents/harness/verify-gate), else 900.
function installedTimeoutSeconds(): number {
  if (basename(dirname(HERE)) !== 'harness' || basename(resolve(HERE, '..', '..')) !== '.agents')
    return DEFAULTS.timeoutSeconds;
  try {
    return normalizeConfig(readHarnessConfig(resolve(HERE, '..', '..', '..'))['verify-gate']).timeoutSeconds;
  } catch {
    return DEFAULTS.timeoutSeconds;
  }
}

// ---- task files and before-images ---------------------------------------------------------------

function listTaskFiles(repoRoot: string, patterns: readonly string[]): string[] {
  const out = new Set<string>();
  const entries = (dir: string) => {
    try {
      return readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  };
  for (const pattern of patterns) {
    const segs = String(pattern)
      .replace(/\\/g, '/')
      .split('/')
      .filter((s) => s && s !== '.');
    const walk = (dir: string, i: number, rel: string): void => {
      if (i === segs.length) {
        try {
          if (statSync(dir).isFile()) out.add(rel);
        } catch {}
        return;
      }
      const seg = segs[i] as string;
      const sub = (name: string) => (rel ? `${rel}/${name}` : name);
      if (seg === '**') {
        walk(dir, i + 1, rel);
        for (const e of entries(dir))
          if (e.isDirectory() && !SKIP_DIRS.has(e.name)) walk(join(dir, e.name), i, sub(e.name));
      } else if (!/[*?]/.test(seg)) {
        walk(join(dir, seg), i + 1, sub(seg));
      } else {
        for (const e of entries(dir))
          if (!SKIP_DIRS.has(e.name) && matchesGlob(seg, e.name)) walk(join(dir, e.name), i + 1, sub(e.name));
      }
    };
    walk(repoRoot, 0, '');
  }
  return [...out].sort();
}

function countsOf(repoRoot: string, rel: string): Record<string, Counts> {
  try {
    return Object.fromEntries(itemCounts(readFileSync(join(repoRoot, rel), 'utf8')));
  } catch {
    return {};
  }
}

function pruneCalls(dir: string, now: number = Date.now()): void {
  for (const name of (() => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  })()) {
    const f = join(dir, name);
    try {
      if (now - statSync(f).mtimeMs > CALL_MAX_AGE_MS) rmSync(f, { force: true });
    } catch {}
  }
}

// Every agent's calls folder in every session of this worktree.
function pruneAllCalls(toolDir: string): void {
  const sessions = join(toolDir, 'sessions');
  for (const s of (() => {
    try {
      return readdirSync(sessions);
    } catch {
      return [];
    }
  })()) {
    for (const a of (() => {
      try {
        return readdirSync(join(sessions, s));
      } catch {
        return [];
      }
    })())
      pruneCalls(join(sessions, s, a, 'calls'));
  }
}

// A read-only scan, never under the lock (design D5 "Before").
function writeBeforeImage(event: EventPayload, ctx: Ctx): void {
  const cfg = normalizeConfig(ctx.config);
  const dir = join(ctx.stateDir, 'calls');
  mkdirSync(dir, { recursive: true });
  pruneCalls(dir);
  const at = Date.now();
  const files: Record<string, Record<string, Counts>> = {};
  for (const rel of listTaskFiles(ctx.repoRoot, cfg.taskFiles)) files[rel] = countsOf(ctx.repoRoot, rel);
  writeJsonAtomic(callFile(ctx, event.tool!.callId), { version: 1, at, files });
}

const emptySnapshot = (): Snapshot => ({ version: 1, files: {} });
function readSnapshot(toolDir: string): Snapshot {
  const v = readJson(join(toolDir, 'tasks.json'));
  return v && typeof v.files === 'object' && v.files ? v : emptySnapshot();
}

// session.start: create tasks.json if absent, when the lock is free right now.
async function ensureSnapshot(ctx: Ctx): Promise<void> {
  const toolDir = toolDirOf(ctx);
  const file = join(toolDir, 'tasks.json');
  if (existsSync(file)) return;
  mkdirSync(toolDir, { recursive: true });
  const held = await services(ctx).lock.acquire(toolDir);
  if (!held) return;
  try {
    if (existsSync(file)) return;
    const snap = emptySnapshot();
    for (const rel of listTaskFiles(ctx.repoRoot, normalizeConfig(ctx.config).taskFiles)) {
      snap.files[rel] = Object.fromEntries(
        Object.entries(countsOf(ctx.repoRoot, rel)).map(([k, c]) => [k, { ...c, ticks: [] }]),
      );
    }
    writeJsonAtomic(file, snap);
  } finally {
    await held.release();
  }
}

// The ticks of this call, minus ticks of the same items recorded after its before-image. Returns
// {ticks: [{path, key}]} or {contended: true}.
async function detect(
  event: EventPayload,
  ctx: Ctx,
  until: number,
): Promise<{ ticks: Tick[]; contended?: undefined } | { contended: true; ticks?: undefined }> {
  const image = event.tool?.callId != null ? readJson(callFile(ctx, event.tool.callId)) : null;
  if (!image?.files) return { ticks: [] };
  const raw: Tick[] = [];
  const afterCounts: Record<string, Record<string, Counts>> = {};
  for (const [rel, before] of Object.entries(image.files)) {
    afterCounts[rel] = countsOf(ctx.repoRoot, rel);
    for (const key of detectTicks(before, afterCounts[rel])) raw.push({ path: rel, key });
  }
  const done = () => rmSync(callFile(ctx, event.tool!.callId), { force: true });
  if (!raw.length) {
    done();
    return { ticks: [] };
  }
  const toolDir = toolDirOf(ctx);
  const held = await waitLock(services(ctx).lock, toolDir, until, { signal: ctx.signal });
  if (!held) return { contended: true };
  try {
    const snap = readSnapshot(toolDir);
    const now = Date.now();
    const ticks: Tick[] = [];
    for (const rel of Object.keys(afterCounts)) {
      const keys = raw.filter((t) => t.path === rel).map((t) => t.key);
      const entry = snap.files[rel] ?? {};
      for (const key of suppressSeen(keys, snap, image.at, rel)) {
        entry[key] ??= { ticked: 0, unticked: 0, ticks: [] };
        entry[key].ticks.push(now);
        ticks.push({ path: rel, key });
      }
      for (const [key, rec] of Object.entries(entry)) {
        const c = afterCounts[rel]![key] ?? { ticked: 0, unticked: 0 };
        entry[key] = {
          ticked: c.ticked,
          unticked: c.unticked,
          ticks: (rec.ticks ?? []).filter((at: number) => now - at < TICK_KEEP_MS),
        };
      }
      snap.files[rel] = entry;
    }
    writeJsonAtomic(join(toolDir, 'tasks.json'), snap);
    done();
    return { ticks };
  } finally {
    await held.release();
  }
}

// ---- runs ---------------------------------------------------------------------------------------

function gateOptions(ctx: Ctx, deps: Deps) {
  const { spawn, lock } = services(ctx);
  return {
    repoRoot: ctx.repoRoot,
    config: ctx.config,
    stateDir: toolDirOf(ctx),
    signal: ctx.signal,
    deadline: ctx.deadline - RUN_MARGIN_MS,
    cleanupDeadline: ctx.deadline + CLEANUP_MS,
    spawn,
    lock,
    ...deps,
  };
}

const body = (r: GateResult) => `${r.detail}.${r.tail ? `\n\n${r.tail}` : ''}`;

async function afterTool(event: EventPayload, ctx: Ctx, deps: Deps, trace: Trace): Promise<HandlerResult | null> {
  const kind = event.tool?.kind;
  if (kind !== 'shell' && kind !== 'edit') return null;
  const cfg = resolveConfig(ctx.config);
  const cmd = cfg.command.join(' ');
  const found = await detect(event, ctx, ctx.deadline - RUN_MARGIN_MS);
  if (found.contended) {
    trace('contended');
    return { context: CONTENDED };
  }
  if (found.ticks!.length) {
    const r = await runGate({ ...gateOptions(ctx, deps), trigger: 'task' });
    trace(r.status === 'skipped' ? 'no-change' : r.status === 'contended' ? 'contended' : 'ran');
    if (r.status === 'contended') return { context: CONTENDED };
    if (r.status !== 'failed') return null;
    const items = found.ticks!.map((t) => `"${t.key}" in ${t.path}`).join(', ');
    return {
      context: `verify: a task was ticked while verification fails. Ticked: ${items}. ${cmd} failed: ${body(r)}`,
    };
  }
  if (kind !== 'edit') return null;
  const texts: string[] = [];
  let ran = false;
  let contended = false;
  for (const file of event.files ?? []) {
    const r = await runGate({ ...gateOptions(ctx, deps), trigger: 'edit', file });
    if (r.status === 'contended') contended = true;
    if (r.status === 'passed' || r.status === 'failed') ran = true;
    if (r.status === 'failed') texts.push(`verify: ${cmd} failed after the edit of ${file}: ${body(r)}`);
  }
  if (!(event.files ?? []).length) return null;
  trace(ran ? 'ran' : contended ? 'contended' : 'no-change');
  if (contended) texts.push(CONTENDED);
  return texts.length ? { context: texts.join('\n\n') } : null;
}

async function turnEnd(event: EventPayload, ctx: Ctx, deps: Deps, trace: Trace): Promise<HandlerResult | null> {
  const cfg = resolveConfig(ctx.config);
  const cmd = cfg.command.join(' ');
  const root = (ctx.agentId ?? 'main') === 'main';
  const background = Number.isInteger(event.background) ? (event.background as number) : 0;
  const { lock } = services(ctx);
  const sessionDir = ledgerDirOf(ctx);
  const max = cfg.maxBlocks;
  // A root turn end with running subagents is a notice and is never charged.
  const charging = !(root && background > 0);
  const onFailure = charging
    ? async (failure: Failure) => ({
        charge: await chargeBlock({ lock, sessionDir, key: failureKey(failure, ctx.repoRoot), max }),
      })
    : undefined;
  const r = await runGate({ ...gateOptions(ctx, deps), trigger: 'turn-end', onFailure });
  trace(r.status === 'skipped' ? 'no-change' : r.status === 'contended' ? 'contended' : 'ran');
  if (r.status === 'contended') return { context: CONTENDED };
  if (r.status !== 'failed' || r.aborted) return null;
  if (!charging) {
    return {
      context: `verify: ${cmd} fails while ${background} subagent(s) still run; verification runs again at the next turn end. ${body(r)}`,
    };
  }
  const c = r.charge as { charged?: boolean; busy?: boolean; limit?: number; n?: number; id: string } | undefined;
  if (c?.busy) {
    return {
      context: `verify: ${cmd} failed, and the block counter was busy, so this turn end is not blocked. ${MANUAL}\n\n${cmd} failed: ${body(r)}`,
    };
  }
  if (!c?.charged) {
    return {
      context: `verify: still failing after ${c?.limit ?? max} blocks; continuing. ${MANUAL}\n\n${cmd} failed: ${body(r)}`,
    };
  }
  return {
    block: `verify: ${cmd} failed (attempt ${c!.n} of ${max}). Fix the failure before ending the turn: ${body(r)}`,
    ack: () => confirmCharge({ lock, sessionDir, id: c!.id }),
    release: () => refundCharge({ lock, sessionDir, id: c!.id }),
  };
}

export function createVerifyHandler({
  runCommand,
  contentKey,
  changedFiles,
  timeoutSeconds,
}: {
  runCommand?: unknown;
  contentKey?: unknown;
  changedFiles?: unknown;
  timeoutSeconds?: number;
} = {}): Handler {
  const deps = Object.fromEntries(Object.entries({ runCommand, contentKey, changedFiles }).filter(([, v]) => v));
  const budget = (timeoutSeconds ?? installedTimeoutSeconds()) * 1000 + 10000;
  return {
    name: 'verify-gate',
    events: [...EVENTS],
    timeouts: { 'tool.after': budget, 'turn.end': budget },
    manual: MANUAL,
    proofs: {
      'verify-pass': (ctx: HandlerContext) =>
        verifyPass({
          repoRoot: ctx.repoRoot,
          config: ctx.config,
          stateDir: toolDirOf(ctx as Ctx),
          signal: ctx.signal,
          deadline: ctx.deadline,
          ...services(ctx as Ctx),
          ...(deps.contentKey ? { contentKey: deps.contentKey as never } : {}),
        }),
    },
    async handle(event: EventPayload, ctx: Ctx) {
      const trace = (o: string) => ctx.trace?.(o);
      switch (event?.type) {
        case 'session.start':
          pruneAllCalls(toolDirOf(ctx));
          await ensureSnapshot(ctx);
          return null;
        case 'tool.before':
          if ((event.tool?.kind === 'shell' || event.tool?.kind === 'edit') && event.tool.callId != null)
            writeBeforeImage(event, ctx);
          return null;
        case 'tool.after':
          return afterTool(event, ctx, deps, trace);
        case 'turn.end':
          return turnEnd(event, ctx, deps, trace);
        default:
          return null;
      }
    },
  };
}

export default createVerifyHandler();
