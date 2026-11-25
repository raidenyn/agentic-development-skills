// Capability report (design D3): the five capabilities per host adapter, the host version each was
// live-verified on (spike.md), and which installed handler events need a capability a host lacks.

import type { Handler } from './handler.types.mts';

type CapabilityTable = Record<string, Record<string, boolean | string>>;

export const CAPABILITIES = Object.freeze([
  'deny',
  'contextAfterTool',
  'blockTurnEnd',
  'redeliverAfterCompact',
  'perSubagentState',
]);

const ALL = {
  deny: true,
  contextAfterTool: true,
  blockTurnEnd: true,
  redeliverAfterCompact: true,
  perSubagentState: true,
};

export const HOST_CAPABILITIES: CapabilityTable = Object.freeze({
  'claude-code': Object.freeze({ ...ALL, verified: '2.1.332' }),
  opencode: Object.freeze({ ...ALL, verified: '2.4.1' }),
});

export const EVENT_NEEDS: Readonly<Record<string, string>> = Object.freeze({
  'tool.before': 'deny',
  'tool.after': 'contextAfterTool',
  'turn.end': 'blockTurnEnd',
  'session.start': 'redeliverAfterCompact',
});

// One line per (handler, event) whose capability `host` lacks; an unknown host lacks everything.
export function missingCapabilities(
  host: string,
  handlers: readonly Pick<Handler, 'name' | 'events'>[] | null | undefined,
  table: CapabilityTable = HOST_CAPABILITIES,
): string[] {
  const caps = table?.[host] ?? {};
  const out: string[] = [];
  for (const h of [...(handlers ?? [])].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    for (const event of Array.isArray(h.events) ? h.events : []) {
      const need = EVENT_NEEDS[event];
      if (need && caps[need] !== true) out.push(`${h.name} needs ${need} for ${event}, which ${host} lacks`);
    }
  }
  return out;
}

// The context line added at session.start, or null when nothing is missing.
export function capabilityNotice(
  host: string,
  handlers: readonly Pick<Handler, 'name' | 'events'>[] | null | undefined,
  table: CapabilityTable = HOST_CAPABILITIES,
): string | null {
  const lines = missingCapabilities(host, handlers, table);
  return lines.length ? `hook-runtime: ${lines.join('; ')}. Do these steps by hand.` : null;
}

export function capabilityReport(
  handlers: readonly Pick<Handler, 'name' | 'events'>[],
  table: CapabilityTable = HOST_CAPABILITIES,
): string {
  const out: string[] = [];
  const missing: string[] = [];
  for (const host of Object.keys(table)) {
    out.push(`${host} (verified on ${table[host]!.verified ?? 'unknown'})`);
    for (const cap of CAPABILITIES)
      out.push(`  ${cap.padEnd(24)}${table[host]![cap] === true ? 'supported' : 'missing'}`);
    for (const line of missingCapabilities(host, handlers, table)) missing.push(`  ${line}`);
  }
  if (missing.length) out.push('Handler events that need a missing capability:', ...missing);
  else out.push('Handler events that need a missing capability: none');
  return `${out.join('\n')}\n`;
}
