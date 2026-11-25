// Tests for scripts/build.mts, the build that turns src/<tool>/*.mts into the .mjs files skills ship.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BuildError, checkBuild, main, planBuild, writeBuild } from './build.mts';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roots: string[] = [];
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const ONE_TOOL = JSON.stringify({ tools: { t1: { skill: 's1', shared: [] } } });
const TWO_TOOLS = (shared: string[]) =>
  JSON.stringify({ tools: { t1: { skill: 's1', shared }, t2: { skill: 's2', shared } } });

// Writes the files into a new temp folder and returns it. A missing src/build.json gets ONE_TOOL.
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'build-test-'));
  roots.push(root);
  const all = { 'src/build.json': ONE_TOOL, ...files };
  for (const [rel, text] of Object.entries(all)) {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

// Builds one source file in a one-tool fixture and returns its output text.
function emit(source: string): string {
  const root = fixture({ 'src/t1/lib/a.mts': source });
  const out = planBuild(root).get('skills/s1/assets/t1/lib/a.mjs');
  assert.ok(out, 'no output for src/t1/lib/a.mts');
  return out.toString('utf8');
}

function throwsBuild(fn: () => unknown, ...parts: string[]): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof BuildError, `expected BuildError, got ${String(err)}`);
    for (const part of parts) assert.ok(err.message.includes(part), `message lacks ${part}: ${err.message}`);
    return true;
  });
}

test('emits a module to the skill assets', () => {
  const root = fixture({ 'src/t1/lib/a.mts': 'export const a = 1;\n' });
  assert.ok(planBuild(root).has('skills/s1/assets/t1/lib/a.mjs'));
});

test('copies a data file byte for byte', () => {
  const text = '{"name": "t1"}';
  const root = fixture({ 'src/t1/tool.json': text });
  assert.deepEqual(planBuild(root).get('skills/s1/assets/t1/tool.json'), Buffer.from(text));
});

test('fails on a TypeScript file that is not .mts', () => {
  const root = fixture({ 'src/t1/a.mts': 'export const a = 1;\n', 'src/t1/b.ts': 'export const b: number = 1;\n' });
  throwsBuild(() => planBuild(root), 'src/t1/b.ts');
});

test('fails on a hand-written JavaScript file', () => {
  const root = fixture({ 'src/t1/c.mjs': "import x from 'lodash';\nexport default x;\n" });
  throwsBuild(() => planBuild(root), 'src/t1/c.mjs');
});

test('fails on a declaration file', () => {
  const root = fixture({ 'src/t1/d.d.mts': 'export declare const d: number;\n' });
  throwsBuild(() => planBuild(root), 'src/t1/d.d.mts');
});

test('fails on a shared file that is not .mts or .json', () => {
  const root = fixture({
    'src/build.json': JSON.stringify({ tools: { t1: { skill: 's1', shared: ['lib/c.js'] } } }),
    'src/shared/lib/c.js': 'export const c = 1;\n',
    'src/t1/a.mts': 'export const a = 1;\n',
  });
  throwsBuild(() => planBuild(root), 'src/shared/lib/c.js');
});

test('fails on a tool missing from the manifest', () => {
  const root = fixture({ 'src/t1/a.mts': 'export const a = 1;\n', 'src/t9/b.mts': 'export const b = 1;\n' });
  throwsBuild(() => planBuild(root), 'src/t9');
});

test('emits a shared file into every tool that lists it', () => {
  const root = fixture({
    'src/build.json': TWO_TOOLS(['lib/c.mts']),
    'src/shared/lib/c.mts': 'export const c = 1;\n',
    'src/t1/a.mts': "export { c } from './lib/c.mts';\n",
    'src/t2/a.mts': "export { c } from './lib/c.mts';\n",
  });
  const plan = planBuild(root);
  const one = plan.get('skills/s1/assets/t1/lib/c.mjs');
  const two = plan.get('skills/s2/assets/t2/lib/c.mjs');
  assert.ok(one && two);
  assert.deepEqual(one, two);
});

