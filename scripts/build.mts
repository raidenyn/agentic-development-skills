// Builds the shipped harness tools: src/<tool>/*.mts → skills/<skill>/assets/<tool>/*.mjs.
// Each module is type-stripped, has its relative .mts specifiers rewritten to .mjs, is formatted
// with Biome and gets a "generated" header. The output is committed; `--check` fails when it
// differs from a fresh build. See openspec/changes/add-typescript-build-system/design.md (D2, D3).
//
// Usage: node scripts/build.mts [--check]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ToolEntry {
  skill: string;
  shared: string[];
}
export interface Manifest {
  tools: Record<string, ToolEntry>;
}
export type ProblemKind = 'differs' | 'missing' | 'stale';
// path is relative to root, with POSIX separators.
export interface Problem {
  path: string;
  kind: ProblemKind;
}
export interface BuildOptions {
  biomeBin?: string;
  biomeConfigDir?: string;
}
export class BuildError extends Error {}

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BIOME = join(REPO, 'node_modules', '.bin', 'biome');
const SHARED = 'shared';
const RELATIVE = /^\.\.?\//;

const header = (sourcePath: string) => `// Generated from ${sourcePath} by scripts/build.mts. Do not edit.\n`;
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Specifier positions: `from '…'`, a bare `import '…'`, and `import('…')`.
const SPECIFIER = /(\bfrom\s*|\bimport\s*|\bimport\s*\(\s*)(['"])([^'"\n]+)\2/g;
const TEMPLATE_IMPORT = /\bimport\s*\(\s*`(\.\.?\/[^`]*)`/;

/** Rewrites relative specifiers ending in .mts to .mjs. Throws BuildError on a relative dynamic import that is not a string literal. */
export function rewriteSpecifiers(js: string, sourcePath: string): string {
  const template = TEMPLATE_IMPORT.exec(js);
  if (template) {
    throw new BuildError(
      `${sourcePath}: dynamic import of a template literal (\`${template[1]}\`) cannot be rewritten; use a string literal`,
    );
  }
  return js.replace(SPECIFIER, (whole, lead: string, quote: string, spec: string) =>
    RELATIVE.test(spec) && spec.endsWith('.mts') ? `${lead}${quote}${spec.slice(0, -4)}.mjs${quote}` : whole,
  );
}

// stripTypeScriptTypes is experimental and warns on every call; silence only that warning.
function strip(source: string, sourcePath: string): string {
  const original = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === 'string' ? warning : warning.message;
    const name = typeof warning === 'string' ? (isObject(rest[0]) ? rest[0].type : rest[0]) : warning.name;
    if (name === 'ExperimentalWarning' && text.includes('stripTypeScriptTypes')) return;
    (original as (...args: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    return stripTypeScriptTypes(source, { mode: 'strip' });
  } catch (err) {
    throw new BuildError(`${sourcePath}: ${errText(err)}`);
  } finally {
    process.emitWarning = original;
  }
}

// Stripping keeps line positions, so a line that held only types becomes blank. Drop those lines
// and keep the blank lines the source already had.
function dropTypeOnlyLines(source: string, stripped: string): string {
  const before = source.split('\n');
  const after = stripped.split('\n');
  return after.filter((line, i) => line.trim() !== '' || (before[i] ?? '').trim() === '').join('\n');
}

function format(js: string, sourcePath: string, biomeBin: string, biomeConfigDir: string): string {
  // Biome is given the source-side path: output folders are ignored in biome.json.
  const stdinPath = sourcePath.replace(/\.mts$/, '.mjs');
  const r = spawnSync(biomeBin, ['format', `--config-path=${biomeConfigDir}`, `--stdin-file-path=${stdinPath}`], {
    cwd: biomeConfigDir,
    input: js,
    encoding: 'utf8',
  });
  if (r.error) {
    const code = (r.error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new BuildError('Biome is not installed: run pnpm install --frozen-lockfile');
    throw new BuildError(`${sourcePath}: cannot run Biome: ${r.error.message}`);
  }
  if (r.status !== 0)
    throw new BuildError(`${sourcePath}: Biome could not format the output:\n${r.stderr || r.stdout}`);
  return r.stdout;
}

/** Strip, rewrite, format, add the header. sourcePath is relative to root, for the header and for errors. */
export function emitModule(source: string, sourcePath: string, biomeBin: string, biomeConfigDir: string): string {
  const lf = source.replace(/\r\n/g, '\n');
  const js = rewriteSpecifiers(dropTypeOnlyLines(lf, strip(lf, sourcePath)), sourcePath);
  return header(sourcePath) + format(js, sourcePath, biomeBin, biomeConfigDir);
}

function readManifest(root: string): Manifest {
  const path = join(root, 'src', 'build.json');
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new BuildError(`cannot read src/build.json: ${errText(err)}`);
  }
  if (!isObject(value) || !isObject(value.tools)) throw new BuildError('src/build.json: expected {"tools": {...}}');
  for (const [name, entry] of Object.entries(value.tools)) {
    if (!isObject(entry) || typeof entry.skill !== 'string' || !Array.isArray(entry.shared)) {
      throw new BuildError(`src/build.json: tool ${name} needs "skill" (string) and "shared" (array)`);
    }
    if (!entry.shared.every((s) => typeof s === 'string'))
      throw new BuildError(`src/build.json: ${name}.shared must hold strings`);
  }
  return value as unknown as Manifest;
}

// Files under dir, as sorted POSIX paths relative to dir. Dotfiles are skipped.
function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string, rel: string) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const childRel = rel ? posix.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) walk(join(abs, entry.name), childRel);
      else if (entry.isFile()) out.push(childRel);
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out.sort();
}

