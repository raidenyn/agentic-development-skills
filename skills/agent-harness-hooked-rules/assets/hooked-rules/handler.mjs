// Generated from src/hooked-rules/handler.mts by scripts/build.mts. Do not edit.
// The hooked-rules handler (design D4, D5): delivers rule texts at a skill, a `/<skill>` prompt or
// a successful command, denies a gated command once, and keeps one ledger per agent context. Any
// failure passes the host's call with the manual text (design D6); the event budget stays the
// runtime default because the handler does no process work.
import { decide } from './lib/deliver.mjs';
import { bump, withLedger } from './lib/ledger.mjs';
import { loadRules } from './lib/rules.mjs';

const EVENTS = ['tool.before', 'tool.after', 'prompt', 'compact', 'session.start'];
const MANUAL = 'Read the hooked rules listed in AGENTS.md (.agents/hooked-rules/) by hand at the moments they name.';

const issueKey = (issue) => `${issue.path}: ${issue.message}`;
const expired = (ctx) => ctx.signal.aborted || Date.now() >= ctx.deadline;
const isRoot = (ctx) => (ctx.agentId ?? 'main') === 'main';

// The session-start report of the load errors this context has not been told about yet.
function reportText(errors) {
  const what = errors.length === 1 ? 'a rule file' : `${errors.length} rule files`;
  const verb = errors.length === 1 ? 'was' : 'were';
  const fix = errors.length === 1 ? 'it' : 'them';
  const lines = errors.map((issue) => `- ${issueKey(issue)}`).join('\n');
  return `hooked-rules: ${what} could not be read and ${verb} skipped; fix ${fix} so the rules deliver again:\n\n${lines}`;
}

const resultOf = (value) => {
  if (value === null) return null;
  return 'deny' in value ? { deny: value.deny } : { context: value.context };
};

// Without the lock a deny is dropped, so a contended gate can never block the call.
const withoutDeny = (value) => (value !== null && 'deny' in value ? null : value);

/** The hooked-rules handler; `loadRules` lets a test supply the rules it matches. */
export function createHookedRulesHandler({ loadRules: load = loadRules } = {}) {
  // A moment or a gate: decide on the ledger under its lock, then record what the call decided. The
  // deadline and abort check sits right before the write, so a result the runtime drops is not
  // recorded as delivered. A match or persistence failure rejects, so the runtime shows the manual
  // notice and the host's call still passes.
  const deliver = (stateDir, event, ctx) =>
    withLedger(stateDir, (ledger, locked) => {
      const decision = decide(load(ctx.repoRoot).rules, ledger, event);
      if (expired(ctx)) return null;
      if (!locked) return { ledger, value: withoutDeny(decision.result) };
      return { ledger: decision.ledger, value: decision.result };
    }).then(resultOf);

  // The startup diagnostic is not a moment: it waits until its keys can be recorded, so a lock
  // timeout cannot show the same report at the next session start.
  const report = (stateDir, errors, ctx) =>
    withLedger(stateDir, (ledger, locked) => {
      if (!locked) return null;
      if (expired(ctx)) return null;
      const fresh = errors.filter((issue) => !ledger.reported.includes(issueKey(issue)));
      if (fresh.length === 0) return { ledger, value: null };
      const value = { context: reportText(fresh) };
      return { ledger: { ...ledger, reported: [...ledger.reported, ...fresh.map(issueKey)] }, value };
    }).then(resultOf);

  return {
    name: 'hooked-rules',
    events: [...EVENTS],
    manual: MANUAL,
    async handle(event, ctx) {
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
          return report(stateDir, load(ctx.repoRoot).errors, ctx);
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