test('fails on a shared and own file collision', () => {
  const root = fixture({
    'src/build.json': JSON.stringify({ tools: { t1: { skill: 's1', shared: ['lib/c.mts'] } } }),
    'src/shared/lib/c.mts': 'export const c = 1;\n',
    'src/t1/lib/c.mts': 'export const c = 2;\n',
  });
  throwsBuild(() => planBuild(root), 'skills/s1/assets/t1/lib/c.mjs');
});

test('rewrites import specifiers', () => {
  const root = fixture({
    'src/t1/a.mts': "import { b } from './b.mts';\nexport const a = b;\n",
    'src/t1/b.mts': 'export const b = 1;\n',
  });
  assert.ok(planBuild(root).get('skills/s1/assets/t1/a.mjs')?.toString().includes("from './b.mjs'"));
});

test('rewrites every specifier form', () => {
  const root = fixture({
    'src/t1/a.mts': [
      "export * from './b.mts';",
      "import './b.mts';",
      'import {',
      '  b,',
      '  b as c,',
      "} from './b.mts';",
      "export const d = async () => await import('./b.mts');",
      'export const e = [b, c];',
      '',
    ].join('\n'),
    'src/t1/b.mts': 'export const b = 1;\n',
  });
  // The first line is the header, which names the source file.
  const out = (planBuild(root).get('skills/s1/assets/t1/a.mjs')?.toString() ?? '').split('\n').slice(1).join('\n');
  assert.ok(!out.includes('.mts'), out);
  assert.equal(out.split("'./b.mjs'").length - 1, 4, out);
});

test('leaves a non-specifier string alone', () => {
  assert.ok(emit("export const s = 'run scripts/build.mts';\n").includes("'run scripts/build.mts'"));
});

test('fails on a template-literal dynamic import', () => {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the string is TypeScript source that holds a template literal
  const root = fixture({ 'src/t1/lib/a.mts': 'export const load = (n: string) => import(`./${n}.mts`);\n' });
  throwsBuild(() => planBuild(root), 'src/t1/lib/a.mts');
});

test('fails on an npm-package specifier', () => {
  const root = fixture({ 'src/t1/lib/a.mts': "import ts from 'typescript';\nexport const v = ts;\n" });
  throwsBuild(() => planBuild(root), 'src/t1/lib/a.mts', 'typescript');
});

test('fails on a cross-tool import', () => {
  const root = fixture({
    'src/build.json': TWO_TOOLS([]),
    'src/t1/lib/only-t1.mts': 'export const x = 1;\n',
    'src/t2/a.mts': "import { x } from './lib/only-t1.mts';\nexport const y = x;\n",
  });
  throwsBuild(() => planBuild(root), 'skills/s2/assets/t2/a.mjs');
});