const assetsDir = (skill: string, tool: string) => posix.join('skills', skill, 'assets', tool);
const outName = (rel: string) => (rel.endsWith('.mts') ? `${rel.slice(0, -4)}.mjs` : rel);

// Every relative specifier must name a file emitted into the same tool; any other must be a node: built-in.
function checkSpecifiers(tool: string, dir: string, files: Map<string, { text: string; source: string }>): void {
  for (const [rel, { text, source }] of files) {
    if (!rel.endsWith('.mjs')) continue;
    for (const match of text.matchAll(SPECIFIER)) {
      const spec = match[3] ?? '';
      if (RELATIVE.test(spec)) {
        const target = posix.normalize(posix.join(posix.dirname(rel), spec));
        if (!files.has(target)) {
          throw new BuildError(
            `${posix.join(dir, rel)} (from ${source}) imports ${spec}, which is not emitted into ${tool}`,
          );
        }
      } else if (!spec.startsWith('node:')) {
        throw new BuildError(
          `${source} imports '${spec}': shipped code may import only node: built-ins and files of its own tool`,
        );
      }
    }
  }
}

/** Every output file of the build: path relative to root -> bytes. Throws BuildError. */
export function planBuild(root: string, opts: BuildOptions = {}): Map<string, Buffer> {
  const biomeBin = opts.biomeBin ?? DEFAULT_BIOME;
  const biomeConfigDir = opts.biomeConfigDir ?? REPO;
  const manifest = readManifest(root);
  const srcDir = join(root, 'src');
  const toolNames = Object.keys(manifest.tools).sort();

  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      entry.name !== SHARED &&
      !entry.name.startsWith('.') &&
      !(entry.name in manifest.tools)
    ) {
      throw new BuildError(`src/${entry.name} is not listed in src/build.json`);
    }
  }

  const plan = new Map<string, Buffer>();
  for (const tool of toolNames) {
    const { skill, shared } = manifest.tools[tool] as ToolEntry;
    const toolDir = join(srcDir, tool);
    if (!existsSync(toolDir) || !statSync(toolDir).isDirectory()) throw new BuildError(`src/${tool} not found`);

    // output path relative to the tool's assets folder -> source path relative to root
    const sources = new Map<string, string>();
    const add = (rel: string, source: string) => {
      const out = outName(rel);
      if (sources.has(out)) {
        throw new BuildError(
          `${posix.join(assetsDir(skill, tool), out)} would be written from both ${sources.get(out)} and ${source}`,
        );
      }
      sources.set(out, source);
    };
    for (const rel of listFiles(toolDir)) if (!rel.endsWith('.types.mts')) add(rel, posix.join('src', tool, rel));
    for (const rel of [...shared].sort()) {
      if (!existsSync(join(srcDir, SHARED, rel)))
        throw new BuildError(`${tool} lists shared ${rel}, but src/shared/${rel} does not exist`);
      if (!rel.endsWith('.types.mts')) add(rel, posix.join('src', SHARED, rel));
    }

    const files = new Map<string, { text: string; source: string }>();
    for (const [out, source] of [...sources].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const bytes = readFileSync(join(root, source));
      const text = source.endsWith('.mts')
        ? emitModule(bytes.toString('utf8'), source, biomeBin, biomeConfigDir)
        : null;
      files.set(out, { text: text ?? '', source });
      plan.set(posix.join(assetsDir(skill, tool), out), text === null ? bytes : Buffer.from(text));
    }
    checkSpecifiers(tool, assetsDir(skill, tool), files);
  }
  return plan;
}

