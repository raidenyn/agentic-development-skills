import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ASSETS = {
  hookRuntime: join(root, 'skills', 'agent-harness-hook-runtime', 'assets', 'hook-runtime'),
  verifyGate: join(root, 'skills', 'agent-harness-verify-gate', 'assets', 'verify-gate'),
};

export async function tempRepo({ commit = true, files = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'agent-harness-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = async (rel, text) => {
    const file = join(dir, rel);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  for (const [rel, text] of Object.entries(files)) await write(rel, text);
  if (commit) {
    await write('README.md', '# test\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
  }
  return { dir, git, write, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

export function runNode(script, args = [], { cwd, input, env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
  });
}
