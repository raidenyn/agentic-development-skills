// Delivery at a skill, a `/<skill>` prompt or a successful command, the deny-once gate, and the
// capped join (design D4, ported from veles's scripts/agent_rules.py: _moment_rules, _capped_texts,
// _gate, _live). Pure: `decide` returns the next ledger and never mutates its arguments.
import { ruleText } from './rules.mts';
import type { Decision, Entry, Ledger } from './deliver.types.mts';
import type { EventPayload } from './handler.types.mts';
import type { Rule } from './rules.types.mts';

export const CONTEXT_CAP = 9000; // UTF-8 bytes of the emitted text
const RULE_SEPARATOR = '\n\n'; // one blank line between two rule texts

/** The `<name>` of a prompt whose first word is `/<name>`, or null. */
export function promptSkill(prompt: string): string | null {
  if (!prompt) return null;
  const match = /^\s*(\S+)/.exec(prompt);
  if (match === null) return null;
  const word = match[1] as string;
  if (!word.startsWith('/') || word.length < 2) return null;
  return word.slice(1);
}

/** The included rules and their joined text: each whole, in rule-name order, at most CONTEXT_CAP bytes. */
export function capped(items: [Rule, string][]): { included: Rule[]; text: string } {
  const included: Rule[] = [];
  const parts: string[] = [];
  let size = 0;
  const sorted = [...items].sort(([a], [b]) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const [rule, part] of sorted) {
    if (!part) continue; // unreachable for a parsed rule; a rule with no text is never credited
    const separator = parts.length > 0 ? RULE_SEPARATOR : '';
    const added = Buffer.byteLength(separator, 'utf8') + Buffer.byteLength(part, 'utf8');
    if (size + added > CONTEXT_CAP) continue;
    included.push(rule);
    parts.push(part);
    size += added;
  }
  return { included, text: parts.join(RULE_SEPARATOR) };
}

/** The entry for rule when it was recorded at the current generation, or null. */
function liveEntry(ledger: Ledger, rule: Rule): Entry | null {
  const entry = ledger.entries[rule.name];
  if (entry === undefined || entry.sha256 !== rule.sha256 || entry.generation < ledger.generation) return null;
  return entry;
}

// Whether the event's skill is one the rule's `skills` lists. A SKILL.md read also answers to each
// listed name's part after the last `:` (veles `_skill_dirs`); a Skill call matches exactly.
function skillMatches(rule: Rule, event: EventPayload): boolean {
  const skill = event.skill;
  if (skill === undefined) return false;
  if (rule.skills.includes(skill)) return true;
  if (event.skillVia !== 'read') return false;
  return rule.skills.some((name) => name.slice(name.lastIndexOf(':') + 1) === skill);
}

const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort();

// veles's SessionState.put: a live entry keeps its patterns and triggers and gains the new ones, and
// stays delivered once either step delivered; an entry of another generation is replaced.
function put(ledger: Ledger, rule: Rule, state: Entry['state'], patterns: string[], triggers: string[]): Ledger {
  const existing = liveEntry(ledger, rule);
  const entry: Entry = {
    sha256: rule.sha256,
    generation: ledger.generation,
    state: existing?.state === 'delivered' || state === 'delivered' ? 'delivered' : 'pending',
    patterns: sorted([...(existing?.patterns ?? []), ...patterns]),
    triggers: sorted([...(existing?.triggers ?? []), ...triggers]),
  };
  return { ...ledger, entries: { ...ledger.entries, [rule.name]: entry } };
}

// veles's _moment_rules: the rules and the triggers this event matched, sorted by rule name.
function momentMatches(rules: Rule[], event: EventPayload): [Rule, string[]][] {
  if (event.type === 'prompt') {
    const skill = promptSkill(event.prompt ?? '');
    if (skill === null) return [];
    const trigger = `skill:${skill}`;
    return rules.filter((rule) => rule.skills.includes(skill)).map((rule) => [rule, [trigger]]);
  }
  if (event.type !== 'tool.after' || event.ok !== true) return [];
  const command = event.tool?.kind === 'shell' && typeof event.command === 'string' ? event.command : null;
  const matches: [Rule, string[]][] = [];
  for (const rule of rules) {
    const triggers: string[] = [];
    if (skillMatches(rule, event)) triggers.push(`skill:${event.skill}`);
    if (command !== null) {
      for (const pattern of rule.commands) {
        if (pattern.regex.test(command)) triggers.push(`command:${pattern.source}`);
      }
    }
    if (triggers.length > 0) matches.push([rule, sorted(triggers)]);
  }
  return matches;
}

function moment(rules: Rule[], ledger: Ledger, event: EventPayload): Decision {
  const fresh: [Rule, string[]][] = [];
  for (const [rule, triggers] of momentMatches(rules, event)) {
    const entry = liveEntry(ledger, rule);
    if (entry !== null && entry.state === 'delivered' && triggers.every((trigger) => entry.triggers.includes(trigger)))
      continue;
    fresh.push([rule, triggers]);
  }
  const { included, text } = capped(fresh.map(([rule]) => [rule, ruleText(rule.body)] as [Rule, string]));
  if (included.length === 0) return { result: null, ledger };
  const matched = new Map(fresh);
  let next = ledger;
  for (const rule of included) {
    next = put(next, rule, 'delivered', liveEntry(next, rule)?.patterns ?? [], matched.get(rule) ?? []);
  }
  return { result: { context: text }, ledger: next };
}

// veles's _gate without the requires branch: deny once, confirm on a pending pattern, deny again
// with the union for another gate, and pass a delivered rule.
function gate(rules: Rule[], ledger: Ledger, event: EventPayload): Decision {
  const command = event.tool?.kind === 'shell' && typeof event.command === 'string' ? event.command : null;
  if (command === null) return { result: null, ledger };
  const denied = new Map<string, { rule: Rule; patterns: string[]; state: Entry['state'] }>();
  let next = ledger;
  for (const rule of rules) {
    const patterns = sorted(
      rule.gates.filter((pattern) => pattern.regex.test(command)).map((pattern) => pattern.source),
    );
    if (patterns.length === 0) continue;
    const entry = liveEntry(next, rule);
    if (entry === null) {
      denied.set(rule.name, { rule, patterns, state: 'pending' });
    } else if (entry.state === 'pending') {
      if (patterns.some((pattern) => entry.patterns.includes(pattern))) {
        next = put(next, rule, 'delivered', entry.patterns, []);
      } else {
        denied.set(rule.name, { rule, patterns: sorted([...patterns, ...entry.patterns]), state: 'pending' });
      }
    }
  }
  if (denied.size === 0) return { result: null, ledger: next };
  const { included, text } = capped(
    [...denied.values()].map(({ rule }) => [rule, ruleText(rule.body)] as [Rule, string]),
  );
  for (const rule of included) {
    const { patterns, state } = denied.get(rule.name) as { patterns: string[]; state: Entry['state'] };
    next = put(next, rule, state, patterns, []);
  }
  if (included.length === 0) return { result: null, ledger: next };
  return { result: { deny: text }, ledger: next };
}

/** The result of one event and the ledger to write; records nothing when the event is not a moment or a gate. */
export function decide(rules: Rule[], ledger: Ledger, event: EventPayload): Decision {
  switch (event.type) {
    case 'prompt':
    case 'tool.after':
      return moment(rules, ledger, event);
    case 'tool.before':
      return gate(rules, ledger, event);
    default:
      return { result: null, ledger };
  }
}
