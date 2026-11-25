// hook-runtime CLI (design D6 install/update/check, D3 capability report).
//   node <skill>/assets/hook-runtime/cli.mjs install [--repo DIR]
//   node <skill>/assets/hook-runtime/cli.mjs update [--repo DIR]
//   node .agents/harness/hook-runtime/cli.mjs check [--repo DIR]
//   node .agents/harness/hook-runtime/cli.mjs capabilities [--repo DIR]
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { capabilityReport } from './lib/capabilities.mts';
import { CLAUDE_EVENTS } from './lib/claude-adapter.mts';
import { loadSection } from './lib/config.mts';
import {
  checkTool, DEFAULT_CLAUDE_COMMAND, DEFAULT_OPENCODE_PLUGIN, ensureSection, installHookRuntime, requireNode22,
} from './lib/install.mts';
import { EVENTS, loadHandlers } from './lib/runtime.mts';
import type { HarnessEvent } from './lib/handler.types.mts';
import type { InstallMode } from './lib/install.mts';

interface Io {
  out: (s: string) => unknown;
  ok: (lines: string[]) => number;
  fail: (lines: string[]) => number;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = 'hook-runtime';
export const OWN_KEYS = Object.freeze(['deadlines']);
const USAGE = 'usage: node cli.mjs install|update|check|capabilities [--repo DIR]\n';

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// From the copied folder (<repo>/.agents/harness/hook-runtime) the repo is three levels up;
// otherwise the git checkout around the working directory.
function defaultRepo(): string {
  const harness = resolve(HERE, '..');
  if (basename(harness) === 'harness' && basename(resolve(harness, '..')) === '.agents') return resolve(harness, '..', '..');
  return git(['rev-parse', '--show-toplevel'], process.cwd()) || process.cwd();
}

// Errors in the own section of .agents/harness.json; other tools' keys are ignored. Throws on an
// unreadable or invalid file.
export function sectionErrors(repoRoot: string): string[] {
  const { section, errors } = loadSection<{ deadlines?: unknown }>(repoRoot, TOOL, { keys: [...OWN_KEYS] });
  const d = section.deadlines;
  if (d !== undefined) {
    if (!isObject(d)) {
      errors.push(`"${TOOL}.deadlines" must be an object of event: milliseconds`);
    } else {
      for (const [event, ms] of Object.entries(d)) {
        if (!EVENTS.includes(event as HarnessEvent)) errors.push(`unknown event "${event}" in "${TOOL}.deadlines" (allowed: ${EVENTS.join(', ')})`);
        else if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) errors.push(`"${TOOL}.deadlines.${event}" must be a positive number of milliseconds`);
      }
    }
  }
  return errors;
}

function install(repoRoot: string, mode: InstallMode, io: Io): number {
  const node = requireNode22();
  if (node) return io.fail([node]);
  if (git(['rev-parse', '--is-inside-work-tree'], repoRoot) !== 'true') return io.fail([`${repoRoot} is not a git work tree`]);
  let errors: string[];
  try {
    errors = sectionErrors(repoRoot);
  } catch (err) {
    return io.fail([errText(err)]);
  }
  if (errors.length) return io.fail(errors.map((e) => `.agents/harness.json: ${e}`));
  // Every refusal is decided before anything is written; the copies and the lock come last.
  const res = installHookRuntime({
    sourceDir: HERE, repoRoot, mode, events: CLAUDE_EVENTS,
    command: DEFAULT_CLAUDE_COMMAND, pluginPath: DEFAULT_OPENCODE_PLUGIN,
  });
  if (res.code !== 0) return io.fail(res.messages);
  const messages = [...res.messages];
  if (ensureSection(repoRoot, TOOL, {})) messages.push(`added "${TOOL}" to .agents/harness.json`);
  return io.ok(messages);
}

function check(repoRoot: string, io: Io): number {
  let issues: string[];
  try {
    issues = checkTool({ toolDir: HERE, repoRoot });
  } catch (err) {
    issues = [errText(err)];
  }
  try {
    issues.push(...sectionErrors(repoRoot).map((e) => `.agents/harness.json: ${e}`));
  } catch (err) {
    issues.push(errText(err));
  }
  if (issues.length) return io.fail(issues.map((i) => `${TOOL}: ${i}`));
  return io.ok([`${TOOL}: ok`]);
}

async function capabilities(repoRoot: string, io: Io): Promise<number> {
  const { handlers, problems } = await loadHandlers(repoRoot);
  try {
    io.out(capabilityReport(handlers));
    for (const p of problems) io.out(`${p}\n`);
  } finally {
    await Promise.allSettled(handlers.map((h) => h.close?.()));
  }
  return 0;
}

// main(argv, {out, err}) -> exit code
export async function main(
  argv: string[],
  {
    out = (s: string) => process.stdout.write(s),
    err = (s: string) => process.stderr.write(s),
  }: { out?: (s: string) => unknown; err?: (s: string) => unknown } = {},
): Promise<number> {
  const io: Io = {
    out,
    ok: (lines) => { for (const l of lines) out(`${l}\n`); return 0; },
    fail: (lines) => { for (const l of lines) err(`${l}\n`); return 1; },
  };
  const [command, ...rest] = argv;
  let repo: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--repo' && rest[i + 1] !== undefined) repo = resolve(rest[++i] as string);
    else return io.fail([`unknown argument ${rest[i]}`, USAGE.trim()]);
  }
  const repoRoot = repo ?? defaultRepo();
  switch (command) {
    case 'install':
    case 'update':
      return install(repoRoot, command, io);
    case 'check':
      return check(repoRoot, io);
    case 'capabilities':
      return capabilities(repoRoot, io);
    default:
      err(USAGE);
      return 2;
  }
}

const isScript = (() => {
  try {
    return process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (isScript) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (e) => { process.stderr.write(`${TOOL}: ${errText(e)}\n`); process.exitCode = 1; },
  );
}