test('rootDirs matches the manifest', () => {
  const tsconfig = JSON.parse(readFileSync(join(repo, 'tsconfig.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(repo, 'src', 'build.json'), 'utf8'));
  const expected = [...Object.keys(manifest.tools).map((t) => `src/${t}`), 'src/shared'].sort();
  assert.deepEqual([...tsconfig.compilerOptions.rootDirs].sort(), expected);
});

test('fails on an unresolved specifier', () => {
  const root = fixture({
    'src/t1/lib/a.mts': "import { x } from './x.types.mts';\nexport const y = x;\n",
    'src/t1/lib/x.types.mts': 'export const x = 1;\n',
  });
  throwsBuild(() => planBuild(root), 'skills/s1/assets/t1/lib/a.mjs', './x.types.mjs');
});

test('does not emit a type-only file', () => {
  const root = fixture({
    'src/t1/lib/a.mts': "import type { H } from './h.types.mts';\nexport const h: H = { a: 1 };\n",
    'src/t1/lib/h.types.mts': 'export interface H { a: number }\n',
  });
  const keys = [...planBuild(root).keys()];
  assert.ok(!keys.some((k) => k.endsWith('h.types.mjs')), keys.join(', '));
  assert.ok(keys.includes('skills/s1/assets/t1/lib/a.mjs'));
});

test('starts each module with the header', () => {
  const first = emit('export const a = 1;\n').split('\n')[0];
  assert.equal(first, '// Generated from src/t1/lib/a.mts by scripts/build.mts. Do not edit.');
});

test('keeps comments and blank lines', () => {
  const out = emit(
    ['export function f(): number {', '  // first', '  const a = 1;', '', '  return a;', '}', ''].join('\n'),
  );
  assert.match(out, /\/\/ first\n {2}const a = 1;\n\n {2}return a;/);
});

test('removes type syntax', () => {
  const out = emit(
    [
      "import type { Stats } from 'node:fs';",
      'interface Opts {',
      '  name: string;',
      '}',
      'export function f(opts: Opts, s?: Stats): number {',
      '  const n = opts.name as string;',
      '  return (n.length satisfies number) + (s ? 1 : 0);',
      '}',
      '',
    ].join('\n'),
  );
  for (const word of ['interface', ': string', 'satisfies', 'import type']) assert.ok(!out.includes(word), out);
  const dir = mkdtempSync(join(tmpdir(), 'build-check-'));
  roots.push(dir);
  writeFileSync(join(dir, 'a.mjs'), out);
  const r = spawnSync(process.execPath, ['--check', join(dir, 'a.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('names the file on a syntax error', () => {
  const root = fixture({ 'src/t1/lib/a.mts': 'export const = ;\n' });
  throwsBuild(() => planBuild(root), 'src/t1/lib/a.mts');
});

test('emits LF for a CRLF source', () => {
  const out = emit('export const a = 1;\r\n\r\nexport const b = 2;\r\n');
  assert.ok(!out.includes('\r'));
});

test('says to run pnpm install when Biome is missing', () => {
  const root = fixture({ 'src/t1/lib/a.mts': 'export const a = 1;\n' });
  throwsBuild(() => planBuild(root, { biomeBin: join(root, 'no-such-biome') }), 'pnpm install');
});

test('check passes on a fresh build', () => {
  const root = fixture({ 'src/t1/lib/a.mts': 'export const a = 1;\n', 'src/t1/tool.json': '{}' });
  writeBuild(root);
  assert.deepEqual(checkBuild(root), []);
});

test('check reports differs, missing and stale', () => {
  const root = fixture({
    'src/t1/a.mts': 'export const a = 1;\n',
    'src/t1/b.mts': 'export const b = 1;\n',
  });
  writeBuild(root);
  writeFileSync(join(root, 'skills/s1/assets/t1/a.mjs'), 'edited by hand\n');
  rmSync(join(root, 'skills/s1/assets/t1/b.mjs'));
  writeFileSync(join(root, 'skills/s1/assets/t1/old.mjs'), 'export {};\n');
  assert.deepEqual(checkBuild(root), [
    { path: 'skills/s1/assets/t1/a.mjs', kind: 'differs' },
    { path: 'skills/s1/assets/t1/b.mjs', kind: 'missing' },
    { path: 'skills/s1/assets/t1/old.mjs', kind: 'stale' },
  ]);
});

test('write deletes stale files', () => {
  const root = fixture({ 'src/t1/a.mts': 'export const a = 1;\n' });
  writeBuild(root);
  writeFileSync(join(root, 'skills/s1/assets/t1/old.mjs'), 'export {};\n');
  writeBuild(root);
  assert.ok(!existsSync(join(root, 'skills/s1/assets/t1/old.mjs')));
});

test('a second build changes nothing', () => {
  const root = fixture({ 'src/t1/a.mts': 'export const a = 1;\n', 'src/t1/tool.json': '{}' });
  assert.ok(writeBuild(root).length > 0);
  assert.deepEqual(writeBuild(root), []);
});

test('main --check exits 1 and prints the kinds', (t) => {
  const root = fixture({ 'src/t1/a.mts': 'export const a = 1;\n' });
  writeBuild(root);
  writeFileSync(join(root, 'skills/s1/assets/t1/old.mjs'), 'export {};\n');
  const lines: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => lines.push(args.join(' ')));
  t.mock.method(console, 'error', () => {});
  assert.equal(main(['--check'], root), 1);
  assert.ok(lines.includes('stale skills/s1/assets/t1/old.mjs'), lines.join('\n'));
});
