// Generated from src/hooked-rules/cli.mts by scripts/build.mts. Do not edit.
// hooked-rules CLI (design D7 pointer block, D8 install/update/check).
//   node <skill>/assets/hooked-rules/cli.mjs install [--repo DIR]
//   node <skill>/assets/hooked-rules/cli.mjs update [--repo DIR]
//   node .agents/harness/hooked-rules/cli.mjs check [--repo DIR]
//   node .agents/harness/hooked-rules/cli.mjs pointers [--check] [--repo DIR]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readHarnessConfig } from './lib/config.mjs';
import { checkTool, ensureSection, installTool, readLock, requireNode22 } from './lib/install.mjs';
import { applyBlock, locateBlock, normalizeLineEndings, POINTER_HEADING, renderBlock } from './lib/pointers.mjs';
import { loadRules, RULES_DIR } from './lib/rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = 'hooked-rules';
const RUNTIME = 'hook-runtime';
const MIN_RUNTIME = '0.2.0';
const USAGE = 'usage: node cli.mjs install|update|check|pointers [--check] [--repo DIR]\n';
const RUNTIME_OLD = `${TOOL} needs agent-harness-hook-runtime ${MIN_RUNTIME} or newer; update it first.`;
const NO_RUNTIME =
  'hook-runtime is not installed in this repo (no entry in .agents/harness/lock.json); install agent-harness-hook-runtime first.';
const AGENTS = 'AGENTS.md';
const FIX = 'run: node .agents/harness/hooked-rules/cli.mjs pointers';
const errText = (err) => (err instanceof Error ? err.message : String(err));
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// From the copied folder (<repo>/.agents/harness/hooked-rules) the repo is three levels up;
// otherwise the git checkout around the working directory.
function defaultRepo() {
  const harness = resolve(HERE, '..');
  if (basename(harness) === 'harness' && basename(resolve(harness, '..')) === '.agents')
    return resolve(harness, '..', '..');
  return git(['rev-parse', '--show-toplevel'], process.cwd()) || process.cwd();
}

// Numerical major.minor.patch comparison: a missing part is zero and a non-number is below.
function versionAtLeast(version, minimum) {
  const a = version.split('.').map((part) => Number.parseInt(part, 10));
  const b = minimum.split('.').map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < 3; index += 1) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x !== y) return x > y;
  }
  return true;
}

// The section takes no keys in this version; any key is an error.
function configErrors(section) {
  if (section === undefined) return [];
  if (!isObject(section)) return [`"${TOOL}" must be an object`];
  return Object.keys(section).map((key) => `unknown key "${key}" in "${TOOL}"`);
}

function install(repoRoot, mode, io) {
  const node = requireNode22();
  if (node) return io.fail([node]);
  if (git(['rev-parse', '--is-inside-work-tree'], repoRoot) !== 'true')
    return io.fail([`${repoRoot} is not a git work tree`]);
  let config = {};
  try {
    const runtime = readLock(repoRoot).tools[RUNTIME];
    if (!runtime) return io.fail([NO_RUNTIME]);
    if (!versionAtLeast(runtime.version, MIN_RUNTIME)) return io.fail([RUNTIME_OLD]);
    config = readHarnessConfig(repoRoot);
  } catch (err) {
    return io.fail([errText(err)]);
  }
  const errors = configErrors(config[TOOL]);
  if (errors.length) return io.fail(errors.map((e) => `.agents/harness.json: ${e}`));
  // Every refusal is decided before anything is written; the copies and the lock come last.
  const res = installTool({ sourceDir: HERE, repoRoot, mode });
  if (res.code !== 0) return io.fail(res.messages);
  const messages = [...res.messages];
  if (ensureSection(repoRoot, TOOL, {})) messages.push(`added "${TOOL}": {} to .agents/harness.json`);
  const rulesDir = join(repoRoot, RULES_DIR);
  if (!existsSync(rulesDir)) {
    mkdirSync(rulesDir, { recursive: true });
    messages.push(`created ${RULES_DIR}/`);
  }
  return io.ok(messages);
}

function check(repoRoot, io) {
  const issues = [];
  try {
    issues.push(...checkTool({ toolDir: HERE, repoRoot }));
  } catch (err) {
    issues.push(errText(err));
  }
  try {
    const runtime = readLock(repoRoot).tools[RUNTIME];
    if (!runtime) issues.push(NO_RUNTIME);
    else if (!versionAtLeast(runtime.version, MIN_RUNTIME)) issues.push(RUNTIME_OLD);
  } catch (err) {
    issues.push(errText(err));
  }
  try {
    issues.push(...configErrors(readHarnessConfig(repoRoot)[TOOL]).map((e) => `.agents/harness.json: ${e}`));
  } catch (err) {
    issues.push(errText(err));
  }
  try {
    for (const issue of loadRules(repoRoot).errors) issues.push(`${issue.path}: ${issue.message}`);
  } catch (err) {
    issues.push(errText(err));
  }
  if (issues.length) return io.fail(issues.map((issue) => `${TOOL}: ${issue}`));
  return io.ok([`${TOOL}: ok`]);
}

function pointers(repoRoot, checkOnly, io) {
  const { rules, errors } = loadRules(repoRoot);
  if (errors.length) return io.fail(errors.map((issue) => `${issue.path}: ${issue.message}`));
  let block;
  try {
    block = renderBlock(rules);
  } catch (err) {
    return io.fail([errText(err)]);
  }
  const path = join(repoRoot, AGENTS);
  let current;
  try {
    current = readFileSync(path, 'utf8');
  } catch (err) {
    return io.fail([`${AGENTS} cannot be read: ${errText(err)}`]);
  }
  if (checkOnly) {
    let location;
    try {
      location = locateBlock(current);
    } catch (err) {
      return io.fail([errText(err)]);
    }
    if (location === null) return io.fail([`${AGENTS} has no hooked-rules block; ${FIX}`]);
    if (!location.headingOk)
      return io.fail([
        `${AGENTS} lacks the \`${POINTER_HEADING}\` heading on the line before the hooked-rules block; ${FIX}`,
      ]);
    if (normalizeLineEndings(current.slice(location.begin, location.end)) !== block)
      return io.fail([`the hooked-rules block in ${AGENTS} is stale; ${FIX}`]);
    return io.ok([`${TOOL}: pointers ok`]);
  }
  let updated;
  try {
    updated = applyBlock(current, block);
  } catch (err) {
    return io.fail([errText(err)]);
  }
  if (updated !== current) writeFileSync(path, updated);
  return io.ok([`${TOOL}: pointers written`]);
}

// main(argv, {out, err}) -> exit code
export async function main(argv, { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  const io = {
    out,
    ok: (lines) => {
      for (const l of lines) out(`${l}\n`);
      return 0;
    },
    fail: (lines) => {
      for (const l of lines) err(`${l}\n`);
      return 1;
    },
  };
  const [command, ...rest] = argv;
  let repo;
  let checkOnly = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--repo' && rest[i + 1] !== undefined) repo = resolve(rest[++i]);
    else if (command === 'pointers' && rest[i] === '--check') checkOnly = true;
    else return io.fail([`unknown argument ${rest[i]}`, USAGE.trim()]);
  }
  const repoRoot = repo ?? defaultRepo();
  switch (command) {
    case 'install':
    case 'update':
      return install(repoRoot, command, io);
    case 'check':
      return check(repoRoot, io);
    case 'pointers':
      return pointers(repoRoot, checkOnly, io);
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
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      process.stderr.write(`${TOOL}: ${errText(e)}\n`);
      process.exitCode = 1;
    },
  );
}
