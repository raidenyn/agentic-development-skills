// Capability fixture handler (test only): exercises the five capabilities through either adapter.
// - tool.before: denies a shell command that contains HARNESS_DENY.
// - tool.after: adds `HARNESS_AFTER <agentId> <count>`; the count lives in the agent's state folder.
// - turn.end: blocks the first turn end of each agent with HARNESS_BLOCK, then returns null.
// - session.start with afterCompact: re-delivers HARNESS_REDELIVER.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function bump(stateDir) {
  const file = join(stateDir, 'after-count');
  const count = (existsSync(file) ? Number(readFileSync(file, 'utf8')) || 0 : 0) + 1;
  writeFileSync(file, String(count));
  return count;
}

export default {
  name: 'capability-fixture',
  events: ['tool.before', 'tool.after', 'turn.end', 'session.start'],
  handle(event, ctx) {
    switch (event.type) {
      case 'tool.before':
        return event.tool?.kind === 'shell' && String(event.command ?? '').includes('HARNESS_DENY')
          ? { deny: 'HARNESS_DENY: capability-fixture denied this command' }
          : null;
      case 'tool.after':
        return { context: `HARNESS_AFTER ${ctx.agentId} ${bump(ctx.stateDir)}` };
      case 'turn.end': {
        const file = join(ctx.stateDir, 'blocked');
        if (existsSync(file)) return null;
        writeFileSync(file, 'yes');
        return { block: 'HARNESS_BLOCK' };
      }
      case 'session.start':
        return event.afterCompact ? { context: 'HARNESS_REDELIVER' } : null;
      default:
        return null;
    }
  },
};
