// The hooked-rules handler (design D4, D5): delivers rule texts at a skill, a `/<skill>` prompt or
// a successful command, denies a gated command once, and keeps one ledger per agent context. Any
// failure passes the host's call with the manual text (design D6); the event budget stays the
// runtime default because the handler does no process work.
import { decide } from './lib/deliver.mts';
import { bump, withLedger } from './lib/ledger.mts';
import { loadRules } from './lib/rules.mts';
import type { DecisionResult, Ledger } from './lib/deliver.types.mts';
import type { EventPayload, Handler, HandlerContext, HandlerResult, WorkerContext } from './lib/handler.types.mts';
import type { RuleIssue, RuleLoad } from './lib/rules.types.mts';

type Ctx = HandlerContext & Partial<Pick<WorkerContext, 'lock'>> & { stateDir: string };
type LoadRules = (repoRoot: string) => RuleLoad;

const EVENTS: Handler['events'] = ['tool.before', 'tool.after', 'prompt', 'compact', 'session.start'];
const MANUAL = 'Read the hooked rules listed in AGENTS.md (.agents/hooked-rules/) by hand at the moments they name.';
const LOST = 'the ledger lock could not be won in time';

const issueKey = (issue: RuleIssue) => `${issue.path}: ${issue.message}`;
const expired = (ctx: Ctx) => ctx.signal.aborted || Date.now() >= ctx.deadline;
const isRoot = (ctx: Ctx) => (ctx.agentId ?? 'main') === 'main';

// A folder that cannot be read at all is not an invalid rule among valid siblings: it rejects, so the
// runtime emits its fail-open notice with this handler's manual. Individual file errors stay in the
// load result, so valid siblings keep delivering and the startup report names each bad file.
function loadChecked(load: LoadRules, ctx: Ctx): RuleLoad {
  const result = load(ctx.repoRoot);
  const failed = result.errors.find((issue) => issue.directory);
  if (failed) throw new Error(`${failed.path} ${failed.message}`);
  return result;
}

// The session-start report of the load errors this context has not been told about yet.
function reportText(errors: RuleIssue[]): string {
  const what = errors.length === 1 ? 'a rule file' : `${errors.length} rule files`;
  const verb = errors.length === 1 ? 'was' : 'were';
  const fix = errors.length === 1 ? 'it' : 'them';
  const lines = errors.map((issue) => `- ${issueKey(issue)}`).join('\n');
  return `hooked-rules: ${what} could not be read and ${verb} skipped; fix ${fix} so the rules deliver again:\n\n${lines}\n\n${MANUAL}`;
}

const resultOf = (value: DecisionResult): HandlerResult | null => {
  if (value === null) return null;
  return 'deny' in value ? { deny: value.deny } : { context: value.context };
};

/** The hooked-rules handler; `loadRules` lets a test supply the rules it matches. */
export function createHookedRulesHandler({ loadRules: load = loadRules }: { loadRules?: LoadRules } = {}): Handler {
  // A moment or a gate: decide on the ledger under its lock, then record what the call decided. The
  // deadline and abort check sits right before the write, so a result the runtime drops is not
  // recorded as delivered. A match or persistence failure rejects, so the runtime shows the manual
  // notice and the host's call still passes. Most shell events match no rule: an unlocked read proves
  // that and skips the lock, so a sibling shell call cannot contend for it.
  const deliver = (stateDir: string, event: EventPayload, ctx: Ctx) => {
    const check = (ledger: Ledger) => decide(loadChecked(load, ctx).rules, ledger, event);
    return withLedger<DecisionResult>(
      stateDir,
      (ledger, locked) => {
        const decision = check(ledger);
        if (!locked) {
          // A lost lock must not swallow a gate: the runtime's failure notice names the manual. A
          // moment still returns its context, which costs at most a second delivery in that event.
          if (decision.result !== null && 'deny' in decision.result) throw new Error(LOST);
          if (expired(ctx)) return null;
          return { ledger, value: decision.result };
        }
        if (expired(ctx)) return null;
        return { ledger: decision.ledger, value: decision.result };
      },
      {
        live: () => !expired(ctx),
        lock: ctx.lock,
        skip: (ledger, corrupt) => {
          if (expired(ctx)) return true;
          if (corrupt) return false;
          const decision = check(ledger);
          return decision.result === null && decision.ledger === ledger;
        },
      },
    ).then(resultOf);
  };

  // The startup diagnostic is not a moment: it waits until its keys can be recorded, so a lock
  // timeout cannot show the same report at the next session start.
  const report = (stateDir: string, ctx: Ctx) =>
    withLedger<DecisionResult>(
      stateDir,
      (ledger, locked) => {
        if (!locked) return null;
        if (expired(ctx)) return null;
        const { errors } = loadChecked(load, ctx);
        const fresh = errors.filter((issue) => !ledger.reported.includes(issueKey(issue)));
        if (fresh.length === 0) return { ledger, value: null };
        const value: DecisionResult = { context: reportText(fresh) };
        return { ledger: { ...ledger, reported: [...ledger.reported, ...fresh.map(issueKey)] }, value };
      },
      { live: () => !expired(ctx), lock: ctx.lock },
    ).then(resultOf);

  return {
    name: 'hooked-rules',
    events: [...EVENTS],
    manual: MANUAL,
    async handle(event: EventPayload, ctx: Ctx) {
      const stateDir = ctx?.stateDir;
      if (typeof stateDir !== 'string' || stateDir === '') return null;
      switch (event?.type) {
        case 'compact':
          await bump(stateDir, { signal: ctx.signal, deadline: ctx.deadline });
          return null;
        case 'session.start':
          // OpenCode emits session.start for each child session too; only the main context reports.
          if (event.afterCompact) {
            await bump(stateDir, { signal: ctx.signal, deadline: ctx.deadline });
            return null;
          }
          if (!isRoot(ctx)) return null;
          return report(stateDir, ctx);
        case 'tool.before':
          // A gate is checked on a shell command only; an edit or read call never denies.
          if (event.tool?.kind !== 'shell') return null;
          return deliver(stateDir, event, ctx);
        case 'tool.after':
          if (event.ok !== true) return null;
          return deliver(stateDir, event, ctx);
        case 'prompt':
          return deliver(stateDir, event, ctx);
        default:
          return null;
      }
    },
  };
}

export default createHookedRulesHandler();