function existingOutputs(root: string): string[] {
  const manifest = readManifest(root);
  const out: string[] = [];
  for (const [tool, { skill }] of Object.entries(manifest.tools)) {
    const dir = assetsDir(skill, tool);
    for (const rel of listFiles(join(root, dir))) out.push(posix.join(dir, rel));
  }
  return out.sort();
}

export function checkBuild(root: string, opts: BuildOptions = {}): Problem[] {
  const plan = planBuild(root, opts);
  const problems: Problem[] = [];
  for (const [path, bytes] of plan) {
    const abs = join(root, path);
    if (!existsSync(abs)) problems.push({ path, kind: 'missing' });
    else if (!readFileSync(abs).equals(bytes)) problems.push({ path, kind: 'differs' });
  }
  for (const path of existingOutputs(root)) if (!plan.has(path)) problems.push({ path, kind: 'stale' });
  return problems.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// Removes now-empty folders between dir and stop (exclusive).
function pruneEmpty(dir: string, stop: string): void {
  while (dir.startsWith(stop) && dir !== stop && existsSync(dir) && readdirSync(dir).length === 0) {
    rmdirSync(dir);
    dir = dirname(dir);
  }
}

/** Writes changed files, deletes stale ones, returns the paths it touched. */
export function writeBuild(root: string, opts: BuildOptions = {}): string[] {
  const touched: string[] = [];
  const plan = planBuild(root, opts);
  for (const [path, bytes] of plan) {
    const abs = join(root, path);
    if (existsSync(abs) && readFileSync(abs).equals(bytes)) continue;
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, bytes);
    touched.push(path);
  }
  for (const path of existingOutputs(root)) {
    if (plan.has(path)) continue;
    const abs = join(root, path);
    rmSync(abs);
    pruneEmpty(dirname(abs), join(root, 'skills'));
    touched.push(path);
  }
  return touched.sort();
}

export function main(argv: string[], root: string = REPO): number {
  const check = argv.includes('--check');
  const unknown = argv.filter((a) => a !== '--check');
  if (unknown.length > 0) {
    console.error(`build: unknown argument ${unknown[0]}. Usage: node scripts/build.mts [--check]`);
    return 2;
  }
  try {
    if (check) {
      const problems = checkBuild(root);
      for (const p of problems) console.log(`${p.kind} ${p.path}`);
      if (problems.length === 0) {
        console.log('build: up to date');
        return 0;
      }
      console.error(`build: ${problems.length} file(s) out of date; run pnpm run build`);
      return 1;
    }
    const touched = writeBuild(root);
    for (const path of touched) console.log(path);
    console.log(`build: ${touched.length} file(s) written or removed`);
    return 0;
  } catch (err) {
    if (!(err instanceof BuildError)) throw err;
    console.error(`build: ${err.message}`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
