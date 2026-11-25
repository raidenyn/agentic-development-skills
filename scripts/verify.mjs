// This repository's verify command. The verify gate (.agents/harness/verify-gate) runs it with
// VERIFY_TRIGGER=edit|task|turn-end and, for edits, VERIFY_FILE. Run by hand with
// `node .agents/harness/verify-gate/cli.mjs run`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VALIDATE = ['python3', 'scripts/skills.py', 'validate'];

export const FULL_CHECKS = [
  VALIDATE,
  ['python3', '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_*.py'],
  ['npm', 'test'],
  ['node', '.agents/harness/hook-runtime/cli.mjs', 'check'],
  ['node', '.agents/harness/verify-gate/cli.mjs', 'check'],
];

// Argv lists to run for one edited file. JSON syntax is checked in process (see jsonProblem).
export function editChecks(relPath) {
  const checks = [];
  if (relPath.endsWith('.mjs')) checks.push(['node', '--check', relPath]);
  else if (relPath.endsWith('.py')) checks.push(['python3', '-m', 'py_compile', relPath]);
  if (relPath.startsWith('skills/') || relPath === '.claude-plugin/marketplace.json') checks.push(VALIDATE);
  return checks;
}

function jsonProblem(relPath) {
  if (!relPath.endsWith('.json') || !existsSync(relPath)) return null;
  try {
    JSON.parse(readFileSync(relPath, 'utf8'));
    return null;
  } catch (error) {
    return `${relPath}: ${error.message}`;
  }
}

// The Python checks import PyYAML; without it the failure should say how to fix the environment.
function pyYamlProblem(argv) {
  if (argv[0] !== 'python3' || argv.includes('py_compile')) return null;
  const probe = spawnSync('python3', ['-c', 'import yaml'], { stdio: 'ignore' });
  return probe.status === 0 ? null : 'PyYAML is missing: pip install -r requirements-dev.txt';
}

function run(argv) {
  const missing = pyYamlProblem(argv);
  if (missing) {
    console.error(`verify: ${missing}`);
    return false;
  }
  const result = spawnSync(argv[0], argv.slice(1), { stdio: 'inherit' });
  if (result.status === 0) return true;
  const why = result.error ? result.error.message : result.signal ? `signal ${result.signal}` : `exit ${result.status}`;
  console.error(`verify: failed (${why}): ${argv.join(' ')}`);
  return false;
}

function main() {
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
  for (const argv of checks) if (!run(argv)) return 1;
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
