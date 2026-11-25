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
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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

/** @param {string} script @param {string[]} [args] @param {{ cwd?: string, input?: string, env?: Record<string, string | undefined> }} [opts] */
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

// A fake OpenCode 2.4.1 plugin ctx (see fixtures/spike/opencode-plugin.mjs) that records hook
// registrations, session lookups and synthetic messages. `emit` feeds the event stream.
/** @param {string} dir @param {{ sessions?: Record<string, unknown>, synthetic?: Function }} [opts] */
export function fakeOpencodeCtx(dir, { sessions = {}, synthetic } = {}) {
  const hooks = {};
  const calls = { synthetic: [], get: [] };
  const queue = [];
  let wake = null;
  let evtCounter = 0;
  const ctx = {
    location: { directory: dir },
    tool: {
      hook: async (name, fn) => {
        hooks[name] = fn;
      },
    },
    session: {
      hook: async (name, fn) => {
        hooks[`session.${name}`] = fn;
      },
      get: async ({ sessionID }) => {
        calls.get.push(sessionID);
        if (!Object.hasOwn(sessions, sessionID)) throw new Error(`session ${sessionID} not found`);
        return sessions[sessionID];
      },
      synthetic: async (args) => {
        if (synthetic) await synthetic(args);
        calls.synthetic.push(args);
        return {};
      },
    },
    event: {
      subscribe: ({ signal }) =>
        (async function* stream() {
          while (!signal?.aborted) {
            if (queue.length) {
              yield queue.shift();
              continue;
            }
            await new Promise((r) => {
              wake = r;
              signal?.addEventListener('abort', r, { once: true });
            });
            wake = null;
          }
        })(),
    },
  };
  const emit = (type, sessionID, data = {}) => {
    queue.push({ id: `evt_${++evtCounter}`, created: Date.now(), type, data: { sessionID, ...data } });
    wake?.();
  };
  return { ctx, hooks, calls, emit };
}

export async function until(fn, ms = 4000, what = 'condition') {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`timed out waiting for ${what}`);
}

// A direct child_process implementation of the supervisor's `context.spawn` (Task 5): same
// arguments and result shape, each child in its own process group (`detached: true`). On abort or
// timeout the group gets SIGTERM, then SIGKILL after 5 s if it is still alive. Rejects on a spawn
// error.
/** @param {string[]} argv @param {{ cwd?: string, env?: Record<string, string | undefined>, timeoutMs?: number, signal?: AbortSignal, maxBytes?: number }} [opts] */
export function directSpawn(argv, { cwd, env, timeoutMs, signal, maxBytes = Infinity } = {}) {
  return new Promise((resolvePromise, reject) => {
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd,
        env: { ...process.env, ...env },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      reject(err);
      return;
    }
    const out = { stdout: [], stderr: [] };
    const size = { stdout: 0, stderr: 0 };
    let truncated = false;
    const keep = (stream) => (chunk) => {
      out[stream].push(chunk);
      size[stream] += chunk.length;
      while (size[stream] > maxBytes) {
        truncated = true;
        const first = out[stream][0];
        const excess = size[stream] - maxBytes;
        if (first.length <= excess) {
          out[stream].shift();
          size[stream] -= first.length;
        } else {
          out[stream][0] = first.subarray(excess);
          size[stream] -= excess;
        }
      }
    };
    child.stdout.on('data', keep('stdout'));
    child.stderr.on('data', keep('stderr'));
    const pgid = child.pid;
    let timedOut = false;
    let killTimer;
    const kill = () => {
      if (!pgid) return;
      try {
        process.kill(-pgid, 'SIGTERM');
      } catch {}
      killTimer ??= setTimeout(() => {
        try {
          process.kill(-pgid, 'SIGKILL');
        } catch {}
      }, 5000);
      killTimer.unref();
    };
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            kill();
          }, timeoutMs)
        : null;
    const onAbort = () => kill();
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    let done = false;
    const finish = () => {
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    child.on('error', (err) => {
      if (done) return;
      finish();
      reject(err);
    });
    child.on('close', (code, sig) => {
      if (done) return;
      finish();
      resolvePromise({
        code,
        signal: sig,
        pgid,
        timedOut,
        truncated,
        stdout: Buffer.concat(out.stdout).toString('utf8'),
        stderr: Buffer.concat(out.stderr).toString('utf8'),
      });
    });
  });
}
