// Shared set-up for the verify gate tests: a temp repo whose verify command is `verify.sh` in the
// git dir (outside the hashed tree). The script logs its handover env to `verify.log` and exits per
// control files, all in the git dir: `verify.exit` (exit code), `verify.out` (printed), `verify.sleep`
// (seconds), `verify.touch` (a repo-relative path the command writes, changing the tree).
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, directSpawn, runNode, tempRepo } from './helpers.mjs';

const lib = (f) => import(pathToFileURL(join(ASSETS.verifyGate, 'lib', f)).href);
const { sessionStateDir, toolStateDir } = await lib('state.mjs');
const { readHarnessConfig } = await lib('config.mjs');

export const VERIFY_SH = `#!/bin/sh
G="$(dirname "$0")"
if [ -n "$VERIFY_CHANGED_FILES" ] && [ -f "$VERIFY_CHANGED_FILES" ]; then CH="$(tr '\\n' ',' < "$VERIFY_CHANGED_FILES")"; else CH="<none>"; fi
printf '%s\\t%s\\t%s\\t%s\\t%s\\n' "$VERIFY_TRIGGER" "\${VERIFY_FILE-<unset>}" "$VERIFY_BASE" "$VERIFY_CHANGED_FILES" "$CH" >> "$G/verify.log"
[ -f "$G/verify.out" ] && cat "$G/verify.out"
[ -f "$G/verify.touch" ] && date +%s%N > "$(cat "$G/verify.touch")"
[ -f "$G/verify.sleep" ] && sleep "$(cat "$G/verify.sleep")"
exit "$(cat "$G/verify.exit" 2>/dev/null || echo 0)"
`;

export async function verifyRepo({ files = {}, config = {}, commit = true } = {}) {
  const r = await tempRepo({ files });
  const gitDir = r.git('rev-parse', '--absolute-git-dir').trim();
  const script = join(gitDir, 'verify.sh');
  writeFileSync(script, VERIFY_SH);
  chmodSync(script, 0o755);
  const section = { command: ['sh', script], base: 'main', ...config };
  await r.write('.agents/harness.json', `${JSON.stringify({ 'verify-gate': section }, null, 2)}\n`);
  if (commit) {
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'config');
  }
  const ctl = (name) => join(gitDir, name);
  return {
    ...r,
    gitDir,
    script,
    toolDir: join(gitDir, 'agent-harness', 'verify-gate'),
    setExit: (code) => writeFileSync(ctl('verify.exit'), String(code)),
    setOut: (text) => writeFileSync(ctl('verify.out'), text),
    setSleep: (s) => (s ? writeFileSync(ctl('verify.sleep'), String(s)) : rmSync(ctl('verify.sleep'), { force: true })),
    setTouch: (rel) =>
      rel ? writeFileSync(ctl('verify.touch'), join(r.dir, rel)) : rmSync(ctl('verify.touch'), { force: true }),
    fail: (text = 'E101 something broke\n') => {
      writeFileSync(ctl('verify.exit'), '1');
      writeFileSync(ctl('verify.out'), text);
    },
    pass: () => {
      writeFileSync(ctl('verify.exit'), '0');
      rmSync(ctl('verify.out'), { force: true });
    },
    log: () => {
      if (!existsSync(ctl('verify.log'))) return [];
      return readFileSync(ctl('verify.log'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [trigger, file, base, changedPath, changed] = l.split('\t');
          return {
            trigger,
            file,
            base,
            changedPath,
            changed: changed === '<none>' ? null : changed.split(',').filter(Boolean),
          };
        });
    },
    setConfig: async (patch) => {
      const cfg = readHarnessConfig(r.dir);
      cfg['verify-gate'] = { ...cfg['verify-gate'], ...patch };
      await r.write('.agents/harness.json', `${JSON.stringify(cfg, null, 2)}\n`);
    },
    passRecord: () => {
      const f = join(gitDir, 'agent-harness', 'verify-gate', 'pass.json');
      return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
    },
    blocks: (host = 'claude-code', session = 's1') => {
      const f = join(gitDir, 'agent-harness', 'verify-gate', 'sessions', `${host}-${session}`, 'blocks.json');
      return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
    },
  };
}

// Calls a handler in process with a worker-like context (directSpawn as `spawn`, no `lock`, so the
// gate falls back to the local gate lock).
/** @param {any} handler @param {any} r @param {any} event @param {{ agentId?: string, sessionId?: string, host?: string, budgetMs?: number, signal?: AbortSignal, spawn?: Function, lock?: object }} [opts] */
export async function fire(
  handler,
  r,
  event,
  {
    agentId = 'main',
    sessionId = 's1',
    host = 'claude-code',
    budgetMs = 60000,
    signal,
    spawn = directSpawn,
    lock,
  } = {},
) {
  const traced = [];
  const ctx = {
    repoRoot: r.dir,
    host,
    sessionId,
    agentId,
    deadline: Date.now() + budgetMs,
    signal: signal ?? new AbortController().signal,
    stateDir: sessionStateDir({ repoRoot: r.dir, tool: 'verify-gate', host, sessionId, agentId }),
    config: readHarnessConfig(r.dir)['verify-gate'] ?? {},
    trace: (o) => traced.push(o),
    proof: async () => null,
    spawn,
    ...(lock ? { lock } : {}),
  };
  const result = await handler.handle(structuredClone(event), ctx);
  return { result, traced, ctx };
}

export function proofCtx(r, { budgetMs = 10000, host = 'claude-code', sessionId = 's1' } = {}) {
  return {
    repoRoot: r.dir,
    host,
    sessionId,
    agentId: 'main',
    deadline: Date.now() + budgetMs,
    signal: new AbortController().signal,
    stateDir: sessionStateDir({ repoRoot: r.dir, tool: 'verify-gate', host, sessionId, agentId: 'main' }),
    config: readHarnessConfig(r.dir)['verify-gate'] ?? {},
    spawn: directSpawn,
  };
}

export const edit = (files, callId = 'c-edit') => ({
  type: 'tool.after',
  host: 'claude-code',
  tool: { name: 'Edit', kind: 'edit', input: {}, callId },
  files,
});
export const editBefore = (files, callId = 'c-edit') => ({
  type: 'tool.before',
  host: 'claude-code',
  tool: { name: 'Edit', kind: 'edit', input: {}, callId },
  files,
});
export const shellBefore = (callId, command = 'sed -i') => ({
  type: 'tool.before',
  host: 'claude-code',
  tool: { name: 'Bash', kind: 'shell', input: { command }, callId },
  command,
});
export const shellAfter = (callId, command = 'sed -i') => ({
  type: 'tool.after',
  host: 'claude-code',
  tool: { name: 'Bash', kind: 'shell', input: { command }, callId },
  command,
});
export const turnEnd = (background = 0) => ({ type: 'turn.end', host: 'claude-code', background });

// Installs hook-runtime and verify-gate through their CLIs and sets the verify command.
export async function installBoth(r) {
  const hr = await runNode(join(ASSETS.hookRuntime, 'cli.mjs'), ['install', '--repo', r.dir], { cwd: r.dir });
  if (hr.code !== 0) throw new Error(`hook-runtime install failed: ${hr.stderr}${hr.stdout}`);
  const vg = await runNode(join(ASSETS.verifyGate, 'cli.mjs'), ['install', '--repo', r.dir], { cwd: r.dir });
  if (vg.code !== 0) throw new Error(`verify-gate install failed: ${vg.stderr}${vg.stdout}`);
  await r.setConfig({ command: ['sh', r.script], base: 'main' });
}

export { toolStateDir };
