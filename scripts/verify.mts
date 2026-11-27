// This repository's verify command. The verify gate (.agents/harness/verify-gate) runs it with
// VERIFY_TRIGGER=edit|task|turn-end and, for edits, VERIFY_FILE. Run by hand with
// `node .agents/harness/verify-gate/cli.mjs run`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VALIDATE = ['python3', 'scripts/skills.py', 'validate'];
// The binary itself: an edit check runs on every edit, and a package-manager wrapper adds start-up time.
const BIOME = 'node_modules/.bin/biome';
const BUILD = ['node', 'scripts/build.mts'];

export const FULL_CHECKS: string[][] = [
  VALIDATE,
  ['python3', '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_*.py'],
  ['pnpm', 'run', 'check'],
  ['node', '.agents/harness/hook-runtime/cli.mjs', 'check'],
  ['node', '.agents/harness/verify-gate/cli.mjs', 'check'],
  ['node', '.agents/harness/hooked-rules/cli.mjs', 'check'],
  ['node', '.agents/harness/hooked-rules/cli.mjs', 'pointers', '--check'],
];

// Biome checks hand-written Node code only: not the generated skill assets, not the installed copy
// under .agents/harness, not recorded fixtures (biome.json ignores them too).
const linted = (relPath: string) =>
  /\.m[jt]s$/.test(relPath) && /^(src|scripts|tests)\//.test(relPath) && !relPath.includes('/fixtures/');
const generated = (relPath: string) => /^skills\/[^/]+\/assets\//.test(relPath);

// Argv lists to run for one edited file. JSON syntax is checked in process (see jsonProblem).
export function editChecks(relPath: string): string[][] {
  const checks: string[][] = [];
  if (linted(relPath)) checks.push([BIOME, 'check', relPath]);
  else if (relPath.endsWith('.py')) checks.push(['python3', '-m', 'py_compile', relPath]);
  // An edit under src/ rebuilds the skill assets; an edit of the assets themselves is reported.
  if (relPath.startsWith('src/')) checks.push(BUILD);
  else if (generated(relPath)) checks.push([...BUILD, '--check']);
  if (relPath.startsWith('skills/') || relPath === '.claude-plugin/marketplace.json') checks.push(VALIDATE);
  // A rule edit changes the generated pointer block, and an AGENTS.md edit can stale it too.
  if (relPath === 'AGENTS.md' || /^\.agents\/hooked-rules\/[^/]+\.md$/.test(relPath))
    checks.push(['node', '.agents/harness/hooked-rules/cli.mjs', 'pointers', '--check']);
  return checks;
}

function jsonProblem(relPath: string): string | null {
  if (!relPath.endsWith('.json') || !existsSync(relPath)) return null;
  try {
    JSON.parse(readFileSync(relPath, 'utf8'));
    return null;
  } catch (error) {
    return `${relPath}: ${(error as Error).message}`;
  }
}

// The Python checks import PyYAML; without it the failure should say how to fix the environment.
function pyYamlProblem(argv: string[]): string | null {
  if (argv[0] !== 'python3' || argv.includes('py_compile')) return null;
  const probe = spawnSync('python3', ['-c', 'import yaml'], { stdio: 'ignore' });
  return probe.status === 0 ? null : 'PyYAML is missing: pip install -r requirements-dev.txt';
}

// With `quiet` the check's output is held back and shown only when it fails, so a passing edit prints nothing.
function run(argv: string[], quiet = false): boolean {
  const missing = pyYamlProblem(argv);
  if (missing) {
    console.error(`verify: ${missing}`);
    return false;
  }
  const result = quiet
    ? spawnSync(argv[0] as string, argv.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        maxBuffer: Infinity,
      })
    : spawnSync(argv[0] as string, argv.slice(1), { stdio: 'inherit' });
  if (result.status === 0) return true;
  // The last captured chunk: the failure line must start on a new line after an unterminated one.
  let last = '';
  if (quiet) {
    const stdout = typeof result.stdout === 'string' ? result.stdout : '';
    const stderr = typeof result.stderr === 'string' ? result.stderr : '';
    if (stdout) {
      process.stderr.write(stdout);
      last = stdout;
    }
    if (stderr) {
      // Keep the two streams apart as the gate's tailOf does when stdout has no trailing newline.
      if (last && !last.endsWith('\n')) process.stderr.write('\n');
      process.stderr.write(stderr);
      last = stderr;
    }
  }
  if (last && !last.endsWith('\n')) process.stderr.write('\n');
  const why = result.error ? result.error.message : result.signal ? `signal ${result.signal}` : `exit ${result.status}`;
  console.error(`verify: failed (${why}): ${argv.join(' ')}`);
  return false;
}

function main(): number {
  const trigger = process.env.VERIFY_TRIGGER || 'turn-end';
  let checks = FULL_CHECKS;
  if (trigger === 'edit') {
    const file = process.env.VERIFY_FILE || '';
    const problem = jsonProblem(file);
    if (problem) {
      console.error(`verify: invalid JSON in ${problem}`);
      return 1;
    }
    checks = file && existsSync(file) ? editChecks(file) : [];
  }
  for (const argv of checks) if (!run(argv, trigger === 'edit')) return 1;
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
